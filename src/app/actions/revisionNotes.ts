'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { recordUsage } from '@/app/actions/recordUsage'
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
        `- ${t.topic} [${t.importance}]: ${t.question_types.join(', ')}`,
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

  const relationshipsText =
    analysis.relationships.length > 0
      ? '\n\nCONCEPT RELATIONSHIPS:\n' +
        analysis.relationships
          .slice(0, 10)
          .map((r) => `- ${r.from_concept} ${r.relationship} ${r.to_concept}`)
          .join('\n')
      : ''

  const bulletRule = [
    '- bullet_points: 10-16 explanatory revision notes grounded in the source material. Each note MUST:',
    '  - state WHAT a concept is, HOW it works, or WHY it matters using the source\'s own terminology',
    '  - be a complete factual sentence that a student can revise from directly without the original document',
    '  - NEVER begin with an imperative verb such as Define, Explain, Discuss, Evaluate, Demonstrate, Consider, or Describe',
    '  - draw on the concept relationships and examples above where relevant to connect ideas',
    '  - include at least one note per high-importance exam topic',
  ].join('\n')

  return `Generate revision notes for "${title}" that a student can revise from directly.

SUBJECT: ${analysis.subject_area} | DIFFICULTY: ${analysis.difficulty_level} | EST. STUDY: ${analysis.estimated_study_minutes ?? '?'} min

DOCUMENT SECTIONS:
${sectionsText}

KEY CONCEPTS (${analysis.key_concepts.length} total):
${conceptsText}

DEFINITIONS (${analysis.definitions.length} terms):
${defsText}${formulasText}${relationshipsText}

EXAM TOPICS (focus areas):
${examText}

EXAMPLES FROM SOURCE:
${examplesText}

Respond with ONLY a JSON object in this exact schema:
{
  "title": "Descriptive title for these revision notes",
  "summary": "4-6 sentence paragraph covering the subject, main topics, arguments, and conclusions — written as an orientation for the student, not a task list",
  "key_concepts": ["concept 1", "concept 2"],
  "bullet_points": ["Inheritance allows a subclass to reuse and extend the attributes and methods of a base class, reducing code duplication.", "..."],
  "definitions": [{ "term": "Term", "definition": "Clear, precise definition" }],
  "exam_tips": ["Specific exam preparation tip for this topic, e.g. what question types appear and how to approach them", "..."]
}

Rules:
- key_concepts: cover ALL concepts from the analysis (especially core and supporting importance)
${bulletRule}
- definitions: include ALL definitions from the analysis plus any additional key terms
- exam_tips: 4-7 practical preparation strategies — include what types of exam questions appear on this topic and how to approach them; avoid generic advice like "review your notes"`
}

function buildPromptFromText(title: string, text: string): string {
  const body =
    text.length > TEXT_CHAR_LIMIT
      ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated for processing]'
      : text

  const bulletRule = [
    '- bullet_points: 10-16 explanatory revision statements grounded in the document. Each note MUST:',
    '  - state WHAT a concept is, HOW it works, or WHY it matters in this subject',
    '  - be a complete factual sentence a student can revise from directly',
    '  - NEVER begin with an imperative verb such as Define, Explain, Discuss, Evaluate, Demonstrate, or Consider',
  ].join('\n')

  return `Generate revision notes for this document.

Title: ${title}

Content:
${body}

Respond with ONLY a JSON object in this exact schema:
{
  "title": "Descriptive title for these revision notes",
  "summary": "3-5 sentence paragraph covering main topics, arguments, and conclusions — written as a student orientation, not a task list",
  "key_concepts": ["concept 1", "concept 2"],
  "bullet_points": ["Inheritance allows a subclass to reuse and extend the attributes and methods of a base class.", "..."],
  "definitions": [{ "term": "Term", "definition": "Clear, precise definition" }],
  "exam_tips": ["Specific exam preparation strategy for this topic, e.g. what question types appear and how to approach them", "..."]
}

Rules:
- key_concepts: 6-10 most important concepts or themes
${bulletRule}
- definitions: 5-10 key terms with precise definitions from the source material
- exam_tips: 3-6 practical preparation strategies — what types of questions appear and how to approach them`
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
    void recordUsage({ generation_type: 'revision_notes', document_id: documentId, success: false, error_type: 'save_failed', model: 'gpt-4o-mini' })
    throw new Error(saveError?.message ?? 'Failed to save revision notes')
  }

  void recordUsage({ generation_type: 'revision_notes', document_id: documentId, success: true, model: 'gpt-4o-mini' })
  return saved as RevisionNote
}
