import { getDomain, trustTierLabel } from '../lib/format.js'

export function SourceList({ links = [], evidenceSources = [] }) {
  const normalizedEvidence = (evidenceSources ?? [])
    .filter((item) => item?.url)
    .slice(0, 6)

  const uniqueLinks = Array.from(new Set(links)).slice(0, 6)
  const fallbackEvidence = uniqueLinks.map((url) => ({
    source_name: getDomain(url) || 'Source',
    title: getDomain(url) || 'Reference',
    snippet: '',
    url,
  }))

  const list = normalizedEvidence.length ? normalizedEvidence : fallbackEvidence
  if (!list.length) return null

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {list.map((source) => {
        const url = source.url
        const domain = source.domain || source.source_name || getDomain(url)
        const tier = trustTierLabel(source.trust_tier)
        const favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null
        return (
          <a
            key={`${url}-${source.title}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200">
              {favicon ? (
                <img src={favicon} alt="" className="h-5 w-5" />
              ) : (
                <span className="text-xs font-semibold text-slate-600">SRC</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600">
                {source.title || domain || 'Source'}
              </p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {domain || 'Source'}
                <span className="normal-case text-slate-400"> · {tier}</span>
              </p>
              {source.snippet && (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{source.snippet}</p>
              )}
              <p className="mt-1 truncate text-xs text-slate-500">{url}</p>
            </div>
          </a>
        )
      })}
    </div>
  )
}

