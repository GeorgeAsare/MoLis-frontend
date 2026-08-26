'use client'

import { useTheme } from './ThemeProvider'
import { cn } from '@/lib/utils'

const options = [
  {
    value: 'light' as const,
    label: 'Light',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    ),
  },
  {
    value: 'auto' as const,
    label: 'Auto',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none" opacity="0.4"/>
      </svg>
    ),
  },
  {
    value: 'dark' as const,
    label: 'Dark',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    ),
  },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className={cn(
        'flex items-center rounded-xl bg-foreground/[0.045] p-[3px] gap-0.5',
        className,
      )}
      role="group"
      aria-label="Appearance"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          aria-label={opt.label}
          aria-pressed={theme === opt.value}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150',
            theme === opt.value
              ? 'bg-card text-foreground shadow-[var(--shadow-xs)]'
              : 'text-foreground/32 hover:text-foreground/65',
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}
