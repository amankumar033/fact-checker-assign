import { motion } from 'framer-motion'
import { Card } from './ui/Card.jsx'

const steps = [
  'Extracting PDF text',
  'Identifying factual claims',
  'Searching live web evidence',
  'Verifying claims with AI',
  'Generating trust report',
]

// Animated dots component
function AnimatedDots({ isActive }) {
  if (!isActive) return null
  
  return (
    <motion.div 
      className="flex gap-1 mt-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-blue-500"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  )
}

export function LoadingSteps({ activeIndex = 0, elapsedSeconds = 0, uploadDone = false }) {
  return (
    <Card className="bg-white p-8 shadow-lg md:p-10">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Processing</h3>
          <p className="mt-1 text-sm text-gray-500">
            {elapsedSeconds}s · {uploadDone ? 'running checks' : 'uploading'}
          </p>
        </div>
        <div className="h-12 w-12">
          <svg className="animate-spin h-full w-full" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <circle
              className="opacity-75"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="32"
              strokeDashoffset="8"
            />
          </svg>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {steps.map((label, idx) => {
          const done = idx < activeIndex
          const active = idx === activeIndex
          
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.02 }}
              className="flex items-start gap-4"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  done
                    ? 'bg-green-500 text-white'
                    : active
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="text-sm font-medium">{idx + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p className={`text-base ${active ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                  {label}
                </p>
                <AnimatedDots isActive={active} />
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}