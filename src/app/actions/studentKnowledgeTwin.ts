'use server'

import { createClient } from '@/lib/supabase/server'
import type { ForgettingRisk } from '@/types/conceptMastery'
import type {
  StudentKnowledgeTwin,
  GlobalConceptInsight,
  LearningPattern,
  KnowledgeTwinRecommendation,
  ForgettingRiskSummary,
} from '@/types/studentKnowledgeTwin'

// ── Raw row shapes ─────────────────────────────────────────────────────────────

interface RawMasteryRow {
  concept_id: string
  concept_title: string
  document_id: string
  mastery_score: number
  confidence_score: number
  forgetting_risk: string
  review_count: number
  correct_count: number
  incorrect_count: number
  next_review_at: string | null
}

interface RawTutorMsg {
  document_id: string
  mode: string | null
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

function buildRecurringWeakPatterns(weak: RawMasteryRow[]): LearningPattern[] {
  return weak
    .filter(r => r.incorrect_count > 0)
    .sort((a, b) => b.incorrect_count - a.incorrect_count)
    .slice(0, 5)
    .map(r => ({ pattern: r.concept_title, frequency: r.incorrect_count }))
}

function computeLearningVelocitySummary(rows: RawMasteryRow[]): string | null {
  const reviewed = rows.filter(r => r.review_count > 0)
  const totalAttempts = reviewed.reduce((s, r) => s + r.review_count, 0)
  if (totalAttempts < 5) return null
  const totalCorrect = reviewed.reduce((s, r) => s + r.correct_count, 0)
  const accuracy = totalCorrect / totalAttempts
  if (accuracy >= 0.75) return 'Strong — high accuracy across reviews'
  if (accuracy >= 0.55) return 'Developing — consistency is building'
  if (accuracy >= 0.40) return 'Needs reinforcement — more practice will help'
  return 'Struggling — focus on weak topics first'
}

function computePreferredStudyMode(tutorRows: RawTutorMsg[]): string | null {
  const counts = new Map<string, number>()
  for (const r of tutorRows) {
    if (!r.mode) continue
    counts.set(r.mode, (counts.get(r.mode) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let topMode = ''
  let topCount = 0
  for (const [m, count] of counts) {
    if (count > topCount) { topMode = m; topCount = count }
  }
  const labels: Record<string, string> = {
    explain: 'Explain',
    simplify: 'Simplify',
    exam_prep: 'Exam Prep',
    weak_topic: 'Weak Topic',
    next_step: 'Next Step',
    quiz_help: 'Quiz Help',
  }
  return labels[topMode] ?? topMode
}

function computeRecommendedFocus(
  weak: RawMasteryRow[],
  nowIso: string,
  titleMap: Map<string, string>,
): KnowledgeTwinRecommendation | null {
  if (weak.length === 0) return null
  const scored = weak.map(r => {
    const overdue = r.next_review_at && r.next_review_at <= nowIso ? 40 : 0
    const forgettingPts = r.forgetting_risk === 'high' ? 30 : r.forgetting_risk === 'medium' ? 15 : 0
    const masteryPts = Math.max(0, 50 - r.mastery_score)
    const mistakePts = Math.min(r.incorrect_count * 5, 20)
    return { ...r, priority: overdue + forgettingPts + masteryPts + mistakePts }
  }).sort((a, b) => b.priority - a.priority)

  const top = scored[0]
  const docTitle = titleMap.get(top.document_id) ?? 'Unknown document'

  const parts: string[] = [`${top.mastery_score}% mastery`]
  if (top.forgetting_risk === 'high') parts.push('high forgetting risk')
  else if (top.forgetting_risk === 'medium') parts.push('forgetting risk')
  if (top.next_review_at && top.next_review_at <= nowIso) parts.push('overdue for review')

  return {
    focus_area: top.concept_title,
    rationale: parts.join(' · '),
    document_id: top.document_id,
    document_title: docTitle,
    href: `/dashboard/study/${top.document_id}?tab=weak-topics`,
  }
}

function computeRecommendedNextDoc(
  rows: RawMasteryRow[],
  titleMap: Map<string, string>,
): StudentKnowledgeTwin['recommended_next_document'] | null {
  const docStats = new Map<string, { weakCount: number; totalReviews: number; incorrectCount: number }>()
  for (const r of rows) {
    const entry = docStats.get(r.document_id) ?? { weakCount: 0, totalReviews: 0, incorrectCount: 0 }
    if (r.review_count > 0 && r.mastery_score < 50) entry.weakCount++
    entry.totalReviews += r.review_count
    entry.incorrectCount += r.incorrect_count
    docStats.set(r.document_id, entry)
  }
  const active = [...docStats.entries()]
    .filter(([, s]) => s.totalReviews > 0 && s.weakCount > 0)
    .sort((a, b) =>
      b[1].weakCount !== a[1].weakCount
        ? b[1].weakCount - a[1].weakCount
        : b[1].incorrectCount - a[1].incorrectCount,
    )
  if (active.length === 0) return null
  const [docId, stats] = active[0]
  return {
    document_id: docId,
    document_title: titleMap.get(docId) ?? 'Unknown document',
    reason: `${stats.weakCount} weak concept${stats.weakCount !== 1 ? 's' : ''} need attention`,
    href: `/dashboard/study/${docId}?tab=weak-topics`,
  }
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function getStudentKnowledgeTwin(): Promise<StudentKnowledgeTwin> {
  const empty: StudentKnowledgeTwin = {
    total_concepts_tracked: 0,
    mastered_concepts_count: 0,
    weak_concepts_count: 0,
    average_mastery_score: null,
    average_confidence_score: null,
    strongest_concepts: [],
    weakest_concepts: [],
    recurring_weak_patterns: [],
    concepts_due_for_review: 0,
    forgetting_risk_summary: { high: 0, medium: 0, low: 0 },
    learning_velocity_summary: null,
    preferred_study_mode: null,
    recommended_focus_area: null,
    recommended_next_document: null,
    overall_student_readiness: 0,
    has_enough_data: false,
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const nowIso = new Date().toISOString()

  // Two parallel queries — concept mastery (all columns needed) + tutor modes
  const [masteryResult, tutorResult] = await Promise.all([
    supabase
      .from('concept_mastery')
      .select('concept_id, concept_title, document_id, mastery_score, confidence_score, forgetting_risk, review_count, correct_count, incorrect_count, next_review_at')
      .eq('user_id', user.id),
    supabase
      .from('tutor_messages')
      .select('document_id, mode')
      .eq('user_id', user.id)
      .eq('role', 'user')
      .limit(200),
  ])

  const allMastery = (masteryResult.data ?? []) as RawMasteryRow[]
  if (allMastery.length === 0) return empty

  // Batch-fetch document titles from all referenced document IDs
  const docIds = [...new Set(allMastery.map(r => r.document_id))]
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title')
    .in('id', docIds)
    .eq('user_id', user.id)
  const titleMap = new Map<string, string>()
  for (const d of docs ?? []) titleMap.set(d.id as string, d.title as string)

  // Partition rows
  const reviewed = allMastery.filter(r => r.review_count > 0)
  const mastered = allMastery.filter(r => r.mastery_score >= 70)
  const weak = allMastery.filter(r => r.review_count > 0 && r.mastery_score < 50)
  const due = allMastery.filter(r => r.review_count > 0 && r.next_review_at !== null && r.next_review_at <= nowIso)

  if (reviewed.length === 0) return empty

  // Averages
  const avgMastery = Math.round(reviewed.reduce((s, r) => s + r.mastery_score, 0) / reviewed.length)
  const avgConfidence = Math.round(reviewed.reduce((s, r) => s + r.confidence_score, 0) / reviewed.length)

  // Forgetting risk breakdown
  const forgettingRisk: ForgettingRiskSummary = { high: 0, medium: 0, low: 0 }
  for (const r of reviewed) {
    const risk = r.forgetting_risk as ForgettingRisk
    if (risk === 'high' || risk === 'medium' || risk === 'low') forgettingRisk[risk]++
  }

  // Top 3 strongest (highest mastery, reviewed)
  const strongest: GlobalConceptInsight[] = [...reviewed]
    .sort((a, b) => b.mastery_score - a.mastery_score)
    .slice(0, 3)
    .map(r => ({
      concept_id: r.concept_id,
      concept_title: r.concept_title,
      document_id: r.document_id,
      document_title: titleMap.get(r.document_id) ?? 'Unknown document',
      mastery_score: r.mastery_score,
      forgetting_risk: r.forgetting_risk as ForgettingRisk,
    }))

  // Top 3 weakest (lowest mastery with most mistakes)
  const weakest: GlobalConceptInsight[] = [...weak]
    .sort((a, b) => a.mastery_score - b.mastery_score || b.incorrect_count - a.incorrect_count)
    .slice(0, 3)
    .map(r => ({
      concept_id: r.concept_id,
      concept_title: r.concept_title,
      document_id: r.document_id,
      document_title: titleMap.get(r.document_id) ?? 'Unknown document',
      mastery_score: r.mastery_score,
      forgetting_risk: r.forgetting_risk as ForgettingRisk,
    }))

  const tutorRows = (tutorResult.data ?? []) as RawTutorMsg[]
  const readiness = Math.round((mastered.length / allMastery.length) * 100)

  return {
    total_concepts_tracked: allMastery.length,
    mastered_concepts_count: mastered.length,
    weak_concepts_count: weak.length,
    average_mastery_score: avgMastery,
    average_confidence_score: avgConfidence,
    strongest_concepts: strongest,
    weakest_concepts: weakest,
    recurring_weak_patterns: buildRecurringWeakPatterns(weak),
    concepts_due_for_review: due.length,
    forgetting_risk_summary: forgettingRisk,
    learning_velocity_summary: computeLearningVelocitySummary(allMastery),
    preferred_study_mode: computePreferredStudyMode(tutorRows),
    recommended_focus_area: computeRecommendedFocus(weak, nowIso, titleMap),
    recommended_next_document: computeRecommendedNextDoc(allMastery, titleMap),
    overall_student_readiness: readiness,
    has_enough_data: reviewed.length >= 1,
  }
}
