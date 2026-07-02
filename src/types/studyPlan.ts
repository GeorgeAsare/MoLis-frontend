export type BlockType = 'relearn' | 'flashcards' | 'quiz' | 'review' | 'mixed'
export type LinkedAction = 'notes' | 'flashcards' | 'quiz' | 'tutor'

export interface StudyBlock {
  concept_id: string
  concept_title: string
  block_type: BlockType
  reason: string
  estimated_minutes: number
  priority_score: number
  target_mastery_gain: number
  linked_action: LinkedAction
}

export interface StudyPlan {
  document_id: string
  generated_at: string
  overall_exam_readiness: number
  estimated_session_minutes: number
  focus_concepts: string[]
  study_blocks: StudyBlock[]
  why_this_plan: string
  expected_improvement: number
  blocked_concepts: string[]
  quick_wins: string[]
  urgent_reviews: string[]
  recommended_next_action: string
}
