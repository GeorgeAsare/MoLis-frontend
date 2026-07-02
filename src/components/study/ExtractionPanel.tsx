'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveExtractedText } from '@/app/actions/extractText'
import { analyzeDocument } from '@/app/actions/analyzeDocument'

// ── MIME type groups ──────────────────────────────────────────────────────────

const PDF_TYPES = ['application/pdf']
const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]
const TXT_TYPES = ['text/plain', 'text/markdown', 'text/csv']
const SUPPORTED = [...PDF_TYPES, ...DOCX_TYPES, ...TXT_TYPES]

const PREVIEW_LIMIT = 900
const INCOMPLETE_THRESHOLD = 300

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractionResult {
  text: string
  pageCount?: number
}

// Phase covers both extraction and analysis sub-steps in one state machine
type Phase =
  | 'idle'            // no text extracted yet
  | 'extracting'      // reading file client-side
  | 'saving'          // saving text to Supabase
  | 'analyzing'       // running analyzeDocument server action
  | 'done'            // extraction + analysis complete
  | 'extract-error'   // extraction or save failed (text not saved)
  | 'analysis-error'  // text saved but analysis failed (non-fatal)

// ── Client-side extraction ────────────────────────────────────────────────────

async function extractPdfText(url: string): Promise<ExtractionResult> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const pdf = await pdfjs.getDocument({ url }).promise
  const pageCount = pdf.numPages
  const pages: string[] = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = (content.items as Array<{ str?: string; hasEOL?: boolean }>)
      .map((item) => (item.hasEOL ? (item.str ?? '') + '\n' : item.str ?? ''))
      .join('')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
    if (pageText) pages.push(pageText)
  }

  return { text: pages.join('\n\n'), pageCount }
}

async function extractDocxText(url: string): Promise<ExtractionResult> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching document`)
  const buffer = await res.arrayBuffer()
  const { default: mammoth } = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return { text: result.value }
}

async function extractTxtText(url: string): Promise<ExtractionResult> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching document`)
  return { text: await res.text() }
}

async function runExtraction(fileType: string, url: string): Promise<ExtractionResult> {
  if (PDF_TYPES.includes(fileType)) return extractPdfText(url)
  if (DOCX_TYPES.includes(fileType)) return extractDocxText(url)
  if (TXT_TYPES.includes(fileType)) return extractTxtText(url)
  throw new Error('Unsupported file type')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  documentId: string
  fileType: string
  signedUrl: string | null
  initialExtractedText: string | null
  hasAnalysis: boolean
}

export function ExtractionPanel({
  documentId,
  fileType,
  signedUrl,
  initialExtractedText,
  hasAnalysis,
}: Props) {
  const router = useRouter()

  // Derive initial phase from props — stable across SSR + hydration
  const [phase, setPhase] = useState<Phase>(() => {
    if (initialExtractedText !== null) {
      return hasAnalysis ? 'done' : 'analyzing'
    }
    return 'idle'
  })

  const [extractedText, setExtractedText] = useState<string | null>(initialExtractedText)
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const supported = SUPPORTED.includes(fileType)
  const busy = phase === 'extracting' || phase === 'saving' || phase === 'analyzing'

  // Auto-trigger analysis when text exists but analysis is missing (e.g. legacy docs,
  // or first load after the feature was added)
  useEffect(() => {
    if (initialExtractedText && !hasAnalysis) {
      void runAnalysisOnly()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runAnalysisOnly() {
    setPhase('analyzing')
    try {
      await analyzeDocument(documentId)
      setPhase('done')
      router.refresh()
    } catch {
      setPhase('analysis-error')
    }
  }

  async function handleExtract() {
    if (!signedUrl || !supported || busy) return

    setPhase('extracting')
    setErrorMessage(null)
    setShowAll(false)

    let textSaved = false

    try {
      const extracted = await runExtraction(fileType, signedUrl)

      setPhase('saving')
      const saveResult = await saveExtractedText(documentId, extracted.text)
      if (!saveResult.ok) throw new Error(saveResult.error)

      textSaved = true
      setExtractedText(extracted.text)
      if (extracted.pageCount !== undefined) setPdfPageCount(extracted.pageCount)

      setPhase('analyzing')
      await analyzeDocument(documentId)
      setPhase('done')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed'
      setErrorMessage(msg)
      if (textSaved) {
        setPhase('analysis-error')
        router.refresh() // text was saved — refresh so other panels can use it
      } else {
        setPhase('extract-error')
      }
    }
  }

  const wordCount = extractedText
    ? extractedText.trim().split(/\s+/).filter(Boolean).length
    : 0

  const displayText =
    extractedText && !showAll ? extractedText.slice(0, PREVIEW_LIMIT) : extractedText

  const isTruncated = extractedText !== null && extractedText.length > PREVIEW_LIMIT
  const mayBeIncomplete =
    extractedText !== null && extractedText.length < INCOMPLETE_THRESHOLD

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <ExtractIcon className="h-4 w-4 text-foreground/30" />
          <span className="text-sm font-medium text-foreground/70">Text Extraction & Analysis</span>
        </div>
        <StatusBadge phase={phase} />
      </div>

      {/* Body */}
      <div className="p-5">

        {/* ── Idle ────────────────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-foreground/35">
              {supported
                ? 'Extract and analyse your document to enable AI revision notes, flashcards, quizzes, and visual aids.'
                : 'Text extraction is not supported for this file type.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExtract}
                disabled={!supported || !signedUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ExtractIcon className="h-4 w-4" />
                Extract & Analyse
              </button>
              {!supported && (
                <span className="text-xs text-foreground/20">PDF, DOCX, and TXT are supported</span>
              )}
            </div>
          </div>
        )}

        {/* ── Extract error ───────────────────────────────────────────────── */}
        {phase === 'extract-error' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
              <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/70" />
              <p className="text-xs leading-relaxed text-red-400/80">{errorMessage}</p>
            </div>
            <button
              onClick={handleExtract}
              disabled={!signedUrl}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15] disabled:opacity-40"
            >
              <ExtractIcon className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {/* ── Extracting / Saving ─────────────────────────────────────────── */}
        {(phase === 'extracting' || phase === 'saving') && (
          <div className="flex flex-col gap-5">
            <SubStep
              done={false}
              active
              label={phase === 'extracting' ? 'Reading all pages…' : 'Saving extracted text…'}
            />
            <SubStep done={false} active={false} label="Analysing document structure…" dimmed />
            <LoadingLines />
          </div>
        )}

        {/* ── Analysing ───────────────────────────────────────────────────── */}
        {phase === 'analyzing' && (
          <div className="flex flex-col gap-5">
            {/* Show text stats if we have text (re-extract or auto-analyze case) */}
            {extractedText && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5">
                  <span className="text-xs font-medium text-emerald-400">
                    {wordCount.toLocaleString()} words extracted
                  </span>
                </div>
                {pdfPageCount !== null && (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-1.5">
                    <span className="text-xs text-foreground/25">{pdfPageCount} pages</span>
                  </div>
                )}
              </div>
            )}
            <SubStep done={!!extractedText} active={!extractedText} label="Text extracted" />
            <SubStep done={false} active label="Analysing document structure…" />
            <LoadingLines />
          </div>
        )}

        {/* ── Analysis error (text was saved, analysis failed) ────────────── */}
        {phase === 'analysis-error' && extractedText && (
          <div className="flex flex-col gap-4">
            {/* Text stats */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5">
                <span className="text-xs font-medium text-emerald-400">
                  {wordCount.toLocaleString()} words
                </span>
              </div>
              {pdfPageCount !== null && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-1.5">
                  <span className="text-xs text-foreground/25">{pdfPageCount} pages</span>
                </div>
              )}
            </div>
            <SubStep done label="Text extracted" />
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
              <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" />
              <div className="flex flex-col gap-1.5">
                <p className="text-xs leading-relaxed text-amber-400/80">
                  {errorMessage ?? 'Analysis failed.'} Text was saved — you can still generate notes, flashcards, and quizzes.
                </p>
                <button
                  onClick={runAnalysisOnly}
                  className="w-fit text-xs text-amber-400/70 underline underline-offset-2 hover:text-amber-400"
                >
                  Retry analysis
                </button>
              </div>
            </div>
            <TextPreview
              text={extractedText}
              displayText={displayText}
              isTruncated={isTruncated}
              mayBeIncomplete={mayBeIncomplete}
              showAll={showAll}
              onToggleShowAll={() => setShowAll((v) => !v)}
              onReExtract={handleExtract}
              signedUrl={signedUrl}
              busy={busy}
            />
          </div>
        )}

        {/* ── Done ───────────────────────────────────────────────────────── */}
        {phase === 'done' && extractedText && displayText && (
          <div className="flex flex-col gap-4">
            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5">
                <span className="text-xs font-medium text-emerald-400">
                  {wordCount.toLocaleString()} words
                </span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-1.5">
                <span className="text-xs text-foreground/25">
                  {extractedText.length.toLocaleString()} chars
                </span>
              </div>
              {pdfPageCount !== null && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-1.5">
                  <span className="text-xs text-foreground/25">{pdfPageCount} pages</span>
                </div>
              )}
              {mayBeIncomplete && (
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5">
                  <WarningIcon className="h-3.5 w-3.5 text-amber-400/80" />
                  <span className="text-xs text-amber-400/80">Extraction may be incomplete</span>
                </div>
              )}
              <button
                onClick={handleExtract}
                disabled={!signedUrl || busy}
                className="ml-auto text-xs text-foreground/20 underline underline-offset-2 transition-colors hover:text-foreground/40 disabled:pointer-events-none"
              >
                Re-extract
              </button>
            </div>

            {/* Analysis complete badge */}
            <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/[0.05] px-3 py-2">
              <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              <span className="text-xs text-primary/60">
                Document analysed — AI study tools are powered by structured analysis
              </span>
            </div>

            <TextPreview
              text={extractedText}
              displayText={displayText}
              isTruncated={isTruncated}
              mayBeIncomplete={false}
              showAll={showAll}
              onToggleShowAll={() => setShowAll((v) => !v)}
              onReExtract={handleExtract}
              signedUrl={signedUrl}
              busy={busy}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SubStep({
  done = false,
  active = false,
  dimmed = false,
  label,
}: {
  done?: boolean
  active?: boolean
  dimmed?: boolean
  label: string
}) {
  return (
    <div className={`flex items-center gap-2.5 ${dimmed ? 'opacity-30' : ''}`}>
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
        {done ? (
          <CheckIcon className="h-4 w-4 text-emerald-400" />
        ) : active ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-primary/60 border-t-transparent" />
        ) : (
          <span className="h-2 w-2 rounded-full border border-foreground/20" />
        )}
      </div>
      <span
        className={`text-sm ${done ? 'text-foreground/50' : active ? 'text-foreground/60 font-medium' : 'text-foreground/25'}`}
      >
        {label}
      </span>
    </div>
  )
}

function LoadingLines() {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3 opacity-40">
      {[100, 82, 91, 67, 78].map((w, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded-full bg-foreground/[0.08]"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}

interface TextPreviewProps {
  text: string
  displayText: string | null
  isTruncated: boolean
  mayBeIncomplete: boolean
  showAll: boolean
  onToggleShowAll: () => void
  onReExtract: () => void
  signedUrl: string | null
  busy: boolean
}

function TextPreview({
  text,
  displayText,
  isTruncated,
  showAll,
  onToggleShowAll,
}: TextPreviewProps) {
  if (!displayText) return null
  return (
    <>
      <div className="relative max-h-72 overflow-hidden rounded-lg border border-border bg-black/20">
        <div className="overflow-y-auto p-4" style={{ maxHeight: '18rem' }}>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/50">
            {displayText}
            {!showAll && isTruncated && '…'}
          </pre>
        </div>
      </div>
      {isTruncated && (
        <button
          onClick={onToggleShowAll}
          className="self-start text-xs text-foreground/25 underline underline-offset-2 transition-colors hover:text-foreground/45"
        >
          {showAll ? 'Show less' : `Show all (${text.length.toLocaleString()} chars)`}
        </button>
      )}
    </>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ phase }: { phase: Phase }) {
  switch (phase) {
    case 'done':
      return (
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          Complete
        </span>
      )
    case 'extracting':
    case 'saving':
      return (
        <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Extracting
        </span>
      )
    case 'analyzing':
      return (
        <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Analysing
        </span>
      )
    case 'extract-error':
      return (
        <span className="rounded-full border border-red-500/20 bg-red-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-red-400">
          Failed
        </span>
      )
    case 'analysis-error':
      return (
        <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
          Analysis Failed
        </span>
      )
    default:
      return (
        <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-foreground/25">
          Not extracted
        </span>
      )
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ExtractIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}
