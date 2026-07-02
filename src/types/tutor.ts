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
}

export interface TutorResponse {
  answer: string
  mode: TutorMode
}

export interface AskTutorInput {
  documentId: string
  question: string
  mode: TutorMode
  recentMessages: TutorMessage[]
}
