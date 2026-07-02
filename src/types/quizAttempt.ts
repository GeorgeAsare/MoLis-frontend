export type QuizAttemptPhase = 'playing' | 'review'

export interface AnswerState {
  selected: number | boolean | null
  revealed: boolean
  selfCorrect: boolean | null
}

export interface QuizAttempt {
  id: string
  quiz_id: string
  document_id: string
  user_id: string
  answers: AnswerState[]
  current_index: number
  phase: QuizAttemptPhase
  score_correct: number | null
  score_total: number | null
  started_at: string
  completed_at: string | null
  updated_at: string
}
