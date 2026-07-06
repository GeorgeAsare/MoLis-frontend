import type { ForgettingRisk } from '@/types/conceptMastery'

export interface GlobalConceptInsight {
  concept_id: string
  concept_title: string
  document_id: string
  document_title: string
  mastery_score: number
  forgetting_risk: ForgettingRisk
}

export interface ForgettingRiskSummary {
  high: number
  medium: number
  low: number
}

export interface LearningPattern {
  pattern: string
  frequency: number
}

export interface KnowledgeTwinRecommendation {
  focus_area: string
  rationale: string
  document_id: string | null
  document_title: string | null
  href: string | null
}

export interface StudentKnowledgeTwin {
  total_concepts_tracked: number
  mastered_concepts_count: number
  weak_concepts_count: number
  average_mastery_score: number | null
  average_confidence_score: number | null
  strongest_concepts: GlobalConceptInsight[]
  weakest_concepts: GlobalConceptInsight[]
  recurring_weak_patterns: LearningPattern[]
  concepts_due_for_review: number
  forgetting_risk_summary: ForgettingRiskSummary
  learning_velocity_summary: string | null
  preferred_study_mode: string | null
  recommended_focus_area: KnowledgeTwinRecommendation | null
  recommended_next_document: {
    document_id: string
    document_title: string
    reason: string
    href: string
  } | null
  overall_student_readiness: number
  has_enough_data: boolean
}
