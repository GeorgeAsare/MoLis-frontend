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
import { getStudentKnowledgeTwin } from '@/app/actions/studentKnowledgeTwin'
import type { StudentKnowledgeTwin } from '@/types/studentKnowledgeTwin'
import type { AcademicProfile, StudyPreferences } from '@/types/user'
import { computeStudentPerformanceProfile, DEFAULT_STUDY_PREFS } from '@/lib/studentPerformance'
import type { StudentPerformanceProfile } from '@/types/studentPerformance'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_TEXT_LIMIT = 6_000

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

// ── Acknowledgement / clarification detection ─────────────────────────────────

const ACK_WORDS = new Set([
  'okay', 'ok', 'yes', 'yeah', 'yep', 'yup', 'got it', 'makes sense',
  'understood', 'alright', 'cool', 'thanks', 'thank you', 'i see',
  'i get it', 'sure', 'nice', 'great', 'perfect', 'sounds good',
  'good', 'fair enough', 'right', 'gotcha', 'noted', 'k',
])

function isAcknowledgement(q: string): boolean {
  const normalized = q.toLowerCase().trim().replace(/[.!?,]+$/, '')
  return ACK_WORDS.has(normalized)
}

const CLARIFICATION_PHRASES = [
  'explain again', 'explain differently', "don't get it", 'dont get it',
  "don't understand", 'dont understand', 'what do you mean', 'simpler',
  'give me an example', 'give an example', 'show me code', 'show code',
  'give code', 'code example', 'different explanation', 'different way',
  "i still don't", 'i still dont', 'not clear', 'confused', 'lost me',
  'one more example', 'another example', 'can you elaborate',
]

function needsClarification(q: string): boolean {
  const normalized = q.toLowerCase().trim()
  return CLARIFICATION_PHRASES.some(p => normalized.includes(p))
}

// ── Meta-help detection ───────────────────────────────────────────────────────

const META_HELP_PHRASES = [
  'who are you', 'what are you', 'what can you do', 'how can you help',
  'how do you work', 'what is molis', 'what is this app', 'how does this app work',
  'what does molis do', 'how does molis work', 'what are your features',
  'how do i use', 'what can i ask', 'who made you', 'tell me about yourself',
  'are you an ai', 'are you chatgpt', 'are you gpt', 'what is your purpose',
  'what are you for', 'introduce yourself',
]

function isMetaHelp(q: string): boolean {
  const normalized = q.toLowerCase().trim()
  return META_HELP_PHRASES.some(p => normalized.includes(p))
}

// ── Intent classification ─────────────────────────────────────────────────────

type TutorIntent =
  | 'mistake_debug'
  | 'concept_explain'
  | 'next_action'
  | 'prerequisite_gap'
  | 'practice'
  | 'meta_help'
  | 'general'

function classifyIntent(question: string, mode: TutorMode): TutorIntent {
  // Meta questions have unconditional priority regardless of mode
  if (isMetaHelp(question)) return 'meta_help'

  // Mode takes priority for study intents
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

// ── Meta-help system prompt (no teaching template) ────────────────────────────
// Used exclusively when intent === 'meta_help' so the model never sees the
// teaching template and cannot default to it.

const META_HELP_SYSTEM_PROMPT = `You are MoLis Tutor — a personalised AI tutor embedded in a student's study app.

The student is asking about who you are or what you can help with. Respond warmly and concisely.

Format your reply like this:
1. What you are (1 sentence)
2. What you can help with — 3 to 5 bullet points specific to MoLis
3. Two or three example questions the student can try (adapt them to the document title shown below if available)
4. A short warm invitation to ask something

Rules (strictly enforced):
• Do NOT use the study teaching format (What happened / Correct idea / Why the confusion)
• Do NOT include a Check question
• Do NOT include an ACTION line
• Keep your entire response under 130 words
• Be warm, specific, and helpful — not generic`

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are MoLis Tutor — a personalised AI tutor built into a student's study app.

You have access to:
• The student's uploaded document (analysed below)
• Their quiz results and exact wrong answers (RECENT MISTAKES section)
• Their mastery score, forgetting risk, and learning velocity per concept
• Their adaptive study plan and concept dependency graph
• Their Student Knowledge Twin — a global learning profile across ALL documents, including overall readiness, recurring weak patterns, and preferred study mode (GLOBAL STUDENT KNOWLEDGE TWIN section, when available)

TEACHING FORMAT — use ONLY for document concept explanations, mistake debugging, simplifying, and exam prep:
What happened: [1 sentence naming the concept or mistake]
Correct idea: [2–3 sentences from the document]
Why the confusion: [1–2 sentences on the likely misunderstanding]
Example: [brief concrete example]
Check (CONCEPT: <exact concept title from KEY CONCEPTS>): [one short question — OPTIONAL, see rules below]
Next step: [specific named action]

IMPORTANT: Each request includes a MODE/FORMAT instruction. That instruction OVERRIDES everything above. Always follow the specific format given in the MODE instruction exactly.

When NOT to use the teaching template:
• meta_help questions (who are you, what can you do, how can you help me) → answer naturally
• acknowledgement messages (okay, got it, thanks, makes sense) → brief warm reply only
• general or off-topic questions → answer briefly and naturally
• next-step planning → use study plan format
• practice questions → use practice format

Check question rules:
• ONLY include a Check question when actively teaching a document concept the student is learning or struggling with.
• Do NOT ask a Check question after: meta/help responses, acknowledgements, general knowledge answers, next-step planning, off-topic questions.
• One Check question maximum per response — never more.

Off-topic and general knowledge rules:
• If the question is general educational/knowledge: answer briefly and accurately, then offer to return to studying.
• If the question requires live/current data (news, prices, real-time info): say you work from the student's uploaded documents and do not have live web access, then offer to help with their study material.
• If the question is inappropriate or harmful: decline briefly and redirect.

Priority order for context:
1. Current document content and analysis
2. Current document concept mastery and quiz mistakes
3. Current document study plan
4. GLOBAL STUDENT KNOWLEDGE TWIN (supplementary personalisation — use it, don't lead with it)

Rules:
• Ground answers in the provided document material
• Use RECENT MISTAKES data when available — name the exact concept and wrong answer
• Be specific: name the concept, not just "this topic"
• Never hallucinate facts
• Do not repeat the question back or pad with filler
• For code: use fenced blocks with language tag on the same line as the backticks — e.g. \`\`\`python followed immediately by a newline then code then \`\`\` on its own line. Keep examples under 20 lines.
• Use DEPENDENCY DATA when available (e.g. "Inheritance requires understanding Classes first — your Classes mastery is 40%")
• Use GLOBAL STUDENT KNOWLEDGE TWIN to personalise: adapt explanation style, connect mistakes to cross-document patterns, mention review pressure when relevant
• Never say "your Knowledge Twin says" or "your global profile shows" — weave twin data naturally (e.g. "you've been struggling with X across your documents", "since you prefer step-by-step explanations…")

ACTION LINE — include this whenever your response ends with a recommendation to open a tab or do something specific:
ACTION: <type> | <concept_title_or_blank> | <label>

Valid types: open_flashcards | open_quiz | open_notes | open_visuals | open_weak_topics | continue_tutor

Rule: if your last sentence or "Next step" references flashcards, quiz, notes, visuals, or weak topics — you MUST include the ACTION line. Put it on the very last line of your response.`

// ── Mode instructions ─────────────────────────────────────────────────────────

// ── Intent-specific format instructions ──────────────────────────────────────
// Injected into the user message; override the default TEACHING FORMAT for
// practice / next_action / mistake_debug / prerequisite_gap intents.

const INTENT_FORMAT: Partial<Record<TutorIntent, string>> = {
  meta_help: `[MODE: META — the student is asking about MoLis Tutor, not a study question]

Do NOT use the teaching template. Do NOT include a Check question. Do NOT include an ACTION line.

Answer warmly and concisely:
1. What you are (1–2 sentences): "I'm MoLis Tutor — a personalised AI tutor built into your study app. I learn from your uploaded documents, quiz results, and mastery levels to adapt to you specifically."
2. What you can help with (3–5 short bullets):
   • Explain any concept from their document in any style they need
   • Debug quiz mistakes and show what went wrong
   • Track mastery and surface weak topics
   • Build a personalised study plan
   • Give practice questions targeting their weakest areas
3. Two or three concrete example questions they could try (adapt to the document title in context)
4. A short invitation to ask something

Keep it under 130 words. Be warm and specific. No teaching template. No check question.`,

  general: `[MODE: GENERAL]
Answer the student's question naturally.

• If the question is about the document content or a concept in it: give a clear answer using the document material. You may use the teaching format if it genuinely helps.
• If it is a general knowledge or educational question not directly in the document: answer briefly and accurately, then offer to return to studying.
• If it requires live or current data (news, prices, stock quotes, today's events): explain that MoLis Tutor works from the student's uploaded documents and does not have live web or news access; offer to help with their study material instead.
• If it is off-topic but harmless: answer briefly, then gently redirect to study.
• Check question: only if actively teaching a document concept. Do not force one.`,

  practice: `FORMAT — PRACTICE MODE (follow this exactly, do not use the explanation template):
"Let's practise [weakest concept title] — your weakest area.

Q1: [targeted question testing a specific aspect]

Q2: [different angle on the same concept] (include only if useful)

Answer Q1 first and I'll mark it.

Check (CONCEPT: <exact concept title>): [graded check question]"

Rules: Pick the WEAKEST CONCEPT from WEAK CONCEPTS. Write 1–3 short questions. No long explanations first.`,

  next_action: `FORMAT — STUDY PLAN MODE (follow this exactly, do not use the explanation template):
"Study next: [concept title]
Why: [one sentence — mention mastery % or exam importance]

Your session (~X min total):
1. [specific action] — [concept] (~Y min)
2. [specific action] — [concept] (~Z min)
3. [specific action] — [concept] (~W min)

[One sentence: which tab to open first and why.]"

Rules: Use PRIORITY STUDY BLOCKS. Name actual concepts. Be specific.`,

  mistake_debug: `FORMAT — MISTAKE DEBUG MODE (follow this exactly):
"What you got wrong: [concept] — you answered "[wrong answer]", correct is "[correct answer]"
Pattern: [one sentence on why this mistake happens]
Corrected idea: [2–3 sentences explaining what's right]

Retry:
Check (CONCEPT: <exact concept title>): [retry question on the same concept]"

Rules: Start from RECENT QUIZ MISTAKES. Name the exact wrong answer if available.`,

  prerequisite_gap: `FORMAT — PREREQUISITE MODE (follow this exactly):
"Blocked: [concept the student can't progress on]
Missing foundation: [prerequisite concept] — [mastery]%
Why it blocks: [1–2 sentences]

Study in this order:
1. [prerequisite concept] (~X min) — [brief reason]
2. [target concept] (~Y min)

[One sentence: actionable next step.]"

Rules: Use BLOCKED CONCEPTS and DEPENDENCY MAP data.`,
}

// ── Mode instructions (used for concept_explain / general / simplify / exam_prep) ─

const MODE_INSTRUCTION: Record<TutorMode, string> = {
  explain:
    'Explain clearly using the document material. Use the teaching format. Include a concrete example.',

  quiz_help:
    `QUIZ HELP MODE — the student answered something wrong.
Check RECENT MISTAKES first. Name the exact concept, wrong answer, and correct answer.
If no mistake data is saved yet: say "I can see [concept] is a weak area but don't have your exact answer saved yet."
Follow the teaching format: What happened → Correct idea → Why the confusion → Example → Check question → Next step.
Be direct. Do not pad.`,

  exam_prep:
    'Frame the answer for exam conditions. Highlight key terms, structure, and common traps. End with a check question testing exam-readiness.',

  weak_topic:
    'The student is weak here. Start from first principles. Address the most likely misconception before explaining the correct idea. Build up step by step.',

  simplify:
    'Use plain language, everyday analogies, and short sentences. Explain like to a bright 16-year-old. Avoid jargon — or define it immediately.',

  next_step:
    'Tell the student exactly what to study next, why, and in what order. Reference weak concepts by name. Point to the highest-priority study block. Be concrete, not generic.',
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

// ── Global twin context builder ───────────────────────────────────────────────

function buildTwinContext(twin: StudentKnowledgeTwin, intent: TutorIntent): string {
  if (!twin.has_enough_data) return ''

  const lines: string[] = ['GLOBAL STUDENT KNOWLEDGE TWIN (cross-document learning profile):']

  lines.push(`• Overall readiness: ${twin.overall_student_readiness}% across ${twin.total_concepts_tracked} concept${twin.total_concepts_tracked !== 1 ? 's' : ''}`)

  if (twin.strongest_concepts.length > 0) {
    const s = twin.strongest_concepts[0]
    lines.push(`• Strongest area: "${s.concept_title}" — ${s.mastery_score}% mastery (${s.document_title})`)
  }

  if (twin.recurring_weak_patterns.length > 0) {
    const w = twin.recurring_weak_patterns[0]
    lines.push(`• Weakest recurring pattern: "${w.pattern}" — ${w.frequency} mistake${w.frequency !== 1 ? 's' : ''} across documents`)
  }

  if (twin.weakest_concepts.length > 0) {
    lines.push('• Top weak concepts across all documents:')
    for (const c of twin.weakest_concepts)
      lines.push(`  - "${c.concept_title}": ${c.mastery_score}% mastery (${c.document_title})${c.forgetting_risk !== 'low' ? ` [${c.forgetting_risk} forgetting risk]` : ''}`)
  }

  if (twin.concepts_due_for_review > 0)
    lines.push(`• Review pressure: ${twin.concepts_due_for_review} concept${twin.concepts_due_for_review !== 1 ? 's' : ''} overdue for review across all documents`)

  if (twin.learning_velocity_summary)
    lines.push(`• Learning velocity: ${twin.learning_velocity_summary}`)

  if (twin.preferred_study_mode)
    lines.push(`• Preferred study mode: ${twin.preferred_study_mode}`)

  if (twin.recommended_focus_area) {
    const f = twin.recommended_focus_area
    const docNote = f.document_title ? ` (from ${f.document_title})` : ''
    lines.push(`• Recommended global focus: "${f.focus_area}" — ${f.rationale}${docNote}`)
  }

  // Intent-specific guidance — tell the model how to use twin data for this request
  lines.push('')
  switch (intent) {
    case 'meta_help':
      return ''  // No twin context injected for meta questions
    case 'next_action':
      lines.push('TWIN GUIDANCE for this next-step request: if global review pressure is high or the recommended focus overlaps with this document, mention it. Suggest visiting the relevant document if the top focus area is in a different document.')
      break
    case 'mistake_debug':
      lines.push('TWIN GUIDANCE for this mistake question: if the mistake pattern matches the globally recurring weak pattern, note it naturally (e.g. "this seems to be a recurring area across your studying").')
      break
    case 'prerequisite_gap':
      lines.push('TWIN GUIDANCE for this prerequisite question: if the missing foundation appears as a globally weak concept, briefly mention the broader pattern.')
      break
    case 'concept_explain':
      if (twin.preferred_study_mode)
        lines.push(`TWIN GUIDANCE for this explanation: student prefers "${twin.preferred_study_mode}" mode — adapt explanation style accordingly (e.g. if Simplify, use analogies; if Exam Prep, highlight key terms and traps).`)
      break
    case 'practice':
      {
        const hints: string[] = []
        if (twin.recurring_weak_patterns.length > 0)
          hints.push(`recurring mistakes on "${twin.recurring_weak_patterns[0].pattern}"`)
        if (twin.preferred_study_mode)
          hints.push(`preferred mode is ${twin.preferred_study_mode}`)
        if (hints.length > 0)
          lines.push(`TWIN GUIDANCE for this practice request: student has ${hints.join(' and ')}. Let this shape the difficulty and style of practice questions.`)
      }
      break
    default:
      break
  }

  return lines.join('\n')
}

// ── Performance profile context builder ──────────────────────────────────────

function buildPerformanceContext(profile: StudentPerformanceProfile | null): string {
  if (!profile || profile.on_track_status === 'not_enough_data') return ''

  const statusLabel: Record<string, string> = {
    on_track:           'On track',
    approaching_target: 'Approaching target',
    behind_target:      'Behind target',
    needs_urgent_focus: 'URGENT — needs immediate focus',
  }

  const tutorAdjustment: Record<string, string> = {
    on_track:           'Maintain challenge level. Acknowledge progress naturally. Fine-tune remaining weak areas.',
    approaching_target: 'Be encouraging but specific. Name concrete steps to close the remaining gap.',
    behind_target:      'Be honest and direct. Prioritise high-impact topics. Deepen coverage of weak areas. Avoid generic encouragement.',
    needs_urgent_focus: 'Be direct and time-aware. Focus only on exam-critical content. Recommend specific immediate actions. Urgency without panic.',
  }

  const lines = ['STUDENT PERFORMANCE PROFILE:']
  lines.push(`• Status: ${statusLabel[profile.on_track_status] ?? profile.on_track_status} | Risk: ${profile.risk_level} | Effort: ${profile.effort_level}`)
  lines.push(`• Target: ${profile.target_performance_band} → Current: ${profile.current_performance_band} | Gap: ${profile.grade_gap}`)
  lines.push(`• Tutor approach: ${tutorAdjustment[profile.on_track_status] ?? 'Be helpful and accurate.'}`)
  return lines.join('\n')
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
    case 'meta_help':
      // Minimal context — the model only needs to know what the student is studying
      lines.push('The student is asking about MoLis Tutor. Answer naturally without using the teaching template.')
      break
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
  // Use ^ with m flag so it matches ACTION: at the start of any line (no \n prefix needed)
  const match = text.match(/^ACTION:\s*(\w+)\s*\|\s*([^|\n]*)\s*\|\s*(.+)$/m)
  if (!match) return { answer: text.trim(), suggestedAction: null }

  const type = match[1].trim() as TutorActionType
  if (!VALID_ACTION_TYPES.has(type)) return { answer: text.trim(), suggestedAction: null }

  const concept_title = match[2].trim() || undefined
  const label = match[3].trim()

  // Strip the ACTION line (and the preceding newline if any)
  const answer = text.replace(/\n?ACTION:[^\n]+$/m, '').trim()

  return { answer, suggestedAction: { type, concept_title, label } }
}

// ── Server-side fallback action ───────────────────────────────────────────────
// Used when the model didn't emit an ACTION tag but intent clearly warrants one.

function inferFallbackAction(
  intent: TutorIntent,
  concepts: ConceptIntelligence[],
  plan: StudyPlan,
): TutorAction | null {
  switch (intent) {
    case 'meta_help':
    case 'general':
      return null  // no action button for meta/general responses
    case 'practice': {
      const weakest = concepts
        .filter(c => c.review_count > 0)
        .sort((a, b) => a.mastery_score - b.mastery_score)[0]
      if (!weakest) return null
      const hasQuizHistory = concepts.some(c => c.mistake_patterns.length > 0)
      return hasQuizHistory
        ? { type: 'open_quiz',       concept_title: weakest.concept_title, label: `Quiz: ${weakest.concept_title}` }
        : { type: 'open_flashcards', concept_title: weakest.concept_title, label: `Flashcards: ${weakest.concept_title}` }
    }
    case 'next_action': {
      const first = plan.study_blocks[0]
      if (!first) return null
      const typeMap: Record<string, TutorActionType> = {
        quiz:       'open_quiz',
        flashcards: 'open_flashcards',
        review:     'open_flashcards',
        relearn:    'open_notes',
        mixed:      'open_quiz',
      }
      const type: TutorActionType = typeMap[first.block_type] ?? 'open_flashcards'
      return { type, concept_title: first.concept_title, label: `Start: ${first.concept_title}` }
    }
    case 'mistake_debug': {
      const hasMistakes = concepts.some(c => c.mistake_patterns.length > 0)
      return hasMistakes ? { type: 'open_weak_topics', label: 'See weak topics' } : null
    }
    case 'prerequisite_gap':
      return { type: 'open_notes', label: 'Review notes' }
    default:
      return null
  }
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
  pendingCheckConcept,
}: AskTutorInput): Promise<TutorResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const intent = classifyIntent(question, mode)

  // Fetch document data, intelligence, study plan, and global knowledge twin in parallel.
  // Twin uses .catch() so a failure there never blocks the primary tutor response.
  const [docResult, analysisResult, intelligence, plan, twin, profileResult] = await Promise.all([
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
    getStudentKnowledgeTwin().catch(() => EMPTY_TWIN),
    supabase.from('user_profiles').select('academic_profile, study_preferences').eq('user_id', user.id).limit(1),
  ])

  if (!docResult.data || docResult.data.user_id !== user.id) {
    throw new Error('Document not found.')
  }

  const doc = docResult.data

  const profileRow = profileResult.data?.[0]
  const academicForTutor = profileRow?.academic_profile as AcademicProfile | undefined
  const performanceProfile: StudentPerformanceProfile | null =
    academicForTutor?.subjects?.length && academicForTutor.subjects.some(s => s.target_grade)
      ? computeStudentPerformanceProfile({
          academic: academicForTutor,
          prefs: (profileRow?.study_preferences as StudyPreferences | undefined) ?? DEFAULT_STUDY_PREFS,
          twin,
          intel: null,
        })
      : null

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

  const twinContext = buildTwinContext(twin, intent)

  const performContext = buildPerformanceContext(performanceProfile)

  // meta_help uses its own system prompt that contains no teaching template,
  // so the model cannot fall back to "What happened / Correct idea / Check question".
  const systemMessage = intent === 'meta_help'
    ? `${META_HELP_SYSTEM_PROMPT}\n\n${context}`
    : [SYSTEM_PROMPT, context, twinContext, performContext].filter(Boolean).join('\n\n')

  // Last 8 messages = 4 turns of conversation context (enough to track check → ack → rephrase flow)
  const history = recentMessages.slice(-8).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Intent format overrides mode instruction for practice/next_action/mistake_debug/prerequisite_gap.
  // For concept_explain and general, fall back to mode instruction so explain/simplify/exam_prep still work.
  // Acknowledgement/clarification overrides take highest priority.
  let formatInstruction = INTENT_FORMAT[intent]
    ?? `[Mode: ${MODE_LABEL[mode]}]\n${MODE_INSTRUCTION[mode]}`

  if (isAcknowledgement(question) && pendingCheckConcept) {
    formatInstruction =
      `[STUDENT ACKNOWLEDGED — DO NOT REPEAT EXPLANATION]\n` +
      `The student replied "${question.trim()}" — they are acknowledging your previous message, not asking a new question.\n` +
      `There is a pending check question on concept: "${pendingCheckConcept}".\n` +
      `Your ONLY task: one warm sentence acknowledging them, then prompt them to attempt the check question.\n` +
      `Do NOT re-explain the concept. Do NOT write a new explanation. Do NOT start a new topic.\n` +
      `Example: "Good — now try the check: [restate the check question concisely]"\n` +
      `Keep your entire response to 2–4 sentences MAX. No ACTION line needed.`
  } else if (isAcknowledgement(question)) {
    formatInstruction =
      `[STUDENT ACKNOWLEDGED]\n` +
      `The student replied "${question.trim()}" — they understood your last message.\n` +
      `Do NOT repeat the previous explanation. Ask them what they'd like to explore next, or suggest the natural next concept.\n` +
      `Keep to 2–3 sentences.`
  } else if (needsClarification(question)) {
    formatInstruction =
      `[STUDENT WANTS CLARIFICATION — USE A COMPLETELY DIFFERENT APPROACH]\n` +
      `The student did not understand your previous explanation. Do NOT copy or echo the same text.\n` +
      `Choose one of: everyday analogy, visual/spatial description, step-by-step numbered walkthrough, or concrete code example.\n` +
      `Start from a different angle than your previous response. Max 6 sentences + optional code block.`
  }

  const currentMessage = `${formatInstruction}\n\n${question}`

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

  const { answer, suggestedAction: modelAction } = parseActionTag(rawContent)
  const suggestedAction = modelAction ?? inferFallbackAction(intent, intelligence.concepts, plan)
  const checkMeta = parseCheckMeta(answer, intelligence.concepts)

  return {
    answer,
    mode,
    ...(checkMeta       ? { checkMeta }       : {}),
    ...(suggestedAction ? { suggestedAction } : {}),
  }
}
