import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StudySection } from '@/components/study/StudySection'
import { getSubjects } from '@/app/actions/subjects'
import type { Subject } from '@/types/subject'

export const metadata = {
  title: 'Study — MoLis',
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
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/22">
          MoLis
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground/88">Study Sets</h1>
        <p className="mt-1 text-sm text-foreground/38">
          Upload a document and MoLis turns it into flashcards, notes, quizzes, and visual aids.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-8">
          <StudySection userId={user.id} subjects={subjects} />
        </div>
      </div>
    </div>
  )
}
