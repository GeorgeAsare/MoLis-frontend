'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { DURATION, EASING } from '@/lib/motion'

interface Props {
  children: ReactNode
  className?: string
  delay?: number
  duration?: number
}

export function ScaleIn({ children, className, delay = 0, duration = DURATION.normal }: Props) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: reduced ? DURATION.instant : duration,
        delay: reduced ? 0 : delay,
        ease: EASING.smooth,
      }}
    >
      {children}
    </motion.div>
  )
}
