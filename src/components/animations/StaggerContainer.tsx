'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { DURATION, EASING, STAGGER } from '@/lib/motion'

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.slow,
      ease: EASING.smooth as [number, number, number, number],
    },
  },
}

export const staggerItemVariantsReduced = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION.fast },
  },
}

interface ContainerProps {
  children: ReactNode
  className?: string
  stagger?: number
  delayChildren?: number
}

export function StaggerContainer({
  children,
  className,
  stagger = STAGGER.children,
  delayChildren = STAGGER.delayChildren,
}: ContainerProps) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduced ? 0 : stagger,
            delayChildren: reduced ? 0 : delayChildren,
          },
        },
      }}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  )
}

interface ItemProps {
  children: ReactNode
  className?: string
}

export function StaggerItem({ children, className }: ItemProps) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      variants={reduced ? staggerItemVariantsReduced : staggerItemVariants}
    >
      {children}
    </motion.div>
  )
}
