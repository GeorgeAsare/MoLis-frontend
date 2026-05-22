'use client'

import { Button } from '@/components/ui/Button'

interface ErrorViewProps {
  context: string
  digest?: string
  onRetry: () => void
}

export function ErrorView({ context, digest, onRetry }: ErrorViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      {/* Icon */}
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/[0.08]">
        <WarningIcon className="h-6 w-6 text-amber-400/70" />
      </div>

      {/* Copy */}
      <h2 className="text-base font-semibold tracking-tight text-white">
        Something went wrong
      </h2>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/40">
        {context} Try again or refresh the page.
      </p>

      {/* Retry */}
      <div className="mt-6">
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>

      {/* Digest — useful for matching server-side logs */}
      {digest ? (
        <p className="mt-6 font-mono text-[11px] text-white/15">
          Error ID: {digest}
        </p>
      ) : null}
    </div>
  )
}

function WarningIcon({ className }: { className?: string }) {
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
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  )
}
