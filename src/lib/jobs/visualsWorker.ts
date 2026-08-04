// SERVER-ONLY — never import from client components, 'use client', or Server Actions.
// This is a plain server module, NOT a Server Action ('use server').
// Importing 'server-only' prevents accidental client bundling.
import 'server-only'

import { randomUUID } from 'crypto'
import OpenAI from 'openai'
import { createServiceClient } from '@/lib/supabase/serviceClient'
import { logger } from '@/lib/logger'
import { VISUALS_STORAGE_BUCKET } from '@/lib/jobs/visualsStorage'
import type { StudyVisualItem } from '@/types/studyVisual'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 10_000
const DEFAULT_VISUAL_GENERATION_COUNT = 1
// R10-H06: Maximum bytes accepted for a single image before upload.
// Matches the storage.buckets file_size_limit set in the corrective migration.
// Rejects oversized provider responses before they consume upload bandwidth or Storage quota.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5 MiB

// R15-H04: Bounded provider and download deadlines composed with the job cancellation signal.
// These prevent indefinite pending SDK calls when the provider is slow or unresponsive.
const PROVIDER_IMAGE_TIMEOUT_MS = 120_000  // 2 min — image generation API call
const PROVIDER_TEXT_TIMEOUT_MS  =  60_000  // 1 min — text completion API call
const DOWNLOAD_TIMEOUT_MS       =  30_000  // 30 s  — image URL body download

// ── PNG structural validation ─────────────────────────────────────────────────

// R14-H04: CRC32 using the Ethernet/PKZIP/PNG polynomial (0xEDB88320, reflected).
// Implemented inline to avoid @types/node version constraints on zlib.crc32.
function pngCrc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// R15-H04: Validates PNG structural integrity via full bounded chunk iteration.
// Checks: 8-byte signature; IHDR first/once (length=13, non-zero dimensions,
// valid bit-depth/color-type, compression=0, filter=0, interlace 0|1, CRC-32);
// at least one IDAT chunk; per-chunk CRC validation for every chunk; IEND
// last/once with zero data length; unknown critical chunks rejected (bit 5 of
// first-type-byte = 0). The 5 MiB byte cap must be applied before this function.
function validatePngStructure(buf: Buffer): boolean {
  // Minimum: 8 sig + 25 IHDR (4+4+13+4) + 12 min-IDAT (4+4+0+4) + 12 IEND = 57
  if (buf.length < 57) return false

  // PNG signature
  const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) return false

  const validBitDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16],  // Grayscale
    2: [8, 16],            // RGB
    3: [1, 2, 4, 8],       // Indexed-colour
    4: [8, 16],            // Grayscale + Alpha
    6: [8, 16],            // RGBA
  }

  let offset    = 8      // start after 8-byte signature
  let foundIHDR = false
  let foundIDAT = false
  let iendOffset = -1    // -1 = not yet seen

  while (offset < buf.length) {
    // Need 4 bytes for length field + 4 bytes for type field
    if (offset + 8 > buf.length) return false
    const chunkLength = buf.readUInt32BE(offset)
    // Bounds check: 4 (len) + 4 (type) + chunkLength (data) + 4 (CRC) must fit
    if (chunkLength > buf.length - offset - 12) return false

    const typeOffset = offset + 4
    const dataOffset = offset + 8
    const crcOffset  = dataOffset + chunkLength

    // Per-chunk CRC: CRC32 over type (4 bytes) + data (chunkLength bytes)
    if (pngCrc32(buf.subarray(typeOffset, crcOffset)) !== buf.readUInt32BE(crcOffset)) return false

    const chunkType = buf.toString('ascii', typeOffset, typeOffset + 4)

    if (!foundIHDR) {
      // The very first chunk must be IHDR
      if (chunkType !== 'IHDR') return false
      if (chunkLength !== 13) return false
      const width       = buf.readUInt32BE(dataOffset)
      const height      = buf.readUInt32BE(dataOffset + 4)
      const bitDepth    = buf[dataOffset + 8]
      const colorType   = buf[dataOffset + 9]
      const compression = buf[dataOffset + 10]
      const filter      = buf[dataOffset + 11]
      const interlace   = buf[dataOffset + 12]
      if (width === 0 || height === 0) return false
      if (compression !== 0 || filter !== 0) return false
      if (interlace !== 0 && interlace !== 1) return false
      const allowed = validBitDepths[colorType]
      if (!allowed || !allowed.includes(bitDepth)) return false
      foundIHDR = true
    } else if (chunkType === 'IHDR') {
      return false  // duplicate IHDR
    } else if (chunkType === 'IDAT') {
      if (iendOffset !== -1) return false  // IDAT cannot appear after IEND
      foundIDAT = true
    } else if (chunkType === 'IEND') {
      if (iendOffset !== -1) return false  // duplicate IEND
      if (chunkLength !== 0) return false   // IEND data must be empty
      iendOffset = offset
    } else {
      // Unknown chunk: bit 5 of first type byte = 0 → uppercase → critical chunk
      if (iendOffset !== -1) return false       // no chunk may follow IEND
      if ((buf[typeOffset] & 0x20) === 0) return false  // unknown critical chunk
    }

    offset = crcOffset + 4
  }

  // All three required chunks must have been seen; IEND must be the absolute last chunk
  if (!foundIHDR || !foundIDAT || iendOffset === -1) return false
  if (iendOffset !== buf.length - 12) return false

  return true
}

// R7-H02: models and config come from the bound operation_descriptor (set by fn_enqueue_job).
// R7-H02: Validated operation descriptor extracted from fn_get_claimed_job_context.
interface BoundOperationDescriptor {
  textModel:   string
  imageModel:  string
  temperature: number
  maxTokens:   number
  imageSize:   '1024x1024'
  imageCount:  1
}

// Validates the operation_descriptor JSONB from fn_get_claimed_job_context.
// Fails closed: throws if any required field is missing or wrong type.
function validateOperationDescriptor(raw: Record<string, unknown>): BoundOperationDescriptor {
  const expectedKeys = [
    'schema_version', 'job_type', 'text_model', 'image_model', 'temperature',
    'max_tokens', 'image_size', 'image_count', 'prompt_schema_version',
  ]
  if (Object.keys(raw).sort().join('|') !== [...expectedKeys].sort().join('|'))
    throw new Error('INVALID_DESCRIPTOR: descriptor keys do not match schema v1')
  if (raw['schema_version'] !== 1 || raw['prompt_schema_version'] !== 1 || raw['job_type'] !== 'visuals')
    throw new Error('INVALID_DESCRIPTOR: unsupported descriptor schema or job type')
  const textModel  = raw['text_model']
  const imageModel = raw['image_model']
  const temperature = raw['temperature']
  const maxTokens  = raw['max_tokens']
  const imageSize  = raw['image_size']
  const imageCount = raw['image_count']

  if (typeof textModel !== 'string' || !textModel)
    throw new Error('INVALID_DESCRIPTOR: text_model missing or not a string')
  if (typeof imageModel !== 'string' || !imageModel)
    throw new Error('INVALID_DESCRIPTOR: image_model missing or not a string')
  if (typeof temperature !== 'number')
    throw new Error('INVALID_DESCRIPTOR: temperature missing or not a number')
  if (typeof maxTokens !== 'number')
    throw new Error('INVALID_DESCRIPTOR: max_tokens missing or not a number')
  if (imageSize !== '1024x1024' || imageCount !== 1)
    throw new Error('INVALID_DESCRIPTOR: unsupported image size or count')

  return { textModel, imageModel, temperature, maxTokens, imageSize, imageCount }
}

// ── Prompt generation ─────────────────────────────────────────────────────────

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
      id:           randomUUID(),
      topic:        x.topic.trim(),
      description:  typeof x.description === 'string' ? x.description.trim() : '',
      image_prompt: x.image_prompt.trim(),
      storage_path: null,
      image_url:    null,
      mime_type:    null,
      status:       'pending' as const,
    }))
}

// ── Image generation and storage ──────────────────────────────────────────────

async function generateAndStoreImage(
  openai: OpenAI,
  storagePath: string,
  item: StudyVisualItem,
  imageModel: string,
  signal: AbortSignal,
): Promise<StudyVisualItem> {
  signal.throwIfAborted()

  // R15-H04: Compose job cancellation signal with a bounded provider deadline.
  // AbortSignal.any() aborts as soon as any constituent signal fires (Node ≥ 20).
  const providerSignal = AbortSignal.any([signal, AbortSignal.timeout(PROVIDER_IMAGE_TIMEOUT_MS)])

  let imageBuffer: Buffer
  try {
    // Pass composed signal to SDK so a job cancellation or timeout aborts the network call.
    const response = await openai.images.generate({
      model:  imageModel,
      prompt: item.image_prompt,
      size:   '1024x1024',
      n:      1,
    }, { signal: providerSignal })

    signal.throwIfAborted()

    const image = response.data?.[0]
    if (image?.b64_json) {
      imageBuffer = Buffer.from(image.b64_json, 'base64')
    } else if (image?.url) {
      // R15-H04: Compose download signal with its own shorter deadline.
      const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)])
      // R12-H04: redirect:'error' — provider URLs must be direct; no redirect chains accepted.
      const fetched = await fetch(image.url, { signal: downloadSignal, redirect: 'error' })
      if (!fetched.ok) throw new Error(`Image download failed (HTTP ${fetched.status})`)

      // R14-H04: Exact media-type check — parse the header, strip parameters,
      // and require case-insensitive exact 'image/png'. Prefix matching accepts
      // 'image/png-malicious'; exact matching does not.
      const mediaType = (fetched.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (mediaType !== 'image/png') {
        logger.error('worker.visuals.invalid_content_type', {
          error_code: 'STORAGE_UPLOAD_FAILED',
        })
        return {
          ...item,
          storage_path: null, image_url: null, status: 'failed',
          mime_type: null, error: 'STORAGE_UPLOAD_FAILED', failure_stage: 'storage_upload',
        }
      }

      // R11-C06: Content-length early reject — avoids reading an oversized response.
      const cl = fetched.headers.get('content-length')
      if (cl !== null && parseInt(cl, 10) > MAX_IMAGE_BYTES) {
        logger.error('worker.visuals.image_oversized_early', { error_code: 'STORAGE_UPLOAD_FAILED' })
        return {
          ...item,
          storage_path:  null,
          image_url:     null,
          status:        'failed',
          mime_type:     null,
          error:         'STORAGE_UPLOAD_FAILED',
          failure_stage: 'storage_upload',
        }
      }

      // R12-H04: Streaming 5 MiB cap — byte-counting reader prevents memory exhaustion
      // when a server omits content-length or lies about the response size.
      // R15-H04: Cancel the reader when downloadSignal fires so it does not remain pending.
      const reader = fetched.body!.getReader()
      const onAbort = () => { void reader.cancel() }
      downloadSignal.addEventListener('abort', onAbort, { once: true })
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      let oversized = false
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          totalBytes += value.byteLength
          if (totalBytes > MAX_IMAGE_BYTES) {
            void reader.cancel()
            oversized = true
            break
          }
          chunks.push(value)
        }
      } finally {
        downloadSignal.removeEventListener('abort', onAbort)
      }
      if (oversized) {
        logger.error('worker.visuals.image_oversized_stream', { error_code: 'STORAGE_UPLOAD_FAILED' })
        return {
          ...item,
          storage_path:  null,
          image_url:     null,
          status:        'failed',
          mime_type:     null,
          error:         'STORAGE_UPLOAD_FAILED',
          failure_stage: 'storage_upload',
        }
      }
      imageBuffer = Buffer.concat(chunks)
    } else {
      throw new Error('Image model returned no usable data')
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    logger.error('worker.visuals.image_generation_failed', { error_code: 'IMAGE_GENERATION_FAILED' })
    return {
      ...item,
      storage_path:  null,
      image_url:     null,
      status:        'failed',
      mime_type:     null,
      error:         'IMAGE_GENERATION_FAILED',
      failure_stage: 'image_generation',
    }
  }

  // R10-H06: Reject oversized provider responses before upload.
  // Guards against provider bugs and aligns with the storage.buckets file_size_limit.
  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    logger.error('worker.visuals.image_oversized', {
      error_code: 'STORAGE_UPLOAD_FAILED',
      byte_length: imageBuffer.byteLength,
    })
    return {
      ...item,
      storage_path:  null,
      image_url:     null,
      status:        'failed',
      mime_type:     null,
      error:         'STORAGE_UPLOAD_FAILED',
      failure_stage: 'storage_upload',
    }
  }

  // R14-H04: Full PNG structural validation — signature, complete IHDR (dimensions,
  // bit-depth/color-type, compression/filter/interlace fields, CRC-32), and terminal
  // IEND chunk. Rejects truncated files, non-PNG bytes, zero dimensions, invalid
  // field combinations, and CRC failures regardless of declared content-type.
  if (!validatePngStructure(imageBuffer)) {
    logger.error('worker.visuals.invalid_png_structure', { error_code: 'STORAGE_UPLOAD_FAILED' })
    return {
      ...item,
      storage_path:  null,
      image_url:     null,
      status:        'failed',
      mime_type:     null,
      error:         'STORAGE_UPLOAD_FAILED',
      failure_stage: 'storage_upload',
    }
  }

  signal.throwIfAborted()

  try {
    const serviceClient = createServiceClient()
    const { error: uploadError } = await serviceClient.storage
      .from(VISUALS_STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert:      false,
      })

    if (uploadError) throw new Error('Storage upload failed')

    logger.info('worker.visuals.image_staged', { stored: true })
    return {
      ...item,
      storage_path: storagePath,
      image_url: null,
      mime_type: 'image/png',
      status: 'generated',
    }
  } catch {
    logger.error('worker.visuals.storage_upload_failed', { error_code: 'STORAGE_UPLOAD_FAILED' })
    return {
      ...item,
      storage_path:  null,
      image_url:     null,
      status:        'failed',
      mime_type:     null,
      error:         'STORAGE_UPLOAD_FAILED',
      failure_stage: 'storage_upload',
    }
  }
}

// ── Prompt resolution from immutable snapshot ─────────────────────────────────
//
// All source content comes exclusively from the bound snapshot returned by
// fn_get_claimed_job_context. No reads of mutable documents or document_analysis
// tables occur after a job is claimed. Edits made after enqueue do not affect
// the generation input for an accepted job.

async function resolvePromptsFromSnapshot(
  snapshotTitle:        string,
  snapshotText:         string | null,
  snapshotAnalysisData: Record<string, unknown> | null,
  descriptor:           BoundOperationDescriptor,
  signal:               AbortSignal,
): Promise<{ prompts: StudyVisualItem[]; model: string }> {
  signal.throwIfAborted()

  if (!snapshotText?.trim()) {
    throw new Error('Snapshot has no extracted text. Cannot generate visuals.')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const userPrompt = snapshotAnalysisData
    ? buildPromptFromAnalysis(snapshotTitle, snapshotAnalysisData as unknown as DocumentAnalysis)
    : buildPromptFromText(snapshotTitle, snapshotText)

  // R15-H04: Compose job cancellation signal with a bounded text-completion deadline.
  const textSignal = AbortSignal.any([signal, AbortSignal.timeout(PROVIDER_TEXT_TIMEOUT_MS)])

  let rawContent: string
  try {
    const completion = await openai.chat.completions.create({
      // R7-H02: use text_model from bound operation_descriptor, not env var constant.
      model:           descriptor.textModel,
      response_format: { type: 'json_object' },
      temperature:     descriptor.temperature,
      max_tokens:      descriptor.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
    }, { signal: textSignal })
    rawContent = completion.choices[0]?.message?.content ?? ''
    if (!rawContent) throw new Error('Empty response')
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('429') || msg.includes('quota'))
      throw new Error('OpenAI rate limit reached. Please wait a moment and try again.')
    if (msg.includes('401') || msg.includes('Incorrect API key'))
      throw new Error('Invalid OpenAI API key. Check OPENAI_API_KEY in .env.local.')
    throw new Error('Visual topic detection failed. Please try again.')
  }

  signal.throwIfAborted()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawContent) as Record<string, unknown>
  } catch {
    throw new Error('Malformed response from AI model. Please try again.')
  }

  const prompts = safeVisuals(parsed.visuals)
  // model string records the exact descriptor-bound config used.
  const model = `${descriptor.textModel}+${descriptor.imageModel}`

  return { prompts, model }
}

// ── stageVisualsForJob — server-only, NOT a Server Action ─────────────────────
//
// Called from the job route worker BEFORE the completion CAS.
// Derives userId, documentId, and attemptCount from fn_get_claimed_job_context —
// never accepts these from the caller (avoids trusting request parameters).
//
// Returns a manifest with storage_path for each item (no public URLs, no image_url),
// plus resultCode='NO_VISUAL_TOPICS' if no suitable topics were found.
// study_visuals is NOT written here — only after the CAS wins in fn_complete_and_publish_job.
//
// Security: userId and documentId are derived from the DB via a narrow SECURITY DEFINER RPC
// that verifies worker_id, lease_token, state_version, status, and lease_expiry.
export async function stageVisualsForJob(
  jobId: string,
  workerId: string,
  leaseToken: string,
  claimStateVersion: number,
  signal: AbortSignal,
): Promise<{ items: StudyVisualItem[]; model: string; resultCode?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.')
  }

  signal.throwIfAborted()

  // C06: Get job context via narrow RPC — verifies all 6 post-claim predicates.
  // userId and documentId are derived from the DB, never from the caller.
  const serviceClient = createServiceClient()
  const { data: context, error: contextError } = await serviceClient.rpc('fn_get_claimed_job_context', {
    p_job_id:        jobId,
    p_worker_id:     workerId,
    p_lease_token:   leaseToken,
    p_state_version: claimStateVersion,
  })

  if (contextError || !context) {
    logger.error('worker.visuals.context_missing', {
      job_id:     jobId,
      error_code: 'CLAIMED_JOB_CONTEXT_MISSING',
    })
    throw new Error('CLAIMED_JOB_CONTEXT_MISSING')
  }

  // fn_get_claimed_job_context returns the bound immutable snapshot after all lease/CAS
  // checks. The snapshot was created atomically at enqueue time by fn_enqueue_job.
  // The worker never reads mutable documents or document_analysis after this point.
  const ctx = context as {
    user_id:              string
    document_id:          string
    attempt_count:        number
    snapshot_id:          string
    snapshot_title:       string
    snapshot_text:        string | null
    snapshot_analysis:    Record<string, unknown> | null
    content_hash:         string
    operation_descriptor: Record<string, unknown>
  }

  const {
    user_id: userId,
    document_id: documentId,
    attempt_count: attemptCount,
    snapshot_title: snapshotTitle,
    snapshot_text: snapshotText,
    snapshot_analysis: snapshotAnalysis,
    operation_descriptor: rawDescriptor,
  } = ctx

  // R7-H02: only client_verified jobs with a bound descriptor may be claimed.
  // Missing/invalid descriptors are authority failures, never environment fallbacks.
  let descriptor: BoundOperationDescriptor
  if (rawDescriptor && typeof rawDescriptor === 'object' && !Array.isArray(rawDescriptor)) {
    descriptor = validateOperationDescriptor(rawDescriptor as Record<string, unknown>)
  } else {
    throw new Error('BOUND_OPERATION_DESCRIPTOR_MISSING')
  }

  signal.throwIfAborted()

  const { prompts, model } = await resolvePromptsFromSnapshot(
    snapshotTitle, snapshotText, snapshotAnalysis, descriptor, signal,
  )

  if (prompts.length === 0) {
    return { items: [], model, resultCode: 'NO_VISUAL_TOPICS' }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const imageModel = descriptor.imageModel

  const generated: StudyVisualItem[] = []
  for (let i = 0; i < prompts.length; i++) {
    signal.throwIfAborted()
    const storagePath = `${userId}/${documentId}/${jobId}/${attemptCount}/${prompts[i].id}.png`
    const result = await generateAndStoreImage(openai, storagePath, prompts[i], imageModel, signal)
    generated.push(result)
  }

  return { items: generated, model }
}
