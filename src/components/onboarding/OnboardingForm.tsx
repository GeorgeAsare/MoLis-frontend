'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveOnboardingProfile } from '@/app/actions/onboarding'
import { Button } from '@/components/ui/Button'
import type {
  AcademicProfile,
  DashboardFocus,
  PersonalisationProfile,
  StudentType,
  StudyIntensity,
  StudyPreferences,
  SubjectEntry,
} from '@/types/user'

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

const STEP_LABELS = ['Education', 'Subjects', 'Goals', 'Preferences', 'Summary']

const EDUCATION_LEVELS = [
  'Undergraduate',
  'A-Level / Sixth Form',
  'GCSE',
  'Masters / Graduate',
  'PhD',
  'Professional / Self-learner',
]

const LEARNING_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'simple_explanations', label: 'Simple explanations' },
  { value: 'visual_diagrams',     label: 'Visual diagrams' },
  { value: 'worked_examples',     label: 'Worked examples' },
  { value: 'practice_questions',  label: 'Practice questions' },
  { value: 'flashcards',          label: 'Flashcards' },
  { value: 'step_by_step_tutor',  label: 'Step-by-step tutor' },
  { value: 'summaries',           label: 'Summaries' },
  { value: 'code_examples',       label: 'Code examples' },
]

const MOTIVATION_OPTIONS: { value: string; label: string }[] = [
  { value: 'calm_supportive',       label: 'Calm & supportive' },
  { value: 'strict_accountability', label: 'Strict accountability' },
  { value: 'gamified',              label: 'Gamified progress' },
  { value: 'direct_concise',        label: 'Direct & concise' },
  { value: 'minimal',               label: 'Minimal pressure' },
]

const STRUGGLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'time_management',     label: 'Time management' },
  { value: 'concentration',       label: 'Concentration / focus' },
  { value: 'essay_writing',       label: 'Essay writing' },
  { value: 'maths_calculations',  label: 'Maths / calculations' },
  { value: 'memorisation',        label: 'Memorisation' },
  { value: 'motivation',          label: 'Motivation' },
  { value: 'exam_anxiety',        label: 'Exam anxiety' },
  { value: 'note_taking',         label: 'Note-taking' },
  { value: 'understanding',       label: 'Understanding concepts' },
  { value: 'revision_planning',   label: 'Revision planning' },
]

const STUDY_DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7]

const STUDY_MINUTES_OPTIONS: { value: number; label: string }[] = [
  { value: 15,  label: '15 min' },
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hour' },
  { value: 90,  label: '90 min' },
  { value: 120, label: '2h+' },
]

const PREFERRED_TIME_OPTIONS = ['Morning', 'Afternoon', 'Evening', 'Varies']

const STUDENT_TYPE_LABEL: Record<StudentType, string> = {
  high_achiever:    'High achiever',
  balanced_student: 'Balanced student',
  needs_support:    'Needs extra support',
}

const INTENSITY_LABEL: Record<StudyIntensity, string> = {
  high:   'High intensity',
  medium: 'Moderate intensity',
  low:    'Light intensity',
}

const FOCUS_LABEL: Record<DashboardFocus, string> = {
  weak_topics: 'Focus on weak areas',
  exam_prep:   'Exam preparation',
  balanced:    'Balanced review',
}

const RISK_FLAG_LABEL: Record<string, string> = {
  low_average_confidence: 'Low confidence across subjects — focused support recommended',
  high_subject_load:      'High number of subjects — prioritisation will be important',
  tight_deadlines:        'Upcoming exam deadlines detected — time management focus needed',
  motivation_risk:        'Motivation flagged as a challenge — accountability features active',
}

// ── Deterministic personalisation computation ─────────────────────────────────

function computePersonalisationProfile(
  academic: AcademicProfile,
  prefs: StudyPreferences,
): PersonalisationProfile {
  const subjects = academic.subjects
  const totalSubjects = subjects.length

  const avgConfidence = totalSubjects > 0
    ? subjects.reduce((sum, s) => sum + s.confidence, 0) / totalSubjects
    : 3

  const hasHighTarget = subjects.some(s =>
    ['First', 'Distinction', 'A*', 'A', 'High Distinction', '9', '8'].includes(s.target_grade ?? ''),
  )

  const studentType: StudentType =
    avgConfidence >= 4 && hasHighTarget ? 'high_achiever'
    : avgConfidence >= 3               ? 'balanced_student'
    :                                    'needs_support'

  const days = prefs.study_days_per_week ?? 0
  const mins = prefs.study_minutes_per_day ?? 0
  const studyIntensity: StudyIntensity =
    days >= 5 || mins >= 90 ? 'high'
    : days >= 3 || mins >= 45 ? 'medium'
    : 'low'

  const riskFlags: string[] = []
  if (avgConfidence < 2.5 && totalSubjects > 0) riskFlags.push('low_average_confidence')
  if (totalSubjects > 6) riskFlags.push('high_subject_load')
  if (prefs.main_struggles.includes('motivation')) riskFlags.push('motivation_risk')

  const today = Date.now()
  const hasUpcomingDeadline = subjects.some(s => {
    if (!s.exam_date) return false
    const daysUntil = (new Date(s.exam_date).getTime() - today) / (86400 * 1000)
    return daysUntil >= 0 && daysUntil <= 30
  })
  if (hasUpcomingDeadline) riskFlags.push('tight_deadlines')

  // Priority subject: lowest confidence first, then earliest exam date
  const prioritySubject = totalSubjects > 0
    ? [...subjects].sort((a, b) => {
        if (a.confidence !== b.confidence) return a.confidence - b.confidence
        if (a.exam_date && b.exam_date) return new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime()
        if (a.exam_date) return -1
        if (b.exam_date) return 1
        return 0
      })[0]?.name ?? null
    : null

  const learningStyles = prefs.learning_style
  const preferredTutorStyle =
    learningStyles.includes('step_by_step_tutor')   ? 'Structured step-by-step'
    : learningStyles.includes('simple_explanations') ? 'Concise and clear'
    : learningStyles.includes('practice_questions')  ? 'Practice-oriented'
    : learningStyles.includes('visual_diagrams')     ? 'Visual and diagrammatic'
    :                                                  'Balanced'

  const dashboardFocus: DashboardFocus =
    avgConfidence < 3 ? 'weak_topics'
    : hasUpcomingDeadline ? 'exam_prep'
    : 'balanced'

  const levelLabel = academic.education_level || 'Student'
  const courseLabel = academic.course_name ? ` studying ${academic.course_name}` : ''
  const institutionLabel = academic.institution ? ` at ${academic.institution}` : ''
  const priorityText = prioritySubject ? ` Priority: ${prioritySubject}.` : ''
  const setupSummary =
    `${levelLabel}${courseLabel}${institutionLabel}.${priorityText} Study intensity: ${studyIntensity}.`

  return {
    student_type: studentType,
    recommended_study_intensity: studyIntensity,
    preferred_tutor_style: preferredTutorStyle,
    recommended_dashboard_focus: dashboardFocus,
    starting_subject_priority: prioritySubject,
    risk_flags: riskFlags,
    setup_summary: setupSummary,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Step 1 — Education
  const [educationLevel, setEducationLevel] = useState('')
  const [institution, setInstitution] = useState('')
  const [courseName, setCourseName] = useState('')

  // Step 2 — Subjects & grades
  const [subjects, setSubjects] = useState<SubjectEntry[]>([])
  const [newSubjectInput, setNewSubjectInput] = useState('')

  // Step 3 — Goals & struggles
  const [mainGoal, setMainGoal] = useState('')
  const [mainStruggles, setMainStruggles] = useState<string[]>([])

  // Step 4 — Learning preferences
  const [learningStyle, setLearningStyle] = useState<string[]>([])
  const [studyDays, setStudyDays] = useState<number | null>(null)
  const [studyMinutes, setStudyMinutes] = useState<number | null>(null)
  const [preferredTime, setPreferredTime] = useState('')
  const [motivationStyle, setMotivationStyle] = useState('')

  // Step 5 — Computed summary
  const [computed, setComputed] = useState<PersonalisationProfile | null>(null)

  function buildAcademicProfile(): AcademicProfile {
    return {
      education_level: educationLevel,
      institution: institution.trim(),
      course_name: courseName.trim(),
      subjects: subjects.map(s => ({
        name: s.name,
        confidence: s.confidence,
        predicted_grade: null,
        target_grade: s.target_grade || null,
        exam_date: s.exam_date || null,
      })),
    }
  }

  function buildStudyPreferences(): StudyPreferences {
    return {
      learning_style: learningStyle,
      study_days_per_week: studyDays,
      study_minutes_per_day: studyMinutes,
      preferred_time: preferredTime,
      motivation_style: motivationStyle,
      main_struggles: mainStruggles,
      main_academic_goal: mainGoal.trim(),
    }
  }

  function canContinue(): boolean {
    if (step === 0) return !!educationLevel
    if (step === 1) return subjects.length > 0
    return true
  }

  function isSkippable(): boolean {
    return step === 2 || step === 3
  }

  function addSubject() {
    const name = newSubjectInput.trim()
    if (!name) return
    if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setNewSubjectInput('')
      return
    }
    if (subjects.length >= 12) return
    setSubjects(prev => [...prev, { name, confidence: 3, predicted_grade: null, target_grade: null, exam_date: null }])
    setNewSubjectInput('')
  }

  function removeSubject(idx: number) {
    setSubjects(prev => prev.filter((_, i) => i !== idx))
  }

  function updateSubject(idx: number, patch: Partial<SubjectEntry>) {
    setSubjects(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  function toggleMulti(arr: string[], setArr: (v: string[]) => void, value: string) {
    setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value])
  }

  function goNext() {
    if (step === 3) {
      const academic = buildAcademicProfile()
      const prefs = buildStudyPreferences()
      setComputed(computePersonalisationProfile(academic, prefs))
    }
    setStep(s => s + 1)
  }

  async function handleFinish() {
    if (saving || navigating) return
    setSaveError('')
    setSaving(true)

    if (process.env.NODE_ENV === 'development') console.log('[Onboarding] save started')

    const timeoutId = setTimeout(() => {
      setSaving(false)
      setSaveError('Setup is taking longer than expected. Please try again or refresh.')
      if (process.env.NODE_ENV === 'development') console.log('[Onboarding] save timeout')
    }, 15_000)

    try {
      const academic = buildAcademicProfile()
      const prefs = buildStudyPreferences()
      const profile = computed ?? computePersonalisationProfile(academic, prefs)
      const result = await saveOnboardingProfile({
        academic_profile: academic,
        study_preferences: prefs,
        personalisation_profile: profile,
      })
      if (result.success) {
        clearTimeout(timeoutId)
        setSaving(false)
        setNavigating(true)
        if (process.env.NODE_ENV === 'development') console.log('[Onboarding] save success, navigating')
        router.replace('/dashboard')
      }
    } catch (err) {
      clearTimeout(timeoutId)
      setSaving(false)
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      if (process.env.NODE_ENV === 'development') console.log('[Onboarding] save failed', err)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* Progress bar */}
      <div>
        <div className="flex gap-1 mb-2">
          {STEP_LABELS.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-foreground/10'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-foreground/30">
          Step {step + 1} of {TOTAL_STEPS} — {STEP_LABELS[step]}
        </p>
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 flex flex-col gap-5">

        {/* ── Step 1: Education ── */}
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-base font-semibold text-foreground/85 mb-0.5">
                What is your education level?
              </p>
              <p className="text-xs text-foreground/35">
                This helps MoLis calibrate the depth and style of study support.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {EDUCATION_LEVELS.map(level => (
                <Chip
                  key={level}
                  label={level}
                  selected={educationLevel === level}
                  onToggle={() => setEducationLevel(level)}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground/40">
                  Institution <span className="text-foreground/25">(optional)</span>
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={e => setInstitution(e.target.value)}
                  placeholder="e.g. University of Manchester"
                  className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground/40">
                  Course / programme <span className="text-foreground/25">(optional)</span>
                </label>
                <input
                  type="text"
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  placeholder="e.g. BSc Computer Science"
                  className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Subjects ── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-base font-semibold text-foreground/85 mb-0.5">
                What subjects or modules are you studying?
              </p>
              <p className="text-xs text-foreground/35">
                Add each subject. Set your confidence, target grade, and exam date if you know them.
              </p>
            </div>

            {/* Add subject input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubjectInput}
                onChange={e => setNewSubjectInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubject() } }}
                placeholder="e.g. C++ Programming"
                className="flex-1 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
              />
              <button
                onClick={addSubject}
                disabled={!newSubjectInput.trim() || subjects.length >= 12}
                className="rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.14] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Add
              </button>
            </div>

            {/* Subject cards */}
            {subjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 px-4 py-6 text-center">
                <p className="text-sm text-foreground/30">No subjects added yet.</p>
                <p className="mt-1 text-xs text-foreground/20">Type a subject name above and click Add.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {subjects.map((s, idx) => (
                  <SubjectCard
                    key={idx}
                    subject={s}
                    onUpdate={patch => updateSubject(idx, patch)}
                    onRemove={() => removeSubject(idx)}
                  />
                ))}
              </div>
            )}

            <p className="text-xs text-foreground/25">
              {subjects.length}/12 subjects · Confidence: 1 = not confident, 5 = very confident
            </p>
          </div>
        )}

        {/* ── Step 3: Goals & Struggles ── */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-base font-semibold text-foreground/85 mb-0.5">
                What is your main academic goal?
              </p>
              <p className="text-xs text-foreground/35">Optional — helps MoLis focus on what matters most to you.</p>
            </div>
            <input
              type="text"
              value={mainGoal}
              onChange={e => setMainGoal(e.target.value)}
              placeholder="e.g. Achieve First Class Honours"
              className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/20 focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
            />
            <div>
              <p className="text-sm font-medium text-foreground/55 mb-3">
                What are your biggest study challenges?
                <span className="ml-1 text-xs font-normal text-foreground/25">(select all that apply)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {STRUGGLE_OPTIONS.map(opt => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={mainStruggles.includes(opt.value)}
                    onToggle={() => toggleMulti(mainStruggles, setMainStruggles, opt.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Learning Preferences ── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-base font-semibold text-foreground/85 mb-0.5">
                How do you study best?
              </p>
              <p className="text-xs text-foreground/35">
                Optional — used to personalise notes, tutor responses, and dashboards.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground/40 uppercase tracking-[0.08em] mb-2">
                Learning style <span className="font-normal text-foreground/25 normal-case tracking-normal">(select all that apply)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {LEARNING_STYLE_OPTIONS.map(opt => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={learningStyle.includes(opt.value)}
                    onToggle={() => toggleMulti(learningStyle, setLearningStyle, opt.value)}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-foreground/40 uppercase tracking-[0.08em] mb-2">
                  Study days / week
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STUDY_DAYS_OPTIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setStudyDays(studyDays === d ? null : d)}
                      className={[
                        'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                        studyDays === d
                          ? 'border-primary/30 bg-primary/[0.08] text-primary'
                          : 'border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground/65',
                      ].join(' ')}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground/40 uppercase tracking-[0.08em] mb-2">
                  Minutes / session
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STUDY_MINUTES_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setStudyMinutes(studyMinutes === opt.value ? null : opt.value)}
                      className={[
                        'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        studyMinutes === opt.value
                          ? 'border-primary/30 bg-primary/[0.08] text-primary'
                          : 'border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground/65',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground/40 uppercase tracking-[0.08em] mb-2">
                Preferred study time
              </p>
              <div className="flex flex-wrap gap-2">
                {PREFERRED_TIME_OPTIONS.map(t => (
                  <Chip
                    key={t}
                    label={t}
                    selected={preferredTime === t}
                    onToggle={() => setPreferredTime(preferredTime === t ? '' : t)}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground/40 uppercase tracking-[0.08em] mb-2">
                Motivation style
              </p>
              <div className="flex flex-col gap-2">
                {MOTIVATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMotivationStyle(motivationStyle === opt.value ? '' : opt.value)}
                    className={[
                      'flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors',
                      motivationStyle === opt.value
                        ? 'border-primary/30 bg-primary/[0.06] text-primary/80'
                        : 'border-border text-foreground/45 hover:border-foreground/18 hover:text-foreground/65',
                    ].join(' ')}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${motivationStyle === opt.value ? 'bg-primary' : 'bg-foreground/20'}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: Summary ── */}
        {step === 4 && computed && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-base font-semibold text-foreground/85 mb-0.5">
                Your MoLis profile is ready
              </p>
              <p className="text-xs text-foreground/35">
                Review your personalisation profile below. You can update these at any time from Setup.
              </p>
            </div>

            {/* Profile card */}
            <div className="rounded-xl border border-primary/18 bg-primary/[0.04] px-4 py-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary/50">
                  Student profile
                </p>
                <span className="rounded-md border border-primary/20 bg-primary/[0.07] px-2 py-0.5 text-[10px] font-semibold text-primary/70">
                  {STUDENT_TYPE_LABEL[computed.student_type]}
                </span>
              </div>
              {(educationLevel || courseName) && (
                <p className="text-xs text-foreground/50">
                  {educationLevel}
                  {courseName ? ` · ${courseName}` : ''}
                  {institution ? ` · ${institution}` : ''}
                </p>
              )}
              <p className="text-xs text-foreground/45 leading-5 mt-0.5">{computed.setup_summary}</p>
            </div>

            {/* Subjects */}
            {subjects.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Subjects detected ({subjects.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {subjects.map((s, i) => (
                    <div
                      key={i}
                      className={[
                        'flex items-center justify-between rounded-xl border px-3 py-2',
                        computed.starting_subject_priority === s.name
                          ? 'border-primary/20 bg-primary/[0.04]'
                          : 'border-border bg-muted/20',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        {computed.starting_subject_priority === s.name && (
                          <span className="text-[10px] font-semibold text-primary/60 shrink-0">START</span>
                        )}
                        <p className="text-sm text-foreground/70">{s.name}</p>
                        {s.target_grade && (
                          <span className="text-[10px] text-foreground/30">→ {s.target_grade}</span>
                        )}
                      </div>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`h-2 w-2 rounded-full ${n <= s.confidence ? 'bg-primary/50' : 'bg-foreground/10'}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk flags */}
            {computed.risk_flags.length > 0 && (
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-400/60 mb-2">
                  MoLis flagged
                </p>
                <ul className="flex flex-col gap-1">
                  {computed.risk_flags.map(flag => (
                    <li key={flag} className="text-xs text-amber-400/70 leading-5">
                      · {RISK_FLAG_LABEL[flag] ?? flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              <SummaryStat label="Study intensity" value={INTENSITY_LABEL[computed.recommended_study_intensity]} />
              <SummaryStat label="Dashboard focus" value={FOCUS_LABEL[computed.recommended_dashboard_focus]} />
              <SummaryStat label="Tutor style" value={computed.preferred_tutor_style} />
              {computed.starting_subject_priority && (
                <SummaryStat label="Starting priority" value={computed.starting_subject_priority} />
              )}
            </div>

            {saveError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3">
                <p className="text-xs text-red-400 leading-5">{saveError}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0 || saving || navigating}
          className="text-sm text-foreground/35 hover:text-foreground/60 disabled:opacity-0 disabled:pointer-events-none transition-colors"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          {isSkippable() && step < TOTAL_STEPS - 1 && (
            <button
              onClick={goNext}
              disabled={saving || navigating}
              className="text-sm text-foreground/30 hover:text-foreground/55 disabled:pointer-events-none disabled:opacity-30 transition-colors"
            >
              Skip
            </button>
          )}
          {step === TOTAL_STEPS - 1 ? (
            <Button onClick={handleFinish} loading={saving || navigating} disabled={saving || navigating}>
              {saving ? 'Saving setup…' : navigating ? 'Setup saved. Taking you to dashboard…' : 'Finish setup'}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canContinue()}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SubjectCard ───────────────────────────────────────────────────────────────

function SubjectCard({
  subject,
  onUpdate,
  onRemove,
}: {
  subject: SubjectEntry
  onUpdate: (patch: Partial<SubjectEntry>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground/75">{subject.name}</p>
        <button
          onClick={onRemove}
          className="text-foreground/20 hover:text-red-400/70 transition-colors text-xs"
          title="Remove subject"
        >
          ✕
        </button>
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-foreground/35 w-20 shrink-0">Confidence</p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => onUpdate({ confidence: n })}
              title={`Confidence: ${n}/5`}
              className={[
                'h-4 w-4 rounded-full border transition-colors',
                n <= subject.confidence
                  ? 'bg-primary border-primary/50'
                  : 'bg-transparent border-foreground/20 hover:border-foreground/40',
              ].join(' ')}
            />
          ))}
        </div>
        <span className="text-xs text-foreground/25">{subject.confidence}/5</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-foreground/30 mb-1 block">Target grade</label>
          <input
            type="text"
            value={subject.target_grade ?? ''}
            onChange={e => onUpdate({ target_grade: e.target.value || null })}
            placeholder="e.g. First, A, 70%"
            className="w-full rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground/18 focus:border-foreground/20 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[11px] text-foreground/30 mb-1 block">Exam date</label>
          <input
            type="date"
            value={subject.exam_date ?? ''}
            onChange={e => onUpdate({ exam_date: e.target.value || null })}
            className="w-full rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-foreground focus:border-foreground/20 focus:outline-none [color-scheme:dark]"
          />
        </div>
      </div>
    </div>
  )
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'rounded-xl border px-3.5 py-2 text-sm transition-colors',
        selected
          ? 'border-primary/30 bg-primary/[0.08] text-primary'
          : 'border-border text-foreground/40 hover:border-foreground/18 hover:text-foreground/65',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

// ── SummaryStat ───────────────────────────────────────────────────────────────

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-0.5">{label}</p>
      <p className="text-sm text-foreground/65">{value}</p>
    </div>
  )
}
