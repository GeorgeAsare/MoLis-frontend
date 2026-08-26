'use client'

import { cn } from '@/lib/utils'
import type { StudyPlan, StudyBlock, BlockType, LinkedAction } from '@/types/studyPlan'
import type { TutorMode } from '@/types/tutor'

interface Props {
  plan: StudyPlan
  onNavigate: (tab: string) => void
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}

const BLOCK_LABELS: Record<BlockType, string> = {
  relearn:    'Relearn',
  review:     'Review',
  flashcards: 'Practice',
  quiz:       'Quiz',
  mixed:      'Mixed',
}

const BLOCK_TYPE_STYLE: Record<BlockType, string> = {
  relearn:    'text-red-400/75',
  review:     'text-amber-400/75',
  flashcards: 'text-foreground/35',
  quiz:       'text-foreground/35',
  mixed:      'text-foreground/28',
}

const ACTION_LABEL: Record<LinkedAction, string> = {
  notes:      'Open Notes',
  flashcards: 'Flashcards',
  quiz:       'Quiz',
  tutor:      'Ask MoLis',
}

export function StudyPlanCard({ plan, onNavigate, onAskTutor }: Props) {
  if (plan.study_blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-6 py-10 text-center">
        <p className="text-[14px] font-medium text-foreground/40">No study path yet</p>
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-foreground/28">
          Take a quiz or review flashcards to generate your adaptive study path.
        </p>
      </div>
    )
  }

  const totalMinutes = plan.study_blocks.reduce((sum, b) => sum + b.estimated_minutes, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Section heading */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-bold tracking-[-0.025em] text-foreground/80">
          Today&apos;s study path
        </h3>
        <span className="shrink-0 text-[13px] text-foreground/35">
          {totalMinutes} min · {plan.study_blocks.length} concept{plan.study_blocks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Path rows */}
      <div className="flex flex-col divide-y divide-border/30">
        {plan.study_blocks.map((block, i) => (
          <PathRow
            key={block.concept_id}
            block={block}
            index={i}
            onNavigate={onNavigate}
            onAskTutor={onAskTutor}
          />
        ))}
      </div>
    </div>
  )
}

// ── PathRow ───────────────────────────────────────────────────────────────────

function PathRow({
  block,
  index,
  onNavigate,
  onAskTutor,
}: {
  block: StudyBlock
  index: number
  onNavigate: (tab: string) => void
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}) {
  return (
    <div className="flex items-start gap-4 py-4">
      {/* Step number */}
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/60 text-[11px] font-bold text-foreground/35 tabular-nums">
        {index + 1}
      </span>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[15px] font-semibold text-foreground/82">{block.concept_title}</p>
        <p className={cn('text-[13px]', BLOCK_TYPE_STYLE[block.block_type])}>
          {BLOCK_LABELS[block.block_type]}
          <span className="text-foreground/32"> · {block.estimated_minutes} min</span>
        </p>
        {block.reason && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/48">{block.reason}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        <button
          onClick={() => onNavigate(block.linked_action)}
          className="rounded-lg border border-primary/22 bg-primary/[0.08] px-3 py-1.5 text-[12px] font-semibold text-primary transition-colors hover:border-primary/38 hover:bg-primary/[0.13]"
        >
          {ACTION_LABEL[block.linked_action]}
        </button>
        {onAskTutor && block.linked_action !== 'tutor' && (
          <button
            onClick={() =>
              onAskTutor(
                `Help me understand "${block.concept_title}". ${block.reason}`,
                'explain',
              )
            }
            className="flex items-center gap-1 text-[12px] font-medium text-foreground/48 transition-colors hover:text-primary/80"
          >
            Ask MoLis
          </button>
        )}
      </div>
    </div>
  )
}
