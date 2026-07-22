export type GenerationType =
  | 'revision_notes'
  | 'flashcards'
  | 'quiz'
  | 'visuals'
  | 'tutor_message'
  | 'analysis'
  | 'concept_mastery'
  | 'study_plan'

export interface UsageEvent {
  id: string
  user_id: string
  document_id: string | null
  generation_type: GenerationType
  correlation_id: string | null
  tokens_used: number | null
  images_generated: number
  success: boolean
  error_type: string | null
  duration_ms: number | null
  model: string | null
  created_at: string
}

export interface RecordUsageInput {
  generation_type: GenerationType
  document_id?: string | null
  correlation_id?: string | null
  tokens_used?: number | null
  images_generated?: number
  success: boolean
  error_type?: string | null
  duration_ms?: number | null
  model?: string | null
}
