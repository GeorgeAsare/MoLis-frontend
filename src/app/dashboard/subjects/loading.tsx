export default function SubjectsLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-8 py-6">
        <div className="h-3 w-12 rounded bg-foreground/8 mb-2" />
        <div className="h-7 w-32 rounded-lg bg-foreground/8" />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-8 flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
