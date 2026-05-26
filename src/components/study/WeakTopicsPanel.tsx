import type { WeakTopic } from '@/types/weakTopic'

interface Props {
  weakTopics: WeakTopic[]
}

function scoreStyle(score: number): string {
  if (score >= 4) return 'border-red-500/25 bg-red-500/[0.08] text-red-400'
  if (score >= 2) return 'border-orange-500/20 bg-orange-500/[0.07] text-orange-400'
  return 'border-yellow-500/20 bg-yellow-500/[0.07] text-yellow-400/90'
}

function dotStyle(score: number): string {
  if (score >= 4) return 'bg-red-400/70'
  if (score >= 2) return 'bg-orange-400/70'
  return 'bg-yellow-400/60'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function WeakTopicsPanel({ weakTopics }: Props) {
  const sorted = [...weakTopics].sort((a, b) => b.weakness_score - a.weakness_score)
  const visible = sorted.slice(0, 5)
  const overflow = sorted.length - visible.length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/20">
          Weak Topics
        </p>
        <TargetIcon className="h-3.5 w-3.5 text-white/15" />
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] py-6 text-center">
          <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
            <TargetIcon className="h-4 w-4 text-white/15" />
          </div>
          <p className="text-xs text-white/25">No weak topics yet</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/15">
            Complete a quiz to start adaptive tracking
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((wt) => (
            <div
              key={wt.id}
              className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotStyle(wt.weakness_score)}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/65">{wt.topic}</p>
                <p className="mt-0.5 text-[11px] text-white/25">
                  {relativeTime(wt.last_seen)} · {wt.evidence.length}{' '}
                  {wt.evidence.length === 1 ? 'miss' : 'misses'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${scoreStyle(wt.weakness_score)}`}
              >
                ×{wt.weakness_score}
              </span>
            </div>
          ))}

          {overflow > 0 && (
            <p className="pl-0.5 text-[11px] text-white/20">
              +{overflow} more topic{overflow !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
  )
}
