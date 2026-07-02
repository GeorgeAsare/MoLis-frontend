'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type { RevisionNote, RevisionNoteDefinition } from '@/types/revisionNotes'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 14_000

const SYSTEM_PROMPT = `You are an expert academic tutor creating structured revision notes for university students.
Produce comprehensive, exam-focused materials that help students understand and retain key information.
Always respond with a single valid JSON object matching the exact schema in the user message. No markdown, no prose outside the JSON.`

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildPromptFromAnalysis(title: string, analysis: DocumentAnalysis): string {
  const sectionsText = analysis.sections
    .map(
      (s) =>
        `### ${s.heading}\n${s.summary}\nKey points: ${s.key_points.join(' | ')}`,
    )
    .join('\n\n')

  const conceptsText = analysis.key_concepts
    .map((c) => `- ${c.concept} (${c.importance}): ${c.explanation}`)
    .join('\n')

  const defsText = analysis.definitions
    .map((d) => `- ${d.term}: ${d.definition}`)
    .join('\n')

  const examText = analysis.likely_exam_topics
    .map(
      (t) =>
        `- ${t.topic} [${t.importance}] — tested via: ${t.question_types.join(', ')}`,
    )
    .join('\n')

  const examplesText = analysis.examples
    .map((e) => `- ${e.description}`)
    .join('\n')

  const formulasText =
    analysis.formulas.length > 0
      ? '\n\nFORMULAS:\n' +
        analysis.formulas.map((f) => `- ${f.expression}: ${f.description}`).join('\n')
      : ''

  return `Generate comprehensive revision notes for "${title}".

SUBJECT: ${analysis.subject_area} | DIFFICULTY: ${analysis.difficulty_level} | EST. STUDY: ${analysis.estimated_study_minutes ?? '?'} min

DOCUMENT SECTIONS:
${sectionsText}

KEY CONCEPTS (${analysis.key_concepts.length} total):
${conceptsText}

DEFINITIONS (${analysis.definitions.length} terms):
${defsText}${formulasText}

EXAM TOPICS (focus areas):
${examText}

EXAMPLES:
${examplesText}

Respond with ONLY a JSON object in this exact schema:
{
  "title": "Descriptive title for these revision notes",
  "summary": "4–6 sentence paragraph covering the subject, main topics, arguments, and conclusions",
  "key_concepts": ["concept 1", "concept 2"],
  "bullet_points": ["Revision point starting with an action verb", "..."],
  "definitions": [{ "term": "Term", "definition": "Clear, precise definition" }],
  "exam_tips": ["Specific exam technique tip for this topic", "..."]
}

Rules:
- key_concepts: cover ALL concepts from the analysis (especially core and supporting importance)
- bullet_points: 12–20 concise, exam-focused points — start each with an action verb; include one point per exam topic
- definitions: include ALL definitions from the analysis plus any additional key terms
- exam_tips: 4–7 actionable tips specific to this subject and its likely exam topics`
}

function buildPromptFromText(title: string, text: string): string {
  const body =
    text.length > TEXT_CHAR_LIMIT
      ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated for processing]'
      : text

  return `Generate revision notes for this document.

Title: ${title}

Content:
${body}

Respond with ONLY a JSON object in this exact schema:
{
  "title": "Descriptive title for these revision notes",
  "summary": "3–5 sentence paragraph covering main topics, arguments, and conclusions",
  "key_concepts": ["concept 1", "concept 2"],
  "bullet_points": ["Revision point starting with an action verb", "..."],
  "definitions": [{ "term": "Term", "definition": "Clear, precise definition" }],
  "exam_tips": ["Specific exam technique tip for this topic", "..."]
}

Rules:
- key_concepts: 6–10 most important concepts or themes
- bullet_points: 10–18 concise, exam-focused points; start each with an action verb
- definitions: 5–10 key terms with precise academic definitions
- exam_tips: 3–6 actionable tips specific to this subject matter`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is string => typeof x === 'string')
}

function safeDefinitions(value: unknown): RevisionNoteDefinition[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (x): x is RevisionNoteDefinition =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as Record<string, unknown>).term === 'string' &&
      typeof (x as Record<string, unknown>).definition === 'string',
  )
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function generateRevisionNotes(
  documentId: string,
): Promise<RevisionNote> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to your .env.local file.',
    )
  }

  // Prefer structured analysis over raw text when available
  const { data: analysis } = await supabase
    .from('document_analysis')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle()

  const userPrompt = analysis
    ? buildPromptFromAnalysis(doc.title, analysis as DocumentAnalysis)
    : buildPromptFromText(doc.title, doc.extracted_text)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let rawContent: string
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
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
      : `${doc.title} — Revision Notes`
  const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
  const key_concepts = safeStringArray(parsed.key_concepts)
  const bullet_points = safeStringArray(parsed.bullet_points)
  const definitions = safeDefinitions(parsed.definitions)
  const exam_tips = safeStringArray(parsed.exam_tips)

  const content = [
    title,
    summary,
    bullet_points.join('\n'),
    definitions.map((d) => `${d.term}: ${d.definition}`).join('\n'),
    exam_tips.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')

  await supabase
    .from('revision_notes')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', user.id)

  const { data: saved, error: saveError } = await supabase
    .from('revision_notes')
    .insert({
      document_id: documentId,
      user_id: user.id,
      title,
      summary,
      key_concepts,
      bullet_points,
      definitions,
      exam_tips,
      content,
      model: 'gpt-4o-mini',
    })
    .select()
    .single()

  if (saveError || !saved) {
    throw new Error(saveError?.message ?? 'Failed to save revision notes')
  }

  return saved as RevisionNote
}
