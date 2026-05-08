import { motion } from 'framer-motion'
import { useState } from 'react'

export function HeroSection() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const downloadSamplePDF = (fileName) => {
    const pdfUrl = `/${fileName}`
    
    // Create an anchor element and trigger download
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const samplePDFs = [
    { name: 'Sample PDF 1', file: 'sample1.pdf' },
    { name: 'Sample PDF 2', file: 'sample2.pdf' }
  ]

  return (
    <>
      {/* Fixed Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm"
      >
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Left side - Logo and title */}
            <div className="flex items-center gap-3">
              <div className="text-indigo-600">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2 20 6.5V12c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6.5L12 2Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8.5 12.5 11 15l4.5-6"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
                  AI Fact Checker
                </h1>
                <p className="text-xs text-slate-500">PDF claim verification dashboard</p>
              </div>
            </div>

            {/* Right side - Download dropdown */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Sample PDFs
                <svg className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </motion.button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-10"
                >
                  <div className="py-1">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
                      Sample PDF Files
                    </div>
                    {samplePDFs.map((pdf, index) => (
                      <motion.button
                        key={index}
                        whileHover={{ backgroundColor: '#f3f4f6' }}
                        onClick={() => {
                          downloadSamplePDF(pdf.file)
                          setIsDropdownOpen(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors duration-150 flex items-center justify-between"
                      >
                        <span>{pdf.name}</span>
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6" />
                        </svg>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Click outside to close dropdown */}
      {isDropdownOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </>
  )
}