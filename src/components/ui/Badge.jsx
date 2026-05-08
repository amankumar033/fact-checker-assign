const variants = {
  success: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-100 text-amber-800 ring-amber-200',
  danger: 'bg-rose-100 text-rose-700 ring-rose-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${variants[tone]}`}
    >
      {children}
    </span>
  )
}

