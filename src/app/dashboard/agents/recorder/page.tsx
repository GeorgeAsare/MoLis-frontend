import { Suspense } from 'react'
import { getRecentRecordings } from '@/app/actions/recordings'
import { RecorderAgent } from '@/components/agents/RecorderAgent'
import type { Recording } from '@/types/recordings'

export const metadata = {
  title: 'Lecture Recorder — MoLis',
}

async function RecentRecordings(): Promise<Recording[]> {
  try {
    return await getRecentRecordings()
  } catch {
    return []
  }
}

export default async function RecorderPage() {
  const recentRecordings = await RecentRecordings()

  return (
    <Suspense fallback={null}>
      <RecorderAgent initialRecordings={recentRecordings} />
    </Suspense>
  )
}
