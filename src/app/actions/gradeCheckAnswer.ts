'use server'

import OpenAI from 'openai'
import { recordConceptResult } from '@/app/actions/conceptMastery'
import type { CheckMeta } from '@/types/tutor'

export interface GradeCheckInput {
  studentAnswer: string
  lastTutorMessage: string
  checkMeta: CheckMeta
}

export interface GradeCheckResult {
  correct: boolean
  concept_title: string
  brief_feedback: string
}

// Short acknowledgements are never real answers — skip grading entirely to save an API call
// and to keep pendingCheck alive so the student is still prompted to actually answer.
const NON_ANSWER_WORDS = new Set([
  'okay', 'ok', 'yes', 'yeah', 'yep', 'yup', 'got it', 'makes sense',
  'understood', 'alright', 'cool', 'thanks', 'thank you', 'i see',
  'i get it', 'sure', 'nice', 'great', 'perfect', 'sounds good',
  'good', 'right', 'gotcha', 'noted', 'k', 'fair enough',
])

function isNonAnswer(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[.!?,]+$/, '')
  return NON_ANSWER_WORDS.has(normalized)
}

const GRADE_SYSTEM = `You are grading a student's answer to a check question from an AI tutor.

Respond with ONLY valid JSON in this exact shape:
{
  "is_check_answer": true | false,
  "correct": true | false,
  "brief_feedback": "one short sentence"
}

Rules:
- Set is_check_answer to FALSE if the student is:
  • Asking a new question ("Can you explain...", "What does X mean?", "How does Y work?")
  • Requesting more detail, examples, code, diagrams, or analogies
  • Saying "I don't know", "explain again", "can you show me", "one more example"
  • Asking a clarifying question about the check question itself
- Set is_check_answer to TRUE only if the student is genuinely attempting to answer the check question, even if partially or incorrectly.
- Grade generously: partial correct understanding counts as correct.
- brief_feedback must be ≤ 12 words. If correct: reinforce the idea. If wrong: name the mistake.
- When is_check_answer is false, set correct to false and brief_feedback to "".`

export async function gradeCheckAnswer(
  documentId: string,
  { studentAnswer, lastTutorMessage, checkMeta }: GradeCheckInput,
): Promise<GradeCheckResult | null> {
  if (!process.env.OPENAI_API_KEY) return null
  // Hard-skip acknowledgements before spending an API call — keep pendingCheck alive
  if (isNonAnswer(studentAnswer)) return null

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const userPrompt =
    `Tutor's message (contains check question):\n${lastTutorMessage.slice(0, 600)}\n\n` +
    `Check question: ${checkMeta.question}\n\n` +
    `Student's reply: ${studentAnswer.slice(0, 300)}`

  let parsed: { is_check_answer: boolean; correct: boolean; brief_feedback: string }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GRADE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed.is_check_answer) return null

  const correct = Boolean(parsed.correct)
  const brief_feedback = parsed.brief_feedback ?? ''

  try {
    await recordConceptResult(documentId, {
      concept_id: checkMeta.concept_id,
      concept_title: checkMeta.concept_title,
      correct,
      source: 'ai_tutor',
      question: checkMeta.question,
      wrong_answer: correct ? null : studentAnswer.slice(0, 200),
      correct_answer: correct ? studentAnswer.slice(0, 200) : undefined,
    })
  } catch {
    // mastery update failed — don't surface error to user
  }

  return { correct, concept_title: checkMeta.concept_title, brief_feedback }
}
