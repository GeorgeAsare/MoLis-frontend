'use client'

import { useEffect } from 'react'
import { ErrorView } from '@/components/ui/ErrorView'

export default function MemoryError({
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
      context="An error occurred in the Memory section."
      digest={error.digest}
      onRetry={unstable_retry}
    />
  )
}
