import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubjectWithResources } from '@/app/actions/subjects'
import { SubjectDeleteButton } from '@/components/subjects/SubjectDeleteButton'

export const metadata = {
  title: 'Subject — MoLis',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function SubjectDetailPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let subject, documents, recordings
  try {
    ;({ subject, documents, recordings } = await getSubjectWithResources(id))
  } catch {
    notFound()
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center gap-2 text-[11px] text-foreground/30">
          <Link href="/dashboard/subjects" className="hover:text-foreground/60 transition-colors">
            Subjects
          </Link>
          <span>/</span>
          <span className="text-foreground/50">{subject!.name}</span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground/88">{subject!.name}</h1>
          <SubjectDeleteButton subjectId={subject!.id} subjectName={subject!.name} />
        </div>
        <p className="mt-1 text-sm text-foreground/38">
          {documents!.length} {documents!.length === 1 ? 'document' : 'documents'}
          {' · '}
          {recordings!.length} {recordings!.length === 1 ? 'recording' : 'recordings'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-8 flex flex-col gap-8">

          {/* Documents */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-foreground/60 uppercase tracking-[0.07em]">Documents</h2>
              <Link
                href="/dashboard/study"
                className="text-[11px] text-foreground/30 hover:text-foreground/60 transition-colors"
              >
                Upload more →
              </Link>
            </div>
            {documents!.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
                <p className="text-sm text-foreground/35">No documents in this subject yet.</p>
                <Link
                  href="/dashboard/study"
                  className="mt-2 inline-block text-xs text-primary/60 hover:text-primary transition-colors"
                >
                  Go to Study to upload one →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {documents!.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <DocIcon className="h-4 w-4 shrink-0 text-foreground/25" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground/75 truncate">{doc.title}</p>
                      <p className="text-xs text-foreground/30">{doc.file_type || 'document'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recordings */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-foreground/60 uppercase tracking-[0.07em]">Recordings</h2>
              <Link
                href="/dashboard/agents/recorder"
                className="text-[11px] text-foreground/30 hover:text-foreground/60 transition-colors"
              >
                Record more →
              </Link>
            </div>
            {recordings!.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
                <p className="text-sm text-foreground/35">No recordings in this subject yet.</p>
                <Link
                  href="/dashboard/agents/recorder"
                  className="mt-2 inline-block text-xs text-primary/60 hover:text-primary transition-colors"
                >
                  Go to Recorder →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {recordings!.map(rec => (
                  <div
                    key={rec.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <MicIcon className="h-4 w-4 shrink-0 text-foreground/25" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground/75 truncate">{rec.title}</p>
                      <p className="text-xs text-foreground/30">
                        {rec.duration_seconds ? `${Math.round(rec.duration_seconds / 60)}m` : ''}
                        {rec.status === 'complete' ? ' · analysed' : ` · ${rec.status}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  )
}
