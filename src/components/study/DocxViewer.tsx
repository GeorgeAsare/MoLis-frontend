'use client'

import { useEffect, useState } from 'react'
import mammoth from 'mammoth'
import { Skeleton } from '@/components/ui/Skeleton'

interface Props {
  url: string
}

export function DocxViewer({ url }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = await res.arrayBuffer()
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
        if (cancelled) return

        // Sanitize server-side: DOMPurify only runs in browser (import inside effect)
        const { default: DOMPurify } = await import('dompurify')
        const clean = DOMPurify.sanitize(result.value, {
          ALLOWED_TAGS: [
            'p','h1','h2','h3','h4','h5','h6',
            'strong','em','u','s','del','ins',
            'ul','ol','li',
            'table','thead','tbody','tr','th','td',
            'br','hr','blockquote','pre','code',
            'a','span','div',
          ],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        })
        setHtml(clean)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [url])

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-6 py-6">
        {[100, 80, 90, 60, 75, 85, 50].map((w, i) => (
          <Skeleton key={i} className="h-4 rounded-full" style={{ width: `${w}%` }} />
        ))}
        <div className="mt-2 flex flex-col gap-2">
          {[70, 90, 65].map((w, i) => (
            <Skeleton key={i} className="h-4 rounded-full" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm text-red-400/70">Failed to extract document content.</p>
        <p className="mt-1 text-xs text-white/20">{error}</p>
      </div>
    )
  }

  if (!html || html.trim() === '') {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm text-white/30">No readable text found in this document.</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-6">
      <div
        className="docx-content max-w-none text-white/75 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
