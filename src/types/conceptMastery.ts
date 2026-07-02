export type MasterySource = 'quiz' | 'flashcard' | 'manual' | 'ai_tutor'
export type ForgettingRisk = 'low' | 'medium' | 'high'

export interface MistakePattern {
  question: string
  wrong_answer: string | null
  correct_answer: string
  timestamp: string
}

export interface ConceptMastery {
  id: string
  user_id: string
  document_id: string
  concept_id: string
  concept_title: string
  mastery_score: number
  confidence_score: number
  exposure_count: number
  review_count: number
  correct_count: number
  incorrect_count: number
  last_reviewed_at: string | null
  next_review_at: string | null
  forgetting_risk: ForgettingRisk
  average_response_time_ms: number | null
  mistake_patterns: MistakePattern[]
  source: MasterySource
  created_at: string
  updated_at: string
}

export interface ConceptResultInput {
  concept_id: string
  concept_title: string
  correct: boolean
  source: MasterySource
  response_time_ms?: number
  question?: string | null
  wrong_answer?: string | null
  correct_answer?: string | null
}
