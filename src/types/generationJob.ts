export type GenerationJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type GenerationJobType = 'visuals' | 'flashcards' | 'quiz' | 'revision_notes' | 'analysis'

export interface GenerationJob {
  id: string
  user_id: string
  document_id: string | null
  job_type: GenerationJobType
  status: GenerationJobStatus
  input_data: Record<string, unknown> | null
  result_data: Record<string, unknown> | null
  error: string | null
  correlation_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}
