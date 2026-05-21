import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Dashboard — MoLis',
}

const sections = [
  {
    href: '/dashboard/study',
    label: 'Study',
    description: 'Upload documents, generate notes, and prepare for exams.',
    accent: 'text-violet-400',
    ring: 'border-violet-500/20 bg-violet-500/10',
    icon: StudyIcon,
  },
  {
    href: '/dashboard/agents',
    label: 'Agents',
    description: 'AI agents running tasks, research, and automation for you.',
    accent: 'text-purple-400',
    ring: 'border-purple-500/20 bg-purple-500/10',
    icon: AgentsIcon,
  },
  {
    href: '/dashboard/memory',
    label: 'Memory',
    description: 'Everything MoLis has learned and remembered about you.',
    accent: 'text-sky-400',
    ring: 'border-sky-500/20 bg-sky-500/10',
    icon: MemoryIcon,
  },
  {
    href: '/dashboard/onboarding',
    label: 'Setup',
    description: 'Personalise MoLis to your goals, subjects, and learning style.',
    accent: 'text-emerald-400',
    ring: 'border-emerald-500/20 bg-emerald-500/10',
    icon: SetupIcon,
  },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex flex-1 flex-col p-8 max-w-4xl">
      {/* Greeting */}
      <div className="mb-10">
        <p className="text-xs font-medium uppercase tracking-widest text-white/20 mb-2">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {greeting}, {name}
        </h1>
        <p className="mt-1.5 text-sm text-white/35">
          Your AI operating system is active and ready.
        </p>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map(({ href, label, description, accent, ring, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 transition-all duration-150 hover:border-white/[0.12] hover:bg-white/[0.06]"
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${ring}`}>
                <Icon className={`h-4.5 w-4.5 ${accent}`} />
              </div>
              <ArrowIcon className="h-4 w-4 text-white/10 transition-colors group-hover:text-white/30" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/35">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

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

function SetupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
    </svg>
  )
}
