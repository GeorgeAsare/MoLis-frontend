'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { Sidebar } from './Sidebar'
import { MobileTopBar } from './MobileTopBar'
import { MobileNav } from './MobileNav'
import { MobileSheet } from './MobileSheet'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { NeuralOrb } from '@/components/ui/NeuralOrb'
import { PointerAura } from '@/components/ui/PointerAura'
import { createClient } from '@/lib/supabase/client'
import { DURATION, EASING } from '@/lib/motion'

interface DashboardShellProps {
  children: React.ReactNode
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

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = user?.name ? getInitials(user.name) : '?'
  const displayName = user?.name || 'Account'
  const displayEmail = user?.email || ''

  return (
    <>
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[1000] focus:m-3 focus:rounded-xl focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Pointer aura — desktop cursor reactive layer */}
      <PointerAura />

      <div className="flex min-h-dvh bg-background text-foreground">

        {/* ── Mobile layout (< lg) ───────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col lg:hidden">
          <MobileTopBar
            user={user}
            onAccountClick={() => setAccountOpen(true)}
          />
          <main
            id="main-content"
            className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0"
          >
            {children}
          </main>
          <MobileNav />
        </div>

        {/* ── Desktop layout (lg+) ───────────────────────────────────────────── */}
        <div className="hidden h-dvh flex-1 flex-col overflow-y-auto lg:flex">

          {/* Sticky nav trigger bar */}
          <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center bg-background/92 px-8 backdrop-blur-[8px]">
            <NavTrigger onOpen={() => setNavOpen(true)} />
          </div>

          {/* Page content with route-transition fade */}
          <motion.main
            key={pathname}
            id="main-content"
            className="flex flex-1 flex-col"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.normal, ease: EASING.smooth }}
          >
            {children}
          </motion.main>
        </div>
      </div>

      {/* ── Desktop off-canvas nav panel ─────────────────────────────────────── */}
      <NavPanel
        open={navOpen}
        onClose={() => setNavOpen(false)}
        user={user}
      />

      {/* ── Mobile account sheet ──────────────────────────────────────────────── */}
      <MobileSheet open={accountOpen} onClose={() => setAccountOpen(false)}>
        <div className="flex flex-col gap-0 p-4">

          {/* User identity */}
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 px-3.5 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.10] text-[13px] font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-foreground/80">{displayName}</p>
              {displayEmail && (
                <p className="truncate text-[11px] text-foreground/35">{displayEmail}</p>
              )}
            </div>
          </div>

          {/* Theme */}
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-[12px] font-medium text-foreground/45">Appearance</span>
            <ThemeToggle />
          </div>

          <div className="my-1 h-px bg-border/60" />

          {/* Settings link */}
          <Link
            href="/dashboard/onboarding"
            onClick={() => setAccountOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-foreground/55 transition-colors hover:bg-muted/50 hover:text-foreground/85"
          >
            <SettingsIcon className="h-4 w-4 shrink-0 text-foreground/30" />
            Settings
          </Link>

          <div className="my-1 h-px bg-border/60" />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-foreground/40 transition-colors hover:bg-muted/40 hover:text-foreground/65"
          >
            <SignOutIcon className="h-4 w-4 shrink-0 text-foreground/25" />
            Sign out
          </button>
        </div>
      </MobileSheet>
    </>
  )
}

// ── NavTrigger ─────────────────────────────────────────────────────────────────
function NavTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Open navigation"
      className="group flex h-9 items-center gap-2.5 rounded-xl bg-foreground/[0.05] px-3.5 transition-all duration-150 hover:bg-foreground/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <NeuralOrb size="xs" pulse={false} />
      <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/60 transition-colors duration-150 group-hover:text-foreground/85">
        MoLis
      </span>
      <MenuIcon className="h-[14px] w-[14px] text-foreground/30 transition-colors duration-150 group-hover:text-foreground/58" />
    </button>
  )
}

// ── NavPanel ───────────────────────────────────────────────────────────────────
function NavPanel({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user?: { name: string; email: string }
}) {
  const reduced = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Focus management
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement
      panelRef.current?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — desktop only */}
          <motion.div
            className="fixed inset-0 z-[60] hidden bg-black/22 backdrop-blur-[1px] lg:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Slide-over panel */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-[61] hidden w-[220px] shadow-2xl focus-visible:outline-none lg:block"
            initial={{ x: reduced ? 0 : -240 }}
            animate={{ x: 0 }}
            exit={{ x: reduced ? 0 : -240 }}
            transition={{
              duration: reduced ? 0.01 : 0.22,
              ease: [0.32, 0, 0.15, 1],
            }}
          >
            <Sidebar user={user} onNavClick={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
    </svg>
  )
}
