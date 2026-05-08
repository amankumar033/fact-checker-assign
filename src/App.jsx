import { useEffect, useRef, useState } from 'react'

import { ClaimCard } from './components/ClaimCard.jsx'
import { HeroSection } from './components/HeroSection.jsx'
import { LoadingSteps } from './components/LoadingSteps.jsx'
import { SummaryCards } from './components/SummaryCards.jsx'
import { TrustScore } from './components/TrustScore.jsx'
import { UploadZone } from './components/UploadZone.jsx'
import { Card } from './components/ui/Card.jsx'
import { uploadPdfWithProgress } from './lib/upload.js'

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? ''
const API_BASE_URL =
  rawApiBaseUrl && rawApiBaseUrl !== 'http://localhost:8000'
    ? rawApiBaseUrl.replace(/\/+$/, '')
    : ''
const FILTERS = ['ALL', 'VERIFIED', 'INACCURATE', 'FALSE']

const SAMPLE_REPORT = {
  filename: 'sample_marketing_deck.pdf',
  total_claims: 6,
  cached: false,
  results: [
    {
      claim: 'Our platform reduced customer support resolution time by 42% in Q4 2024.',
      status: 'INACCURATE',
      explanation:
        'Evidence suggests improvements are plausible, but the 42% figure is not consistently supported across sources and may depend on cohort definitions.',
      corrected_fact: 'Support resolution time improved, but the exact percentage varies by dataset and period.',
      confidence_score: 82,
      evidence_summary:
        'Multiple industry benchmarks show 20–35% improvements for similar automation; the 42% number is not clearly documented publicly.',
      source_links: ['https://www.gartner.com/', 'https://www.forrester.com/'],
    },
    {
      claim: 'The global SaaS market will reach $1.2T by 2030.',
      status: 'VERIFIED',
      explanation:
        'Several reputable market reports project SaaS growth to around the $1T+ range by 2030, consistent with the claim.',
      corrected_fact: 'Projections vary by source; many estimates place SaaS around $1T+ by 2030.',
      confidence_score: 90,
      evidence_summary:
        'Market research reports converge on high-growth trajectories, with multiple estimates clustering near $1T+ by 2030.',
      source_links: ['https://www.statista.com/', 'https://www.idc.com/'],
    },
    {
      claim: 'We are SOC 2 Type II certified as of March 2025.',
      status: 'FALSE',
      explanation:
        'No public certification evidence is available; SOC 2 Type II claims typically require an attestation report or listing.',
      corrected_fact: 'If certified, provide SOC 2 Type II attestation details (auditor, period, report).',
      confidence_score: 95,
      evidence_summary:
        'Certification verification requires a formal attestation report; none was found in the available context.',
      source_links: ['https://www.aicpa.org/'],
    },
    {
      claim: 'Our ARR grew 3.2x year-over-year in 2024.',
      status: 'INACCURATE',
      explanation:
        'The claim may be true internally, but external corroboration is not available; growth multiples often require audited metrics.',
      corrected_fact: 'ARR growth is not independently verifiable without audited or disclosed financials.',
      confidence_score: 76,
      evidence_summary:
        'No public filings or audited disclosures were found to corroborate the 3.2x ARR figure.',
      source_links: ['https://www.sec.gov/edgar.shtml'],
    },
    {
      claim: 'We operate in 18 countries with 99.95% uptime.',
      status: 'VERIFIED',
      explanation:
        'The uptime target is consistent with typical enterprise SLAs; geographic presence is plausible if supported by customer footprint.',
      corrected_fact: 'Uptime and regional coverage should be backed by SLA documentation and status history.',
      confidence_score: 88,
      evidence_summary:
        'SLA-style uptime values are common; verification is strongest when paired with incident history or a status page.',
      source_links: ['https://www.cloudflarestatus.com/'],
    },
    {
      claim: 'Our AI model is trained on 2 trillion tokens of proprietary data.',
      status: 'FALSE',
      explanation:
        'Training token counts at this scale are uncommon for proprietary datasets and typically require detailed technical disclosure.',
      corrected_fact: 'Provide transparent training data sources and scale; avoid unverifiable token-count marketing claims.',
      confidence_score: 94,
      evidence_summary:
        'No technical documentation supports the stated training scale; similar claims usually include detailed model cards or papers.',
      source_links: ['https://huggingface.co/docs', 'https://arxiv.org/'],
    },
  ],
}

function App() {
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [processingTimeMs, setProcessingTimeMs] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [filter, setFilter] = useState('ALL')
  const [openEvidence, setOpenEvidence] = useState(() => new Set())
  const startedAtRef = useRef(0)
  const abortRef = useRef(null)

  const selectFile = (selectedFile) => {
    if (!selectedFile) return
    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.')
      return
    }
    setError('')
    setFile(selectedFile)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  useEffect(() => {
    if (!isLoading) return
    setElapsedSec(0)
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [isLoading])

  useEffect(() => {
    if (!isLoading) return
    const interval = setInterval(() => {
      setStepIndex((prev) => {
        if (uploadProgress >= 100) {
          return Math.max(prev, 3)
        }
        return Math.min(prev + 1, 2)
      })
    }, 2800)
    return () => clearInterval(interval)
  }, [isLoading, uploadProgress])

  const submitFile = async () => {
    if (!file) return
    setIsLoading(true)
    setError('')
    setResult(null)
      setOpenEvidence(new Set())
    setUploadProgress(0)
    setStepIndex(0)
    setProcessingTimeMs(0)
    setFilter('ALL')
    startedAtRef.current = Date.now()

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const data = await uploadPdfWithProgress({
        url: `${API_BASE_URL}/api/fact-check`,
        file,
        onProgress: setUploadProgress,
        signal: controller.signal,
      })
      setResult(data)
      setOpenEvidence(new Set())
      setStepIndex(4)
      setProcessingTimeMs(Date.now() - startedAtRef.current)
    } catch (requestError) {
      console.error('Fact-check request failed:', requestError)
      setError(requestError?.message || 'Something went wrong. Please retry.')
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }

  const loadSample = () => {
    setError('')
    setFile(null)
    setResult(SAMPLE_REPORT)
    setOpenEvidence(new Set())
    setUploadProgress(0)
    setStepIndex(0)
    startedAtRef.current = Date.now() - 4200
    setProcessingTimeMs(4200)
    setFilter('ALL')
  }

  const clearSelectedFile = () => {
    if (isLoading) return
    setFile(null)
    setError('')
    setUploadProgress(0)
  }

  const filteredResults =
    filter === 'ALL' ? result?.results ?? [] : (result?.results ?? []).filter((r) => r.status === filter)

  const toggleEvidenceRow = (visibleIndex) => {
    setOpenEvidence((prev) => {
      const next = new Set(prev)
      const a = visibleIndex
      const b = visibleIndex % 2 === 0 ? visibleIndex + 1 : visibleIndex - 1
      const shouldOpen = !(next.has(a) && next.has(b))
      if (shouldOpen) {
        next.add(a)
        if (b >= 0 && b < filteredResults.length) next.add(b)
      } else {
        next.delete(a)
        next.delete(b)
      }
      return next
    })
  }

  const counts = {
    ALL: (result?.results ?? []).length,
    VERIFIED: (result?.results ?? []).filter((r) => r.status === 'VERIFIED').length,
    INACCURATE: (result?.results ?? []).filter((r) => r.status === 'INACCURATE').length,
    FALSE: (result?.results ?? []).filter((r) => r.status === 'FALSE').length,
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-indigo-50/30 px-4 py-24 sm:px-15 md:px-16 md:py-26">
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <HeroSection />

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-stretch">
          <div className="h-full">
            <UploadZone
              file={file}
              isDragging={isDragging}
              isLoading={isLoading}
              uploadProgress={uploadProgress}
              error={error}
              onPickFile={selectFile}
              onDrop={handleDrop}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onRun={submitFile}
              onLoadSample={loadSample}
              onClearFile={clearSelectedFile}
            />
          </div>

          <Card className="h-full p-5 md:p-8 shadow-[0_14px_40px_rgba(2,6,23,0.06)] ring-1 ring-slate-200/80 bg-white/90 backdrop-blur-sm">
            <div className="flex h-full flex-col gap-5 pt-1">
              <TrustScore
                results={result?.results ?? []}
                processingTimeMs={processingTimeMs}
                withCard={false}
              />
              <div className="min-h-0 flex-1">
                <SummaryCards
                  results={result?.results ?? []}
                  withCard={false}
                  selectedFilter={filter}
                  onSelectFilter={(key) => setFilter(key)}
                />
              </div>
            </div>
          </Card>
        </div>

        {result?.results?.length ? (
          <section className="space-y-4">
            <div className="rounded-2xl bg-white/70 p-5 ring-1 ring-indigo-50/60 backdrop-blur-md shadow-sm -mt-2">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                    <span className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
                      Trust Report
                    </span>
                  </h2>
                  <p className="mt-1 mb-7 text-[14px] text-slate-600">
                    {result.filename} • {result.total_claims} claims {result.cached ? '• cached' : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ring-1 transition duration-200 ${
                      filter === key
                        ? 'bg-indigo-600 text-white ring-indigo-600 shadow-sm hover:shadow-md hover:scale-[1.01]'
                        : 'bg-white/80 text-slate-700 ring-slate-200 hover:bg-slate-50 hover:-translate-y-0.5'
                    }`}
                  >
                    {key === 'ALL' ? 'All' : key}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                        filter === key ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {counts[key]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {filteredResults.map((item, index) => (
                <ClaimCard
                  key={`${item.claim}-${index}`}
                  item={item}
                  index={index}
                  open={openEvidence.has(index)}
                  onToggleEvidence={() => toggleEvidenceRow(index)}
                />
              ))}
            </div>
          </section>
        ) : result ? (
          <section className="rounded-3xl bg-amber-50/90 p-8 shadow-sm ring-1 ring-amber-200/80 md:p-10">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-amber-900 md:text-3xl">
                No claims to check
              </h2>
              <p className="mt-3 text-sm leading-6 text-amber-950/80">
                {result.filename} finished processing, but no factual claims were extracted (or the PDF has
                very little readable text). Try another document or a PDF with clearer text — not just
                scanned images without OCR.
              </p>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 md:p-10">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-4xl font-semibold text-indigo-600">Welcome!</p>
              <h2 className="mt-5 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
                Upload your first PDF to generate a trust report
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Designed for pitch decks, marketing PDFs, product briefs, and research summaries. We
                focus on verifiable claims and keep evidence concise.
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-200/70">
                  <p className="text-base font-semibold text-slate-900">Step-by-step</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Clear processing stages with smooth transitions.
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-200/70">
                  <p className="text-base font-semibold text-slate-900">Evidence-first</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Source links grouped into clean cards.
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-200/70">
                  <p className="text-base font-semibold text-slate-900">Premium UI</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Modern layout inspired by Linear/Perplexity.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4">
          <div className="w-full max-w-lg">
            <LoadingSteps
              activeIndex={stepIndex}
              elapsedSeconds={elapsedSec}
              uploadDone={uploadProgress >= 100}
            />
          </div>
        </div>
      )}
    </main>
  )
}

export default App
