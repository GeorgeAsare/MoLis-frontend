import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  label?: string
  as?: 'h1' | 'h2'
  className?: string
}

export function PageHeader({
  title,
  description,
  action,
  label,
  as: Tag = 'h1',
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-8 flex items-start justify-between', className)}>
      <div>
        {label && (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/38">
            {label}
          </p>
        )}
        <Tag
          className={cn(
            'font-semibold tracking-[-0.02em] text-foreground',
            Tag === 'h1' ? 'text-xl' : 'text-lg',
          )}
        >
          {title}
        </Tag>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
