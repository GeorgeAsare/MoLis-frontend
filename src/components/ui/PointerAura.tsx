'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

export function PointerAura() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el) return

    function onMove(e: MouseEvent) {
      const x = (e.clientX / window.innerWidth) * 100
      const y = (e.clientY / window.innerHeight) * 100
      el!.style.background = `radial-gradient(600px circle at ${x}% ${y}%, rgba(190,28,28,0.055), transparent 70%)`
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [reduced])

  if (reduced) return null

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[1] hidden lg:block"
      aria-hidden="true"
    />
  )
}
