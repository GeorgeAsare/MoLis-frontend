'use client'

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Skeleton } from '@/components/ui/Skeleton'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Worker runs only in the browser since this component is loaded with ssr:false
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface Props {
  url: string
}

export function PdfViewer({ url }: Props) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loadError, setLoadError] = useState(false)
  const [isDocLoading, setIsDocLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function onLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setIsDocLoading(false)
  }

  function onLoadError() {
    setLoadError(true)
    setIsDocLoading(false)
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-red-400/70">Failed to load PDF.</p>
        <p className="mt-1 text-xs text-white/20">The file may be corrupted or inaccessible.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-4 px-4 py-6">
      {isDocLoading && (
        <div className="flex w-full flex-col items-center gap-3">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="aspect-[8.5/11] w-full rounded-lg" />
        </div>
      )}

      <Document
        file={url}
        onLoadSuccess={onLoadSuccess}
        onLoadError={onLoadError}
        loading={null}
        className="w-full"
      >
        {!isDocLoading && containerWidth > 0 && (
          <Page
            pageNumber={pageNumber}
            width={containerWidth}
            renderTextLayer
            renderAnnotationLayer
            className="rounded-lg overflow-hidden shadow-2xl shadow-black/50"
          />
        )}
      </Document>

      {numPages && numPages > 1 && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="min-w-[80px] text-center text-xs text-white/40">
            Page {pageNumber} of {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {numPages === 1 && (
        <p className="text-xs text-white/20">{numPages} page</p>
      )}
      {numPages && numPages > 1 && (
        <p className="text-xs text-white/20">{numPages} pages total</p>
      )}
    </div>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}
