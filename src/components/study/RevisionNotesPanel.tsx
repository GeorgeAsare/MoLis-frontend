'use client'

import { useEffect, useRef, useState } from 'react'
import { generateRevisionNotes } from '@/app/actions/revisionNotes'
import { Skeleton } from '@/components/ui/Skeleton'
import type { RevisionNote } from '@/types/revisionNotes'

interface Props {
  documentId: string
  hasExtractedText: boolean
  initialNotes: RevisionNote | null
}

type Phase = 'idle' | 'generating' | 'done' | 'error'

const GENERATION_MESSAGES = [
  'Reading your document…',
  'Identifying key concepts…',
  'Building revision points…',
  'Drafting definitions…',
  'Crafting exam tips…',
  'Structuring your notes…',
]

export function RevisionNotesPanel({
  documentId,
  hasExtractedText,
  initialNotes,
}: Props) {
  const [phase, setPhase] = useState<Phase>(initialNotes ? 'done' : 'idle')
  const [notes, setNotes] = useState<RevisionNote | null>(initialNotes)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [msgIndex, setMsgIndex] = useState(0)

  // Keep a ref to the current phase so the event listener doesn't stale-close.
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  // Rotate generation messages while generating.
  useEffect(() => {
    if (phase !== 'generating') return
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % GENERATION_MESSAGES.length),
      2000,
    )
    return () => clearInterval(id)
  }, [phase])

  // Listen for sidebar "Generate Revision Notes" button event.
  useEffect(() => {
    function handler() {
      if (phaseRef.current === 'generating') return
      void triggerGenerate()
    }
    window.addEventListener('molis:generate-notes', handler)
    return () => window.removeEventListener('molis:generate-notes', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function triggerGenerate() {
    if (phase === 'generating') return
    setPhase('generating')
    setErrorMessage(null)
    setMsgIndex(0)
    try {
      const result = await generateRevisionNotes(documentId)
      setNotes(result)
      setPhase('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Generation failed')
      setPhase('error')
    }
  }

  return (
    <div id="revision-notes" className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025]">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-violet-400/60" />
          <span className="text-sm font-medium text-white/70">Revision Notes</span>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'done' && notes && (
            <button
              onClick={triggerGenerate}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-white/35 transition-colors hover:border-white/[0.12] hover:text-white/55"
            >
              <RegenerateIcon className="h-3 w-3" />
              Regenerate
            </button>
          )}
          <PhaseBadge phase={phase} />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="p-5">

        {/* Idle — not yet generated */}
        {phase === 'idle' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-white/35">
              {hasExtractedText
                ? 'Generate AI-powered revision notes — key concepts, bullet points, definitions, and exam tips — from your extracted document text.'
                : 'Text extraction is required before generating revision notes.'}
            </p>
            <button
              onClick={triggerGenerate}
              disabled={!hasExtractedText}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SparklesIcon className="h-4 w-4" />
              Generate Revision Notes
            </button>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
              <p className="text-sm leading-relaxed text-red-400/80">{errorMessage}</p>
            </div>
            <button
              onClick={triggerGenerate}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.15]"
            >
              <SparklesIcon className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {/* Generating — animated skeleton */}
        {phase === 'generating' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-violet-400/60 border-t-transparent" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-white/60">
                  {GENERATION_MESSAGES[msgIndex]}
                </p>
                <p className="text-xs text-white/25">Powered by GPT-4o mini</p>
              </div>
            </div>

            {/* Summary skeleton */}
            <div className="flex flex-col gap-2 rounded-xl border border-violet-500/10 bg-violet-500/[0.04] p-4">
              <Skeleton className="h-3 w-16 rounded-full" />
              <div className="mt-1 flex flex-col gap-1.5">
                {[100, 92, 85, 78].map((w, i) => (
                  <Skeleton key={i} className="h-3.5 rounded-full" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>

            {/* Concepts skeleton */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <div className="flex flex-wrap gap-2">
                {[72, 96, 80, 108, 64, 88].map((w, i) => (
                  <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
                ))}
              </div>
            </div>

            {/* Bullets skeleton */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-28 rounded-full" />
              <div className="flex flex-col gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                    <Skeleton className="h-3.5 flex-1 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Done — full notes display */}
        {phase === 'done' && notes && <NotesDisplay notes={notes} />}
      </div>
    </div>
  )
}

// ── NotesDisplay ──────────────────────────────────────────────────────────────

function NotesDisplay({ notes }: { notes: RevisionNote }) {
  const generatedAt = new Date(notes.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-7">

      {/* Title + metadata */}
      <div>
        <h2 className="text-base font-semibold leading-snug text-white/85">
          {notes.title}
        </h2>
        <p className="mt-1 text-xs text-white/20">
          Generated {generatedAt} · {notes.model}
        </p>
      </div>

      {/* Summary */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Summary</SectionLabel>
        <div className="rounded-xl border border-violet-500/[0.12] bg-violet-500/[0.05] px-5 py-4">
          <p className="text-sm leading-relaxed text-white/65">{notes.summary}</p>
        </div>
      </div>

      {/* Key concepts */}
      {notes.key_concepts.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Key Concepts</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {notes.key_concepts.map((concept, i) => (
              <span
                key={i}
                className="rounded-full border border-violet-500/20 bg-violet-500/[0.08] px-3 py-1 text-xs font-medium text-violet-300/80"
              >
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Revision bullet points */}
      {notes.bullet_points.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Revision Notes</SectionLabel>
          <ol className="flex flex-col gap-2.5">
            {notes.bullet_points.map((point, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-violet-500/20 bg-violet-500/10 text-[10px] font-semibold text-violet-400/80">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed text-white/65">{point}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Definitions */}
      {notes.definitions.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Key Definitions</SectionLabel>
          <div className="flex flex-col gap-2">
            {notes.definitions.map(({ term, definition }, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:flex-row sm:gap-3"
              >
                <span className="w-full shrink-0 text-xs font-semibold text-white/70 sm:w-36">
                  {term}
                </span>
                <span className="text-sm leading-relaxed text-white/50">
                  {definition}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam tips */}
      {notes.exam_tips.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Exam Tips</SectionLabel>
          <div className="flex flex-col gap-2">
            {notes.exam_tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-amber-500/[0.12] bg-amber-500/[0.05] px-4 py-3"
              >
                <LightningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/70" />
                <span className="text-sm leading-relaxed text-white/60">{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/25">
      {children}
    </p>
  )
}

function PhaseBadge({ phase }: { phase: Phase }) {
  switch (phase) {
    case 'done':
      return (
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          Generated
        </span>
      )
    case 'generating':
      return (
        <span className="flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-violet-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
          Generating
        </span>
      )
    case 'error':
      return (
        <span className="rounded-full border border-red-500/20 bg-red-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-red-400">
          Failed
        </span>
      )
    default:
      return (
        <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-white/25">
          Not generated
        </span>
      )
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
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

function LightningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  )
}
