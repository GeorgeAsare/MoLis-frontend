'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StudyVisualSet, StudyVisualItem } from '@/types/studyVisual'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 10_000
const DEFAULT_VISUAL_GENERATION_COUNT = 1
const STORAGE_BUCKET = 'study-visuals'
const PROMPT_MODEL = 'gpt-4o-mini'
// Configurable via OPENAI_IMAGE_MODEL env var; falls back to gpt-image-2
function getImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'
}

// ── Phase 1: prompt generation ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert educational content creator. Choose the single most useful educational visual for helping a student understand a document. Only suggest a visual if a diagram genuinely aids understanding. Respond with a single valid JSON object.`

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

  return `Choose the single most useful educational visual diagram for "${title}".

SUBJECT: ${analysis.subject_area} | DIFFICULTY: ${analysis.difficulty_level}

SECTIONS WITH VISUAL CONTENT:
${diagramSections || 'None flagged — use core concepts below'}

CORE CONCEPTS:
${coreConcepts || 'See sections above'}${formulasText}

Respond ONLY with this JSON (exactly 1 item, or empty array if no visual concept exists):
{
  "visuals": [
    {
      "topic": "Short diagram title (max 50 chars)",
      "description": "One sentence: what this diagram shows and why it helps understanding",
      "visual_type": "concept_map | hierarchy | process_flow | diagram | comparison",
      "image_prompt": "Detailed image generation prompt"
    }
  ]
}

Rules:
- Return exactly 1 visual — the highest-value diagram for this document.
- Best candidates: OOP hierarchies, data structures, network topology, anatomy, molecule/reaction diagrams, physics circuits, biology cycles, process flows.
- If no concept genuinely benefits from a diagram, return an empty array.
- image_prompt must describe a precise, labelled educational diagram:
  "A detailed, labelled educational diagram showing [specific elements]. Clean technical illustration style on a dark navy background, white text labels, high contrast. [hierarchy/flowchart/concept map]. Professional quality, no decorative elements."
- For OOP/CS: show class boxes, arrows, labels, method signatures.
- For processes: numbered steps with connecting arrows.`
}

function buildPromptFromText(title: string, text: string): string {
  const body = text.length > TEXT_CHAR_LIMIT
    ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated]'
    : text

  return `Choose the single most useful educational visual diagram for "${title}".

DOCUMENT CONTENT:
${body}

Respond ONLY with this JSON (exactly 1 item, or empty array if no visual concept exists):
{
  "visuals": [
    {
      "topic": "Short diagram title (max 50 chars)",
      "description": "One sentence: what this diagram shows and why it helps understanding",
      "visual_type": "concept_map | hierarchy | process_flow | diagram | comparison",
      "image_prompt": "Detailed image generation prompt"
    }
  ]
}

Rules:
- Return exactly 1 visual — the highest-value diagram for this document.
- Best candidates: OOP hierarchies, data structures, anatomy, circuits, biology cycles, process flows.
- If no concept genuinely benefits from a diagram, return an empty array.
- image_prompt must describe a precise, labelled educational diagram on a dark background, professional quality.`
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
    .slice(0, DEFAULT_VISUAL_GENERATION_COUNT)
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
  imageModel: string,
): Promise<StudyVisualItem> {

  // ── Stage A: call OpenAI image generation ────────────────────────────────

  let imageBuffer: Buffer
  try {
    const response = await openai.images.generate({
      model:  imageModel,
      prompt: item.image_prompt,
      size:   '1024x1024',
      n:      1,
    })

    const image = response.data?.[0]

    if (image?.b64_json) {
      // GPT Image models return base64 by default
      imageBuffer = Buffer.from(image.b64_json, 'base64')
    } else if (image?.url) {
      // Fallback: fetch URL server-side (DALL·E-style response)
      const fetched = await fetch(image.url)
      if (!fetched.ok) throw new Error(`Failed to download generated image (HTTP ${fetched.status})`)
      imageBuffer = Buffer.from(await fetched.arrayBuffer())
    } else {
      throw new Error('Image model unavailable. Check OPENAI_IMAGE_MODEL or API access.')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[visuals] image_generation_failed', {
      topic: item.topic,
      model: imageModel,
      index,
      error: msg.slice(0, 400),
    })
    return {
      ...item,
      image_url:     null,
      status:        'failed',
      error:         msg.slice(0, 200),
      failure_stage: 'image_generation',
    }
  }

  // ── Stage B: upload to Supabase Storage ──────────────────────────────────

  // Fixed path per user/doc/index — regeneration overwrites cleanly
  const storagePath = `${userId}/${documentId}/${index}.png`

  try {
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert:      true,
      })

    if (uploadError) throw new Error(uploadError.message)

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath)

    console.log('[visuals] image_stored', {
      topic: item.topic,
      path:  storagePath,
      url:   urlData.publicUrl.slice(0, 80) + '…',
    })

    return { ...item, image_url: urlData.publicUrl, status: 'generated' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[visuals] storage_upload_failed', {
      topic:       item.topic,
      bucket:      STORAGE_BUCKET,
      storagePath,
      error:       msg.slice(0, 400),
    })
    return {
      ...item,
      image_url:     null,
      status:        'failed',
      error:         msg.slice(0, 200),
      failure_stage: 'storage_upload',
    }
  }
}

// ── Core generation (shared by server action and background job) ──────────────

async function generateVisualsCore(
  documentId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
): Promise<StudyVisualSet> {
  const { data: doc } = await supabase
    .from('documents')
    .select('user_id, title, extracted_text')
    .eq('id', documentId)
    .single()

  if (!doc || doc.user_id !== userId) throw new Error('Not authorized')

  if (!doc.extracted_text?.trim()) {
    throw new Error('No extracted text found. Please extract text from the document first.')
  }

  const { data: analysisRow } = await supabase
    .from('document_analysis')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .maybeSingle()

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const imageModel = getImageModel()

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
    const { data: saved, error } = await supabase
      .from('study_visuals')
      .upsert(
        { document_id: documentId, user_id: userId, visuals: [], model: PROMPT_MODEL },
        { onConflict: 'document_id,user_id' },
      )
      .select()
      .single()
    if (error || !saved) throw new Error(error?.message ?? 'Failed to save visuals')
    return saved as StudyVisualSet
  }

  const generated: StudyVisualItem[] = []
  for (let i = 0; i < prompts.length; i++) {
    const result = await generateAndStoreImage(
      openai, supabase, userId, documentId, prompts[i], i, imageModel,
    )
    generated.push(result)
  }

  const { data: saved, error: saveError } = await supabase
    .from('study_visuals')
    .upsert(
      {
        document_id: documentId,
        user_id: userId,
        visuals: generated,
        model: `${PROMPT_MODEL}+${imageModel}`,
      },
      { onConflict: 'document_id,user_id' },
    )
    .select()
    .single()

  if (saveError || !saved) throw new Error(saveError?.message ?? 'Failed to save visuals')
  return saved as StudyVisualSet
}

// ── Called from background job API route ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateVisualsForJob(documentId: string, userId: string, supabase: SupabaseClient<any, 'public', any>): Promise<StudyVisualSet> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.')
  }
  return generateVisualsCore(documentId, userId, supabase)
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function generateVisuals(documentId: string): Promise<StudyVisualSet> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env.local file.')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  return generateVisualsCore(documentId, user.id, supabase)
}
