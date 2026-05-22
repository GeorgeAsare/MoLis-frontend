'use client'

import { useEffect } from 'react'
import { ErrorView } from '@/components/ui/ErrorView'

export default function AgentsError({
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
      context="An error occurred in the Agents section."
      digest={error.digest}
      onRetry={unstable_retry}
    />
  )
}
