// ── Legacy types (kept for lib/api/onboarding.ts compatibility) ────────────────

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

// ── New personalisation types ─────────────────────────────────────────────────

export interface SubjectEntry {
  name: string
  confidence: number           // 1–5 (1 = not confident, 5 = very confident)
  predicted_grade: string | null
  target_grade: string | null
  exam_date: string | null     // ISO date string
}

export interface AcademicProfile {
  education_level: string
  institution: string
  course_name: string
  subjects: SubjectEntry[]
}

export interface StudyPreferences {
  learning_style: string[]
  study_days_per_week: number | null
  study_minutes_per_day: number | null
  preferred_time: string
  motivation_style: string
  main_struggles: string[]
  main_academic_goal: string
}

export type StudentType = 'high_achiever' | 'balanced_student' | 'needs_support'
export type StudyIntensity = 'high' | 'medium' | 'low'
export type DashboardFocus = 'weak_topics' | 'exam_prep' | 'balanced'

export interface PersonalisationProfile {
  student_type: StudentType
  recommended_study_intensity: StudyIntensity
  preferred_tutor_style: string
  recommended_dashboard_focus: DashboardFocus
  starting_subject_priority: string | null
  risk_flags: string[]
  setup_summary: string
}

export interface StudentProfileRow {
  user_id: string
  academic_profile: AcademicProfile
  study_preferences: StudyPreferences
  personalisation_profile: PersonalisationProfile
  onboarding_completed: boolean
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}

export interface SaveOnboardingInput {
  academic_profile: AcademicProfile
  study_preferences: StudyPreferences
  personalisation_profile: PersonalisationProfile
}
