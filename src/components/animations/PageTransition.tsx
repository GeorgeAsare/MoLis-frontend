'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

// Lightweight enter animation for App Router pages.
// Place this as the outermost wrapper inside a page component.
// Exit animations are omitted intentionally — App Router unmounts the
// previous page before the next one mounts, so AnimatePresence exits
// never fire. This keeps the pattern simple and reliable.

export function PageTransition({ children, className }: Props) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: [0.21, 0.47, 0.32, 0.98],
      }}
    >
      {children}
    </motion.div>
  )
}
