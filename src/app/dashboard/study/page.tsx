import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StudySection } from '@/components/study/StudySection'
import { getSubjects } from '@/app/actions/subjects'
import type { Subject } from '@/types/subject'

export const metadata = {
  title: 'Learning Library — MoLis',
}

export default async function StudyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  let subjects: Subject[] = []
  try {
    subjects = await getSubjects()
  } catch {
    // subjects table may not be set up yet; degrade gracefully
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-8">
        <StudySection userId={user.id} subjects={subjects} />
      </div>
    </div>
  )
}
