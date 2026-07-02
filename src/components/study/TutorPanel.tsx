'use client'

import { useState, useRef, useEffect } from 'react'
import { askTutor } from '@/app/actions/tutor'
import { appendTutorMessage, clearTutorMessages } from '@/app/actions/tutorMessages'
import type { TutorMessage, TutorMode } from '@/types/tutor'

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  documentId: string
  initialMessages?: TutorMessage[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TutorPanel({ documentId, initialMessages = [] }: Props) {
  const [messages, setMessages]   = useState<TutorMessage[]>(initialMessages)
  const [input, setInput]         = useState('')
  const [mode, setMode]           = useState<TutorMode>('explain')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(overrideText?: string, overrideMode?: TutorMode) {
    const q    = (overrideText ?? input).trim()
    const m    = overrideMode ?? mode
    if (!q || loading) return

    setInput('')
    setError(null)

    const userMsg: TutorMessage = { role: 'user', content: q, mode: m, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await askTutor({
        documentId,
        question: q,
        mode: m,
        recentMessages: messages.slice(-6),
      })
      const assistantMsg: TutorMessage = {
        role: 'assistant',
        content: res.answer,
        mode: res.mode,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])
      appendTutorMessage(documentId, { role: 'user', content: q, mode: m }).catch(() => {})
      appendTutorMessage(documentId, { role: 'assistant', content: res.answer, mode: res.mode }).catch(() => {})
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
    <div className="flex flex-col gap-4">

      {/* Mode selector + personalised badge */}
      <div className="flex flex-col gap-1.5">
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

      {/* Messages or empty state */}
      {messages.length === 0 && !loading ? (
        <EmptyState onSuggest={handleSuggest} />
      ) : (
        <div className="flex flex-col gap-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {loading && <ThinkingBubble />}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs leading-relaxed text-red-400">
          {error}
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
            clearTutorMessages(documentId).catch(() => {})
          }}
          className="self-start text-[11px] text-foreground/22 transition-colors hover:text-foreground/45"
        >
          Clear conversation
        </button>
      )}
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

function MessageBubble({ msg }: { msg: TutorMessage }) {
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
        <div className="flex-1 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
          {msg.mode && (
            <span className="mb-2 inline-block rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-foreground/30">
              {MODE_LABEL[msg.mode]}
            </span>
          )}
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/78">{msg.content}</p>
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
