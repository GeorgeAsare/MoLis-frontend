export interface MultipleChoiceQuestion {
  type: 'multiple_choice'
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

export interface TrueFalseQuestion {
  type: 'true_false'
  question: string
  correct: boolean
  explanation: string
}

export interface ShortAnswerQuestion {
  type: 'short_answer'
  question: string
  model_answer: string
  key_points: string[]
  explanation: string
}

export interface ScenarioQuestion {
  type: 'scenario'
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

export type QuizQuestion =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | ShortAnswerQuestion
  | ScenarioQuestion

export interface Quiz {
  id: string
  document_id: string
  user_id: string
  title: string
  questions: QuizQuestion[]
  model: string
  created_at: string
}
