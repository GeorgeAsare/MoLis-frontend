'use client'

import { useState } from 'react'
import { saveExtractedText } from '@/app/actions/extractText'

// ── MIME type groups ──────────────────────────────────────────────────────────

const PDF_TYPES = ['application/pdf']
const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]
const TXT_TYPES = ['text/plain', 'text/markdown', 'text/csv']

const SUPPORTED = [...PDF_TYPES, ...DOCX_TYPES, ...TXT_TYPES]

// ── Client-side text extraction ───────────────────────────────────────────────
// Runs in the browser so pdfjs worker and mammoth load normally.

async function extractPdfText(url: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist')

  // Reuse the same worker URL pattern that PdfViewer sets up
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const pdf = await pdfjs.getDocument({ url }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = (content.items as Array<{ str?: string }>)
      .map((item) => item.str ?? '')
      .join(' ')
    if (pageText.trim()) pages.push(pageText.trim())
  }

  return pages.join('\n\n')
}

async function extractDocxText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buffer = await res.arrayBuffer()
  const { default: mammoth } = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

async function extractTxtText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function runExtraction(fileType: string, url: string): Promise<string> {
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
}

type Phase = 'idle' | 'extracting' | 'saving' | 'done' | 'error'

const PREVIEW_LIMIT = 900

export function ExtractionPanel({
  documentId,
  fileType,
  signedUrl,
  initialExtractedText,
}: Props) {
  const [phase, setPhase] = useState<Phase>(
    initialExtractedText !== null ? 'done' : 'idle',
  )
  const [extractedText, setExtractedText] = useState<string | null>(
    initialExtractedText,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const supported = SUPPORTED.includes(fileType)
  const busy = phase === 'extracting' || phase === 'saving'

  async function handleExtract() {
    if (!signedUrl || !supported || busy) return

    setPhase('extracting')
    setErrorMessage(null)

    try {
      const text = await runExtraction(fileType, signedUrl)

      setPhase('saving')
      await saveExtractedText(documentId, text)

      setExtractedText(text)
      setPhase('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Extraction failed')
      setPhase('error')
    }
  }

  const wordCount = extractedText
    ? extractedText.trim().split(/\s+/).filter(Boolean).length
    : 0

  const displayText =
    extractedText && !showAll
      ? extractedText.slice(0, PREVIEW_LIMIT)
      : extractedText

  const isTruncated =
    extractedText !== null && extractedText.length > PREVIEW_LIMIT

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025]">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <ExtractIcon className="h-4 w-4 text-white/30" />
          <span className="text-sm font-medium text-white/70">Text Extraction</span>
        </div>
        <StatusBadge phase={phase} />
      </div>

      {/* Body */}
      <div className="p-5">

        {/* ── Idle / Error state ─────────────────────────────────── */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-white/35">
              {supported
                ? 'Extract the readable text to enable AI revision notes, quizzes, and document chat.'
                : 'Text extraction is not supported for this file type.'}
            </p>

            {phase === 'error' && errorMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
                <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/70" />
                <p className="text-xs leading-relaxed text-red-400/80">{errorMessage}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleExtract}
                disabled={!supported || !signedUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ExtractIcon className="h-4 w-4" />
                {phase === 'error' ? 'Try Again' : 'Extract Text'}
              </button>
              {!supported && (
                <span className="text-xs text-white/20">
                  PDF, DOCX, and TXT are supported
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Extracting / Saving state ──────────────────────────── */}
        {(phase === 'extracting' || phase === 'saving') && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 py-2">
              <span className="h-4 w-4 animate-spin rounded-full border border-violet-400/50 border-t-transparent" />
              <span className="text-sm text-white/40">
                {phase === 'extracting' ? 'Reading document…' : 'Saving extracted text…'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 opacity-40">
              {[100, 82, 91, 67, 78].map((w, i) => (
                <div
                  key={i}
                  className="h-3 animate-pulse rounded-full bg-white/[0.08]"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Done state ────────────────────────────────────────── */}
        {phase === 'done' && extractedText && displayText && (
          <div className="flex flex-col gap-4">

            {/* Stats row */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5">
                <span className="text-xs font-medium text-emerald-400">
                  {wordCount.toLocaleString()} words
                </span>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                <span className="text-xs text-white/25">
                  {extractedText.length.toLocaleString()} chars
                </span>
              </div>
              <button
                onClick={handleExtract}
                disabled={!signedUrl || busy}
                className="ml-auto text-xs text-white/20 underline underline-offset-2 transition-colors hover:text-white/40 disabled:pointer-events-none"
              >
                Re-extract
              </button>
            </div>

            {/* Text preview */}
            <div className="relative max-h-72 overflow-hidden rounded-lg border border-white/[0.06] bg-black/20">
              <div className="overflow-y-auto p-4" style={{ maxHeight: '18rem' }}>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-white/50">
                  {displayText}
                  {!showAll && isTruncated && '…'}
                </pre>
              </div>
            </div>

            {/* Show more/less */}
            {isTruncated && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="self-start text-xs text-white/25 underline underline-offset-2 transition-colors hover:text-white/45"
              >
                {showAll
                  ? 'Show less'
                  : `Show all (${extractedText.length.toLocaleString()} chars)`}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ phase }: { phase: Phase }) {
  switch (phase) {
    case 'done':
      return (
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          Extracted
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
    case 'error':
      return (
        <span className="rounded-full border border-red-500/20 bg-red-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-red-400">
          Failed
        </span>
      )
    default:
      return (
        <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-white/25">
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
