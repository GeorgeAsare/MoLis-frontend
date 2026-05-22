'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

// Load browser-only viewers without SSR
const PdfViewer = dynamic(
  () => import('./PdfViewer').then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => <PreviewSkeleton />,
  }
)

const DocxViewer = dynamic(
  () => import('./DocxViewer').then((m) => m.DocxViewer),
  {
    ssr: false,
    loading: () => <DocxSkeleton />,
  }
)

interface Props {
  fileType: string
  signedUrl: string
  title: string
}

const PDF_TYPES = ['application/pdf']
const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]
const TXT_TYPES = ['text/plain', 'text/markdown', 'text/csv']

function resolveViewer(fileType: string): 'pdf' | 'docx' | 'txt' | 'unsupported' {
  if (PDF_TYPES.includes(fileType)) return 'pdf'
  if (DOCX_TYPES.includes(fileType)) return 'docx'
  if (TXT_TYPES.includes(fileType)) return 'txt'
  return 'unsupported'
}

export function DocumentPreview({ fileType, signedUrl, title }: Props) {
  const viewer = resolveViewer(fileType)

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <FileIcon className="h-4 w-4 text-white/30" />
          <span className="text-sm font-medium text-white/70">Document Preview</span>
          {viewer !== 'unsupported' && (
            <span className="ml-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-white/40 transition-colors hover:border-white/[0.12] hover:text-white/65"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            Open
          </a>
          <DownloadButton url={signedUrl} filename={title} />
        </div>
      </div>

      {/* Viewer */}
      <div className="min-h-[320px]">
        {viewer === 'pdf' && <PdfViewer url={signedUrl} />}
        {viewer === 'docx' && <DocxViewer url={signedUrl} />}
        {viewer === 'txt' && <TxtViewer url={signedUrl} />}
        {viewer === 'unsupported' && <UnsupportedView fileType={fileType} />}
      </div>
    </div>
  )
}

// ── TxtViewer (lightweight enough to inline) ─────────────────────────────────

function TxtViewer({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((t) => { if (!cancelled) setText(t) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url])

  if (loading) return <DocxSkeleton />
  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-red-400/70">{error}</p>
    </div>
  )

  return (
    <div className="overflow-x-auto px-8 py-6">
      <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-white/65">
        {text}
      </pre>
    </div>
  )
}

// ── Unsupported ──────────────────────────────────────────────────────────────

function UnsupportedView({ fileType }: { fileType: string }) {
  const ext = fileType.split('/')[1]?.toUpperCase() || 'this file type'
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <BlockIcon className="h-6 w-6 text-white/20" />
      </div>
      <p className="text-sm font-medium text-white/40">Preview not available</p>
      <p className="mt-1 text-xs text-white/20">
        In-browser preview is not supported for {ext} files.
      </p>
      <p className="mt-3 text-xs text-white/15">
        Use the Download or Open buttons above to view this file.
      </p>
    </div>
  )
}

// ── DownloadButton ────────────────────────────────────────────────────────────

function DownloadButton({ url, filename }: { url: string; filename: string }) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Fall back to direct link
      window.open(url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-white/40 transition-colors hover:border-white/[0.12] hover:text-white/65 disabled:opacity-50"
    >
      {downloading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
      ) : (
        <DownloadIcon className="h-3.5 w-3.5" />
      )}
      Download
    </button>
  )
}

// ── Loading skeletons ─────────────────────────────────────────────────────────

function PreviewSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      <Skeleton className="h-6 w-32 rounded-full" />
      <Skeleton className="aspect-[8.5/11] w-full rounded-lg" />
    </div>
  )
}

function DocxSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-8 py-6">
      {[100, 80, 90, 60, 75, 85, 50, 95, 70].map((w, i) => (
        <Skeleton key={i} className="h-4 rounded-full" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

// ── React imports needed for inline components ────────────────────────────────
import { useState, useEffect } from 'react'

// ── Icons ─────────────────────────────────────────────────────────────────────

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

function BlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  )
}
