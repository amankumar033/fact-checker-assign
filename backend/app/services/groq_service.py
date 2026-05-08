import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("fact_checker")

CURRENT_YEAR = 2026


class GroqService:
    def __init__(self) -> None:
        self.api_key = settings.groq_api_key.strip()
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"
        self.model = settings.groq_model

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    async def _chat_json(self, prompt: str, max_tokens: int = 900) -> Any:
        if not self.is_enabled():
            raise RuntimeError("GROQ_API_KEY is not configured.")

        payload = {
            "model": self.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "max_tokens": max_tokens,
            "messages": [
                {
                    "role": "system",
                    "content": "Return strict JSON only. No markdown or commentary.",
                },
                {"role": "user", "content": prompt},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

        retries = 3
        last_status = None
        last_body_snippet = ""
        last_exc: Exception | None = None
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=48.0) as client:
                    response = await client.post(self.base_url, headers=headers, json=payload)
                last_status = response.status_code
                last_body_snippet = response.text[:600]
                if response.status_code in {429, 500, 502, 503, 504} and attempt < retries:
                    logger.warning("Groq temporary failure status=%s retry=%s", response.status_code, attempt + 1)
                    continue
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                return json.loads(content)
            except (httpx.RequestError, httpx.HTTPStatusError, KeyError, json.JSONDecodeError) as exc:
                last_exc = exc
                if attempt >= retries:
                    if last_status == 429:
                        raise RuntimeError("API quota exceeded. Please try again later.") from exc
                    if last_status in {401, 403}:
                        logger.error("Groq auth failed status=%s body=%s", last_status, last_body_snippet)
                        raise RuntimeError(
                            "Groq authentication failed (check GROQ_API_KEY)."
                        ) from exc
                    if last_status == 400:
                        logger.error("Groq bad request body=%s", last_body_snippet)
                        raise RuntimeError("Groq request was rejected (bad request).") from exc
                    if last_status:
                        logger.error("Groq request failed status=%s body=%s", last_status, last_body_snippet)
                    raise RuntimeError("Groq request failed after retries.") from exc
                logger.warning("Groq request retry=%s due to %s", attempt + 1, type(exc).__name__)
        raise RuntimeError("Groq request failed unexpectedly.") from last_exc

    async def extract_claims_with_plans(self, document_text: str, max_claims: int) -> list[dict[str, str]]:
        """
        Single Groq call: factual claims + temporal_kind + Tavily search_query each.
        Falls back to extract_claims + plan_search_for_claims if JSON shape is wrong.
        """
        limit = min(max(max_claims, 5), 8)
        prompt = (
            f"Extract up to {limit} of the strongest factual claims from the document below. "
            "Prefer claims with dates, named entities, statistics, or concrete events; keep each "
            "claim self-contained and preserve dates as written.\n\n"
            "For EACH claim, also output:\n"
            "- temporal_kind: historical | current | predictive | ambiguous\n"
            f"  • historical: about the past (do NOT mark as wrong later just because {CURRENT_YEAR} is 'now').\n"
            f"  • current: present tense, 'latest', 'still', 'is now' — must match reality around {CURRENT_YEAR}.\n"
            "  • predictive: mainly about the future.\n"
            "  • ambiguous: unclear.\n"
            "- search_query: short keyword query for a web search API.\n"
            f"  • historical: include year/event anchors; do NOT stuff '{CURRENT_YEAR}' into the query unless the claim is about today.\n"
            f"  • current: add '{CURRENT_YEAR}', 'current', or 'today' when it helps disambiguation.\n\n"
            f'Return JSON: {{"items":[{{"claim":"...","temporal_kind":"...","search_query":"..."}}]}} '
            f"with at most {limit} items, best first.\n\nDocument:\n{document_text}"
        )
        data = await self._chat_json(prompt, max_tokens=820 + limit * 45)
        items = None
        if isinstance(data, dict):
            items = data.get("items")
            if not isinstance(items, list):
                raw = data.get("results")
                if isinstance(raw, list) and raw and isinstance(raw[0], dict) and "claim" in raw[0]:
                    items = raw
        if not isinstance(items, list) or not items:
            logger.warning("Combined extract/plan returned no items; using two-step fallback.")
            claims = await self.extract_claims(document_text, max_claims)
            if not claims:
                return []
            plans = await self.plan_search_for_claims(claims)
            return [
                {
                    "claim": c,
                    "temporal_kind": plans[i]["temporal_kind"],
                    "search_query": plans[i]["search_query"],
                }
                for i, c in enumerate(claims)
            ]

        allowed_kinds = {"historical", "current", "predictive", "ambiguous"}
        out: list[dict[str, str]] = []
        for row in items[:limit]:
            if not isinstance(row, dict):
                continue
            claim = str(row.get("claim", "")).strip()
            if not claim:
                continue
            tk = str(row.get("temporal_kind", "ambiguous")).strip().lower()
            if tk not in allowed_kinds:
                tk = "ambiguous"
            sq = str(row.get("search_query", "")).strip() or claim
            out.append({"claim": claim, "temporal_kind": tk, "search_query": sq})

        if not out:
            logger.warning("Combined extract parsed to zero claims; using two-step fallback.")
            claims = await self.extract_claims(document_text, max_claims)
            if not claims:
                return []
            plans = await self.plan_search_for_claims(claims)
            return [
                {
                    "claim": c,
                    "temporal_kind": plans[i]["temporal_kind"],
                    "search_query": plans[i]["search_query"],
                }
                for i, c in enumerate(claims)
            ]
        return out

    async def extract_claims(self, document_text: str, max_claims: int) -> list[str]:
        limit = min(max(max_claims, 5), 8)
        prompt = (
            f"Extract the top {limit} factual claims from this document. "
            "Prefer claims with dates, entities, statistics, or verifiable events. "
            "Include the claim wording needed later for fact-checking (preserve dates as written). "
            'Return JSON: {"claims":["..."]}. '
            f"Document text:\n{document_text}"
        )
        data = await self._chat_json(prompt, max_tokens=520)
        claims = data.get("claims", []) if isinstance(data, dict) else []
        return [str(item).strip() for item in claims if str(item).strip()][:limit]

    async def plan_search_for_claims(self, claims: list[str]) -> list[dict[str, str]]:
        """One compact call: temporal class + Tavily-optimized search query per claim (same order)."""
        claims_json = json.dumps(claims, ensure_ascii=False)
        prompt = (
            "You guide live-web search for an automated fact checker. "
            f"The current calendar year is {CURRENT_YEAR}. "
            "For EACH claim in this JSON array, in the SAME ORDER, output one object with:\n"
            "- temporal_kind: one of historical | current | predictive | ambiguous\n"
            "  * historical: about past events/dates (even if long ago). Do NOT treat as 'outdated' "
            f"just because today is {CURRENT_YEAR}.\n"
            f"  * current: present tense, ongoing status, 'latest', 'still', 'as of now' — must reflect "
            f"reality around {CURRENT_YEAR}.\n"
            "  * predictive: mainly about the future.\n"
            "  * ambiguous: unclear which case applies.\n"
            "- search_query: a concise keyword query optimized for a web search API. "
            "For historical claims, include anchors (year/entity/event) but do NOT force the current year "
            "into the query. For current claims, add disambiguation such as '2026', 'current', or "
            "'today' when it helps.\n"
            f"Claims array: {claims_json}\n"
            f'Return JSON: {{"results":[{{"temporal_kind":"...","search_query":"..."}}]}} '
            f"with exactly {len(claims)} results."
        )
        data = await self._chat_json(prompt, max_tokens=700 + len(claims) * 24)
        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list) or len(results) != len(claims):
            logger.warning("Groq plan_search mismatch; falling back to raw claims as queries.")
            return [{"temporal_kind": "ambiguous", "search_query": c} for c in claims]

        out: list[dict[str, str]] = []
        allowed_kinds = {"historical", "current", "predictive", "ambiguous"}
        for i, claim_text in enumerate(claims):
            row = results[i] if i < len(results) else {}
            tk = str(row.get("temporal_kind", "ambiguous")).strip().lower()
            if tk not in allowed_kinds:
                tk = "ambiguous"
            sq = str(row.get("search_query", "")).strip() or claim_text
            out.append({"temporal_kind": tk, "search_query": sq})
        return out

    async def verify_claims_batch(self, claims_with_evidence: list[dict]) -> list[dict]:
        verification_payload = []
        for bundle in claims_with_evidence:
            ev_list = bundle.get("evidence") or []
            slim_evidence = []
            for idx, item in enumerate(ev_list, start=1):
                slim_evidence.append(
                    {
                        "source_index": idx,
                        "title": item.get("title", ""),
                        "domain": item.get("domain", "") or item.get("source_name", ""),
                        "trust_tier": item.get("trust_tier", 4),
                        "snippet": str(item.get("snippet", ""))[:240],
                        "url": item.get("url", ""),
                    }
                )
            verification_payload.append(
                {
                    "claim": bundle.get("claim", ""),
                    "temporal_kind": bundle.get("temporal_kind", "ambiguous"),
                    "evidence": slim_evidence,
                }
            )

        instructions = (
            "You are the final fact-checking engine. You receive ONLY the provided evidence snippets "
            "and URLs from a live web search. Current year for interpretation: "
            f"{CURRENT_YEAR}.\n\n"
            "Rules:\n"
            "1) Use ONLY these sources. NEVER invent URLs, titles, or quotes. If evidence is empty or "
            "contradictory/insufficient, prefer status FALSE (fabricated/unverifiable) or INACCURATE with "
            "clear explanation — never fabricate citations.\n"
            "2) Do NOT mention model knowledge cutoffs or training data.\n"
            "3) Historical claims: judge against what was true for that time period. A correct past-date "
            f"statement stays VERIFIED even in {CURRENT_YEAR}.\n"
            f"4) Current / present-tense claims: judge against what sources indicate for ~{CURRENT_YEAR}. "
            "If sources show the claim is outdated, status INACCURATE with corrected_fact.\n"
            "5) Prefer multiple agreeing sources; boost confidence when trust_tier is 1–2 (official / "
            "major outlets). If evidence is only tier 3 reference sites (e.g. Wikipedia), keep "
            "confidence moderate unless the claim is trivial.\n"
            "6) VERIFIED: well supported by sources. INACCURATE: partly wrong or outdated (current claims). "
            "FALSE: wrong, unsupported, or contradicted by trustworthy sources.\n"
            "7) corrected_fact: for VERIFIED, briefly restate the supported fact; for INACCURATE/FALSE, give "
            "the best-supported correction grounded in snippets.\n"
            "8) reasoning: 1–2 sentences. Keep it short and specific.\n"
            "9) evidence_summary: 2–4 sentences summarizing what the cited sources show.\n"
            "10) source_explanations: For each evidence item, add a short note explaining why it matters.\n"
            "9) Never output placeholder or search-page URLs that were not in the evidence list.\n\n"
            'Return JSON: {"results":[{"claim":"","status":"VERIFIED|INACCURATE|FALSE",'
            '"incorrect_part":"","corrected_fact":"","confidence_score":0,'
            '"explanation":"","reasoning":"","evidence_summary":"",'
            '"source_explanations":[{"source_index":1,"note":""}]}]} '
            "— same claim strings and ordering as input."
            f"\nInput:\n{json.dumps(verification_payload, ensure_ascii=False)}"
        )

        data = await self._chat_json(instructions, max_tokens=2400)
        if not isinstance(data, dict) or not isinstance(data.get("results"), list):
            raise ValueError("Groq returned invalid verification JSON.")
        return data["results"]


groq_service = GroqService()
