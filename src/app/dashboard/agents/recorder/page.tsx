import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
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

  // Look up existing study sets for each recent recording
  const initialStudyDocIds: Record<string, string> = {}
  if (recentRecordings.length > 0) {
    try {
      const supabase = await createClient()
      const ids = recentRecordings.map(r => r.id)
      const { data } = await supabase
        .from('documents')
        .select('id, source_recording_id')
        .in('source_recording_id', ids)

      if (data) {
        for (const row of data) {
          if (row.source_recording_id) {
            initialStudyDocIds[row.source_recording_id as string] = row.id as string
          }
        }
      }
    } catch {
      // Non-fatal — UI gracefully handles missing data
    }
  }

  return (
    <Suspense fallback={null}>
      <RecorderAgent
        initialRecordings={recentRecordings}
        initialSubjects={subjects}
        initialStudyDocIds={initialStudyDocIds}
      />
    </Suspense>
  )
}
