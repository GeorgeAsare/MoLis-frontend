'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { DURATION, EASING } from '@/lib/motion'

interface Props {
  children: ReactNode
  className?: string
  lift?: number
  scale?: number
}

export function HoverLift({ children, className, lift = -3, scale = 1.01 }: Props) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      whileHover={
        reduced
          ? undefined
          : { y: lift, scale, transition: { duration: DURATION.fast, ease: EASING.smooth } }
      }
      whileTap={
        reduced
          ? undefined
          : { scale: 0.98, transition: { duration: DURATION.instant } }
      }
    >
      {children}
    </motion.div>
  )
}
