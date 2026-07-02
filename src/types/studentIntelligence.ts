import type { ForgettingRisk, MistakePattern } from '@/types/conceptMastery'

export type ReviewUrgency = 'immediate' | 'soon' | 'scheduled' | 'none'
export type CognitiveLoad = 'low' | 'medium' | 'high'

export interface ConceptIntelligence {
  // Identity
  concept_id: string
  concept_title: string

  // From concept_mastery
  mastery_score: number
  confidence_score: number
  forgetting_risk: ForgettingRisk
  review_count: number
  correct_count: number
  incorrect_count: number
  last_reviewed_at: string | null
  next_review_at: string | null
  mistake_patterns: MistakePattern[]

  // From concept_graph
  is_exam_topic: boolean
  exam_importance: 'high' | 'medium' | 'low' | null
  importance: 'core' | 'supporting' | 'supplementary' | null
  section: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  prerequisites: string[]
  unlocks: string[]

  // Computed
  retention_score: number
  learning_velocity: number
  dependency_risk: number
  exam_priority: number
  cognitive_load: CognitiveLoad
  review_urgency: ReviewUrgency
  recommended_action: string
  error_pattern_summary: string | null
  predicted_mastery_7_days: number
  predicted_exam_readiness: number
}

export interface DocumentIntelligence {
  document_id: string
  concepts: ConceptIntelligence[]
  overall_exam_readiness: number
  recommended_study_order: string[]
  mastered_count: number
  weak_count: number
  unstarted_count: number
  estimated_minutes_to_exam_ready: number
}
