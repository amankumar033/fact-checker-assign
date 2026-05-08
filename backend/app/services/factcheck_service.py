import asyncio
import hashlib
import logging

import httpx

from app.config import settings
from app.models.schemas import ClaimResult, EvidenceSource, FactCheckResponse
from app.services.groq_service import groq_service
from app.services.pdf_service import extract_text_from_pdf
from app.services.search_service import search_web_evidence_async
from app.services.source_trust import trust_score_1_to_10
from app.utils.cache import TTLCache

logger = logging.getLogger("fact_checker")
factcheck_cache: TTLCache[FactCheckResponse] = TTLCache(ttl_seconds=settings.cache_ttl_seconds)


def _cache_key(text: str) -> str:
    normalized = " ".join(text.split())
    return hashlib.sha256(normalized[:5000].encode("utf-8")).hexdigest()


async def run_factcheck(filename: str, pdf_bytes: bytes) -> FactCheckResponse:
    if not groq_service.is_enabled():
        raise RuntimeError("GROQ_API_KEY is missing.")

    extracted_text = extract_text_from_pdf(pdf_bytes)
    if not extracted_text:
        raise ValueError("No readable text found in this PDF.")

    truncated_text = extracted_text[: settings.max_pdf_chars]
    cache_key = _cache_key(truncated_text)
    cached = factcheck_cache.get(cache_key)
    if cached:
        logger.info("Fact-check cache hit for %s", filename)
        return cached.model_copy(update={"cached": True, "filename": filename})

    try:
        response = await asyncio.wait_for(
            _run_uncached_factcheck(filename, truncated_text, cache_key),
            timeout=settings.factcheck_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(
            "Fact-check timed out. Try a smaller PDF, confirm GROQ_API_KEY and TAVILY_API_KEY, "
            "and check that the backend can reach the internet."
        ) from exc
    return response


async def _run_uncached_factcheck(filename: str, truncated_text: str, cache_key: str) -> FactCheckResponse:
    claim_plans = await groq_service.extract_claims_with_plans(truncated_text, settings.max_claims)
    if not claim_plans:
        empty_result = FactCheckResponse(filename=filename, total_claims=0, cached=False, results=[])
        factcheck_cache.set(cache_key, empty_result)
        return empty_result

    tavily_timeout = httpx.Timeout(40.0, connect=8.0)
    async with httpx.AsyncClient(timeout=tavily_timeout) as client:

        async def fetch_evidence(i: int, row: dict) -> dict:
            claim = str(row.get("claim", "")).strip()
            query = str(row.get("search_query", "")).strip() or claim
            temporal = str(row.get("temporal_kind", "ambiguous")).strip().lower()
            evidence = await search_web_evidence_async(
                client,
                query,
                max_results=settings.web_results_per_claim,
                max_snippet_chars=settings.max_snippet_chars,
            )
            return {
                "claim": claim,
                "temporal_kind": temporal,
                "evidence": evidence,
            }

        claim_inputs = await asyncio.gather(*(fetch_evidence(i, row) for i, row in enumerate(claim_plans)))

    verification_results = await groq_service.verify_claims_batch(claim_inputs)
    by_claim = {str(item.get("claim", "")).strip(): item for item in verification_results}

    def clamp_int(val: int, lo: int, hi: int) -> int:
        return max(lo, min(hi, int(val)))

    def _extract_numbers(text: str) -> set[str]:
        nums: set[str] = set()
        cur = ""
        for ch in (text or ""):
            if ch.isdigit():
                cur += ch
            else:
                if len(cur) >= 2:
                    nums.add(cur)
                cur = ""
        if len(cur) >= 2:
            nums.add(cur)
        return nums

    def _evidence_matches_claim(claim: str, evidence: list[dict]) -> bool:
        claim_nums = _extract_numbers(claim)
        if not claim_nums:
            return False
        for ev in evidence:
            text = f"{ev.get('title','')} {ev.get('snippet','')}"
            if claim_nums & _extract_numbers(text):
                return True
        return False

    def _is_recent(evidence: list[dict]) -> bool:
        # lightweight heuristic: prefer pages mentioning 2025/2026 for current claims
        for ev in evidence:
            blob = f"{ev.get('title','')} {ev.get('snippet','')}"
            if "2026" in blob or "2025" in blob:
                return True
        return False

    def compute_confidence(claim: str, temporal_kind: str, evidence: list[dict]) -> int:
        # New confidence logic: start higher for realistic behavior.
        c = 65
        trust_scores = [
            int(ev.get("trust_score") or trust_score_1_to_10(str(ev.get("domain") or "")))
            for ev in evidence
        ]
        has_official = any(s >= 10 for s in trust_scores)
        has_tier2_news = any(s >= 9 for s in trust_scores)
        trusted_count = sum(1 for s in trust_scores if s >= 9)
        if has_official:
            c += 15
        if has_tier2_news:
            c += 10
        if trusted_count >= 2:
            c += 10
        if _evidence_matches_claim(claim, evidence):
            c += 10
        if temporal_kind == "current" and _is_recent(evidence):
            c += 5

        # penalties
        if not evidence:
            c -= 20
        else:
            avg_rel = sum(int(ev.get("relevance_score", 0)) for ev in evidence) / max(1, len(evidence))
            if avg_rel < 35:
                c -= 10

            best = max(trust_scores) if trust_scores else 1
            if best < 6:
                c -= 20  # no reliable evidence

        return clamp_int(c, 0, 100)

    def false_severity(claim: str, temporal_kind: str, evidence: list[dict], confidence: int) -> str:
        """
        Heuristic weighting:
        - high: fabricated/unverifiable (very low confidence or no reliable evidence)
        - medium: disputed/contradicted by at least one strong source
        - low: ambiguous edge cases
        """
        trust_scores = [
            int(ev.get("trust_score") or trust_score_1_to_10(str(ev.get("domain") or "")))
            for ev in evidence
        ]
        best = max(trust_scores) if trust_scores else 1
        if not evidence or best < 6 or confidence <= 20:
            return "high"
        if best >= 9 and confidence <= 35:
            return "medium"
        # If it's current and likely just outdated, it should usually be INACCURATE, but if it got FALSE,
        # treat as medium penalty not maximum.
        if temporal_kind == "current":
            return "medium"
        return "low"

    output_results: list[ClaimResult] = []
    for idx, claim_bundle in enumerate(claim_inputs):
        claim = claim_bundle["claim"]
        llm_item = by_claim.get(claim)
        if not llm_item and idx < len(verification_results):
            llm_item = verification_results[idx]
        llm_item = llm_item or {}

        status = str(llm_item.get("status", "INACCURATE")).upper()
        if status not in {"VERIFIED", "INACCURATE", "FALSE"}:
            status = "INACCURATE"

        raw_sources = claim_bundle["evidence"]
        confidence = compute_confidence(claim, str(claim_bundle.get("temporal_kind", "")), raw_sources)

        if not raw_sources and status == "VERIFIED":
            status = "FALSE"

        if status == "FALSE":
            confidence = min(confidence, 20)

        evidence_sources = [
            EvidenceSource(
                source_name=str(item.get("source_name", "") or item.get("domain", "")).strip() or "Source",
                title=str(item.get("title", "")).strip() or "Article",
                snippet=str(item.get("snippet", "")).strip(),
                url=str(item.get("url", "")).strip(),
                domain=str(item.get("domain", "") or item.get("source_name", "")).strip(),
                trust_tier=int(item.get("trust_tier", 4)),
                trust_score=int(item.get("trust_score", 1)),
                relevance_score=int(item.get("relevance_score", 0)),
            )
            for item in raw_sources
            if item.get("url")
        ]
        source_links = [str(item.get("url", "")).strip() for item in raw_sources if item.get("url")]

        temporal_kind = str(claim_bundle.get("temporal_kind", "")).strip()

        corrected = str(llm_item.get("corrected_fact", "")).strip()
        if status == "VERIFIED" and not corrected:
            corrected = claim

        explanation = str(llm_item.get("explanation", "")).strip()
        reasoning = str(llm_item.get("reasoning", "")).strip()
        if not raw_sources and not explanation:
            explanation = (
                "No authoritative web pages were retrieved for this claim from live search, "
                "so it should not be treated as verified."
            )

        # Attach per-source explanations when provided by Groq
        source_explanations = llm_item.get("source_explanations") if isinstance(llm_item, dict) else None
        if isinstance(source_explanations, list) and evidence_sources:
            by_idx = {}
            for row in source_explanations:
                if isinstance(row, dict) and row.get("source_index") and row.get("note") is not None:
                    try:
                        by_idx[int(row["source_index"])] = str(row.get("note", "")).strip()
                    except Exception:
                        continue
            for i, es in enumerate(evidence_sources, start=1):
                note = by_idx.get(i, "")
                if note:
                    es.explanation = note

        output_results.append(
            ClaimResult(
                claim=claim,
                status=status,  # type: ignore[arg-type]
                explanation=explanation,
                reasoning=reasoning,
                incorrect_part=str(llm_item.get("incorrect_part", "")).strip(),
                corrected_fact=corrected,
                confidence_score=confidence,
                evidence_summary=str(llm_item.get("evidence_summary", "")).strip(),
                temporal_kind=temporal_kind,
                evidence_sources=evidence_sources,
                source_links=source_links,
            )
        )

    avg_conf = int(round(sum(r.confidence_score for r in output_results) / max(1, len(output_results))))
    verified_n = sum(1 for r in output_results if r.status == "VERIFIED")
    inaccurate_n = sum(1 for r in output_results if r.status == "INACCURATE")
    false_n = sum(1 for r in output_results if r.status == "FALSE")

    # New document score formula (balanced; false claims don't nuke score).
    # baseScore = verified*12 + inaccurate*5 - falsePenalty
    # confidenceBonus = avgConfidence * 0.35
    # documentScore = baseScore + confidenceBonus, clamp 0..100
    false_high = 0
    false_med = 0
    false_low = 0
    for r in output_results:
        if r.status != "FALSE":
            continue
        sev = false_severity(r.claim, r.temporal_kind, [e.model_dump() for e in r.evidence_sources], r.confidence_score)
        if sev == "high":
            false_high += 1
        elif sev == "medium":
            false_med += 1
        else:
            false_low += 1

    # Weighted false penalty (requirement #6)
    false_penalty = false_high * 10 + false_med * 8 + false_low * 6

    base_score = verified_n * 12 + inaccurate_n * 5 - false_penalty
    confidence_bonus = avg_conf * 0.35
    doc_score = clamp_int(int(round(base_score + confidence_bonus)), 0, 100)

    if doc_score >= 85:
        doc_label = "Highly trustworthy document"
    elif doc_score >= 70:
        doc_label = "Mostly reliable with small inaccuracies"
    elif doc_score >= 50:
        doc_label = "Mixed reliability"
    elif doc_score >= 30:
        doc_label = "Low trust document"
    else:
        doc_label = "Highly misleading content"

    # Smarter document summary (not overly harsh unless dominated by false claims).
    total = max(1, len(output_results))
    false_ratio = false_n / total
    if false_ratio >= 0.6:
        doc_summary = (
            "This document contains many fabricated or unsupported claims. A small portion of statements "
            "are supported by trustworthy sources, but most lack reliable evidence or contradict strong sources."
        )
    elif false_ratio >= 0.35:
        doc_summary = (
            "This document contains a mix of verified information and fabricated claims. Several statements "
            "are supported by trusted sources, but some major claims lack evidence or conflict with reliable reporting."
        )
    elif inaccurate_n > 0 or false_n > 0:
        doc_summary = (
            "This document is mostly supported by trustworthy sources, with some inaccuracies or weakly supported statements. "
            "A few claims may be outdated or require clearer evidence."
        )
    else:
        doc_summary = (
            "This document appears highly trustworthy. The checked claims are strongly supported by reliable sources."
        )

    response = FactCheckResponse(
        filename=filename,
        total_claims=len(output_results),
        cached=False,
        results=output_results,
        document_score=doc_score,
        document_label=doc_label,
        avg_confidence=avg_conf,
        document_summary=doc_summary,
    )
    factcheck_cache.set(cache_key, response)
    return response
