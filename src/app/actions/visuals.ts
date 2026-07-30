'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/serviceClient'
import { logger } from '@/lib/logger'
import { VISUALS_STORAGE_BUCKET } from '@/lib/jobs/visualsStorage'
import type { StudyVisualItem } from '@/types/studyVisual'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 10_000
const DEFAULT_VISUAL_GENERATION_COUNT = 1
const PROMPT_MODEL = 'gpt-4o-mini'

// The study-visuals bucket MUST be private. Images are never accessible via
// public URL. Access is via short-lived signed URLs issued server-side after
// ownership verification: GET /api/visuals/[documentId]

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
      storage_path: null,
      image_url:    null,
      status:       'pending' as const,
    }))
}

// ── Image generation and storage ──────────────────────────────────────────────
//
// Uses the SERVICE-ROLE client for Storage uploads: the study-visuals bucket is
// private and the authenticated role has no write access.
// Paths are immutable and attempt-scoped: {userId}/{documentId}/{jobId}/{attempt}/{i}.png
// upsert: false — never overwrite an existing object (fail closed on collision).

async function generateAndStoreImage(
  openai: OpenAI,
  storagePath: string,
  item: StudyVisualItem,
  imageModel: string,
): Promise<StudyVisualItem> {

  // Stage A: call OpenAI image generation
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
      imageBuffer = Buffer.from(image.b64_json, 'base64')
    } else if (image?.url) {
      const fetched = await fetch(image.url)
      if (!fetched.ok) throw new Error(`Image download failed (HTTP ${fetched.status})`)
      imageBuffer = Buffer.from(await fetched.arrayBuffer())
    } else {
      throw new Error('Image model returned no usable data')
    }
  } catch {
    logger.error('worker.visuals.image_generation_failed', { error_code: 'IMAGE_GENERATION_FAILED' })
    return {
      ...item,
      storage_path:  null,
      image_url:     null,
      status:        'failed',
      error:         'IMAGE_GENERATION_FAILED',
      failure_stage: 'image_generation',
    }
  }

  // Stage B: upload to private Supabase Storage via service-role client.
  // upsert: false — fail closed if the path already exists (should be impossible
  // with attempt-scoped versioned paths, but defended against at the API level).
  // No public URL is generated. The storage_path is stored in the JSONB manifest
  // and signed URLs are issued on-demand via the /api/visuals/[documentId] endpoint.
  try {
    const serviceClient = createServiceClient()
    const { error: uploadError } = await serviceClient.storage
      .from(VISUALS_STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert:      false,
      })

    if (uploadError) throw new Error('Storage upload failed')

    logger.info('worker.visuals.image_staged', { path: storagePath })

    return { ...item, storage_path: storagePath, image_url: null, status: 'generated' }
  } catch {
    logger.error('worker.visuals.storage_upload_failed', { error_code: 'STORAGE_UPLOAD_FAILED' })
    return {
      ...item,
      storage_path:  null,
      image_url:     null,
      status:        'failed',
      error:         'STORAGE_UPLOAD_FAILED',
      failure_stage: 'storage_upload',
    }
  }
}

// ── Shared: resolve document, analysis, and generate topic prompts ────────────

async function resolvePrompts(documentId: string, userId: string): Promise<{
  prompts: StudyVisualItem[]
  model: string
}> {
  // Uses the authenticated client for document and analysis reads (ownership enforced).
  const supabase = await createClient()

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
      model:           PROMPT_MODEL,
      response_format: { type: 'json_object' },
      temperature:     0.3,
      max_tokens:      1200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
    })
    rawContent = completion.choices[0]?.message?.content ?? ''
    if (!rawContent) throw new Error('Empty response')
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('429') || msg.includes('quota'))
      throw new Error('OpenAI rate limit reached. Please wait a moment and try again.')
    if (msg.includes('401') || msg.includes('Incorrect API key'))
      throw new Error('Invalid OpenAI API key. Check OPENAI_API_KEY in .env.local.')
    throw new Error('Visual topic detection failed. Please try again.')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawContent) as Record<string, unknown>
  } catch {
    throw new Error('Malformed response from AI model. Please try again.')
  }

  const prompts = safeVisuals(parsed.visuals)
  const model = `${PROMPT_MODEL}+${imageModel}`

  return { prompts, model }
}

// ── JOB PATH: staging ─────────────────────────────────────────────────────────
//
// Called from the job route worker BEFORE the completion CAS.
// Generates images via OpenAI and uploads them to the private study-visuals bucket
// at versioned attempt-scoped paths: {userId}/{documentId}/{jobId}/{attempt}/{i}.png
//
// Returns a manifest with storage_path for each item (no public URLs, no image_url).
// study_visuals is NOT written here — only after the CAS wins (fn_complete_and_publish_job).
// If the CAS fails (cancelled, stale, lost_race), staged objects remain private and
// unreachable. Future storage cleanup handles orphaned objects.
export async function stageVisualsForJob(
  documentId: string,
  userId: string,
  jobId: string,
  attemptCount: number,
): Promise<{ items: StudyVisualItem[]; model: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.')
  }

  const { prompts, model } = await resolvePrompts(documentId, userId)

  if (prompts.length === 0) {
    return { items: [], model }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const imageModel = getImageModel()

  const generated: StudyVisualItem[] = []
  for (let i = 0; i < prompts.length; i++) {
    // Versioned path: unique per job + attempt — no overwrite of other attempts' data.
    const storagePath = `${userId}/${documentId}/${jobId}/${attemptCount}/${i}.png`
    const result = await generateAndStoreImage(openai, storagePath, prompts[i], imageModel)
    generated.push(result)
  }

  return { items: generated, model }
}
