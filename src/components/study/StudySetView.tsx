'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ExtractionPanel } from '@/components/study/ExtractionPanel'
import { RevisionNotesPanel } from '@/components/study/RevisionNotesPanel'
import { QuizPanel } from '@/components/study/QuizPanel'
import { FlashcardsPanel } from '@/components/study/FlashcardsPanel'
import { VisualsPanel } from '@/components/study/VisualsPanel'
import { StudyPlanCard } from '@/components/study/StudyPlanCard'
import { TutorPanel } from '@/components/study/TutorPanel'
import type { TutorPanelHandle } from '@/components/study/TutorPanel'
// WeakTopicsPanel is rendered inline in WeakTopicsTab below, not as a standalone component
import type { RevisionNote } from '@/types/revisionNotes'
import type { Quiz } from '@/types/quiz'
import type { FlashcardSet } from '@/types/flashcard'
import type { StudyVisualSet } from '@/types/studyVisual'
import type { ConceptMastery } from '@/types/conceptMastery'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { StudyPlan } from '@/types/studyPlan'
import type { FlashcardProgress } from '@/types/flashcardProgress'
import type { QuizAttempt } from '@/types/quizAttempt'
import type { TutorMessage, TutorMode } from '@/types/tutor'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StudyDoc {
  id: string
  title: string
  file_type: string
  file_path: string
  created_at: string
  extracted_text: string | null
}

interface Props {
  doc: StudyDoc
  signedUrl: string | null
  initialNotes: RevisionNote | null
  initialQuiz: Quiz | null
  initialFlashcards: FlashcardSet | null
  initialVisuals: StudyVisualSet | null
  weakTopics: ConceptMastery[]
  initialAnalysis: DocumentAnalysis | null
  initialStudyPlan: StudyPlan | null
  initialFlashcardProgress: FlashcardProgress | null
  initialQuizAttempt: QuizAttempt | null
  initialTutorMessages: TutorMessage[]
  initialTab: string
}

type Tab = 'overview' | 'notes' | 'flashcards' | 'quiz' | 'visuals' | 'weak-topics' | 'tutor'

const TABS: { id: Tab; label: string; icon: (p: { className?: string }) => React.ReactElement }[] = [
  { id: 'overview',    label: 'Overview',    icon: HomeIcon },
  { id: 'notes',       label: 'Notes',       icon: NotesIcon },
  { id: 'flashcards',  label: 'Flashcards',  icon: CardsIcon },
  { id: 'quiz',        label: 'Quiz',        icon: QuizIcon },
  { id: 'visuals',     label: 'Visuals',     icon: VisualIcon },
  { id: 'weak-topics', label: 'Weak Topics', icon: TargetIcon },
  { id: 'tutor',       label: 'AI Tutor',    icon: TutorIcon },
]

function validateTab(raw: string): Tab {
  const valid: Tab[] = ['overview', 'notes', 'flashcards', 'quiz', 'visuals', 'weak-topics', 'tutor']
  return valid.includes(raw as Tab) ? (raw as Tab) : 'overview'
}

function fileTypeLabel(mimeType: string): string {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tutorPanelRef = useRef<TutorPanelHandle>(null)

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    scrollContainerRef.current?.scrollTo({ top: 0 })
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url.toString())
  }

  function openTutorWithPrompt(prompt: string, mode?: TutorMode) {
    // Switch tab without resetting scroll — prefill() handles scroll to composer
    setActiveTab('tutor')
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'tutor')
    window.history.replaceState({}, '', url.toString())
    tutorPanelRef.current?.prefill(prompt, mode)
  }

  const hasExtractedText = !!doc.extracted_text

  return (
    <div className="flex flex-1 flex-col">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <nav className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-3.5">
        <Link
          href="/dashboard/study"
          className="text-sm text-foreground/40 transition-colors hover:text-foreground/60"
        >
          Study
        </Link>
        <ChevronIcon className="h-3 w-3 text-foreground/20" />
        <span className="truncate text-sm text-foreground/70">{doc.title}</span>
      </nav>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'text-foreground/85'
                  : 'text-foreground/30 hover:text-foreground/55',
              ].join(' ')}
            >
              <tab.icon
                className={`h-3.5 w-3.5 ${isActive ? 'text-primary' : 'text-foreground/25'}`}
              />
              {tab.label}
              {isActive && (
                <span className="ml-0.5 h-0.5 w-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Active tab indicator — rendered below the bar */}
      <div className="relative -mt-px h-px shrink-0 overflow-hidden">
        <div
          className="absolute h-px bg-primary/60 transition-all duration-300"
          style={{
            left: `${(TABS.findIndex((t) => t.id === activeTab) / TABS.length) * 100}%`,
            width: `${(1 / TABS.length) * 100}%`,
          }}
        />
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
        <div className={`mx-auto max-w-3xl px-6 ${activeTab === 'tutor' ? 'flex-1 min-h-0 flex flex-col' : 'py-8'}`}>

          <div className={activeTab !== 'overview' ? 'hidden' : ''}>
            <OverviewTab
              doc={doc}
              signedUrl={signedUrl}
              hasNotes={!!initialNotes}
              hasFlashcards={!!initialFlashcards}
              hasQuiz={!!initialQuiz}
              hasVisuals={!!initialVisuals}
              weakTopicsCount={weakTopics.length}
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
            <WeakTopicsTab weakTopics={weakTopics} onGoToQuiz={() => handleTabChange('quiz')} onAskTutor={openTutorWithPrompt} />
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

// ── OverviewTab ───────────────────────────────────────────────────────────────

interface OverviewProps {
  doc: StudyDoc
  signedUrl: string | null
  hasNotes: boolean
  hasFlashcards: boolean
  hasQuiz: boolean
  hasVisuals: boolean
  weakTopicsCount: number
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
  analysis,
  studyPlan,
  quizAttempt,
  flashcardProgress,
  tutorMessageCount,
  onNavigate,
  onAskTutor,
}: OverviewProps) {
  const label = fileTypeLabel(doc.file_type)
  const date = formatDate(doc.created_at)

  const features: {
    tab: Tab
    label: string
    description: string
    done: boolean
    icon: (p: { className?: string }) => React.ReactElement
    accentColor: string
  }[] = [
    {
      tab: 'notes',
      label: 'Notes',
      description: 'AI-structured revision notes with key concepts and exam tips',
      done: hasNotes,
      icon: NotesIcon,
      accentColor: 'violet',
    },
    {
      tab: 'flashcards',
      label: 'Flashcards',
      description: 'Study cards with flip animation, know/learning tracking',
      done: hasFlashcards,
      icon: CardsIcon,
      accentColor: 'sky',
    },
    {
      tab: 'quiz',
      label: 'Quiz',
      description: 'Multiple choice, true/false, short answer and scenario questions',
      done: hasQuiz,
      icon: QuizIcon,
      accentColor: 'amber',
    },
    {
      tab: 'visuals',
      label: 'Visuals',
      description: 'Educational diagrams for visual topics in your document',
      done: hasVisuals,
      icon: VisualIcon,
      accentColor: 'emerald',
    },
  ]

  const accentClasses: Record<string, { border: string; bg: string; text: string }> = {
    violet: { border: 'border-primary/20', bg: 'bg-primary/10', text: 'text-primary' },
    sky: { border: 'border-sky-500/25', bg: 'bg-sky-500/[0.08]', text: 'text-sky-400' },
    amber: { border: 'border-amber-500/25', bg: 'bg-amber-500/[0.08]', text: 'text-amber-400' },
    emerald: { border: 'border-emerald-500/25', bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400' },
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Document card */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
          <FileIcon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-foreground/80">{doc.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-foreground/40">
              {label}
            </span>
            <span className="text-[11px] text-foreground/25">{date}</span>
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-primary/60 underline underline-offset-2 transition-colors hover:text-primary/90"
              >
                View file
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Text extraction + analysis */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/20">
          Step 1 — Extract &amp; Analyse
        </p>
        <ExtractionPanel
          documentId={doc.id}
          fileType={doc.file_type}
          signedUrl={signedUrl}
          initialExtractedText={doc.extracted_text ?? null}
          hasAnalysis={!!analysis}
        />
        {/* Analysis metadata card */}
        {analysis && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AnalysisStat label="Subject" value={analysis.subject_area} />
            <AnalysisStat
              label="Difficulty"
              value={analysis.difficulty_level.charAt(0).toUpperCase() + analysis.difficulty_level.slice(1)}
            />
            <AnalysisStat
              label="Study Time"
              value={analysis.estimated_study_minutes ? `~${analysis.estimated_study_minutes}m` : '—'}
            />
            <AnalysisStat
              label="Sections"
              value={`${analysis.sections.length} section${analysis.sections.length !== 1 ? 's' : ''}`}
            />
          </div>
        )}
      </div>

      {/* Study tools grid */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/20">
          Step 2 — Study Tools
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {features.map((f) => {
            const ac = accentClasses[f.accentColor]
            return (
              <button
                key={f.tab}
                onClick={() => onNavigate(f.tab)}
                className={[
                  'group flex flex-col gap-3 rounded-2xl border p-5 text-left transition-all',
                  f.done
                    ? `${ac.border} ${ac.bg}`
                    : 'border-border bg-card hover:border-foreground/15 hover:bg-muted/50',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-xl border',
                      f.done ? `${ac.border} ${ac.bg}` : 'border-border bg-muted/40',
                    ].join(' ')}
                  >
                    <f.icon
                      className={`h-4.5 w-4.5 ${f.done ? ac.text : 'text-foreground/25'}`}
                    />
                  </div>
                  {f.done ? (
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${ac.border} ${ac.bg} ${ac.text}`}>
                      Ready
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[10px] text-foreground/25">
                      Not generated
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground/75">{f.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/30">{f.description}</p>
                </div>
                <p className={`text-xs font-medium ${f.done ? ac.text : 'text-foreground/30'} group-hover:underline underline-offset-2`}>
                  {f.done ? `Open ${f.label} →` : `Generate ${f.label} →`}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Session at a glance */}
      {(quizAttempt || flashcardProgress || tutorMessageCount > 0) && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/20">
            Session Summary
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {quizAttempt && (
              <button
                onClick={() => onNavigate('quiz')}
                className="flex flex-col gap-1 rounded-xl border border-border bg-muted/25 px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-muted/40"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/22">Quiz</span>
                {quizAttempt.phase === 'review' && quizAttempt.score_correct != null ? (
                  <span className="text-sm font-semibold text-foreground/70">
                    {quizAttempt.score_correct}/{quizAttempt.score_total}
                    <span className="ml-1 text-xs font-normal text-foreground/35">correct</span>
                  </span>
                ) : (
                  <span className="text-sm font-medium text-amber-400/80">In progress</span>
                )}
              </button>
            )}
            {flashcardProgress && (
              <button
                onClick={() => onNavigate('flashcards')}
                className="flex flex-col gap-1 rounded-xl border border-border bg-muted/25 px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-muted/40"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/22">Flashcards</span>
                {(() => {
                  const known = flashcardProgress.card_statuses.filter(s => s === 'known').length
                  const total = flashcardProgress.card_statuses.length
                  return (
                    <span className="text-sm font-semibold text-foreground/70">
                      {known}/{total}
                      <span className="ml-1 text-xs font-normal text-foreground/35">known</span>
                    </span>
                  )
                })()}
              </button>
            )}
            {tutorMessageCount > 0 && (
              <button
                onClick={() => onNavigate('tutor')}
                className="flex flex-col gap-1 rounded-xl border border-border bg-muted/25 px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-muted/40"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/22">AI Tutor</span>
                <span className="text-sm font-semibold text-foreground/70">
                  {tutorMessageCount}
                  <span className="ml-1 text-xs font-normal text-foreground/35">
                    {tutorMessageCount === 1 ? 'message' : 'messages'}
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Adaptive Study Plan */}
      {studyPlan && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/20">
            Step 3 — Today&apos;s Study Plan
          </p>
          <StudyPlanCard
            plan={studyPlan}
            onNavigate={(tab) => onNavigate(tab as Tab)}
            onAskTutor={onAskTutor}
          />
        </div>
      )}

      {/* Weak topics summary */}
      {weakTopicsCount > 0 && (
        <button
          onClick={() => onNavigate('weak-topics')}
          className="flex items-center gap-4 rounded-2xl border border-red-500/15 bg-red-500/[0.04] p-5 text-left transition-colors hover:border-red-500/25 hover:bg-red-500/[0.07]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/[0.08]">
            <TargetIcon className="h-5 w-5 text-red-400/80" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground/70">
              {weakTopicsCount} Weak Topic{weakTopicsCount !== 1 ? 's' : ''} Detected
            </p>
            <p className="mt-0.5 text-xs text-foreground/30">
              Review areas where you scored low in quizzes
            </p>
          </div>
          <ChevronIcon className="h-4 w-4 shrink-0 text-foreground/20" />
        </button>
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
            <span
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotStyle(cm.mastery_score)}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground/75">{cm.concept_title}</p>
              <p className="mt-0.5 text-xs text-foreground/30">
                {relativeTime(cm.last_reviewed_at)} · {cm.incorrect_count}{' '}
                {cm.incorrect_count === 1 ? 'miss' : 'misses'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${masteryStyle(cm.mastery_score)}`}
              >
                {cm.mastery_score}%
              </span>
              <button
                onClick={() => onAskTutor(`Explain why I'm weak in "${cm.concept_title}" and help me fix it.`, 'weak_topic')}
                className="rounded-md border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-medium text-primary/70 transition-colors hover:border-primary/35 hover:bg-primary/[0.11]"
              >
                Ask Tutor
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

// ── AnalysisStat ──────────────────────────────────────────────────────────────

function AnalysisStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/20">
        {label}
      </span>
      <span className="truncate text-xs font-medium text-foreground/55">{value}</span>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function NotesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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
