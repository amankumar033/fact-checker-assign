"""Weighted trust tiers for evidence domains (substring / suffix matching on host)."""

from __future__ import annotations

# 1–10 trust score map (10 best). This is used for scoring and filtering.
TRUST_10_SUFFIXES: tuple[str, ...] = (
    "nasa.gov",
    "who.int",
    "un.org",
    "apple.com",
    "openai.com",
    "microsoft.com",
)

TRUST_9_SUFFIXES: tuple[str, ...] = (
    "reuters.com",
    "bbc.com",
    "apnews.com",
    "bloomberg.com",
    "wsj.com",
    "cnbc.com",
)

TRUST_6_SUFFIXES: tuple[str, ...] = (
    "wikipedia.org",
    "britannica.com",
)

TRUST_2_SUFFIXES: tuple[str, ...] = (
    "reddit.com",
    "quora.com",
)

# Tier 1 — official / primary (weight 40)
TIER1_SUFFIXES: tuple[str, ...] = (
    "apple.com",
    "openai.com",
    "microsoft.com",
    "google.com",
    "blog.google",
    "meta.com",
    "fb.com",
    "nasa.gov",
    "cdc.gov",
    "who.int",
    "un.org",
    "census.gov",
    "sec.gov",
    "treasury.gov",
    "europa.eu",
    "worldbank.org",
    "imf.org",
    "nature.com",
    "science.org",
    "sciencemag.org",
    "arxiv.org",
    "nih.gov",
    "pubmed.ncbi.nlm.nih.gov",
    "ncbi.nlm.nih.gov",
    "usgs.gov",
    "noaa.gov",
    "energy.gov",
    "fda.gov",
    "ftc.gov",
    "justice.gov",
    "state.gov",
    "defense.gov",
    "dod.mil",
    "nato.int",
    "iacad.ae",
    "x.com",
    "cloudflare.com",
    "ibm.com",
    "oracle.com",
    "adobe.com",
    "intel.com",
    "amd.com",
    "nvidia.com",
    "samsung.com",
    "sony.com",
    "aboutamazon.com",
    "amazon.com",
)

# Tier 2 — major news / trade (weight 30)
TIER2_SUFFIXES: tuple[str, ...] = (
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "bbc.co.uk",
    "bloomberg.com",
    "cnbc.com",
    "ft.com",
    "wsj.com",
    "nytimes.com",
    "washingtonpost.com",
    "theguardian.com",
    "economist.com",
    "theverge.com",
    "techcrunch.com",
    "wired.com",
    "axios.com",
    "politico.com",
    "forbes.com",
    "time.com",
    "latimes.com",
    "npr.org",
    "pbs.org",
)

# Tier 3 — reference (weight 10)
TIER3_SUFFIXES: tuple[str, ...] = (
    "wikipedia.org",
    "britannica.com",
    "investopedia.com",
)


def _host_key(host: str) -> str:
    h = (host or "").strip().lower()
    if h.startswith("www."):
        h = h[4:]
    return h


def _suffix_tier(host: str, suffixes: tuple[str, ...], _tier: int = 0) -> bool:
    h = _host_key(host)
    return any(h == s or h.endswith("." + s) for s in suffixes)


def government_or_academic_tier1(host: str) -> bool:
    h = _host_key(host)
    if not h:
        return False
    if h.endswith(".gov") or h.endswith(".gov.uk") or h.endswith(".gov.au") or h.endswith(".gov.in"):
        return True
    if h.endswith(".mil"):
        return True
    if h.endswith(".edu"):
        return True
    if h.endswith(".int") and h not in {"who.int"}:
        return True
    return False


LOW_SIGNAL_SUFFIXES: tuple[str, ...] = (
    "pinterest.com",
    "tiktok.com",
    "quora.com",
    "medium.com",
    "tumblr.com",
)


def is_low_signal_domain(host: str) -> bool:
    h = _host_key(host)
    return _suffix_tier(h, LOW_SIGNAL_SUFFIXES, 4) or h in {
        "facebook.com",
        "m.facebook.com",
        "youtube.com",
        "youtu.be",
    }


def trust_tier_and_weight(host: str) -> tuple[int, int]:
    """
    Returns (tier, base_weight). Lower tier is more trusted.
    tier 1 = official / gov / primary
    tier 2 = major outlets
    tier 3 = reference
    tier 4 = unknown / low authority
    """
    h = _host_key(host)
    if not h:
        return 4, 2
    if government_or_academic_tier1(h):
        return 1, 40
    if _suffix_tier(h, TIER1_SUFFIXES, 1):
        return 1, 40
    if _suffix_tier(h, TIER2_SUFFIXES, 2):
        return 2, 30
    if _suffix_tier(h, TIER3_SUFFIXES, 3):
        return 3, 10
    return 4, 2


def trust_score_1_to_10(host: str) -> int:
    """
    Domain trust score (1..10).
    - 10: .gov/.edu + specific official domains
    - 9: top-tier journalism (Reuters/BBC/AP/CNBC/etc.)
    - 6: reputable reference
    - 2: community/UGC
    - 1: unknown/SEO/spam
    """
    h = _host_key(host)
    if not h:
        return 1
    if h.endswith(".gov") or h.endswith(".edu") or h.endswith(".mil"):
        return 10
    if _suffix_tier(h, TRUST_10_SUFFIXES, 0) or government_or_academic_tier1(h):
        return 10
    if _suffix_tier(h, TRUST_9_SUFFIXES, 0):
        return 9
    if _suffix_tier(h, TRUST_6_SUFFIXES, 0):
        return 6
    if _suffix_tier(h, TRUST_2_SUFFIXES, 0):
        return 2
    return 1


def multi_source_confidence_boost(evidence: list[dict]) -> int:
    """Extra points when multiple independent higher-trust domains corroborate."""
    if len(evidence) < 2:
        tier_bonus = {1: 8, 2: 5, 3: 2, 4: 0}
        t = min((item.get("trust_tier") or 4) for item in evidence) if evidence else 4
        return tier_bonus.get(int(t), 0)

    tiers = [int(item.get("trust_tier") or 4) for item in evidence]
    hosts = [_host_key(str(item.get("domain") or "")) for item in evidence]
    distinct_hosts = {h for h in hosts if h}

    has_t1 = any(t <= 1 for t in tiers)
    has_t2 = any(t <= 2 for t in tiers)
    if has_t1 and has_t2 and len(distinct_hosts) >= 2:
        return 18
    if sum(1 for t in tiers if t <= 2) >= 2 and len(distinct_hosts) >= 2:
        return 14
    if has_t1:
        return 10
    if has_t2:
        return 6
    return 2
