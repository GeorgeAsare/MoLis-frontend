'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getActiveJobForDocument } from '@/app/actions/generationJobs'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePendingRequestKey, clearPendingRequestKey, setPendingRequestKey } from '@/lib/jobs/pendingJobKey'
import { Skeleton } from '@/components/ui/Skeleton'
import type { StudyVisualSet, StudyVisualItem } from '@/types/studyVisual'
import type { JobSafeDto } from '@/lib/jobs/stateMachine'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { TutorMode } from '@/types/tutor'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'       // no visuals, no active job
  | 'checking'   // on mount, fetching active job status
  | 'queued'     // job created, not yet started
  | 'processing' // actively generating
  | 'completed'  // visuals available
  | 'failed'     // job failed — show error + retry
  | 'cancelled'  // cancelled — show retry
  | 'stale'      // processing >10 min — treat as failed

const STALE_THRESHOLD_MS = 10 * 60 * 1000  // 10 minutes
const POLL_INTERVAL_MS = 3_000

function isStale(job: JobSafeDto): boolean {
  if (job.status !== 'processing') return false
  const started = job.started_at ? new Date(job.started_at).getTime() : new Date(job.created_at).getTime()
  return Date.now() - started > STALE_THRESHOLD_MS
}

interface Props {
  documentId: string
  hasExtractedText: boolean
  initialVisuals: StudyVisualSet | null
  analysis?: DocumentAnalysis | null
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}

// ── VisualsPanel ──────────────────────────────────────────────────────────────

export function VisualsPanel({ documentId, hasExtractedText, initialVisuals, onAskTutor }: Props) {
  // Completed visuals fetched from DB (initially from server props, refreshed after job completes)
  const [visuals, setVisuals] = useState<StudyVisualSet | null>(initialVisuals)
  const [phase, setPhase] = useState<Phase>(initialVisuals ? 'completed' : 'checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  // Fetch visuals with signed URLs from the server-side endpoint.
  // The study-visuals bucket is private; direct Supabase client reads return storage_path
  // but no displayable URL. The server-side endpoint resolves signed URLs (5-min expiry)
  // for each generated item after verifying ownership.
  const refreshVisuals = useCallback(async () => {
    try {
      const res = await fetch(`/api/visuals/${documentId}`)
      if (!res.ok) return
      const data = (await res.json()) as StudyVisualSet
      setVisuals(data)
    } catch {
      // Network error — keep existing visuals, don't crash
    }
  }, [documentId])

  // Poll job status from the API route
  const pollJobStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/status/${id}`)
      if (!res.ok) {
        // Job not found — stop polling
        stopPolling()
        setPhase('failed')
        setErrorMessage('Job status could not be retrieved.')
        return
      }
      const job = (await res.json()) as JobSafeDto

      if (isStale(job)) {
        stopPolling()
        setPhase('stale')
        setErrorMessage('Generation timed out after 10 minutes. Try again.')
        return
      }

      if (job.status === 'queued') {
        setPhase('queued')
      } else if (job.status === 'processing') {
        setPhase('processing')
      } else if (job.status === 'completed') {
        stopPolling()
        await refreshVisuals()
        setPhase('completed')
      } else if (job.status === 'failed') {
        stopPolling()
        setPhase('failed')
        // Use the safe public message key if available; otherwise use a generic fallback.
        // Raw error text is never returned by the API — do not attempt to access it here.
        setErrorMessage(job.public_message_key ?? 'Visual generation failed. Please try again.')
      } else if (job.status === 'cancelled') {
        stopPolling()
        setPhase('cancelled')
      }
    } catch {
      // Network error — keep polling, don't crash
    }
  }, [refreshVisuals])

  function startPolling(id: string) {
    stopPolling()
    void pollJobStatus(id)
    pollRef.current = setInterval(() => void pollJobStatus(id), POLL_INTERVAL_MS)
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

      if (isStale(job)) {
        setPhase('stale')
        setErrorMessage('A previous generation timed out. Try again.')
        return
      }

      if (job.status === 'queued' || job.status === 'processing') {
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
        // P0007 concurrent-terminal race could not be resolved after one server retry.
        // Preserve the request key — the client must retry the same key after a delay.
        const body = (await res.json()) as { code?: string }
        if (body.code === 'JOB_ENQUEUE_RETRY_REQUIRED') {
          setPhase('failed')
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

  const isActive = phase === 'queued' || phase === 'processing'
  const canRetry = phase === 'failed' || phase === 'cancelled' || phase === 'stale'

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
  visuals: StudyVisualItem[]
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

function VisualCard({ visual, onAskTutor }: { visual: StudyVisualItem; onAskTutor?: (prompt: string, mode?: TutorMode) => void }) {
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
