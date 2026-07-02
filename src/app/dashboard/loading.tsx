import { Skeleton } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="flex w-full max-w-5xl flex-col px-8 py-8">

      {/* Header */}
      <div className="mb-8 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-3 w-32 rounded-full" />
        </div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-44 rounded-full" />
      </div>

      {/* Stat cards */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col justify-between gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 h-[148px]"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-3.5 w-3.5 rounded" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3.5 w-16 rounded-full" />
              <Skeleton className="h-3 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Adaptive learning */}
      <div className="mb-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52 rounded-full" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Daily digest */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-48 rounded-full" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  )
}
