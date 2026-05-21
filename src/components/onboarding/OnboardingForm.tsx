'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { submitOnboarding } from '@/lib/api/onboarding'
import type { OnboardingData } from '@/types/user'

const STUDY_GOALS = ['Improve grades', 'Exam preparation', 'Deep understanding', 'Career prep', 'Research']
const LEARNING_STYLES = ['Visual', 'Reading/Writing', 'Auditory', 'Hands-on']
const GRADE_LEVELS = ['High School', 'Undergraduate', 'Graduate', 'PhD', 'Self-learner']
const SUBJECTS = ['Mathematics', 'Science', 'Engineering', 'Computer Science', 'Humanities', 'Business', 'Medicine', 'Law', 'Arts']

interface Props {
  userId: string
}

export function OnboardingForm({ userId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState<OnboardingData>({
    full_name: '',
    study_goals: [],
    learning_style: '',
    grade_level: '',
    subjects: [],
  })

  function toggleArrayField<K extends 'study_goals' | 'subjects'>(
    field: K,
    value: string
  ) {
    setData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }))
  }

  async function handleSubmit() {
    setError('')
    setLoading(true)
    try {
      await submitOnboarding(userId, data)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const steps = [
    {
      title: "What's your name?",
      content: (
        <Input
          id="full_name"
          label="Full name"
          value={data.full_name}
          onChange={(e) => setData((p) => ({ ...p, full_name: e.target.value }))}
          placeholder="Your name"
          autoFocus
        />
      ),
      valid: data.full_name.trim().length > 0,
    },
    {
      title: 'What are your study goals?',
      content: (
        <div className="flex flex-wrap gap-2">
          {STUDY_GOALS.map((goal) => (
            <ToggleChip
              key={goal}
              label={goal}
              selected={data.study_goals.includes(goal)}
              onToggle={() => toggleArrayField('study_goals', goal)}
            />
          ))}
        </div>
      ),
      valid: data.study_goals.length > 0,
    },
    {
      title: 'How do you learn best?',
      content: (
        <div className="flex flex-col gap-2">
          {LEARNING_STYLES.map((style) => (
            <ToggleChip
              key={style}
              label={style}
              selected={data.learning_style === style}
              onToggle={() => setData((p) => ({ ...p, learning_style: style }))}
            />
          ))}
        </div>
      ),
      valid: data.learning_style.length > 0,
    },
    {
      title: 'What level are you at?',
      content: (
        <div className="flex flex-col gap-2">
          {GRADE_LEVELS.map((level) => (
            <ToggleChip
              key={level}
              label={level}
              selected={data.grade_level === level}
              onToggle={() => setData((p) => ({ ...p, grade_level: level }))}
            />
          ))}
        </div>
      ),
      valid: data.grade_level.length > 0,
    },
    {
      title: 'Which subjects do you focus on?',
      content: (
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((subject) => (
            <ToggleChip
              key={subject}
              label={subject}
              selected={data.subjects.includes(subject)}
              onToggle={() => toggleArrayField('subjects', subject)}
            />
          ))}
        </div>
      ),
      valid: data.subjects.length > 0,
    },
  ]

  const current = steps[step]
  const isLastStep = step === steps.length - 1

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="mb-2 flex gap-1">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-white' : 'bg-white/10'}`}
          />
        ))}
      </div>

      <div className="mt-6 mb-4">
        <h2 className="text-base font-medium text-white">{current.title}</h2>
      </div>

      <div className="min-h-[140px]">{current.content}</div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="text-sm text-white/40 hover:text-white/60 disabled:pointer-events-none disabled:opacity-0 transition-colors"
        >
          Back
        </button>
        {isLastStep ? (
          <Button onClick={handleSubmit} loading={loading} disabled={!current.valid}>
            Finish setup
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!current.valid}>
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}

function ToggleChip({
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
      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
        selected
          ? 'border-white/40 bg-white/15 text-white'
          : 'border-white/10 bg-transparent text-white/50 hover:border-white/20 hover:text-white/70'
      }`}
    >
      {label}
    </button>
  )
}
