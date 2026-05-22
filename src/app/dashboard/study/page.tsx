import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { StudySection } from '@/components/study/StudySection'

export const metadata = {
  title: 'Study — MoLis',
}

export default async function StudyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl">
      <PageHeader
        title="Study"
        description="Upload documents and MoLis will turn them into revision material."
      />
      <StudySection userId={user.id} />
    </div>
  )
}
