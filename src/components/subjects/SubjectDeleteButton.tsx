'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSubject } from '@/app/actions/subjects'

interface Props {
  subjectId: string
  subjectName: string
}

export function SubjectDeleteButton({ subjectId, subjectName }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')
    try {
      await deleteSubject(subjectId)
      router.replace('/dashboard/subjects')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {error && <span className="text-xs text-red-400">{error}</span>}
        <span className="text-xs text-foreground/40">Delete &ldquo;{subjectName}&rdquo;?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/[0.14] disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-xs text-foreground/35 hover:text-foreground/60 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs text-foreground/35 transition-colors hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-400 shrink-0"
    >
      Delete subject
    </button>
  )
}
