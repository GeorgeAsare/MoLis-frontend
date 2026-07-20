import { Suspense } from 'react'
import { getRecentRecordings } from '@/app/actions/recordings'
import { getSubjects } from '@/app/actions/subjects'
import { RecorderAgent } from '@/components/agents/RecorderAgent'
import type { Recording } from '@/types/recordings'
import type { Subject } from '@/types/subject'

export const metadata = {
  title: 'Lecture Recorder — MoLis',
}

export default async function RecorderPage() {
  const [recentRecordings, subjects] = await Promise.all([
    getRecentRecordings().catch((): Recording[] => []),
    getSubjects().catch((): Subject[] => []),
  ])

  return (
    <Suspense fallback={null}>
      <RecorderAgent initialRecordings={recentRecordings} initialSubjects={subjects} />
    </Suspense>
  )
}
