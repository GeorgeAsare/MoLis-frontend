'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getStudentIntelligence } from '@/app/actions/studentIntelligence'
import { getStudyPlan } from '@/app/actions/studyPlan'
import type {
  AskTutorInput,
  CheckMeta,
  TutorAction,
  TutorActionType,
  TutorMode,
  TutorResponse,
} from '@/types/tutor'
import type { DocumentAnalysis, LearningPathData } from '@/types/documentAnalysis'
import type { MistakePattern } from '@/types/conceptMastery'
import type { ConceptIntelligence, DocumentIntelligence } from '@/types/studentIntelligence'
import type { StudyPlan } from '@/types/studyPlan'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_TEXT_LIMIT = 6_000

// ── Intent classification ─────────────────────────────────────────────────────

type TutorIntent =
  | 'mistake_debug'
  | 'concept_explain'
  | 'next_action'
  | 'prerequisite_gap'
  | 'practice'
  | 'general'

function classifyIntent(question: string, mode: TutorMode): TutorIntent {
  // Mode takes unconditional priority
  if (mode === 'quiz_help')  return 'mistake_debug'
  if (mode === 'next_step')  return 'next_action'
  if (mode === 'weak_topic') return 'practice'

  const q = question.toLowerCase()

  if (['mistake', 'wrong', 'incorrect', 'why was i', 'why wasn', 'last question',
       'my answer', 'got wrong', 'explain my mistake'].some(kw => q.includes(kw)))
    return 'mistake_debug'

  if (['what should i study', 'what next', 'study next', 'what to study', 'where to start',
       'study plan', 'study order', 'next step', 'priority', 'most important',
       'what do i focus', 'what should i focus'].some(kw => q.includes(kw)))
    return 'next_action'

  if (['prerequisite', 'before i can', 'what do i need to know', 'depends on', 'required for',
       'foundation', "don't understand", "dont understand", "can't understand",
       'confused about', 'lost on', 'blocking me', 'build up to'].some(kw => q.includes(kw)))
    return 'prerequisite_gap'

  if (['quiz me', 'test me', 'practice', 'practise', 'drill', 'give me questions',
       'exam question', 'practice question', 'flashcard'].some(kw => q.includes(kw)))
    return 'practice'

  if (['explain', 'what is', 'what are', 'how does', 'how do', 'define', 'definition',
       'what does', 'describe', 'tell me about', 'example of', 'give me an example',
       'show me', 'code example', 'example code'].some(kw => q.includes(kw)))
    return 'concept_explain'

  return 'general'
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are MoLis Tutor — a personalised AI tutor built into a student's study app.

You have access to:
• The student's uploaded document (analysed below)
• Their quiz results and exact wrong answers (RECENT MISTAKES section)
• Their mastery score, forgetting risk, and learning velocity per concept
• Their adaptive study plan and concept dependency graph

TEACHING FORMAT — use this structure for most answers:
What happened: [1 sentence naming the concept or the mistake]
Correct idea: [2–3 sentences on what's right, from the document]
Why the confusion: [1–2 sentences on the likely misunderstanding]
Example: [brief concrete example from the document]
Check (CONCEPT: <exact concept title from KEY CONCEPTS>): [one short question to verify their understanding]
Next step: [specific named action — mention the concept, not just "review flashcards"]

Adapt the format to the question — skip sections that don't apply. Keep answers to ~200 words unless more depth is clearly needed.

Rules:
• Ground answers in the provided document material
• Use RECENT MISTAKES data when available — name the exact concept and wrong answer
• If exact quiz answer data is missing: say "I can see [concept] is a weak area but don't have your exact answer saved yet"
• Be specific: name the concept, not just "this topic"
• Do not say "this isn't in your document" unless you have genuinely checked the full content provided
• Never hallucinate facts
• Do not repeat the question back or pad with filler
• If asked for example code, wrap it in a fenced code block with the language tag (e.g. \`\`\`python ... \`\`\`). Keep examples under 20 lines. After the snippet, explain the key lines in plain English — one short sentence per important part.
• Use DEPENDENCY DATA when available to explain why a concept feels hard (e.g. "Inheritance requires understanding Classes first — your Classes mastery is 40%")

ACTION SUGGESTION (optional — only when clearly warranted):
After your main answer, you may add ONE action on a new line:
ACTION: <type> | <concept_title_or_blank> | <user-facing label>

Valid types: open_flashcards | open_quiz | open_notes | open_visuals | open_weak_topics | continue_tutor

Only include ACTION when the recommendation is unambiguous (e.g. "ACTION: open_flashcards | Mitosis | Practise Mitosis flashcards"). Skip it for general conversational replies.`

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
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatMistake(mp: MistakePattern): string {
  const lines: string[] = []
  if (mp.question)    lines.push(`  Q: "${mp.question.slice(0, 120)}"`)
  if (mp.wrong_answer) lines.push(`  Student answered: "${mp.wrong_answer}"`)
  lines.push(`  Correct answer: "${mp.correct_answer}"`)
  return lines.join('\n')
}

// Rich single-line summary for a concept — used across multiple intent paths
function richConceptLine(c: ConceptIntelligence): string {
  const parts: string[] = [`${c.mastery_score}% mastery`]
  if (c.review_count === 0)      parts.push('not started')
  else if (c.incorrect_count > 0) parts.push(`${c.incorrect_count} misses`)
  if (c.forgetting_risk !== 'low') parts.push(`${c.forgetting_risk} forgetting risk`)
  if (c.learning_velocity > 0)   parts.push(`velocity ${(c.learning_velocity * 100).toFixed(0)}%`)
  if (c.dependency_risk > 0)     parts.push(`${c.dependency_risk} concept${c.dependency_risk > 1 ? 's' : ''} depend on this`)
  if (c.exam_importance === 'high') parts.push('HIGH EXAM PRIORITY')
  if (c.cognitive_load === 'high') parts.push('high cognitive load')
  if (c.error_pattern_summary)   parts.push(`pattern: ${c.error_pattern_summary}`)
  if (c.review_urgency === 'immediate') parts.push('REVIEW NOW')
  if (c.predicted_mastery_7_days !== c.mastery_score)
    parts.push(`predicted 7d: ${c.predicted_mastery_7_days}%`)
  return `• ${c.concept_title}: ${parts.join(' | ')}`
}

function appendStudentState(lines: string[], intelligence: DocumentIntelligence): void {
  lines.push('STUDENT STATE:')
  lines.push(`• Exam readiness: ${intelligence.overall_exam_readiness}%`)
  lines.push(`• Mastered: ${intelligence.mastered_count} | Weak: ${intelligence.weak_count} | Unstarted: ${intelligence.unstarted_count}`)
  lines.push(`• Est. time to exam-ready: ~${intelligence.estimated_minutes_to_exam_ready}min`)
}

// ── Intent-specific context builders ─────────────────────────────────────────

function appendMistakeDebug(
  lines: string[],
  analysis: DocumentAnalysis | null,
  concepts: ConceptIntelligence[],
  intelligence: DocumentIntelligence,
): void {
  if (analysis) {
    lines.push(`Subject: ${analysis.subject_area} | Difficulty: ${analysis.difficulty_level}`)
    if (analysis.misconceptions.length > 0) {
      lines.push('')
      lines.push('COMMON MISCONCEPTIONS:')
      for (const m of analysis.misconceptions)
        lines.push(`• WRONG: "${m.misconception}" → CORRECT: "${m.correction}"`)
    }
  }
  lines.push('')
  appendStudentState(lines, intelligence)
  lines.push('')

  // All concepts with mistakes, most recent first
  const withMistakes = concepts
    .filter(c => c.mistake_patterns.length > 0)
    .sort((a, b) => {
      const at = a.last_reviewed_at ? new Date(a.last_reviewed_at).getTime() : 0
      const bt = b.last_reviewed_at ? new Date(b.last_reviewed_at).getTime() : 0
      return bt - at
    })

  if (withMistakes.length > 0) {
    lines.push('RECENT QUIZ MISTAKES (USE THIS FIRST — the student is asking about a wrong answer):')
    for (const c of withMistakes.slice(0, 5)) {
      lines.push(`Concept: ${c.concept_title} | Mastery: ${c.mastery_score}% | Misses: ${c.incorrect_count} | ${relativeTime(c.last_reviewed_at)}`)
      const sorted = [...c.mistake_patterns].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      if (sorted[0]) lines.push(formatMistake(sorted[0]))
      if (sorted[1]) { lines.push('  Also missed:'); lines.push(formatMistake(sorted[1])) }
      lines.push('')
    }
  } else {
    lines.push('RECENT QUIZ MISTAKES: No mistake data saved yet for this document.')
    lines.push('')
  }

  // Weak concepts with rich detail
  const weak = concepts.filter(c => c.mastery_score < 60).sort((a, b) => a.mastery_score - b.mastery_score).slice(0, 6)
  if (weak.length > 0) {
    lines.push('WEAK CONCEPTS:')
    for (const c of weak) lines.push(richConceptLine(c))
  }
}

function appendConceptExplain(
  lines: string[],
  analysis: DocumentAnalysis | null,
  extractedText: string | null,
  concepts: ConceptIntelligence[],
  intelligence: DocumentIntelligence,
): void {
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
      .slice(0, 20)
    if (coreConcepts.length > 0) {
      lines.push('KEY CONCEPTS:')
      for (const c of coreConcepts) lines.push(`• ${c.concept}: ${c.explanation}`)
      lines.push('')
    }
    if (analysis.definitions.length > 0) {
      lines.push('DEFINITIONS:')
      for (const d of analysis.definitions.slice(0, 15)) lines.push(`• ${d.term}: ${d.definition}`)
      lines.push('')
    }
    if (analysis.formulas.length > 0) {
      lines.push('FORMULAS:')
      for (const f of analysis.formulas) lines.push(`• ${f.expression}: ${f.description}`)
      lines.push('')
    }
    if (analysis.misconceptions.length > 0) {
      lines.push('MISCONCEPTIONS:')
      for (const m of analysis.misconceptions)
        lines.push(`• WRONG: "${m.misconception}" → CORRECT: "${m.correction}"`)
      lines.push('')
    }
  } else if (extractedText?.trim()) {
    lines.push('DOCUMENT CONTENT:')
    lines.push(extractedText.slice(0, DOC_TEXT_LIMIT))
    lines.push('')
  }
  appendStudentState(lines, intelligence)
  const started = concepts.filter(c => c.review_count > 0).slice(0, 6)
  if (started.length > 0) {
    lines.push('• Concept progress (for context):')
    for (const c of started)
      lines.push(`  - ${c.concept_title}: ${c.mastery_score}%${c.forgetting_risk !== 'low' ? ` [${c.forgetting_risk} forgetting risk]` : ''}`)
  }
}

function appendNextAction(
  lines: string[],
  concepts: ConceptIntelligence[],
  intelligence: DocumentIntelligence,
  plan: StudyPlan,
): void {
  lines.push(`Exam readiness: ${intelligence.overall_exam_readiness}%`)
  lines.push(`Mastered: ${intelligence.mastered_count} | Weak: ${intelligence.weak_count} | Unstarted: ${intelligence.unstarted_count}`)
  lines.push(`Est. time to exam-ready: ~${intelligence.estimated_minutes_to_exam_ready}min`)
  lines.push('')
  lines.push('STUDY PLAN:')
  lines.push(`• Recommended next: ${plan.recommended_next_action}`)
  lines.push(`• Why: ${plan.why_this_plan}`)
  if (plan.urgent_reviews.length > 0) {
    const names = plan.urgent_reviews.map(id => concepts.find(c => c.concept_id === id)?.concept_title ?? id)
    lines.push(`• URGENT REVIEWS: ${names.join(', ')}`)
  }
  if (plan.quick_wins.length > 0) {
    const names = plan.quick_wins.slice(0, 3).map(id => concepts.find(c => c.concept_id === id)?.concept_title ?? id)
    lines.push(`• Quick wins: ${names.join(', ')}`)
  }
  if (plan.blocked_concepts.length > 0) {
    const names = plan.blocked_concepts.map(id => concepts.find(c => c.concept_id === id)?.concept_title ?? id)
    lines.push(`• Blocked by prerequisites: ${names.join(', ')}`)
  }
  lines.push('')
  lines.push('PRIORITY STUDY BLOCKS:')
  for (const b of plan.study_blocks.slice(0, 5))
    lines.push(`• ${b.concept_title} (${b.block_type}, ${b.estimated_minutes}min): ${b.reason}`)
  lines.push('')

  // High-priority concepts with urgency/exam data
  const topConcepts = concepts
    .filter(c => c.review_urgency === 'immediate' || c.review_urgency === 'soon' || c.exam_priority > 30)
    .sort((a, b) => b.exam_priority - a.exam_priority)
    .slice(0, 8)
  if (topConcepts.length > 0) {
    lines.push('HIGH-PRIORITY CONCEPTS:')
    for (const c of topConcepts) lines.push(richConceptLine(c))
  }
}

function appendPrerequisiteGap(
  lines: string[],
  analysis: DocumentAnalysis | null,
  concepts: ConceptIntelligence[],
  intelligence: DocumentIntelligence,
  learningPath: LearningPathData | null,
): void {
  if (analysis) lines.push(`Subject: ${analysis.subject_area} | Difficulty: ${analysis.difficulty_level}`)
  lines.push('')
  appendStudentState(lines, intelligence)
  lines.push('')

  const conceptById = new Map(concepts.map(c => [c.concept_id, c]))

  // Concepts blocked because prerequisites are not mastered
  const blocked = concepts.filter(c =>
    c.prerequisites.some(pid => (conceptById.get(pid)?.mastery_score ?? 0) < 40),
  )
  if (blocked.length > 0) {
    lines.push('BLOCKED CONCEPTS (prerequisites not mastered):')
    for (const c of blocked) {
      const unmet = c.prerequisites
        .map(pid => conceptById.get(pid))
        .filter((p): p is ConceptIntelligence => !!p && p.mastery_score < 40)
      lines.push(`• ${c.concept_title} (${c.mastery_score}% mastery) requires:`)
      for (const p of unmet)
        lines.push(`  - ${p.concept_title}: ${p.mastery_score}% — STUDY THIS FIRST`)
    }
    lines.push('')
  }

  // Full dependency map
  lines.push('DEPENDENCY MAP:')
  for (const c of concepts.slice(0, 15)) {
    if (c.prerequisites.length === 0 && c.unlocks.length === 0) continue
    const prereqNames = c.prerequisites.map(pid => conceptById.get(pid)?.concept_title ?? pid)
    const unlockNames = c.unlocks.map(uid => conceptById.get(uid)?.concept_title ?? uid)
    const parts: string[] = [`${c.mastery_score}% mastery`]
    if (prereqNames.length > 0) parts.push(`requires: ${prereqNames.join(', ')}`)
    if (unlockNames.length > 0) parts.push(`unlocks: ${unlockNames.join(', ')}`)
    lines.push(`• ${c.concept_title}: ${parts.join(' | ')}`)
  }

  if (learningPath && learningPath.steps.length > 0) {
    lines.push('')
    lines.push('RECOMMENDED LEARNING ORDER:')
    learningPath.steps.slice(0, 10).forEach((s, i) => {
      const c = conceptById.get(s.concept_id)
      const mastery = c ? ` (${c.mastery_score}%)` : ''
      const examNote = s.exam_importance === 'high' ? ' [HIGH EXAM]' : ''
      lines.push(`  ${i + 1}. ${s.title}${mastery}${examNote} — ${s.importance ?? 'concept'}, ~${s.estimated_minutes}min`)
    })
  }
}

function appendPractice(
  lines: string[],
  concepts: ConceptIntelligence[],
  intelligence: DocumentIntelligence,
): void {
  appendStudentState(lines, intelligence)
  lines.push('')

  // Weak concepts, sorted by mastery
  const weak = concepts
    .filter(c => c.review_count > 0)
    .sort((a, b) => a.mastery_score - b.mastery_score)
    .slice(0, 8)
  if (weak.length > 0) {
    lines.push('WEAK CONCEPTS (practise these):')
    for (const c of weak) lines.push(richConceptLine(c))
    lines.push('')
  }

  // Exam-critical concepts not yet mastered
  const examTopics = concepts
    .filter(c => (c.is_exam_topic || c.exam_importance === 'high') && c.mastery_score < 80)
    .sort((a, b) => a.mastery_score - b.mastery_score)
    .slice(0, 5)
  if (examTopics.length > 0) {
    lines.push('EXAM-IMPORTANT (not yet mastered):')
    for (const c of examTopics)
      lines.push(`• ${c.concept_title}: ${c.mastery_score}% mastery | exam ${c.exam_importance ?? 'topic'}`)
    lines.push('')
  }

  // Recent mistakes for practice targeting
  const withMistakes = concepts.filter(c => c.mistake_patterns.length > 0).slice(0, 3)
  if (withMistakes.length > 0) {
    lines.push('RECENT MISTAKES TO PRACTISE:')
    for (const c of withMistakes) {
      const recent = [...c.mistake_patterns].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0]
      if (recent) lines.push(`• ${c.concept_title}:${formatMistake(recent)}`)
    }
  }
}

function appendGeneral(
  lines: string[],
  analysis: DocumentAnalysis | null,
  extractedText: string | null,
  concepts: ConceptIntelligence[],
  intelligence: DocumentIntelligence,
  plan: StudyPlan,
): void {
  if (analysis) {
    lines.push(`Subject: ${analysis.subject_area} | Difficulty: ${analysis.difficulty_level}`)
    lines.push('')
    if (analysis.sections.length > 0) {
      lines.push('SECTIONS:')
      for (const s of analysis.sections.slice(0, 6))
        lines.push(`• ${s.heading}: ${s.summary}`)
      lines.push('')
    }
    const coreConcepts = analysis.key_concepts.filter(c => c.importance === 'core').slice(0, 12)
    if (coreConcepts.length > 0) {
      lines.push('KEY CONCEPTS:')
      for (const c of coreConcepts) lines.push(`• ${c.concept}: ${c.explanation}`)
      lines.push('')
    }
    if (analysis.definitions.length > 0) {
      lines.push('DEFINITIONS:')
      for (const d of analysis.definitions.slice(0, 8)) lines.push(`• ${d.term}: ${d.definition}`)
      lines.push('')
    }
    if (analysis.misconceptions.length > 0) {
      lines.push('MISCONCEPTIONS:')
      for (const m of analysis.misconceptions)
        lines.push(`• WRONG: "${m.misconception}" → CORRECT: "${m.correction}"`)
      lines.push('')
    }
  } else if (extractedText?.trim()) {
    lines.push('DOCUMENT CONTENT:')
    lines.push(extractedText.slice(0, DOC_TEXT_LIMIT))
    lines.push('')
  }

  appendStudentState(lines, intelligence)
  const weakest = concepts.filter(c => c.review_count > 0).sort((a, b) => a.mastery_score - b.mastery_score).slice(0, 5)
  if (weakest.length > 0) {
    lines.push('• Weakest concepts:')
    for (const c of weakest)
      lines.push(`  - ${c.concept_title}: ${c.mastery_score}% | ${c.forgetting_risk} forgetting risk`)
  }
  lines.push('')

  // Compact mistakes
  const withMistakes = concepts
    .filter(c => c.mistake_patterns.length > 0)
    .sort((a, b) => {
      const at = a.last_reviewed_at ? new Date(a.last_reviewed_at).getTime() : 0
      const bt = b.last_reviewed_at ? new Date(b.last_reviewed_at).getTime() : 0
      return bt - at
    })
  if (withMistakes.length > 0) {
    lines.push('RECENT QUIZ MISTAKES:')
    for (const r of withMistakes.slice(0, 3)) {
      lines.push(`Concept: ${r.concept_title} | Mastery: ${r.mastery_score}% | ${relativeTime(r.last_reviewed_at)}`)
      const recent = [...r.mistake_patterns].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0]
      if (recent) lines.push(formatMistake(recent))
      lines.push('')
    }
  }

  lines.push('STUDY PLAN:')
  lines.push(`• Next action: ${plan.recommended_next_action}`)
  for (const b of plan.study_blocks.slice(0, 3))
    lines.push(`  - ${b.concept_title} (${b.block_type}, ${b.estimated_minutes}min): ${b.reason}`)
}

// ── Main context dispatcher ───────────────────────────────────────────────────

function buildContext(
  intent: TutorIntent,
  title: string,
  extractedText: string | null,
  analysis: DocumentAnalysis | null,
  intelligence: DocumentIntelligence,
  plan: StudyPlan,
  learningPath: LearningPathData | null,
): string {
  const lines: string[] = [`DOCUMENT: "${title}"`, `INTENT: ${intent}`, '']
  const concepts = intelligence.concepts

  switch (intent) {
    case 'mistake_debug':
      appendMistakeDebug(lines, analysis, concepts, intelligence)
      break
    case 'concept_explain':
      appendConceptExplain(lines, analysis, extractedText, concepts, intelligence)
      break
    case 'next_action':
      appendNextAction(lines, concepts, intelligence, plan)
      break
    case 'prerequisite_gap':
      appendPrerequisiteGap(lines, analysis, concepts, intelligence, learningPath)
      break
    case 'practice':
      appendPractice(lines, concepts, intelligence)
      break
    default:
      appendGeneral(lines, analysis, extractedText, concepts, intelligence, plan)
  }

  return lines.join('\n')
}

// ── Action tag parser ─────────────────────────────────────────────────────────

const VALID_ACTION_TYPES = new Set<TutorActionType>([
  'open_notes', 'open_flashcards', 'open_quiz',
  'open_visuals', 'open_weak_topics', 'continue_tutor',
])

function parseActionTag(text: string): { answer: string; suggestedAction: TutorAction | null } {
  const match = text.match(/\nACTION:\s*(\w+)\s*\|\s*([^|\n]*)\s*\|\s*(.+)/m)
  if (!match) return { answer: text.trim(), suggestedAction: null }

  const type = match[1].trim() as TutorActionType
  if (!VALID_ACTION_TYPES.has(type)) return { answer: text.trim(), suggestedAction: null }

  const concept_title = match[2].trim() || undefined
  const label = match[3].trim()

  const answer = text.replace(/\n?ACTION:\s*[^\n]+/m, '').trim()

  return { answer, suggestedAction: { type, concept_title, label } }
}

// ── Check-line parser ─────────────────────────────────────────────────────────

function parseCheckMeta(text: string, concepts: ConceptIntelligence[]): CheckMeta | null {
  const match = text.match(/Check\s*\(CONCEPT:\s*([^)]+)\)\s*:\s*(.+?)(?:\n|$)/i)
  if (!match) return null

  const concept_title = match[1].trim()
  const question = match[2].trim()

  const found = concepts.find(c => c.concept_title.toLowerCase() === concept_title.toLowerCase())
  const concept_id = found?.concept_id ?? `tutor-${concept_title.toLowerCase().replace(/\s+/g, '-')}`

  return { concept_id, concept_title, question }
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const intent = classifyIntent(question, mode)

  // Drop the separate mastery query — intelligence.concepts has all mastery fields
  // including mistake_patterns, forgetting_risk, dependency data, and predictive scores
  const [docResult, analysisResult, intelligence, plan] = await Promise.all([
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
    getStudentIntelligence(documentId),
    getStudyPlan(documentId),
  ])

  if (!docResult.data || docResult.data.user_id !== user.id) {
    throw new Error('Document not found.')
  }

  const doc = docResult.data

  const analysis = (analysisResult.data as DocumentAnalysis | null) ?? null
  const learningPath: LearningPathData | null = analysis?.learning_path ?? null

  const context = buildContext(
    intent,
    doc.title,
    doc.extracted_text ?? null,
    analysis,
    intelligence,
    plan,
    learningPath,
  )

  const systemMessage = `${SYSTEM_PROMPT}\n\n${context}`

  // Last 6 messages = 3 turns of conversation context
  const history = recentMessages.slice(-6).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const isMistakeFocused = intent === 'mistake_debug'
  const modePrefix = isMistakeFocused && mode !== 'quiz_help'
    ? `[Mode: ${MODE_LABEL[mode]}] Note: the student appears to be asking about a wrong answer — use RECENT QUIZ MISTAKES data.\n\n`
    : `[Mode: ${MODE_LABEL[mode]}]\n${MODE_INSTRUCTION[mode]}\n\n`

  const currentMessage = `${modePrefix}${question}`

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let rawContent: string
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.45,
      max_tokens: 900,
      messages: [
        { role: 'system', content: systemMessage },
        ...history,
        { role: 'user', content: currentMessage },
      ],
    })
    rawContent = completion.choices[0]?.message?.content?.trim() ?? ''
    if (!rawContent) throw new Error('Empty response from OpenAI.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('quota'))
      throw new Error('Rate limit reached. Please wait a moment and try again.')
    if (msg.includes('401') || msg.includes('Incorrect API key'))
      throw new Error('Invalid OpenAI API key.')
    throw new Error(`Tutor error: ${msg}`)
  }

  const { answer, suggestedAction } = parseActionTag(rawContent)
  const checkMeta = parseCheckMeta(answer, intelligence.concepts)

  return {
    answer,
    mode,
    ...(checkMeta       ? { checkMeta }       : {}),
    ...(suggestedAction ? { suggestedAction } : {}),
  }
}
