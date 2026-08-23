'use client'

import { useState } from 'react'
import Link from 'next/link'
import { deleteDocument } from '@/lib/supabase/documents'
import { Skeleton } from '@/components/ui/Skeleton'
import type { StudyDocument } from '@/types/document'

interface Props {
  documents: StudyDocument[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onDocumentDeleted: (id: string) => void
  onAddMaterial?: () => void
}

function isLectureRecording(doc: StudyDocument): boolean {
  return doc.file_type === 'transcript' || doc.source_type === 'recording'
}

function fileTypeLabel(doc: StudyDocument): string {
  if (isLectureRecording(doc)) return 'Lecture recording'
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'text/plain': 'Text',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  }
  return map[doc.file_type] ?? (doc.file_type.split('/')[1]?.toUpperCase() || 'File')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export function DocumentList({
  documents,
  loading,
  error,
  onRetry,
  onDocumentDeleted,
  onAddMaterial,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(doc: StudyDocument) {
    setDeletingId(doc.id)
    setDeleteError(null)
    try {
      await deleteDocument(doc.id, doc.file_path)
      onDocumentDeleted(doc.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-border/55 bg-card px-4 py-3.5"
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/10 bg-red-500/[0.04] py-10 text-center">
        <p className="text-[13px] text-red-400/70">{error}</p>
        <button
          onClick={onRetry}
          className="mt-3 text-[12px] text-foreground/30 underline underline-offset-2 transition-colors hover:text-foreground/55"
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-foreground/[0.07] bg-muted/15 py-14 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-foreground/[0.07] bg-muted/40">
          <LibraryIcon className="h-6 w-6 text-foreground/14" />
        </div>
        <p className="text-[14px] font-semibold text-foreground/35">Your library is empty</p>
        <p className="mt-1.5 max-w-[22rem] text-[12px] leading-relaxed text-foreground/25">
          Upload lecture notes, slides, or readings. MoLis turns them into a full study workspace.
        </p>
        {onAddMaterial && (
          <button
            onClick={onAddMaterial}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-primary/28 bg-primary/[0.07] px-4 py-2 text-[13px] font-semibold text-primary transition-colors hover:border-primary/42 hover:bg-primary/[0.11]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add your first source
          </button>
        )}
      </div>
    )
  }

  // ── Source object cards ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2.5">
      {documents.map((doc) => {
        const recording = isLectureRecording(doc)
        const typeLabel = fileTypeLabel(doc)
        const processed = !!doc.extracted_text

        return (
          <Link
            key={doc.id}
            href={`/dashboard/study/${doc.id}`}
            className="group relative flex items-center gap-4 rounded-2xl border border-border/55 bg-card px-4 py-3.5 shadow-[var(--shadow-xs)] transition-all duration-150 hover:-translate-y-px hover:border-foreground/10 hover:shadow-[var(--shadow-sm)]"
          >
            {/* Source type icon */}
            <div
              className={[
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
                recording
                  ? 'border-primary/20 bg-primary/[0.08]'
                  : 'border-foreground/[0.07] bg-muted/45',
              ].join(' ')}
            >
              {recording
                ? <MicIcon className="h-4 w-4 text-primary/65" />
                : <FileIcon className="h-4 w-4 text-foreground/28" />
              }
            </div>

            {/* Title + meta */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-[14px] font-semibold text-foreground/78 transition-colors group-hover:text-foreground/95">
                {doc.title}
              </p>
              <p className="text-[11px] text-foreground/32">
                {typeLabel} · {formatDate(doc.created_at)}
              </p>
            </div>

            {/* State + delete */}
            <div className="flex shrink-0 items-center gap-2">
              {processed && (
                <span className="rounded-full border border-foreground/[0.07] bg-muted/45 px-2 py-0.5 text-[10px] font-medium text-foreground/30">
                  Ready
                </span>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDelete(doc)
                }}
                disabled={deletingId !== null}
                aria-label={`Delete ${doc.title}`}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground/15 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
              >
                {deletingId === doc.id ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                ) : (
                  <TrashIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </Link>
        )
      })}

      {deleteError && (
        <p className="mt-1 text-[11px] text-red-400/70">{deleteError}</p>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}
