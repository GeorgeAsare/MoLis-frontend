'use client'

import { useState } from 'react'
import { deleteMemory, clearMemoryCategory } from '@/app/actions/userMemories'
import type { UserMemory, MemoryCategory } from '@/types/userMemory'

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preferences',
  goal: 'Goals',
  knowledge: 'Knowledge',
  weakness: 'Weak Areas',
  activity: 'Activity',
  decision: 'Decisions',
  context: 'Context',
}

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  preference: 'text-primary border-primary/20 bg-primary/[0.07]',
  goal: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.07]',
  knowledge: 'text-sky-400 border-sky-500/20 bg-sky-500/[0.07]',
  weakness: 'text-red-400 border-red-500/20 bg-red-500/[0.07]',
  activity: 'text-amber-400 border-amber-500/20 bg-amber-500/[0.07]',
  decision: 'text-violet-400 border-violet-500/20 bg-violet-500/[0.07]',
  context: 'text-foreground/50 border-border bg-muted/30',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

interface Props {
  initialMemories: UserMemory[]
}

export function MemoryDashboard({ initialMemories }: Props) {
  const [memories, setMemories] = useState<UserMemory[]>(initialMemories)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<MemoryCategory | 'all'>('all')

  const categories = Array.from(new Set(memories.map(m => m.category))) as MemoryCategory[]
  const filtered = activeCategory === 'all' ? memories : memories.filter(m => m.category === activeCategory)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteMemory(id)
      setMemories(prev => prev.filter(m => m.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleClearCategory(category: MemoryCategory) {
    await clearMemoryCategory(category)
    setMemories(prev => prev.filter(m => m.category !== category))
    if (activeCategory === category) setActiveCategory('all')
  }

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/40">
          <BrainIcon className="h-5 w-5 text-foreground/15" />
        </div>
        <p className="text-sm text-foreground/30">No memories yet</p>
        <p className="mt-1 text-xs text-foreground/20 max-w-xs leading-relaxed">
          As you study, take quizzes, and interact with agents, MoLis builds a personalised memory of your learning patterns.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            activeCategory === 'all'
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border bg-muted/30 text-foreground/40 hover:text-foreground/60'
          }`}
        >
          All ({memories.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-foreground/40 hover:text-foreground/60'
            }`}
          >
            {CATEGORY_LABELS[cat]} ({memories.filter(m => m.category === cat).length})
          </button>
        ))}
      </div>

      {/* Clear category button */}
      {activeCategory !== 'all' && (
        <div className="flex justify-end">
          <button
            onClick={() => handleClearCategory(activeCategory)}
            className="text-xs text-foreground/25 underline underline-offset-2 hover:text-red-400 transition-colors"
          >
            Clear all {CATEGORY_LABELS[activeCategory].toLowerCase()}
          </button>
        </div>
      )}

      {/* Memory list */}
      <div className="flex flex-col gap-2">
        {filtered.map(memory => (
          <div
            key={memory.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[memory.category as MemoryCategory]}`}>
                  {CATEGORY_LABELS[memory.category as MemoryCategory]}
                </span>
                <span className="text-[11px] text-foreground/25">{memory.source_agent}</span>
                <span className="text-[11px] text-foreground/20">{relativeTime(memory.updated_at)}</span>
              </div>
              <p className="text-sm text-foreground/70 leading-snug">{memory.content}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-foreground/20">Importance {memory.importance}/10</span>
                <span className="text-[10px] text-foreground/20">·</span>
                <span className="text-[10px] text-foreground/20">Confidence {memory.confidence}/10</span>
              </div>
            </div>
            <button
              onClick={() => handleDelete(memory.id)}
              disabled={deletingId === memory.id}
              aria-label="Delete memory"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-foreground/15 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            >
              {deletingId === memory.id
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                : <TrashIcon className="h-3.5 w-3.5" />
              }
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}
