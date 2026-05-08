import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'

import { estimateConfidence, temporalKindLabel } from '../lib/format.js'
import { Badge } from './ui/Badge.jsx'
import { SourceList } from './SourceList.jsx'

function statusTone(status) {
  if (status === 'VERIFIED') return 'success'
  if (status === 'INACCURATE') return 'warn'
  if (status === 'FALSE') return 'danger'
  return 'neutral'
}

function renderCorrectedFact(text) {
  const value = text || 'No correction available.'
  const parts = value.split(/(\d[\d,.]*(?:\s?(?:million|billion|trillion|%|percent|crore|lakh|bn|m))?)/gi)
  return parts.map((part, idx) => {
    if (!part) return null
    const isNumber = /^\d[\d,.]*(?:\s?(?:million|billion|trillion|%|percent|crore|lakh|bn|m))?$/i.test(part)
    if (!isNumber) return <span key={`t-${idx}`}>{part}</span>
    return (
      <span key={`n-${idx}`} className="font-semibold text-emerald-700">
        {part}
      </span>
    )
  })
}

export function ClaimCard({ item, index, open = false, onToggleEvidence }) {
  const confidence = useMemo(
    () => estimateConfidence(item.status, item.confidence_score),
    [item.status, item.confidence_score],
  )
  const showFix = item.status === 'FALSE' || item.status === 'INACCURATE'
  const fixAccent =
    item.status === 'VERIFIED'
      ? 'border-emerald-200'
      : item.status === 'INACCURATE'
        ? 'border-amber-200'
        : 'border-rose-200'
  const claimTone =
    item.status === 'VERIFIED'
      ? 'text-emerald-700'
      : item.status === 'INACCURATE'
        ? 'text-amber-700'
        : item.status === 'FALSE'
          ? 'text-rose-700'
          : 'text-slate-900'

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md md:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              Fact {index + 1}
            </span>
            {item.temporal_kind ? (
              <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-100">
                {temporalKindLabel(item.temporal_kind)}
              </span>
            ) : null}
          </div>
          <p className={`text-lg font-semibold leading-8 ${claimTone}`}>{item.claim}</p>
          <p className="mt-4 text-sm leading-6 text-slate-600">{item.explanation}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge tone={statusTone(item.status)}>{item.status}</Badge>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Confidence
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{confidence}%</p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${
              item.status === 'VERIFIED'
                ? 'bg-emerald-500'
                : item.status === 'INACCURATE'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
            }`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      <div className={`mt-5 rounded-2xl border bg-slate-50 px-4 py-4 ring-1 ring-slate-200/70 shadow-sm ${fixAccent}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {showFix ? 'Corrected fact' : 'Summary'}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-900">
          {renderCorrectedFact(item.corrected_fact)}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => onToggleEvidence?.()}
          className="rounded-xl hover:cursor-pointer bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          {open ? 'Hide details' : 'View evidence & sources'}
        </button>
        <p className="text-xs text-slate-500">Sources from live web search.</p>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/70">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Evidence summary
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {item.evidence_summary || 'No evidence summary generated.'}
              </p>
            </div>

            <SourceList links={item.source_links ?? []} evidenceSources={item.evidence_sources ?? []} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

