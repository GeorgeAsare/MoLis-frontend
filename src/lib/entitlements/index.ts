import { PLANS, type PlanId } from './plans'
import type { GenerationType } from '@/types/usageEvent'

// Map generation types to plan limit keys — null means not metered
const PLAN_KEY_MAP: Record<GenerationType, keyof (typeof PLANS)['free']['limits'] | null> = {
  revision_notes: 'revision_notes_per_month',
  flashcards: 'flashcards_per_month',
  quiz: 'quizzes_per_month',
  visuals: 'visuals_per_month',
  tutor_message: 'tutor_messages_per_month',
  analysis: 'analyses_per_month',
  concept_mastery: null,
  study_plan: null,
}

// Suppress unused-variable warning — PLAN_KEY_MAP is ready for billing integration
void PLAN_KEY_MAP

export interface EntitlementResult {
  allowed: boolean
  reason?: string
  plan: PlanId
}

export async function checkEntitlement(userId: string, generationType: GenerationType): Promise<EntitlementResult> {
  void userId; void generationType // reserved for billing integration
  // Development phase: allow everything, no DB lookup needed.
  // TODO: When billing is live, query user_subscriptions, count usage_events
  // for current period, and enforce PLANS[plan].limits[key].
  return { allowed: true, plan: 'dev' }
}
