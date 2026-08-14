'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getActiveJobForDocument } from '@/app/actions/generationJobs'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePendingRequestKey, clearPendingRequestKey, setPendingRequestKey } from '@/lib/jobs/pendingJobKey'
import { Skeleton } from '@/components/ui/Skeleton'
import type { PublicVisualSet, PublicVisualItem } from '@/types/studyVisual'
import type { JobSafeDto } from '@/lib/jobs/stateMachine'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { TutorMode } from '@/types/tutor'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'           // no visuals, no active job
  | 'checking'       // on mount, fetching active job status
  | 'queued'         // job created, not yet started
  | 'processing'     // actively generating
  | 'cancel_requested' // cancellation pending, worker acknowledging
  | 'completed'      // visuals available
  | 'failed'         // job failed — show error + regenerate button
  | 'cancelled'      // cancelled — show regenerate button
  | 'retry_required' // 503 enqueue race — preserve key, show retry button

// D13 polling: jittered exponential backoff (server-authoritative, one-in-flight).
// Steps: 2/5/10/30s. Each step adds up to 500ms of random jitter.
const D13_BACKOFF_STEPS_MS = [2_000, 5_000, 10_000, 30_000] as const
const D13_JITTER_MS = 500

function d13Delay(step: number): number {
  const base = D13_BACKOFF_STEPS_MS[Math.min(step, D13_BACKOFF_STEPS_MS.length - 1)]
  return base + Math.random() * D13_JITTER_MS
}

interface Props {
  documentId: string
  hasExtractedText: boolean
  initialVisuals: PublicVisualSet | null
  analysis?: DocumentAnalysis | null
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}

// ── VisualsPanel ──────────────────────────────────────────────────────────────

export function VisualsPanel({ documentId, hasExtractedText, initialVisuals, onAskTutor }: Props) {
  // Completed visuals fetched from DB (initially from server props, refreshed after job completes)
  const [visuals, setVisuals] = useState<PublicVisualSet | null>(initialVisuals)
  const [phase, setPhase] = useState<Phase>(initialVisuals ? 'completed' : 'checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const pollRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollStepRef   = useRef(0)
  const pollInFlight  = useRef(false)
  // R7-H08: initialize from actual browser state so polling is correctly paused if the tab
  // is already hidden or the device is already offline at the moment the component mounts.
  const isHiddenRef   = useRef(typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false)
  const isOfflineRef  = useRef(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const pollJobIdRef  = useRef<string | null>(null)
  const abortCtrlRef  = useRef<AbortController | null>(null)
  // Ref to the current pollJobStatus function — avoids a self-referential useCallback.
  const pollFnRef     = useRef<((id: string) => Promise<void>) | null>(null)
  // R9-H07: Generation token — a monotonically incrementing counter that changes each time
  // startPolling() is called. Responses are discarded if their captured generation token
  // no longer matches the current one, preventing stale in-flight responses from a previous
  // document or polling session from updating state after a new poll generation has started.
  const generationRef = useRef(0)

  // Resolve userId once on mount for idempotency key scoping.
  // getSession() reads from local storage — no network request.
  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null)
    })
  }, [])

  function stopPolling() {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
    // R7-H08: abort any in-flight status request so it does not deliver a stale result
    // after polling has been cancelled (e.g., on job completion, cancel, or unmount).
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort()
      abortCtrlRef.current = null
    }
    pollInFlight.current = false
    pollStepRef.current  = 0
    pollJobIdRef.current = null
  }

  function resumePollingIfActive() {
    if (isHiddenRef.current || isOfflineRef.current) return
    if (!pollJobIdRef.current || pollInFlight.current) return
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = setTimeout(() => pollFnRef.current?.(pollJobIdRef.current!), 0)
  }

  // Fetch visuals with signed URLs from the server-side endpoint.
  // The study-visuals bucket is private; direct Supabase client reads return storage_path
  // but no displayable URL. The server-side endpoint resolves signed URLs (5-min expiry)
  // for each generated item after verifying ownership.
  const refreshVisuals = useCallback(async () => {
    try {
      const res = await fetch(`/api/visuals/${documentId}`)
      if (!res.ok) return
      const data = (await res.json()) as PublicVisualSet
      setVisuals(data)
    } catch {
      // Network error — keep existing visuals, don't crash
    }
  }, [documentId])

  // D13: poll job status with jittered exponential backoff (one-in-flight, pause when hidden/offline).
  const pollJobStatus = useCallback(async (id: string) => {
    if (pollInFlight.current) return
    if (isHiddenRef.current || isOfflineRef.current) {
      // Paused (tab hidden or offline) — reschedule without incrementing step.
      pollRef.current = setTimeout(() => pollFnRef.current?.(id), d13Delay(pollStepRef.current))
      return
    }

    // R9-H07: capture the generation token at poll-start. If stopPolling() is called and
    // startPolling() starts a new polling generation before this response returns, the
    // stale response is discarded rather than updating state for a different document/job.
    const myGeneration = generationRef.current

    pollInFlight.current = true
    // R7-H08: each poll creates its own AbortController so stopPolling() can cancel the
    // in-flight fetch (e.g., on unmount, job completion, or cancelled state).
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl
    try {
      const res = await fetch(`/api/jobs/status/${id}`, { signal: ctrl.signal })

      // Discard stale response from a previous polling generation (e.g., previous document).
      if (generationRef.current !== myGeneration) return

      if (!res.ok) {
        stopPolling()
        setPhase('failed')
        setErrorMessage('Job status could not be retrieved.')
        return
      }
      const job = (await res.json()) as JobSafeDto

      // Guard again after await (generation may have changed while parsing).
      if (generationRef.current !== myGeneration) return

      if (job.status === 'queued') {
        setPhase('queued')
      } else if (job.status === 'processing' || job.status === 'cancel_requested') {
        setPhase(job.status === 'cancel_requested' ? 'cancel_requested' : 'processing')
      } else if (job.status === 'completed') {
        stopPolling()
        await refreshVisuals()
        if (generationRef.current === myGeneration) setPhase('completed')
        return
      } else if (job.status === 'failed') {
        stopPolling()
        setPhase('failed')
        setErrorMessage(job.public_message_key ?? 'Visual generation failed. Please try again.')
        return
      } else if (job.status === 'cancelled') {
        stopPolling()
        setPhase('cancelled')
        return
      }

      // Still active — schedule next poll with advanced backoff step.
      pollStepRef.current = Math.min(pollStepRef.current + 1, D13_BACKOFF_STEPS_MS.length - 1)
      if (pollJobIdRef.current === id && generationRef.current === myGeneration) {
        pollRef.current = setTimeout(() => pollFnRef.current?.(id), d13Delay(pollStepRef.current))
      }
    } catch (err) {
      // Aborted intentionally (stopPolling called) — do not reschedule.
      if (err instanceof Error && err.name === 'AbortError') return
      // Network error — reschedule with same step (transient), but only if still current.
      if (pollJobIdRef.current === id && generationRef.current === myGeneration) {
        pollRef.current = setTimeout(() => pollFnRef.current?.(id), d13Delay(pollStepRef.current))
      }
    } finally {
      pollInFlight.current = false
    }
  }, [refreshVisuals])

  // Keep pollFnRef current so the setTimeout closures above always call the latest version.
  useEffect(() => {
    pollFnRef.current = pollJobStatus
  }, [pollJobStatus])

  function startPolling(id: string) {
    stopPolling()
    generationRef.current += 1
    pollJobIdRef.current = id
    pollStepRef.current  = 0
    // First poll immediately, then follow backoff schedule.
    pollRef.current = setTimeout(() => void pollJobStatus(id), d13Delay(0))
  }

  // When SSR provided initialVisuals, image_url is null (private bucket).
  // Fetch signed URLs once on mount so images display immediately.
  useEffect(() => {
    if (!initialVisuals) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshVisuals()
  // refreshVisuals is stable (useCallback with [documentId])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On mount: check for any active job, or skip to idle/completed.
  useEffect(() => {
    if (initialVisuals) return

    let cancelled = false
    void getActiveJobForDocument(documentId, 'visuals').then(job => {
      if (cancelled) return
      if (!job) {
        setPhase('idle')
        return
      }

      setJobId(job.id)

      if (job.status === 'queued' || job.status === 'processing' || job.status === 'cancel_requested') {
        setPhase(job.status)
        startPolling(job.id)
      } else if (job.status === 'completed') {
        // Job completed but visuals not in SSR — fetch them
        void refreshVisuals().then(() => setPhase('completed'))
      } else {
        setPhase('idle')
      }
    })

    return () => {
      cancelled = true
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  // Cleanup polling on unmount
  useEffect(() => () => stopPolling(), [])

  // D13: pause polling when tab is hidden or offline; resume when visible/online.
  // R7-H08: refs are initialized above from actual browser state at declaration time.
  // This effect syncs them again on mount (in case SSR defaulted to false) and registers
  // future event listeners. Becoming visible while still offline stays paused; coming
  // online while hidden stays paused.
  useEffect(() => {
    // Re-sync on mount in case the ref was initialized before the browser APIs were ready.
    isHiddenRef.current = document.visibilityState === 'hidden'
    isOfflineRef.current = !navigator.onLine

    function handleVisibility() {
      isHiddenRef.current = document.visibilityState === 'hidden'
      if (!isHiddenRef.current) resumePollingIfActive()
    }
    function handleOffline() {
      isOfflineRef.current = true
    }
    function handleOnline() {
      isOfflineRef.current = false
      resumePollingIfActive()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online',  handleOnline)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
    }
  }, [])

  async function handleGenerate() {
    if (phase === 'queued' || phase === 'processing') return
    setPhase('queued')
    setErrorMessage(null)

    // Generate (or retrieve the pending) request key BEFORE the first network request.
    // Scoped to (user, document, jobType) in sessionStorage so the same UUID survives
    // network retries, duplicate-click submissions, and temporary refresh recovery.
    // Falls back to a non-persisted UUID if the session is not available.
    const requestKey = userId
      ? getOrCreatePendingRequestKey(userId, documentId, 'visuals')
      : crypto.randomUUID()

    try {
      const res = await fetch('/api/jobs/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, requestKey }),
      })

      if (res.status === 503) {
        // Enqueue race unresolved after one server retry — key preserved in sessionStorage.
        // Retry button calls handleGenerate (NOT handleRegenerate) so the same key is reused.
        const body = (await res.json()) as { code?: string }
        if (body.code === 'JOB_ENQUEUE_RETRY_REQUIRED') {
          setPhase('retry_required')
          setErrorMessage('Generation slot is momentarily busy. Please try again in a few seconds.')
          return
        }
        throw new Error(`Request failed (HTTP 503)`)
      }

      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `Request failed (HTTP ${res.status})`)
      }

      const { jobId: newJobId, requestKey: returnedKey } = (await res.json()) as {
        jobId: string
        requestKey?: string
      }
      setJobId(newJobId)
      startPolling(newJobId)

      // Sync sessionStorage with the server-confirmed key.
      // In normal flow this is a no-op (returned key == sent key).
      // If the server regenerated the key (e.g., client sent an invalid UUID),
      // overwrite sessionStorage so future retries use the correct key.
      if (returnedKey && userId && returnedKey !== requestKey) {
        setPendingRequestKey(userId, documentId, 'visuals', returnedKey)
      }
      // Key is intentionally left in sessionStorage for retry resilience.
      // Cleared only on explicit regeneration (handleRegenerate).
    } catch (err) {
      setPhase('failed')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start generation')
      // Key preserved on failure — reused on next retry.
    }
  }

  // Intentional regeneration: clear the stored key so a new job is created
  // rather than the server returning the existing terminal job.
  async function handleRegenerate() {
    if (userId) clearPendingRequestKey(userId, documentId, 'visuals')
    await handleGenerate()
  }

  const isActive = phase === 'queued' || phase === 'processing' || phase === 'cancel_requested'
  const canRetry = phase === 'failed' || phase === 'cancelled'

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground/75">Visual Learning</h3>
          <p className="mt-0.5 text-xs text-foreground/30">
            AI-generated educational diagrams from your document
          </p>
        </div>
        {phase === 'completed' && visuals && visuals.visuals.length > 0 && (
          <button
            onClick={() => void handleRegenerate()}
            disabled={isActive}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground/35 transition-colors hover:border-border hover:text-foreground/55 disabled:opacity-40"
          >
            <RegenerateIcon className="h-3 w-3" />
            Regenerate
          </button>
        )}
      </div>

      {/* States */}

      {(phase === 'checking' || phase === 'idle') && (
        phase === 'checking'
          ? <div className="h-40 flex items-center justify-center"><span className="h-4 w-4 animate-spin rounded-full border border-foreground/20 border-t-transparent" /></div>
          : <IdleState hasExtractedText={hasExtractedText} onGenerate={handleGenerate} />
      )}

      {isActive && (
        <ActiveJobState phase={phase} jobId={jobId} />
      )}

      {phase === 'retry_required' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/70" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-amber-400/90">Generation slot busy</p>
              {errorMessage && <p className="text-xs leading-relaxed text-amber-400/65">{errorMessage}</p>}
            </div>
          </div>
          <button
            onClick={() => void handleGenerate()}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
          >
            Retry
          </button>
        </div>
      )}

      {canRetry && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-red-400/90">
                {phase === 'cancelled' ? 'Generation cancelled' : 'Generation failed'}
              </p>
              {errorMessage && <p className="text-xs leading-relaxed text-red-400/65">{errorMessage}</p>}
            </div>
          </div>
          <button
            onClick={() => void handleRegenerate()}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
          >
            Try Again
          </button>
        </div>
      )}

      {phase === 'completed' && visuals && (
        visuals.visuals.length === 0
          ? <NoVisualsState onRegenerate={handleRegenerate} />
          : <VisualsGrid visuals={visuals.visuals} onRegenerate={handleRegenerate} onAskTutor={onAskTutor} />
      )}
    </div>
  )
}

// ── ActiveJobState ─────────────────────────────────────────────────────────────

function ActiveJobState({ phase, jobId }: { phase: Phase; jobId: string | null }) {
  const label = phase === 'queued' ? 'Generation queued…' : 'Generating educational diagram…'
  const sub = phase === 'queued'
    ? 'Starting up · you can navigate away safely'
    : 'This can take 1–3 minutes · you can navigate away safely'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-primary/60 border-t-transparent" />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground/65">{label}</p>
          <p className="text-xs text-foreground/25">{sub}</p>
          {jobId && (
            <p className="text-[10px] font-mono text-foreground/15">job:{jobId.slice(0, 8)}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-muted/30">
          <Skeleton className="h-48 w-full rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-2/3 rounded-full" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-4/5 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── IdleState ─────────────────────────────────────────────────────────────────

function IdleState({ hasExtractedText, onGenerate }: { hasExtractedText: boolean; onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.08]">
        <ImageIcon className="h-7 w-7 text-primary/70" />
      </div>
      <h3 className="text-sm font-semibold text-foreground/70">No diagrams yet</h3>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-foreground/30">
        {hasExtractedText
          ? 'MoLis will analyse your document and generate labelled educational diagrams for visual concepts — hierarchies, process flows, concept maps, and more.'
          : 'Extract text from your document first, then generate visual diagrams.'}
      </p>
      {hasExtractedText && (
        <p className="mt-2 text-[10px] text-foreground/20">
          Generation takes 30–90 seconds · runs in the background
        </p>
      )}
      <button
        onClick={onGenerate}
        disabled={!hasExtractedText}
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SparklesIcon className="h-4 w-4" />
        Generate Diagrams
      </button>
    </div>
  )
}

// ── NoVisualsState ────────────────────────────────────────────────────────────

function NoVisualsState({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-muted/30 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40">
        <ImageIcon className="h-5 w-5 text-foreground/20" />
      </div>
      <p className="text-sm font-medium text-foreground/40">No visual topics detected</p>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-foreground/20">
        This document doesn&apos;t appear to contain concepts that benefit from diagrams.
        Visual aids work best for anatomy, networks, OOP hierarchies, circuits, and data structures.
      </p>
      <button
        onClick={onRegenerate}
        className="mt-4 text-xs text-foreground/25 underline underline-offset-2 transition-colors hover:text-foreground/45"
      >
        Try again
      </button>
    </div>
  )
}

// ── VisualsGrid ───────────────────────────────────────────────────────────────

function VisualsGrid({
  visuals,
  onRegenerate,
  onAskTutor,
}: {
  visuals: PublicVisualItem[]
  onRegenerate: () => void
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}) {
  const anyFailed = visuals.some(v => v.status === 'failed')
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visuals.map((visual, i) => (
          <VisualCard key={i} visual={visual} onAskTutor={onAskTutor} />
        ))}
      </div>
      {anyFailed && (
        <p className="text-center text-xs text-foreground/25">
          Some diagrams failed to generate.{' '}
          <button
            onClick={onRegenerate}
            className="underline underline-offset-2 transition-colors hover:text-foreground/45"
          >
            Regenerate
          </button>{' '}
          to try again.
        </p>
      )}
    </div>
  )
}

// ── VisualCard ────────────────────────────────────────────────────────────────

function VisualCard({ visual, onAskTutor }: { visual: PublicVisualItem; onAskTutor?: (prompt: string, mode?: TutorMode) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative flex h-52 items-center justify-center bg-gradient-to-br from-primary/10 via-background to-muted/30">
        {visual.status === 'generated' && visual.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={visual.image_url} alt={visual.topic} className="h-full w-full object-contain" />
        ) : visual.status === 'failed' ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <WarningIcon className="h-8 w-8 text-red-400/40" />
            <p className="text-xs text-foreground/25">Image generation failed</p>
            {visual.failure_stage && (
              <span className="rounded border border-red-500/15 bg-red-500/[0.06] px-2 py-0.5 text-[10px] font-mono text-red-400/50">
                {visual.failure_stage}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <DiagramIcon className="h-10 w-10 text-primary/20" />
            <p className="text-xs text-foreground/20">Diagram pending</p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug text-foreground/80">{visual.topic}</p>
          {visual.status === 'failed' && (
            <span className="shrink-0 rounded-full border border-red-500/20 bg-red-500/[0.07] px-2 py-0.5 text-[10px] font-medium text-red-400">
              Failed
            </span>
          )}
        </div>
        {visual.description && (
          <p className="text-xs leading-relaxed text-foreground/40">{visual.description}</p>
        )}
        {visual.status === 'failed' && visual.error && (
          <p className="text-[10px] font-mono leading-relaxed text-red-400/40 break-all">
            {visual.failure_stage ? `[${visual.failure_stage}] ` : ''}{visual.error}
          </p>
        )}
        {visual.status === 'generated' && onAskTutor && (
          <button
            onClick={() => onAskTutor(
              `Explain this visual: "${visual.topic}". Description: "${visual.description ?? visual.topic}"`,
              'explain',
            )}
            className="mt-1 w-fit rounded-md border border-primary/18 bg-primary/[0.05] px-2.5 py-1 text-[11px] font-medium text-primary/65 transition-colors hover:border-primary/30 hover:bg-primary/[0.10]"
          >
            Ask Tutor to explain this
          </button>
        )}
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  )
}

function DiagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}

function RegenerateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  )
}
