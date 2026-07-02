import { Skeleton } from '@/components/ui/Skeleton'

export default function StudyLoading() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header skeleton */}
      <div className="border-b border-white/[0.06] px-8 py-6">
        <Skeleton className="h-3 w-12 rounded-full" />
        <Skeleton className="mt-2 h-7 w-32" />
        <Skeleton className="mt-2 h-4 w-72 rounded-full" />
      </div>

      <div className="mx-auto w-full max-w-3xl px-8 py-8">
        {/* Upload zone skeleton */}
        <div className="mb-8 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/[0.07] bg-white/[0.02] py-14">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-4 w-52 rounded-full" />
            <Skeleton className="h-3 w-36 rounded-full" />
          </div>
        </div>

        {/* Library list skeleton */}
        <div className="flex flex-col gap-2">
          <Skeleton className="mb-3 h-3 w-28 rounded-full" />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
            >
              <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-52" />
                <Skeleton className="h-3 w-32 rounded-full" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
