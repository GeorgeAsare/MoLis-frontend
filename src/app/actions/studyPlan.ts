'use server'

import { getStudentIntelligence } from '@/app/actions/studentIntelligence'
import type { ConceptIntelligence } from '@/types/studentIntelligence'
import type { BlockType, LinkedAction, StudyBlock, StudyPlan } from '@/types/studyPlan'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BLOCKS = 5
const MAX_MINUTES = 45

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityScore(c: ConceptIntelligence): number {
  const urgencyPts =
    c.review_urgency === 'immediate' ? 40 :
    c.review_urgency === 'soon' ? 25 :
    c.review_urgency === 'scheduled' ? 10 : 0
  const examPts = c.exam_priority * 0.3
  const depPts = Math.min(c.dependency_risk * 5, 20)
  const gapPts = (100 - c.mastery_score) * 0.1
  return Math.round(urgencyPts + examPts + depPts + gapPts)
}

function classifyBlock(c: ConceptIntelligence): {
  block_type: BlockType
  linked_action: LinkedAction
  target_mastery_gain: number
} {
  if (c.review_urgency === 'immediate') {
    return { block_type: 'review', linked_action: 'flashcards', target_mastery_gain: 5 }
  }
  if (c.review_count === 0 || c.mastery_score < 30) {
    return { block_type: 'relearn', linked_action: 'notes', target_mastery_gain: 20 }
  }
  if (c.mastery_score < 60) {
    return { block_type: 'flashcards', linked_action: 'flashcards', target_mastery_gain: 15 }
  }
  if (c.mastery_score < 80) {
    return { block_type: 'quiz', linked_action: 'quiz', target_mastery_gain: 10 }
  }
  return { block_type: 'mixed', linked_action: 'quiz', target_mastery_gain: 8 }
}

function estimateMinutes(c: ConceptIntelligence, block_type: BlockType): number {
  const base = c.importance === 'core' ? 10 : c.importance === 'supporting' ? 7 : 5
  const diffMult = c.difficulty === 'hard' ? 1.3 : c.difficulty === 'easy' ? 0.8 : 1.0
  if (block_type === 'review') {
    return Math.min(5, Math.max(2, Math.round(base * 0.4 * diffMult)))
  }
  if (block_type === 'relearn') {
    return Math.min(12, Math.max(5, Math.round(base * diffMult)))
  }
  const gap = c.review_count === 0 ? 1.0 : (100 - c.mastery_score) / 100
  return Math.min(12, Math.max(3, Math.round(base * gap * diffMult)))
}

function buildReason(c: ConceptIntelligence): string {
  const parts: string[] = []
  if (c.review_urgency === 'immediate') parts.push('Overdue — at risk of forgetting')
  else if (c.review_urgency === 'soon') parts.push('Review due soon')
  if (c.dependency_risk > 0) {
    parts.push(`${c.dependency_risk} concept${c.dependency_risk > 1 ? 's' : ''} depend on this`)
  }
  if (c.exam_importance === 'high') parts.push('High exam importance')
  else if (c.exam_importance === 'medium') parts.push('Medium exam importance')
  if (c.review_count === 0) parts.push('Not yet started')
  else if (c.mastery_score < 30) parts.push('Very low mastery')
  return parts.length > 0 ? parts.join(' · ') : 'Included in study plan'
}

function buildWhyThisPlan(
  urgent_reviews: string[],
  blocked_concepts: string[],
  quick_wins: string[],
  focus_count: number,
): string {
  if (urgent_reviews.length > 0) {
    const u = urgent_reviews.length
    return `${u} concept${u > 1 ? 's are' : ' is'} overdue and at risk of being forgotten. Prioritising these now will protect your existing mastery.`
  }
  if (blocked_concepts.length > 0) {
    const b = blocked_concepts.length
    return `Resolving ${b === 1 ? 'a prerequisite gap' : `${b} prerequisite gaps`} will unlock dependent concepts and accelerate your overall progress.`
  }
  if (quick_wins.length >= 2) {
    return `${quick_wins.length} high-value concepts are within reach. A focused session here could meaningfully improve your exam readiness.`
  }
  if (focus_count > 0) {
    return `This session targets your ${focus_count} highest-priority topics based on exam importance and mastery gaps.`
  }
  return 'Start building your foundation — begin with the core concepts to unlock the rest of the material.'
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function getStudyPlan(documentId: string): Promise<StudyPlan> {
  const intelligence = await getStudentIntelligence(documentId)
  const { concepts } = intelligence

  const generated_at = new Date().toISOString()

  const empty: StudyPlan = {
    document_id: documentId,
    generated_at,
    overall_exam_readiness: intelligence.overall_exam_readiness,
    estimated_session_minutes: 0,
    focus_concepts: [],
    study_blocks: [],
    why_this_plan: 'Analyse a document to generate your study plan.',
    expected_improvement: 0,
    blocked_concepts: [],
    quick_wins: [],
    urgent_reviews: [],
    recommended_next_action: 'Upload and analyse a document to get started.',
  }

  if (concepts.length === 0) return empty

  // ── Derived lists ──────────────────────────────────────────────────────────

  const masteryById = new Map(concepts.map(c => [c.concept_id, c.mastery_score]))

  const urgent_reviews = concepts
    .filter(c => c.review_urgency === 'immediate')
    .map(c => c.concept_id)

  const quick_wins = concepts
    .filter(c => c.mastery_score >= 40 && c.mastery_score <= 70 && c.exam_priority >= 40)
    .sort((a, b) => b.exam_priority - a.exam_priority)
    .map(c => c.concept_id)

  const blocked_concepts = concepts
    .filter(c => c.prerequisites.some(pid => (masteryById.get(pid) ?? 0) < 40))
    .map(c => c.concept_id)

  // ── Score and select study blocks ──────────────────────────────────────────

  const scored = concepts
    .map(c => ({ c, score: priorityScore(c) }))
    .sort((a, b) => b.score - a.score)

  const selected: Array<{ c: ConceptIntelligence; mins: number; score: number }> = []
  let totalMinutes = 0

  for (const { c, score } of scored) {
    if (selected.length >= MAX_BLOCKS) break
    const { block_type } = classifyBlock(c)
    const mins = estimateMinutes(c, block_type)
    // After the first two blocks, skip any that would push past the session cap
    if (totalMinutes + mins > MAX_MINUTES && selected.length >= 2) continue
    selected.push({ c, mins, score })
    totalMinutes += mins
  }

  // ── Build study blocks ─────────────────────────────────────────────────────

  const study_blocks: StudyBlock[] = selected.map(({ c, mins, score }) => {
    const { block_type, linked_action, target_mastery_gain } = classifyBlock(c)
    return {
      concept_id: c.concept_id,
      concept_title: c.concept_title,
      block_type,
      reason: buildReason(c),
      estimated_minutes: mins,
      priority_score: score,
      target_mastery_gain,
      linked_action,
    }
  })

  const estimated_session_minutes = study_blocks.reduce((s, b) => s + b.estimated_minutes, 0)
  const focus_concepts = study_blocks.slice(0, 3).map(b => b.concept_id)

  // ── Expected improvement ───────────────────────────────────────────────────

  const totalExamTopics = concepts.filter(c => c.is_exam_topic).length
  const examBlocks = study_blocks.filter(b =>
    concepts.find(c => c.concept_id === b.concept_id)?.is_exam_topic,
  )

  let expected_improvement: number
  if (examBlocks.length > 0 && totalExamTopics > 0) {
    const avgGain =
      examBlocks.reduce((s, b) => s + b.target_mastery_gain, 0) / examBlocks.length
    expected_improvement = Math.max(1, Math.round(avgGain * (examBlocks.length / totalExamTopics)))
  } else {
    const avgGain =
      study_blocks.reduce((s, b) => s + b.target_mastery_gain, 0) /
      Math.max(1, study_blocks.length)
    expected_improvement = Math.max(
      1,
      Math.round(avgGain * (study_blocks.length / Math.max(1, concepts.length))),
    )
  }

  // ── Text fields ────────────────────────────────────────────────────────────

  const why_this_plan = buildWhyThisPlan(
    urgent_reviews,
    blocked_concepts,
    quick_wins,
    focus_concepts.length,
  )

  const actionLabel: Record<LinkedAction, string> = {
    notes: 'Review your notes',
    flashcards: 'Open flashcards',
    quiz: 'Take a quiz',
    tutor: 'Ask the AI tutor',
  }
  const first = study_blocks[0]
  const recommended_next_action = first
    ? `${actionLabel[first.linked_action]} on "${first.concept_title}" to begin your session.`
    : 'Upload and analyse a document to get started.'

  return {
    document_id: documentId,
    generated_at,
    overall_exam_readiness: intelligence.overall_exam_readiness,
    estimated_session_minutes,
    focus_concepts,
    study_blocks,
    why_this_plan,
    expected_improvement,
    blocked_concepts,
    quick_wins,
    urgent_reviews,
    recommended_next_action,
  }
}
