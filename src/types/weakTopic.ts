export interface WeakTopicEvidence {
  question: string
  question_type: string
  selected_answer: string
  correct_answer: string
  explanation: string
  recorded_at: string
}

export interface WeakTopic {
  id: string
  user_id: string
  document_id: string | null
  topic: string
  weakness_score: number
  evidence: WeakTopicEvidence[]
  last_seen: string
  created_at: string
}

// Passed from the client (QuizPanel) to the saveWeakTopics server action
export interface MissedQuestionData {
  question: string
  questionType: string
  selectedAnswer: string
  correctAnswer: string
  explanation: string
}
