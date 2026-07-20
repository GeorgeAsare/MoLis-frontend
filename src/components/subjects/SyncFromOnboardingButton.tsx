'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { syncSubjectsFromOnboarding } from '@/app/actions/subjects'

export function SyncFromOnboardingButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSync() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await syncSubjectsFromOnboarding()
      setDone(true)
      // revalidatePath in the server action triggers re-render;
      // router.refresh() ensures the client sees it immediately.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <button
        onClick={handleSync}
        disabled={loading || done}
        className="text-[11px] text-foreground/30 transition-colors hover:text-foreground/60 disabled:opacity-40"
      >
        {loading ? 'Syncing…' : done ? 'Synced' : 'Sync from onboarding'}
      </button>
    </div>
  )
}
