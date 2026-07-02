'use server'

import { createClient } from '@/lib/supabase/server'
import type { QuizAttempt, QuizAttemptPhase, AnswerState } from '@/types/quizAttempt'

export async function loadLatestQuizAttempt(documentId: string): Promise<QuizAttempt | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as QuizAttempt | null) ?? null
}

export async function startQuizAttempt(
  documentId: string,
  quizId: string,
  totalQuestions: number,
): Promise<QuizAttempt> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const answers: AnswerState[] = Array.from({ length: totalQuestions }, () => ({
    selected: null,
    revealed: false,
    selfCorrect: null,
  }))

  const { data, error } = await supabase
    .from('quiz_attempts')
    .insert({
      quiz_id: quizId,
      document_id: documentId,
      user_id: user.id,
      answers,
      current_index: 0,
      phase: 'playing',
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to start quiz attempt')
  return data as QuizAttempt
}

export async function saveQuizAttempt(
  attemptId: string,
  update: {
    answers: AnswerState[]
    current_index: number
    phase: QuizAttemptPhase
    score_correct?: number | null
    score_total?: number | null
    completed_at?: string | null
  },
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('quiz_attempts')
    .update({
      ...update,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .eq('user_id', user.id)
}
