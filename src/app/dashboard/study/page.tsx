import { PageHeader } from '@/components/ui/PageHeader'
import { StudyUploadForm } from '@/components/study/StudyUploadForm'

export const metadata = {
  title: 'Study — MoLis',
}

export default function StudyPage() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl">
      <PageHeader
        title="Study"
        description="Upload documents and MoLis will turn them into revision material."
      />
      <StudyUploadForm />
    </div>
  )
}
