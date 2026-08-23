'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useReducedMotion } from 'motion/react'
import { DURATION, EASING } from '@/lib/motion'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  children?: React.ReactNode
}

export function MobileSheet({ open, onClose, children }: MobileSheetProps) {
  const reduced = useReducedMotion()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const firstFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      firstFocusRef.current = document.activeElement as HTMLElement
      closeButtonRef.current?.focus()
    } else {
      firstFocusRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Slide-over */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Account"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col lg:hidden"
            initial={{ x: reduced ? 0 : -300, opacity: reduced ? 0 : 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduced ? 0 : -300, opacity: reduced ? 0 : 1 }}
            transition={{ duration: DURATION.normal, ease: EASING.smooth }}
          >
            {/* Close button header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-xl">
              <span className="text-[13px] font-semibold text-foreground/70">Account</span>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-foreground/50 transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col overflow-y-auto bg-card/95 backdrop-blur-xl">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
