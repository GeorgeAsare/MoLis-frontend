export interface FlashcardItem {
  front: string
  back: string
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  image_prompt: string | null
  concept_id?: string
}

export interface FlashcardSet {
  id: string
  document_id: string
  user_id: string
  cards: FlashcardItem[]
  model: string
  created_at: string
}
