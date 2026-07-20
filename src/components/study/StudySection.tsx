'use client'

import { useState, useEffect, useCallback } from 'react'
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
    // Optimistic update — remove from local state immediately
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <StudyUploadForm subjects={subjects} onUploadSuccess={loadDocuments} />
      <DocumentList
        documents={documents}
        loading={loading}
        error={error}
        onRetry={loadDocuments}
        onDocumentDeleted={handleDocumentDeleted}
      />
    </div>
  )
}
