import { Skeleton } from '@/components/ui/Skeleton'

export default function StudyLoading() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl">

      {/* PageHeader skeleton */}
      <div className="flex items-start justify-between border-b border-white/5 pb-6 mb-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-72 rounded-full" />
        </div>
      </div>

      {/* Drop zone skeleton */}
      <Skeleton className="h-44 w-full rounded-xl mb-4" />

      {/* Button row */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Documents section */}
      <div className="mt-6 border-t border-white/[0.06] pt-6">
        <Skeleton className="h-3 w-28 mb-4 rounded-full" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>

    </div>
  )
}
