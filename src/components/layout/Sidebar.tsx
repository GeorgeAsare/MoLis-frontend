'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { NeuralOrb } from '@/components/ui/NeuralOrb'
import { SPRING } from '@/lib/motion'

const navItems = [
  { href: '/dashboard',          label: 'Home',     icon: HomeIcon },
  { href: '/dashboard/subjects', label: 'Subjects', icon: SubjectsIcon },
  { href: '/dashboard/study',    label: 'Study',    icon: StudyIcon },
  { href: '/dashboard/agents',   label: 'Agents',   icon: AgentsIcon },
  { href: '/dashboard/memory',   label: 'Memory',   icon: MemoryIcon },
]

interface SidebarProps {
  className?: string
  onNavClick?: () => void
  user?: { name: string; email: string }
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || '?'
}

export function Sidebar({ className, onNavClick, user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isSettings = pathname === '/dashboard/onboarding'
  const initials = user?.name ? getInitials(user.name) : '?'
  const displayName = user?.name || 'Account'

  return (
    <aside
      className={cn(
        'flex h-full w-full flex-col border-r border-border/50 bg-sidebar-background px-3 py-5',
        className,
      )}
    >
      {/* ── Brand ──────────────────────────────────────────────── */}
      <Link
        href="/dashboard"
        onClick={onNavClick}
        className="mb-7 flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <NeuralOrb size="sm" pulse={false} />
        <div className="flex flex-col leading-none">
          <span className="text-[16px] font-bold tracking-[-0.025em] text-foreground">
            MoLis
          </span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/35">
            Intelligence
          </span>
        </div>
      </Link>

      {/* ── Primary navigation ─────────────────────────────────── */}
      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                active ? 'font-semibold text-foreground' : 'font-medium text-foreground/52 hover:text-foreground/82',
              )}
            >
              <AnimatePresence>
                {active && (
                  <motion.div
                    layoutId="nav-active-bg-main"
                    className="absolute inset-0 rounded-xl bg-foreground/[0.055]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={SPRING.layout}
                  >
                    <span className="absolute inset-y-[5px] left-0 w-[3px] rounded-r-full bg-primary/70" />
                  </motion.div>
                )}
              </AnimatePresence>

              <Icon
                className={cn(
                  'relative z-10 h-[18px] w-[18px] shrink-0 transition-colors duration-150',
                  active ? 'text-primary' : 'text-foreground/38 group-hover:text-foreground/65',
                )}
              />
              <span className="relative z-10">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── Account section ────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5 border-t border-border/50 pt-3">

        {/* Theme control */}
        <div className="px-2 pb-1">
          <ThemeToggle />
        </div>

        {/* Settings */}
        <Link
          href="/dashboard/onboarding"
          onClick={onNavClick}
          aria-current={isSettings ? 'page' : undefined}
          className={cn(
            'group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px]',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            isSettings ? 'font-semibold text-foreground' : 'font-medium text-foreground/48 hover:text-foreground/78',
          )}
        >
          <AnimatePresence>
            {isSettings && (
              <motion.div
                layoutId="nav-active-bg-util"
                className="absolute inset-0 rounded-xl bg-foreground/[0.055]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING.layout}
              >
                <span className="absolute inset-y-[5px] left-0 w-[3px] rounded-r-full bg-primary/70" />
              </motion.div>
            )}
          </AnimatePresence>
          <SettingsIcon
            className={cn(
              'relative z-10 h-[18px] w-[18px] shrink-0 transition-colors duration-150',
              isSettings ? 'text-primary' : 'text-foreground/38 group-hover:text-foreground/65',
            )}
          />
          <span className="relative z-10">Settings</span>
        </Link>

        {/* User identity row */}
        <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-foreground/[0.04] px-2.5 py-2">
          {/* Avatar */}
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/[0.10] text-[10px] font-bold text-primary"
            aria-hidden="true"
          >
            {initials}
          </div>

          {/* Name */}
          <span className="flex-1 truncate text-[12px] font-medium text-foreground/65">
            {displayName}
          </span>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/30 transition-colors duration-150 hover:bg-foreground/[0.07] hover:text-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SignOutIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function SubjectsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
    </svg>
  )
}

function StudyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}

function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
    </svg>
  )
}
