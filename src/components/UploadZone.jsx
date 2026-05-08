import { motion } from 'framer-motion'

import { Card } from './ui/Card.jsx'

export function UploadZone({
  file,
  isDragging,
  isLoading,
  uploadProgress,
  error,
  onPickFile,
  onDrop,
  onDragEnter,
  onDragLeave,
  onRun,
  onLoadSample,
  onClearFile,
}) {
  return (
    <Card className="h-full p-5 md:p-8 shadow-[0_14px_40px_rgba(2,6,23,0.06)] ring-1 ring-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 md:text-xl">Upload a PDF</h2>
            <p className="mt-1 text-sm text-slate-600">
              Supported: PDF only. We’ll analyze the top 5–8 factual claims.
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadSample}
            className="cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition duration-200 hover:bg-slate-50 active:scale-[0.99]"
          >
            Try sample report
          </button>
        </div>

        {!file ? (
          <div
            onDragEnter={(event) => {
              event.preventDefault()
              onDragEnter?.()
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => onDragLeave?.()}
            onDrop={onDrop}
            className={`mt-5 flex-1 rounded-2xl border-2 border-dashed p-8 text-center transition md:p-10 ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-300 bg-slate-50/70'
            }`}
          >
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mx-auto flex h-full max-w-xl flex-col items-center justify-center"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                className="text-indigo-600"
              >
                <path
                  d="M7 18h10a4 4 0 0 0 .8-7.92A5 5 0 0 0 8.2 7.5 4 4 0 0 0 7 18Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M12 12v7m0-7 2.5 2.5M12 12 9.5 14.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              </div>
              <p className="mt-4 text-base font-semibold text-slate-900">
                Drag and drop your PDF here
              </p>
              <p className="mt-1 text-sm text-slate-600">or browse from your device</p>

              <label className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:from-indigo-600 hover:to-indigo-600 hover:shadow active:scale-[0.99]">
                Choose file
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => onPickFile?.(event.target.files?.[0] ?? null)}
                />
              </label>
            </motion.div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-5 flex-1 rounded-2xl bg-white/70 p-5 ring-1 ring-slate-200 transition duration-200 hover:shadow-md"
          >
            <div className="flex h-full flex-col justify-center">
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={onClearFile}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
                  title="Remove file"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M18 6 6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-4 ring-1 ring-slate-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 3h7l5 5v13H7V3Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 truncate text-sm font-semibold text-slate-900">{file.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">PDF selected and ready for verification</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="mt-auto pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRun}
              disabled={!file || isLoading}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:from-indigo-600 hover:to-indigo-600 hover:shadow active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm"
            >
              {isLoading ? 'Processing…' : 'Generate trust report'}
            </button>
            {isLoading && (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <span>{uploadProgress > 0 ? `Uploading ${uploadProgress}%` : 'Working…'}</span>
              </div>
            )}
          </div>

          {isLoading && uploadProgress > 0 && (
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width]"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

