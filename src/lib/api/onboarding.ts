import { api } from './client'
import type { OnboardingData, UserProfile } from '@/types/user'

export async function submitOnboarding(
  userId: string,
  data: OnboardingData
): Promise<UserProfile> {
  return api.post<UserProfile>('/onboarding', { user_id: userId, ...data })
}

export async function getProfile(): Promise<UserProfile> {
  return api.get<UserProfile>('/profile')
}
