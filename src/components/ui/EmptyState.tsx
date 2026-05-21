import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-white/60">{title}</h3>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-white/30">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
