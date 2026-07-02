'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

// ── Shared item variants — import and apply to direct children ────────────

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.21, 0.47, 0.32, 0.98] as [number, number, number, number],
    },
  },
}

// ── Container ─────────────────────────────────────────────────────────────

interface ContainerProps {
  children: ReactNode
  className?: string
  stagger?: number
  delayChildren?: number
}

export function StaggerContainer({
  children,
  className,
  stagger = 0.07,
  delayChildren = 0,
}: ContainerProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
            delayChildren,
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

// ── Item — wrap each child that should animate in ─────────────────────────

interface ItemProps {
  children: ReactNode
  className?: string
}

export function StaggerItem({ children, className }: ItemProps) {
  return (
    <motion.div className={className} variants={staggerItemVariants}>
      {children}
    </motion.div>
  )
}
