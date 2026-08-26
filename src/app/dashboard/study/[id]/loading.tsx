import { Skeleton } from '@/components/ui/Skeleton'

export default function StudySetLoading() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Breadcrumb skeleton */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-3.5">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-1">
        {['Overview', 'Notes', 'Flashcards', 'Quiz', 'Visuals', 'Weak Topics'].map((t) => (
          <Skeleton key={t} className="mx-1 h-8 rounded-lg" style={{ width: `${t.length * 8 + 16}px` }} />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        {/* Document card */}
        <div className="mb-8 flex items-center gap-4 rounded-2xl border border-border bg-muted/20 p-5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-36 rounded-full" />
          </div>
        </div>

        {/* Extraction panel skeleton */}
        <div className="mb-8 overflow-hidden rounded-xl border border-border/60">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-10 w-36 rounded-xl" />
          </div>
        </div>

        {/* Feature grid skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-5"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-full rounded-full" />
                <Skeleton className="h-3 w-3/4 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
