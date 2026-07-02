'use client'

import type { StudyPlan, StudyBlock, BlockType, LinkedAction } from '@/types/studyPlan'

interface Props {
  plan: StudyPlan
  onNavigate: (tab: string) => void
}

const BLOCK_LABELS: Record<BlockType, string> = {
  relearn:    'Relearn',
  review:     'Review',
  flashcards: 'Flashcards',
  quiz:       'Quiz',
  mixed:      'Mixed',
}

const BLOCK_STYLE: Record<BlockType, string> = {
  relearn:    'border-red-500/20 bg-red-500/[0.07] text-red-400',
  review:     'border-amber-500/20 bg-amber-500/[0.07] text-amber-400',
  flashcards: 'border-sky-500/20 bg-sky-500/[0.07] text-sky-400',
  quiz:       'border-violet-500/20 bg-violet-500/[0.07] text-violet-400',
  mixed:      'border-border bg-muted/40 text-foreground/40',
}

const ACTION_LABEL: Record<LinkedAction, string> = {
  notes:      'Open Notes',
  flashcards: 'Open Flashcards',
  quiz:       'Take Quiz',
  tutor:      'Ask Tutor',
}

function readinessBadge(score: number): string {
  if (score >= 70) return 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-400'
  if (score >= 40) return 'border-amber-500/20 bg-amber-500/[0.07] text-amber-400'
  return 'border-red-500/20 bg-red-500/[0.06] text-red-400'
}

export function StudyPlanCard({ plan, onNavigate }: Props) {
  if (plan.study_blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40">
          <PlanIcon className="h-5 w-5 text-foreground/20" />
        </div>
        <p className="text-sm font-medium text-foreground/45">No study plan yet</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-foreground/28">
          Complete text extraction, then take a quiz or review flashcards to generate your adaptive plan.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
            <PlanIcon className="h-4 w-4 text-foreground/35" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground/75">Adaptive Study Plan</p>
            <p className="text-[11px] text-foreground/35">Based on your current mastery</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${readinessBadge(plan.overall_exam_readiness)}`}>
          {plan.overall_exam_readiness}% ready
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCell label="Session" value={`${plan.estimated_session_minutes} min`} />
        <StatCell label="Expected gain" value={`+${plan.expected_improvement}% readiness`} />
      </div>

      {/* Why this plan */}
      <p className="text-xs leading-relaxed text-foreground/45">{plan.why_this_plan}</p>

      {/* Recommended next action */}
      <div className="rounded-xl border border-primary/18 bg-primary/[0.05] px-3.5 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25">Start here</p>
        <p className="mt-0.5 text-xs leading-relaxed text-foreground/55">{plan.recommended_next_action}</p>
      </div>

      {/* Study blocks */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/22">
          Study blocks · {plan.study_blocks.length}
        </p>
        {plan.study_blocks.map((block, i) => (
          <BlockRow
            key={block.concept_id}
            block={block}
            index={i}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}

// ── BlockRow ──────────────────────────────────────────────────────────────────

function BlockRow({
  block,
  index,
  onNavigate,
}: {
  block: StudyBlock
  index: number
  onNavigate: (tab: string) => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 px-3.5 py-3">
      {/* Step number */}
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/60 text-[10px] font-semibold text-foreground/30 tabular-nums">
        {index + 1}
      </span>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[13px] font-medium text-foreground/72">{block.concept_title}</p>
          <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${BLOCK_STYLE[block.block_type]}`}>
            {BLOCK_LABELS[block.block_type]}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-foreground/35">{block.reason}</p>
        <p className="text-[11px] text-foreground/22">{block.estimated_minutes} min</p>
      </div>

      {/* Action button */}
      <button
        onClick={() => onNavigate(block.linked_action)}
        className="mt-0.5 shrink-0 rounded-lg border border-primary/22 bg-primary/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.12]"
      >
        {ACTION_LABEL[block.linked_action]}
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/22">{label}</span>
      <span className="text-xs font-medium text-foreground/55">{value}</span>
    </div>
  )
}

function PlanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  )
}
