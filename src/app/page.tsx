'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { NeuralCore } from '@/components/ui/NeuralCore'

const ease = [0.21, 0.47, 0.32, 0.98] as [number, number, number, number]

// Handcrafted star field — positions are stable (no JS random)
const STARS = [
  { x: '11%', y: '9%',  s: 1.5, o: 0.45, d: 0,   dur: 4.2 },
  { x: '23%', y: '16%', s: 1,   o: 0.25, d: 1.3,  dur: 5.1 },
  { x: '67%', y: '7%',  s: 1,   o: 0.38, d: 0.6,  dur: 3.8 },
  { x: '81%', y: '19%', s: 2,   o: 0.2,  d: 1.9,  dur: 4.7 },
  { x: '4%',  y: '34%', s: 1,   o: 0.32, d: 0.4,  dur: 4.0 },
  { x: '91%', y: '41%', s: 1.5, o: 0.22, d: 2.1,  dur: 5.3 },
  { x: '44%', y: '4%',  s: 1,   o: 0.42, d: 0.9,  dur: 3.2 },
  { x: '58%', y: '11%', s: 1,   o: 0.18, d: 1.6,  dur: 4.8 },
  { x: '75%', y: '30%', s: 2,   o: 0.14, d: 0.7,  dur: 5.6 },
  { x: '17%', y: '58%', s: 1,   o: 0.28, d: 2.6,  dur: 4.1 },
  { x: '87%', y: '68%', s: 1.5, o: 0.18, d: 1.0,  dur: 5.0 },
  { x: '54%', y: '83%', s: 1,   o: 0.22, d: 0.3,  dur: 3.6 },
  { x: '6%',  y: '76%', s: 1,   o: 0.33, d: 1.8,  dur: 4.3 },
  { x: '94%', y: '14%', s: 1,   o: 0.18, d: 0.9,  dur: 4.6 },
  { x: '40%', y: '73%', s: 1.5, o: 0.14, d: 2.3,  dur: 5.2 },
  { x: '32%', y: '88%', s: 1,   o: 0.26, d: 0.5,  dur: 3.9 },
  { x: '78%', y: '88%', s: 1,   o: 0.2,  d: 1.4,  dur: 4.4 },
  { x: '14%', y: '45%', s: 1,   o: 0.16, d: 2.8,  dur: 5.5 },
  { x: '63%', y: '55%', s: 1.5, o: 0.12, d: 0.2,  dur: 6.0 },
  { x: '49%', y: '96%', s: 1,   o: 0.15, d: 1.1,  dur: 4.9 },
]

export default function HomePage() {
  return (
    <div className="dark">
    <main className="relative min-h-screen overflow-hidden bg-background">

      {/* ── Cosmic background ─────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0">
        {/* Nebula layers — Target Red, perceptibly warm */}
        <div
          className="absolute left-1/2 top-0 h-[700px] w-[900px] -translate-x-1/2 rounded-full blur-[140px]"
          style={{ background: 'rgba(190,28,28,0.12)' }}
        />
        <div
          className="absolute -bottom-48 left-0 h-[550px] w-[550px] rounded-full blur-[110px]"
          style={{ background: 'rgba(190,28,28,0.08)' }}
        />
        <div
          className="absolute -bottom-32 right-[-5%] h-[450px] w-[450px] rounded-full blur-[90px]"
          style={{ background: 'rgba(160,20,20,0.06)' }}
        />

        {/* Star field */}
        {STARS.map((star, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-glow-pulse"
            style={{
              left: star.x,
              top: star.y,
              width: star.s,
              height: star.s,
              opacity: star.o,
              animationDelay: `${star.d}s`,
              animationDuration: `${star.dur}s`,
            }}
          />
        ))}

        {/* Subtle dot texture */}
        <div className="absolute inset-0 bg-grid-dots opacity-[0.28]" />

        {/* Radial vignette — draws eye to center */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_50%_0%,transparent_40%,hsl(var(--background))_100%)]" />
        <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-12 pt-12 text-center">

        {/* Neural core — the emotional focal point */}
        <motion.div
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10"
        >
          <NeuralCore size={280} />
        </motion.div>

        {/* System label */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8, ease }}
          className="mb-9 flex items-center gap-3"
        >
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-primary/45" />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-primary/55">
            Intelligence Awakened
          </span>
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-primary/45" />
        </motion.div>

        {/* Headline — the emotional statement */}
        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 1.0, ease }}
          className="mb-7 max-w-[700px] font-semibold leading-[1.07] tracking-[-0.035em]"
          style={{ fontSize: 'clamp(2.6rem, 6vw, 4.75rem)' }}
        >
          <span className="text-foreground">Built for students</span>
          <br />
          <span className="text-gradient-red">who refuse to stop</span>
          <br />
          <span className="text-foreground">at good enough.</span>
        </motion.h1>

        {/* Supporting copy */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.2, ease }}
          className="mb-10 max-w-[420px] text-[15px] leading-[1.75] text-foreground/35"
        >
          Upload a document. MoLis reads it, builds personalised revision
          notes and quizzes, then tracks what you struggle with — adapting
          every session to how you actually think.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.35, ease }}
          className="flex items-center gap-3"
        >
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_32px_-6px_rgba(190,28,28,0.65)] transition-all duration-200 hover:bg-primary hover:shadow-[0_0_48px_-4px_rgba(190,28,28,0.8)]"
          >
            Enter MoLis
            <ArrowIcon className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-xl border border-foreground/[0.07] px-6 py-3.5 text-sm font-medium text-foreground/45 transition-all duration-200 hover:border-foreground/[0.13] hover:text-foreground/75"
          >
            Sign in
          </Link>
        </motion.div>

        {/* Capability row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.7 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
        >
          {[
            'AI Revision Notes',
            'Adaptive Quizzes',
            'Weak Topic Tracking',
            'Document Intelligence',
          ].map((feat) => (
            <div key={feat} className="flex items-center gap-2">
              <div className="h-[3px] w-[3px] rounded-full bg-primary/55" />
              <span className="text-[11.5px] font-medium text-foreground/22">{feat}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </main>
    </div>
  )
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  )
}
