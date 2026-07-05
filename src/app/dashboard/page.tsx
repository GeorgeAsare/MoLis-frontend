import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FadeIn, SlideUp, StaggerContainer, StaggerItem, HoverLift } from '@/components/animations'
import { NeuralOrb } from '@/components/ui/NeuralOrb'
import { getStudyDigest } from '@/app/actions/studyDigest'
import type { WeakTopic } from '@/types/weakTopic'
import type { DigestActivity, DigestActivityType } from '@/types/studyDigest'

export const metadata = {
  title: 'Dashboard — MoLis',
}

// ── Page ─────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  const [topWeakTopicsResult, digest] = await Promise.all([
    user
      ? supabase
          .from('weak_topics')
          .select('id, topic, weakness_score, last_seen, document_id')
          .eq('user_id', user.id)
          .order('weakness_score', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: null }),
    getStudyDigest(),
  ])

  const topWeakTopics = (topWeakTopicsResult.data as Pick<
    WeakTopic,
    'id' | 'topic' | 'weakness_score' | 'last_seen' | 'document_id'
  >[] | null) ?? []

  const docCount = digest?.document_count ?? 0

  const statCards = [
    {
      href: '/dashboard/study',
      label: 'Study',
      description: 'Documents, notes, exam prep',
      stat: String(docCount),
      statLabel: 'documents',
      accentText: 'text-primary',
      ringClass: 'border-primary/20 bg-primary/[0.08]',
      icon: StudyIcon,
    },
    {
      href: '/dashboard/agents',
      label: 'Agents',
      description: 'Tasks, research, automation',
      stat: '0',
      statLabel: 'active tasks',
      accentText: 'text-purple-400',
      ringClass: 'border-purple-500/20 bg-primary/[0.08]',
      icon: AgentsIcon,
    },
    {
      href: '/dashboard/memory',
      label: 'Memory',
      description: 'What MoLis knows about you',
      stat: '0',
      statLabel: 'learned facts',
      accentText: 'text-sky-400',
      ringClass: 'border-sky-500/20 bg-sky-500/[0.08]',
      icon: MemoryIcon,
    },
  ]

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="relative min-h-full w-full">

      {/* ── Ambient background ──────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-64 left-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[120px]"
          style={{ background: 'rgba(190,28,28,0.08)' }}
        />
        <div className="absolute inset-0 bg-grid-dots opacity-[0.18]" />
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="relative z-10 flex w-full flex-col px-8 py-8">

        {/* Header */}
        <FadeIn className="mb-7">
          <header>
            <div className="mb-3.5 flex items-center gap-2.5">
              <NeuralOrb size="xs" pulse />
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/28">
                  System active
                </span>
                <span className="h-3 w-px bg-foreground/10" />
                <span className="text-[11px] text-foreground/18">MoLis v1.0</span>
              </div>
            </div>
            <h1 className="text-[1.9rem] font-semibold tracking-[-0.03em] leading-tight text-foreground">
              {greeting},{' '}
              <span className="text-gradient-red">{name}</span>
            </h1>
            <p className="mt-1.5 text-sm text-foreground/32">
              Your AI operating system is ready.
            </p>
          </header>
        </FadeIn>

        {/* ── Two-column canvas grid ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">

          {/* ── Left column ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">

            {/* Stat cards */}
            <StaggerContainer className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {statCards.map(({ href, label, description, stat, statLabel, accentText, ringClass, icon: Icon }) => (
                <StaggerItem key={href}>
                  <HoverLift className="h-full" lift={-3} scale={1.01}>
                    <Link
                      href={href}
                      className="group relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/20 hover:bg-muted/50"
                    >
                      <div className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(190,28,28,0.055),transparent)]" />
                      <div className="absolute bottom-0 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                      <div className="relative flex items-start justify-between">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${ringClass}`}>
                          <Icon className={`h-4 w-4 ${accentText}`} />
                        </div>
                        <ArrowDiagIcon className="h-3.5 w-3.5 text-foreground/15 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/40" />
                      </div>

                      <div className="relative">
                        <div className="mb-1 flex items-baseline gap-1.5">
                          <span className="text-[1.6rem] font-semibold tracking-tight text-foreground tabular-nums">
                            {stat}
                          </span>
                          <span className="text-xs text-foreground/38">{statLabel}</span>
                        </div>
                        <p className="text-[13px] font-medium text-foreground/72">{label}</p>
                        <p className="mt-0.5 text-xs text-foreground/38">{description}</p>
                      </div>
                    </Link>
                  </HoverLift>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {/* Adaptive Learning */}
            <SlideUp delay={0.3}>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground/75">Adaptive Learning</p>
                    <p className="mt-0.5 text-xs text-foreground/38">Your weakest topics across all documents</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50">
                    <TargetIcon className="h-3.5 w-3.5 text-foreground/32" />
                  </div>
                </div>

                {topWeakTopics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40">
                      <TargetIcon className="h-5 w-5 text-foreground/20" />
                    </div>
                    <p className="text-sm text-foreground/40">No weak topics detected yet</p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-foreground/25">
                      Complete a quiz to start adaptive tracking.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {topWeakTopics.map((wt) => {
                      const score = wt.weakness_score
                      const accent =
                        score >= 4 ? 'text-red-400' : score >= 2 ? 'text-orange-400' : 'text-yellow-400/90'
                      const badge =
                        score >= 4
                          ? 'border-red-500/20 bg-red-500/[0.07] text-red-400'
                          : score >= 2
                            ? 'border-orange-500/18 bg-orange-500/[0.06] text-orange-400'
                            : 'border-yellow-500/18 bg-yellow-500/[0.06] text-yellow-400/90'
                      const dot =
                        score >= 4 ? 'bg-red-400/70' : score >= 2 ? 'bg-orange-400/70' : 'bg-yellow-400/60'
                      return (
                        <div
                          key={wt.id}
                          className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5"
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                          <span className={`flex-1 truncate text-sm font-medium ${accent}`}>{wt.topic}</span>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${badge}`}>
                            ×{score}
                          </span>
                        </div>
                      )
                    })}
                    <Link
                      href="/dashboard/study"
                      className="mt-1 text-right text-[11px] text-foreground/25 transition-colors hover:text-foreground/50"
                    >
                      View study documents →
                    </Link>
                  </div>
                )}
              </div>
            </SlideUp>
          </div>

          {/* ── Right column ────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">

            {/* Daily Digest */}
            <SlideUp delay={0.32}>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground/75">Daily Digest</p>
                    <p className="mt-0.5 text-xs text-foreground/38">
                      {digest?.concepts_reviewed_today
                        ? `${digest.concepts_reviewed_today} concept${digest.concepts_reviewed_today !== 1 ? 's' : ''} reviewed today`
                        : 'Activity & updates'}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50">
                    <DigestIcon className="h-3.5 w-3.5 text-foreground/32" />
                  </div>
                </div>

                {(!digest || digest.activities.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/40">
                      <ClockIcon className="h-4 w-4 text-foreground/20" />
                    </div>
                    <p className="text-sm text-foreground/38">No activity today</p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/22">
                      Study sessions appear here as you work.
                    </p>
                    <Link
                      href="/dashboard/study"
                      className="mt-3 text-[11px] font-medium text-primary/60 transition-colors hover:text-primary"
                    >
                      Start studying →
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {digest.activities.map((activity, i) => (
                      <DigestItem key={i} activity={activity} />
                    ))}
                    <Link
                      href="/dashboard/study"
                      className="mt-1 text-right text-[11px] text-foreground/25 transition-colors hover:text-foreground/50"
                    >
                      View all study sets →
                    </Link>
                  </div>
                )}
              </div>
            </SlideUp>

            {/* Intelligence Panel */}
            <SlideUp delay={0.40}>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground/75">Quick Launch</p>
                    <p className="mt-0.5 text-xs text-foreground/38">Jump back in</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50">
                    <BoltIcon className="h-3.5 w-3.5 text-foreground/32" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {[
                    { href: '/dashboard/study',  label: 'Open Study',   sub: 'Documents & AI tools', icon: StudyIcon },
                    { href: '/dashboard/agents', label: 'Run an Agent', sub: 'Tasks & automation',   icon: AgentsIcon },
                    { href: '/dashboard/memory', label: 'View Memory',  sub: 'What MoLis knows',     icon: MemoryIcon },
                  ].map(({ href, label, sub, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-muted/25 px-3.5 py-3 transition-all duration-200 hover:border-border hover:bg-muted/50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 transition-colors duration-200 group-hover:border-primary/20 group-hover:bg-primary/[0.07]">
                        <Icon className="h-3.5 w-3.5 text-foreground/30 transition-colors duration-200 group-hover:text-primary/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-foreground/70 group-hover:text-foreground/90">{label}</p>
                        <p className="text-[11px] text-foreground/30">{sub}</p>
                      </div>
                      <ArrowDiagIcon className="h-3 w-3 shrink-0 text-foreground/15 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/35" />
                    </Link>
                  ))}
                </div>
              </div>
            </SlideUp>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DigestItem ────────────────────────────────────────────────────────────

const DIGEST_META: Record<DigestActivityType, { label: string; dot: string }> = {
  quiz_completed:          { label: 'Quiz',       dot: 'bg-violet-400/70' },
  quiz_in_progress:        { label: 'Quiz',       dot: 'bg-violet-400/40' },
  flashcards_completed:    { label: 'Flashcards', dot: 'bg-sky-400/70' },
  flashcards_in_progress:  { label: 'Flashcards', dot: 'bg-sky-400/40' },
  tutor_session:           { label: 'AI Tutor',   dot: 'bg-primary/60' },
  notes_generated:         { label: 'Notes',      dot: 'bg-emerald-400/70' },
}

function DigestItem({ activity }: { activity: DigestActivity }) {
  const meta = DIGEST_META[activity.type]
  return (
    <Link
      href={activity.href}
      className="group flex items-start gap-2.5 rounded-xl border border-border bg-muted/25 px-3 py-2.5 transition-all duration-200 hover:border-border hover:bg-muted/50"
    >
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold text-foreground/35 uppercase tracking-wide">{meta.label}</span>
          <span className="truncate text-[12px] font-medium text-foreground/60 group-hover:text-foreground/80">
            {activity.document_title}
          </span>
        </div>
        <p className="text-[11px] text-foreground/30">{activity.detail}</p>
      </div>
    </Link>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

function StudyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}

function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function ArrowDiagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
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

function DigestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  )
}
