import type { ForgettingRisk } from '@/types/conceptMastery'
import type { DigestActivity } from '@/types/studyDigest'

export type WeakReason = 'low_mastery' | 'forgetting_risk' | 'recent_mistakes'

export interface WeakConceptItem {
  concept_id: string
  concept_title: string
  document_id: string
  document_title: string
  mastery_score: number
  forgetting_risk: ForgettingRisk
  incorrect_count: number
  review_count: number
  next_review_at: string | null
  reason: WeakReason
  href: string
}

export interface RecommendedNextAction {
  concept_title: string
  document_title: string
  document_id: string
  reason: string
  action_label: string
  tab: string
}

export interface DigestData {
  activities: DigestActivity[]
  is_fallback: boolean
  concepts_reviewed_today: number
}

export interface DashboardIntelligence {
  total_documents: number
  total_concepts_tracked: number
  weak_concepts_count: number
  reviews_due_count: number
  top_weak_concepts: WeakConceptItem[]
  recommended_next_action: RecommendedNextAction | null
  overall_readiness_estimate: number
  digest: DigestData
}
