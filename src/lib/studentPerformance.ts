import type { AcademicProfile, StudyPreferences } from '@/types/user'
import type { StudentKnowledgeTwin } from '@/types/studentKnowledgeTwin'
import type { DashboardIntelligence } from '@/types/dashboardIntelligence'
import type {
  GradeGap,
  EffortLevel,
  ConsistencyLevel,
  RiskLevel,
  OnTrackStatus,
  StudentPerformanceProfile,
} from '@/types/studentPerformance'

export const DEFAULT_STUDY_PREFS: StudyPreferences = {
  learning_style: [],
  study_days_per_week: null,
  study_minutes_per_day: null,
  preferred_time: '',
  motivation_style: '',
  main_struggles: [],
  main_academic_goal: '',
}

// Maps grade strings from any common system to an internal 0-100 score.
// Returns null for unrecognised input so the caller can skip missing grades.
function normalizeGrade(grade: string | null): number | null {
  if (!grade) return null
  const g = grade.trim().toLowerCase()

  const lookup: Record<string, number> = {
    // UK university
    'first': 88, '1st': 88, 'first class': 88, 'first class honours': 88,
    '2:1': 72, '2.1': 72, 'upper second': 72, 'upper second class': 72,
    '2:2': 58, '2.2': 58, 'lower second': 58, 'lower second class': 58,
    'third': 48, '3rd': 48, 'third class': 48,
    'pass': 44, 'ordinary': 38, 'fail': 18,
    // A-Level / AS-Level
    'a*': 95, 'a': 83, 'b': 73, 'c': 63, 'd': 53, 'e': 43, 'u': 15,
    // GCSE numeric
    '9': 95, '8': 88, '7': 80, '6': 72, '5': 64, '4': 55, '3': 46, '2': 37, '1': 25,
    // BTEC
    'd*': 95, 'distinction*': 95, 'distinction': 83, 'merit': 68, 'm': 68, 'p': 55,
  }
  if (g in lookup) return lookup[g]

  // GPA (0–4 scale)
  const gpaMatch = g.match(/^(\d+(?:\.\d+)?)\s*(?:gpa|\/4(?:\.0)?)?$/)
  if (gpaMatch) {
    const val = parseFloat(gpaMatch[1])
    if (val >= 0 && val <= 4) return Math.round((val / 4) * 100)
  }

  // Percentage
  const pctMatch = g.match(/^(\d+(?:\.\d+)?)\s*%?$/)
  if (pctMatch) {
    const val = parseFloat(pctMatch[1])
    if (val > 4 && val <= 100) return Math.round(val)
  }

  return null
}

function performanceBandLabel(score: number): string {
  if (score >= 82) return 'Distinction level'
  if (score >= 68) return 'Merit level'
  if (score >= 52) return 'Pass level'
  if (score >= 40) return 'Low pass level'
  return 'Below standard'
}

export interface PerformanceComputeInput {
  academic: AcademicProfile
  prefs: StudyPreferences | null
  twin: StudentKnowledgeTwin
  intel: DashboardIntelligence | null
}

export function computeStudentPerformanceProfile(
  input: PerformanceComputeInput,
): StudentPerformanceProfile {
  const { academic, twin, intel } = input

  // ── 1. Target performance ─────────────────────────────────────────────────────
  const targetScores = academic.subjects
    .map(s => normalizeGrade(s.target_grade))
    .filter((s): s is number => s !== null)

  const avgTargetScore =
    targetScores.length > 0
      ? targetScores.reduce((a, b) => a + b, 0) / targetScores.length
      : null

  // ── 2. Current performance ────────────────────────────────────────────────────
  // Primary: twin overall readiness (0-100 from real activity)
  // Secondary: onboarding self-confidence (1-5 → 0-100 proxy)
  const avgConfidence =
    academic.subjects.length > 0
      ? academic.subjects.reduce((sum, s) => sum + s.confidence, 0) / academic.subjects.length
      : null
  const confidenceScore = avgConfidence !== null ? ((avgConfidence - 1) / 4) * 100 : null

  let currentScore: number | null
  if (twin.has_enough_data) {
    currentScore =
      confidenceScore !== null
        ? 0.75 * twin.overall_student_readiness + 0.25 * confidenceScore
        : twin.overall_student_readiness
  } else {
    currentScore = confidenceScore
  }

  // ── 3. Grade gap ──────────────────────────────────────────────────────────────
  let gradeGap: GradeGap = 'unknown'
  if (currentScore !== null && avgTargetScore !== null) {
    const gap = avgTargetScore - currentScore
    gradeGap = gap <= 5 ? 'none' : gap <= 15 ? 'small' : gap <= 30 ? 'moderate' : 'large'
  }

  // ── 4. Effort level ───────────────────────────────────────────────────────────
  const totalConcepts = intel?.total_concepts_tracked ?? twin.total_concepts_tracked
  const reviewsDue = intel?.reviews_due_count ?? twin.concepts_due_for_review

  let effortLevel: EffortLevel
  if (totalConcepts === 0) {
    effortLevel = 'very_low'
  } else if (!twin.has_enough_data) {
    effortLevel = 'low'
  } else if (twin.overall_student_readiness >= 65 && reviewsDue <= 4) {
    effortLevel = 'high'
  } else if (reviewsDue > totalConcepts * 0.4 || twin.overall_student_readiness < 30) {
    effortLevel = 'low'
  } else {
    effortLevel = 'moderate'
  }

  // ── 5. Consistency level ──────────────────────────────────────────────────────
  let consistencyLevel: ConsistencyLevel
  if (!twin.has_enough_data) {
    consistencyLevel = 'insufficient_data'
  } else {
    const highForgetting = twin.forgetting_risk_summary.high
    if (reviewsDue <= 3 && highForgetting <= 1) {
      consistencyLevel = 'consistent'
    } else if (reviewsDue > 15 || highForgetting > 5) {
      consistencyLevel = 'inconsistent'
    } else if (reviewsDue > 7 || highForgetting > 3) {
      consistencyLevel = 'sporadic'
    } else {
      consistencyLevel = 'moderate'
    }
  }

  // ── 6. Upcoming exam check ────────────────────────────────────────────────────
  const now = Date.now()
  const upcomingExams = academic.subjects.filter(s => {
    if (!s.exam_date) return false
    const days = (new Date(s.exam_date).getTime() - now) / 86400000
    return days >= 0 && days <= 45
  })
  const hasUpcomingExam = upcomingExams.length > 0
  const nearestExamDays = hasUpcomingExam
    ? Math.min(
        ...upcomingExams.map(s =>
          Math.ceil((new Date(s.exam_date!).getTime() - now) / 86400000),
        ),
      )
    : null

  // ── 7. Risk level ─────────────────────────────────────────────────────────────
  const isLowEffort = effortLevel === 'very_low' || effortLevel === 'low'
  const isNearExam = nearestExamDays !== null && nearestExamDays <= 21

  let riskLevel: RiskLevel
  if ((gradeGap === 'large' && hasUpcomingExam) || (isLowEffort && isNearExam)) {
    riskLevel = 'critical'
  } else if (
    gradeGap === 'large' ||
    (gradeGap === 'moderate' && hasUpcomingExam) ||
    (isLowEffort && hasUpcomingExam) ||
    consistencyLevel === 'inconsistent'
  ) {
    riskLevel = 'high'
  } else if (gradeGap === 'moderate' || effortLevel === 'low' || consistencyLevel === 'sporadic') {
    riskLevel = 'medium'
  } else if (gradeGap === 'none' || gradeGap === 'small') {
    riskLevel = 'low'
  } else {
    riskLevel = 'medium'
  }

  // ── 8. On-track status ────────────────────────────────────────────────────────
  const hasAnyActivity = totalConcepts > 0
  let onTrackStatus: OnTrackStatus
  if (!hasAnyActivity && !twin.has_enough_data) {
    onTrackStatus = 'not_enough_data'
  } else if (riskLevel === 'critical') {
    onTrackStatus = 'needs_urgent_focus'
  } else if (riskLevel === 'high') {
    onTrackStatus = 'behind_target'
  } else if (riskLevel === 'medium') {
    onTrackStatus = 'approaching_target'
  } else {
    onTrackStatus = 'on_track'
  }

  // ── 9. Recommended intervention ───────────────────────────────────────────────
  const weakCount = intel?.weak_concepts_count ?? twin.weak_concepts_count
  const interventions: string[] = []

  if (isNearExam && upcomingExams.length > 0) {
    const sub = upcomingExams[0].name
    interventions.push(
      `Prioritise ${sub} revision — ${nearestExamDays} day${nearestExamDays !== 1 ? 's' : ''} remaining`,
    )
  }
  if (weakCount > 0) {
    interventions.push(`Address ${weakCount} weak topic${weakCount !== 1 ? 's' : ''} via the Study Agent`)
  }
  if (reviewsDue > 5) {
    interventions.push(`Complete ${reviewsDue} overdue flashcard reviews`)
  }
  if (effortLevel === 'very_low') {
    interventions.push('Upload a study document and attempt a quiz to start tracking progress')
  } else if (effortLevel === 'low' && !isNearExam) {
    interventions.push('Increase study frequency — aim for at least 3 sessions this week')
  }
  if (interventions.length === 0) {
    interventions.push('Keep up current review habits and tackle your next weak topic')
  }

  const recommendedIntervention = interventions.slice(0, 3).join('. ')

  // ── 10. Honest feedback message ───────────────────────────────────────────────
  const honestFeedbackMessage = buildFeedbackMessage({
    onTrackStatus,
    gradeGap,
    effortLevel,
    hasEnoughData: twin.has_enough_data || hasAnyActivity,
    targetBand: avgTargetScore !== null ? performanceBandLabel(avgTargetScore) : null,
    currentBand: currentScore !== null ? performanceBandLabel(Math.round(currentScore)) : null,
    weakCount,
    reviewsDue,
    hasUpcomingExam,
    nearestExamDays,
    totalConcepts,
  })

  return {
    target_performance_band:
      avgTargetScore !== null ? performanceBandLabel(avgTargetScore) : 'Not set',
    target_performance_score: avgTargetScore !== null ? Math.round(avgTargetScore) : null,
    current_performance_band:
      currentScore !== null ? performanceBandLabel(Math.round(currentScore)) : 'Not enough data',
    current_performance_score: currentScore !== null ? Math.round(currentScore) : null,
    grade_gap: gradeGap,
    effort_level: effortLevel,
    consistency_level: consistencyLevel,
    risk_level: riskLevel,
    on_track_status: onTrackStatus,
    recommended_intervention: recommendedIntervention,
    honest_feedback_message: honestFeedbackMessage,
    computed_at: new Date().toISOString(),
    has_enough_data: twin.has_enough_data || hasAnyActivity,
  }
}

interface FeedbackCtx {
  onTrackStatus: OnTrackStatus
  gradeGap: GradeGap
  effortLevel: EffortLevel
  hasEnoughData: boolean
  targetBand: string | null
  currentBand: string | null
  weakCount: number
  reviewsDue: number
  hasUpcomingExam: boolean
  nearestExamDays: number | null
  totalConcepts: number
}

function buildFeedbackMessage(ctx: FeedbackCtx): string {
  const {
    onTrackStatus, effortLevel, hasEnoughData,
    targetBand, currentBand, weakCount, reviewsDue,
    hasUpcomingExam, nearestExamDays, totalConcepts,
  } = ctx

  const targetText = targetBand ? `your target of ${targetBand}` : 'your target grade'

  if (!hasEnoughData) {
    if (totalConcepts === 0) {
      return 'MoLis has no study activity data yet. Upload a document and complete a quiz to start tracking your progress towards your targets.'
    }
    return 'MoLis is still building your performance profile. A few more study sessions will give you an accurate picture.'
  }

  if (onTrackStatus === 'not_enough_data') {
    return 'MoLis does not have enough activity data to estimate your performance yet. Complete a quiz, review flashcards, or ask the AI Tutor something to start building your profile.'
  }

  if (onTrackStatus === 'on_track') {
    if (weakCount > 0) {
      return `You are on track for ${targetText}. Keep up the momentum — watch your ${weakCount} weak topic${weakCount !== 1 ? 's' : ''} and stay consistent with reviews.`
    }
    return `You are on track for ${targetText}. Your study consistency is solid — keep this pace heading into your exams.`
  }

  if (onTrackStatus === 'approaching_target') {
    const weakNote = weakCount > 0 ? ` Focus on your ${weakCount} weak area${weakCount !== 1 ? 's' : ''}.` : ''
    const reviewNote = reviewsDue > 5 ? ` You have ${reviewsDue} overdue reviews to clear.` : ''
    return `You are working towards ${targetText}, but there is still a gap to close.${weakNote}${reviewNote} Stay consistent and you will get there.`
  }

  if (onTrackStatus === 'behind_target') {
    const currentNote = currentBand ? ` Your current performance is closer to ${currentBand}.` : ''
    const examNote =
      hasUpcomingExam && nearestExamDays !== null
        ? ` Your exam is in ${nearestExamDays} day${nearestExamDays !== 1 ? 's' : ''}.`
        : ''
    const effortNote =
      effortLevel === 'low' || effortLevel === 'very_low'
        ? ' Increasing your study frequency will make a significant difference.'
        : ''
    const weakNote = weakCount > 0 ? ` Prioritise your ${weakCount} weakest topics.` : ''
    return `You are aiming for ${targetText}, but you are currently behind.${currentNote}${examNote}${effortNote}${weakNote}`
  }

  if (onTrackStatus === 'needs_urgent_focus') {
    const examNote =
      hasUpcomingExam && nearestExamDays !== null
        ? ` With only ${nearestExamDays} day${nearestExamDays !== 1 ? 's' : ''} until your exam, `
        : ' '
    const reviewNote = reviewsDue > 5 ? ` You have ${reviewsDue} overdue reviews.` : ''
    return `You are aiming for ${targetText}, but there is a large gap between your target and your current performance.${examNote}this needs urgent attention now.${reviewNote} Use the Study Agent and AI Tutor to focus your sessions.`
  }

  return `Keep studying consistently towards ${targetText}.`
}
