import { Card } from './ui/Card.jsx'

function Stat({
  label,
  value,
  tone = 'slate',
  filterKey,
  selectedFilter,
  onSelectFilter,
  withCard = true,
}) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'yellow'
        ? 'text-amber-800'
        : tone === 'red'
          ? 'text-rose-700'
          : 'text-indigo-700'

  const iconTileClass =
    tone === 'blue'
      ? 'bg-gradient-to-br from-slate-900/65 to-slate-800/65 text-white shadow-sm shadow-slate-900/5'
      : tone === 'green'
        ? 'bg-gradient-to-br from-emerald-700/70 to-emerald-600/70 text-white shadow-sm shadow-emerald-900/5'
        : tone === 'yellow'
          ? 'bg-gradient-to-br from-amber-700/70 to-amber-600/70 text-white shadow-sm shadow-amber-900/5'
          : tone === 'red'
            ? 'bg-gradient-to-br from-rose-700/70 to-rose-600/70 text-white shadow-sm shadow-rose-900/5'
            : 'bg-gradient-to-br from-slate-900/65 to-slate-800/65 text-white'

  const icon = (() => {
    if (label === 'Verified') {
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 7.5 10.2 17.3 4.8 12"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    }
    if (label === 'Inaccurate') {
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 8v5"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M12 16.5h.01"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M10.4 4.6 2.9 18.2A2 2 0 0 0 4.6 21h14.8a2 2 0 0 0 1.7-2.8L13.6 4.6a2 2 0 0 0-3.2 0Z"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
        </svg>
      )
    }
    if (label === 'False') {
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8 8l8 8M16 8l-8 8"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      )
    }
    // Total claims
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 7h14M6 12h14M6 17h14"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M3.5 7h.01M3.5 12h.01M3.5 17h.01"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
    )
  })()

  const isSelected = selectedFilter === filterKey
  const clickable = typeof onSelectFilter === 'function'

  const wrapperClasses = [
    'h-full min-h-[132px] rounded-2xl px-5 py-5 ring-1 transition-all duration-500 ease-out',
    'border border-dashed border-slate-200 bg-white/90 backdrop-blur-sm',
    'shadow-[0_10px_30px_rgba(2,6,23,0.05)] cursor-pointer',
    'hover:-translate-y-2 hover:scale-[1.03] hover:shadow-2xl hover:border-indigo-200 hover:bg-indigo-50/30',
    'focus:outline-none focus:ring-2 focus:ring-indigo-200',
    isSelected ? 'ring-indigo-200 shadow-md' : 'ring-slate-200/80',
  ].join(' ')

  const buttonProps = clickable
    ? {
        type: 'button',
        onClick: () => onSelectFilter(filterKey),
      }
    : { type: 'button' }

  const content = (
    <div className="flex h-full flex-col items-center justify-center text-center gap-3">
      <div
        className={[
          'flex h-12 w-12 items-center justify-center rounded-xl',
          iconTileClass,
          'transition-all duration-500 ease-out',
        ].join(' ')}
      >
        {icon}
      </div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`text-3xl font-semibold leading-none ${toneClass}`}>{value}</p>
    </div>
  )

  if (!withCard) {
    return (
      <button
        {...buttonProps}
        className={`group w-full ${wrapperClasses}`}
        aria-pressed={isSelected}
      >
        {content}
      </button>
    )
  }

  return (
    <Card className="p-0 hover:shadow-lg">
      <button
        {...buttonProps}
        className={`group w-full ${wrapperClasses} border-0 bg-transparent shadow-none rounded-2xl`}
        aria-pressed={isSelected}
      >
        {content}
      </button>
    </Card>
  )
}

export function SummaryCards({
  results = [],
  withCard = true,
  selectedFilter = 'ALL',
  onSelectFilter,
}) {
  const total = results.length
  const verified = results.filter((r) => r.status === 'VERIFIED').length
  const inaccurate = results.filter((r) => r.status === 'INACCURATE').length
  const falseCount = results.filter((r) => r.status === 'FALSE').length

  const items = [
    { label: 'Total claims', value: total, tone: 'blue', filterKey: 'ALL' },
    { label: 'Verified', value: verified, tone: 'green', filterKey: 'VERIFIED' },
    { label: 'Inaccurate', value: inaccurate, tone: 'yellow', filterKey: 'INACCURATE' },
    { label: 'False', value: falseCount, tone: 'red', filterKey: 'FALSE' },
  ]

  return (
    <div className="grid h-full items-stretch gap-4 md:grid-cols-4">
      {items.map((it) => (
        <Stat
          key={it.filterKey}
          label={it.label}
          value={it.value}
          tone={it.tone}
          filterKey={it.filterKey}
          selectedFilter={selectedFilter}
          onSelectFilter={onSelectFilter}
          withCard={withCard}
        />
      ))}
    </div>
  )
}

