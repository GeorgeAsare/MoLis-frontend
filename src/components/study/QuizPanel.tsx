'use client'

import { useEffect, useRef, useState } from 'react'
import { generateQuiz } from '@/app/actions/quiz'
import { saveWeakTopics } from '@/app/actions/weakTopics'
import { Skeleton } from '@/components/ui/Skeleton'
import type { MissedQuestionData } from '@/types/weakTopic'
import type {
  Quiz,
  QuizQuestion,
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  ShortAnswerQuestion,
  ScenarioQuestion,
} from '@/types/quiz'

// ── Local types ───────────────────────────────────────────────────────────────

interface AnswerState {
  selected: number | boolean | null
  revealed: boolean
  selfCorrect: boolean | null // only used for short_answer
}

type Phase = 'idle' | 'generating' | 'ready' | 'playing' | 'review' | 'error'

interface Props {
  documentId: string
  hasExtractedText: boolean
  initialQuiz: Quiz | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

const GENERATION_MESSAGES = [
  'Analysing your document…',
  'Crafting multiple choice questions…',
  'Writing true/false statements…',
  'Building scenario questions…',
  'Preparing short answer prompts…',
  'Finalising your quiz…',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnswers(count: number): AnswerState[] {
  return Array.from({ length: count }, () => ({
    selected: null,
    revealed: false,
    selfCorrect: null,
  }))
}

function gradeAnswer(question: QuizQuestion, answer: AnswerState): boolean | null {
  if (!answer.revealed) return null
  if (question.type === 'multiple_choice' || question.type === 'scenario') {
    return (
      typeof answer.selected === 'number' && answer.selected === question.correct_index
    )
  }
  if (question.type === 'true_false') {
    return typeof answer.selected === 'boolean' && answer.selected === question.correct
  }
  return answer.selfCorrect
}

function computeScore(questions: QuizQuestion[], answers: AnswerState[]) {
  let correct = 0
  for (let i = 0; i < questions.length; i++) {
    if (gradeAnswer(questions[i], answers[i]) === true) correct++
  }
  return { correct, total: questions.length }
}

function canAdvance(question: QuizQuestion, answer: AnswerState): boolean {
  if (!answer.revealed) return false
  if (question.type === 'short_answer') return answer.selfCorrect !== null
  return true
}

function buildMissedData(
  questions: QuizQuestion[],
  answers: AnswerState[],
): MissedQuestionData[] {
  return questions.flatMap((q, i) => {
    const a = answers[i]
    if (!a || gradeAnswer(q, a) !== false) return []

    let selectedAnswer: string
    let correctAnswer: string

    if (q.type === 'multiple_choice' || q.type === 'scenario') {
      selectedAnswer =
        typeof a.selected === 'number'
          ? (q.options[a.selected] ?? 'Unknown')
          : 'Not answered'
      correctAnswer = q.options[q.correct_index] ?? 'Unknown'
    } else if (q.type === 'true_false') {
      selectedAnswer =
        typeof a.selected === 'boolean' ? (a.selected ? 'True' : 'False') : 'Not answered'
      correctAnswer = q.correct ? 'True' : 'False'
    } else {
      selectedAnswer = 'Self-assessed as incorrect'
      correctAnswer =
        q.model_answer.length > 150 ? q.model_answer.slice(0, 150) + '…' : q.model_answer
    }

    return [
      {
        question: q.question,
        questionType: q.type,
        selectedAnswer,
        correctAnswer,
        explanation: q.explanation,
      },
    ]
  })
}

function typeStyle(type: QuizQuestion['type']): string {
  switch (type) {
    case 'multiple_choice':
      return 'text-violet-400 border-violet-500/20 bg-violet-500/10'
    case 'true_false':
      return 'text-sky-400 border-sky-500/20 bg-sky-500/10'
    case 'short_answer':
      return 'text-amber-400 border-amber-500/20 bg-amber-500/10'
    case 'scenario':
      return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
  }
}

function typeLabel(type: QuizQuestion['type']): string {
  switch (type) {
    case 'multiple_choice':
      return 'Multiple Choice'
    case 'true_false':
      return 'True / False'
    case 'short_answer':
      return 'Short Answer'
    case 'scenario':
      return 'Scenario'
  }
}

// ── QuizPanel ─────────────────────────────────────────────────────────────────

export function QuizPanel({ documentId, hasExtractedText, initialQuiz }: Props) {
  const [phase, setPhase] = useState<Phase>(initialQuiz ? 'ready' : 'idle')
  const [quiz, setQuiz] = useState<Quiz | null>(initialQuiz)
  const [answers, setAnswers] = useState<AnswerState[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [msgIndex, setMsgIndex] = useState(0)
  const [weakTopicsSaved, setWeakTopicsSaved] = useState<boolean | null>(null)

  const phaseRef = useRef(phase)
  phaseRef.current = phase

  useEffect(() => {
    if (phase !== 'generating') return
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % GENERATION_MESSAGES.length),
      2000,
    )
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    function handler() {
      if (phaseRef.current === 'generating') return
      void triggerGenerate()
    }
    window.addEventListener('molis:generate-quiz', handler)
    return () => window.removeEventListener('molis:generate-quiz', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function triggerGenerate() {
    setPhase('generating')
    setErrorMessage(null)
    setMsgIndex(0)
    setAnswers([])
    try {
      const result = await generateQuiz(documentId)
      setQuiz(result)
      setPhase('ready')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Quiz generation failed')
      setPhase('error')
    }
  }

  function handleStart() {
    if (!quiz) return
    setAnswers(makeAnswers(quiz.questions.length))
    setCurrentIndex(0)
    setPhase('playing')
  }

  function handleSelect(value: number | boolean) {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === currentIndex && !a.revealed ? { ...a, selected: value } : a,
      ),
    )
  }

  function handleReveal() {
    setAnswers((prev) =>
      prev.map((a, i) => (i === currentIndex ? { ...a, revealed: true } : a)),
    )
  }

  function handleSelfGrade(correct: boolean) {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === currentIndex ? { ...a, selfCorrect: correct } : a,
      ),
    )
  }

  function handleAdvance() {
    if (!quiz) return
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      setPhase('review')
      const missed = buildMissedData(quiz.questions, answers)
      if (missed.length > 0) {
        saveWeakTopics(documentId, missed)
          .then(() => setWeakTopicsSaved(true))
          .catch(() => {})
      }
    }
  }

  function handleRetake() {
    if (!quiz) return
    setAnswers(makeAnswers(quiz.questions.length))
    setCurrentIndex(0)
    setPhase('playing')
  }

  return (
    <div
      id="quiz-panel"
      className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <QuizIcon className="h-4 w-4 text-violet-400/60" />
          <span className="text-sm font-medium text-white/70">Quiz</span>
        </div>
        <div className="flex items-center gap-2">
          {(phase === 'ready' || phase === 'playing' || phase === 'review') && quiz && (
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

      {/* Body */}
      <div className="p-5">
        {phase === 'idle' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-white/35">
              {hasExtractedText
                ? 'Generate an interactive quiz — multiple choice, true/false, short answer, and scenario questions — to test your understanding of this document.'
                : 'Text extraction is required before generating a quiz.'}
            </p>
            <button
              onClick={triggerGenerate}
              disabled={!hasExtractedText}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <QuizIcon className="h-4 w-4" />
              Generate Quiz
            </button>
          </div>
        )}

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
              <QuizIcon className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {phase === 'generating' && <GeneratingSkeleton msgIndex={msgIndex} />}

        {phase === 'ready' && quiz && (
          <QuizStartScreen quiz={quiz} onStart={handleStart} />
        )}

        {phase === 'playing' && quiz && answers.length > 0 && (
          <QuizPlayer
            questions={quiz.questions}
            answers={answers}
            currentIndex={currentIndex}
            onSelect={handleSelect}
            onReveal={handleReveal}
            onSelfGrade={handleSelfGrade}
            onAdvance={handleAdvance}
          />
        )}

        {phase === 'review' && quiz && (
          <>
            <QuizReview
              quiz={quiz}
              answers={answers}
              onRetake={handleRetake}
              onRegenerate={triggerGenerate}
            />
            {weakTopicsSaved === true && (
              <div className="mt-4 flex items-center gap-1.5 text-[11px] text-emerald-400/60">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Adaptive learning updated
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── GeneratingSkeleton ────────────────────────────────────────────────────────

function GeneratingSkeleton({ msgIndex }: { msgIndex: number }) {
  return (
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
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
        >
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 rounded-full" style={{ width: '75%' }} />
          <div className="flex flex-col gap-2 pt-1">
            {[0, 1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-9 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── QuizStartScreen ───────────────────────────────────────────────────────────

function QuizStartScreen({ quiz, onStart }: { quiz: Quiz; onStart: () => void }) {
  const counts = quiz.questions.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1
    return acc
  }, {})

  const generatedAt = new Date(quiz.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold leading-snug text-white/85">
          {quiz.title}
        </h2>
        <p className="mt-1 text-xs text-white/20">
          Generated {generatedAt} · {quiz.model}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['multiple_choice', 'Multiple Choice', 'text-violet-400'],
            ['true_false', 'True / False', 'text-sky-400'],
            ['short_answer', 'Short Answer', 'text-amber-400'],
            ['scenario', 'Scenario', 'text-emerald-400'],
          ] as const
        ).map(([t, label, color]) => (
          <div
            key={t}
            className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center"
          >
            <span className={`text-2xl font-bold ${color}`}>{counts[t] ?? 0}</span>
            <span className="text-[11px] text-white/30">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-white/20" />
        <p className="text-xs leading-relaxed text-white/35">
          Answer each question before moving on. Short answer questions are
          self-assessed — you&apos;ll see the model answer to compare against.
        </p>
      </div>

      <button
        onClick={onStart}
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.15]"
      >
        <PlayIcon className="h-4 w-4" />
        Start Quiz
      </button>
    </div>
  )
}

// ── QuizPlayer ────────────────────────────────────────────────────────────────

interface PlayerProps {
  questions: QuizQuestion[]
  answers: AnswerState[]
  currentIndex: number
  onSelect: (value: number | boolean) => void
  onReveal: () => void
  onSelfGrade: (correct: boolean) => void
  onAdvance: () => void
}

function QuizPlayer({
  questions,
  answers,
  currentIndex,
  onSelect,
  onReveal,
  onSelfGrade,
  onAdvance,
}: PlayerProps) {
  const question = questions[currentIndex]
  const answer = answers[currentIndex]
  if (!question || !answer) return null

  const isLast = currentIndex === questions.length - 1
  const okToAdvance = canAdvance(question, answer)
  const progress = ((currentIndex + 1) / questions.length) * 100

  return (
    <div className="flex flex-col gap-5">
      {/* Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/30">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${typeStyle(question.type)}`}
          >
            {typeLabel(question.type)}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-violet-500/60 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question text */}
      <p className="text-sm font-medium leading-relaxed text-white/80">
        {question.question}
      </p>

      {/* Answer UI */}
      {(question.type === 'multiple_choice' || question.type === 'scenario') && (
        <MCOptions
          question={question as MultipleChoiceQuestion | ScenarioQuestion}
          answer={answer}
          onSelect={(v: number) => onSelect(v)}
        />
      )}
      {question.type === 'true_false' && (
        <TFOptions
          question={question as TrueFalseQuestion}
          answer={answer}
          onSelect={(v: boolean) => onSelect(v)}
        />
      )}
      {question.type === 'short_answer' && (
        <SAReveal
          question={question as ShortAnswerQuestion}
          answer={answer}
          onReveal={onReveal}
          onSelfGrade={onSelfGrade}
        />
      )}

      {/* Check Answer + Explanation (mc / tf / scenario) */}
      {question.type !== 'short_answer' && (
        <>
          {!answer.revealed && (
            <button
              onClick={onReveal}
              disabled={answer.selected === null}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/50 transition-colors hover:border-white/[0.16] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Check Answer
            </button>
          )}
          {answer.revealed && (
            <ExplanationCard
              isCorrect={gradeAnswer(question, answer) === true}
              explanation={question.explanation}
            />
          )}
        </>
      )}

      {/* Navigation */}
      {okToAdvance && (
        <div className="flex justify-end pt-1">
          <button
            onClick={onAdvance}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.15]"
          >
            {isLast ? (
              <>
                Finish Quiz <CheckIcon className="h-4 w-4" />
              </>
            ) : (
              <>
                Next Question <ChevronRightIcon className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ── MCOptions ─────────────────────────────────────────────────────────────────

function MCOptions({
  question,
  answer,
  onSelect,
}: {
  question: MultipleChoiceQuestion | ScenarioQuestion
  answer: AnswerState
  onSelect: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {question.options.map((opt, i) => {
        const isSelected = answer.selected === i
        const isCorrect = i === question.correct_index
        let cls =
          'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors '

        if (answer.revealed) {
          cls += isCorrect
            ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300/90'
            : isSelected
              ? 'border-red-500/25 bg-red-500/[0.07] text-red-400/80'
              : 'border-white/[0.05] bg-white/[0.01] text-white/20'
        } else if (isSelected) {
          cls +=
            'border-violet-500/30 bg-violet-500/[0.10] text-violet-300 cursor-pointer'
        } else {
          cls +=
            'border-white/[0.07] bg-white/[0.02] text-white/55 hover:border-white/[0.12] hover:bg-white/[0.04] cursor-pointer'
        }

        return (
          <button
            key={i}
            onClick={() => !answer.revealed && onSelect(i)}
            disabled={answer.revealed}
            className={cls}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-current text-[11px] font-bold opacity-70">
              {OPTION_LABELS[i]}
            </span>
            <span className="flex-1 leading-snug">{opt}</span>
            {answer.revealed && isCorrect && (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            )}
            {answer.revealed && isSelected && !isCorrect && (
              <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── TFOptions ─────────────────────────────────────────────────────────────────

function TFOptions({
  question,
  answer,
  onSelect,
}: {
  question: TrueFalseQuestion
  answer: AnswerState
  onSelect: (v: boolean) => void
}) {
  return (
    <div className="flex gap-3">
      {([true, false] as const).map((val) => {
        const isSelected = answer.selected === val
        const isCorrect = val === question.correct
        let cls =
          'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors '

        if (answer.revealed) {
          cls += isCorrect
            ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300/90'
            : isSelected
              ? 'border-red-500/25 bg-red-500/[0.07] text-red-400/80'
              : 'border-white/[0.05] bg-white/[0.01] text-white/20'
        } else if (isSelected) {
          cls += 'border-violet-500/30 bg-violet-500/[0.10] text-violet-300 cursor-pointer'
        } else {
          cls +=
            'border-white/[0.07] bg-white/[0.02] text-white/55 hover:border-white/[0.12] hover:bg-white/[0.04] cursor-pointer'
        }

        return (
          <button
            key={String(val)}
            onClick={() => !answer.revealed && onSelect(val)}
            disabled={answer.revealed}
            className={cls}
          >
            {answer.revealed && isCorrect && <CheckIcon className="h-4 w-4" />}
            {answer.revealed && isSelected && !isCorrect && (
              <XIcon className="h-4 w-4" />
            )}
            {val ? 'True' : 'False'}
          </button>
        )
      })}
    </div>
  )
}

// ── SAReveal ──────────────────────────────────────────────────────────────────

function SAReveal({
  question,
  answer,
  onReveal,
  onSelfGrade,
}: {
  question: ShortAnswerQuestion
  answer: AnswerState
  onReveal: () => void
  onSelfGrade: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {!answer.revealed ? (
        <>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-xs italic text-white/30">
              Formulate your answer, then reveal the model answer below.
            </p>
          </div>
          <button
            onClick={onReveal}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2 text-sm font-medium text-amber-300/80 transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.12]"
          >
            <EyeIcon className="h-4 w-4" />
            See Model Answer
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-amber-500/[0.12] bg-amber-500/[0.05] px-4 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-400/60">
              Model Answer
            </p>
            <p className="text-sm leading-relaxed text-white/65">
              {question.model_answer}
            </p>
            {question.key_points.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {question.key_points.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/45">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/50" />
                    {point}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {answer.selfCorrect === null ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-white/30">How did you do?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onSelfGrade(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5 text-sm font-medium text-emerald-400/80 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.12]"
                >
                  <CheckIcon className="h-4 w-4" />
                  Got It
                </button>
                <button
                  onClick={() => onSelfGrade(false)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-sm font-medium text-red-400/70 transition-colors hover:border-red-500/30 hover:bg-red-500/[0.10]"
                >
                  <XIcon className="h-4 w-4" />
                  Missed It
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                answer.selfCorrect
                  ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400/80'
                  : 'border-red-500/20 bg-red-500/[0.06] text-red-400/70'
              }`}
            >
              {answer.selfCorrect ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <XIcon className="h-4 w-4" />
              )}
              {answer.selfCorrect ? 'Marked as correct' : 'Marked as incorrect'}
            </div>
          )}

          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
            <p className="text-xs leading-relaxed text-white/35">{question.explanation}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ExplanationCard ───────────────────────────────────────────────────────────

function ExplanationCard({
  isCorrect,
  explanation,
}: {
  isCorrect: boolean
  explanation: string
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
        isCorrect
          ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
          : 'border-red-500/20 bg-red-500/[0.06]'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {isCorrect ? (
          <CheckCircleIcon className="h-4 w-4 text-emerald-400/80" />
        ) : (
          <XCircleIcon className="h-4 w-4 text-red-400/70" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p
          className={`text-xs font-semibold ${
            isCorrect ? 'text-emerald-400/80' : 'text-red-400/70'
          }`}
        >
          {isCorrect ? 'Correct!' : 'Incorrect'}
        </p>
        <p className="text-sm leading-relaxed text-white/55">{explanation}</p>
      </div>
    </div>
  )
}

// ── QuizReview ────────────────────────────────────────────────────────────────

function QuizReview({
  quiz,
  answers,
  onRetake,
  onRegenerate,
}: {
  quiz: Quiz
  answers: AnswerState[]
  onRetake: () => void
  onRegenerate: () => void
}) {
  const [showAnswers, setShowAnswers] = useState(false)
  const { correct, total } = computeScore(quiz.questions, answers)
  const pct = Math.round((correct / total) * 100)

  const accentColor =
    pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
  const accentBorder =
    pct >= 70
      ? 'border-emerald-500/20'
      : pct >= 50
        ? 'border-amber-500/20'
        : 'border-red-500/20'
  const accentBg =
    pct >= 70
      ? 'bg-emerald-500/[0.05]'
      : pct >= 50
        ? 'bg-amber-500/[0.05]'
        : 'bg-red-500/[0.05]'
  const msg =
    pct >= 80
      ? 'Excellent work!'
      : pct >= 60
        ? 'Good effort!'
        : pct >= 40
          ? 'Keep practising.'
          : 'More revision needed.'

  const typeCounts = quiz.questions.reduce<
    Record<string, { correct: number; total: number }>
  >((acc, q, i) => {
    if (!acc[q.type]) acc[q.type] = { correct: 0, total: 0 }
    acc[q.type].total++
    if (gradeAnswer(q, answers[i]) === true) acc[q.type].correct++
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-6">
      {/* Score */}
      <div
        className={`flex items-center gap-5 rounded-xl border ${accentBorder} ${accentBg} px-5 py-5`}
      >
        <div
          className={`flex flex-col items-center rounded-xl border ${accentBorder} bg-white/[0.03] px-4 py-3 text-center`}
        >
          <span className={`text-3xl font-bold tabular-nums ${accentColor}`}>
            {correct}/{total}
          </span>
          <span className={`text-sm font-medium ${accentColor}`}>{pct}%</span>
        </div>
        <div>
          <p className={`text-base font-semibold ${accentColor}`}>{msg}</p>
          <p className="mt-1 text-xs text-white/35">
            {correct} correct out of {total} questions
          </p>
        </div>
      </div>

      {/* Type breakdown */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/25">
          Breakdown
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['multiple_choice', 'Multiple Choice', 'text-violet-400'],
              ['true_false', 'True / False', 'text-sky-400'],
              ['short_answer', 'Short Answer', 'text-amber-400'],
              ['scenario', 'Scenario', 'text-emerald-400'],
            ] as const
          ).map(([t, label, color]) => {
            const stats = typeCounts[t]
            if (!stats) return null
            return (
              <div
                key={t}
                className="flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <span className={`text-sm font-semibold ${color}`}>
                  {stats.correct}/{stats.total}
                </span>
                <span className="text-[11px] text-white/30">{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Answer review */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowAnswers((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-white/35 transition-colors hover:text-white/55"
        >
          <ChevronRightIcon
            className={`h-3.5 w-3.5 transition-transform ${showAnswers ? 'rotate-90' : ''}`}
          />
          {showAnswers ? 'Hide' : 'Review'} all answers
        </button>

        {showAnswers && (
          <div className="flex flex-col gap-2">
            {quiz.questions.map((q, i) => {
              const grade = gradeAnswer(q, answers[i])
              const isCorrect = grade === true
              return (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        isCorrect ? 'bg-emerald-500/20' : 'bg-red-500/15'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckIcon className="h-2.5 w-2.5 text-emerald-400" />
                      ) : (
                        <XIcon className="h-2.5 w-2.5 text-red-400/70" />
                      )}
                    </div>
                    <p className="flex-1 text-xs font-medium leading-snug text-white/60">
                      {q.question}
                    </p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${typeStyle(q.type)}`}
                    >
                      {typeLabel(q.type)}
                    </span>
                  </div>
                  <p className="ml-6 text-xs leading-relaxed text-white/30">
                    {q.explanation}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onRetake}
          className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.15]"
        >
          <RegenerateIcon className="h-4 w-4" />
          Retake Quiz
        </button>
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/40 transition-colors hover:border-white/[0.12] hover:text-white/60"
        >
          <SparklesIcon className="h-4 w-4" />
          New Quiz
        </button>
      </div>
    </div>
  )
}

// ── PhaseBadge ────────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: Phase }) {
  switch (phase) {
    case 'ready':
      return (
        <span className="rounded-full border border-violet-500/20 bg-violet-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-violet-400">
          Ready
        </span>
      )
    case 'playing':
      return (
        <span className="flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-sky-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
          In Progress
        </span>
      )
    case 'review':
      return (
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          Complete
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

function QuizIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
      />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  )
}

function RegenerateIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
      />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
      />
    </svg>
  )
}
