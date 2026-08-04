import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StudySetView } from '@/components/study/StudySetView'
import { getStudyPlan } from '@/app/actions/studyPlan'
import { loadTutorMessages } from '@/app/actions/tutorMessages'
import type { RevisionNote } from '@/types/revisionNotes'
import type { Quiz } from '@/types/quiz'
import type { FlashcardSet } from '@/types/flashcard'
import type { ConceptMastery } from '@/types/conceptMastery'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { PublicVisualSet } from '@/types/studyVisual'

// R8-H04: fn_get_owner_study_visuals now strips storage_path and image_prompt at
// the database boundary, so the RPC already returns the PublicVisualSet shape.
// No client-side sanitization is needed here.
import type { FlashcardProgress } from '@/types/flashcardProgress'
import type { QuizAttempt } from '@/types/quizAttempt'
import type { TutorMessage } from '@/types/tutor'

export const metadata = {
  title: 'Study Set — MoLis',
}

export default async function StudySetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, user_id, title, file_path, file_type, created_at, extracted_text, source_type')
    .eq('id', id)
    .single()

  if (error || !doc) notFound()
  if (doc.user_id !== user.id) notFound()

  const signedUrl = doc.file_path
    ? ((await supabase.storage.from('study-documents').createSignedUrl(doc.file_path, 3600)).data?.signedUrl ?? null)
    : null

  // Fetch all study content in parallel
  const [
    notesResult,
    quizResult,
    flashcardsResult,
    weakTopicsResult,
    analysisResult,
    studyPlan,
    visualsResult,
    flashcardProgressResult,
    quizAttemptResult,
    tutorMessages,
  ] = await Promise.all([
    supabase
      .from('revision_notes')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('quizzes')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('flashcards')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('concept_mastery')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .gt('review_count', 0)
      .or('mastery_score.lt.50,forgetting_risk.eq.medium,forgetting_risk.eq.high')
      .order('mastery_score', { ascending: true })
      .limit(20),
    supabase
      .from('document_analysis')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    getStudyPlan(id).catch(() => null),
    supabase.rpc('fn_get_owner_study_visuals', { p_document_id: id }),
    supabase
      .from('flashcard_progress')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('quiz_attempts')
      .select('*')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadTutorMessages(id).catch(() => [] as TutorMessage[]),
  ])

  return (
    <StudySetView
      doc={{
        id: doc.id,
        title: doc.title,
        file_type: doc.file_type,
        file_path: doc.file_path ?? null,
        created_at: doc.created_at,
        extracted_text: doc.extracted_text ?? null,
        source_type: (doc as { source_type?: string | null }).source_type ?? null,
      }}
      signedUrl={signedUrl}
      initialNotes={(notesResult.data as RevisionNote | null) ?? null}
      initialQuiz={(quizResult.data as Quiz | null) ?? null}
      initialFlashcards={(flashcardsResult.data as FlashcardSet | null) ?? null}
      initialVisuals={(visualsResult.data as PublicVisualSet | null)}
      weakTopics={(weakTopicsResult.data as ConceptMastery[] | null) ?? []}
      initialAnalysis={(analysisResult.data as DocumentAnalysis | null) ?? null}
      initialStudyPlan={studyPlan}
      initialFlashcardProgress={(flashcardProgressResult.data as FlashcardProgress | null) ?? null}
      initialQuizAttempt={(quizAttemptResult.data as QuizAttempt | null) ?? null}
      initialTutorMessages={tutorMessages}
      initialTab={tab ?? 'overview'}
    />
  )
}
