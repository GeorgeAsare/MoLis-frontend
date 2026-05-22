import { Skeleton } from '@/components/ui/Skeleton'

export default function MemoryLoading() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl">

      {/* PageHeader skeleton */}
      <div className="flex items-start justify-between border-b border-white/5 pb-6 mb-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-64 rounded-full" />
        </div>
      </div>

      {/* Empty state skeleton */}
      <div className="flex flex-1 flex-col items-center justify-center py-20 gap-3">
        <Skeleton className="h-14 w-14 rounded-2xl mb-1" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-72 rounded-full" />
        <Skeleton className="h-3 w-56 rounded-full" />
      </div>

    </div>
  )
}
