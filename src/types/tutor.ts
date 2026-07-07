export type TutorMode =
  | 'explain'
  | 'quiz_help'
  | 'exam_prep'
  | 'weak_topic'
  | 'simplify'
  | 'next_step'

export interface TutorMessage {
  role: 'user' | 'assistant'
  content: string
  mode?: TutorMode
  timestamp: number
  suggestedAction?: TutorAction
}

export interface CheckMeta {
  concept_id: string
  concept_title: string
  question: string
}

export type TutorActionType =
  | 'open_notes'
  | 'open_flashcards'
  | 'open_quiz'
  | 'open_visuals'
  | 'open_weak_topics'
  | 'continue_tutor'

export interface TutorAction {
  type: TutorActionType
  concept_title?: string
  label: string
}

export interface TutorResponse {
  answer: string
  mode: TutorMode
  checkMeta?: CheckMeta
  suggestedAction?: TutorAction
}

export interface AskTutorInput {
  documentId: string
  question: string
  mode: TutorMode
  recentMessages: TutorMessage[]
  pendingCheckConcept?: string
}
