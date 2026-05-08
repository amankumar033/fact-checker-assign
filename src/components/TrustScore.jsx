import { motion } from 'framer-motion'

import { computeTrustScore, trustLabel } from '../lib/format.js'
import { Card } from './ui/Card.jsx'

export function TrustScore({ results = [], processingTimeMs = 0, withCard = true }) {
  const score = computeTrustScore(results)
  const label = trustLabel(score)
  const tone =
    score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low'

  const toneTitleClass =
    tone === 'high'
      ? 'text-emerald-700'
      : tone === 'medium'
        ? 'text-amber-700'
        : 'text-rose-700'

  const dialStopA =
    tone === 'high' ? '#10b981' : tone === 'medium' ? '#f59e0b' : '#f43f5e'
  const dialStopB =
    tone === 'high' ? '#06b6d4' : tone === 'medium' ? '#fde047' : '#fb7185'
  const dialBgStroke = tone === 'high' ? 'rgba(16,185,129,0.25)' : tone === 'medium' ? 'rgba(245,158,11,0.25)' : 'rgba(244,63,94,0.25)'

  const totalClaims = results.length
  const verified = results.filter((r) => r.status === 'VERIFIED').length
  const inaccurate = results.filter((r) => r.status === 'INACCURATE').length
  const falseCount = results.filter((r) => r.status === 'FALSE').length

  const donut = (() => {
    const safeTotal = Math.max(1, totalClaims)
    const pV = verified / safeTotal
    const pI = inaccurate / safeTotal
    const pF = falseCount / safeTotal
    const r = 14
    const cx = 18
    const cy = 18
    const circumference = 2 * Math.PI * r

    const segV = pV * circumference
    const segI = pI * circumference
    const segF = pF * circumference

    const offsetV = 0
    const offsetI = segV
    const offsetF = segV + segI

    const w = 6
    const colorV = '#10b981'
    const colorI = '#f59e0b'
    const colorF = '#f43f5e'
    const baseOpacity = 0.10

    const arc = (seg, offset, color, key) => (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeDasharray={`${seg} ${circumference - seg}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    )

    return (
      <div className="flex items-center gap-4">
        <div className="relative h-36 w-36 rounded-2xl bg-white/70 ring-1 ring-slate-200/80 shadow-sm backdrop-blur-sm">
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-28 w-28">
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(2,6,23,1)"
                strokeOpacity={baseOpacity}
                strokeWidth={w}
              />
              {arc(segV, offsetV, colorV, 'v')}
              {arc(segI, offsetI, colorI, 'i')}
              {arc(segF, offsetF, colorF, 'f')}
            </svg>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] font-semibold text-slate-600">Total</span>
            <span className="text-xl font-semibold text-slate-900">{totalClaims}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="truncate text-xs font-semibold text-emerald-700">Verified</p>
            <p className="ml-auto text-xs font-semibold text-slate-700">{verified}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <p className="truncate text-xs font-semibold text-amber-700">Inaccurate</p>
            <p className="ml-auto text-xs font-semibold text-slate-700">{inaccurate}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <p className="truncate text-xs font-semibold text-rose-700">False</p>
            <p className="ml-auto text-xs font-semibold text-slate-700">{falseCount}</p>
          </div>
        </div>
      </div>
    )
  })()

  const content = (
    <div className="flex min-h-[170px] items-center justify-between gap-6">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document Trust Score</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">{score}/100</p>
        <p className={`mt-1 text-sm font-semibold ${toneTitleClass}`}>{label}</p>
        <p className="mt-3 text-sm text-slate-600">
          Processing time: {processingTimeMs ? `${Math.round(processingTimeMs / 100) / 10}s` : '—'}
        </p>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative h-36 w-36 rounded-2xl bg-white/70 ring-1 ring-slate-200/80 shadow-sm backdrop-blur-sm">
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90">
              <path
                d="M18 2.5a15.5 15.5 0 1 1 0 31a15.5 15.5 0 1 1 0-31"
                fill="none"
                stroke={dialBgStroke}
                strokeWidth="3.2"
              />
              <motion.path
                d="M18 2.5a15.5 15.5 0 1 1 0 31a15.5 15.5 0 1 1 0-31"
                fill="none"
                stroke="url(#trustGradient)"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeDasharray={`${score}, 100`}
                initial={{ strokeDasharray: '0, 100' }}
                animate={{ strokeDasharray: `${score}, 100` }}
                transition={{ duration: 0.6 }}
              />
              <defs>
                <linearGradient id="trustGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={dialStopA} />
                  <stop offset="100%" stopColor={dialStopB} />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-semibold ${toneTitleClass}`}>{score}%</span>
          </div>
        </div>

        {/* breakdown donut + counts */}
        {donut}
      </div>
    </div>
  )

  if (!withCard) return content

  return <Card className="p-5 md:p-8">{content}</Card>
}

