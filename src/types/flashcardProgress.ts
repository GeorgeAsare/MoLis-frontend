export type FlashcardPhase = 'ready' | 'studying' | 'done'
export type CardStatus = 'unseen' | 'known' | 'learning'

export interface FlashcardProgress {
  id: string
  document_id: string
  user_id: string
  card_statuses: CardStatus[]
  current_index: number
  phase: FlashcardPhase
  review_learning_only: boolean
  started_at: string | null
  completed_at: string | null
  updated_at: string
}
