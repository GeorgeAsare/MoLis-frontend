export interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  study_goals?: string[]
  learning_style?: string
  grade_level?: string
  subjects?: string[]
  onboarding_complete: boolean
  created_at: string
}

export interface OnboardingData {
  full_name: string
  study_goals: string[]
  learning_style: string
  grade_level: string
  subjects: string[]
}
