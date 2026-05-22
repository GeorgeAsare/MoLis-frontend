import { Skeleton } from '@/components/ui/Skeleton'

export default function DocumentWorkspaceLoading() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Breadcrumb skeleton */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-6 py-3.5">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* 3-column skeleton */}
      <div className="flex flex-1">
        {/* Left sidebar */}
        <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-white/[0.06] p-5">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-20 rounded-full" />
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5 pt-1">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-white/[0.06] p-3">
              <Skeleton className="h-3 w-full" />
              <div className="h-px bg-white/[0.05]" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col gap-5 p-6">
          <div className="overflow-hidden rounded-xl border border-white/[0.07]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-32 rounded-full" />
            </div>
            <div className="flex flex-col items-center gap-3 py-16">
              <Skeleton className="h-14 w-14 rounded-2xl" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24 rounded-full" />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.07]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="flex flex-col items-center gap-3 py-12">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56 rounded-full" />
            </div>
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="flex w-72 shrink-0 flex-col gap-5 border-l border-white/[0.06] p-5">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-16 rounded-full" />
            <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] p-4">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5 rounded-full" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-12 rounded-full" />
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.07] py-8">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-3 w-24 rounded-full" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
