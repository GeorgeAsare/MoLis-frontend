'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { NeuralOrb } from '@/components/ui/NeuralOrb'

const ease = [0.21, 0.47, 0.32, 0.98] as [number, number, number, number]

// Reduced, subtler star field — fewer points, lower opacity
const STARS = [
  { x: '11%', y: '9%',  s: 1.5, o: 0.22, d: 0,   dur: 4.2 },
  { x: '67%', y: '7%',  s: 1,   o: 0.18, d: 0.6,  dur: 3.8 },
  { x: '81%', y: '19%', s: 1.5, o: 0.12, d: 1.9,  dur: 4.7 },
  { x: '4%',  y: '34%', s: 1,   o: 0.14, d: 0.4,  dur: 4.0 },
  { x: '91%', y: '41%', s: 1,   o: 0.10, d: 2.1,  dur: 5.3 },
  { x: '44%', y: '4%',  s: 1,   o: 0.20, d: 0.9,  dur: 3.2 },
  { x: '75%', y: '30%', s: 1.5, o: 0.09, d: 0.7,  dur: 5.6 },
  { x: '6%',  y: '76%', s: 1,   o: 0.16, d: 1.8,  dur: 4.3 },
  { x: '54%', y: '83%', s: 1,   o: 0.11, d: 0.3,  dur: 3.6 },
  { x: '40%', y: '73%', s: 1.5, o: 0.08, d: 2.3,  dur: 5.2 },
]

const STORY_STEPS = [
  {
    number: '01',
    label: 'Capture',
    desc: 'Record a lecture or upload any material. MoLis processes it automatically — no manual effort.',
  },
  {
    number: '02',
    label: 'Understand',
    desc: 'Intelligent notes, key concepts, and visual explanations generated specifically for how you learn.',
  },
  {
    number: '03',
    label: 'Study',
    desc: 'Adaptive quizzes, spaced flashcards, and targeted practice. Your weakest areas always come first.',
  },
  {
    number: '04',
    label: 'Adapt',
    desc: 'MoLis tracks what you know and what you struggle with. Every session, your profile gets smarter.',
  },
]

export default function HomePage() {
  return (
    <div className="dark">
      <main className="relative overflow-hidden bg-background">

        {/* ── Background ──────────────────────────────────────────────── */}
        <div className="pointer-events-none absolute inset-0">
          {/* Nebula — restrained warm red */}
          <div
            className="absolute left-1/2 top-0 h-[580px] w-[760px] -translate-x-1/2 rounded-full blur-[130px]"
            style={{ background: 'rgba(190,28,28,0.09)' }}
          />
          <div
            className="absolute -bottom-40 left-[-5%] h-[420px] w-[420px] rounded-full blur-[100px]"
            style={{ background: 'rgba(190,28,28,0.055)' }}
          />
          {/* Reduced star field */}
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
          <div className="absolute inset-0 bg-grid-dots opacity-[0.20]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_58%_at_50%_0%,transparent_38%,hsl(var(--background))_100%)]" />
          <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 pb-24 pt-16 text-center">

          {/* Intelligence mark — restrained, not spectacle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="mb-9"
          >
            <NeuralOrb size="lg" pulse />
          </motion.div>

          {/* Brand label */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.5, ease }}
            className="mb-8 text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground/28"
          >
            MoLis Intelligence
          </motion.p>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.68, ease }}
            className="mb-6 max-w-[640px] font-semibold leading-[1.06] tracking-[-0.034em]"
            style={{ fontSize: 'clamp(2.35rem, 5.5vw, 4.1rem)' }}
          >
            <span className="text-foreground">One intelligence</span>
            <br />
            <span className="text-gradient-red">for student life.</span>
          </motion.h1>

          {/* Supporting copy */}
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.88, ease }}
            className="mb-11 max-w-[390px] text-[15px] leading-[1.72] text-foreground/33"
          >
            Record lectures. Upload material. MoLis reads it, builds your study kit, and adapts to how you actually learn.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.05, ease }}
            className="flex items-center gap-3"
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_28px_-6px_rgba(190,28,28,0.58)] transition-all duration-200 hover:shadow-[0_0_40px_-4px_rgba(190,28,28,0.72)] hover:brightness-[1.06]"
            >
              Enter MoLis
              <ArrowIcon className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-xl border border-foreground/[0.08] px-6 py-3.5 text-sm font-medium text-foreground/38 transition-all duration-200 hover:border-foreground/[0.14] hover:text-foreground/68"
            >
              Sign in
            </Link>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 1.9 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
            aria-hidden="true"
          >
            <div className="h-7 w-px bg-gradient-to-b from-transparent to-foreground/12" />
            <div className="h-1 w-1 animate-pulse rounded-full bg-foreground/12" />
          </motion.div>
        </section>

        {/* ── Product Story ─────────────────────────────────────────── */}
        <section className="relative z-10 px-6 pb-28 pt-4">
          <div className="mx-auto max-w-md">

            {/* Section label */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55, ease }}
              className="mb-14 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/18"
            >
              How it works
            </motion.p>

            {/* Timeline */}
            <div className="relative">
              {/* Vertical connector line */}
              <div
                className="absolute left-[15px] top-4 bottom-8 w-px"
                style={{ background: 'linear-gradient(to bottom, rgba(190,28,28,0.22), rgba(190,28,28,0.08), transparent)' }}
                aria-hidden="true"
              />

              <div className="flex flex-col gap-0">
                {STORY_STEPS.map((step, i) => (
                  <motion.div
                    key={step.label}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-55px' }}
                    transition={{ duration: 0.55, delay: i * 0.09, ease }}
                    className={`flex gap-5 ${i < STORY_STEPS.length - 1 ? 'pb-10' : ''}`}
                  >
                    {/* Step dot */}
                    <div className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-primary/25 bg-background text-[10px] font-semibold text-primary/50">
                      {step.number}
                    </div>

                    {/* Content */}
                    <div className="pt-0.5">
                      <p className="mb-1 text-[15px] font-semibold tracking-[-0.016em] text-foreground/72">
                        {step.label}
                      </p>
                      <p className="text-[13px] leading-[1.68] text-foreground/30">
                        {step.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Bottom CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: 0.38, ease }}
              className="mt-14 flex justify-center"
            >
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-xl border border-foreground/[0.09] px-5 py-2.5 text-[13px] font-medium text-foreground/38 transition-all duration-200 hover:border-foreground/[0.15] hover:text-foreground/65"
              >
                Start with MoLis
                <ArrowIcon className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </div>
        </section>

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
