'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { generateFlashcards, addFlashcards } from '@/app/actions/flashcards'
import { recordConceptResult } from '@/app/actions/conceptMastery'
import { updateFlashcardStatus, startFlashcardSession, clearFlashcardSession } from '@/app/actions/flashcardProgress'
import { saveMemory } from '@/app/actions/userMemories'
import { Skeleton } from '@/components/ui/Skeleton'
import type { FlashcardSet, FlashcardItem } from '@/types/flashcard'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { FlashcardProgress, CardStatus, SessionPersistedConfig } from '@/types/flashcardProgress'
import type { TutorMode } from '@/types/tutor'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'generating' | 'ready' | 'setup' | 'studying' | 'done' | 'error'
type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed'

interface SessionConfig {
  cards: FlashcardItem[]
  indices: number[]         // original indices in flashcards.cards[]
  label: string             // e.g. "10 cards · Medium · All topics"
  reviewLearningOnly: boolean
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  selectedTopics: string[]  // empty = all topics
}

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

const ADD_GENERATION_MESSAGES = [
  'Analysing existing cards…',
  'Identifying uncovered concepts…',
  'Generating new questions…',
  'Crafting precise answers…',
  'Appending to your deck…',
]

// Safety ceiling per generation request (mirrors ADD_CARDS_MAX in flashcards.ts)
const ADD_CARDS_MAX = 50

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

// Restores the exact session from persisted session_card_indices.
// Validates: phase must be 'studying', session_card_indices must be a non-empty
// array of non-negative integers all within the current deck bounds, and
// current_index must be within [0, session_card_indices.length).
// Returns null when any check fails — callers fall back to the ready phase.
function deriveResumableSession(
  progress: FlashcardProgress,
  flashcards: FlashcardSet,
): { session: SessionConfig; resumeIndex: number } | null {
  if (progress.phase !== 'studying') return null

  const rawIndices = progress.session_card_indices
  if (!Array.isArray(rawIndices) || rawIndices.length === 0) return null

  const deckLen = flashcards.cards.length
  for (const idx of rawIndices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= deckLen) return null
  }
  const validIndices = rawIndices as number[]

  const ci = progress.current_index
  if (!Number.isInteger(ci) || ci < 0 || ci >= validIndices.length) return null

  const cards = validIndices.map(i => flashcards.cards[i])

  // Reconstruct label and config from persisted session_config when available.
  const sc = progress.session_config as SessionPersistedConfig | null
  let label: string
  let difficulty: 'easy' | 'medium' | 'hard' | 'mixed' = 'mixed'
  let selectedTopics: string[] = []
  let reviewLearningOnly = progress.review_learning_only

  if (sc && typeof sc === 'object' && !Array.isArray(sc)) {
    difficulty = sc.difficulty ?? 'mixed'
    selectedTopics = Array.isArray(sc.selected_topics) ? sc.selected_topics : []
    reviewLearningOnly = typeof sc.review_learning_only === 'boolean'
      ? sc.review_learning_only
      : progress.review_learning_only

    const diffStr = difficulty === 'mixed'
      ? 'Mixed'
      : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
    const topicStr = selectedTopics.length === 0
      ? 'All topics'
      : selectedTopics.length === 1
        ? selectedTopics[0]
        : `${selectedTopics.length} topics`
    label = `${validIndices.length} cards · ${diffStr} · ${topicStr}`
  } else {
    label = `${validIndices.length} card${validIndices.length !== 1 ? 's' : ''} · Resumed`
  }

  return {
    session: { cards, indices: validIndices, label, reviewLearningOnly, difficulty, selectedTopics },
    resumeIndex: ci,
  }
}

// Returns preset count options for the given total (excludes "All N" and "Custom").
// Matches the brief examples exactly:
//   7 → [5]         18 → [5,10,15]      46 → [5,10,20,30]   100 → [10,20,30,50]
function getSessionPresets(total: number): number[] {
  if (total <= 5)  return []
  if (total <= 10) return [5]
  if (total <= 15) return [5, 10]
  if (total <= 20) return [5, 10, 15]
  if (total <= 35) return [5, 10, 15, 20]
  if (total <= 50) return [5, 10, 20, 30]
  if (total <= 100) return [10, 20, 30, 50]
  return [10, 25, 50, 100]
}

function defaultSessionCount(presets: number[], total: number): number {
  if (presets.length === 0) return total // small deck — default to all
  if (presets.includes(10)) return 10
  return presets[presets.length - 1]
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
    if (initialProgress) {
      const resumed = deriveResumableSession(initialProgress, initialFlashcards)
      if (resumed !== null) return 'studying'
    }
    return 'ready'
  })
  const [flashcards, setFlashcards] = useState<FlashcardSet | null>(initialFlashcards)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [msgIndex, setMsgIndex] = useState(0)

  // Full-deck card statuses — accumulates across sessions; restored from persisted progress
  const [cardStatuses, setCardStatuses] = useState<CardStatus[]>(() => {
    if (hasValidProgress(initialProgress, initialFlashcards)) {
      return initialProgress!.card_statuses as CardStatus[]
    }
    return new Array(initialFlashcards?.cards.length ?? 0).fill('unseen') as CardStatus[]
  })

  // Add-cards state (local to PracticeIntro panel, surfaced here for the async action)
  const [isAddingMore, setIsAddingMore] = useState(false)
  const [addMoreError, setAddMoreError] = useState<string | null>(null)
  const [addMsgIndex, setAddMsgIndex] = useState(0)

  // Answer-save state: true while awaiting updateFlashcardStatus RPC (prevents double-submit)
  const [isSavingAnswer, setIsSavingAnswer] = useState(false)
  // Inline error shown on the current card when updateFlashcardStatus fails
  const [answerSaveError, setAnswerSaveError] = useState<string | null>(null)
  // End-session state: true while awaiting clearFlashcardSession RPC
  const [isEndingSession, setIsEndingSession] = useState(false)
  // Error shown in StudyMode header when clearFlashcardSession fails
  const [endSessionError, setEndSessionError] = useState<string | null>(null)

  // Session-start state: true while awaiting start_flashcard_session RPC (Blocker 3)
  const [isStartingSession, setIsStartingSession] = useState(false)
  // Error shown in setup/ready phase when start_flashcard_session fails (Blocker 3)
  const [sessionStartError, setSessionStartError] = useState<string | null>(null)

  // Active session state — restored exactly from persisted session_card_indices on mount
  const [session, setSession] = useState<SessionConfig | null>(() => {
    if (!initialFlashcards || !initialProgress) return null
    return deriveResumableSession(initialProgress, initialFlashcards)?.session ?? null
  })

  const [sessionStatuses, setSessionStatuses] = useState<CardStatus[]>(() => {
    if (!initialFlashcards || !initialProgress) return []
    const resumed = deriveResumableSession(initialProgress, initialFlashcards)
    if (!resumed) return []
    return resumed.session.indices.map(i => (initialProgress.card_statuses[i] as CardStatus) ?? 'unseen')
  })

  // authoritativeIndex: the persisted server position — only advances after a successful
  // updateFlashcardStatus RPC. Determines which card is eligible for answering.
  const [authoritativeIndex, setAuthoritativeIndex] = useState<number>(() => {
    if (!initialFlashcards || !initialProgress) return 0
    return deriveResumableSession(initialProgress, initialFlashcards)?.resumeIndex ?? 0
  })
  // viewIndex: client-only display position — may go backward for review.
  // Never advances beyond authoritativeIndex. Answer controls are only active when
  // viewIndex === authoritativeIndex.
  const [viewIndex, setViewIndex] = useState<number>(() => {
    if (!initialFlashcards || !initialProgress) return 0
    return deriveResumableSession(initialProgress, initialFlashcards)?.resumeIndex ?? 0
  })
  const [flipped, setFlipped] = useState(false)

  const sessionCountRef = useRef(0)

  // Generation message rotation
  useEffect(() => {
    if (phase !== 'generating') return
    const id = setInterval(() => setMsgIndex(i => (i + 1) % GENERATION_MESSAGES.length), 2000)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (!isAddingMore) return
    const id = setInterval(() => setAddMsgIndex(i => (i + 1) % ADD_GENERATION_MESSAGES.length), 1800)
    return () => clearInterval(id)
  }, [isAddingMore])

  async function triggerGenerate() {
    setPhase('generating')
    setErrorMessage(null)
    setMsgIndex(0)
    try {
      const result = await generateFlashcards(documentId)
      setFlashcards(result)
      setCardStatuses(new Array(result.cards.length).fill('unseen') as CardStatus[])
      setPhase('ready')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Flashcard generation failed')
      setPhase('error')
    }
  }

  async function handleAddMore(count: number) {
    setIsAddingMore(true)
    setAddMoreError(null)
    setAddMsgIndex(0)
    try {
      const result = await addFlashcards(documentId, count)
      setFlashcards(result)
      // Extend card statuses: keep existing, append 'unseen' for new cards
      setCardStatuses(prev => {
        const extended = [...prev]
        while (extended.length < result.cards.length) {
          extended.push('unseen')
        }
        return extended
      })
    } catch (err) {
      setAddMoreError(err instanceof Error ? err.message : 'Failed to add cards')
    } finally {
      setIsAddingMore(false)
    }
  }

  function openSetup() {
    setPhase('setup')
  }

  // Blocker 3: async — StudyMode is entered only AFTER the RPC succeeds.
  // On failure: show error in setup/ready phase and allow retry. Never enters StudyMode.
  async function startSession(config: SessionConfig): Promise<void> {
    setIsStartingSession(true)
    setSessionStartError(null)

    const persistedConfig: SessionPersistedConfig = {
      difficulty: config.difficulty,
      selected_topics: config.selectedTopics,
      review_learning_only: config.reviewLearningOnly,
    }

    const { error } = await startFlashcardSession(documentId, config.indices, persistedConfig)
    setIsStartingSession(false)

    if (error) {
      setSessionStartError(error)
      return
    }

    // RPC succeeded — safe to enter StudyMode
    const statuses = new Array(config.cards.length).fill('unseen') as CardStatus[]
    setSession(config)
    setSessionStatuses(statuses)
    setAuthoritativeIndex(0)
    setViewIndex(0)
    setFlipped(false)
    setAnswerSaveError(null)
    setEndSessionError(null)
    setPhase('studying')
  }

  async function startLearningSession(): Promise<void> {
    if (!flashcards) return
    const learningCards: FlashcardItem[] = []
    const learningIndices: number[] = []
    flashcards.cards.forEach((card, i) => {
      if (cardStatuses[i] === 'learning') {
        learningCards.push(card)
        learningIndices.push(i)
      }
    })
    if (learningCards.length === 0) return
    const label = `${learningCards.length} card${learningCards.length !== 1 ? 's' : ''} · Learning`
    await startSession({
      cards: learningCards,
      indices: learningIndices,
      label,
      reviewLearningOnly: true,
      difficulty: 'mixed',
      selectedTopics: [],
    })
  }

  function handleFlip() {
    setFlipped(v => !v)
  }

  async function handleMark(status: 'known' | 'learning') {
    if (!session || !flashcards || isSavingAnswer || isEndingSession) return
    // Always answer the authoritative card — viewIndex may differ when reviewing earlier cards.
    const card = session.cards[authoritativeIndex]
    const fullIdx = session.indices[authoritativeIndex]
    const isLast = authoritativeIndex >= session.cards.length - 1
    const completedAt = isLast ? new Date().toISOString() : undefined

    setIsSavingAnswer(true)
    setAnswerSaveError(null)

    const { error } = await updateFlashcardStatus(documentId, fullIdx, status, completedAt ?? null)
    setIsSavingAnswer(false)

    if (error) {
      // Server rejected — stay on same card; do not advance; do not mark locally
      setAnswerSaveError(error)
      return
    }

    // Server succeeded — now safe to update local state and advance
    const nextSession = [...sessionStatuses]
    nextSession[authoritativeIndex] = status
    setSessionStatuses(nextSession)

    const nextFull = [...cardStatuses]
    nextFull[fullIdx] = status
    setCardStatuses(nextFull)

    if (card?.concept_id) {
      recordConceptResult(documentId, {
        concept_id: card.concept_id,
        concept_title: card.topic,
        correct: status === 'known',
        source: 'flashcard',
      }).catch(() => {})
    }

    if (isLast) {
      sessionCountRef.current += 1
      if (sessionCountRef.current >= 3) {
        const knownCount = nextSession.filter(s => s === 'known').length
        const learningCount = nextSession.filter(s => s === 'learning').length
        void saveMemory({
          source_agent: 'flashcard',
          source_entity_type: 'document',
          source_entity_id: documentId,
          category: 'preference',
          content: 'Prefers flashcard study format for active recall practice',
          metadata: {
            document_id: documentId,
            sessions_completed: sessionCountRef.current,
            last_session_known: knownCount,
            last_session_learning: learningCount,
            last_session_total: session.cards.length,
            completed_at: completedAt,
          },
          importance: 5,
          confidence: 7,
        })
      }
      // Completion screen shown only after server confirms the final answer
      setPhase('done')
    } else {
      const newAuth = authoritativeIndex + 1
      setAuthoritativeIndex(newAuth)
      setViewIndex(newAuth)
      setFlipped(false)
    }
  }

  function handlePrev() {
    if (viewIndex <= 0) return
    setViewIndex(i => i - 1)
    setFlipped(false)
    setAnswerSaveError(null)
  }

  function handleNext() {
    // Cannot navigate beyond the authoritative current card
    if (viewIndex >= authoritativeIndex) return
    setViewIndex(i => i + 1)
    setFlipped(false)
    setAnswerSaveError(null)
  }

  async function endSession() {
    if (isEndingSession || isSavingAnswer) return
    setIsEndingSession(true)
    setEndSessionError(null)
    const { error } = await clearFlashcardSession(documentId)
    setIsEndingSession(false)
    if (error) {
      setEndSessionError(error)
      return
    }
    // RPC confirmed — safe to return to ready state
    setPhase('ready')
    setSession(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!flashcards || phase === 'idle' || phase === 'error') {
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
    const learningCount = cardStatuses.filter(s => s === 'learning').length
    return (
      <PracticeIntro
        flashcards={flashcards}
        learningCount={learningCount}
        isAddingMore={isAddingMore}
        addMsgIndex={addMsgIndex}
        addMoreError={addMoreError}
        isStartingSession={isStartingSession}
        sessionStartError={sessionStartError}
        onSetupSession={openSetup}
        onStartLearning={startLearningSession}
        onRegenerate={triggerGenerate}
        onAddMore={handleAddMore}
      />
    )
  }

  if (phase === 'setup') {
    return (
      <SessionSetup
        flashcards={flashcards}
        onStart={startSession}
        onBack={() => { setPhase('ready'); setSessionStartError(null) }}
        isStarting={isStartingSession}
        startError={sessionStartError}
      />
    )
  }

  if (phase === 'studying' && session) {
    const card = session.cards[viewIndex]
    if (!card) return null
    return (
      <StudyMode
        card={card}
        flipped={flipped}
        viewIndex={viewIndex}
        authoritativeIndex={authoritativeIndex}
        totalCards={session.cards.length}
        isSavingAnswer={isSavingAnswer}
        answerSaveError={answerSaveError}
        isEndingSession={isEndingSession}
        endSessionError={endSessionError}
        onFlip={handleFlip}
        onMark={handleMark}
        onPrev={handlePrev}
        onNext={handleNext}
        onEndSession={endSession}
        onAskTutor={onAskTutor}
      />
    )
  }

  if (phase === 'done' && session) {
    const known = sessionStatuses.filter(s => s === 'known').length
    const learning = sessionStatuses.filter(s => s === 'learning').length
    const totalLearning = cardStatuses.filter(s => s === 'learning').length
    return (
      <DoneScreen
        sessionTotal={session.cards.length}
        known={known}
        learning={learning}
        totalLearningCards={totalLearning}
        sessionLabel={session.label}
        onNewSession={() => setPhase('ready')}
        onSetupNew={openSetup}
        onStudyLearning={totalLearning > 0 ? startLearningSession : undefined}
      />
    )
  }

  return null
}

// ── PracticeIntro ─────────────────────────────────────────────────────────────

function PracticeIntro({
  flashcards,
  learningCount,
  isAddingMore,
  addMsgIndex,
  addMoreError,
  isStartingSession,
  sessionStartError,
  onSetupSession,
  onStartLearning,
  onRegenerate,
  onAddMore,
}: {
  flashcards: FlashcardSet
  learningCount: number
  isAddingMore: boolean
  addMsgIndex: number
  addMoreError: string | null
  isStartingSession: boolean
  sessionStartError: string | null
  onSetupSession: () => void
  onStartLearning: () => void
  onRegenerate: () => void
  onAddMore: (count: number) => void
}) {
  const total  = flashcards.cards.length
  const topics = useMemo(() => [...new Set(flashcards.cards.map(c => c.topic))], [flashcards])

  // Add-cards panel state (local)
  const [showAdd, setShowAdd] = useState(false)
  const [addPreset, setAddPreset] = useState<number>(10)
  const [addCustomActive, setAddCustomActive] = useState(false)
  const [addCustomInput, setAddCustomInput] = useState('')
  const [addCustomError, setAddCustomError] = useState<string | null>(null)

  const ADD_PRESETS = [10, 20, 30]

  const parsedCustom = parseInt(addCustomInput, 10)
  const addCustomValid =
    !isNaN(parsedCustom) && parsedCustom >= 1 && parsedCustom <= ADD_CARDS_MAX

  const effectiveAddCount = addCustomActive
    ? (addCustomValid ? parsedCustom : 0)
    : addPreset

  function handleCustomInput(value: string) {
    setAddCustomInput(value)
    const n = parseInt(value, 10)
    if (value === '') {
      setAddCustomError(null)
    } else if (isNaN(n) || n < 1) {
      setAddCustomError('Enter a number between 1 and 50')
    } else if (n > ADD_CARDS_MAX) {
      setAddCustomError(`Maximum ${ADD_CARDS_MAX} additional cards per request`)
    } else {
      setAddCustomError(null)
    }
  }

  function handleAddSubmit() {
    if (isAddingMore || effectiveAddCount < 1) return
    onAddMore(effectiveAddCount)
    setShowAdd(false)
    setAddCustomActive(false)
    setAddCustomInput('')
  }

  return (
    <div className="flex flex-col gap-8 py-4">

      {/* Header */}
      <div className="max-w-[640px]">
        <h2 className="text-[28px] font-bold tracking-[-0.03em] leading-tight text-foreground/90">
          Flashcards
        </h2>
        <p className="mt-2 text-[16px] text-foreground/55">
          {total} card{total !== 1 ? 's' : ''} available
          {topics.length > 0 ? ` across ${topics.length} topic${topics.length !== 1 ? 's' : ''}` : ''}.
          Configure a focused study session.
        </p>
      </div>

      {/* Primary CTAs */}
      <div className="flex flex-col gap-3 max-w-[400px]">
        <button
          onClick={onSetupSession}
          disabled={isAddingMore || isStartingSession}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-6 py-5 text-left shadow-[var(--shadow-sm)] transition-all duration-150 hover:-translate-y-px hover:shadow-[var(--shadow-md)] disabled:pointer-events-none disabled:opacity-50"
        >
          <div>
            <p className="text-[16px] font-semibold text-foreground/88">Set up session</p>
            <p className="mt-0.5 text-[13px] text-foreground/42">
              Choose difficulty, topics, and how many cards
            </p>
          </div>
          <ArrowRightIcon className="h-5 w-5 shrink-0 text-primary/60" />
        </button>

        {learningCount > 0 && !isAddingMore && (
          <button
            onClick={onStartLearning}
            disabled={isStartingSession}
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-5 py-3.5 text-left transition-colors hover:bg-amber-500/[0.08] disabled:pointer-events-none disabled:opacity-50"
          >
            <div>
              <p className="text-[14px] font-semibold text-amber-500/85">
                {isStartingSession
                  ? 'Starting session…'
                  : `Review ${learningCount} learning card${learningCount !== 1 ? 's' : ''}`}
              </p>
              <p className="mt-0.5 text-[12px] text-foreground/35">
                Continue where you left off
              </p>
            </div>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-amber-500/50" />
          </button>
        )}

        {sessionStartError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
            <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/70" />
            <p className="text-[13px] text-red-400/70">
              Could not start session — {sessionStartError}
            </p>
          </div>
        )}
      </div>

      {/* Add more cards section */}
      {isAddingMore ? (
        <div className="flex items-center gap-3 max-w-[400px] rounded-xl border border-border bg-muted/20 px-5 py-4">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border border-primary/65 border-t-transparent" />
          <p className="text-[14px] font-medium text-foreground/55">
            {ADD_GENERATION_MESSAGES[addMsgIndex]}
          </p>
        </div>
      ) : (
        <div className="max-w-[400px]">
          {addMoreError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
              <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/70" />
              <p className="text-[13px] text-red-400/70">{addMoreError}</p>
            </div>
          )}

          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 text-[13px] font-medium text-foreground/40 transition-colors hover:text-foreground/65"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add more cards to this deck
            </button>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground/62">
                  Add cards to this deck
                </p>
                <button
                  onClick={() => { setShowAdd(false); setAddCustomActive(false); setAddCustomInput(''); setAddCustomError(null) }}
                  className="text-[12px] text-foreground/30 transition-colors hover:text-foreground/55"
                >
                  Cancel
                </button>
              </div>

              {/* Count presets */}
              <div className="flex flex-wrap gap-2">
                {ADD_PRESETS.map(n => (
                  <button
                    key={n}
                    onClick={() => { setAddPreset(n); setAddCustomActive(false) }}
                    className={cn(
                      'rounded-xl border px-3.5 py-1.5 text-[14px] font-semibold transition-colors',
                      !addCustomActive && addPreset === n
                        ? 'border-primary/30 bg-primary/[0.08] text-primary'
                        : 'border-border bg-muted/25 text-foreground/55 hover:border-foreground/12 hover:bg-muted/45',
                    )}
                  >
                    +{n}
                  </button>
                ))}
                <button
                  onClick={() => { setAddCustomActive(true); setAddCustomInput('') }}
                  className={cn(
                    'rounded-xl border px-3.5 py-1.5 text-[14px] font-semibold transition-colors',
                    addCustomActive
                      ? 'border-primary/30 bg-primary/[0.08] text-primary'
                      : 'border-border bg-muted/25 text-foreground/55 hover:border-foreground/12 hover:bg-muted/45',
                  )}
                >
                  Custom
                </button>
              </div>

              {/* Custom input */}
              {addCustomActive && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={ADD_CARDS_MAX}
                      value={addCustomInput}
                      onChange={e => handleCustomInput(e.target.value)}
                      placeholder="e.g. 15"
                      className="w-24 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[14px] font-semibold text-foreground/82 placeholder:text-foreground/25 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                    <span className="text-[13px] text-foreground/38">
                      additional cards (max {ADD_CARDS_MAX})
                    </span>
                  </div>
                  {addCustomError && (
                    <p className="text-[12px] text-red-400/70">{addCustomError}</p>
                  )}
                </div>
              )}

              <p className="text-[12px] text-foreground/30">
                New cards are generated from this source and appended to your deck.
                Existing cards and study progress are preserved.
              </p>

              <button
                onClick={handleAddSubmit}
                disabled={
                  isAddingMore ||
                  effectiveAddCount < 1 ||
                  (addCustomActive && !addCustomValid)
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/28 bg-primary/[0.08] px-4 py-2.5 text-[14px] font-semibold text-primary transition-colors hover:border-primary/42 hover:bg-primary/[0.13] disabled:pointer-events-none disabled:opacity-40"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                Add {effectiveAddCount > 0 ? effectiveAddCount : '…'} cards
              </button>
            </div>
          )}
        </div>
      )}

      {/* Deck meta */}
      <div className="flex items-center gap-4 text-[12px] text-foreground/28 max-w-[640px]">
        <span>
          Generated {new Date(flashcards.created_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}
        </span>
        <span aria-hidden="true">·</span>
        <button
          onClick={onRegenerate}
          disabled={isAddingMore}
          className="flex items-center gap-1 text-foreground/28 transition-colors hover:text-foreground/50 disabled:pointer-events-none"
        >
          <RegenerateIcon className="h-3 w-3" />
          Regenerate deck
        </button>
      </div>
    </div>
  )
}

// ── SessionSetup ──────────────────────────────────────────────────────────────

function SessionSetup({
  flashcards,
  onStart,
  onBack,
  isStarting,
  startError,
}: {
  flashcards: FlashcardSet
  onStart: (config: SessionConfig) => Promise<void>
  onBack: () => void
  isStarting: boolean
  startError: string | null
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed')
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]) // empty = all
  const [cardCount, setCardCount] = useState<number>(0) // 0 = auto-compute
  const [isCustom, setIsCustom] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  const [topicsOpen, setTopicsOpen] = useState(false)

  const allTopics = useMemo(() => [...new Set(flashcards.cards.map(c => c.topic))], [flashcards])

  // Topic-filtered cards
  const topicFiltered = useMemo(() =>
    selectedTopics.length === 0
      ? flashcards.cards
      : flashcards.cards.filter(c => selectedTopics.includes(c.topic)),
    [flashcards, selectedTopics],
  )

  // Per-difficulty counts (within topic filter)
  const difficultyCounts = useMemo(() => ({
    easy:   topicFiltered.filter(c => c.difficulty === 'easy').length,
    medium: topicFiltered.filter(c => c.difficulty === 'medium').length,
    hard:   topicFiltered.filter(c => c.difficulty === 'hard').length,
    mixed:  topicFiltered.length,
  }), [topicFiltered])

  // Difficulty-filtered cards
  const filteredCards = useMemo(() =>
    difficulty === 'mixed'
      ? topicFiltered
      : topicFiltered.filter(c => c.difficulty === difficulty),
    [topicFiltered, difficulty],
  )

  const filteredCount = filteredCards.length

  // Dynamic session presets
  const presets = useMemo(() => getSessionPresets(filteredCount), [filteredCount])

  // Effective selected count
  const parsedCustom = parseInt(customInput, 10)
  const customValid = !isNaN(parsedCustom) && parsedCustom >= 1 && parsedCustom <= filteredCount

  const displayCount = useMemo(() => {
    if (isCustom) return customValid ? parsedCustom : 0
    if (cardCount > 0 && cardCount <= filteredCount) {
      // Validate that cardCount is still a valid preset or "all"
      const allOptions = [...presets, filteredCount]
      if (allOptions.includes(cardCount)) return cardCount
    }
    return defaultSessionCount(presets, filteredCount)
  }, [isCustom, customValid, parsedCustom, cardCount, filteredCount, presets])

  // Reset card count when filters change
  const prevFilteredCount = useRef(filteredCount)
  useEffect(() => {
    if (prevFilteredCount.current !== filteredCount) {
      setCardCount(0)
      setIsCustom(false)
      setCustomInput('')
      setCustomError(null)
      prevFilteredCount.current = filteredCount
    }
  }, [filteredCount])

  // Derive final session cards and their original indices
  const { finalCards, finalIndices } = useMemo(() => {
    if (displayCount <= 0) return { finalCards: [], finalIndices: [] }
    const selected = filteredCards.slice(0, displayCount)
    const indices  = selected.map(card => flashcards.cards.indexOf(card))
    return { finalCards: selected, finalIndices: indices }
  }, [filteredCards, displayCount, flashcards])

  const canStart = finalCards.length > 0

  // Build session summary label
  const summaryLabel = useMemo(() => {
    if (!canStart) return ''
    const countStr  = displayCount === filteredCount ? `All ${displayCount}` : `${displayCount}`
    const diffStr   = difficulty === 'mixed' ? 'Mixed' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
    const topicStr  = selectedTopics.length === 0
      ? 'All topics'
      : selectedTopics.length === 1
        ? selectedTopics[0]
        : `${selectedTopics.length} topics`
    return `${countStr} cards · ${diffStr} · ${topicStr}`
  }, [displayCount, filteredCount, difficulty, selectedTopics, canStart])

  function handleStart() {
    if (!canStart || isStarting) return
    void onStart({
      cards: finalCards,
      indices: finalIndices,
      label: summaryLabel,
      reviewLearningOnly: false,
      difficulty,
      selectedTopics,
    })
  }

  function toggleTopic(topic: string) {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic],
    )
  }

  function selectPresetCount(n: number) {
    setCardCount(n)
    setIsCustom(false)
    setCustomInput('')
    setCustomError(null)
  }

  function selectAllCount() {
    setCardCount(filteredCount)
    setIsCustom(false)
    setCustomInput('')
    setCustomError(null)
  }

  function activateCustom() {
    setIsCustom(true)
    setCardCount(0)
    setCustomInput('')
    setCustomError(null)
  }

  function handleCustomInput(value: string) {
    setCustomInput(value)
    const n = parseInt(value, 10)
    if (value === '') {
      setCustomError(null)
    } else if (isNaN(n) || n < 1) {
      setCustomError('Enter a number of at least 1')
    } else if (n > filteredCount) {
      setCustomError(`Maximum ${filteredCount} card${filteredCount !== 1 ? 's' : ''} match this setup`)
    } else {
      setCustomError(null)
    }
  }

  const DIFF_OPTIONS: Array<{ id: Difficulty; label: string }> = [
    { id: 'mixed',  label: 'Mixed' },
    { id: 'easy',   label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard',   label: 'Hard' },
  ]

  return (
    <div className="flex flex-col gap-10 py-4 max-w-[560px]">

      {/* Heading */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] text-foreground/38 transition-colors hover:text-foreground/62 mb-5"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back
        </button>
        <h2 className="text-[24px] font-bold tracking-[-0.025em] text-foreground/88">
          Set up your session
        </h2>
        <p className="mt-1 text-[14px] text-foreground/40">
          {flashcards.cards.length} card{flashcards.cards.length !== 1 ? 's' : ''} in your deck
        </p>
      </div>

      {/* Section: Difficulty */}
      <div className="flex flex-col gap-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/30">
          Difficulty
        </h3>
        <div className="flex flex-col gap-2">
          {DIFF_OPTIONS.map(({ id, label }) => {
            const count    = difficultyCounts[id]
            const disabled = count === 0
            const active   = difficulty === id
            return (
              <button
                key={id}
                onClick={() => { if (!disabled) setDifficulty(id) }}
                disabled={disabled}
                className={cn(
                  'flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors duration-150',
                  active && !disabled
                    ? 'border-primary/30 bg-primary/[0.07]'
                    : disabled
                      ? 'border-border/40 bg-muted/10 opacity-40 cursor-not-allowed'
                      : 'border-border bg-muted/20 hover:border-foreground/12 hover:bg-muted/35',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'h-4 w-4 rounded-full border-2 transition-colors',
                    active && !disabled ? 'border-primary bg-primary' : 'border-foreground/20 bg-transparent',
                  )} />
                  <span className={cn(
                    'text-[15px] font-semibold',
                    active && !disabled ? 'text-primary' : disabled ? 'text-foreground/30' : 'text-foreground/75',
                  )}>
                    {label}
                  </span>
                </div>
                <span className={cn(
                  'text-[13px]',
                  active && !disabled ? 'text-primary/60' : 'text-foreground/30',
                )}>
                  {disabled ? 'None available' : id === 'mixed' ? `${count} cards` : `${count} available`}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Section: Topics */}
      {allTopics.length > 1 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/30">
            Topics
          </h3>

          <button
            onClick={() => setTopicsOpen(v => !v)}
            className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/35"
          >
            <span className="text-[14px] font-medium text-foreground/72">
              {selectedTopics.length === 0
                ? `All ${allTopics.length} topics`
                : `${selectedTopics.length} of ${allTopics.length} topics selected`}
            </span>
            <ChevronDownIcon className={cn('h-4 w-4 text-foreground/35 transition-transform duration-150', topicsOpen && 'rotate-180')} />
          </button>

          {topicsOpen && (
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
              <button
                onClick={() => setSelectedTopics([])}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                  selectedTopics.length === 0 ? 'bg-primary/[0.07] text-primary' : 'text-foreground/55 hover:bg-muted/40',
                )}
              >
                <span className="text-[14px] font-medium">All topics</span>
                {selectedTopics.length === 0 && <CheckIcon className="h-4 w-4 text-primary" />}
              </button>
              {allTopics.map(topic => {
                const topicCount = flashcards.cards.filter(c => c.topic === topic).length
                const isSelected = selectedTopics.includes(topic)
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                      isSelected ? 'bg-primary/[0.07]' : 'hover:bg-muted/40',
                    )}
                  >
                    <span className={cn('text-[14px] font-medium', isSelected ? 'text-primary' : 'text-foreground/65')}>
                      {topic}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-foreground/30">{topicCount}</span>
                      {isSelected && <CheckIcon className="h-3.5 w-3.5 text-primary" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Section: Number of cards */}
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/30">
            Cards
          </h3>
          {filteredCount > 0 && (
            <span className="text-[12px] text-foreground/30">
              {filteredCount} matching
            </span>
          )}
        </div>

        {filteredCount === 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
            <p className="text-[14px] text-foreground/45">
              No cards match this configuration. Try a different difficulty or topic.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Preset pills + All + Custom */}
            <div className="flex flex-wrap gap-2">
              {presets.map(n => (
                <button
                  key={n}
                  onClick={() => selectPresetCount(n)}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-[14px] font-semibold transition-colors duration-150',
                    !isCustom && displayCount === n
                      ? 'border-primary/30 bg-primary/[0.08] text-primary'
                      : 'border-border bg-muted/20 text-foreground/55 hover:border-foreground/12 hover:bg-muted/40',
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={selectAllCount}
                className={cn(
                  'rounded-xl border px-4 py-2 text-[14px] font-semibold transition-colors duration-150',
                  !isCustom && displayCount === filteredCount && (presets.length === 0 || cardCount === filteredCount)
                    ? 'border-primary/30 bg-primary/[0.08] text-primary'
                    : 'border-border bg-muted/20 text-foreground/55 hover:border-foreground/12 hover:bg-muted/40',
                )}
              >
                All {filteredCount}
              </button>
              <button
                onClick={activateCustom}
                className={cn(
                  'rounded-xl border px-4 py-2 text-[14px] font-semibold transition-colors duration-150',
                  isCustom
                    ? 'border-primary/30 bg-primary/[0.08] text-primary'
                    : 'border-border bg-muted/20 text-foreground/55 hover:border-foreground/12 hover:bg-muted/40',
                )}
              >
                Custom
              </button>
            </div>

            {/* Custom count input */}
            {isCustom && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={filteredCount}
                    value={customInput}
                    onChange={e => handleCustomInput(e.target.value)}
                    placeholder="e.g. 12"
                    autoFocus
                    className="w-24 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[14px] font-semibold text-foreground/82 placeholder:text-foreground/25 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                  <span className="text-[13px] text-foreground/38">
                    of {filteredCount} available
                  </span>
                </div>
                {customError && (
                  <p className="text-[12px] text-red-400/70">{customError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Session summary + Start */}
      <div className="flex flex-col gap-4 border-t border-border/40 pt-6">
        {canStart ? (
          <>
            <p className="text-[14px] text-foreground/50">{summaryLabel}</p>
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.09] px-6 py-3 text-[15px] font-semibold text-primary shadow-[var(--shadow-xs)] transition-all duration-150 hover:-translate-y-px hover:border-primary/45 hover:bg-primary/[0.13] disabled:pointer-events-none disabled:opacity-60"
            >
              {isStarting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border border-primary/65 border-t-transparent" />
                  Starting…
                </>
              ) : (
                <>
                  <PlayIcon className="h-4 w-4" />
                  Start {displayCount}-card session
                </>
              )}
            </button>
            {startError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
                <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/70" />
                <p className="text-[13px] text-red-400/70">
                  Session could not be started — {startError}. Please try again.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-[14px] text-foreground/40">
            {isCustom && !customValid && customInput !== ''
              ? 'Enter a valid card count to start.'
              : 'No cards match this setup. Change difficulty or topic selection.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ── StudyMode ─────────────────────────────────────────────────────────────────

function StudyMode({
  card,
  flipped,
  viewIndex,
  authoritativeIndex,
  totalCards,
  isSavingAnswer,
  answerSaveError,
  isEndingSession,
  endSessionError,
  onFlip,
  onMark,
  onPrev,
  onNext,
  onEndSession,
  onAskTutor,
}: {
  card: FlashcardItem
  flipped: boolean
  viewIndex: number
  authoritativeIndex: number
  totalCards: number
  isSavingAnswer: boolean
  answerSaveError: string | null
  isEndingSession: boolean
  endSessionError: string | null
  onFlip: () => void
  onMark: (status: 'known' | 'learning') => void
  onPrev: () => void
  onNext: () => void
  onEndSession: () => void
  onAskTutor?: (prompt: string, mode?: TutorMode) => void
}) {
  const progress = ((viewIndex + 1) / totalCards) * 100
  const atAuthoritativeCard = viewIndex === authoritativeIndex

  // Keyboard controls — answer keys only active when at the authoritative card and not saving
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'Enter' && !flipped) { onFlip(); return }
      if (flipped && atAuthoritativeCard && !isSavingAnswer && !isEndingSession) {
        if (e.key === '1') { onMark('learning'); return }
        if (e.key === '2') { onMark('known'); return }
      }
      if (e.key === 'ArrowLeft')  onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, atAuthoritativeCard, isSavingAnswer, isEndingSession, onFlip, onMark, onPrev, onNext])

  return (
    <div className="flex flex-col gap-6">

      {/* Session header */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-foreground/55">
          {viewIndex + 1} <span className="text-foreground/28">of</span> {totalCards}
        </span>
        <button
          onClick={onEndSession}
          disabled={isEndingSession || isSavingAnswer}
          className="flex items-center gap-1.5 text-[13px] text-foreground/32 transition-colors hover:text-foreground/55 disabled:pointer-events-none disabled:opacity-40"
        >
          {isEndingSession && (
            <span className="h-3 w-3 animate-spin rounded-full border border-foreground/40 border-t-transparent" />
          )}
          {isEndingSession ? 'Ending…' : 'End session'}
        </button>
      </div>

      {/* End-session error */}
      {endSessionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
          <WarningIcon className="h-3.5 w-3.5 shrink-0 text-red-400/70" />
          <p className="text-[12px] text-red-400/70">
            Could not end session — {endSessionError}. Please try again.
          </p>
        </div>
      )}

      {/* Progress line */}
      <div className="h-[3px] overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full bg-primary/55 transition-all duration-400 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Flashcard */}
      <div
        className="cursor-pointer select-none"
        style={{ perspective: '1400px' }}
        onClick={onFlip}
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Card answer shown. Press Enter to flip back.' : 'Flashcard — press Enter or click to reveal answer'}
        onKeyDown={e => { if (e.key === 'Enter') onFlip() }}
      >
        <div
          className="relative min-h-[300px] w-full sm:min-h-[340px]"
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.48s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-md)]"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          >
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/25">
              {card.topic}
            </p>
            <p className="text-[22px] font-bold leading-snug tracking-[-0.02em] text-foreground/88 sm:text-[26px]">
              {card.front}
            </p>
            <p className="mt-6 text-[12px] text-foreground/20">
              Press Enter or tap to reveal
            </p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-card p-8 text-center shadow-[var(--shadow-md)]"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/25">
              {card.topic}
            </p>
            <p className="text-[18px] font-semibold leading-relaxed text-foreground/82 sm:text-[20px]">
              {card.back}
            </p>
            <span className="mt-5 rounded-full border border-foreground/10 bg-muted/40 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-foreground/38">
              {card.difficulty}
            </span>
          </div>
        </div>
      </div>

      {/* Response controls */}
      {flipped ? (
        atAuthoritativeCard ? (
          <div className="flex flex-col items-center gap-4">
            {/* Answer save error */}
            {answerSaveError && (
              <div className="flex items-start gap-2 w-full max-w-[400px] rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
                <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/70" />
                <p className="text-[13px] text-red-400/70">
                  Could not save — {answerSaveError}. Tap Not quite or Got it to retry.
                </p>
              </div>
            )}
            <div className="flex gap-3 w-full max-w-[400px]">
              <button
                onClick={() => onMark('learning')}
                disabled={isSavingAnswer || isEndingSession}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-foreground/12 bg-muted/35 px-4 py-3.5 text-[15px] font-semibold text-foreground/60 transition-colors hover:border-foreground/20 hover:bg-muted/55 disabled:pointer-events-none disabled:opacity-50"
              >
                {isSavingAnswer ? (
                  <span className="h-4 w-4 animate-spin rounded-full border border-foreground/40 border-t-transparent" />
                ) : (
                  <XIcon className="h-4 w-4" />
                )}
                Not quite
              </button>
              <button
                onClick={() => onMark('known')}
                disabled={isSavingAnswer || isEndingSession}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary/28 bg-primary/[0.08] px-4 py-3.5 text-[15px] font-semibold text-primary transition-colors hover:border-primary/42 hover:bg-primary/[0.13] disabled:pointer-events-none disabled:opacity-50"
              >
                {isSavingAnswer ? (
                  <span className="h-4 w-4 animate-spin rounded-full border border-primary/50 border-t-transparent" />
                ) : (
                  <CheckIcon className="h-4 w-4" />
                )}
                Got it
              </button>
            </div>
            {!isSavingAnswer && !answerSaveError && (
              <p className="text-[11px] text-foreground/20">Press 1 for Not quite · 2 for Got it</p>
            )}

            {onAskTutor && !isSavingAnswer && (
              <button
                onClick={() => onAskTutor(
                  `Help me understand this flashcard better. Question: "${card.front}" / Answer: "${card.back}"`,
                  'explain',
                )}
                className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/32 transition-colors hover:text-foreground/55"
              >
                Ask MoLis to explain this
              </button>
            )}
          </div>
        ) : (
          /* Reviewing an earlier card — answer controls suppressed */
          <div className="flex flex-col items-center gap-4">
            <p className="text-[12px] text-foreground/38 text-center">
              Reviewing card {viewIndex + 1} — navigate to card {authoritativeIndex + 1} to answer
            </p>
            <div className="flex items-center gap-3 max-w-[400px] w-full">
              <button
                onClick={onPrev}
                disabled={viewIndex === 0}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-[13px] font-medium text-foreground/40 transition-colors hover:text-foreground/62 disabled:pointer-events-none disabled:opacity-25"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
                Prev
              </button>
              <div className="flex-1" />
              <button
                onClick={onNext}
                className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2 text-[13px] font-medium text-primary/70 transition-colors hover:bg-primary/[0.10]"
              >
                Next
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="flex items-center justify-between gap-3 max-w-[400px] mx-auto w-full">
          <button
            onClick={onPrev}
            disabled={viewIndex === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-[13px] font-medium text-foreground/40 transition-colors hover:text-foreground/62 disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            Prev
          </button>
          <button
            onClick={onFlip}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted/35 py-2.5 text-[14px] font-medium text-foreground/45 transition-colors hover:bg-muted/55"
          >
            Reveal answer
          </button>
          <button
            onClick={onNext}
            disabled={viewIndex >= authoritativeIndex}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-[13px] font-medium text-foreground/40 transition-colors hover:text-foreground/62 disabled:pointer-events-none disabled:opacity-25"
          >
            Next
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── DoneScreen ────────────────────────────────────────────────────────────────

function DoneScreen({
  sessionTotal,
  known,
  learning,
  totalLearningCards,
  sessionLabel,
  onNewSession,
  onSetupNew,
  onStudyLearning,
}: {
  sessionTotal: number
  known: number
  learning: number
  totalLearningCards: number
  sessionLabel: string
  onNewSession: () => void
  onSetupNew: () => void
  onStudyLearning?: () => void
}) {
  return (
    <div className="flex flex-col gap-8 py-4 max-w-[500px]">
      <div>
        <h2 className="text-[28px] font-bold tracking-[-0.03em] text-foreground/88">
          Session complete
        </h2>
        <p className="mt-2 text-[14px] text-foreground/38">{sessionLabel}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-[var(--shadow-xs)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] text-foreground/55">{sessionTotal} cards reviewed</span>
          </div>
          <div className="h-px bg-border/40" />
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] text-foreground/72">Got it</span>
            <span className="text-[22px] font-bold tabular-nums text-foreground/85">{known}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] text-foreground/55">Need another look</span>
            <span className="text-[22px] font-bold tabular-nums text-foreground/60">{learning}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onSetupNew}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/28 bg-primary/[0.08] px-6 py-3 text-[14px] font-semibold text-primary transition-colors hover:border-primary/42 hover:bg-primary/[0.13]"
        >
          <CardsIcon className="h-4 w-4" />
          Set up new session
        </button>

        {onStudyLearning && totalLearningCards > 0 && (
          <button
            onClick={onStudyLearning}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-foreground/12 bg-muted/35 px-5 py-2.5 text-[14px] font-medium text-foreground/55 transition-colors hover:text-foreground/75"
          >
            Review {totalLearningCards} learning card{totalLearningCards !== 1 ? 's' : ''}
          </button>
        )}

        <button
          onClick={onNewSession}
          className="text-[13px] text-foreground/32 transition-colors hover:text-foreground/55"
        >
          Back to Practice
        </button>
      </div>
    </div>
  )
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
    <div className="flex flex-col gap-5 py-4">
      {phase === 'error' && errorMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/18 bg-red-500/[0.05] px-4 py-3.5 max-w-[560px]">
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
          <p className="text-[14px] leading-relaxed text-red-400/75">{errorMessage}</p>
        </div>
      )}
      <div className="flex flex-col gap-6 max-w-[560px]">
        <div>
          <h2 className="text-[28px] font-bold tracking-[-0.03em] text-foreground/88">Flashcards</h2>
          <p className="mt-2 text-[15px] text-foreground/50">
            {hasExtractedText
              ? 'Generate AI-powered flashcards from this source.'
              : 'Extract source text first, then generate flashcards.'}
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={!hasExtractedText}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/28 bg-primary/[0.08] px-5 py-2.5 text-[14px] font-semibold text-primary transition-colors hover:border-primary/42 hover:bg-primary/[0.13] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SparklesIcon className="h-4 w-4" />
          Generate flashcards
        </button>
      </div>
    </div>
  )
}

// ── GeneratingSkeleton ────────────────────────────────────────────────────────

function GeneratingSkeleton({ msgIndex }: { msgIndex: number }) {
  return (
    <div className="flex flex-col gap-8 py-4 max-w-[560px]">
      <div>
        <h2 className="text-[28px] font-bold tracking-[-0.03em] text-foreground/88">Flashcards</h2>
        <div className="mt-5 flex items-center gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-primary/65 border-t-transparent" />
          </div>
          <p className="text-[15px] font-medium text-foreground/60">{GENERATION_MESSAGES[msgIndex]}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/25 p-5">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  )
}

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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
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
