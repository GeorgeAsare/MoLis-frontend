'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { generateRevisionNotes } from '@/app/actions/revisionNotes'
import { Skeleton } from '@/components/ui/Skeleton'
import type { RevisionNote } from '@/types/revisionNotes'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

interface Props {
  documentId: string
  hasExtractedText: boolean
  initialNotes: RevisionNote | null
  analysis?: DocumentAnalysis | null
}

type Phase = 'idle' | 'generating' | 'done' | 'error'

const GENERATION_MESSAGES = [
  'Reading your document…',
  'Identifying key concepts…',
  'Building revision points…',
  'Drafting definitions…',
  'Crafting exam tips…',
  'Structuring your notes…',
]

// Sections for contents rail
interface SectionDef { id: string; label: string }

const ALL_SECTIONS: SectionDef[] = [
  { id: 'sec-overview',    label: 'Overview' },
  { id: 'sec-key-ideas',   label: 'Key ideas' },
  { id: 'sec-core-notes',  label: 'Core notes' },
  { id: 'sec-definitions', label: 'Definitions' },
  { id: 'sec-examples',    label: 'Examples' },
  { id: 'sec-exam-focus',  label: 'Exam focus' },
  { id: 'sec-watchout',    label: 'Watch out for' },
]

// ── RevisionNotesPanel ────────────────────────────────────────────────────────

export function RevisionNotesPanel({
  documentId,
  hasExtractedText,
  initialNotes,
  analysis,
}: Props) {
  const [phase, setPhase] = useState<Phase>(initialNotes ? 'done' : 'idle')
  const [notes, setNotes] = useState<RevisionNote | null>(initialNotes)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [msgIndex, setMsgIndex] = useState(0)

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
    window.addEventListener('molis:generate-notes', handler)
    return () => window.removeEventListener('molis:generate-notes', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function triggerGenerate() {
    if (phase === 'generating') return
    setPhase('generating')
    setErrorMessage(null)
    setMsgIndex(0)
    try {
      const result = await generateRevisionNotes(documentId)
      setNotes(result)
      setPhase('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Generation failed')
      setPhase('error')
    }
  }

  return (
    <div id="revision-notes">
      {phase === 'idle' && (
        <IdleState
          hasExtractedText={hasExtractedText}
          analysis={analysis}
          onGenerate={triggerGenerate}
        />
      )}
      {phase === 'error' && (
        <ErrorState message={errorMessage} onRetry={triggerGenerate} />
      )}
      {phase === 'generating' && (
        <GeneratingState msgIndex={msgIndex} />
      )}
      {phase === 'done' && notes && (
        <NotesDisplay
          notes={notes}
          analysis={analysis}
          onRegenerate={triggerGenerate}
        />
      )}
    </div>
  )
}

// ── IdleState ─────────────────────────────────────────────────────────────────

function IdleState({
  hasExtractedText,
  analysis,
  onGenerate,
}: {
  hasExtractedText: boolean
  analysis?: DocumentAnalysis | null
  onGenerate: () => void
}) {
  const conceptCount = analysis?.key_concepts.length ?? 0
  const defCount     = analysis?.definitions.length ?? 0
  const examCount    = analysis?.likely_exam_topics.length ?? 0
  const hasAnalysis  = !!analysis && conceptCount > 0

  function buildFoundSummary(): string | null {
    if (!hasAnalysis) return null
    const parts: string[] = []
    if (conceptCount > 0) parts.push(`${conceptCount} concept${conceptCount !== 1 ? 's' : ''}`)
    if (defCount > 0)     parts.push(`${defCount} definition${defCount !== 1 ? 's' : ''}`)
    if (examCount > 0)    parts.push(`${examCount} exam area${examCount !== 1 ? 's' : ''}`)
    if (parts.length === 0) return null
    const joined =
      parts.length === 1
        ? parts[0]
        : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
    return `MoLis found ${joined} in this source. Generate structured notes around the most important material.`
  }

  const foundSummary = buildFoundSummary()

  return (
    <div className="flex flex-col gap-6 py-4 max-w-[760px]">
      <div>
        <h2 className="text-[28px] font-bold tracking-[-0.03em] leading-tight text-foreground/88">
          Revision Notes
        </h2>
        {hasAnalysis && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-foreground/38">
            <span>{conceptCount} concept{conceptCount !== 1 ? 's' : ''}</span>
            {defCount > 0  && <span>{defCount} definition{defCount !== 1 ? 's' : ''}</span>}
            {examCount > 0 && <span>{examCount} exam area{examCount !== 1 ? 's' : ''}</span>}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/55 bg-card px-6 py-6 shadow-[var(--shadow-xs)]">
        <p className="text-[15px] leading-[1.72] text-foreground/58">
          {!hasExtractedText
            ? 'Source text extraction must complete before generating notes.'
            : foundSummary
              ?? 'Generate structured revision notes — key concepts, definitions, and exam tips — from this source.'}
        </p>
        <button
          onClick={onGenerate}
          disabled={!hasExtractedText}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.08] px-5 py-2.5 text-[14px] font-semibold text-primary transition-colors hover:border-primary/42 hover:bg-primary/[0.13] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SparklesIcon className="h-4 w-4" />
          Generate revision notes
        </button>
      </div>
    </div>
  )
}

// ── ErrorState ────────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6 py-4 max-w-[760px]">
      <h2 className="text-[28px] font-bold tracking-[-0.03em] text-foreground/88">Revision Notes</h2>
      <div className="flex items-start gap-3.5 rounded-xl border border-red-500/18 bg-red-500/[0.05] px-5 py-4">
        <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-400/70" />
        <div>
          <p className="text-[14px] font-semibold text-red-400/80">Generation failed</p>
          {message && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-red-400/60">{message}</p>
          )}
        </div>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.08] px-5 py-2.5 text-[14px] font-semibold text-primary transition-colors hover:border-primary/42 hover:bg-primary/[0.13]"
      >
        <SparklesIcon className="h-4 w-4" />
        Try again
      </button>
    </div>
  )
}

// ── GeneratingState ───────────────────────────────────────────────────────────

function GeneratingState({ msgIndex }: { msgIndex: number }) {
  return (
    <div className="flex flex-col gap-10 py-4 max-w-[760px]">
      <div>
        <h2 className="text-[28px] font-bold tracking-[-0.03em] text-foreground/88">Revision Notes</h2>
        <div className="mt-5 flex items-center gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-primary/65 border-t-transparent" />
          </div>
          <p className="text-[15px] font-medium text-foreground/65">
            {GENERATION_MESSAGES[msgIndex]}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-5 w-20 rounded" />
        {[100, 95, 88, 78].map((w, i) => (
          <Skeleton key={i} className="h-[18px] rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-24 rounded" />
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3.5">
            <Skeleton className="h-6 w-6 rounded-full shrink-0" />
            <Skeleton className="h-4 rounded" style={{ width: `${75 + i * 5}%` }} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28 rounded" />
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-6 border-b border-border/25 pb-4">
            <Skeleton className="h-4 w-36 rounded shrink-0" />
            <Skeleton className="h-4 flex-1 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── NotesDisplay ──────────────────────────────────────────────────────────────

function NotesDisplay({
  notes,
  analysis,
  onRegenerate,
}: {
  notes: RevisionNote
  analysis?: DocumentAnalysis | null
  onRegenerate: () => void
}) {
  const [showAllConcepts, setShowAllConcepts] = useState(false)
  const [activeSection, setActiveSection] = useState('')

  const misconceptions    = analysis?.misconceptions ?? []
  const analysisExamples  = (analysis?.examples ?? []).slice(0, 6)
  const highExamTopics    = analysis?.likely_exam_topics.filter(t => t.importance === 'high') ?? []
  const medExamTopics     = analysis?.likely_exam_topics.filter(t => t.importance === 'medium') ?? []
  const analysisExamTopics = [...highExamTopics, ...medExamTopics]

  // Sort key concepts: core → supporting → supplementary
  const importanceOrder = { core: 0, supporting: 1, supplementary: 2 } as const
  const sortedConcepts = [...notes.key_concepts].sort((a, b) => {
    const findImportance = (label: string) =>
      analysis?.key_concepts.find(k => k.concept.toLowerCase() === label.toLowerCase())?.importance
    const ia = findImportance(a) ?? 'supplementary'
    const ib = findImportance(b) ?? 'supplementary'
    return (importanceOrder[ia] ?? 2) - (importanceOrder[ib] ?? 2)
  })
  const visibleConcepts = showAllConcepts ? sortedConcepts : sortedConcepts.slice(0, 6)

  // Determine which sections are present
  const visibleSections = ALL_SECTIONS.filter(s => {
    switch (s.id) {
      case 'sec-overview':    return !!notes.summary
      case 'sec-key-ideas':   return sortedConcepts.length > 0
      case 'sec-core-notes':  return notes.bullet_points.length > 0
      case 'sec-definitions': return notes.definitions.length > 0
      case 'sec-examples':    return analysisExamples.length > 0
      case 'sec-exam-focus':  return notes.exam_tips.length > 0 || analysisExamTopics.length > 0
      case 'sec-watchout':    return misconceptions.length > 0
      default: return false
    }
  })

  const showRail = visibleSections.length >= 3

  // Lightweight IntersectionObserver for contents rail highlighting
  useEffect(() => {
    if (!showRail) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
            break
          }
        }
      },
      { threshold: 0.2, rootMargin: '-80px 0px -55% 0px' },
    )
    visibleSections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRail, visibleSections.length])

  return (
    <div className="flex items-start gap-10 py-4">

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 flex flex-col gap-12">

        {/* Page title + Regenerate */}
        <div className="flex items-start justify-between gap-4 max-w-[760px]">
          <div className="min-w-0">
            <h2 className="text-[28px] font-bold tracking-[-0.03em] leading-tight text-foreground/90">
              Revision Notes
            </h2>
            <p className="mt-2 text-[15px] font-medium text-foreground/48">{notes.title}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-foreground/32">
              {notes.key_concepts.length > 0 && (
                <span>{notes.key_concepts.length} concept{notes.key_concepts.length !== 1 ? 's' : ''}</span>
              )}
              {notes.exam_tips.length > 0 && (
                <span>{notes.exam_tips.length} exam tip{notes.exam_tips.length !== 1 ? 's' : ''}</span>
              )}
              {notes.definitions.length > 0 && (
                <span>{notes.definitions.length} definition{notes.definitions.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
          <button
            onClick={onRegenerate}
            className="mt-1 shrink-0 flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-1.5 text-[12px] font-medium text-foreground/42 transition-colors hover:text-foreground/65"
          >
            <RegenerateIcon className="h-3 w-3" />
            Regenerate
          </button>
        </div>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {notes.summary && (
          <section id="sec-overview" className="max-w-[760px]">
            <NotesHeading>Overview</NotesHeading>
            <p className="mt-4 text-[16px] leading-[1.78] text-foreground/70">{notes.summary}</p>
          </section>
        )}

        {/* ── Key ideas ────────────────────────────────────────────────────── */}
        {sortedConcepts.length > 0 && (
          <section id="sec-key-ideas" className="max-w-[760px]">
            <NotesHeading>Key ideas</NotesHeading>
            <ol className="mt-5 flex flex-col gap-4">
              {visibleConcepts.map((concept, i) => {
                const matched = analysis?.key_concepts.find(
                  k => k.concept.toLowerCase() === concept.toLowerCase()
                )
                const isCore = matched?.importance === 'core'
                return (
                  <li key={i} className="flex items-start gap-3.5">
                    <span className={cn(
                      'mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
                      isCore
                        ? 'bg-primary/[0.08] text-primary/65'
                        : 'bg-muted/60 text-foreground/38',
                    )}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-[15px] font-semibold',
                        isCore ? 'text-foreground/88' : 'text-foreground/78',
                      )}>
                        {concept}
                      </p>
                      {matched?.explanation && (
                        <p className="mt-1 text-[14px] leading-[1.65] text-foreground/50">
                          {matched.explanation}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
            {sortedConcepts.length > 6 && !showAllConcepts && (
              <button
                onClick={() => setShowAllConcepts(true)}
                className="mt-4 text-[13px] font-medium text-foreground/42 underline-offset-2 transition-colors hover:text-foreground/65 hover:underline"
              >
                View all {sortedConcepts.length} concepts →
              </button>
            )}
          </section>
        )}

        {/* ── Core notes — explanatory statements, not a task list ──────────── */}
        {notes.bullet_points.length > 0 && (
          <section id="sec-core-notes" className="max-w-[760px]">
            <NotesHeading>Core notes</NotesHeading>
            <div className="mt-5 flex flex-col gap-5">
              {notes.bullet_points.map((point, i) => (
                <div key={i} className="flex items-start gap-3.5">
                  <span className="mt-[10px] h-[5px] w-[5px] shrink-0 rounded-full bg-foreground/20" />
                  <p className="text-[15px] leading-[1.75] text-foreground/70">{point}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Definitions ───────────────────────────────────────────────────── */}
        {notes.definitions.length > 0 && (
          <section id="sec-definitions" className="max-w-[760px]">
            <NotesHeading>Definitions</NotesHeading>
            <dl className="mt-5 flex flex-col border-t border-border/30">
              {notes.definitions.map(({ term, definition }, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 border-b border-border/30 py-4 sm:flex-row sm:gap-8"
                >
                  <dt className="shrink-0 text-[15px] font-semibold text-foreground/82 sm:w-[200px]">
                    {term}
                  </dt>
                  <dd className="text-[15px] leading-[1.72] text-foreground/60">{definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* ── Examples — source-derived from analysis ───────────────────────── */}
        {analysisExamples.length > 0 && (
          <section id="sec-examples" className="max-w-[760px]">
            <NotesHeading>Examples</NotesHeading>
            <div className="mt-5 flex flex-col gap-3.5">
              {analysisExamples.map((ex, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/40 bg-muted/15 px-4 py-3.5"
                >
                  <p className="text-[14px] leading-[1.72] text-foreground/65">{ex.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Exam focus ────────────────────────────────────────────────────── */}
        {(notes.exam_tips.length > 0 || analysisExamTopics.length > 0) && (
          <section id="sec-exam-focus" className="max-w-[760px]">
            <NotesHeading accent>Exam focus</NotesHeading>

            {/* Revision strategies — practical, per-topic advice from generated notes */}
            {notes.exam_tips.length > 0 && (
              <div className="mt-5">
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/30">
                  Revision strategies
                </p>
                <div className="flex flex-col gap-5">
                  {notes.exam_tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-3.5">
                      <span className="mt-[10px] h-[5px] w-[5px] shrink-0 rounded-full bg-primary/55" />
                      <p className="text-[15px] leading-[1.72] text-foreground/70">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exam priorities — ranked topics from analysis, distinct purpose from tips */}
            {analysisExamTopics.length > 0 && (
              <div className={cn(
                'rounded-xl border border-primary/12 bg-primary/[0.04] p-5',
                notes.exam_tips.length > 0 ? 'mt-6' : 'mt-5',
              )}>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary/55">
                  Exam priorities
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {analysisExamTopics.slice(0, 5).map(t => (
                    <div key={t.topic} className="flex items-center gap-3">
                      <span className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        t.importance === 'high' ? 'bg-primary/70' : 'bg-foreground/22',
                      )} />
                      <span className="text-[14px] font-medium text-foreground/72">{t.topic}</span>
                      {t.importance === 'high' && (
                        <span className="text-[11px] font-semibold text-primary/50">high priority</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Misconceptions ────────────────────────────────────────────────── */}
        {misconceptions.length > 0 && (
          <section id="sec-watchout" className="max-w-[760px]">
            <NotesHeading>Watch out for</NotesHeading>
            <div className="mt-5 flex flex-col gap-5">
              {misconceptions.map((m, i) => (
                <div key={i} className="border-l-2 border-foreground/10 pl-5">
                  <p className="text-[15px] font-semibold text-foreground/65">
                    &ldquo;{m.misconception}&rdquo;
                  </p>
                  {m.correction && (
                    <p className="mt-1.5 text-[14px] leading-[1.65] text-foreground/50">
                      {m.correction}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Contents rail — xl+ only, when 3+ sections present ─────────────── */}
      {showRail && (
        <aside className="hidden xl:block w-44 shrink-0" aria-label="Page contents">
          <div className="sticky top-8">
            <ContentsRail sections={visibleSections} activeId={activeSection} />
          </div>
        </aside>
      )}
    </div>
  )
}

// ── ContentsRail ──────────────────────────────────────────────────────────────

function ContentsRail({ sections, activeId }: { sections: SectionDef[]; activeId: string }) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <nav aria-label="Page contents">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/28">
        Contents
      </p>
      <div className="flex flex-col gap-0.5">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={cn(
              'rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-150',
              activeId === s.id
                ? 'bg-muted/40 font-medium text-foreground/82'
                : 'text-foreground/38 hover:text-foreground/65',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

// ── NotesHeading ──────────────────────────────────────────────────────────────

function NotesHeading({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <h3 className={cn(
      'text-[20px] font-bold tracking-[-0.025em]',
      accent ? 'text-primary/80' : 'text-foreground/82',
    )}>
      {children}
    </h3>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
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
