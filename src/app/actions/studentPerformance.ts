'use server'

import { createClient } from '@/lib/supabase/server'
import { getStudentKnowledgeTwin } from '@/app/actions/studentKnowledgeTwin'
import { getDashboardIntelligence } from '@/app/actions/dashboardIntelligence'
import { computeStudentPerformanceProfile, DEFAULT_STUDY_PREFS } from '@/lib/studentPerformance'
import type { AcademicProfile, StudyPreferences } from '@/types/user'
import type { StudentKnowledgeTwin } from '@/types/studentKnowledgeTwin'
import type { StudentPerformanceProfile } from '@/types/studentPerformance'

const EMPTY_TWIN: StudentKnowledgeTwin = {
  total_concepts_tracked: 0,
  mastered_concepts_count: 0,
  weak_concepts_count: 0,
  average_mastery_score: null,
  average_confidence_score: null,
  strongest_concepts: [],
  weakest_concepts: [],
  recurring_weak_patterns: [],
  concepts_due_for_review: 0,
  forgetting_risk_summary: { high: 0, medium: 0, low: 0 },
  learning_velocity_summary: null,
  preferred_study_mode: null,
  recommended_focus_area: null,
  recommended_next_document: null,
  overall_student_readiness: 0,
  has_enough_data: false,
}

export async function getStudentPerformanceProfile(): Promise<StudentPerformanceProfile | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
      .from('user_profiles')
      .select('academic_profile, study_preferences')
      .eq('user_id', user.id)
      .limit(1)

    if (!data?.length) return null

    const academic = data[0].academic_profile as AcademicProfile | null
    if (!academic?.subjects?.length || !academic.subjects.some(s => s.target_grade)) return null

    const prefs = (data[0].study_preferences as StudyPreferences | null) ?? DEFAULT_STUDY_PREFS

    const [twin, intel] = await Promise.all([
      getStudentKnowledgeTwin().catch(() => EMPTY_TWIN),
      getDashboardIntelligence().catch(() => null),
    ])

    return computeStudentPerformanceProfile({ academic, prefs, twin, intel })
  } catch {
    return null
  }
}
