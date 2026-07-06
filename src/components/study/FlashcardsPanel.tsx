'use client'

import { useState, useEffect, useCallback } from 'react'
import { generateFlashcards } from '@/app/actions/flashcards'
import { recordConceptResult } from '@/app/actions/conceptMastery'
import { saveFlashcardProgress } from '@/app/actions/flashcardProgress'
import { Skeleton } from '@/components/ui/Skeleton'
import type { FlashcardSet, FlashcardItem } from '@/types/flashcard'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { FlashcardProgress, CardStatus } from '@/types/flashcardProgress'
import type { TutorMode } from '@/types/tutor'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'generating' | 'ready' | 'studying' | 'done' | 'error'

interface Props {
  documentId: string
  hasExtractedText: boolean
  initialFlashcards: FlashcardSet | null
  initialProgress?: FlashcardProgress | null
  analysis?: DocumentAnalysis | null
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GENERATION_MESSAGES = [
  'Analysing your document…',
  'Identifying key concepts…',
  'Writing question fronts…',
  'Crafting precise answers…',
  'Grouping by topic…',
  'Finalising your flashcard set…',
]

const DIFFICULTY_STYLE: Record<FlashcardItem['difficulty'], string> = {
  easy: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.08]',
  medium: 'text-amber-400 border-amber-500/25 bg-amber-500/[0.08]',
  hard: 'text-red-400 border-red-500/20 bg-red-500/[0.07]',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasValidProgress(
  progress: FlashcardProgress | null | undefined,
  flashcards: FlashcardSet | null,
): boolean {
  return !!(
    progress &&
    flashcards &&
    progress.card_statuses.length === flashcards.cards.length
  )
}

// ── FlashcardsPanel ───────────────────────────────────────────────────────────

export function FlashcardsPanel({
  documentId,
  hasExtractedText,
  initialFlashcards,
  initialProgress,
  onAskTutor,
}: Props) {
  const [phase, setPhase] = useState<Phase>(() => {
    if (!initialFlashcards) return 'idle'
    if (hasValidProgress(initialProgress, initialFlashcards)) {
      return initialProgress!.phase as Phase
    }
    return 'ready'
  })
  const [flashcards, setFlashcards] = useState<FlashcardSet | null>(initialFlashcards)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [msgIndex, setMsgIndex] = useState(0)

  // Study session state — initialised from persisted progress if available
  const [cardStatuses, setCardStatuses] = useState<CardStatus[]>(() => {
    if (hasValidProgress(initialProgress, initialFlashcards)) {
      return initialProgress!.card_statuses as CardStatus[]
    }
    return []
  })
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (hasValidProgress(initialProgress, initialFlashcards)) {
      return initialProgress!.current_index
    }
    return 0
  })
  const [flipped, setFlipped] = useState(false)
  const [reviewLearningOnly, setReviewLearningOnly] = useState<boolean>(() => {
    if (hasValidProgress(initialProgress, initialFlashcards)) {
      return initialProgress!.review_learning_only
    }
    return false
  })

  useEffect(() => {
    if (phase !== 'generating') return
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % GENERATION_MESSAGES.length),
      2000,
    )
    return () => clearInterval(id)
  }, [phase])

  async function triggerGenerate() {
    setPhase('generating')
    setErrorMessage(null)
    setMsgIndex(0)
    try {
      const result = await generateFlashcards(documentId)
      setFlashcards(result)
      setCardStatuses([])
      setCurrentIndex(0)
      setReviewLearningOnly(false)
      setPhase('ready')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Flashcard generation failed')
      setPhase('error')
    }
  }

  function startStudying(learningOnly = false) {
    if (!flashcards) return
    const cards = learningOnly
      ? flashcards.cards.filter((_, i) => cardStatuses[i] === 'learning')
      : flashcards.cards
    if (cards.length === 0) return

    const newStatuses = learningOnly
      ? cardStatuses
      : (new Array(flashcards.cards.length).fill('unseen') as CardStatus[])
    setReviewLearningOnly(learningOnly)
    setCurrentIndex(0)
    setFlipped(false)
    if (!learningOnly) setCardStatuses(newStatuses)
    setPhase('studying')
    saveFlashcardProgress(documentId, {
      card_statuses: newStatuses,
      current_index: 0,
      phase: 'studying',
      review_learning_only: learningOnly,
    }).catch(() => {})
  }

  function initStudying() {
    if (!flashcards) return
    const statuses = new Array(flashcards.cards.length).fill('unseen') as CardStatus[]
    const now = new Date().toISOString()
    setCardStatuses(statuses)
    setCurrentIndex(0)
    setFlipped(false)
    setReviewLearningOnly(false)
    setPhase('studying')
    saveFlashcardProgress(documentId, {
      card_statuses: statuses,
      current_index: 0,
      phase: 'studying',
      review_learning_only: false,
      started_at: now,
    }).catch(() => {})
  }

  const activeCards = useCallback((): FlashcardItem[] => {
    if (!flashcards) return []
    if (reviewLearningOnly) {
      return flashcards.cards.filter((_, i) => cardStatuses[i] === 'learning')
    }
    return flashcards.cards
  }, [flashcards, reviewLearningOnly, cardStatuses])

  const activeCardIndex = useCallback((): number => {
    if (!flashcards || !reviewLearningOnly) return currentIndex
    const learningCards = flashcards.cards.map((_, i) => i).filter(i => cardStatuses[i] === 'learning')
    return learningCards[currentIndex] ?? currentIndex
  }, [flashcards, reviewLearningOnly, currentIndex, cardStatuses])

  function handleFlip() {
    setFlipped((v) => !v)
  }

  function handleMark(status: 'known' | 'learning') {
    if (!flashcards) return
    const cards = activeCards()
    const card = cards[currentIndex]
    const realIndex = reviewLearningOnly ? activeCardIndex() : currentIndex

    const next = [...cardStatuses]
    next[realIndex] = status
    setCardStatuses(next)

    if (card?.concept_id) {
      recordConceptResult(documentId, {
        concept_id: card.concept_id,
        concept_title: card.topic,
        correct: status === 'known',
        source: 'flashcard',
      }).catch(() => {})
    }

    const isLast = currentIndex >= cards.length - 1
    if (isLast) {
      setPhase('done')
      saveFlashcardProgress(documentId, {
        card_statuses: next,
        current_index: currentIndex,
        phase: 'done',
        review_learning_only: reviewLearningOnly,
        completed_at: new Date().toISOString(),
      }).catch(() => {})
    } else {
      const newIndex = currentIndex + 1
      setCurrentIndex(newIndex)
      setFlipped(false)
      saveFlashcardProgress(documentId, {
        card_statuses: next,
        current_index: newIndex,
        phase: 'studying',
        review_learning_only: reviewLearningOnly,
      }).catch(() => {})
    }
  }

  function handlePrev() {
    if (currentIndex <= 0) return
    setCurrentIndex((i) => i - 1)
    setFlipped(false)
  }

  function handleNext() {
    const cards = activeCards()
    if (currentIndex >= cards.length - 1) return
    setCurrentIndex((i) => i + 1)
    setFlipped(false)
  }

  if (!flashcards) {
    return (
      <EmptyState
        hasExtractedText={hasExtractedText}
        phase={phase}
        errorMessage={errorMessage}
        msgIndex={msgIndex}
        onGenerate={triggerGenerate}
      />
    )
  }

  if (phase === 'generating') {
    return <GeneratingSkeleton msgIndex={msgIndex} />
  }

  if (phase === 'ready') {
    return (
      <ReadyScreen
        flashcards={flashcards}
        onStart={initStudying}
        onRegenerate={triggerGenerate}
      />
    )
  }

  if (phase === 'studying') {
    const cards = activeCards()
    const card = reviewLearningOnly ? cards[currentIndex] : flashcards.cards[currentIndex]
    if (!card) return null
    const realIndex = activeCardIndex()
    return (
      <StudyMode
        card={card}
        flipped={flipped}
        currentIndex={currentIndex}
        totalCards={cards.length}
        cardStatuses={cardStatuses}
        realIndex={realIndex}
        totalAll={flashcards.cards.length}
        onFlip={handleFlip}
        onMark={handleMark}
        onPrev={handlePrev}
        onNext={handleNext}
        onAskTutor={onAskTutor}
      />
    )
  }

  if (phase === 'done') {
    const known = cardStatuses.filter((s) => s === 'known').length
    const learning = cardStatuses.filter((s) => s === 'learning').length
    return (
      <DoneScreen
        total={flashcards.cards.length}
        known={known}
        learning={learning}
        onStudyAgain={() => initStudying()}
        onStudyLearning={() => startStudying(true)}
        onRegenerate={triggerGenerate}
      />
    )
  }

  return null
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({
  hasExtractedText,
  phase,
  errorMessage,
  msgIndex,
  onGenerate,
}: {
  hasExtractedText: boolean
  phase: Phase
  errorMessage: string | null
  msgIndex: number
  onGenerate: () => void
}) {
  if (phase === 'generating') return <GeneratingSkeleton msgIndex={msgIndex} />

  return (
    <div className="flex flex-col gap-5">
      {phase === 'error' && errorMessage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
          <p className="text-sm leading-relaxed text-red-400/80">{errorMessage}</p>
        </div>
      )}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.08]">
          <CardsIcon className="h-7 w-7 text-primary/70" />
        </div>
        <h3 className="text-sm font-semibold text-foreground/70">No flashcards yet</h3>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-foreground/30">
          {hasExtractedText
            ? 'Generate AI-powered flashcards from your document. Each card has a question, answer, and topic.'
            : 'Extract text from your document first, then generate flashcards.'}
        </p>
        <button
          onClick={onGenerate}
          disabled={!hasExtractedText}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SparklesIcon className="h-4 w-4" />
          Generate Flashcards
        </button>
      </div>
    </div>
  )
}

// ── GeneratingSkeleton ────────────────────────────────────────────────────────

function GeneratingSkeleton({ msgIndex }: { msgIndex: number }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
          <span className="h-4 w-4 animate-spin rounded-full border border-primary/60 border-t-transparent" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground/60">{GENERATION_MESSAGES[msgIndex]}</p>
          <p className="text-xs text-foreground/25">Powered by GPT-4o mini</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-5"
          >
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
            <div className="flex items-center justify-between pt-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ReadyScreen ───────────────────────────────────────────────────────────────

function ReadyScreen({
  flashcards,
  onStart,
  onRegenerate,
}: {
  flashcards: FlashcardSet
  onStart: () => void
  onRegenerate: () => void
}) {
  const total = flashcards.cards.length
  const byDifficulty = flashcards.cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.difficulty] = (acc[c.difficulty] ?? 0) + 1
    return acc
  }, {})
  const topics = [...new Set(flashcards.cards.map((c) => c.topic))]

  const generatedAt = new Date(flashcards.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-foreground/25">Generated {generatedAt} · {flashcards.model}</p>
        </div>
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground/35 transition-colors hover:border-border hover:text-foreground/55"
        >
          <RegenerateIcon className="h-3 w-3" />
          Regenerate
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-muted/30 p-4 text-center">
          <span className="text-2xl font-bold text-foreground/80">{total}</span>
          <span className="text-xs text-foreground/30">Cards</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-muted/30 p-4 text-center">
          <span className="text-2xl font-bold text-primary">{topics.length}</span>
          <span className="text-xs text-foreground/30">Topics</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-muted/30 p-4 text-center">
          <span className="text-2xl font-bold text-amber-400">{byDifficulty['hard'] ?? 0}</span>
          <span className="text-xs text-foreground/30">Hard cards</span>
        </div>
      </div>

      {/* Difficulty breakdown */}
      <div className="flex gap-2">
        {(['easy', 'medium', 'hard'] as const).map((d) => (
          <span
            key={d}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${DIFFICULTY_STYLE[d]}`}
          >
            {byDifficulty[d] ?? 0} {d}
          </span>
        ))}
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <span
              key={t}
              className="rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1 text-xs text-primary/70"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={onStart}
        className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-6 py-3 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
      >
        <PlayIcon className="h-4 w-4" />
        Study Flashcards
      </button>
    </div>
  )
}

// ── StudyMode ─────────────────────────────────────────────────────────────────

interface StudyModeProps {
  card: FlashcardItem
  flipped: boolean
  currentIndex: number
  totalCards: number
  cardStatuses: CardStatus[]
  realIndex: number
  totalAll: number
  onFlip: () => void
  onMark: (status: 'known' | 'learning') => void
  onPrev: () => void
  onNext: () => void
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}

function StudyMode({
  card,
  flipped,
  currentIndex,
  totalCards,
  cardStatuses,
  totalAll,
  onFlip,
  onMark,
  onPrev,
  onNext,
  onAskTutor,
}: StudyModeProps) {
  const progress = ((currentIndex + 1) / totalCards) * 100
  const known = cardStatuses.filter((s) => s === 'known').length

  return (
    <div className="flex flex-col gap-5">
      {/* Progress bar + counter */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/35">
            Card {currentIndex + 1} of {totalCards}
          </span>
          <span className="text-xs text-foreground/25">
            {known}/{totalAll} known
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div
            className="h-full rounded-full bg-primary/60 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <div
        className="cursor-pointer select-none"
        style={{ perspective: '1200px' }}
        onClick={onFlip}
      >
        <div
          className="relative min-h-[220px] w-full"
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-muted/40 p-8 text-center"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/20">
              {card.topic}
            </p>
            <p className="text-base font-medium leading-relaxed text-foreground/80">
              {card.front}
            </p>
            <p className="mt-5 text-[11px] text-foreground/15">Click to reveal answer</p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.04] p-8 text-center"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <span
              className={`mb-4 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${DIFFICULTY_STYLE[card.difficulty]}`}
            >
              {card.difficulty}
            </span>
            <p className="text-sm font-medium leading-relaxed text-foreground/75">{card.back}</p>
          </div>
        </div>
      </div>

      {/* Navigation + Mark buttons */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-foreground/40 transition-colors hover:border-border hover:text-foreground/60 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Prev
        </button>

        {flipped ? (
          <div className="flex flex-1 justify-center gap-3">
            <button
              onClick={() => onMark('learning')}
              className="flex items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/[0.08] px-5 py-2.5 text-sm font-medium text-orange-400/90 transition-colors hover:border-orange-500/40 hover:bg-orange-500/[0.12]"
            >
              <XIcon className="h-4 w-4" />
              Still Learning
            </button>
            <button
              onClick={() => onMark('known')}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-5 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.12]"
            >
              <CheckIcon className="h-4 w-4" />
              Got It
            </button>
          </div>
        ) : (
          <button
            onClick={onFlip}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-2.5 text-sm text-foreground/40 transition-colors hover:border-border hover:text-foreground/60"
          >
            Flip Card
          </button>
        )}

        <button
          onClick={onNext}
          disabled={currentIndex >= totalCards - 1}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-foreground/40 transition-colors hover:border-border hover:text-foreground/60 disabled:pointer-events-none disabled:opacity-30"
        >
          Next
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Ask Tutor — only visible once card is flipped */}
      {flipped && onAskTutor && (
        <div className="flex justify-center">
          <button
            onClick={() => onAskTutor(`Explain this flashcard in a simpler way. Question: "${card.front}" / Answer: "${card.back}"`, 'simplify')}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-foreground/35 transition-colors hover:border-foreground/15 hover:text-foreground/55"
          >
            Ask Tutor to explain this
          </button>
        </div>
      )}
    </div>
  )
}

// ── DoneScreen ────────────────────────────────────────────────────────────────

function DoneScreen({
  total,
  known,
  learning,
  onStudyAgain,
  onStudyLearning,
  onRegenerate,
}: {
  total: number
  known: number
  learning: number
  onStudyAgain: () => void
  onStudyLearning: () => void
  onRegenerate: () => void
}) {
  const pct = total > 0 ? Math.round((known / total) * 100) : 0
  const accentColor = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-orange-400'
  const accentBorder = pct >= 80 ? 'border-emerald-500/20' : pct >= 50 ? 'border-amber-500/20' : 'border-orange-500/20'
  const accentBg = pct >= 80 ? 'bg-emerald-500/[0.05]' : pct >= 50 ? 'bg-amber-500/[0.05]' : 'bg-orange-500/[0.05]'
  const msg = pct >= 80 ? 'Excellent recall!' : pct >= 60 ? 'Good progress!' : 'Keep reviewing!'

  return (
    <div className="flex flex-col gap-6">
      <div className={`flex items-center gap-5 rounded-2xl border ${accentBorder} ${accentBg} px-6 py-5`}>
        <div className={`flex flex-col items-center rounded-xl border ${accentBorder} bg-muted/40 px-5 py-3 text-center`}>
          <span className={`text-3xl font-bold tabular-nums ${accentColor}`}>{pct}%</span>
          <span className="mt-0.5 text-xs text-foreground/30">known</span>
        </div>
        <div>
          <p className={`text-base font-semibold ${accentColor}`}>{msg}</p>
          <p className="mt-1 text-xs text-foreground/35">{known} known · {learning} still learning</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onStudyAgain}
          className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
        >
          <RegenerateIcon className="h-4 w-4" />
          Study All Again
        </button>
        {learning > 0 && (
          <button
            onClick={onStudyLearning}
            className="inline-flex items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/[0.08] px-5 py-2.5 text-sm font-medium text-orange-400/90 transition-colors hover:border-orange-500/40 hover:bg-orange-500/[0.12]"
          >
            Review {learning} Learning
          </button>
        )}
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground/35 transition-colors hover:border-border hover:text-foreground/55"
        >
          New Set
        </button>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CardsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
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

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
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

