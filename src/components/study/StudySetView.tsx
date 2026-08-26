'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ExtractionPanel } from '@/components/study/ExtractionPanel'
import { RevisionNotesPanel } from '@/components/study/RevisionNotesPanel'
import { QuizPanel } from '@/components/study/QuizPanel'
import { FlashcardsPanel } from '@/components/study/FlashcardsPanel'
import { VisualsPanel } from '@/components/study/VisualsPanel'
import { StudyPlanCard } from '@/components/study/StudyPlanCard'
import { TutorPanel } from '@/components/study/TutorPanel'
import type { TutorPanelHandle } from '@/components/study/TutorPanel'
import type { RevisionNote } from '@/types/revisionNotes'
import type { Quiz } from '@/types/quiz'
import type { FlashcardSet } from '@/types/flashcard'
import type { PublicVisualSet } from '@/types/studyVisual'
import type { ConceptMastery } from '@/types/conceptMastery'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { StudyPlan, LinkedAction } from '@/types/studyPlan'
import type { FlashcardProgress } from '@/types/flashcardProgress'
import type { QuizAttempt } from '@/types/quizAttempt'
import type { TutorMessage, TutorMode } from '@/types/tutor'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StudyDoc {
  id: string
  title: string
  file_type: string
  file_path: string | null
  created_at: string
  extracted_text: string | null
  source_type?: string | null
}

interface Props {
  doc: StudyDoc
  signedUrl: string | null
  initialNotes: RevisionNote | null
  initialQuiz: Quiz | null
  initialFlashcards: FlashcardSet | null
  initialVisuals: PublicVisualSet | null
  weakTopics: ConceptMastery[]
  initialAnalysis: DocumentAnalysis | null
  initialStudyPlan: StudyPlan | null
  initialFlashcardProgress: FlashcardProgress | null
  initialQuizAttempt: QuizAttempt | null
  initialTutorMessages: TutorMessage[]
  initialTab: string
}

// Internal tab IDs are stable — used for URL deep linking, panel mounting, and
// all child component callbacks. Modes are the student-facing navigation layer.
type Tab = 'overview' | 'notes' | 'flashcards' | 'quiz' | 'visuals' | 'weak-topics' | 'tutor'
type Mode = 'learn' | 'practice' | 'visualise' | 'review' | 'ask'

const MODES: Array<{
  id: Mode
  label: string
  icon: (p: { className?: string }) => React.ReactElement
}> = [
  { id: 'learn',     label: 'Learn',      icon: BookOpenIcon },
  { id: 'practice',  label: 'Practice',   icon: CardsIcon },
  { id: 'visualise', label: 'Visualise',  icon: VisualIcon },
  { id: 'review',    label: 'Review',     icon: ArrowPathIcon },
  { id: 'ask',       label: 'Ask MoLis',  icon: TutorIcon },
]

function tabToMode(tab: Tab): Mode {
  if (tab === 'overview' || tab === 'notes') return 'learn'
  if (tab === 'flashcards' || tab === 'quiz') return 'practice'
  if (tab === 'visuals') return 'visualise'
  if (tab === 'weak-topics') return 'review'
  return 'ask'
}

function modeToDefaultTab(mode: Mode): Tab {
  switch (mode) {
    case 'learn':     return 'overview'
    case 'practice':  return 'flashcards'
    case 'visualise': return 'visuals'
    case 'review':    return 'weak-topics'
    case 'ask':       return 'tutor'
  }
}

function validateTab(raw: string): Tab {
  const valid: Tab[] = ['overview', 'notes', 'flashcards', 'quiz', 'visuals', 'weak-topics', 'tutor']
  return valid.includes(raw as Tab) ? (raw as Tab) : 'overview'
}

function fileTypeLabel(mimeType: string, sourceType?: string | null): string {
  if (mimeType === 'transcript' || sourceType === 'recording') return 'Lecture recording'
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'text/plain': 'Text',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  }
  return map[mimeType] ?? (mimeType.split('/')[1]?.toUpperCase() || 'File')
}

// ── StudySetView ──────────────────────────────────────────────────────────────

export function StudySetView({
  doc,
  signedUrl,
  initialNotes,
  initialQuiz,
  initialFlashcards,
  initialVisuals,
  weakTopics,
  initialAnalysis,
  initialStudyPlan,
  initialFlashcardProgress,
  initialQuizAttempt,
  initialTutorMessages,
  initialTab,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(validateTab(initialTab))
  const [liveWeakTopics, setLiveWeakTopics] = useState<ConceptMastery[]>(weakTopics)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tutorPanelRef = useRef<TutorPanelHandle>(null)

  const handleWeakTopicsRefresh = useCallback((topics: ConceptMastery[]) => {
    const weak = topics.filter(
      (c) => c.review_count > 0 && (c.mastery_score < 50 || c.forgetting_risk === 'medium' || c.forgetting_risk === 'high'),
    )
    setLiveWeakTopics(weak)
  }, [])

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    scrollContainerRef.current?.scrollTo({ top: 0 })
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url.toString())
  }

  function openTutorWithPrompt(prompt: string, mode?: TutorMode) {
    setActiveTab('tutor')
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'tutor')
    window.history.replaceState({}, '', url.toString())
    tutorPanelRef.current?.prefill(prompt, mode)
  }

  const hasExtractedText = !!doc.extracted_text
  const activeMode = tabToMode(activeTab)

  // Header computed values
  const isRecordingDoc = doc.file_type === 'transcript' || doc.source_type === 'recording'
  const srcLabel = fileTypeLabel(doc.file_type, doc.source_type)
  const headerConcepts = initialAnalysis?.key_concepts ?? []
  const headerHighExam = initialAnalysis?.likely_exam_topics.filter(t => t.importance === 'high') ?? []
  const readiness = initialStudyPlan?.overall_exam_readiness
  const readinessBadgeStyle = readiness == null
    ? ''
    : readiness >= 70
      ? 'border-emerald-500/22 bg-emerald-500/[0.07] text-emerald-500'
      : readiness >= 40
        ? 'border-amber-500/22 bg-amber-500/[0.07] text-amber-500'
        : 'border-primary/22 bg-primary/[0.07] text-primary'

  return (
    <div className="flex flex-1 flex-col min-h-0">

      {/* ── Unified Workspace Header ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card/60">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">

          {/* Back navigation */}
          <div className="pt-4 pb-3.5">
            <Link
              href="/dashboard/study"
              className="inline-flex items-center gap-1.5 text-[13px] text-foreground/38 transition-colors duration-150 hover:text-foreground/65"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Library
            </Link>
          </div>

          {/* Source identity */}
          <div className="pb-5 flex items-start gap-4">
            <div className={cn(
              'mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
              isRecordingDoc
                ? 'border-primary/20 bg-primary/[0.07]'
                : 'border-foreground/[0.08] bg-muted/55'
            )}>
              {isRecordingDoc
                ? <MicIcon className="h-[18px] w-[18px] text-primary/65" />
                : <BookOpenIcon className="h-[18px] w-[18px] text-foreground/35" />
              }
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.5rem] font-bold tracking-[-0.03em] leading-tight text-foreground/90 sm:text-[1.75rem]">
                {doc.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {initialAnalysis?.subject_area && (
                  <span className="text-[14px] font-medium text-foreground/55">{initialAnalysis.subject_area}</span>
                )}
                <span className="text-[13px] text-foreground/32">{srcLabel}</span>
                {readiness != null && (
                  <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums', readinessBadgeStyle)}>
                    {readiness === 0 ? 'Exam readiness · Starting' : `Exam readiness ${readiness}%`}
                  </span>
                )}
              </div>
              {(headerConcepts.length > 0 || headerHighExam.length > 0 || initialAnalysis?.estimated_study_minutes) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[12px] text-foreground/30">
                  {headerConcepts.length > 0 && (
                    <span>{headerConcepts.length} concept{headerConcepts.length !== 1 ? 's' : ''}</span>
                  )}
                  {headerHighExam.length > 0 && (
                    <span>{headerHighExam.length} exam area{headerHighExam.length !== 1 ? 's' : ''}</span>
                  )}
                  {initialAnalysis?.estimated_study_minutes != null && (
                    <span>~{initialAnalysis.estimated_study_minutes}m to study</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Primary mode navigation — underline indicator style */}
          <div className="flex items-end overflow-x-auto scrollbar-hide -mb-px">
            {MODES.map((mode) => {
              const isActive = activeMode === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => handleTabChange(modeToDefaultTab(mode.id))}
                  className={cn(
                    'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-[15px] font-semibold transition-colors duration-150',
                    isActive
                      ? 'border-primary text-foreground/90'
                      : 'border-transparent text-foreground/50 hover:border-foreground/14 hover:text-foreground/68'
                  )}
                >
                  <mode.icon className={cn(
                    'h-[19px] w-[19px] transition-colors duration-150',
                    isActive ? 'text-primary' : 'text-foreground/35'
                  )} />
                  {mode.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Sub-navigation — only for Learn and Practice */}
        {(activeMode === 'learn' || activeMode === 'practice') && (
          <div className="border-t border-border/40 bg-muted/20">
            <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
              <div className="flex items-center gap-0.5 py-1.5">
                {activeMode === 'learn' ? (
                  <>
                    <SubTab active={activeTab === 'overview'} onClick={() => handleTabChange('overview')}>Overview</SubTab>
                    <SubTab active={activeTab === 'notes'} onClick={() => handleTabChange('notes')}>Notes</SubTab>
                  </>
                ) : (
                  <>
                    <SubTab active={activeTab === 'flashcards'} onClick={() => handleTabChange('flashcards')}>Flashcards</SubTab>
                    <SubTab active={activeTab === 'quiz'} onClick={() => handleTabChange('quiz')}>Quiz</SubTab>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      {/* All panels stay mounted (display:none when inactive) so state is
          preserved across tab switches — quiz progress, tutor messages, etc.
          Tutor tab uses overflow-hidden + flex-col so TutorPanel owns its
          internal scroll; other tabs use normal page scroll. */}
      <div
        className={`flex-1 min-h-0 ${activeTab === 'tutor' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}
        ref={scrollContainerRef}
      >
        <div className={`mx-auto max-w-[1200px] px-5 sm:px-8 ${activeTab === 'tutor' ? 'flex-1 min-h-0 flex flex-col' : 'py-8'}`}>

          <div className={activeTab !== 'overview' ? 'hidden' : ''}>
            <OverviewTab
              doc={doc}
              signedUrl={signedUrl}
              hasNotes={!!initialNotes}
              hasFlashcards={!!initialFlashcards}
              hasQuiz={!!initialQuiz}
              hasVisuals={!!initialVisuals}
              weakTopicsCount={liveWeakTopics.length}
              weakTopics={liveWeakTopics}
              analysis={initialAnalysis}
              studyPlan={initialStudyPlan}
              quizAttempt={initialQuizAttempt}
              flashcardProgress={initialFlashcardProgress}
              tutorMessageCount={initialTutorMessages.length}
              onNavigate={handleTabChange}
              onAskTutor={openTutorWithPrompt}
            />
          </div>

          <div className={activeTab !== 'notes' ? 'hidden' : ''}>
            <RevisionNotesPanel
              documentId={doc.id}
              hasExtractedText={hasExtractedText}
              initialNotes={initialNotes}
              analysis={initialAnalysis}
            />
          </div>

          <div className={activeTab !== 'flashcards' ? 'hidden' : ''}>
            <FlashcardsPanel
              documentId={doc.id}
              hasExtractedText={hasExtractedText}
              initialFlashcards={initialFlashcards}
              initialProgress={initialFlashcardProgress}
              analysis={initialAnalysis}
              onAskTutor={openTutorWithPrompt}
            />
          </div>

          <div className={activeTab !== 'quiz' ? 'hidden' : ''}>
            <QuizPanel
              documentId={doc.id}
              hasExtractedText={hasExtractedText}
              initialQuiz={initialQuiz}
              initialAttempt={initialQuizAttempt}
              analysis={initialAnalysis}
              onAskTutor={openTutorWithPrompt}
              onWeakTopicsRefresh={handleWeakTopicsRefresh}
            />
          </div>

          <div className={activeTab !== 'visuals' ? 'hidden' : ''}>
            <VisualsPanel
              documentId={doc.id}
              hasExtractedText={hasExtractedText}
              initialVisuals={initialVisuals}
              analysis={initialAnalysis}
              onAskTutor={openTutorWithPrompt}
            />
          </div>

          <div className={activeTab !== 'weak-topics' ? 'hidden' : ''}>
            <WeakTopicsTab
              weakTopics={liveWeakTopics}
              onGoToQuiz={() => handleTabChange('quiz')}
              onAskTutor={openTutorWithPrompt}
            />
          </div>

          <div className={activeTab !== 'tutor' ? 'hidden' : 'flex-1 min-h-0 flex flex-col pt-4'}>
            <TutorPanel
              ref={tutorPanelRef}
              documentId={doc.id}
              initialMessages={initialTutorMessages}
              onAction={(tab) => handleTabChange(tab as Tab)}
            />
          </div>

        </div>
      </div>
    </div>
  )
}

// ── SubTab ────────────────────────────────────────────────────────────────────

function SubTab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150',
        active
          ? 'bg-primary/[0.09] text-primary'
          : 'text-foreground/38 hover:bg-foreground/[0.04] hover:text-foreground/62'
      )}
    >
      {children}
    </button>
  )
}

// ── OverviewTab ───────────────────────────────────────────────────────────────

interface OverviewProps {
  doc: StudyDoc
  signedUrl: string | null
  hasNotes: boolean
  hasFlashcards: boolean
  hasQuiz: boolean
  hasVisuals: boolean
  weakTopicsCount: number
  weakTopics: ConceptMastery[]
  analysis: DocumentAnalysis | null
  studyPlan: StudyPlan | null
  quizAttempt: QuizAttempt | null
  flashcardProgress: FlashcardProgress | null
  tutorMessageCount: number
  onNavigate: (tab: Tab) => void
  onAskTutor: (prompt: string, mode?: TutorMode) => void
}

function OverviewTab({
  doc,
  signedUrl,
  hasNotes,
  hasFlashcards,
  hasQuiz,
  hasVisuals,
  weakTopicsCount,
  weakTopics,
  analysis,
  studyPlan,
  quizAttempt,
  flashcardProgress,
  tutorMessageCount,
  onNavigate,
  onAskTutor,
}: OverviewProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)

  const isAnalysed = !!doc.extracted_text && analysis !== null
  const isRecording = doc.file_type === 'transcript' || doc.source_type === 'recording'

  // Analysis intelligence
  const allConcepts = analysis?.key_concepts ?? []
  const coreConcepts = allConcepts.filter(k => k.importance === 'core')
  const displayConcepts = coreConcepts.length >= 5 ? coreConcepts : allConcepts
  const highExamTopics = analysis?.likely_exam_topics.filter(t => t.importance === 'high') ?? []
  const medExamTopics = analysis?.likely_exam_topics.filter(t => t.importance === 'medium') ?? []
  const allExamTopics = [...highExamTopics, ...medExamTopics]
  const defCount = analysis?.definitions.length ?? 0
  const formulaCount = analysis?.formulas.length ?? 0
  const misconceptionCount = analysis?.misconceptions.length ?? 0

  // Primary next action CTA
  const actionLabels: Record<LinkedAction, string> = {
    notes: 'Open your notes',
    flashcards: 'Practice flashcards',
    quiz: 'Take the quiz',
    tutor: 'Ask MoLis',
  }
  const firstBlock = studyPlan?.study_blocks[0]
  const nextActionText =
    studyPlan?.recommended_next_action ??
    (weakTopicsCount > 0
      ? `Review ${weakTopicsCount} concept${weakTopicsCount !== 1 ? 's' : ''} that need attention`
      : hasFlashcards
        ? 'Practice your flashcards'
        : hasNotes
          ? 'Read your revision notes'
          : 'Generate your study tools to get started')

  let ctaLabel = 'Start learning'
  let ctaAction: Tab = 'notes'
  if (studyPlan && firstBlock) {
    ctaLabel = actionLabels[firstBlock.linked_action]
    ctaAction = firstBlock.linked_action as Tab
  } else if (weakTopicsCount > 0) {
    ctaLabel = 'Review weak areas'
    ctaAction = 'weak-topics'
  } else if (hasFlashcards) {
    ctaLabel = 'Practice flashcards'
    ctaAction = 'flashcards'
  } else if (hasNotes) {
    ctaLabel = 'Read your notes'
    ctaAction = 'notes'
  }

  const wordCount = doc.extracted_text
    ? doc.extracted_text.trim().split(/\s+/).filter(Boolean).length
    : 0

  const showNextAction =
    isAnalysed &&
    (studyPlan != null || weakTopicsCount > 0 || hasNotes || hasFlashcards || hasQuiz || hasVisuals)

  // Session summary — precomputed prose parts
  const sessionParts: string[] = []
  if (quizAttempt) {
    if (quizAttempt.phase === 'review' && quizAttempt.score_correct != null) {
      sessionParts.push(`Quiz — ${quizAttempt.score_correct} of ${quizAttempt.score_total} correct`)
    } else {
      sessionParts.push('Quiz in progress')
    }
  }
  if (flashcardProgress) {
    const known = flashcardProgress.card_statuses.filter(s => s === 'known').length
    const total = flashcardProgress.card_statuses.length
    sessionParts.push(`${known} of ${total} cards learned`)
  }
  if (tutorMessageCount > 0) {
    sessionParts.push(`${tutorMessageCount} MoLis ${tutorMessageCount === 1 ? 'conversation' : 'conversations'}`)
  }
  const hasSession = sessionParts.length > 0

  return (
    <div className="flex flex-col gap-10">

      {/* ── SOURCE PREPARATION (unprocessed only) ───────────────────────────── */}
      {!isAnalysed && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground/28">
            Preparing your source
          </p>
          <ExtractionPanel
            documentId={doc.id}
            fileType={doc.file_type}
            signedUrl={signedUrl}
            initialExtractedText={doc.extracted_text ?? null}
            hasAnalysis={!!analysis}
            sourceType={doc.source_type}
          />
        </div>
      )}

      {/* ── PRIMARY NEXT ACTION ─────────────────────────────────────────────── */}
      {showNextAction && (
        <div className="rounded-2xl bg-card p-7 shadow-[var(--shadow-md)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/70">
            Next step
          </p>
          <p className="mt-3 text-[1.25rem] font-bold tracking-[-0.025em] leading-snug text-foreground/88">
            {nextActionText}
          </p>
          {studyPlan?.why_this_plan && (
            <p className="mt-2 text-[14px] leading-relaxed text-foreground/45">
              {studyPlan.why_this_plan}
            </p>
          )}
          {studyPlan && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-foreground/35">
              <span>{studyPlan.estimated_session_minutes} min session</span>
              <span aria-hidden="true">·</span>
              <span>+{studyPlan.expected_improvement}% readiness gain</span>
            </div>
          )}
          <button
            onClick={() => onNavigate(ctaAction)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-sm)] transition-all duration-150 hover:-translate-y-px hover:opacity-90 active:translate-y-0"
          >
            {ctaLabel}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── WHAT MOLIS UNDERSTOOD ───────────────────────────────────────────── */}
      {analysis && (
        <div className="flex flex-col gap-6 rounded-2xl bg-muted/25 p-6 sm:p-7">
          <div>
            <h3 className="text-[18px] font-bold tracking-[-0.02em] text-foreground/80">
              What MoLis understood
            </h3>
            {isRecording && (
              <p className="mt-0.5 text-[13px] text-foreground/38">From your lecture recording</p>
            )}
          </div>

          {/* Key concepts — numbered list, max 6 */}
          {displayConcepts.length > 0 && (
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/30">
                Key concepts
              </p>
              <div className="flex flex-col gap-2">
                {displayConcepts.slice(0, 6).map((c, i) => (
                  <div key={c.concept} className="flex items-baseline gap-3">
                    <span className="min-w-[18px] text-[11px] font-semibold tabular-nums text-foreground/22">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[15px] font-medium text-foreground/75">{c.concept}</span>
                  </div>
                ))}
              </div>
              {allConcepts.length > 6 && (
                <button
                  onClick={() => onNavigate('notes')}
                  className="mt-3 text-[13px] text-foreground/40 transition-colors hover:text-foreground/65 hover:underline underline-offset-2"
                >
                  View all {allConcepts.length} concepts →
                </button>
              )}
            </div>
          )}

          {/* Exam priorities — chips, max 4 */}
          {allExamTopics.length > 0 && (
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/30">
                Exam priorities
              </p>
              <div className="flex flex-wrap gap-2">
                {allExamTopics.slice(0, 4).map(t => (
                  <span
                    key={t.topic}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                      t.importance === 'high'
                        ? 'border-amber-500/20 bg-amber-500/[0.07] text-amber-500/90'
                        : 'border-foreground/[0.09] bg-card/60 text-foreground/55',
                    )}
                  >
                    {t.topic}
                  </span>
                ))}
                {allExamTopics.length > 4 && (
                  <span className="flex items-center px-1 text-[13px] text-foreground/30">
                    +{allExamTopics.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Source intelligence — inline counts */}
          {(defCount > 0 || formulaCount > 0 || misconceptionCount > 0) && (
            <p className="text-[13px] leading-relaxed text-foreground/40">
              {[
                defCount > 0 ? `${defCount} definition${defCount !== 1 ? 's' : ''}` : '',
                formulaCount > 0 ? `${formulaCount} formula${formulaCount !== 1 ? 's' : ''}` : '',
                misconceptionCount > 0 ? `${misconceptionCount} common misconception${misconceptionCount !== 1 ? 's' : ''}` : '',
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* ── WEAK TOPICS CALLOUT ─────────────────────────────────────────────── */}
      {weakTopicsCount > 0 && (
        <button
          onClick={() => onNavigate('weak-topics')}
          className="flex items-center gap-4 rounded-2xl border border-primary/14 bg-primary/[0.04] p-5 text-left transition-all duration-150 hover:border-primary/24 hover:bg-primary/[0.07] hover:-translate-y-px"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.08]">
            <TargetIcon className="h-5 w-5 text-primary/70" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground/75">
              {weakTopicsCount} concept{weakTopicsCount !== 1 ? 's' : ''} due for review
            </p>
            {weakTopics[0] && (
              <p className="mt-0.5 text-[13px] text-foreground/38">
                Starting with {weakTopics[0].concept_title}
              </p>
            )}
          </div>
          <ChevronIcon className="h-4 w-4 shrink-0 text-foreground/22" />
        </button>
      )}

      {/* ── TODAY'S STUDY PATH ──────────────────────────────────────────────── */}
      {studyPlan && studyPlan.study_blocks.length > 0 && (
        <StudyPlanCard
          plan={studyPlan}
          onNavigate={(tab) => onNavigate(tab as Tab)}
          onAskTutor={onAskTutor}
        />
      )}

      {/* ── YOUR SESSION ────────────────────────────────────────────────────── */}
      {hasSession && (
        <div className="rounded-xl border border-border/40 bg-muted/20 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/30">Your session</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-foreground/58">
            {sessionParts.join(' · ')}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {quizAttempt && (
              <button
                onClick={() => onNavigate('quiz')}
                className="text-[13px] font-medium text-primary/60 transition-colors hover:text-primary/85"
              >
                {quizAttempt.phase === 'review' ? 'Review quiz →' : 'Continue quiz →'}
              </button>
            )}
            {flashcardProgress && (
              <button
                onClick={() => onNavigate('flashcards')}
                className="text-[13px] font-medium text-primary/60 transition-colors hover:text-primary/85"
              >
                Practice flashcards →
              </button>
            )}
            {tutorMessageCount > 0 && (
              <button
                onClick={() => onNavigate('tutor')}
                className="text-[13px] font-medium text-primary/60 transition-colors hover:text-primary/85"
              >
                Open MoLis →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── SOURCE DETAILS (collapsed) ──────────────────────────────────────── */}
      {isAnalysed && (
        <div className="flex flex-col gap-3 border-t border-border/30 pt-5">
          <button
            onClick={() => setDetailsOpen(v => !v)}
            className="flex items-center gap-2 self-start text-[13px] font-medium text-foreground/40 transition-colors hover:text-foreground/65"
          >
            <span>Source details</span>
            <ChevronDownIcon className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              detailsOpen && 'rotate-180',
            )} />
          </button>
          {detailsOpen && (
            <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-foreground/38">
                {wordCount > 0 && (
                  <span>{wordCount.toLocaleString()} words</span>
                )}
                {analysis?.difficulty_level && (
                  <span>
                    {analysis.difficulty_level.charAt(0).toUpperCase() + analysis.difficulty_level.slice(1)}
                  </span>
                )}
                {signedUrl && (
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 transition-colors hover:text-foreground/62"
                  >
                    View original source
                  </a>
                )}
              </div>
              <ExtractionPanel
                documentId={doc.id}
                fileType={doc.file_type}
                signedUrl={signedUrl}
                initialExtractedText={doc.extracted_text ?? null}
                hasAnalysis={!!analysis}
                sourceType={doc.source_type}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── WeakTopicsTab ─────────────────────────────────────────────────────────────

function WeakTopicsTab({
  weakTopics,
  onGoToQuiz,
  onAskTutor,
}: {
  weakTopics: ConceptMastery[]
  onGoToQuiz: () => void
  onAskTutor: (prompt: string, mode?: TutorMode) => void
}) {
  const sorted = [...weakTopics].sort((a, b) => a.mastery_score - b.mastery_score)

  function masteryStyle(score: number): string {
    if (score < 30) return 'border-red-500/25 bg-red-500/[0.08] text-red-400'
    if (score < 60) return 'border-orange-500/20 bg-orange-500/[0.07] text-orange-400'
    return 'border-yellow-500/20 bg-yellow-500/[0.07] text-yellow-400/90'
  }

  function dotStyle(score: number): string {
    if (score < 30) return 'bg-red-400/70'
    if (score < 60) return 'bg-orange-400/70'
    return 'bg-yellow-400/60'
  }

  function relativeTime(iso: string | null): string {
    if (!iso) return 'never'
    // eslint-disable-next-line react-hooks/purity
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 2) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/40">
          <TargetIcon className="h-7 w-7 text-foreground/20" />
        </div>
        <h3 className="text-sm font-semibold text-foreground/50">No weak topics yet</h3>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-foreground/35">
          Complete a quiz to start adaptive tracking. MoLis will identify concepts you struggled with.
        </p>
        <button
          onClick={onGoToQuiz}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
        >
          Take a Quiz
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-foreground/30">
        {sorted.length} concept{sorted.length !== 1 ? 's' : ''} need attention.
        Focus your revision here.
      </p>
      <div className="flex flex-col gap-2">
        {sorted.map((cm) => (
          <div
            key={cm.id}
            className="flex items-start gap-3.5 rounded-xl border border-border bg-card px-4 py-3.5"
          >
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotStyle(cm.mastery_score)}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground/75">{cm.concept_title}</p>
              <p className="mt-0.5 text-xs text-foreground/30">
                {relativeTime(cm.last_reviewed_at)} · {cm.incorrect_count}{' '}
                {cm.incorrect_count === 1 ? 'miss' : 'misses'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${masteryStyle(cm.mastery_score)}`}>
                {cm.mastery_score}%
              </span>
              <button
                onClick={() => onAskTutor(`Explain why I'm weak in "${cm.concept_title}" and help me fix it.`, 'weak_topic')}
                className="rounded-md border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-medium text-primary/70 transition-colors hover:border-primary/35 hover:bg-primary/[0.11]"
              >
                Ask MoLis
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onGoToQuiz}
        className="mt-2 inline-flex w-fit items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
      >
        <QuizIcon className="h-4 w-4" />
        Retake Quiz
      </button>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function ArrowPathIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
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

function QuizIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
  )
}

function VisualIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  )
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function TutorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
  )
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
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
