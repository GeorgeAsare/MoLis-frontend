'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type { StudyVisualSet, StudyVisualItem } from '@/types/studyVisual'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 10_000
const MAX_VISUALS = 3
const STORAGE_BUCKET = 'study-visuals'
const IMAGE_MODEL = 'dall-e-3'
const PROMPT_MODEL = 'gpt-4o-mini'

// ── Phase 1: prompt generation ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert educational content creator. Identify concepts that genuinely benefit from visual diagrams. Only suggest visuals for concepts where a diagram adds real understanding. Respond with a single valid JSON object.`

function buildPromptFromAnalysis(title: string, analysis: DocumentAnalysis): string {
  const diagramSections = analysis.sections
    .filter(s => s.has_diagrams)
    .map(s => `- ${s.heading}: ${s.summary}`)
    .join('\n')

  const coreConcepts = analysis.key_concepts
    .filter(c => c.importance === 'core')
    .slice(0, 12)
    .map(c => `- ${c.concept}: ${c.explanation}`)
    .join('\n')

  const formulasText = analysis.formulas.length > 0
    ? '\n\nFORMULAS/PROCESSES:\n' + analysis.formulas.map(f => `- ${f.expression}: ${f.description}`).join('\n')
    : ''

  return `Identify 1–3 educational visual diagrams for "${title}".

SUBJECT: ${analysis.subject_area} | DIFFICULTY: ${analysis.difficulty_level}

SECTIONS WITH VISUAL CONTENT:
${diagramSections || 'None flagged — use core concepts below'}

CORE CONCEPTS:
${coreConcepts || 'See sections above'}${formulasText}

Respond ONLY with this JSON:
{
  "visuals": [
    {
      "topic": "Short diagram title (max 50 chars)",
      "description": "One sentence: what this diagram shows and why it helps understanding",
      "visual_type": "diagram | concept_map | process_flow | comparison | hierarchy",
      "image_prompt": "Detailed prompt for dall-e-3 image generation"
    }
  ]
}

Rules:
- Maximum 3 visuals. Return empty array if no genuinely visual concepts exist.
- Good candidates: anatomy, CS (data structures, networks, algorithms, OOP hierarchies, CPU architecture), chemistry (molecular/reaction diagrams), physics (circuits, waves), biology (cycles, ecosystems), process flows, dependency graphs, comparison tables
- Bad candidates: abstract theories, pure definitions, historical facts, lists
- image_prompt MUST describe a precise educational diagram:
  "A detailed, labelled educational diagram showing [specific elements with labels]. Clean technical illustration style on a dark navy background, white and light-coloured text labels, high contrast. [Visual type: hierarchy/flowchart/comparison/etc]. Professional educational quality, no decorative elements."
- For OOP/CS: show class boxes, arrows, labels, method names
- For biology/chemistry: show structures with clear labels
- For processes: show numbered steps with connecting arrows`
}

function buildPromptFromText(title: string, text: string): string {
  const body = text.length > TEXT_CHAR_LIMIT
    ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated]'
    : text

  return `Identify 1–3 educational visual diagrams for "${title}".

DOCUMENT CONTENT:
${body}

Respond ONLY with this JSON:
{
  "visuals": [
    {
      "topic": "Short diagram title (max 50 chars)",
      "description": "One sentence: what this diagram shows and why it helps understanding",
      "visual_type": "diagram | concept_map | process_flow | comparison | hierarchy",
      "image_prompt": "Detailed prompt for dall-e-3 image generation"
    }
  ]
}

Rules:
- Maximum 3 visuals. Return empty array if no genuinely visual concepts exist.
- Good candidates: anatomy, CS (data structures, networks, OOP, algorithms), chemistry, physics, biology, process flows
- Bad candidates: abstract theories, lists of facts, historical timelines
- image_prompt must describe a precise educational diagram with labels, on a dark background, professional quality.`
}

// ── Validation ────────────────────────────────────────────────────────────────

interface RawVisualItem {
  topic: string
  description?: string
  image_prompt: string
}

function safeVisuals(value: unknown): StudyVisualItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is RawVisualItem => {
      if (typeof x !== 'object' || x === null) return false
      const r = x as Record<string, unknown>
      return (
        typeof r.topic === 'string' && r.topic.trim() !== '' &&
        typeof r.image_prompt === 'string' && r.image_prompt.trim() !== ''
      )
    })
    .slice(0, MAX_VISUALS)
    .map(x => ({
      topic:        x.topic.trim(),
      description:  typeof x.description === 'string' ? x.description.trim() : '',
      image_prompt: x.image_prompt.trim(),
      image_url:    null,
      status:       'pending' as const,
    }))
}

// ── Phase 2: image generation + storage ──────────────────────────────────────

async function generateAndStoreImage(
  openai: OpenAI,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  documentId: string,
  item: StudyVisualItem,
  index: number,
): Promise<StudyVisualItem> {
  try {
    const response = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt: item.image_prompt,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
      n: 1,
    })

    const b64 = response.data?.[0]?.b64_json
    if (!b64) throw new Error('No image data returned from dall-e-3')

    const buffer = Buffer.from(b64, 'base64')
    // Fixed path per user/doc/index so regeneration overwrites cleanly
    const storagePath = `${userId}/${documentId}/${index}.png`

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath)

    return { ...item, image_url: urlData.publicUrl, status: 'generated' }
  } catch {
    // One image failing must not crash the whole generation
    return { ...item, image_url: null, status: 'failed' }
  }
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function generateVisuals(documentId: string): Promise<StudyVisualSet> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env.local file.')
  }

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
    throw new Error('No extracted text found. Please extract text from the document first.')
  }

  const { data: analysisRow } = await supabase
    .from('document_analysis')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle()

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // ── Phase 1: identify visual topics + build image prompts ─────────────────

  const userPrompt = analysisRow
    ? buildPromptFromAnalysis(doc.title, analysisRow as DocumentAnalysis)
    : buildPromptFromText(doc.title, doc.extracted_text)

  let rawContent: string
  try {
    const completion = await openai.chat.completions.create({
      model: PROMPT_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
    })
    rawContent = completion.choices[0]?.message?.content ?? ''
    if (!rawContent) throw new Error('OpenAI returned an empty response')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('quota'))
      throw new Error('OpenAI rate limit reached. Please wait a moment and try again.')
    if (msg.includes('401') || msg.includes('Incorrect API key'))
      throw new Error('Invalid OpenAI API key. Check OPENAI_API_KEY in .env.local.')
    throw new Error(`Visual topic detection failed: ${msg}`)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawContent) as Record<string, unknown>
  } catch {
    throw new Error('Malformed response from OpenAI. Please try again.')
  }

  const prompts = safeVisuals(parsed.visuals)

  if (prompts.length === 0) {
    // No visual topics detected — save empty set and return
    const { data: saved, error } = await supabase
      .from('study_visuals')
      .upsert(
        { document_id: documentId, user_id: user.id, visuals: [], model: PROMPT_MODEL },
        { onConflict: 'document_id,user_id' },
      )
      .select()
      .single()
    if (error || !saved) throw new Error(error?.message ?? 'Failed to save visuals')
    return saved as StudyVisualSet
  }

  // ── Phase 2: generate actual images with dall-e-3, upload to storage ─────

  const generated: StudyVisualItem[] = []
  for (let i = 0; i < prompts.length; i++) {
    const result = await generateAndStoreImage(openai, supabase, user.id, documentId, prompts[i], i)
    generated.push(result)
  }

  // ── Persist ───────────────────────────────────────────────────────────────

  const { data: saved, error: saveError } = await supabase
    .from('study_visuals')
    .upsert(
      {
        document_id: documentId,
        user_id:     user.id,
        visuals:     generated,
        model:       `${PROMPT_MODEL}+${IMAGE_MODEL}`,
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
