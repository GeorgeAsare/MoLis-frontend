import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Dashboard — MoLis',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatCard {
  href: string
  label: string
  description: string
  stat: string
  statLabel: string
  accent: string
  ring: string
  icon: React.ComponentType<{ className?: string }>
}

// ---------------------------------------------------------------------------
// Card definitions — stat/statLabel are live-data-ready zero states
// ---------------------------------------------------------------------------

const statCards: StatCard[] = [
  {
    href: '/dashboard/study',
    label: 'Study',
    description: 'Documents, notes, and exam prep',
    stat: '0',
    statLabel: 'documents',
    accent: 'text-violet-400',
    ring: 'border-violet-500/20 bg-violet-500/10',
    icon: StudyIcon,
  },
  {
    href: '/dashboard/agents',
    label: 'Agents',
    description: 'Tasks, research, automation',
    stat: '0',
    statLabel: 'active tasks',
    accent: 'text-purple-400',
    ring: 'border-purple-500/20 bg-purple-500/10',
    icon: AgentsIcon,
  },
  {
    href: '/dashboard/memory',
    label: 'Memory',
    description: 'What MoLis knows about you',
    stat: '0',
    statLabel: 'learned facts',
    accent: 'text-sky-400',
    ring: 'border-sky-500/20 bg-sky-500/10',
    icon: MemoryIcon,
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex flex-1 flex-col px-8 py-8 max-w-5xl w-full">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/20 mb-2">
          Dashboard
        </p>
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-white leading-tight">
          {greeting}, {name}
        </h1>
        <p className="mt-1.5 text-sm text-white/35">
          Your AI operating system is active and ready.
        </p>

        {/* Status ticker */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
            <span className="text-xs text-white/30">System active</span>
          </div>
          <span className="h-3 w-px bg-white/10" />
          <span className="text-xs text-white/20">MoLis Intelligence</span>
          <span className="h-3 w-px bg-white/10" />
          <span className="text-xs text-white/15">v1.0</span>
        </div>
      </header>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-3">
        {statCards.map(({ href, label, description, stat, statLabel, accent, ring, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col justify-between gap-5 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-5 transition-all duration-200 hover:border-violet-500/20 hover:bg-white/[0.05] hover:ring-1 hover:ring-violet-500/10"
          >
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${ring}`}>
                <Icon className={`h-[18px] w-[18px] ${accent}`} />
              </div>
              <ArrowIcon className="h-3.5 w-3.5 text-white/15 transition-all duration-200 group-hover:text-white/40 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>

            {/* Stat */}
            <div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {stat}
                </span>
                <span className="text-xs text-white/30">{statLabel}</span>
              </div>
              <p className="text-[13px] font-medium text-white/60">{label}</p>
              <p className="mt-0.5 text-xs text-white/25">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Daily Digest ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5 transition-all duration-200 hover:border-white/[0.1] hover:bg-white/[0.04]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[13px] font-medium text-white/70">Daily Digest</p>
            <p className="mt-0.5 text-xs text-white/25">
              Study sessions, agent activity, and memory updates
            </p>
          </div>
          <DigestIcon className="h-4 w-4 text-white/15" />
        </div>

        {/* Empty state — ready for real activity feed */}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
            <ClockIcon className="h-5 w-5 text-white/15" />
          </div>
          <p className="text-sm text-white/30">No activity yet</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-white/18">
            Your study sessions, agent tasks, and memory additions will appear here.
          </p>
        </div>
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

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

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
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
