interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  pulse?: boolean
}

const sizeMap = {
  xs: { outer: 'h-4 w-4', blur: 'blur-sm', dot: 'h-1.5 w-1.5' },
  sm: { outer: 'h-6 w-6', blur: 'blur-[6px]', dot: 'h-2 w-2' },
  md: { outer: 'h-10 w-10', blur: 'blur-md', dot: 'h-3 w-3' },
  lg: { outer: 'h-16 w-16', blur: 'blur-xl', dot: 'h-4 w-4' },
  xl: { outer: 'h-24 w-24', blur: 'blur-2xl', dot: 'h-6 w-6' },
}

// Pure visual component — renders an ambient AI status orb.
// No client directive needed: no hooks, no interactivity.
export function NeuralOrb({ size = 'md', className = '', pulse = true }: Props) {
  const s = sizeMap[size]
  return (
    <div className={`relative shrink-0 ${s.outer} ${className}`}>
      {/* Ambient halo */}
      <div
        className={`absolute inset-0 rounded-full ${s.blur} ${
          pulse ? 'animate-glow-pulse' : ''
        }`}
        style={{ background: 'rgba(190,28,28,0.28)' }}
      />
      {/* Orb shell */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'linear-gradient(135deg, rgba(160,28,28,0.22) 0%, rgba(80,10,10,0.16) 60%, rgba(30,4,4,0.10) 100%)',
          border: '1px solid rgba(200,50,50,0.24)',
        }}
      />
      {/* Inner shine */}
      <div
        className="absolute inset-[20%] rounded-full"
        style={{
          background:
            'radial-gradient(ellipse at 30% 25%, rgba(255,190,190,0.18) 0%, transparent 70%)',
        }}
      />
      {/* Core dot */}
      <div
        className={`absolute inset-0 m-auto ${s.dot} rounded-full ${
          pulse ? 'animate-pulse' : ''
        }`}
        style={{
          background: 'hsl(0 78% 56%)',
          boxShadow: '0 0 8px rgba(190,28,28,0.88)',
        }}
      />
    </div>
  )
}
