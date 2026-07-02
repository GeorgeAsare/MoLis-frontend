// Pure structural component — no hooks, no client directive needed.
// All motion is CSS-driven for maximum performance.

interface Props {
  size?: number
  className?: string
}

export function NeuralCore({ size = 320, className = '' }: Props) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* ── Far ambient — whisper of red warmth ─────────────────── */}
      <div
        className="absolute rounded-full animate-glow-pulse"
        style={{
          inset: '-50%',
          background:
            'radial-gradient(ellipse at center, rgba(190,28,28,0.09) 0%, transparent 68%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          inset: '-28%',
          background:
            'radial-gradient(ellipse at center, rgba(120,8,8,0.06) 0%, transparent 65%)',
          filter: 'blur(24px)',
        }}
      />

      {/* ── Ring 1 — outermost, dashed, slow CW ─────────────────── */}
      <div className="absolute animate-orbit-cw-slow" style={{ inset: '6%' }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: '1px dashed rgba(255,255,255,0.13)' }}
        />
        {/* Satellite A — 12 o'clock — primary energy node */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full animate-glow-pulse"
          style={{
            top: -5,
            width: 10,
            height: 10,
            background: 'hsl(0 78% 58%)',
            boxShadow:
              '0 0 12px rgba(205,38,38,0.90), 0 0 4px rgba(220,55,55,1)',
          }}
        />
        {/* Satellite B — ~7 o'clock */}
        <div
          className="absolute rounded-full"
          style={{
            top: '80%',
            left: '9%',
            width: 6,
            height: 6,
            background: 'rgba(195,40,40,0.55)',
            boxShadow: '0 0 8px rgba(195,38,38,0.60)',
          }}
        />
        {/* Satellite C — ~4 o'clock (subtle) */}
        <div
          className="absolute rounded-full"
          style={{
            top: '60%',
            left: '88%',
            width: 4,
            height: 4,
            background: 'rgba(175,28,28,0.32)',
            boxShadow: '0 0 5px rgba(175,35,35,0.40)',
          }}
        />
      </div>

      {/* ── Ring 2 — middle, solid, slow CCW ─────────────────────── */}
      <div className="absolute animate-orbit-ccw-slow" style={{ inset: '20%' }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: '1px solid rgba(255,255,255,0.09)' }}
        />
        {/* Satellite — ~2 o'clock */}
        <div
          className="absolute rounded-full"
          style={{
            top: '7%',
            left: '80%',
            width: 7,
            height: 7,
            background: 'rgba(205,45,45,0.68)',
            boxShadow: '0 0 9px rgba(198,42,42,0.70)',
          }}
        />
      </div>

      {/* ── Ring 3 — inner, faster CW ────────────────────────────── */}
      <div className="absolute animate-orbit-cw-fast" style={{ inset: '31%' }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: '1px solid rgba(255,255,255,0.07)' }}
        />
        {/* Satellite — 12 o'clock */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            top: -4,
            width: 8,
            height: 8,
            background: 'rgba(198,38,38,0.78)',
            boxShadow: '0 0 7px rgba(188,28,28,0.80)',
          }}
        />
      </div>

      {/* ── Core sphere — compressed intelligence ────────────────── */}
      <div className="absolute" style={{ inset: '38%' }}>
        {/* Core ambient glow */}
        <div
          className="absolute rounded-full"
          style={{
            inset: '-90%',
            background:
              'radial-gradient(ellipse at center, rgba(175,28,28,0.20) 0%, transparent 65%)',
            filter: 'blur(18px)',
          }}
        />
        {/* Core shell */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(145deg, rgba(145,25,25,0.30) 0%, rgba(78,10,10,0.24) 55%, rgba(38,4,4,0.16) 100%)',
            border: '1px solid rgba(205,58,58,0.38)',
            boxShadow:
              '0 0 28px rgba(185,28,28,0.26), inset 0 0 16px rgba(175,35,35,0.07)',
          }}
        >
          {/* Specular highlight */}
          <div
            className="absolute rounded-full"
            style={{
              inset: '12%',
              background:
                'radial-gradient(ellipse at 30% 22%, rgba(255,210,210,0.20) 0%, transparent 65%)',
            }}
          />
          {/* Inner core — the hot centre */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse"
            style={{
              width: '32%',
              height: '32%',
              background: 'rgba(255,182,182,0.68)',
              boxShadow: '0 0 8px rgba(238,148,148,0.82)',
            }}
          />
        </div>
      </div>

      {/* ── Pulse waves radiating from core ──────────────────────── */}
      <div
        className="absolute rounded-full animate-pulse-outward"
        style={{
          inset: '38%',
          border: '1px solid rgba(185,28,28,0.34)',
        }}
      />
      <div
        className="absolute rounded-full animate-pulse-outward-delay"
        style={{
          inset: '38%',
          border: '1px solid rgba(185,28,28,0.20)',
        }}
      />
    </div>
  )
}
