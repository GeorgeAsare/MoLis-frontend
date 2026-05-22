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
}

// Maps MIME types to short display labels
function fileTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'text/plain': 'Text',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  }
  return map[mimeType] ?? (mimeType.split('/')[1]?.toUpperCase() || 'File')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function DocumentList({
  documents,
  loading,
  error,
  onRetry,
  onDocumentDeleted,
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

  return (
    <div className="border-t border-white/[0.06] pt-6">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/20">
        Your documents
      </p>

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-28 rounded-full" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Fetch error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/10 bg-red-500/[0.04] py-8 text-center">
          <p className="text-sm text-red-400/70">{error}</p>
          <button
            onClick={onRetry}
            className="mt-3 text-xs text-white/30 underline underline-offset-2 hover:text-white/50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] py-10 text-center">
          <DocumentsIcon className="mb-3 h-8 w-8 text-white/10" />
          <p className="text-sm text-white/30">No documents uploaded yet</p>
          <p className="mt-1 text-xs text-white/20">Uploaded files will appear here</p>
        </div>
      )}

      {/* Document rows */}
      {!loading && !error && documents.length > 0 && (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/dashboard/study/${doc.id}`}
              className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 transition-colors hover:border-violet-500/20 hover:bg-white/[0.04]"
            >
              {/* File icon */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
                <FileIcon className="h-4 w-4 text-violet-400" />
              </div>

              {/* Title + meta */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm font-medium text-white/80">{doc.title}</p>
                <p className="text-xs text-white/30">
                  {fileTypeLabel(doc.file_type)} · {formatDate(doc.created_at)}
                </p>
              </div>

              {/* Status badge */}
              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                Uploaded
              </span>

              {/* Delete button — stops propagation so click doesn't navigate */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(doc) }}
                disabled={deletingId !== null}
                aria-label={`Delete ${doc.title}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/15 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
              >
                {deletingId === doc.id ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                ) : (
                  <TrashIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </Link>
          ))}

          {/* Inline delete error */}
          {deleteError && (
            <p className="mt-1 text-xs text-red-400/70">{deleteError}</p>
          )}
        </div>
      )}
    </div>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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

function DocumentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  )
}
