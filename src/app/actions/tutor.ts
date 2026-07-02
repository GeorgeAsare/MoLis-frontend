'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getStudentIntelligence } from '@/app/actions/studentIntelligence'
import { getStudyPlan } from '@/app/actions/studyPlan'
import type { AskTutorInput, TutorMode, TutorResponse } from '@/types/tutor'
import type { DocumentAnalysis } from '@/types/documentAnalysis'
import type { ConceptMastery, MistakePattern } from '@/types/conceptMastery'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_TEXT_LIMIT = 8_000

const MISTAKE_KEYWORDS = [
  'mistake', 'wrong', 'incorrect', 'why was i', 'why wasn',
  'last question', 'my answer', 'got wrong', 'explain my mistake',
]

// ── Types ─────────────────────────────────────────────────────────────────────

type MasteryRow = Pick<
  ConceptMastery,
  | 'concept_title'
  | 'mastery_score'
  | 'incorrect_count'
  | 'last_reviewed_at'
  | 'forgetting_risk'
  | 'mistake_patterns'
>

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are MoLis Tutor — a personalised AI tutor built into a student's study app.

You have access to:
• The student's uploaded document (analysed below)
• Their quiz results and exact wrong answers (RECENT MISTAKES section)
• Their mastery score per concept
• Their adaptive study plan

TEACHING FORMAT — use this structure for most answers:
What happened: [1 sentence naming the concept or the mistake]
Correct idea: [2–3 sentences on what's right, from the document]
Why the confusion: [1–2 sentences on the likely misunderstanding]
Example: [brief concrete example from the document]
Check: [one short question to verify their understanding]
Next step: [specific named action — mention the concept, not just "review flashcards"]

Adapt the format to the question — skip sections that don't apply. Keep answers to ~200 words unless more depth is clearly needed.

Rules:
• Ground answers in the provided document material
• Use RECENT MISTAKES data when available — name the exact concept and wrong answer
• If exact quiz answer data is missing: say "I can see [concept] is a weak area but don't have your exact answer saved yet"
• Be specific: name the concept, not just "this topic"
• Do not say "this isn't in your document" unless you have genuinely checked the full content provided
• Never hallucinate facts
• Do not repeat the question back or pad with filler`

// ── Mode instructions ─────────────────────────────────────────────────────────

const MODE_INSTRUCTION: Record<TutorMode, string> = {
  explain:
    'Explain clearly using the document material. Use the teaching format. Include a concrete example.',

  quiz_help:
    `QUIZ HELP MODE — the student answered something wrong.
Check RECENT MISTAKES first. If mistake data is available: name the exact concept, the wrong answer they gave, and the correct answer.
If no mistake data is saved yet: say "I can see [concept] is a weak area but don't have your exact answer saved yet."
Then follow the teaching format fully: What happened → Correct idea → Why the confusion → Example → Check question → Next step.
Be direct. Do not pad.`,

  exam_prep:
    'Frame the answer for exam conditions. Highlight what an examiner wants to see: key terms, structure, and common traps. End with a check question testing exam-readiness.',

  weak_topic:
    'The student is weak here. Start from first principles. Be extra clear and concrete. Address the most likely misconception before explaining the correct idea. Build up step by step.',

  simplify:
    'Use plain language, everyday analogies, and short sentences. Imagine explaining to a bright 16-year-old who has never studied this subject. Avoid jargon — or define it immediately when used.',

  next_step:
    'Tell the student exactly what to study next, why, and in what order. Reference their specific weak concepts by name. Point to their highest-priority study block. Be concrete, not generic.',
}

const MODE_LABEL: Record<TutorMode, string> = {
  explain:    'Explain',
  quiz_help:  'Quiz Help',
  exam_prep:  'Exam Prep',
  weak_topic: 'Weak Topic',
  simplify:   'Simplify',
  next_step:  'Next Step',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatMistake(mp: MistakePattern): string {
  const lines: string[] = []
  if (mp.question) lines.push(`  Q: "${mp.question.slice(0, 120)}"`)
  if (mp.wrong_answer) lines.push(`  Student answered: "${mp.wrong_answer}"`)
  lines.push(`  Correct answer: "${mp.correct_answer}"`)
  return lines.join('\n')
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildContext(
  title: string,
  extractedText: string | null,
  analysis: DocumentAnalysis | null,
  masteryRows: MasteryRow[],
  isMistakeFocused: boolean,
  readiness: number,
  masteredCount: number,
  weakCount: number,
  recommendedNextAction: string,
  planBlocks: { concept_title: string; block_type: string; estimated_minutes: number; reason: string }[],
): string {
  const lines: string[] = []

  lines.push(`DOCUMENT: "${title}"`)

  if (analysis) {
    lines.push(`Subject: ${analysis.subject_area} | Difficulty: ${analysis.difficulty_level}`)
    lines.push('')

    if (analysis.sections.length > 0) {
      lines.push('SECTIONS:')
      for (const s of analysis.sections.slice(0, 8)) {
        const pts = s.key_points.slice(0, 3).join(' · ')
        lines.push(`• ${s.heading}: ${s.summary}${pts ? `\n  Points: ${pts}` : ''}`)
      }
      lines.push('')
    }

    const coreConcepts = analysis.key_concepts
      .filter(c => c.importance === 'core' || c.importance === 'supporting')
      .slice(0, 15)
    if (coreConcepts.length > 0) {
      lines.push('KEY CONCEPTS:')
      for (const c of coreConcepts) {
        lines.push(`• ${c.concept}: ${c.explanation}`)
      }
      lines.push('')
    }

    if (analysis.definitions.length > 0) {
      lines.push('DEFINITIONS:')
      for (const d of analysis.definitions.slice(0, 10)) {
        lines.push(`• ${d.term}: ${d.definition}`)
      }
      lines.push('')
    }

    if (analysis.misconceptions.length > 0) {
      lines.push('COMMON MISCONCEPTIONS (address proactively when relevant):')
      for (const m of analysis.misconceptions) {
        lines.push(`• WRONG: "${m.misconception}" → CORRECT: "${m.correction}"`)
      }
      lines.push('')
    }

    if (analysis.formulas.length > 0) {
      lines.push('FORMULAS:')
      for (const f of analysis.formulas) {
        lines.push(`• ${f.expression}: ${f.description}`)
      }
      lines.push('')
    }
  } else if (extractedText?.trim()) {
    lines.push('')
    lines.push('DOCUMENT CONTENT:')
    lines.push(extractedText.slice(0, DOC_TEXT_LIMIT))
    lines.push('')
  }

  // ── Student state ──────────────────────────────────────────────────────────

  lines.push('STUDENT STATE:')
  lines.push(`• Exam readiness: ${readiness}%`)
  lines.push(`• Mastered: ${masteredCount} concepts | Needs work: ${weakCount} concepts`)

  // Sort weakest first for the summary list
  const weakest = [...masteryRows].sort((a, b) => a.mastery_score - b.mastery_score).slice(0, 5)
  if (weakest.length > 0) {
    lines.push('• Weakest concepts:')
    for (const wc of weakest) {
      const risk = wc.forgetting_risk !== 'low' ? ` [${wc.forgetting_risk} forgetting risk]` : ''
      lines.push(
        `  - ${wc.concept_title}: ${wc.mastery_score}% mastery, ${wc.incorrect_count} misses${risk}`,
      )
    }
  }
  lines.push('')

  // ── Recent mistakes — always included, but prioritised when mistake-focused ──

  const withMistakes = [...masteryRows]
    .filter(r => r.mistake_patterns.length > 0)
    .sort((a, b) => {
      // Sort by most recent activity first
      const aTime = a.last_reviewed_at ? new Date(a.last_reviewed_at).getTime() : 0
      const bTime = b.last_reviewed_at ? new Date(b.last_reviewed_at).getTime() : 0
      return bTime - aTime
    })

  if (withMistakes.length > 0) {
    lines.push(
      isMistakeFocused
        ? 'RECENT QUIZ MISTAKES (USE THIS FIRST — the student is asking about a wrong answer):'
        : 'RECENT QUIZ MISTAKES:',
    )
    for (const r of withMistakes.slice(0, 3)) {
      lines.push(`Concept: ${r.concept_title} | Mastery: ${r.mastery_score}% | Misses: ${r.incorrect_count} | Last seen: ${relativeTime(r.last_reviewed_at)}`)
      // Show the most recent mistake pattern with full detail
      const recent = [...r.mistake_patterns].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      const top = recent[0]
      if (top) lines.push(formatMistake(top))
      // If multiple mistakes, show one more
      if (recent[1]) {
        lines.push('  Also missed:')
        lines.push(formatMistake(recent[1]))
      }
      lines.push('')
    }
  } else if (isMistakeFocused) {
    lines.push('RECENT QUIZ MISTAKES: No mistake data saved yet for this document.')
    lines.push('')
  }

  // ── Study plan ─────────────────────────────────────────────────────────────

  lines.push('STUDY PLAN:')
  lines.push(`• Next action: ${recommendedNextAction}`)
  if (planBlocks.length > 0) {
    lines.push('• Priority blocks:')
    for (const b of planBlocks.slice(0, 3)) {
      lines.push(`  - ${b.concept_title} (${b.block_type}, ${b.estimated_minutes}min): ${b.reason}`)
    }
  }

  return lines.join('\n')
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function askTutor({
  documentId,
  question,
  mode,
  recentMessages,
}: AskTutorInput): Promise<TutorResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const isMistakeFocused =
    mode === 'quiz_help' ||
    MISTAKE_KEYWORDS.some(kw => question.toLowerCase().includes(kw))

  // Parallel fetch — richer mastery fields for mistake context
  const [docResult, analysisResult, masteryResult, intelligence, plan] = await Promise.all([
    supabase
      .from('documents')
      .select('user_id, title, extracted_text')
      .eq('id', documentId)
      .single(),
    supabase
      .from('document_analysis')
      .select('*')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('concept_mastery')
      .select('concept_title, mastery_score, incorrect_count, last_reviewed_at, forgetting_risk, mistake_patterns')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .gt('review_count', 0)
      .order('mastery_score', { ascending: true })
      .limit(15),
    getStudentIntelligence(documentId),
    getStudyPlan(documentId),
  ])

  if (!docResult.data || docResult.data.user_id !== user.id) {
    throw new Error('Document not found.')
  }

  const doc = docResult.data
  const analysis = (analysisResult.data as DocumentAnalysis | null) ?? null
  const masteryRows = (masteryResult.data as MasteryRow[] | null) ?? []

  const context = buildContext(
    doc.title,
    doc.extracted_text ?? null,
    analysis,
    masteryRows,
    isMistakeFocused,
    intelligence.overall_exam_readiness,
    intelligence.mastered_count,
    intelligence.weak_count,
    plan.recommended_next_action,
    plan.study_blocks,
  )

  const systemMessage = `${SYSTEM_PROMPT}\n\n${context}`

  // Last 6 messages = 3 turns of conversation context
  const history = recentMessages.slice(-6).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const modePrefix = isMistakeFocused && mode !== 'quiz_help'
    ? `[Mode: ${MODE_LABEL[mode]}] Note: the student appears to be asking about a wrong answer — use RECENT QUIZ MISTAKES data.\n\n`
    : `[Mode: ${MODE_LABEL[mode]}]\n${MODE_INSTRUCTION[mode]}\n\n`

  const currentMessage = `${modePrefix}${question}`

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let content: string
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.45,
      max_tokens: 650,
      messages: [
        { role: 'system', content: systemMessage },
        ...history,
        { role: 'user', content: currentMessage },
      ],
    })
    content = completion.choices[0]?.message?.content?.trim() ?? ''
    if (!content) throw new Error('Empty response from OpenAI.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('quota')) {
      throw new Error('Rate limit reached. Please wait a moment and try again.')
    }
    if (msg.includes('401') || msg.includes('Incorrect API key')) {
      throw new Error('Invalid OpenAI API key.')
    }
    throw new Error(`Tutor error: ${msg}`)
  }

  return { answer: content, mode }
}
