import { describe, it, expect } from 'vitest'
import type { ConceptIntelligence } from '@/types/studentIntelligence'

// ── Pure helpers mirrored from studyPlan.ts ───────────────────────────────────

type BlockType = 'review' | 'relearn' | 'flashcards' | 'quiz' | 'mixed'

function priorityScore(c: Pick<ConceptIntelligence, 'review_urgency' | 'exam_priority' | 'dependency_risk' | 'mastery_score'>): number {
  const urgencyPts =
    c.review_urgency === 'immediate' ? 40 :
    c.review_urgency === 'soon' ? 25 :
    c.review_urgency === 'scheduled' ? 10 : 0
  const examPts = c.exam_priority * 0.3
  const depPts = Math.min(c.dependency_risk * 5, 20)
  const gapPts = (100 - c.mastery_score) * 0.1
  return Math.round(urgencyPts + examPts + depPts + gapPts)
}

function classifyBlock(c: Pick<ConceptIntelligence, 'review_urgency' | 'review_count' | 'mastery_score'>): {
  block_type: BlockType
} {
  if (c.review_urgency === 'immediate') return { block_type: 'review' }
  if (c.review_count === 0 || c.mastery_score < 30) return { block_type: 'relearn' }
  if (c.mastery_score < 60) return { block_type: 'flashcards' }
  if (c.mastery_score < 80) return { block_type: 'quiz' }
  return { block_type: 'mixed' }
}

// ── priorityScore ─────────────────────────────────────────────────────────────

describe('priorityScore', () => {
  it('immediate review urgency earns highest base score', () => {
    const immediate = priorityScore({ review_urgency: 'immediate', exam_priority: 0, dependency_risk: 0, mastery_score: 80 })
    const none = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 0, mastery_score: 80 })
    expect(immediate).toBeGreaterThan(none)
  })

  it('high exam_priority increases score', () => {
    const high = priorityScore({ review_urgency: 'none', exam_priority: 100, dependency_risk: 0, mastery_score: 50 })
    const low = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 0, mastery_score: 50 })
    expect(high).toBeGreaterThan(low)
  })

  it('low mastery increases score (gap points)', () => {
    const low = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 0, mastery_score: 10 })
    const high = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 0, mastery_score: 90 })
    expect(low).toBeGreaterThan(high)
  })

  it('dependency_risk is capped at 20 pts', () => {
    const capped = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 100, mastery_score: 50 })
    const max = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 4, mastery_score: 50 })
    // Both should give the same dep pts (capped at 20)
    const depBase = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 0, mastery_score: 50 })
    expect(capped - depBase).toBe(max - depBase)
  })

  it('returns a non-negative integer', () => {
    const score = priorityScore({ review_urgency: 'none', exam_priority: 0, dependency_risk: 0, mastery_score: 100 })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(score)).toBe(true)
  })
})

// ── classifyBlock ─────────────────────────────────────────────────────────────

describe('classifyBlock', () => {
  it('immediate urgency → review', () => {
    expect(classifyBlock({ review_urgency: 'immediate', review_count: 5, mastery_score: 70 }).block_type).toBe('review')
  })

  it('never reviewed → relearn', () => {
    expect(classifyBlock({ review_urgency: 'none', review_count: 0, mastery_score: 0 }).block_type).toBe('relearn')
  })

  it('very low mastery → relearn', () => {
    expect(classifyBlock({ review_urgency: 'none', review_count: 3, mastery_score: 20 }).block_type).toBe('relearn')
  })

  it('mid-low mastery → flashcards', () => {
    expect(classifyBlock({ review_urgency: 'none', review_count: 3, mastery_score: 45 }).block_type).toBe('flashcards')
  })

  it('mid-high mastery → quiz', () => {
    expect(classifyBlock({ review_urgency: 'none', review_count: 3, mastery_score: 70 }).block_type).toBe('quiz')
  })

  it('high mastery → mixed', () => {
    expect(classifyBlock({ review_urgency: 'none', review_count: 3, mastery_score: 90 }).block_type).toBe('mixed')
  })
})
