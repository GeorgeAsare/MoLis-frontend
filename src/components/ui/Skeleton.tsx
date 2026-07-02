import type { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  style?: CSSProperties
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`shimmer rounded-lg bg-white/[0.05] ${className}`}
      style={style}
    />
  )
}
