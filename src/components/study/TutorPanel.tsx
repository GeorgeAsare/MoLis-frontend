'use client'

import { useState, useRef, useEffect, useImperativeHandle } from 'react'
import { askTutor } from '@/app/actions/tutor'
import { gradeCheckAnswer } from '@/app/actions/gradeCheckAnswer'
import { appendTutorMessage, clearTutorMessages } from '@/app/actions/tutorMessages'
import type { CheckMeta, TutorAction, TutorMessage, TutorMode } from '@/types/tutor'

// ── Constants ─────────────────────────────────────────────────────────────────

const MODES: { id: TutorMode; label: string; description: string }[] = [
  { id: 'explain',    label: 'Explain',    description: 'Clear explanation from the document' },
  { id: 'simplify',  label: 'Simplify',   description: 'Plain language & analogies' },
  { id: 'exam_prep', label: 'Exam Prep',  description: 'What examiners expect' },
  { id: 'weak_topic',label: 'Weak Topic', description: 'Rebuild understanding from scratch' },
  { id: 'next_step', label: 'Next Step',  description: 'What to study next and why' },
  { id: 'quiz_help', label: 'Quiz Help',  description: 'Understand a wrong answer' },
]

const MODE_LABEL: Record<TutorMode, string> = {
  explain:    'Explain',
  quiz_help:  'Quiz Help',
  exam_prep:  'Exam Prep',
  weak_topic: 'Weak Topic',
  simplify:   'Simplify',
  next_step:  'Next Step',
}

const SUGGESTED_PROMPTS: { label: string; text: string; mode: TutorMode }[] = [
  { label: "Explain like I'm 16",     text: "Explain this topic like I'm 16 years old",        mode: 'simplify' },
  { label: 'What to study next?',     text: 'What should I study next and why?',               mode: 'next_step' },
  { label: 'Quiz me on weakness',     text: 'Quiz me on my weakest concept',                   mode: 'weak_topic' },
  { label: 'Explain my mistake',      text: 'Help me understand why my last quiz answer was wrong', mode: 'quiz_help' },
  { label: 'Exam summary',            text: 'Summarise the most important concepts for my exam', mode: 'exam_prep' },
  { label: 'Missing prerequisite?',   text: 'What prerequisite concept am I missing?',          mode: 'weak_topic' },
]

// Maps action type to the tab name expected by StudySetView
const ACTION_TAB: Record<string, string> = {
  open_notes:       'notes',
  open_flashcards:  'flashcards',
  open_quiz:        'quiz',
  open_visuals:     'visuals',
  open_weak_topics: 'weak-topics',
  continue_tutor:   'tutor',
}

export interface TutorPanelHandle {
  prefill: (text: string, mode?: TutorMode) => void
}

interface Props {
  documentId: string
  initialMessages?: TutorMessage[]
  onAction?: (tab: string) => void
  ref?: React.Ref<TutorPanelHandle>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TutorPanel({ documentId, initialMessages = [], onAction, ref }: Props) {
  const [messages, setMessages]         = useState<TutorMessage[]>(initialMessages)
  const [input, setInput]               = useState('')
  const [mode, setMode]                 = useState<TutorMode>('explain')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [pendingCheck, setPendingCheck] = useState<CheckMeta | null>(null)
  const [masteryBanner, setMasteryBanner] = useState<{ correct: boolean; concept_title: string; brief_feedback: string } | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const bannerTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Expose prefill() so StudySetView can route here from other panels
  useImperativeHandle(ref, () => ({
    prefill(text, m) {
      setInput(text)
      if (m) setMode(m)
      // Wait for React to commit the state before moving focus/cursor/scroll
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(text.length, text.length)
        }
        const el = messagesScrollRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      })
    },
  }))

  // Scroll internal messages area to bottom on new messages / loading / pending check changes
  useEffect(() => {
    const el = messagesScrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, pendingCheck])

  async function send(overrideText?: string, overrideMode?: TutorMode) {
    const q = (overrideText ?? input).trim()
    const m = overrideMode ?? mode
    if (!q || loading) return

    setInput('')
    setError(null)

    const userMsg: TutorMessage = { role: 'user', content: q, mode: m, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const checkToGrade = pendingCheck
    const lastTutorMsg = messages.findLast(msg => msg.role === 'assistant')?.content ?? ''

    try {
      const [res, gradeResult] = await Promise.all([
        askTutor({ documentId, question: q, mode: m, recentMessages: messages.slice(-6) }),
        checkToGrade
          ? gradeCheckAnswer(documentId, { studentAnswer: q, lastTutorMessage: lastTutorMsg, checkMeta: checkToGrade }).catch(() => null)
          : Promise.resolve(null),
      ])

      const assistantMsg: TutorMessage = {
        role: 'assistant',
        content: res.answer,
        mode: res.mode,
        timestamp: Date.now(),
        ...(res.suggestedAction ? { suggestedAction: res.suggestedAction } : {}),
      }
      setMessages(prev => [...prev, assistantMsg])
      appendTutorMessage(documentId, { role: 'user', content: q, mode: m }).catch(() => {})
      appendTutorMessage(documentId, { role: 'assistant', content: res.answer, mode: res.mode }).catch(() => {})

      setPendingCheck(res.checkMeta ?? (gradeResult ? null : checkToGrade))

      if (gradeResult) {
        setMasteryBanner(gradeResult)
        if (bannerTimer.current) clearTimeout(bannerTimer.current)
        bannerTimer.current = setTimeout(() => setMasteryBanner(null), 4000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get a response. Please try again.')
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function handleSuggest(text: string, suggestedMode: TutorMode) {
    setMode(suggestedMode)
    send(text, suggestedMode)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* Mode selector */}
      <div className="shrink-0 mb-3 flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.description}
              className={[
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                mode === m.id
                  ? 'border-foreground/18 bg-foreground/[0.08] text-foreground/80'
                  : 'border-border bg-muted/30 text-foreground/35 hover:bg-muted/50 hover:text-foreground/58',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-foreground/22">
          Personalised using your study data &amp; quiz results
        </p>
      </div>

      {/* Messages / empty state — internal scroll container */}
      <div
        ref={messagesScrollRef}
        className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-4 pb-4"
      >
        {messages.length === 0 && !loading ? (
          <EmptyState onSuggest={handleSuggest} />
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} onAction={onAction} />
            ))}
            {loading && <ThinkingBubble />}
          </>
        )}
      </div>

      {/* Composer — shrink-0 so it stays anchored at bottom of the flex column */}
      <div className="shrink-0 flex flex-col gap-3 border-t border-border/40 bg-background pt-3 pb-4">

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs leading-relaxed text-red-400">
            {error}
          </div>
        )}

        {/* Pending check indicator */}
        {pendingCheck && !loading && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.05] px-3.5 py-2 text-xs">
            <span className="shrink-0 text-foreground/35">Check question pending:</span>
            <span className="truncate font-medium text-primary/80">{pendingCheck.concept_title}</span>
            <button
              onClick={() => setPendingCheck(null)}
              className="ml-auto shrink-0 text-foreground/25 transition-colors hover:text-foreground/50"
            >
              Skip
            </button>
          </div>
        )}

        {/* Mastery update banner */}
        {masteryBanner && (
          <div className={[
            'rounded-xl border px-4 py-2.5 text-xs leading-relaxed transition-all',
            masteryBanner.correct
              ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
              : 'border-amber-500/20 bg-amber-500/[0.07] text-amber-400',
          ].join(' ')}>
            <span className="font-semibold">
              {masteryBanner.correct ? 'Mastery updated ✓' : 'Mastery updated'}
            </span>
            {' · '}
            <span className="opacity-80">{masteryBanner.concept_title}</span>
            {masteryBanner.brief_feedback && (
              <span className="opacity-60"> · {masteryBanner.brief_feedback}</span>
            )}
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={2}
            disabled={loading}
            placeholder="Ask anything about your document… (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/22 focus:border-foreground/22 focus:outline-none focus:ring-1 focus:ring-foreground/12 disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.14] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Ask
          </button>
        </div>

        {/* Clear */}
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([])
              setPendingCheck(null)
              setMasteryBanner(null)
              if (bannerTimer.current) clearTimeout(bannerTimer.current)
              clearTutorMessages(documentId).catch(() => {})
            }}
            className="self-start text-[11px] text-foreground/22 transition-colors hover:text-foreground/45"
          >
            Clear conversation
          </button>
        )}
      </div>

    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({
  onSuggest,
}: {
  onSuggest: (text: string, mode: TutorMode) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/40">
          <TutorIcon className="h-6 w-6 text-foreground/25" />
        </div>
        <p className="text-sm font-medium text-foreground/55">Your AI Tutor is ready</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-foreground/30">
          Ask anything about your document. I know your mastery levels and will adapt my answers accordingly.
        </p>
      </div>

      {/* Suggested prompts */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/22">
          Suggested questions
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SUGGESTED_PROMPTS.map(({ label, text, mode }) => (
            <button
              key={label}
              onClick={() => onSuggest(text, mode)}
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/25 px-3.5 py-2.5 text-left transition-colors hover:border-foreground/15 hover:bg-muted/45"
            >
              <ChevronIcon className="h-3 w-3 shrink-0 text-foreground/20" />
              <span className="text-xs text-foreground/55">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onAction,
}: {
  msg: TutorMessage
  onAction?: (tab: string) => void
}) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-border bg-muted/50 px-4 py-2.5">
          <p className="whitespace-pre-wrap text-sm text-foreground/80">{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[92%] gap-2.5">
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
          <TutorDotIcon className="h-3 w-3 text-primary" />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
            {msg.mode && (
              <span className="mb-2 inline-block rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-foreground/30">
                {MODE_LABEL[msg.mode]}
              </span>
            )}
            <TutorContent content={msg.content} />
          </div>
          {msg.suggestedAction && onAction && (
            <ActionButton action={msg.suggestedAction} onAction={onAction} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── ThinkingBubble ────────────────────────────────────────────────────────────

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-2.5">
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
          <TutorDotIcon className="h-3 w-3 text-primary" />
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/25 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/25 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/25 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

// ── ActionButton ──────────────────────────────────────────────────────────────

function ActionButton({ action, onAction }: { action: TutorAction; onAction: (tab: string) => void }) {
  const tab = ACTION_TAB[action.type]
  if (!tab) return null

  return (
    <button
      onClick={() => onAction(tab)}
      className="flex w-fit items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3.5 py-2 text-xs font-medium text-primary/80 transition-colors hover:border-primary/35 hover:bg-primary/[0.12]"
    >
      <ActionIcon type={action.type} className="h-3.5 w-3.5 shrink-0" />
      {action.label}
      {action.concept_title && (
        <span className="ml-0.5 text-primary/50">· {action.concept_title}</span>
      )}
    </button>
  )
}

function ActionIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'open_flashcards') return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
    </svg>
  )
  if (type === 'open_quiz') return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
  )
  if (type === 'open_notes') return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
  if (type === 'open_weak_topics') return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
  )
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

// ── TutorContent — renders text with fenced code blocks ───────────────────────

function TutorContent({ content }: { content: string }) {
  const parts = content.split(/(```[\w]*[ \t]*\n[\s\S]*?```)/g)

  return (
    <div className="text-sm leading-7 text-foreground/78">
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```([\w]*)[ \t]*\n([\s\S]*?)```$/)
        if (codeMatch) {
          const lang = codeMatch[1]
          const code = codeMatch[2].replace(/\n$/, '')
          return (
            <div key={i} className="my-3 overflow-x-auto rounded-lg border border-border bg-muted/50">
              {lang && (
                <div className="border-b border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/30">
                  {lang}
                </div>
              )}
              <pre className="px-4 py-3 text-xs leading-6 text-foreground/80 font-mono"><code>{code}</code></pre>
            </div>
          )
        }
        return part ? <span key={i} className="whitespace-pre-wrap">{part}</span> : null
      })}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function TutorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
  )
}

function TutorDotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5Z" clipRule="evenodd" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}
