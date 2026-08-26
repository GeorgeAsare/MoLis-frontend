import { NeuralOrb } from '@/components/ui/NeuralOrb'

// Auth layout — brand panel (always dark) + form panel (theme-adaptive)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background lg:flex">

      {/* ── Brand panel — desktop only, always dark ──────────────── */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[400px] xl:w-[440px] lg:flex-col lg:justify-between lg:p-10"
        style={{ background: 'hsl(0 4% 7%)' }}
        aria-hidden="true"
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute -top-24 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full blur-[100px]"
            style={{ background: 'rgba(190,28,28,0.10)' }}
          />
          <div
            className="absolute bottom-0 right-0 h-[280px] w-[280px] rounded-full blur-[80px]"
            style={{ background: 'rgba(160,20,20,0.06)' }}
          />
          <div className="absolute inset-0 bg-grid-dots dark opacity-[0.18]" />
        </div>

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-2.5">
          <NeuralOrb size="xs" pulse={false} />
          <span className="text-[13px] font-semibold tracking-[-0.015em] text-white/80">MoLis</span>
        </div>

        {/* Central message */}
        <div className="relative z-10">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/22">
            Student Intelligence
          </p>
          <p
            className="font-semibold leading-[1.1] tracking-[-0.028em] text-white/82"
            style={{ fontSize: 'clamp(1.55rem, 2.4vw, 1.85rem)' }}
          >
            One intelligence<br />
            for everything<br />
            you learn.
          </p>

          {/* Capability list */}
          <div className="mt-8 flex flex-col gap-2.5">
            {[
              'Lecture recording',
              'Intelligent notes',
              'Adaptive quizzes',
              'Spaced flashcards',
              'Weak-topic tracking',
              'Personal study profile',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="h-[3px] w-[3px] shrink-0 rounded-full bg-primary/55" />
                <span className="text-[12px] text-white/30">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-[11px] text-white/18">
          © 2025 MoLis Intelligence
        </p>
      </div>

      {/* ── Form panel ────────────────────────────────────────────── */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-14">

        {/* Subtle ambient — visible mainly in dark mode */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute left-1/2 top-0 h-[320px] w-[520px] -translate-x-1/2 rounded-full blur-[90px]"
            style={{ background: 'rgba(190,28,28,0.045)' }}
          />
        </div>

        {/* Mobile brand mark — hidden at lg */}
        <div className="relative z-10 mb-10 flex flex-col items-center gap-3 text-center lg:hidden">
          <NeuralOrb size="sm" pulse />
          <div>
            <p className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">MoLis</p>
            <p className="mt-0.5 text-[12px] text-foreground/38">Your student intelligence</p>
          </div>
        </div>

        {/* Desktop form heading — hidden on mobile, shown at lg */}
        <div className="relative z-10 mb-8 hidden text-center lg:block">
          <p className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">MoLis</p>
          <p className="mt-0.5 text-[12px] text-foreground/38">Your student intelligence</p>
        </div>

        {/* Form */}
        <div className="relative z-10 w-full max-w-sm">
          {children}
        </div>

        {/* Mobile footer */}
        <p className="relative z-10 mt-10 text-[11px] text-foreground/18 lg:hidden">
          © 2025 MoLis Intelligence
        </p>
      </div>
    </div>
  )
}
