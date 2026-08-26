import { Skeleton } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="relative min-h-full w-full">
      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col px-6 py-8 lg:px-10 lg:py-8">

        {/* Personal moment skeleton */}
        <div className="mb-7">
          <Skeleton className="mb-4 h-3 w-24 rounded-full" />
          <Skeleton className="mb-3 h-12 w-52 sm:w-64" />
          <Skeleton className="h-5 w-80 rounded-full" />
        </div>

        {/* Primary action skeleton */}
        <div className="mb-7 rounded-2xl bg-card p-6 shadow-[var(--shadow-md)] lg:p-8">
          <div className="flex items-center gap-5">
            <Skeleton className="h-16 w-16 shrink-0 rounded-[16px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-2 h-2.5 w-20 rounded-full" />
              <Skeleton className="mb-2.5 h-7 w-56 sm:w-72" />
              <Skeleton className="h-4 w-40 rounded-full sm:w-48" />
            </div>
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          </div>
        </div>

        {/* Intelligence strip skeleton */}
        <div className="mb-10 flex items-center">
          <Skeleton className="h-3.5 w-28 rounded-full" />
          <span className="mx-3 select-none text-foreground/22">·</span>
          <Skeleton className="h-3.5 w-32 rounded-full" />
          <span className="mx-3 select-none text-foreground/22">·</span>
          <Skeleton className="h-3.5 w-20 rounded-full" />
        </div>

        {/* Content grid skeleton */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">

          {/* Learning section */}
          <div>
            <Skeleton className="mb-5 h-4 w-32 rounded" />
            <Skeleton className="mb-2.5 h-3 w-36 rounded-full" />
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[62px] w-full rounded-xl" />
              ))}
            </div>
          </div>

          {/* Recent section */}
          <div>
            <Skeleton className="mb-4 h-4 w-32 rounded" />
            <div className="flex flex-col">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border-b border-border/30 py-2.5 last:border-0">
                  <Skeleton className="mb-1 h-3.5 w-full rounded-full" />
                  <Skeleton className="h-3 w-3/4 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
