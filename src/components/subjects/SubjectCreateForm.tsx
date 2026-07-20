'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSubject } from '@/app/actions/subjects'

export function SubjectCreateForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      await createSubject(name)
      setName('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subject.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2.5">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="New subject name…"
          maxLength={120}
          className="flex-1 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
        />
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </form>
  )
}
