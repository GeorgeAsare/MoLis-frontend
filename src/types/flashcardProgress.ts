export type FlashcardPhase = 'ready' | 'studying' | 'done'
export type CardStatus = 'unseen' | 'known' | 'learning'

// Persisted alongside session_card_indices to reconstruct the session label on resume.
export interface SessionPersistedConfig {
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  selected_topics: string[]      // empty array = all topics
  review_learning_only: boolean
}

export interface FlashcardProgress {
  id: string
  document_id: string
  user_id: string
  card_statuses: CardStatus[]
  current_index: number
  phase: FlashcardPhase
  review_learning_only: boolean
  // Exact ordered deck indices of the active session; null when not studying.
  // Enables byte-accurate session resume across page reloads.
  session_card_indices: number[] | null
  session_config: SessionPersistedConfig | null
  started_at: string | null
  completed_at: string | null
  updated_at: string
}
