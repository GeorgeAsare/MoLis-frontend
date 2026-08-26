'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { DURATION, EASING } from '@/lib/motion'

interface Props {
  children: ReactNode
  className?: string
}

export function PageTransition({ children, className }: Props) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? DURATION.instant : DURATION.normal,
        ease: EASING.smooth,
      }}
    >
      {children}
    </motion.div>
  )
}
