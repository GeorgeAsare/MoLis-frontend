'use server'

import { createClient } from '@/lib/supabase/server'
import type { DailyDigest, DigestActivity, DigestActivityType } from '@/types/studyDigest'
import type { CardStatus } from '@/types/flashcardProgress'

export async function getStudyDigest(): Promise<DailyDigest | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const [
    docCountResult,
    quizResult,
    flashcardResult,
    conceptsResult,
    tutorResult,
    notesResult,
  ] = await Promise.all([
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('quiz_attempts')
      .select('document_id, phase, score_correct, score_total, updated_at')
      .eq('user_id', user.id)
      .gte('updated_at', todayIso)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('flashcard_progress')
      .select('document_id, phase, card_statuses, updated_at')
      .eq('user_id', user.id)
      .gte('updated_at', todayIso)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('concept_mastery')
      .select('document_id', { count: 'exact', head: false })
      .eq('user_id', user.id)
      .gte('last_reviewed_at', todayIso),
    supabase
      .from('tutor_messages')
      .select('document_id, created_at')
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', todayIso)
      .limit(50),
    supabase
      .from('revision_notes')
      .select('document_id, created_at')
      .eq('user_id', user.id)
      .gte('created_at', todayIso)
      .limit(10),
  ])

  // Collect unique document IDs to fetch titles in one query
  const docIdSet = new Set<string>()
  for (const r of quizResult.data ?? []) docIdSet.add(r.document_id)
  for (const r of flashcardResult.data ?? []) docIdSet.add(r.document_id)
  for (const r of tutorResult.data ?? []) docIdSet.add(r.document_id)
  for (const r of notesResult.data ?? []) docIdSet.add(r.document_id)

  const docIds = [...docIdSet]
  const titleMap = new Map<string, string>()
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title')
      .in('id', docIds)
      .eq('user_id', user.id)
    for (const d of docs ?? []) titleMap.set(d.id as string, d.title as string)
  }

  const activities: DigestActivity[] = []

  // Quiz attempts
  for (const qa of quizResult.data ?? []) {
    const title = titleMap.get(qa.document_id) ?? 'Untitled document'
    const completed = qa.phase === 'review'
    const detail = completed && qa.score_correct != null
      ? `Scored ${qa.score_correct}/${qa.score_total}`
      : 'Quiz in progress'
    activities.push({
      type: (completed ? 'quiz_completed' : 'quiz_in_progress') as DigestActivityType,
      document_id: qa.document_id,
      document_title: title,
      detail,
      href: `/dashboard/study/${qa.document_id}?tab=quiz`,
      timestamp: qa.updated_at as string,
    })
  }

  // Flashcard sessions
  for (const fp of flashcardResult.data ?? []) {
    const title = titleMap.get(fp.document_id) ?? 'Untitled document'
    const statuses = (fp.card_statuses ?? []) as CardStatus[]
    const known = statuses.filter(s => s === 'known').length
    const total = statuses.length
    const completed = fp.phase === 'done'
    const detail = completed
      ? `Completed · ${known}/${total} known`
      : `${known}/${total} known so far`
    activities.push({
      type: (completed ? 'flashcards_completed' : 'flashcards_in_progress') as DigestActivityType,
      document_id: fp.document_id,
      document_title: title,
      detail,
      href: `/dashboard/study/${fp.document_id}?tab=flashcards`,
      timestamp: fp.updated_at as string,
    })
  }

  // Tutor sessions — group by document
  const tutorByDoc = new Map<string, { count: number; latest: string }>()
  for (const tm of tutorResult.data ?? []) {
    const entry = tutorByDoc.get(tm.document_id)
    if (entry) {
      entry.count++
    } else {
      tutorByDoc.set(tm.document_id, { count: 1, latest: tm.created_at as string })
    }
  }
  for (const [docId, info] of tutorByDoc) {
    const title = titleMap.get(docId) ?? 'Untitled document'
    activities.push({
      type: 'tutor_session',
      document_id: docId,
      document_title: title,
      detail: `${info.count} question${info.count !== 1 ? 's' : ''} asked`,
      href: `/dashboard/study/${docId}?tab=tutor`,
      timestamp: info.latest,
    })
  }

  // Notes generated
  for (const note of notesResult.data ?? []) {
    const title = titleMap.get(note.document_id) ?? 'Untitled document'
    activities.push({
      type: 'notes_generated',
      document_id: note.document_id,
      document_title: title,
      detail: 'Revision notes generated',
      href: `/dashboard/study/${note.document_id}?tab=notes`,
      timestamp: note.created_at as string,
    })
  }

  // Sort desc, cap at 8
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return {
    activities: activities.slice(0, 8),
    document_count: docCountResult.count ?? 0,
    concepts_reviewed_today: (conceptsResult.data ?? []).length,
  }
}
