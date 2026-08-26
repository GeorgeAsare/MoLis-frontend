'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { fetchDocuments } from '@/lib/supabase/documents'
import { StudyUploadForm } from '@/components/study/StudyUploadForm'
import { DocumentList } from '@/components/study/DocumentList'
import type { StudyDocument } from '@/types/document'
import type { Subject } from '@/types/subject'

interface Props {
  userId: string
  subjects?: Subject[]
}

export function StudySection({ userId, subjects = [] }: Props) {
  const [documents, setDocuments] = useState<StudyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const docs = await fetchDocuments(userId)
      setDocuments(docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocuments()
  }, [loadDocuments])

  function handleDocumentDeleted(id: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  async function handleUploadSuccess() {
    setShowUpload(false)
    await loadDocuments()
  }

  const sourceCount = !loading ? documents.length : null

  return (
    <div className="flex flex-col gap-7">

      {/* Library header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/22">MoLis</p>
          <h1 className="mt-1 text-[1.4rem] font-bold tracking-[-0.03em] text-foreground/88">
            Learning Library
          </h1>
          <p className="mt-1 text-[13px] text-foreground/40">
            {sourceCount != null && sourceCount > 0
              ? `${sourceCount} source${sourceCount !== 1 ? 's' : ''}`
              : 'Your study sources, all in one place'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Link
            href="/dashboard/agents/recorder"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-1.5 text-[12px] font-medium text-foreground/50 shadow-[var(--shadow-xs)] transition-all duration-150 hover:border-foreground/14 hover:text-foreground/72 hover:shadow-[var(--shadow-sm)]"
          >
            <MicIcon className="h-3.5 w-3.5" />
            Record lecture
          </Link>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className={[
              'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium shadow-[var(--shadow-xs)] transition-all duration-150',
              showUpload
                ? 'border-primary/25 bg-primary/[0.08] text-primary'
                : 'border-border/60 bg-card text-foreground/50 hover:border-foreground/14 hover:text-foreground/72 hover:shadow-[var(--shadow-sm)]',
            ].join(' ')}
          >
            {showUpload
              ? <XIcon className="h-3.5 w-3.5" />
              : <PlusIcon className="h-3.5 w-3.5" />
            }
            {showUpload ? 'Cancel' : 'Add material'}
          </button>
        </div>
      </div>

      {/* Upload form — collapsible panel */}
      {showUpload && (
        <div className="overflow-hidden rounded-2xl border border-border/55 bg-card/70 shadow-[var(--shadow-sm)]">
          <div className="border-b border-border/30 px-5 py-3">
            <p className="text-[12px] font-semibold text-foreground/55">Add a study source</p>
          </div>
          <div className="p-5">
            <StudyUploadForm subjects={subjects} onUploadSuccess={handleUploadSuccess} />
          </div>
        </div>
      )}

      {/* Source library */}
      <DocumentList
        documents={documents}
        loading={loading}
        error={error}
        onRetry={loadDocuments}
        onDocumentDeleted={handleDocumentDeleted}
        onAddMaterial={() => setShowUpload(true)}
      />
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  )
}
