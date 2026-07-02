'use server'

import { createClient } from '@/lib/supabase/server'
import type { ConceptGraph, LearningPathData } from '@/types/documentAnalysis'
import type { ConceptMastery, ForgettingRisk, MistakePattern } from '@/types/conceptMastery'
import type {
  ConceptIntelligence,
  DocumentIntelligence,
  ReviewUrgency,
  CognitiveLoad,
} from '@/types/studentIntelligence'

// ── Pure computation helpers ───────────────────────────────────────────────────

function computeRetentionScore(
  mastery_score: number,
  last_reviewed_at: string | null,
  next_review_at: string | null,
  forgetting_risk: ForgettingRisk,
): number {
  if (!last_reviewed_at || mastery_score === 0) return 0
  const now = Date.now()
  const nextReview = next_review_at ? new Date(next_review_at).getTime() : null
  // Not yet due — full retention
  if (!nextReview || now <= nextReview) return mastery_score
  // Exponential decay proportional to days past due
  const daysPastDue = (now - nextReview) / 86_400_000
  const rate = forgetting_risk === 'high' ? 0.15 : forgetting_risk === 'medium' ? 0.08 : 0.03
  return Math.max(0, Math.round(mastery_score * Math.exp(-rate * daysPastDue)))
}

function computeLearningVelocity(correct_count: number, review_count: number): number {
  if (review_count === 0) return 0
  // Accuracy rate as a proxy for how quickly the student gains mastery (0.0–1.0)
  return Math.round((correct_count / review_count) * 100) / 100
}

function computeExamPriority(
  mastery_score: number,
  exam_importance: 'high' | 'medium' | 'low' | null,
  is_exam_topic: boolean,
): number {
  if (!is_exam_topic && exam_importance === null) return 0
  const w = exam_importance === 'high' ? 1.0 : exam_importance === 'medium' ? 0.67 : 0.33
  return Math.round(w * (100 - mastery_score))
}

function computeCognitiveLoad(
  prerequisites: string[],
  difficulty: 'easy' | 'medium' | 'hard' | null,
): CognitiveLoad {
  const d = difficulty === 'hard' ? 2 : difficulty === 'medium' ? 1 : 0
  const p = prerequisites.length >= 3 ? 2 : prerequisites.length >= 1 ? 1 : 0
  const total = d + p
  return total >= 3 ? 'high' : total >= 1 ? 'medium' : 'low'
}

function computeReviewUrgency(
  mastery_score: number,
  next_review_at: string | null,
  forgetting_risk: ForgettingRisk,
  review_count: number,
): ReviewUrgency {
  if (review_count === 0 || mastery_score >= 90 || !next_review_at) return 'none'
  const now = Date.now()
  const hoursUntilDue = (new Date(next_review_at).getTime() - now) / 3_600_000
  if (hoursUntilDue <= 0) {
    return forgetting_risk === 'high' || mastery_score < 40 ? 'immediate' : 'soon'
  }
  return hoursUntilDue <= 24 ? 'soon' : 'scheduled'
}

function computeRecommendedAction(
  mastery_score: number,
  review_count: number,
  forgetting_risk: ForgettingRisk,
  dependency_risk: number,
  exam_priority: number,
  review_urgency: ReviewUrgency,
): string {
  if (review_count === 0) return 'Start learning this concept'
  if (mastery_score >= 80) {
    return review_urgency === 'immediate' || review_urgency === 'soon'
      ? 'Quick review to consolidate'
      : 'Maintain — review when scheduled'
  }
  if (review_urgency === 'immediate') return 'Review now — high risk of forgetting'
  if (mastery_score < 30) {
    return dependency_risk > 2
      ? 'Prioritise — other concepts depend on this'
      : 'Relearn from the beginning'
  }
  if (exam_priority >= 60) return 'Focus here — high exam importance'
  if (forgetting_risk === 'high') return 'Review soon to prevent forgetting'
  return 'Continue practising'
}

function computeErrorPatternSummary(mistake_patterns: MistakePattern[]): string | null {
  if (mistake_patterns.length === 0) return null
  const counts = new Map<string, number>()
  for (const mp of mistake_patterns) {
    if (!mp.wrong_answer) continue
    const key = mp.wrong_answer.slice(0, 60)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let topAnswer = ''
  let topCount = 0
  for (const [answer, count] of counts) {
    if (count > topCount) { topAnswer = answer; topCount = count }
  }
  if (topCount >= 2) return `Repeatedly chose "${topAnswer}" (${topCount}×)`
  return `Missed ${mistake_patterns.length} time${mistake_patterns.length !== 1 ? 's' : ''}`
}

function computePredictedMastery7Days(
  mastery_score: number,
  learning_velocity: number,
  next_review_at: string | null,
  forgetting_risk: ForgettingRisk,
  review_count: number,
): number {
  if (review_count === 0) return 0
  const reviewDueInWeek =
    next_review_at &&
    new Date(next_review_at).getTime() - Date.now() <= 7 * 86_400_000
  if (!reviewDueInWeek) {
    // No review scheduled — apply forgetting decay over 7 days
    const decay = forgetting_risk === 'high' ? 0.15 : forgetting_risk === 'medium' ? 0.08 : 0.02
    return Math.max(0, Math.round(mastery_score * (1 - decay * 7)))
  }
  // One review due: predict mastery gain proportional to velocity (up to +20 points)
  return Math.min(100, mastery_score + Math.round(learning_velocity * 20))
}

function computePredictedExamReadiness(
  predicted_mastery_7_days: number,
  exam_importance: 'high' | 'medium' | 'low' | null,
): number {
  const w = exam_importance === 'high' ? 1.0 : exam_importance === 'medium' ? 0.8 : 0.5
  return Math.round(predicted_mastery_7_days * w)
}

function computeOverallExamReadiness(concepts: ConceptIntelligence[]): number {
  const weights = { high: 3, medium: 2, low: 1 } as const
  const pool = concepts.filter(c => c.is_exam_topic || c.exam_importance !== null)
  const source = pool.length > 0 ? pool : concepts.filter(c => c.importance === 'core')
  if (source.length === 0) return 0
  let totalWeight = 0
  let weightedSum = 0
  for (const c of source) {
    const w = c.exam_importance ? weights[c.exam_importance] : 1
    totalWeight += w
    weightedSum += c.mastery_score * w
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}

function computeRecommendedStudyOrder(concepts: ConceptIntelligence[]): string[] {
  const urgencyRank: Record<ReviewUrgency, number> = {
    immediate: 0,
    soon: 1,
    scheduled: 3,
    none: 4,
  }
  return [...concepts]
    .sort((a, b) => {
      // Unstarted core/supporting → priority 2 (after 'soon', before 'scheduled')
      const aRank =
        a.review_count === 0 && (a.importance === 'core' || a.importance === 'supporting')
          ? 2
          : urgencyRank[a.review_urgency]
      const bRank =
        b.review_count === 0 && (b.importance === 'core' || b.importance === 'supporting')
          ? 2
          : urgencyRank[b.review_urgency]
      if (aRank !== bRank) return aRank - bRank
      if (b.exam_priority !== a.exam_priority) return b.exam_priority - a.exam_priority
      if (b.dependency_risk !== a.dependency_risk) return b.dependency_risk - a.dependency_risk
      return a.mastery_score - b.mastery_score
    })
    .map(c => c.concept_id)
}

function computeEstimatedMinutes(
  concepts: ConceptIntelligence[],
  learningPath: LearningPathData | null,
): number {
  const needsWork = concepts.filter(c => c.mastery_score < 70)
  if (needsWork.length === 0) return 0
  return needsWork.reduce((sum, c) => {
    const step = learningPath?.steps.find(s => s.concept_id === c.concept_id)
    const base = step?.estimated_minutes ?? 8
    const gap = (70 - c.mastery_score) / 70
    return sum + Math.max(1, Math.round(base * gap))
  }, 0)
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function getStudentIntelligence(
  documentId: string,
): Promise<DocumentIntelligence> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const [masteryResult, analysisResult] = await Promise.all([
    supabase
      .from('concept_mastery')
      .select('*')
      .eq('document_id', documentId)
      .eq('user_id', user.id),
    supabase
      .from('document_analysis')
      .select('concept_graph, learning_path')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const masteryRows = (masteryResult.data ?? []) as ConceptMastery[]
  const graph = (analysisResult.data?.concept_graph ?? null) as ConceptGraph | null
  const learningPath = (analysisResult.data?.learning_path ?? null) as LearningPathData | null

  const empty: DocumentIntelligence = {
    document_id: documentId,
    concepts: [],
    overall_exam_readiness: 0,
    recommended_study_order: [],
    mastered_count: 0,
    weak_count: 0,
    unstarted_count: 0,
    estimated_minutes_to_exam_ready: 0,
  }

  if (!graph?.nodes?.length) return empty

  const masteryById = new Map(masteryRows.map(m => [m.concept_id, m]))

  // Build prerequisite/unlock maps from dependency-type edges
  const prereqsOf = new Map<string, string[]>()
  const unlocksOf = new Map<string, string[]>()
  for (const node of graph.nodes) {
    prereqsOf.set(node.id, [])
    unlocksOf.set(node.id, [])
  }
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  const depTypes = new Set(['depends_on', 'prerequisite'])
  for (const edge of edges) {
    if (depTypes.has(edge.type)) {
      // edge.from depends on edge.to → edge.to is a prerequisite for edge.from
      prereqsOf.get(edge.from)?.push(edge.to)
      // edge.from is unlocked by edge.to → edge.to unlocks edge.from
      unlocksOf.get(edge.to)?.push(edge.from)
    }
  }

  const concepts: ConceptIntelligence[] = graph.nodes.map(node => {
    const m = masteryById.get(node.id)

    const mastery_score = m?.mastery_score ?? 0
    const confidence_score = m?.confidence_score ?? 0
    const forgetting_risk: ForgettingRisk = m?.forgetting_risk ?? 'low'
    const review_count = m?.review_count ?? 0
    const correct_count = m?.correct_count ?? 0
    const incorrect_count = m?.incorrect_count ?? 0
    const last_reviewed_at = m?.last_reviewed_at ?? null
    const next_review_at = m?.next_review_at ?? null
    const mistake_patterns = (m?.mistake_patterns ?? []) as MistakePattern[]

    const prerequisites = prereqsOf.get(node.id) ?? []
    const unlocks = unlocksOf.get(node.id) ?? []
    const dependency_risk = unlocks.length

    const retention_score = computeRetentionScore(
      mastery_score, last_reviewed_at, next_review_at, forgetting_risk,
    )
    const learning_velocity = computeLearningVelocity(correct_count, review_count)
    const exam_priority = computeExamPriority(mastery_score, node.exam_importance, node.is_exam_topic)
    const cognitive_load = computeCognitiveLoad(prerequisites, node.difficulty)
    const review_urgency = computeReviewUrgency(
      mastery_score, next_review_at, forgetting_risk, review_count,
    )
    const recommended_action = computeRecommendedAction(
      mastery_score, review_count, forgetting_risk, dependency_risk, exam_priority, review_urgency,
    )
    const error_pattern_summary = computeErrorPatternSummary(mistake_patterns)
    const predicted_mastery_7_days = computePredictedMastery7Days(
      mastery_score, learning_velocity, next_review_at, forgetting_risk, review_count,
    )
    const predicted_exam_readiness = computePredictedExamReadiness(
      predicted_mastery_7_days, node.exam_importance,
    )

    return {
      concept_id: node.id,
      concept_title: node.label,
      mastery_score,
      confidence_score,
      forgetting_risk,
      review_count,
      correct_count,
      incorrect_count,
      last_reviewed_at,
      next_review_at,
      mistake_patterns,
      is_exam_topic: node.is_exam_topic,
      exam_importance: node.exam_importance,
      importance: node.importance,
      section: node.section,
      difficulty: node.difficulty,
      prerequisites,
      unlocks,
      retention_score,
      learning_velocity,
      dependency_risk,
      exam_priority,
      cognitive_load,
      review_urgency,
      recommended_action,
      error_pattern_summary,
      predicted_mastery_7_days,
      predicted_exam_readiness,
    }
  })

  return {
    document_id: documentId,
    concepts,
    overall_exam_readiness: computeOverallExamReadiness(concepts),
    recommended_study_order: computeRecommendedStudyOrder(concepts),
    mastered_count: concepts.filter(c => c.mastery_score >= 70).length,
    weak_count: concepts.filter(c => c.review_count > 0 && c.mastery_score < 50).length,
    unstarted_count: concepts.filter(c => c.review_count === 0).length,
    estimated_minutes_to_exam_ready: computeEstimatedMinutes(concepts, learningPath),
  }
}
