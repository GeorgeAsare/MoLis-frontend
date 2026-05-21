interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between border-b border-white/5 pb-6 mb-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-white/40">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
