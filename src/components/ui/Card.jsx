export function Card({ className = '', children }) {
  return (
    <div
      className={`rounded-2xl bg-white/90 shadow-sm ring-1 ring-slate-200/80 backdrop-blur-sm transition-shadow duration-200 hover:shadow-md ${className}`}
    >
      {children}
    </div>
  )
}

