import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DocumentPreview } from '@/components/study/DocumentPreview'
import { ExtractionPanel } from '@/components/study/ExtractionPanel'
import { AIActionsSection } from '@/components/study/AIActionsSection'
import { RevisionNotesPanel } from '@/components/study/RevisionNotesPanel'
import { QuizPanel } from '@/components/study/QuizPanel'
import { WeakTopicsPanel } from '@/components/study/WeakTopicsPanel'
import type { RevisionNote } from '@/types/revisionNotes'
import type { Quiz } from '@/types/quiz'
import type { WeakTopic } from '@/types/weakTopic'

export const metadata = {
  title: 'Document Workspace — MoLis',
}

function fileTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'text/plain': 'Text',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  }
  return map[mimeType] ?? (mimeType.split('/')[1]?.toUpperCase() || 'File')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function DocumentWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, user_id, title, file_path, file_type, created_at, extracted_text')
    .eq('id', id)
    .single()

  if (error || !doc) notFound()
  if (doc.user_id !== user.id) notFound()

  const { data: signedData } = await supabase.storage
    .from('study-documents')
    .createSignedUrl(doc.file_path, 3600)

  const signedUrl = signedData?.signedUrl ?? null

  const { data: existingNotes } = await supabase
    .from('revision_notes')
    .select('*')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialNotes = (existingNotes as RevisionNote | null) ?? null

  const { data: existingQuiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialQuiz = (existingQuiz as Quiz | null) ?? null

  const { data: weakTopicsData } = await supabase
    .from('weak_topics')
    .select('*')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .order('weakness_score', { ascending: false })
    .limit(10)

  const weakTopics = (weakTopicsData as WeakTopic[] | null) ?? []

  const label = fileTypeLabel(doc.file_type)
  const date = formatDate(doc.created_at)

  return (
    <div className="flex flex-1 flex-col">

      {/* ── Breadcrumb ──────────────────────────────────────────── */}
      <nav className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-6 py-3.5">
        <Link
          href="/dashboard/study"
          className="text-sm text-white/40 transition-colors hover:text-white/60"
        >
          Study
        </Link>
        <ChevronIcon className="h-3 w-3 text-white/20" />
        <span className="truncate text-sm text-white/70">{doc.title}</span>
      </nav>

      {/* ── 3-column workspace ──────────────────────────────────── */}
      <div className="flex flex-1">

        {/* Left sidebar */}
        <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-white/[0.06] p-5">

          {/* Document info */}
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/20">
              Document
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
                  <FileIcon className="h-4 w-4 text-violet-400" />
                </div>
                <p className="break-words text-sm font-medium leading-snug text-white/80">
                  {doc.title}
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/30">Type</span>
                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-400">
                    {label}
                  </span>
                </div>
                <div className="h-px bg-white/[0.05]" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/30">Uploaded</span>
                  <span className="text-xs text-white/50">{date}</span>
                </div>
              </div>
            </div>
          </section>

          {/* AI actions */}
          <AIActionsSection
            hasExtractedText={!!doc.extracted_text}
            hasNotes={!!initialNotes}
            hasQuiz={!!initialQuiz}
          />

          {/* Back link */}
          <section className="mt-auto">
            <Link
              href="/dashboard/study"
              className="flex items-center gap-1.5 text-xs text-white/25 transition-colors hover:text-white/45"
            >
              <BackIcon className="h-3 w-3" />
              Back to Study
            </Link>
          </section>
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col gap-5 p-6">

          {/* Document preview */}
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025]">
            {signedUrl ? (
              <DocumentPreview
                fileType={doc.file_type}
                signedUrl={signedUrl}
                title={doc.title}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-white/30">Could not load document.</p>
                <p className="mt-1 text-xs text-white/20">The file link may have expired — reload the page.</p>
              </div>
            )}
          </div>

          {/* Text extraction */}
          <ExtractionPanel
            documentId={doc.id}
            fileType={doc.file_type}
            signedUrl={signedUrl}
            initialExtractedText={doc.extracted_text ?? null}
          />

          {/* Revision notes */}
          <RevisionNotesPanel
            documentId={doc.id}
            hasExtractedText={!!doc.extracted_text}
            initialNotes={initialNotes}
          />

          {/* Quiz */}
          <QuizPanel
            documentId={doc.id}
            hasExtractedText={!!doc.extracted_text}
            initialQuiz={initialQuiz}
          />
        </main>

        {/* Right sidebar */}
        <aside className="flex w-72 shrink-0 flex-col gap-5 border-l border-white/[0.06] p-5">

          {/* Ask AI panel */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/20">
                Ask AI
              </p>
              <SparklesIcon className="h-3.5 w-3.5 text-white/15" />
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-xs text-white/30">
                Ask anything about your document — concepts, summaries, exam questions.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 opacity-50">
                <span className="flex-1 text-xs text-white/20">Ask about this document…</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-md border border-violet-500/20 bg-violet-500/10">
                  <SendIcon className="h-3 w-3 text-violet-400/50" />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Summarise', 'Key concepts', 'Exam questions'].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/20"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <p className="text-center text-[11px] text-white/15">AI chat coming soon</p>
            </div>
          </div>

          {/* Notes panel */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/20">
                Notes
              </p>
              <EditIcon className="h-3.5 w-3.5 text-white/15" />
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] py-8 text-center">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
                <EditIcon className="h-4 w-4 text-white/15" />
              </div>
              <p className="text-xs text-white/25">No notes yet</p>
              <p className="mt-1 text-[11px] text-white/15">Notes panel coming soon</p>
            </div>
          </div>

          <WeakTopicsPanel weakTopics={weakTopics} />
        </aside>
      </div>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  )
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  )
}
