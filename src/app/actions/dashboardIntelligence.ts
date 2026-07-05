'use server'

import { createClient } from '@/lib/supabase/server'
import type { CardStatus } from '@/types/flashcardProgress'
import type { DigestActivity, DigestActivityType } from '@/types/studyDigest'
import type { ForgettingRisk } from '@/types/conceptMastery'
import type {
  DashboardIntelligence,
  WeakConceptItem,
  WeakReason,
  RecommendedNextAction,
  DigestData,
} from '@/types/dashboardIntelligence'

// ── Raw row shapes returned from Supabase queries ─────────────────────────────

interface RawWeakConcept {
  concept_id: string
  concept_title: string
  document_id: string
  mastery_score: number
  forgetting_risk: string
  incorrect_count: number
  review_count: number
  next_review_at: string | null
}

interface RawQuizAttempt {
  document_id: string
  phase: string
  score_correct: number | null
  score_total: number | null
  updated_at: string
}

interface RawFlashcardProgress {
  document_id: string
  phase: string
  card_statuses: CardStatus[]
  updated_at: string
}

interface RawTutorMessage {
  document_id: string
  created_at: string
}

interface RawNote {
  document_id: string
  created_at: string
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function buildActivities(
  quizRows: RawQuizAttempt[],
  fcRows: RawFlashcardProgress[],
  tutorRows: RawTutorMessage[],
  noteRows: RawNote[],
  titleMap: Map<string, string>,
): DigestActivity[] {
  const activities: DigestActivity[] = []

  for (const qa of quizRows) {
    const completed = qa.phase === 'review'
    activities.push({
      type: (completed ? 'quiz_completed' : 'quiz_in_progress') as DigestActivityType,
      document_id: qa.document_id,
      document_title: titleMap.get(qa.document_id) ?? 'Untitled document',
      detail: completed && qa.score_correct != null
        ? `Scored ${qa.score_correct}/${qa.score_total}`
        : 'Quiz in progress',
      href: `/dashboard/study/${qa.document_id}?tab=quiz`,
      timestamp: qa.updated_at,
    })
  }

  for (const fp of fcRows) {
    const statuses = (fp.card_statuses ?? []) as CardStatus[]
    const known = statuses.filter(s => s === 'known').length
    const total = statuses.length
    const completed = fp.phase === 'done'
    activities.push({
      type: (completed ? 'flashcards_completed' : 'flashcards_in_progress') as DigestActivityType,
      document_id: fp.document_id,
      document_title: titleMap.get(fp.document_id) ?? 'Untitled document',
      detail: completed
        ? `Completed · ${known}/${total} known`
        : `${known}/${total} known so far`,
      href: `/dashboard/study/${fp.document_id}?tab=flashcards`,
      timestamp: fp.updated_at,
    })
  }

  const tutorByDoc = new Map<string, { count: number; latest: string }>()
  for (const tm of tutorRows) {
    const entry = tutorByDoc.get(tm.document_id)
    if (entry) { entry.count++ } else {
      tutorByDoc.set(tm.document_id, { count: 1, latest: tm.created_at })
    }
  }
  for (const [docId, info] of tutorByDoc) {
    activities.push({
      type: 'tutor_session' as DigestActivityType,
      document_id: docId,
      document_title: titleMap.get(docId) ?? 'Untitled document',
      detail: `${info.count} question${info.count !== 1 ? 's' : ''} asked`,
      href: `/dashboard/study/${docId}?tab=tutor`,
      timestamp: info.latest,
    })
  }

  for (const note of noteRows) {
    activities.push({
      type: 'notes_generated' as DigestActivityType,
      document_id: note.document_id,
      document_title: titleMap.get(note.document_id) ?? 'Untitled document',
      detail: 'Revision notes generated',
      href: `/dashboard/study/${note.document_id}?tab=notes`,
      timestamp: note.created_at,
    })
  }

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return activities.slice(0, 8)
}

function computeWeakConceptItems(
  rows: RawWeakConcept[],
  titleMap: Map<string, string>,
): WeakConceptItem[] {
  return rows.slice(0, 5).map(c => {
    const hasForgetting = c.forgetting_risk === 'high' || c.forgetting_risk === 'medium'
    const reason: WeakReason =
      c.mastery_score < 50 ? 'low_mastery'
      : hasForgetting ? 'forgetting_risk'
      : 'recent_mistakes'
    return {
      concept_id: c.concept_id,
      concept_title: c.concept_title,
      document_id: c.document_id,
      document_title: titleMap.get(c.document_id) ?? 'Unknown document',
      mastery_score: c.mastery_score,
      forgetting_risk: c.forgetting_risk as ForgettingRisk,
      incorrect_count: c.incorrect_count,
      review_count: c.review_count,
      next_review_at: c.next_review_at,
      reason,
      href: `/dashboard/study/${c.document_id}?tab=weak-topics`,
    }
  })
}

function computeRecommendedNextAction(
  weakRows: RawWeakConcept[],
  titleMap: Map<string, string>,
): RecommendedNextAction | null {
  if (weakRows.length === 0) return null

  const now = Date.now()

  // Score each concept by urgency
  const scored = weakRows.map(c => {
    const overdue = c.next_review_at && new Date(c.next_review_at).getTime() < now ? 50 : 0
    const forgettingPts = c.forgetting_risk === 'high' ? 30 : c.forgetting_risk === 'medium' ? 15 : 0
    const masteryPts = Math.max(0, 50 - c.mastery_score)
    const mistakePts = Math.min(c.incorrect_count * 5, 20)
    return { ...c, priority: overdue + forgettingPts + masteryPts + mistakePts }
  }).sort((a, b) => b.priority - a.priority)

  const top = scored[0]
  const docTitle = titleMap.get(top.document_id) ?? 'Unknown document'

  const parts: string[] = []
  if (top.mastery_score < 30) parts.push(`Low mastery (${top.mastery_score}%)`)
  else if (top.mastery_score < 50) parts.push(`Needs work (${top.mastery_score}%)`)
  if (top.forgetting_risk === 'high' || top.forgetting_risk === 'medium') parts.push('Forgetting risk')
  if (top.incorrect_count > 0)
    parts.push(`${top.incorrect_count} incorrect answer${top.incorrect_count !== 1 ? 's' : ''}`)
  if (top.next_review_at && new Date(top.next_review_at).getTime() < now)
    parts.push('Overdue for review')
  const reason = parts.join(' · ') || 'Needs attention'

  const tab =
    top.review_count === 0 ? 'notes'
    : top.mastery_score < 40 ? 'flashcards'
    : 'quiz'
  const action_label =
    tab === 'notes' ? 'Start with Notes'
    : tab === 'flashcards' ? 'Open Flashcards'
    : 'Take Quiz'

  return {
    concept_title: top.concept_title,
    document_title: docTitle,
    document_id: top.document_id,
    reason,
    action_label,
    tab,
  }
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function getDashboardIntelligence(): Promise<DashboardIntelligence | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()
  const nowIso = now.toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()

  const [
    docCountResult,
    weakConceptsResult,
    reviewsDueResult,
    totalConceptsResult,
    masteredResult,
    conceptsReviewedTodayResult,
    quizTodayResult,
    flashcardTodayResult,
    tutorTodayResult,
    notesTodayResult,
  ] = await Promise.all([
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('concept_mastery')
      .select('concept_id, concept_title, document_id, mastery_score, forgetting_risk, incorrect_count, review_count, next_review_at')
      .eq('user_id', user.id)
      .or('mastery_score.lt.50,forgetting_risk.eq.medium,forgetting_risk.eq.high,incorrect_count.gt.0')
      .order('mastery_score', { ascending: true })
      .limit(20),
    supabase
      .from('concept_mastery')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('review_count', 0)
      .lte('next_review_at', nowIso),
    supabase
      .from('concept_mastery')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('concept_mastery')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('mastery_score', 70),
    supabase
      .from('concept_mastery')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('last_reviewed_at', todayIso),
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

  // Batch-fetch document titles from all referenced IDs
  const docIdSet = new Set<string>()
  for (const c of weakConceptsResult.data ?? []) docIdSet.add(c.document_id)
  for (const q of quizTodayResult.data ?? []) docIdSet.add(q.document_id)
  for (const f of flashcardTodayResult.data ?? []) docIdSet.add(f.document_id)
  for (const t of tutorTodayResult.data ?? []) docIdSet.add(t.document_id)
  for (const n of notesTodayResult.data ?? []) docIdSet.add(n.document_id)

  const titleMap = new Map<string, string>()
  const docIds = [...docIdSet]
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title')
      .in('id', docIds)
      .eq('user_id', user.id)
    for (const d of docs ?? []) titleMap.set(d.id as string, d.title as string)
  }

  // Build today's digest activities
  const todayActivities = buildActivities(
    (quizTodayResult.data ?? []) as RawQuizAttempt[],
    (flashcardTodayResult.data ?? []) as RawFlashcardProgress[],
    (tutorTodayResult.data ?? []) as RawTutorMessage[],
    (notesTodayResult.data ?? []) as RawNote[],
    titleMap,
  )

  // 7-day fallback when today has no activity
  let digestActivities = todayActivities
  let isFallback = false

  if (digestActivities.length === 0) {
    const [quizFallback, fcFallback, tutorFallback, notesFallback] = await Promise.all([
      supabase
        .from('quiz_attempts')
        .select('document_id, phase, score_correct, score_total, updated_at')
        .eq('user_id', user.id)
        .gte('updated_at', sevenDaysAgo)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('flashcard_progress')
        .select('document_id, phase, card_statuses, updated_at')
        .eq('user_id', user.id)
        .gte('updated_at', sevenDaysAgo)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('tutor_messages')
        .select('document_id, created_at')
        .eq('user_id', user.id)
        .eq('role', 'user')
        .gte('created_at', sevenDaysAgo)
        .limit(50),
      supabase
        .from('revision_notes')
        .select('document_id, created_at')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo)
        .limit(10),
    ])

    // Add any new doc IDs from fallback
    const fallbackIds = new Set<string>()
    for (const r of [
      ...(quizFallback.data ?? []),
      ...(fcFallback.data ?? []),
      ...(tutorFallback.data ?? []),
      ...(notesFallback.data ?? []),
    ]) {
      if (!titleMap.has(r.document_id)) fallbackIds.add(r.document_id)
    }
    if (fallbackIds.size > 0) {
      const { data: fallbackDocs } = await supabase
        .from('documents')
        .select('id, title')
        .in('id', [...fallbackIds])
        .eq('user_id', user.id)
      for (const d of fallbackDocs ?? []) titleMap.set(d.id as string, d.title as string)
    }

    const fallbackActivities = buildActivities(
      (quizFallback.data ?? []) as RawQuizAttempt[],
      (fcFallback.data ?? []) as RawFlashcardProgress[],
      (tutorFallback.data ?? []) as RawTutorMessage[],
      (notesFallback.data ?? []) as RawNote[],
      titleMap,
    )

    if (fallbackActivities.length > 0) {
      digestActivities = fallbackActivities
      isFallback = true
    }
  }

  const weakConceptRows = (weakConceptsResult.data ?? []) as RawWeakConcept[]
  const totalTracked = totalConceptsResult.count ?? 0
  const masteredCount = masteredResult.count ?? 0
  const overallReadiness = totalTracked > 0 ? Math.round((masteredCount / totalTracked) * 100) : 0

  const digest: DigestData = {
    activities: digestActivities,
    is_fallback: isFallback,
    concepts_reviewed_today: conceptsReviewedTodayResult.count ?? 0,
  }

  return {
    total_documents: docCountResult.count ?? 0,
    total_concepts_tracked: totalTracked,
    weak_concepts_count: weakConceptRows.length,
    reviews_due_count: reviewsDueResult.count ?? 0,
    top_weak_concepts: computeWeakConceptItems(weakConceptRows, titleMap),
    recommended_next_action: computeRecommendedNextAction(weakConceptRows, titleMap),
    overall_readiness_estimate: overallReadiness,
    digest,
  }
}
