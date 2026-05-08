export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function estimateConfidence(status, confidenceScore) {
  const n = Number(confidenceScore)
  if (Number.isFinite(n) && n > 0) return clamp(Math.round(n), 0, 100)

  // Fallback heuristic when backend returns 0/undefined
  if (status === 'VERIFIED') return 90
  if (status === 'INACCURATE') return 78
  if (status === 'FALSE') return 94
  return 75
}

export function computeTrustScore(results = []) {
  if (!results.length) return 0

  const totalClaims = results.length

  const verifiedClaims = results.filter(
    (item) => item.status === 'VERIFIED'
  ).length

  const inaccurateClaims = results.filter(
    (item) => item.status === 'INACCURATE'
  ).length

  // Base score depends mainly on verified percentage
  let score = (verifiedClaims / totalClaims) * 100

  // Only small penalty for inaccurate claims
  score -= inaccurateClaims * 1.4

  // Optional small confidence bonus
  const avgConfidence =
    results.reduce((sum, item) => sum + (item.confidence || 0), 0) /
    totalClaims

  score += avgConfidence * 0.8

  return clamp(Math.round(score), 0, 100)
}

export function trustLabel(score) {
  if (score >= 80) return 'High Trust'
  if (score >= 55) return 'Medium Trust'
  return 'Low Trust'
}

const TIER_LABELS = {
  1: 'Official / primary',
  2: 'Trusted news',
  3: 'Reference',
  4: 'Other',
}

export function trustTierLabel(tier) {
  const t = Number(tier)
  if (!Number.isFinite(t)) return TIER_LABELS[4]
  return TIER_LABELS[Math.min(4, Math.max(1, Math.round(t)))] ?? TIER_LABELS[4]
}

export function temporalKindLabel(kind) {
  const k = String(kind || '').toLowerCase()
  if (k === 'historical') return 'Historical fact'
  if (k === 'current') return 'Present-day fact (2026 context)'
  if (k === 'predictive') return 'Forward-looking'
  return 'Mixed / unclear timeframe'
}
