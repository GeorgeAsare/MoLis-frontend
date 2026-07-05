import Link from 'next/link'
import { FadeIn, SlideUp, StaggerContainer, StaggerItem, HoverLift } from '@/components/animations'
import { NeuralOrb } from '@/components/ui/NeuralOrb'
import { getDashboardIntelligence } from '@/app/actions/dashboardIntelligence'
import { createClient } from '@/lib/supabase/server'
import type { DigestActivity, DigestActivityType } from '@/types/studyDigest'
import type { WeakConceptItem, WeakReason, RecommendedNextAction } from '@/types/dashboardIntelligence'

export const metadata = {
  title: 'Dashboard — MoLis',
}

// ── Page ─────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'
  const intel = await getDashboardIntelligence()

  const totalDocs = intel?.total_documents ?? 0
  const totalConcepts = intel?.total_concepts_tracked ?? 0
  const weakCount = intel?.weak_concepts_count ?? 0
  const reviewsDue = intel?.reviews_due_count ?? 0

  const statCards = [
    {
      href: '/dashboard/study',
      label: 'Study',
      description: 'Documents, notes, exam prep',
      stat: String(totalDocs),
      statLabel: 'documents',
      accentText: 'text-primary',
      ringClass: 'border-primary/20 bg-primary/[0.08]',
      icon: StudyIcon,
    },
    {
      href: '/dashboard/study',
      label: 'Learning',
      description: totalConcepts > 0 ? `${weakCount} weak · ${totalConcepts} tracked` : 'Concept mastery tracking',
      stat: String(totalConcepts),
      statLabel: 'concepts',
      accentText: 'text-sky-400',
      ringClass: 'border-sky-500/20 bg-sky-500/[0.08]',
      icon: ConceptsIcon,
    },
    {
      href: '/dashboard/study',
      label: 'Reviews',
      description: reviewsDue > 0 ? 'Concepts overdue for review' : 'All reviews up to date',
      stat: String(reviewsDue),
      statLabel: reviewsDue === 1 ? 'due' : 'due',
      accentText: reviewsDue > 0 ? 'text-amber-400' : 'text-emerald-400',
      ringClass: reviewsDue > 0 ? 'border-amber-500/20 bg-amber-500/[0.07]' : 'border-emerald-500/20 bg-emerald-500/[0.07]',
      icon: ReviewsIcon,
    },
  ]

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const digest = intel?.digest
  const topWeakConcepts = intel?.top_weak_concepts ?? []
  const nextAction = intel?.recommended_next_action ?? null

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
              {intel?.overall_readiness_estimate
                ? `Overall readiness: ${intel.overall_readiness_estimate}%`
                : 'Your AI operating system is ready.'}
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
                <StaggerItem key={label}>
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

            {/* Recommended Next Action */}
            {nextAction && (
              <SlideUp delay={0.25}>
                <NextActionCard action={nextAction} />
              </SlideUp>
            )}

            {/* Adaptive Learning */}
            <SlideUp delay={0.3}>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground/75">Adaptive Learning</p>
                    <p className="mt-0.5 text-xs text-foreground/38">
                      {topWeakConcepts.length > 0
                        ? `${weakCount} weak concept${weakCount !== 1 ? 's' : ''} across all documents`
                        : 'Your weakest topics across all documents'}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50">
                    <TargetIcon className="h-3.5 w-3.5 text-foreground/32" />
                  </div>
                </div>

                {topWeakConcepts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40">
                      <TargetIcon className="h-5 w-5 text-foreground/20" />
                    </div>
                    <p className="text-sm text-foreground/40">No weak concepts detected yet</p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-foreground/25">
                      Complete a quiz to start adaptive tracking.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {topWeakConcepts.map((wc) => (
                      <WeakConceptRow key={wc.concept_id} item={wc} />
                    ))}
                    <Link
                      href="/dashboard/study"
                      className="mt-1 text-right text-[11px] text-foreground/25 transition-colors hover:text-foreground/50"
                    >
                      View all study documents →
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
                    <p className="text-[13px] font-semibold text-foreground/75">
                      {digest?.is_fallback ? 'Recent Activity' : 'Daily Digest'}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/38">
                      {digest?.is_fallback
                        ? 'Past 7 days'
                        : digest?.concepts_reviewed_today
                          ? `${digest.concepts_reviewed_today} concept${digest.concepts_reviewed_today !== 1 ? 's' : ''} reviewed today`
                          : 'Today\'s activity'}
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
                    <p className="text-sm text-foreground/38">No recent activity</p>
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

            {/* Quick Launch */}
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

// ── NextActionCard ────────────────────────────────────────────────────────────

function NextActionCard({ action }: { action: RecommendedNextAction }) {
  const href = `/dashboard/study/${action.document_id}?tab=${action.tab}`
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary/50">
          Start here
        </p>
        <SparkleIcon className="h-3.5 w-3.5 text-primary/40" />
      </div>
      <p className="text-[15px] font-semibold leading-snug text-foreground/80">
        {action.concept_title}
      </p>
      <p className="mt-0.5 truncate text-xs text-foreground/35">{action.document_title}</p>
      <p className="mt-2 text-xs leading-relaxed text-foreground/40">{action.reason}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/[0.08] px-3.5 py-2 text-[12px] font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.14]"
      >
        {action.action_label}
        <ArrowRightIcon className="h-3 w-3" />
      </Link>
    </div>
  )
}

// ── WeakConceptRow ────────────────────────────────────────────────────────────

const REASON_META: Record<WeakReason, { text: string; badge: string }> = {
  low_mastery:     { text: 'Low mastery',    badge: 'border-red-500/20 bg-red-500/[0.07] text-red-400' },
  forgetting_risk: { text: 'Forgetting risk', badge: 'border-amber-500/20 bg-amber-500/[0.07] text-amber-400' },
  recent_mistakes: { text: 'Recent mistakes', badge: 'border-orange-500/20 bg-orange-500/[0.07] text-orange-400' },
}

const MASTERY_DOT: (score: number) => string = (score) =>
  score < 30 ? 'bg-red-400/70' : score < 50 ? 'bg-orange-400/70' : 'bg-yellow-400/60'

const MASTERY_TEXT: (score: number) => string = (score) =>
  score < 30 ? 'text-red-400' : score < 50 ? 'text-orange-400' : 'text-yellow-400/90'

const MASTERY_BADGE: (score: number) => string = (score) =>
  score < 30
    ? 'border-red-500/20 bg-red-500/[0.07] text-red-400'
    : score < 50
      ? 'border-orange-500/18 bg-orange-500/[0.06] text-orange-400'
      : 'border-yellow-500/18 bg-yellow-500/[0.06] text-yellow-400/90'

function WeakConceptRow({ item }: { item: WeakConceptItem }) {
  const reason = REASON_META[item.reason]
  return (
    <Link
      href={item.href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3 transition-colors hover:border-border hover:bg-muted/50"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${MASTERY_DOT(item.mastery_score)}`} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${MASTERY_TEXT(item.mastery_score)}`}>
          {item.concept_title}
        </p>
        <p className="truncate text-[11px] text-foreground/28">{item.document_title}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${MASTERY_BADGE(item.mastery_score)}`}>
          {item.mastery_score}%
        </span>
        <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${reason.badge}`}>
          {reason.text}
        </span>
      </div>
    </Link>
  )
}

// ── DigestItem ────────────────────────────────────────────────────────────────

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

// ── Icons ─────────────────────────────────────────────────────────────────────

function StudyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function ConceptsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
    </svg>
  )
}

function ReviewsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
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

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
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

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}
