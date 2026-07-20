import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubjectsWithCounts } from '@/app/actions/subjects'
import { syncSubjectsCore } from '@/lib/subjectsSync'
import { SubjectCreateForm } from '@/components/subjects/SubjectCreateForm'
import { SyncFromOnboardingButton } from '@/components/subjects/SyncFromOnboardingButton'
import type { SubjectWithCounts } from '@/types/subject'

export const metadata = {
  title: 'Subjects — MoLis',
}

export default async function SubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let subjects: SubjectWithCounts[] = []
  let setupRequired = false

  // Always attempt partial sync before rendering — internal helper, no revalidatePath.
  // Compares onboarding subjects against existing rows; only inserts missing ones.
  try {
    await syncSubjectsCore()
  } catch {
    // Sync failure is non-fatal; proceed to render whatever exists
  }

  try {
    subjects = await getSubjectsWithCounts()
  } catch (err) {
    if (err instanceof Error && err.message.includes('DATABASE_SETUP_REQUIRED')) {
      setupRequired = true
    }
  }

  const totalDocs = subjects.reduce((sum, s) => sum + s.document_count, 0)
  const totalRecs = subjects.reduce((sum, s) => sum + s.recording_count, 0)

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/22">
          MoLis
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground/88">Subjects</h1>
        <p className="mt-1 text-sm text-foreground/38">
          Organise your documents and recordings by subject.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-8 flex flex-col gap-6">

          {setupRequired && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-400 leading-relaxed">
              <strong>Database setup required.</strong> Run the Subject Spaces SQL in your Supabase SQL Editor to enable this feature.
            </div>
          )}

          {!setupRequired && (
            <>
              {/* Create form + sync recovery */}
              <div className="flex flex-col gap-3">
                <SubjectCreateForm />
                <div className="flex items-center justify-end">
                  <SyncFromOnboardingButton />
                </div>
              </div>

              {/* Subject list */}
              {subjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40">
                    <SubjectsIcon className="h-5 w-5 text-foreground/20" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground/40">No subjects yet</p>
                    <p className="mt-1 text-xs text-foreground/25 leading-relaxed max-w-xs">
                      Create a subject above. If you set up subjects during onboarding, use &ldquo;Sync from onboarding&rdquo; above to import them.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {subjects.map(s => (
                    <Link
                      key={s.id}
                      href={`/dashboard/subjects/${s.id}`}
                      className="group flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-all duration-200 hover:border-primary/20 hover:bg-muted/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 transition-colors duration-200 group-hover:border-primary/20 group-hover:bg-primary/[0.07]">
                        <SubjectsIcon className="h-4 w-4 text-foreground/30 transition-colors duration-200 group-hover:text-primary/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-foreground/80 truncate group-hover:text-foreground">{s.name}</p>
                        <p className="mt-0.5 text-xs text-foreground/35">
                          {s.document_count} {s.document_count === 1 ? 'doc' : 'docs'}
                          {' · '}
                          {s.recording_count} {s.recording_count === 1 ? 'recording' : 'recordings'}
                        </p>
                      </div>
                      <ChevronIcon className="h-4 w-4 shrink-0 text-foreground/20 transition-colors duration-200 group-hover:text-foreground/40" />
                    </Link>
                  ))}

                  {/* Unsorted virtual row */}
                  <div className="flex items-center gap-4 rounded-2xl border border-dashed border-border px-5 py-4 opacity-60">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/30">
                      <UnsortedIcon className="h-4 w-4 text-foreground/20" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-foreground/45">Unsorted</p>
                      <p className="mt-0.5 text-xs text-foreground/28">
                        Resources not assigned to a subject
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {subjects.length > 0 && (
                <p className="text-xs text-foreground/25 text-right">
                  {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}
                  {' · '}
                  {totalDocs} {totalDocs === 1 ? 'doc' : 'docs'}
                  {' · '}
                  {totalRecs} {totalRecs === 1 ? 'recording' : 'recordings'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SubjectsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
    </svg>
  )
}

function UnsortedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75h4.875a2.625 2.625 0 0 1 0 5.25H12M8.25 9.75 10.5 7.5M8.25 9.75 10.5 12m9-7.243V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}
