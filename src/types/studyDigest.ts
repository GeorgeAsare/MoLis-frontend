export type DigestActivityType =
  | 'quiz_completed'
  | 'quiz_in_progress'
  | 'flashcards_completed'
  | 'flashcards_in_progress'
  | 'tutor_session'
  | 'notes_generated'

export interface DigestActivity {
  type: DigestActivityType
  document_id: string
  document_title: string
  detail: string
  href: string
  timestamp: string
}

export interface DailyDigest {
  activities: DigestActivity[]
  document_count: number
  concepts_reviewed_today: number
}
