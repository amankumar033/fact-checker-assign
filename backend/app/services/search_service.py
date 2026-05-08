from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.services.source_trust import (
    is_low_signal_domain,
    trust_score_1_to_10,
    trust_tier_and_weight,
)
from app.utils.cache import TTLCache

logger = logging.getLogger("fact_checker")

TAVILY_URL = "https://api.tavily.com/search"
DDG_MAX_FETCH = 16

BAD_DOMAIN_SUBSTRINGS: tuple[str, ...] = (
    "buyfollowers",
    "buy-followers",
    "freefollowers",
    "cheapfollowers",
    "seoservice",
    "seo-service",
    "backlinks",
    "ranker",
    "serp",
    "guestpost",
    "pressrelease",
)


def _looks_spammy(url: str, domain: str, title: str, snippet: str) -> bool:
    hay = " ".join([url, domain, title, snippet]).lower()
    return any(bad in hay for bad in BAD_DOMAIN_SUBSTRINGS)


def _tokenize(text: str) -> set[str]:
    out: set[str] = set()
    for raw in (text or "").lower().replace("/", " ").replace("-", " ").split():
        t = "".join(ch for ch in raw if ch.isalnum())
        if len(t) >= 3:
            out.add(t)
    return out


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


def _relevance_score(query: str, title: str, snippet: str) -> int:
    q_tokens = _tokenize(query)
    s_tokens = _tokenize(f"{title} {snippet}")
    if not q_tokens or not s_tokens:
        return 0
    overlap = len(q_tokens & s_tokens) / max(1, len(q_tokens))
    num_q = _extract_numbers(query)
    num_s = _extract_numbers(f"{title} {snippet}")
    num_bonus = 0.15 if (num_q and (num_q & num_s)) else 0.0
    score = (overlap + num_bonus) * 100
    return max(0, min(100, int(round(score))))

search_cache: TTLCache[list[dict]] = TTLCache(
    ttl_seconds=settings.search_cache_ttl_seconds,
    max_items=320,
)
_search_semaphore = asyncio.Semaphore(max(1, settings.max_concurrent_searches))


def _cache_key(query: str) -> str:
    normalized = " ".join(query.strip().lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _domain_from_url(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def _is_homepage(url: str) -> bool:
    try:
        parsed = urlparse(url)
        path = parsed.path or ""
        return path in {"", "/"}
    except Exception:
        return False


def _normalize_tavily_item(raw: dict[str, Any], max_snippet_chars: int) -> dict | None:
    url = str(raw.get("url", "")).strip()[:800]
    if not url or not url.startswith(("http://", "https://")):
        return None
    title = str(raw.get("title", "") or "").strip()[:300]
    content = str(raw.get("content", "") or raw.get("snippet", "") or "").strip()
    snippet = content[:max_snippet_chars] if max_snippet_chars > 0 else content
    if not title and not snippet:
        return None
    domain = _domain_from_url(url)
    if not domain or is_low_signal_domain(domain):
        return None
    tier, weight = trust_tier_and_weight(domain)
    trust_score = trust_score_1_to_10(domain)
    if _is_homepage(url) and tier > 2:
        return None
    score = float(raw.get("score", 0) or 0)
    return {
        "source_name": domain,
        "domain": domain,
        "title": title or domain,
        "snippet": snippet,
        "url": url,
        "trust_tier": tier,
        "trust_weight": weight,
        "trust_score": trust_score,
        "_tavily_score": score,
    }


def _rank_results(items: list[dict], max_results: int) -> list[dict]:
    """Prefer higher trust, then Tavily relevance score, longer snippets."""
    items.sort(
        key=lambda x: (
            int(x.get("trust_tier", 4)),
            -float(x.get("_tavily_score", 0)),
            -len(str(x.get("snippet", ""))),
        ),
    )
    deduped: list[dict] = []
    seen_hosts: set[str] = set()
    for item in items:
        host = str(item.get("domain", ""))
        if not host or host in seen_hosts:
            continue
        seen_hosts.add(host)
        clean = {k: v for k, v in item.items() if not k.startswith("_")}
        deduped.append(clean)
        if len(deduped) >= max_results:
            break
    return deduped


async def _tavily_search_raw(client: httpx.AsyncClient, query: str) -> list[dict[str, Any]]:
    if not settings.tavily_api_key.strip():
        raise RuntimeError("TAVILY_API_KEY is not configured.")
    payload = {
        "api_key": settings.tavily_api_key.strip(),
        "query": query,
        "search_depth": settings.tavily_search_depth,
        "include_answer": False,
        "include_images": False,
        "max_results": min(20, max(5, settings.tavily_fetch_size)),
    }
    headers = {"Content-Type": "application/json"}
    last_status: int | None = None
    last_body = ""
    delays = (0.35, 0.85, 1.7)
    for attempt, delay in enumerate(delays):
        try:
            response = await client.post(TAVILY_URL, json=payload, headers=headers)
            last_status = response.status_code
            last_body = response.text[:500]
            if response.status_code == 429 and attempt < len(delays) - 1:
                logger.warning("Tavily rate limited; retrying attempt=%s", attempt + 1)
                await asyncio.sleep(delay)
                continue
            if response.status_code in {401, 403}:
                logger.error("Tavily auth failed status=%s body=%s", response.status_code, response.text[:400])
                raise RuntimeError("Tavily API authentication failed. Check TAVILY_API_KEY.")
            if response.status_code in {500, 502, 503, 504} and attempt < len(delays) - 1:
                logger.warning(
                    "Tavily temporary error status=%s; retrying attempt=%s",
                    response.status_code,
                    attempt + 1,
                )
                await asyncio.sleep(delay)
                continue
            response.raise_for_status()
            data = response.json()
            return list(data.get("results") or []) if isinstance(data, dict) else []
        except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
            if attempt >= len(delays) - 1:
                logger.error(
                    "Tavily search failed query=%s status=%s body=%s err=%s",
                    query[:80],
                    last_status,
                    last_body,
                    type(exc).__name__,
                )
                return []
            await asyncio.sleep(delay)
    return []


def _normalize_ddg_item(raw: dict[str, Any], max_snippet_chars: int) -> dict | None:
    url = str(raw.get("href", "") or raw.get("url", "")).strip()[:800]
    if not url or not url.startswith(("http://", "https://")):
        return None
    title = str(raw.get("title", "") or "").strip()[:300]
    snippet_raw = str(raw.get("body", "") or raw.get("snippet", "") or "").strip()
    snippet = snippet_raw[:max_snippet_chars] if max_snippet_chars > 0 else snippet_raw
    if not title and not snippet:
        return None
    domain = _domain_from_url(url)
    if not domain or is_low_signal_domain(domain):
        return None
    tier, weight = trust_tier_and_weight(domain)
    trust_score = trust_score_1_to_10(domain)
    if _is_homepage(url) and tier > 2:
        return None
    return {
        "source_name": domain,
        "domain": domain,
        "title": title or domain,
        "snippet": snippet,
        "url": url,
        "trust_tier": tier,
        "trust_weight": weight,
        "trust_score": trust_score,
        "_tavily_score": 0.0,
    }


def _ddg_search_raw_sync(query: str) -> list[dict[str, Any]]:
    """
    Keyless fallback provider for deployments where Tavily isn't configured.
    Uses DuckDuckGo via `duckduckgo_search` (best-effort; may be rate limited).
    """
    try:
        from duckduckgo_search import DDGS  # type: ignore[import-not-found]
    except Exception as exc:
        logger.warning("DuckDuckGo search unavailable (missing dependency): %s", type(exc).__name__)
        return []

    q = query.strip()
    if not q:
        return []

    try:
        with DDGS() as ddgs:
            results = ddgs.text(q, max_results=DDG_MAX_FETCH)
            return list(results) if results else []
    except Exception as exc:
        logger.warning("DuckDuckGo search failed: %s", type(exc).__name__)
        return []


async def search_web_evidence_async(
    client: httpx.AsyncClient,
    query: str,
    *,
    max_results: int | None = None,
    max_snippet_chars: int | None = None,
) -> list[dict]:
    """Live web search via Tavily; falls back to DuckDuckGo when keyless."""
    limit = max_results if max_results is not None else settings.web_results_per_claim
    snippet_cap = max_snippet_chars if max_snippet_chars is not None else settings.max_snippet_chars
    q = query.strip()
    if not q:
        return []

    key = _cache_key(q)
    cached = search_cache.get(key)
    if cached is not None:
        logger.debug("Search cache hit query=%s", q[:60])
        pool = [dict(x) for x in cached]
        return pool[:limit]

    async with _search_semaphore:
        if settings.tavily_api_key.strip():
            raw_items = await _tavily_search_raw(client, q)
            normalizer = _normalize_tavily_item
        else:
            raw_items = await asyncio.to_thread(_ddg_search_raw_sync, q)
            normalizer = _normalize_ddg_item

    normalized: list[dict] = []
    for raw in raw_items:
        item = normalizer(raw, snippet_cap)
        if item:
            if _looks_spammy(item.get("url", ""), item.get("domain", ""), item.get("title", ""), item.get("snippet", "")):
                continue
            rel = _relevance_score(q, str(item.get("title", "")), str(item.get("snippet", "")))
            item["relevance_score"] = rel
            normalized.append(item)

    relevance_threshold = 35
    filtered = [it for it in normalized if int(it.get("relevance_score", 0)) >= relevance_threshold]
    if not filtered:
        filtered = normalized

    pool_cap = max(2, limit, settings.search_cache_pool_size, settings.web_results_cap)
    ranked_pool = _rank_results(filtered, pool_cap)
    search_cache.set(key, ranked_pool)
    return ranked_pool[:limit]


def search_web_evidence(
    query: str,
    max_results: int = 3,
    max_snippet_chars: int = 260,
) -> list[dict]:
    """
    Sync wrapper for legacy callers/tests; avoids async. Prefer search_web_evidence_async in app code.
    """
    snippet_cap = max_snippet_chars

    async def _run() -> list[dict]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            return await search_web_evidence_async(
                client,
                query,
                max_results=max_results,
                max_snippet_chars=snippet_cap,
            )

    return asyncio.run(_run())
