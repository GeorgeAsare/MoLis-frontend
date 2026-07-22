import { describe, it, expect } from 'vitest'
import type { QuizQuestion } from '@/types/quiz'
import type { AnswerState } from '@/types/quizAttempt'

// ── Pure helpers mirrored from QuizPanel.tsx ──────────────────────────────────

function gradeAnswer(question: QuizQuestion, answer: AnswerState): boolean | null {
  if (!answer.revealed) return null
  if (question.type === 'multiple_choice' || question.type === 'scenario') {
    return typeof answer.selected === 'number' && answer.selected === question.correct_index
  }
  if (question.type === 'true_false') {
    return typeof answer.selected === 'boolean' && answer.selected === question.correct
  }
  return answer.selfCorrect
}

function computeScore(questions: QuizQuestion[], answers: AnswerState[]) {
  let correct = 0
  for (let i = 0; i < questions.length; i++) {
    if (gradeAnswer(questions[i], answers[i]) === true) correct++
  }
  return { correct, total: questions.length }
}

function canAdvance(question: QuizQuestion, answer: AnswerState): boolean {
  if (!answer.revealed) return false
  if (question.type === 'short_answer') return answer.selfCorrect !== null
  return true
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mcQuestion: QuizQuestion = {
  type: 'multiple_choice',
  question: 'Which is a primitive type in Python?',
  options: ['int', 'list', 'dict', 'tuple'],
  correct_index: 0,
  explanation: 'int is a primitive',
  concept_id: 'c1',
  concept_title: 'Python Types',
}

const tfQuestion: QuizQuestion = {
  type: 'true_false',
  question: 'Python is dynamically typed',
  correct: true,
  explanation: 'Yes, Python is dynamically typed',
  concept_id: 'c2',
  concept_title: 'Python Typing',
}

const saQuestion: QuizQuestion = {
  type: 'short_answer',
  question: 'What is a closure?',
  model_answer: 'A function that captures its enclosing scope',
  key_points: ['lexical scope', 'captures variables'],
  explanation: 'A closure captures the environment of its definition',
  concept_id: 'c3',
  concept_title: 'Closures',
}

// ── gradeAnswer ───────────────────────────────────────────────────────────────

describe('gradeAnswer', () => {
  it('returns null when answer is not revealed', () => {
    const a: AnswerState = { selected: 0, revealed: false, selfCorrect: null }
    expect(gradeAnswer(mcQuestion, a)).toBeNull()
  })

  it('grades MC correct when correct index selected', () => {
    const a: AnswerState = { selected: 0, revealed: true, selfCorrect: null }
    expect(gradeAnswer(mcQuestion, a)).toBe(true)
  })

  it('grades MC incorrect when wrong index selected', () => {
    const a: AnswerState = { selected: 2, revealed: true, selfCorrect: null }
    expect(gradeAnswer(mcQuestion, a)).toBe(false)
  })

  it('grades TF correct', () => {
    const a: AnswerState = { selected: true, revealed: true, selfCorrect: null }
    expect(gradeAnswer(tfQuestion, a)).toBe(true)
  })

  it('grades TF incorrect', () => {
    const a: AnswerState = { selected: false, revealed: true, selfCorrect: null }
    expect(gradeAnswer(tfQuestion, a)).toBe(false)
  })

  it('uses selfCorrect for short_answer', () => {
    const correct: AnswerState = { selected: null, revealed: true, selfCorrect: true }
    const wrong: AnswerState = { selected: null, revealed: true, selfCorrect: false }
    expect(gradeAnswer(saQuestion, correct)).toBe(true)
    expect(gradeAnswer(saQuestion, wrong)).toBe(false)
  })

  it('returns null for unrevealed short_answer', () => {
    const a: AnswerState = { selected: null, revealed: false, selfCorrect: null }
    expect(gradeAnswer(saQuestion, a)).toBeNull()
  })
})

// ── computeScore ──────────────────────────────────────────────────────────────

describe('computeScore', () => {
  it('counts correct answers', () => {
    const questions = [mcQuestion, tfQuestion]
    const answers: AnswerState[] = [
      { selected: 0, revealed: true, selfCorrect: null },    // correct
      { selected: false, revealed: true, selfCorrect: null }, // wrong (correct is true)
    ]
    const { correct, total } = computeScore(questions, answers)
    expect(correct).toBe(1)
    expect(total).toBe(2)
  })

  it('returns 0 correct when no answers revealed', () => {
    const questions = [mcQuestion]
    const answers: AnswerState[] = [{ selected: 0, revealed: false, selfCorrect: null }]
    const { correct } = computeScore(questions, answers)
    expect(correct).toBe(0)
  })

  it('handles perfect score', () => {
    const questions = [mcQuestion, tfQuestion]
    const answers: AnswerState[] = [
      { selected: 0, revealed: true, selfCorrect: null },
      { selected: true, revealed: true, selfCorrect: null },
    ]
    const { correct, total } = computeScore(questions, answers)
    expect(correct).toBe(2)
    expect(total).toBe(2)
  })
})

// ── canAdvance ────────────────────────────────────────────────────────────────

describe('canAdvance', () => {
  it('cannot advance when not revealed', () => {
    const a: AnswerState = { selected: 0, revealed: false, selfCorrect: null }
    expect(canAdvance(mcQuestion, a)).toBe(false)
  })

  it('can advance MC after reveal', () => {
    const a: AnswerState = { selected: 0, revealed: true, selfCorrect: null }
    expect(canAdvance(mcQuestion, a)).toBe(true)
  })

  it('cannot advance SA until selfCorrect set', () => {
    const a: AnswerState = { selected: null, revealed: true, selfCorrect: null }
    expect(canAdvance(saQuestion, a)).toBe(false)
  })

  it('can advance SA after selfCorrect set', () => {
    const a: AnswerState = { selected: null, revealed: true, selfCorrect: true }
    expect(canAdvance(saQuestion, a)).toBe(true)
  })
})
