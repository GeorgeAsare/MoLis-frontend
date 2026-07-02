'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  lift?: number
  scale?: number
}

export function HoverLift({
  children,
  className,
  lift = -3,
  scale = 1.01,
}: Props) {
  return (
    <motion.div
      className={className}
      whileHover={{
        y: lift,
        scale,
        transition: { duration: 0.18, ease: [0.21, 0.47, 0.32, 0.98] },
      }}
      whileTap={{
        scale: 0.98,
        transition: { duration: 0.1 },
      }}
    >
      {children}
    </motion.div>
  )
}
