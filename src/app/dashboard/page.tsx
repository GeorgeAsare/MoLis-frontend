import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FadeIn, SlideUp } from '@/components/animations'
import { getDashboardIntelligence } from '@/app/actions/dashboardIntelligence'
import { getStudentKnowledgeTwin } from '@/app/actions/studentKnowledgeTwin'
import { getSubjects } from '@/app/actions/subjects'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { DigestActivity, DigestActivityType } from '@/types/studyDigest'
import type { WeakConceptItem, RecommendedNextAction } from '@/types/dashboardIntelligence'
import type { StudentKnowledgeTwin } from '@/types/studentKnowledgeTwin'
import type { StudentProfileRow, AcademicProfile, StudyPreferences } from '@/types/user'
import { computeStudentPerformanceProfile, DEFAULT_STUDY_PREFS } from '@/lib/studentPerformance'
import type { StudentPerformanceProfile } from '@/types/studentPerformance'
import type { Subject } from '@/types/subject'

export const metadata = {
  title: 'Dashboard — MoLis',
}

// ── Performance status config ─────────────────────────────────────────────────
const PERF_STATUS: Record<string, { label: string; dot: string; text: string; ring: string }> = {
  on_track:           { label: 'On track',      dot: 'bg-emerald-400', text: 'text-emerald-400', ring: 'border-emerald-500/20 bg-emerald-500/[0.06]' },
  approaching_target: { label: 'Approaching',   dot: 'bg-orange-400',  text: 'text-orange-400',  ring: 'border-orange-500/18 bg-orange-500/[0.07]' },
  behind_target:      { label: 'Behind target', dot: 'bg-amber-400',   text: 'text-amber-400',   ring: 'border-amber-500/20 bg-amber-500/[0.07]' },
  needs_urgent_focus: { label: 'Needs focus',   dot: 'bg-red-400',     text: 'text-red-400',     ring: 'border-red-500/20 bg-red-500/[0.07]' },
  not_enough_data:    { label: 'Building',      dot: 'bg-foreground/20',text: 'text-foreground/38',ring: 'border-border/60 bg-muted/25' },
}

// ── Mastery helpers ───────────────────────────────────────────────────────────
function masteryLabel(score: number): string {
  if (score < 20) return 'Needs attention'
  if (score < 40) return 'Developing'
  if (score < 60) return 'Strengthening'
  return 'Strong'
}

function isConceptDue(item: WeakConceptItem): boolean {
  if (!item.next_review_at) return false
  return new Date(item.next_review_at) <= new Date()
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileRows, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user!.id)
    .limit(1)

  if (!profileError && !profileRows?.[0]?.onboarding_completed) {
    redirect('/dashboard/onboarding')
  }

  const profileRow = (profileRows?.[0] ?? null) as StudentProfileRow | null
  const name = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  const [intel, twin, subjects] = await Promise.all([
    getDashboardIntelligence(),
    getStudentKnowledgeTwin(),
    getSubjects().catch((): Subject[] => []),
  ])

  const academicProfile = profileRow?.academic_profile as AcademicProfile | undefined
  const studyPrefs = profileRow?.study_preferences as StudyPreferences | undefined
  const performanceProfile: StudentPerformanceProfile | null =
    academicProfile?.subjects?.length &&
    academicProfile.subjects.some(s => s.target_grade)
      ? computeStudentPerformanceProfile({
          academic: academicProfile,
          prefs: studyPrefs ?? DEFAULT_STUDY_PREFS,
          twin,
          intel,
        })
      : null

  const totalDocs      = intel?.total_documents ?? 0
  const totalConcepts  = intel?.total_concepts_tracked ?? 0
  const reviewsDue     = intel?.reviews_due_count ?? 0
  const weakCount      = intel?.weak_concepts_count ?? 0
  const topWeakConcepts = intel?.top_weak_concepts ?? []
  const nextAction     = intel?.recommended_next_action ?? null
  const digest         = intel?.digest ?? null

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const intelligenceLine = (() => {
    if (reviewsDue > 1)
      return `${reviewsDue} concepts are due — a good time to catch up.`
    if (reviewsDue === 1)
      return `One concept is due for review. A quick session will help.`
    if (intel?.overall_readiness_estimate && intel.overall_readiness_estimate > 0)
      return `Readiness estimate: ${intel.overall_readiness_estimate}% across your subjects.`
    if (totalConcepts > 0)
      return `${totalConcepts} concept${totalConcepts === 1 ? '' : 's'} tracked across ${totalDocs} document${totalDocs === 1 ? '' : 's'}.`
    if (totalDocs > 0)
      return totalDocs === 1
        ? `1 document is ready when you are.`
        : `${totalDocs} documents are ready when you are.`
    return "You're just getting started — your profile will grow as you study."
  })()

  return (
    <div className="relative min-h-full w-full">

      {/* Ambient — restrained */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-60 left-1/4 h-[480px] w-[480px] -translate-x-1/2 rounded-full blur-[140px]"
          style={{ background: 'rgba(190,28,28,0.05)' }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col px-6 py-8 lg:px-10 lg:py-8">

        {/* ── PERSONAL MOMENT ────────────────────────────────────────────── */}
        <FadeIn className="mb-7">
          <p className="mb-3 text-[12px] font-medium tracking-[0.04em] text-foreground/52">
            {greeting}
          </p>
          <h1 className="mb-4 text-[2.6rem] font-bold tracking-[-0.04em] leading-[1.02] text-foreground sm:text-[2.9rem] lg:text-[3.1rem]">
            {name}<span className="text-primary">.</span>
          </h1>
          <p className="max-w-[520px] text-[16px] leading-relaxed text-foreground/65">
            {intelligenceLine}
          </p>
        </FadeIn>

        {/* ── PRIMARY ACTION ─────────────────────────────────────────────── */}
        <FadeIn delay={0.07} className="mb-7">
          <HeroPrimaryAction nextAction={nextAction} totalDocs={totalDocs} />
        </FadeIn>

        {/* ── INTELLIGENCE STRIP ─────────────────────────────────────────── */}
        <FadeIn delay={0.11} className="mb-8">
          <IntelligenceStrip
            totalDocs={totalDocs}
            totalConcepts={totalConcepts}
            reviewsDue={reviewsDue}
          />
        </FadeIn>

        {/* ── SUBJECTS ───────────────────────────────────────────────────── */}
        {subjects.length > 0 && (
          <SlideUp delay={0.15} className="mb-8">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold tracking-tight text-foreground/65">Subjects</p>
                <Link
                  href="/dashboard/subjects"
                  className="text-[13px] font-semibold text-foreground/48 transition-colors hover:text-foreground/78"
                >
                  Manage →
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {subjects.map(s => (
                  <Link
                    key={s.id}
                    href={`/dashboard/subjects/${s.id}`}
                    className="shrink-0 rounded-xl bg-card px-4 py-2 text-[14px] font-semibold text-foreground/62 shadow-[var(--shadow-xs)] ring-1 ring-inset ring-transparent transition-all duration-150 hover:text-foreground hover:shadow-[var(--shadow-sm)] hover:ring-primary/[0.14]"
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          </SlideUp>
        )}

        {/* ── CONTENT ────────────────────────────────────────────────────── */}
        {(() => {
          const hasRecentActivity = !!digest && digest.activities.length > 0
          return (
            <div className={cn(
              'grid grid-cols-1 gap-10',
              hasRecentActivity && 'lg:grid-cols-[minmax(0,1fr)_240px]',
            )}>

              {/* Left — Learning (expands full-width when no recent) */}
              <SlideUp delay={0.19}>
                <LearningSection
                  topWeakConcepts={topWeakConcepts}
                  weakCount={weakCount}
                  reviewsDue={reviewsDue}
                  twin={twin}
                  performanceProfile={performanceProfile}
                  showRecentHint={!hasRecentActivity}
                />
              </SlideUp>

              {/* Right — Recent activity (only when real data exists) */}
              {hasRecentActivity && (
                <SlideUp delay={0.23}>
                  <div className="lg:border-l lg:border-border/20 lg:pl-6">
                    <DigestSection digest={digest} />
                  </div>
                </SlideUp>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── StudySourceMark ───────────────────────────────────────────────────────────
function StudySourceMark({ title }: { title: string; sourceType?: string }) {
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    || title.slice(0, 1).toUpperCase()
    || '?'

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px] bg-foreground/[0.055] ring-1 ring-inset ring-foreground/[0.09]">
      <span className="text-[26px] font-bold leading-none tracking-[-0.04em] text-foreground/75">
        {initials}
      </span>
    </div>
  )
}

// ── HeroPrimaryAction ─────────────────────────────────────────────────────────
function HeroPrimaryAction({
  nextAction,
  totalDocs,
}: {
  nextAction: RecommendedNextAction | null
  totalDocs: number
}) {
  const cta = nextAction
    ? {
        href: `/dashboard/study/${nextAction.document_id}?tab=${nextAction.tab}`,
        eyebrow: nextAction.action_label,
        title: nextAction.concept_title,
        sub: nextAction.document_title,
      }
    : totalDocs > 0
      ? {
          href: '/dashboard/study',
          eyebrow: 'Your study library',
          title: `${totalDocs} document${totalDocs === 1 ? '' : 's'} ready to study`,
          sub: 'Open your notes, quizzes, and flashcards.',
        }
      : {
          href: '/dashboard/study',
          eyebrow: 'Get started',
          title: 'Upload your first document',
          sub: 'MoLis generates notes, quizzes, and flashcards automatically.',
        }

  const primaryVisual =
    nextAction != null ? (
      <StudySourceMark title={nextAction.document_title} sourceType="Document" />
    ) : totalDocs > 0 ? (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px] bg-foreground/[0.05] ring-1 ring-inset ring-foreground/[0.09]">
        <BookOpenIcon className="h-7 w-7 text-primary/65" />
      </div>
    ) : (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px] bg-primary/[0.06] ring-1 ring-inset ring-primary/[0.10]">
        <PlusIcon className="h-7 w-7 text-primary/60" />
      </div>
    )

  return (
    <Link
      href={cta.href}
      className="group block rounded-2xl bg-card p-6 shadow-[var(--shadow-md)] transition-all duration-300 hover:shadow-[var(--shadow-lg)] lg:p-8"
    >
      <div className="flex items-center gap-5">
        {primaryVisual}

        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">
            {cta.eyebrow}
          </p>
          <h2 className="text-[1.4rem] font-bold tracking-[-0.03em] leading-tight text-foreground sm:text-[1.55rem]">
            {cta.title}
          </h2>
          {cta.sub && (
            <p className="mt-2 text-[14px] leading-relaxed text-foreground/55">
              {cta.sub}
            </p>
          )}
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_10px_rgba(190,28,28,0.32)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:shadow-[0_4px_18px_rgba(190,28,28,0.45)]">
          <ArrowRightIcon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </Link>
  )
}

// ── IntelligenceStrip ─────────────────────────────────────────────────────────
function IntelligenceStrip({
  totalDocs,
  totalConcepts,
  reviewsDue,
}: {
  totalDocs: number
  totalConcepts: number
  reviewsDue: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-y-1.5">
      <Link
        href="/dashboard/study"
        className={cn(
          'text-[13px] transition-colors',
          totalDocs > 0
            ? 'font-medium text-foreground/55 hover:text-foreground/75'
            : 'text-foreground/45 hover:text-foreground/65',
        )}
      >
        {totalDocs === 0
          ? 'No materials yet'
          : `${totalDocs} study source${totalDocs !== 1 ? 's' : ''}`}
      </Link>

      <span className="mx-3 select-none text-foreground/22">·</span>

      <span
        className={cn(
          'text-[13px]',
          totalConcepts > 0
            ? 'font-medium text-foreground/55'
            : 'text-foreground/45',
        )}
      >
        {totalConcepts === 0
          ? 'profile building'
          : `${totalConcepts} concept${totalConcepts !== 1 ? 's' : ''} tracked`}
      </span>

      <span className="mx-3 select-none text-foreground/22">·</span>

      <Link
        href="/dashboard/study"
        className={cn(
          'inline-flex items-center gap-1.5 text-[13px] transition-colors',
          reviewsDue > 0
            ? 'font-semibold text-amber-500 hover:text-amber-400'
            : 'text-foreground/45 hover:text-foreground/65',
        )}
      >
        {reviewsDue > 0 && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
        )}
        {reviewsDue === 0 ? 'nothing due' : `${reviewsDue} due for review`}
      </Link>
    </div>
  )
}

// ── MasteryIndicator ──────────────────────────────────────────────────────────
function MasteryIndicator({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  const fill =
    pct < 30 ? 'bg-red-400/55' :
    pct < 50 ? 'bg-orange-400/50' :
    'bg-yellow-400/45'
  return (
    <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-foreground/[0.06]">
      <div
        className={cn('absolute inset-y-0 left-0 rounded-full', fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── LearningFocusItem ─────────────────────────────────────────────────────────
function LearningFocusItem({ item }: { item: WeakConceptItem }) {
  const due = isConceptDue(item)
  const statusParts = [
    masteryLabel(item.mastery_score),
    due && 'review due',
    item.incorrect_count > 0 && `${item.incorrect_count} incorrect`,
  ].filter(Boolean).join(' · ')

  return (
    <Link
      href={item.href}
      className="group block rounded-2xl bg-card p-4 shadow-[var(--shadow-sm)] ring-1 ring-inset ring-foreground/[0.05] transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-md)]"
    >
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary/65">
        Weak area
      </p>
      <p className="mb-0.5 text-[1.1rem] font-bold tracking-[-0.025em] leading-tight text-foreground">
        {item.concept_title}
      </p>
      <p className="mb-3 text-[12px] text-foreground/50">{item.document_title}</p>
      <MasteryIndicator score={item.mastery_score} />
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[12px] text-foreground/55">{statusParts}</span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition-colors group-hover:text-primary/80">
          {due ? 'Review now' : 'Study now'}
          <ArrowRightIcon className="h-3 w-3" />
        </span>
      </div>
    </Link>
  )
}

// ── WeakConceptRow ────────────────────────────────────────────────────────────
function WeakConceptRow({ item }: { item: WeakConceptItem }) {
  const due = isConceptDue(item)
  const status = due ? 'Due for review' : masteryLabel(item.mastery_score)
  const statusColor = due
    ? 'text-amber-400/90'
    : item.mastery_score < 30
      ? 'text-red-400/70'
      : 'text-foreground/42'

  return (
    <Link
      href={item.href}
      className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 hover:bg-muted/55 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/30"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-foreground/72 transition-colors group-hover:text-foreground/90">
          {item.concept_title}
        </p>
        <p className="truncate text-[12px] text-foreground/45">{item.document_title}</p>
      </div>
      <span className={cn('shrink-0 text-[12px] font-medium', statusColor)}>
        {status}
      </span>
    </Link>
  )
}

// ── LearningSection ───────────────────────────────────────────────────────────
function LearningSection({
  topWeakConcepts,
  weakCount,
  reviewsDue,
  twin,
  performanceProfile,
  showRecentHint = false,
}: {
  topWeakConcepts: WeakConceptItem[]
  weakCount: number
  reviewsDue: number
  twin: StudentKnowledgeTwin
  performanceProfile: StudentPerformanceProfile | null
  showRecentHint?: boolean
}) {
  const hasData = topWeakConcepts.length > 0 || twin.has_enough_data

  const contextSentence = (() => {
    if (!hasData || topWeakConcepts.length === 0) return null
    if (reviewsDue > 0 && weakCount > reviewsDue)
      return `${reviewsDue} concept${reviewsDue !== 1 ? 's' : ''} due — ${weakCount} areas need attention overall.`
    if (reviewsDue > 1)
      return `${reviewsDue} concepts are due for review.`
    if (reviewsDue === 1)
      return 'One concept is due for review.'
    return `${weakCount} weak area${weakCount !== 1 ? 's' : ''} identified — keep reinforcing to build mastery.`
  })()

  const supportingConcepts = topWeakConcepts.slice(1, 4)
  const remainingCount = weakCount - topWeakConcepts.length

  return (
    <section aria-labelledby="learning-heading">
      <div className="mb-4 flex items-center justify-between">
        <p
          id="learning-heading"
          className="text-[16px] font-semibold tracking-tight text-foreground/75"
        >
          Your learning
        </p>
        {hasData && (
          <Link
            href="/dashboard/study"
            className="text-[13px] font-semibold text-foreground/58 transition-colors hover:text-foreground/85"
          >
            View library →
          </Link>
        )}
      </div>

      {!hasData ? (
        /* ── New-user state ── */
        <div className="rounded-2xl bg-muted/90 px-6 py-7">
          <p className="mb-2.5 text-[17px] font-semibold leading-snug text-foreground/82">
            MoLis is learning how you study.
          </p>
          <p className="mb-6 text-[14px] leading-relaxed text-foreground/55">
            Complete a quiz or flashcard session and I&apos;ll begin identifying your weak areas, study patterns, and the best way to revise.
            {showRecentHint && ' Your recent sessions will also appear here.'}
          </p>
          <Link
            href="/dashboard/study"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary transition-colors hover:text-primary/80"
          >
            Start studying
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        /* ── Active-user state ── */
        <div className="flex flex-col">

          {/* Intelligence sentence */}
          {contextSentence && (
            <p className="mb-5 text-[14px] text-foreground/58">{contextSentence}</p>
          )}

          {/* Primary focus item */}
          {topWeakConcepts.length > 0 && (
            <div className="mb-4">
              <LearningFocusItem item={topWeakConcepts[0]} />
            </div>
          )}

          {/* Supporting weak areas */}
          {supportingConcepts.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/42">
                Also needs work
              </p>
              <div className="overflow-hidden rounded-xl bg-card/60 shadow-[var(--shadow-xs)] ring-1 ring-inset ring-foreground/[0.04]">
                {supportingConcepts.map((wc) => (
                  <WeakConceptRow key={wc.concept_id} item={wc} />
                ))}
              </div>
            </div>
          )}

          {/* View all */}
          {remainingCount > 0 && (
            <Link
              href="/dashboard/study"
              className="self-start px-3 text-[13px] font-semibold text-foreground/55 transition-colors hover:text-foreground/78"
            >
              View all {weakCount} weak areas →
            </Link>
          )}

          {/* Knowledge twin — compact */}
          {twin.has_enough_data && (
            <div className={cn(
              'flex flex-col gap-0.5',
              topWeakConcepts.length > 0 && 'mt-5 border-t border-border/35 pt-4',
            )}>
              {twin.strongest_concepts.length > 0 && (
                <TwinRow
                  label="Strongest area"
                  value={twin.strongest_concepts[0].concept_title}
                  sub={twin.strongest_concepts[0].document_title}
                  accent="text-emerald-400/90"
                />
              )}
              {twin.concepts_due_for_review > 0 && (
                <TwinRow
                  label="Review pressure"
                  value={`${twin.concepts_due_for_review} concept${twin.concepts_due_for_review !== 1 ? 's' : ''} due`}
                  accent={twin.concepts_due_for_review > 5 ? 'text-amber-400' : 'text-foreground/55'}
                />
              )}
              {twin.learning_velocity_summary && (
                <TwinRow
                  label="Learning velocity"
                  value={twin.learning_velocity_summary}
                  accent="text-foreground/50"
                />
              )}
              {twin.recommended_focus_area && (
                <Link
                  href={twin.recommended_focus_area.href ?? '/dashboard/study'}
                  className="group mt-3 flex items-center justify-between rounded-xl border border-primary/14 bg-primary/[0.03] px-4 py-3 transition-colors hover:border-primary/25 hover:bg-primary/[0.06]"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/35">
                      Recommended focus
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-medium text-foreground/68">
                      {twin.recommended_focus_area.focus_area}
                    </p>
                  </div>
                  <ArrowRightIcon className="ml-3 h-3 w-3 shrink-0 text-foreground/20 transition-colors group-hover:text-primary/60" />
                </Link>
              )}
            </div>
          )}

          {/* Performance */}
          {performanceProfile && performanceProfile.has_enough_data && (
            <PerformanceStatus profile={performanceProfile} />
          )}
        </div>
      )}
    </section>
  )
}

// ── PerformanceStatus ─────────────────────────────────────────────────────────
function PerformanceStatus({ profile }: { profile: StudentPerformanceProfile }) {
  const st = PERF_STATUS[profile.on_track_status] ?? PERF_STATUS.not_enough_data
  return (
    <div className="flex items-center justify-between border-t border-border/35 pt-4 mt-4">
      <span className="text-[12px] text-foreground/42">Performance vs target</span>
      <div className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-0.5', st.ring)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} />
        <span className={cn('text-[11px] font-semibold', st.text)}>{st.label}</span>
      </div>
    </div>
  )
}

// ── DigestSection ─────────────────────────────────────────────────────────────
function DigestSection({
  digest,
}: {
  digest: { activities: DigestActivity[]; is_fallback?: boolean; concepts_reviewed_today?: number } | null | undefined
}) {
  if (!digest || digest.activities.length === 0) {
    return (
      <section aria-labelledby="recent-heading">
        <p
          id="recent-heading"
          className="mb-4 text-[16px] font-semibold tracking-tight text-foreground/72"
        >
          Recent activity
        </p>
        <p className="mb-1.5 text-[14px] font-medium leading-snug text-foreground/58">
          No study sessions yet.
        </p>
        <p className="mb-5 text-[13px] leading-relaxed text-foreground/42">
          Your latest activity will appear here as you work.
        </p>
        <Link
          href="/dashboard/study"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition-colors hover:text-primary/80"
        >
          Start studying <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </section>
    )
  }

  return (
    <section aria-labelledby="recent-heading">
      <div className="mb-4 flex items-center justify-between">
        <p
          id="recent-heading"
          className="text-[16px] font-semibold tracking-tight text-foreground/72"
        >
          Recent activity
        </p>
        <Link
          href="/dashboard/study"
          className="text-[13px] font-semibold text-foreground/48 transition-colors hover:text-foreground/78"
        >
          All →
        </Link>
      </div>
      <div className="flex flex-col">
        {digest.activities.slice(0, 7).map((activity, i) => (
          <DigestItem key={i} activity={activity} />
        ))}
      </div>
    </section>
  )
}

// ── TwinRow ───────────────────────────────────────────────────────────────────
function TwinRow({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-[12px] text-foreground/42">{label}</span>
      <div className="min-w-0 text-right">
        <p className={cn('truncate text-[13px] font-medium', accent)}>{value}</p>
        {sub && <p className="truncate text-[11px] text-foreground/35">{sub}</p>}
      </div>
    </div>
  )
}

// ── DigestItem ────────────────────────────────────────────────────────────────
const DIGEST_META: Record<DigestActivityType, { label: string; dot: string }> = {
  quiz_completed:         { label: 'Quiz',       dot: 'bg-primary/65' },
  quiz_in_progress:       { label: 'Quiz',       dot: 'bg-primary/35' },
  flashcards_completed:   { label: 'Flashcards', dot: 'bg-foreground/38' },
  flashcards_in_progress: { label: 'Flashcards', dot: 'bg-foreground/22' },
  tutor_session:          { label: 'Tutor',      dot: 'bg-primary/75' },
  notes_generated:        { label: 'Notes',      dot: 'bg-foreground/28' },
}

function DigestItem({ activity }: { activity: DigestActivity }) {
  const meta = DIGEST_META[activity.type]
  return (
    <Link
      href={activity.href}
      className="group flex items-start gap-2.5 border-b border-border/30 py-2.5 last:border-0 transition-colors duration-150"
    >
      <span className={cn('mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
            {meta.label}
          </span>
          <span className="truncate text-[13px] font-medium text-foreground/74 transition-colors group-hover:text-foreground/92">
            {activity.document_title}
          </span>
        </div>
        <p className="text-[12px] text-foreground/46">{activity.detail}</p>
      </div>
    </Link>
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

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}
