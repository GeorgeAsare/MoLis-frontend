'use client'

import { ButtonHTMLAttributes } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { DURATION, EASING } from '@/lib/motion'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  'data-testid'?: string
}

const sizes = {
  sm: 'px-3.5 py-2 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-sm gap-2',
}

const variants = {
  primary:
    'bg-primary text-primary-foreground shadow-[0_0_20px_-6px_rgba(190,28,28,0.50)] hover:brightness-[1.08] hover:shadow-[0_0_32px_-4px_rgba(190,28,28,0.65)] active:brightness-[0.96]',
  secondary:
    'border border-foreground/[0.12] bg-foreground/[0.04] text-foreground/70 hover:bg-foreground/[0.07] hover:text-foreground hover:border-foreground/[0.18] active:bg-foreground/[0.05]',
  ghost:
    'text-foreground/45 hover:text-foreground/80 hover:bg-foreground/[0.06] active:bg-foreground/[0.04]',
  danger:
    'border border-red-500/20 bg-red-500/[0.07] text-red-400 hover:bg-red-500/[0.12] hover:border-red-500/30 active:bg-red-500/[0.08]',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  onClick,
  type,
  'data-testid': dataTestId,
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <motion.button
      type={type as 'button' | 'submit' | 'reset' | undefined}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
      className={cn(
        'relative inline-flex items-center justify-center font-medium select-none',
        'rounded-xl transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-40',
        sizes[size],
        variants[variant],
        className,
      )}
      disabled={isDisabled}
      data-testid={dataTestId}
      whileHover={isDisabled ? undefined : { scale: 1.015 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: DURATION.instant, ease: EASING.smooth }}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </motion.button>
  )
}
