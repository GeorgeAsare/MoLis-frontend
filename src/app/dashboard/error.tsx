'use client'

import { useEffect } from 'react'
import { ErrorView } from '@/components/ui/ErrorView'

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ErrorView
      context="An error occurred loading your dashboard."
      digest={error.digest}
      onRetry={unstable_retry}
    />
  )
}
