'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type { StudyVisualSet, StudyVisualItem } from '@/types/studyVisual'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

const TEXT_CHAR_LIMIT = 10_000

const SYSTEM_PROMPT = `You are an expert educational content creator. Analyse documents and identify concepts that benefit from visual educational diagrams. Only suggest visuals for concepts that genuinely require visual representation to understand. Always respond with a single valid JSON object.`

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildPromptFromAnalysis(title: string, analysis: DocumentAnalysis): string {
  const diagramSections = analysis.sections
    .filter((s) => s.has_diagrams)
    .map((s) => `- ${s.heading}: ${s.summary}`)
    .join('\n')

  const coreConcepts = analysis.key_concepts
    .filter((c) => c.importance === 'core')
    .map((c) => `- ${c.concept}: ${c.explanation}`)
    .join('\n')

  const formulasText =
    analysis.formulas.length > 0
      ? '\n\nFORMULAS/PROCESSES (may need process diagrams):\n' +
        analysis.formulas.map((f) => `- ${f.expression}: ${f.description}`).join('\n')
      : ''

  return `Identify visual educational content for "${title}".

SUBJECT: ${analysis.subject_area} | DIFFICULTY: ${analysis.difficulty_level}

SECTIONS WITH VISUAL/DIAGRAM CONTENT (prioritise these):
${diagramSections || 'None flagged — check concepts below'}

CORE CONCEPTS (best candidates for diagrams):
${coreConcepts || 'See sections above'}${formulasText}

Respond with ONLY a JSON object:
{
  "visuals": [
    {
      "topic": "Short, clear topic name (max 50 chars)",
      "image_prompt": "Detailed prompt for generating the educational diagram"
    }
  ]
}

Rules:
- ONLY include concepts that genuinely benefit from visual diagrams
- Prioritise sections flagged as having diagram content
- Good candidates: anatomy, CS data structures/algorithms/networks, chemistry (molecules/reactions), physics (circuits/waves), biology (cycles/ecosystems), geography (processes), process flows, hierarchies, comparisons
- Bad candidates: abstract theories, lists of facts, pure definitions, historical narratives
- image_prompt must describe a precise educational diagram:
  "A detailed, labelled educational diagram of [topic] showing [specific elements]. Clean scientific illustration style, dark background, white text labels, high contrast, professional quality."
- Generate 1–6 visuals maximum. Return empty array if no genuine visual candidates exist.
- Each visual must directly relate to specific content in the document`
}

function buildPromptFromText(title: string, text: string): string {
  const body =
    text.length > TEXT_CHAR_LIMIT
      ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated]'
      : text

  return `Analyse this document and identify key concepts that would benefit from visual educational diagrams.

Title: ${title}

Content:
${body}

Respond with ONLY a JSON object:
{
  "visuals": [
    {
      "topic": "Short, clear topic name (max 50 chars)",
      "image_prompt": "Detailed prompt for generating the educational diagram"
    }
  ]
}

Rules:
- ONLY include concepts that genuinely benefit from visual diagrams
- Good candidates: anatomy, CS (data structures, network topology, CPU architecture, algorithms), chemistry (molecular structure, reactions), physics (circuits, wave diagrams), geography (water cycle, plate tectonics), biology (ecosystems, photosynthesis)
- Bad candidates: abstract theories, lists of facts, historical timelines, pure definitions
- image_prompt must describe a precise, educational diagram:
  "A detailed, labelled educational diagram of [topic] showing [specific elements]. Clean scientific illustration style, dark background, white text labels, high contrast, professional quality."
- Generate 1–5 visuals maximum. If no visual topics exist in this document, return empty array.
- Each visual must directly relate to specific content in the document`
}

// ── Validation ────────────────────────────────────────────────────────────────

function safeVisuals(value: unknown): StudyVisualItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is { topic: string; image_prompt: string } => {
      if (typeof x !== 'object' || x === null) return false
      const r = x as Record<string, unknown>
      return (
        typeof r.topic === 'string' &&
        r.topic.trim() !== '' &&
        typeof r.image_prompt === 'string' &&
        r.image_prompt.trim() !== ''
      )
    })
    .map((x) => ({
      topic: x.topic.trim(),
      image_prompt: x.image_prompt.trim(),
      image_url: null,
      status: 'pending' as const,
    }))
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function generateVisuals(documentId: string): Promise<StudyVisualSet> {
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
    throw new Error('No extracted text found. Please extract text from the document first.')
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env.local file.')
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
      max_tokens: 1500,
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

  const visuals = safeVisuals(parsed.visuals)

  const { data: saved, error: saveError } = await supabase
    .from('study_visuals')
    .upsert(
      {
        document_id: documentId,
        user_id: user.id,
        visuals,
        model: 'gpt-4o-mini',
      },
      { onConflict: 'document_id,user_id' },
    )
    .select()
    .single()

  if (saveError || !saved) {
    throw new Error(saveError?.message ?? 'Failed to save visuals')
  }

  return saved as StudyVisualSet
}
