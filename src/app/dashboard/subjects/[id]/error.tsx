'use client'

import Link from 'next/link'

export default function SubjectDetailError() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <p className="text-sm text-foreground/50">Subject not found or could not be loaded.</p>
      <Link
        href="/dashboard/subjects"
        className="text-xs text-primary/60 hover:text-primary transition-colors"
      >
        ← Back to Subjects
      </Link>
    </div>
  )
}
