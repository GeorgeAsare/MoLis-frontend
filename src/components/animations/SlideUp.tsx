'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { DURATION, EASING } from '@/lib/motion'

interface Props {
  children: ReactNode
  className?: string
  delay?: number
  duration?: number
  distance?: number
}

export function SlideUp({
  children,
  className,
  delay = 0,
  duration = DURATION.slow,
  distance = 12,
}: Props) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : distance }}
      animate={{ opacity: 1, y: 0 }}
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
