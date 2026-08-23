'use client'

import { NeuralOrb } from '@/components/ui/NeuralOrb'

interface MobileTopBarProps {
  onAccountClick: () => void
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

export function MobileTopBar({ onAccountClick, user }: MobileTopBarProps) {
  const initials = user?.name ? getInitials(user.name) : null

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <NeuralOrb size="xs" pulse={false} />
        <span className="text-[13px] font-semibold tracking-[-0.015em] text-foreground">
          MoLis
        </span>
      </div>

      {/* Account avatar button */}
      <button
        onClick={onAccountClick}
        aria-label="Open account menu"
        className="flex h-9 w-9 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {initials ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.10] text-[10px] font-bold text-primary">
            {initials}
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground/40">
            <PersonIcon className="h-4 w-4" />
          </div>
        )}
      </button>
    </header>
  )
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )
}
