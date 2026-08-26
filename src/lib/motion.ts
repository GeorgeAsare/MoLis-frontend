import { useReducedMotion } from 'motion/react'

export const DURATION = {
  instant: 0.08,
  fast:    0.15,
  normal:  0.25,
  slow:    0.38,
  slower:  0.55,
} as const

export const EASING = {
  smooth: [0.22, 1, 0.36, 1] as const,
  snap:   [0.19, 1, 0.22, 1] as const,
  out:    [0.0,  0.0, 0.2, 1] as const,
  in:     [0.4,  0.0, 1,   1] as const,
}

export const SPRING = {
  layout: { type: 'spring' as const, stiffness: 380, damping: 32 },
  bouncy: { type: 'spring' as const, stiffness: 300, damping: 20 },
  nav:    { type: 'spring' as const, stiffness: 400, damping: 38 },
}

export const STAGGER = {
  children:      0.06,
  delayChildren: 0,
  fastChildren:  0.04,
}

export const VARIANTS = {
  fadeIn: {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { duration: DURATION.normal, ease: EASING.smooth } },
    exit:    { opacity: 0, transition: { duration: DURATION.fast,   ease: EASING.in    } },
  },
  fadeUp: {
    hidden:  { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0,  transition: { duration: DURATION.slow,   ease: EASING.smooth } },
    exit:    { opacity: 0, y: -6, transition: { duration: DURATION.fast,   ease: EASING.in    } },
  },
  slideLeft: {
    hidden:  { opacity: 0, x: -300 },
    visible: { opacity: 1, x: 0,    transition: { duration: DURATION.normal, ease: EASING.smooth } },
    exit:    { opacity: 0, x: -300, transition: { duration: DURATION.fast,   ease: EASING.in    } },
  },
  scale: {
    hidden:  { opacity: 0, scale: 0.94 },
    visible: { opacity: 1, scale: 1,    transition: { duration: DURATION.normal, ease: EASING.smooth } },
    exit:    { opacity: 0, scale: 0.97, transition: { duration: DURATION.fast,   ease: EASING.in    } },
  },
  stagger: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.children, delayChildren: STAGGER.delayChildren } },
  },
  staggerFast: {
    hidden:  {},
    visible: { transition: { staggerChildren: STAGGER.fastChildren } },
  },
  scrim: {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
    exit:    { opacity: 0, transition: { duration: 0.15 } },
  },
}

export function getTransition(reduced: boolean) {
  if (reduced) return { duration: 0.01 }
  return { duration: DURATION.normal, ease: EASING.smooth }
}

export function getFadeUpVariants(reduced: boolean) {
  if (reduced) {
    return {
      hidden:  { opacity: 0 },
      visible: { opacity: 1, transition: { duration: DURATION.fast } },
      exit:    { opacity: 0, transition: { duration: DURATION.fast } },
    }
  }
  return VARIANTS.fadeUp
}

export { useReducedMotion }
