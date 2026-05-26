'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type {
  Quiz,
  QuizQuestion,
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  ShortAnswerQuestion,
  ScenarioQuestion,
} from '@/types/quiz'

// ── Prompt constants ──────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 14_000

const SYSTEM_PROMPT = `You are an expert academic tutor creating interactive quiz questions for university students. Generate engaging, exam-relevant questions that test deep understanding. Always respond with a single valid JSON object. No markdown, no prose outside the JSON.`

function buildUserPrompt(title: string, text: string): string {
  const body =
    text.length > TEXT_CHAR_LIMIT
      ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated for processing]'
      : text

  return `Create an interactive quiz for this document.

Title: ${title}

Content:
${body}

Respond with ONLY a JSON object in this exact schema:
{
  "title": "Quiz: descriptive title",
  "questions": [
    { "type": "multiple_choice", "question": "...", "options": ["Option A", "Option B", "Option C", "Option D"], "correct_index": 0, "explanation": "Why this answer is correct..." },
    { "type": "true_false", "question": "A clear factual statement.", "correct": true, "explanation": "..." },
    { "type": "short_answer", "question": "...", "model_answer": "Comprehensive 2–4 sentence answer...", "key_points": ["key point 1", "key point 2", "key point 3"], "explanation": "..." },
    { "type": "scenario", "question": "Scenario context description. Which approach is most appropriate?", "options": ["Option A", "Option B", "Option C", "Option D"], "correct_index": 2, "explanation": "..." }
  ]
}

Rules:
- Exactly 12 questions total: 4 multiple_choice, 3 true_false, 3 short_answer, 2 scenario
- multiple_choice: exactly 4 options, correct_index is 0–3
- true_false: statement must be unambiguously true or false based on the document content
- short_answer: include 2–4 key_points the ideal answer must cover
- scenario: open with a realistic application scenario, then ask which approach is best; 4 options
- All questions must be answerable from the document content only
- explanation must state WHY the correct answer is right, not just restate it
- Questions should test understanding and application, not just surface recall`
}

// ── Validation helpers ────────────────────────────────────────────────────────

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function validateQuestion(q: unknown): QuizQuestion | null {
  if (typeof q !== 'object' || q === null) return null
  const r = q as Record<string, unknown>

  if (r.type === 'multiple_choice' || r.type === 'scenario') {
    if (
      typeof r.question === 'string' &&
      isStringArray(r.options) &&
      r.options.length === 4 &&
      typeof r.correct_index === 'number' &&
      r.correct_index >= 0 &&
      r.correct_index <= 3 &&
      typeof r.explanation === 'string'
    ) {
      return r as unknown as MultipleChoiceQuestion | ScenarioQuestion
    }
    return null
  }

  if (r.type === 'true_false') {
    if (
      typeof r.question === 'string' &&
      typeof r.correct === 'boolean' &&
      typeof r.explanation === 'string'
    ) {
      return r as unknown as TrueFalseQuestion
    }
    return null
  }

  if (r.type === 'short_answer') {
    if (
      typeof r.question === 'string' &&
      typeof r.model_answer === 'string' &&
      isStringArray(r.key_points) &&
      typeof r.explanation === 'string'
    ) {
      return r as unknown as ShortAnswerQuestion
    }
    return null
  }

  return null
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function generateQuiz(documentId: string): Promise<Quiz> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: doc } = await supabase
    .from('documents')
    .select('user_id, title, extracted_text')
    .eq('id', documentId)
    .single()

  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')

  if (!doc.extracted_text?.trim()) {
    throw new Error(
      'No extracted text found. Please extract text from the document first.',
    )
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env.local file.')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let rawContent: string
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 2500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(doc.title, doc.extracted_text) },
      ],
    })

    rawContent = completion.choices[0]?.message?.content ?? ''
    if (!rawContent) throw new Error('OpenAI returned an empty response')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('quota')) {
      throw new Error('OpenAI rate limit reached. Please wait a moment and try again.')
    }
    if (msg.includes('401') || msg.includes('Incorrect API key')) {
      throw new Error('Invalid OpenAI API key. Check your OPENAI_API_KEY in .env.local.')
    }
    throw new Error(`OpenAI error: ${msg}`)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawContent) as Record<string, unknown>
  } catch {
    throw new Error('OpenAI returned malformed JSON. Please try again.')
  }

  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title
      : `${doc.title} — Quiz`

  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : []
  const questions = rawQuestions
    .map(validateQuestion)
    .filter((q): q is QuizQuestion => q !== null)

  if (questions.length === 0) {
    throw new Error('OpenAI returned no valid questions. Please try again.')
  }

  // Replace any prior quiz for this document
  await supabase
    .from('quizzes')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', user.id)

  const { data: saved, error: saveError } = await supabase
    .from('quizzes')
    .insert({
      document_id: documentId,
      user_id: user.id,
      title,
      questions,
      model: 'gpt-4o-mini',
    })
    .select()
    .single()

  if (saveError || !saved) {
    throw new Error(saveError?.message ?? 'Failed to save quiz')
  }

  return saved as Quiz
}
