interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  label?: string
}

export function PageHeader({ title, description, action, label }: PageHeaderProps) {
  return (
    <div className="mb-8 flex items-start justify-between">
      <div>
        {label && (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/20">
            {label}
          </p>
        )}
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-white">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-white/35">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
