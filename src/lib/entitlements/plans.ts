export type PlanId = 'free' | 'pro' | 'dev'

export interface PlanLimits {
  revision_notes_per_month: number
  flashcards_per_month: number
  quizzes_per_month: number
  visuals_per_month: number
  tutor_messages_per_month: number
  analyses_per_month: number
  max_documents: number
  max_recordings: number
}

export interface Plan {
  id: PlanId
  name: string
  limits: PlanLimits
}

const UNLIMITED = 999_999

export const PLANS: Record<PlanId, Plan> = {
  dev: {
    id: 'dev',
    name: 'Development',
    limits: {
      revision_notes_per_month: UNLIMITED,
      flashcards_per_month: UNLIMITED,
      quizzes_per_month: UNLIMITED,
      visuals_per_month: UNLIMITED,
      tutor_messages_per_month: UNLIMITED,
      analyses_per_month: UNLIMITED,
      max_documents: UNLIMITED,
      max_recordings: UNLIMITED,
    },
  },
  free: {
    id: 'free',
    name: 'Free',
    limits: {
      revision_notes_per_month: 10,
      flashcards_per_month: 10,
      quizzes_per_month: 5,
      visuals_per_month: 3,
      tutor_messages_per_month: 50,
      analyses_per_month: 20,
      max_documents: 20,
      max_recordings: 10,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    limits: {
      revision_notes_per_month: UNLIMITED,
      flashcards_per_month: UNLIMITED,
      quizzes_per_month: UNLIMITED,
      visuals_per_month: UNLIMITED,
      tutor_messages_per_month: UNLIMITED,
      analyses_per_month: UNLIMITED,
      max_documents: UNLIMITED,
      max_recordings: UNLIMITED,
    },
  },
}
