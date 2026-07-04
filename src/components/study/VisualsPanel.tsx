'use client'

import { useRef, useState } from 'react'
import { generateVisuals } from '@/app/actions/visuals'
import { Skeleton } from '@/components/ui/Skeleton'
import type { StudyVisualSet, StudyVisualItem } from '@/types/studyVisual'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'generating' | 'done' | 'error'

interface Props {
  documentId: string
  hasExtractedText: boolean
  initialVisuals: StudyVisualSet | null
  analysis?: DocumentAnalysis | null
}

// ── VisualsPanel ──────────────────────────────────────────────────────────────

export function VisualsPanel({ documentId, hasExtractedText, initialVisuals }: Props) {
  const [phase, setPhase]         = useState<Phase>(initialVisuals ? 'done' : 'idle')
  const [visuals, setVisuals]     = useState<StudyVisualSet | null>(initialVisuals)
  const [errorMessage, setError]  = useState<string | null>(null)
  const phaseRef = useRef(phase)

  async function triggerGenerate() {
    if (phaseRef.current === 'generating') return
    phaseRef.current = 'generating'
    setPhase('generating')
    setError(null)
    try {
      const result = await generateVisuals(documentId)
      setVisuals(result)
      phaseRef.current = 'done'
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Visual generation failed')
      phaseRef.current = 'error'
      setPhase('error')
    }
  }

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
        {phase === 'done' && visuals && visuals.visuals.length > 0 && (
          <button
            onClick={triggerGenerate}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground/35 transition-colors hover:border-border hover:text-foreground/55"
          >
            <RegenerateIcon className="h-3 w-3" />
            Regenerate
          </button>
        )}
      </div>

      {/* States */}
      {phase === 'idle' && (
        <IdleState hasExtractedText={hasExtractedText} onGenerate={triggerGenerate} />
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-red-400/90">Generation failed</p>
              <p className="text-xs leading-relaxed text-red-400/65">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={triggerGenerate}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
          >
            Try Again
          </button>
        </div>
      )}

      {phase === 'generating' && <GeneratingSkeleton />}

      {phase === 'done' && visuals && (
        visuals.visuals.length === 0
          ? <NoVisualsState onRegenerate={triggerGenerate} />
          : <VisualsGrid visuals={visuals.visuals} onRegenerate={triggerGenerate} />
      )}
    </div>
  )
}

// ── IdleState ─────────────────────────────────────────────────────────────────

function IdleState({
  hasExtractedText,
  onGenerate,
}: {
  hasExtractedText: boolean
  onGenerate: () => void
}) {
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
        <p className="mt-2 text-[10px] text-foreground/20">Generation takes 30–90 seconds</p>
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
        This document doesn&apos;t appear to contain concepts that benefit from diagrams. Visual aids work best for anatomy, networks, OOP hierarchies, circuits, and data structures.
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

// ── GeneratingSkeleton ────────────────────────────────────────────────────────

function GeneratingSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-primary/60 border-t-transparent" />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground/65">Generating educational diagram…</p>
          <p className="text-xs text-foreground/25">This can take 1–3 minutes · please keep this tab open</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {[0].map(i => (
          <div
            key={i}
            className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-muted/30"
          >
            <Skeleton className="h-48 w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-2/3 rounded-full" />
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-3 w-4/5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── VisualsGrid ───────────────────────────────────────────────────────────────

function VisualsGrid({
  visuals,
  onRegenerate,
}: {
  visuals: StudyVisualItem[]
  onRegenerate: () => void
}) {
  const anyFailed = visuals.some(v => v.status === 'failed')
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visuals.map((visual, i) => (
          <VisualCard key={i} visual={visual} />
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

function VisualCard({ visual }: { visual: StudyVisualItem }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Image area */}
      <div className="relative flex h-52 items-center justify-center bg-gradient-to-br from-primary/10 via-background to-muted/30">
        {visual.status === 'generated' && visual.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={visual.image_url}
            alt={visual.topic}
            className="h-full w-full object-contain"
          />
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

      {/* Info */}
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
        {/* Dev-mode error detail — visible in browser console and on-card in dev */}
        {visual.status === 'failed' && visual.error && (
          <p className="text-[10px] font-mono leading-relaxed text-red-400/40 break-all">
            {visual.failure_stage ? `[${visual.failure_stage}] ` : ''}{visual.error}
          </p>
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
