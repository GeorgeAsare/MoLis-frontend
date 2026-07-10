export type GradeGap = 'none' | 'small' | 'moderate' | 'large' | 'unknown'
export type EffortLevel = 'very_low' | 'low' | 'moderate' | 'high'
export type ConsistencyLevel = 'consistent' | 'moderate' | 'sporadic' | 'inconsistent' | 'insufficient_data'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type OnTrackStatus =
  | 'on_track'
  | 'approaching_target'
  | 'behind_target'
  | 'needs_urgent_focus'
  | 'not_enough_data'

export interface StudentPerformanceProfile {
  target_performance_band: string
  target_performance_score: number | null
  current_performance_band: string
  current_performance_score: number | null
  grade_gap: GradeGap
  effort_level: EffortLevel
  consistency_level: ConsistencyLevel
  risk_level: RiskLevel
  on_track_status: OnTrackStatus
  recommended_intervention: string
  honest_feedback_message: string
  computed_at: string
  has_enough_data: boolean
}
