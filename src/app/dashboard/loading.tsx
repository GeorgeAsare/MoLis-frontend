import { Skeleton } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col px-8 py-8 max-w-5xl w-full">

      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-8 w-52 mb-2.5" />
        <Skeleton className="h-4 w-72 mb-4" />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-white/10 animate-pulse" />
            <Skeleton className="h-3 w-20 rounded-full" />
          </div>
          <span className="h-3 w-px bg-white/10" />
          <Skeleton className="h-3 w-28 rounded-full" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col justify-between gap-5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-5"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-3 w-3 rounded" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5 mb-1.5">
                <Skeleton className="h-7 w-7" />
                <Skeleton className="h-3 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-16 mb-1.5" />
              <Skeleton className="h-3 w-32 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Daily Digest */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-52 rounded-full" />
          </div>
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <div className="flex flex-col items-center py-8 gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-52 rounded-full" />
        </div>
      </div>

    </div>
  )
}
