/**
 * Semantic unit tests for visualsWorker.ts — Group A (pure TypeScript, no database).
 *
 * These tests verify the worker's storage-boundary behaviour:
 *   - Oversized image rejected before upload
 *   - Non-PNG bytes rejected before upload
 *   - Valid PNG accepted and uploaded with correct content-type
 *   - Sanitized failure shape (no raw provider data exposed)
 *   - Upload failure → STORAGE_UPLOAD_FAILED outcome
 *   - Storage path follows the expected format
 *   - Recovery-boundary constants (MAX_IMAGE_BYTES, PNG_SIGNATURE)
 *
 * Database integration tests (fn_get_claimed_job_context, etc.) remain in
 * workerScenarios.test.ts GROUP B and require George's explicit approval before
 * execution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── server-only mock (must be hoisted before visualsWorker import) ────────────
vi.mock('server-only', () => ({}))

// ── Hoisted mock references — defined before vi.mock factories execute ────────
const { mockImagesGenerate, mockChatCreate, mockUpload, mockStorageFrom, mockRpc } = vi.hoisted(() => {
  const upload = vi.fn()
  return {
    mockImagesGenerate: vi.fn(),
    mockChatCreate:     vi.fn(),
    mockUpload:         upload,
    mockStorageFrom:    vi.fn(() => ({ upload })),
    mockRpc:            vi.fn(),
  }
})

// ── External-dependency mocks ─────────────────────────────────────────────────

vi.mock('@/lib/supabase/serviceClient', () => ({
  createServiceClient: () => ({ storage: { from: mockStorageFrom }, rpc: mockRpc }),
}))

vi.mock('openai', () => ({
  // Must be a regular function (not an arrow function) to support `new OpenAI(...)`
  default: function MockOpenAI() {
    return {
      images: { generate: mockImagesGenerate },
      chat:   { completions: { create: mockChatCreate } },
    }
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/lib/jobs/visualsStorage', () => ({
  VISUALS_STORAGE_BUCKET: 'study-visuals',
}))

// ── Import under test (after mocks) ──────────────────────────────────────────

import { stageVisualsForJob } from '../visualsWorker'

// ── Constants reflected from visualsWorker.ts ─────────────────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB_ID    = '00000000-0000-0000-0000-000000000001'
const WORKER_ID = '00000000-0000-0000-0000-000000000002'
const USER_ID   = '00000000-0000-0000-0000-000000000003'
const DOC_ID    = '00000000-0000-0000-0000-000000000004'
const SNAP_ID   = '00000000-0000-0000-0000-000000000005'
const LEASE     = 'lease-token-test'
const VERSION   = 1

// CRC32 using the Ethernet/PKZIP/PNG polynomial (mirrors visualsWorker.ts production code).
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

// Build a structurally valid minimal PNG that satisfies the bounded chunk parser:
//   8 sig + 25 IHDR + 12+extraBodyBytes IDAT + 12 IEND = base 57 bytes when extraBodyBytes=0.
// R15-H04: IDAT is now required by the production validator; extraBodyBytes fills the IDAT
// data field so size-boundary tests keep the same total-size formula (base + extraBodyBytes).
// The image is declared as 1x1 RGBA 8-bit — valid bit-depth/color-type combination.
function makePngBuffer(extraBodyBytes = 0): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  const ihdrType = Buffer.from('IHDR')
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01,  // width  = 1
    0x00, 0x00, 0x00, 0x01,  // height = 1
    0x08,                    // bit depth  = 8
    0x06,                    // color type = 6 (RGBA)
    0x00, 0x00, 0x00,        // compression = 0, filter = 0, interlace = 0
  ])
  const ihdrLen = Buffer.alloc(4)
  ihdrLen.writeUInt32BE(13)
  const ihdrCrc = Buffer.alloc(4)
  ihdrCrc.writeUInt32BE(pngCrc32(Buffer.concat([ihdrType, ihdrData])))
  const ihdr = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc])

  // IDAT chunk: extraBodyBytes bytes of zeros as data; CRC is computed over type + data.
  // The production validator checks only chunk structure and CRC, not IDAT decompressibility.
  const idatType = Buffer.from('IDAT')
  const idatData = Buffer.alloc(extraBodyBytes, 0)
  const idatLen  = Buffer.alloc(4)
  idatLen.writeUInt32BE(extraBodyBytes)
  const idatCrc = Buffer.alloc(4)
  idatCrc.writeUInt32BE(pngCrc32(Buffer.concat([idatType, idatData])))
  const idat = Buffer.concat([idatLen, idatType, idatData, idatCrc])

  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])

  return Buffer.concat([sig, ihdr, idat, iend])
}

// PNG_BASE_SIZE is the overhead bytes of makePngBuffer(0) = 8 sig + 25 IHDR + 12 IDAT(0) + 12 IEND
const PNG_BASE_SIZE = 57

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    user_id:              USER_ID,
    document_id:          DOC_ID,
    attempt_count:        1,
    snapshot_id:          SNAP_ID,
    snapshot_title:       'Test Document',
    snapshot_text:        'Some extracted text for the document to enable generation.',
    snapshot_analysis:    null,
    content_hash:         'abc123',
    operation_descriptor: {
      schema_version:        1,
      job_type:              'visuals',
      text_model:            'gpt-4o-mini',
      image_model:           'gpt-image-2',
      temperature:           0.3,
      max_tokens:            1200,
      image_size:            '1024x1024',
      image_count:           1,
      prompt_schema_version: 1,
    },
    ...overrides,
  }
}

// Build a fetch mock for URL-branch tests. Returns a vitest mock function that
// resolves to a minimal Response-like object with a getReader() body stream.
function makeFetchMock(opts: {
  ok?: boolean
  status?: number
  contentType?: string | null
  contentLength?: number | null
  chunks?: Uint8Array[]
}) {
  const { ok = true, status = 200, contentType = 'image/png', contentLength = null, chunks = [] } = opts
  const hdrMap = new Map<string, string>()
  if (contentType !== null) hdrMap.set('content-type', contentType)
  if (contentLength !== null) hdrMap.set('content-length', String(contentLength))
  const headers = { get: (k: string) => hdrMap.get(k.toLowerCase()) ?? null }
  let idx = 0
  const reader = {
    read: vi.fn(() => {
      if (idx < chunks.length) return Promise.resolve({ done: false, value: chunks[idx++] })
      return Promise.resolve({ done: true, value: undefined })
    }),
    cancel: vi.fn(),
  }
  return vi.fn().mockResolvedValue({ ok, status, headers, body: { getReader: () => reader } })
}

// A buffer whose first byte differs from PNG signature
function makeNonPngBuffer(): Buffer {
  const buf = Buffer.alloc(16, 0)
  buf[0] = 0x00  // not 0x89
  return buf
}

// ─────────────────────────────────────────────────────────────────────────────

describe('visualsWorker — Storage boundary semantics (Group A)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'sk-test-key'

    // Default RPC: return a valid context
    mockRpc.mockResolvedValue({ data: makeContext(), error: null })

    // Default chat response: one visual topic
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            visuals: [{
              topic:        'Class Hierarchy Diagram',
              description:  'UML class hierarchy for the module.',
              visual_type:  'hierarchy',
              image_prompt: 'A detailed labelled UML diagram on a dark background.',
            }],
          }),
        },
      }],
    })

    // Default upload: success
    mockUpload.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  // ── Storage-bound size check ──────────────────────────────────────────────

  it('rejects an image exceeding 5 MiB before upload and returns STORAGE_UPLOAD_FAILED', async () => {
    const oversized = makePngBuffer(MAX_IMAGE_BYTES)  // PNG_BASE_SIZE + MAX_IMAGE_BYTES > MAX_IMAGE_BYTES limit
    const b64 = oversized.toString('base64')
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: b64 }] })

    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    // Upload must NOT have been called for an oversized image
    expect(mockUpload).not.toHaveBeenCalled()
    // The item must have the sanitized failure shape
    expect(result.items).toHaveLength(1)
    expect(result.items[0].status).toBe('failed')
    expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    expect(result.items[0].failure_stage).toBe('storage_upload')
    // image_url and storage_path must not be populated
    expect(result.items[0].image_url).toBeNull()
    expect(result.items[0].storage_path).toBeNull()
  })

  it('accepts an image exactly at 5 MiB − 1 byte (boundary below limit)', async () => {
    // makePngBuffer base = PNG_BASE_SIZE (57) bytes. Total = 57 + extraBodyBytes.
    // Target: MAX_IMAGE_BYTES − 1, so extraBodyBytes = MAX_IMAGE_BYTES − 1 − PNG_BASE_SIZE.
    const atLimit = makePngBuffer(MAX_IMAGE_BYTES - 1 - PNG_BASE_SIZE)
    const b64 = atLimit.toString('base64')
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: b64 }] })

    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    // Upload must have been called (not rejected for size)
    expect(mockUpload).toHaveBeenCalledOnce()
    expect(result.items[0].status).toBe('generated')
  })

  // ── PNG signature validation ──────────────────────────────────────────────

  it('rejects a non-PNG buffer and returns STORAGE_UPLOAD_FAILED without uploading', async () => {
    const nonPng = makeNonPngBuffer()
    const b64 = nonPng.toString('base64')
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: b64 }] })

    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    expect(mockUpload).not.toHaveBeenCalled()
    expect(result.items[0].status).toBe('failed')
    expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    expect(result.items[0].failure_stage).toBe('storage_upload')
  })

  it('rejects a buffer shorter than 45 bytes (minimum sig + IHDR + IEND)', async () => {
    // PNG_BASE_SIZE = 45; any shorter buffer cannot contain all required chunks.
    const tooShort = Buffer.alloc(44, 0)
    tooShort[0] = 0x89  // correct first signature byte but truncated
    const b64 = tooShort.toString('base64')
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: b64 }] })

    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    expect(mockUpload).not.toHaveBeenCalled()
    expect(result.items[0].status).toBe('failed')
    expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
  })

  // ── Upload content-type enforcement ──────────────────────────────────────

  it('uploads with contentType image/png (not any other MIME type)', async () => {
    const validPng = makePngBuffer(100)
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: validPng.toString('base64') }] })

    const signal = new AbortController().signal
    await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    expect(mockUpload).toHaveBeenCalledOnce()
    const [, , uploadOptions] = mockUpload.mock.calls[0]
    expect(uploadOptions.contentType).toBe('image/png')
    expect(uploadOptions.upsert).toBe(false)
  })

  // ── Storage path format ───────────────────────────────────────────────────

  it('uses the exact path format {userId}/{documentId}/{jobId}/{attemptCount}/{uuid}.png', async () => {
    const validPng = makePngBuffer(100)
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: validPng.toString('base64') }] })

    const signal = new AbortController().signal
    await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    expect(mockUpload).toHaveBeenCalledOnce()
    const [storagePath] = mockUpload.mock.calls[0]
    // Path must follow {userId}/{documentId}/{jobId}/{attemptCount}/{uuid}.png
    const pathRegex = new RegExp(
      `^${USER_ID}/${DOC_ID}/${JOB_ID}/1/[0-9a-f-]{36}\\.png$`
    )
    expect(storagePath).toMatch(pathRegex)
    // Must use the Supabase bucket constant
    expect(mockStorageFrom).toHaveBeenCalledWith('study-visuals')
  })

  // ── Upload failure → sanitized error shape ────────────────────────────────

  it('returns STORAGE_UPLOAD_FAILED with sanitized shape when upload throws', async () => {
    const validPng = makePngBuffer(100)
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: validPng.toString('base64') }] })
    mockUpload.mockResolvedValue({ error: new Error('Storage quota exceeded') })

    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    expect(result.items[0].status).toBe('failed')
    expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    expect(result.items[0].failure_stage).toBe('storage_upload')
    // Raw provider error message must NOT appear in the exposed shape
    const exposed = JSON.stringify(result.items[0])
    expect(exposed).not.toContain('Storage quota exceeded')
    expect(result.items[0].image_url).toBeNull()
    expect(result.items[0].storage_path).toBeNull()
  })

  // ── Image generation failure → sanitized error shape ─────────────────────

  it('returns IMAGE_GENERATION_FAILED with sanitized shape when OpenAI throws', async () => {
    mockImagesGenerate.mockRejectedValue(new Error('OpenAI internal server error — request ID: abc123'))

    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    expect(result.items[0].status).toBe('failed')
    expect(result.items[0].error).toBe('IMAGE_GENERATION_FAILED')
    expect(result.items[0].failure_stage).toBe('image_generation')
    // Raw provider error detail must NOT appear in the exposed shape
    const exposed = JSON.stringify(result.items[0])
    expect(exposed).not.toContain('OpenAI internal server error')
    expect(exposed).not.toContain('abc123')
  })

  // ── No-visuals result ─────────────────────────────────────────────────────

  it('returns empty items and NO_VISUAL_TOPICS when the model suggests no visuals', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ visuals: [] }) } }],
    })

    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)

    expect(result.items).toHaveLength(0)
    expect(result.resultCode).toBe('NO_VISUAL_TOPICS')
    expect(mockImagesGenerate).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  // ── Context missing → throw (not silent failure) ─────────────────────────

  it('throws when fn_get_claimed_job_context returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') })

    const signal = new AbortController().signal
    await expect(
      stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
    ).rejects.toThrow('CLAIMED_JOB_CONTEXT_MISSING')
  })

  // ── Abort signal respected ────────────────────────────────────────────────

  it('throws AbortError immediately when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, controller.signal)
    ).rejects.toThrow()
  })

  // ── URL fetch branch (R12-H04) ────────────────────────────────────────────

  describe('URL fetch branch (image?.url path)', () => {
    const IMAGE_URL = 'https://api.example.com/generated/img.png'

    beforeEach(() => {
      mockImagesGenerate.mockResolvedValue({ data: [{ url: IMAGE_URL }] })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    function pngChunks(extraBodyBytes = 0): Uint8Array[] {
      return [new Uint8Array(makePngBuffer(extraBodyBytes))]
    }

    it('succeeds when URL response is a valid PNG with correct Content-Type', async () => {
      vi.stubGlobal('fetch', makeFetchMock({ chunks: pngChunks(100) }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(result.items[0].status).toBe('generated')
      expect(mockUpload).toHaveBeenCalledOnce()
      const [, , opts] = mockUpload.mock.calls[0]
      expect(opts.contentType).toBe('image/png')
    })

    it('passes redirect:error option to fetch so redirect chains are blocked', async () => {
      vi.stubGlobal('fetch', makeFetchMock({ chunks: pngChunks(100) }))
      const signal = new AbortController().signal
      await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>
      expect(fetchMock).toHaveBeenCalledOnce()
      const [, fetchOpts] = fetchMock.mock.calls[0]
      expect(fetchOpts.redirect).toBe('error')
    })

    // ── R14-H04: Exact MIME matching ──────────────────────────────────────────

    it('rejects non-image/png Content-Type and returns STORAGE_UPLOAD_FAILED', async () => {
      vi.stubGlobal('fetch', makeFetchMock({ contentType: 'image/jpeg', chunks: pngChunks(100) }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].status).toBe('failed')
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
      expect(result.items[0].failure_stage).toBe('storage_upload')
    })

    it('rejects Content-Type image/png-malicious (prefix match is insufficient)', async () => {
      // startsWith('image/png') would incorrectly accept this; exact parse must not.
      vi.stubGlobal('fetch', makeFetchMock({ contentType: 'image/png-malicious', chunks: pngChunks(100) }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].status).toBe('failed')
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })

    it('accepts Content-Type image/png with a charset parameter', async () => {
      // Parameters after ';' are stripped; the media type 'image/png' remains valid.
      vi.stubGlobal('fetch', makeFetchMock({ contentType: 'image/png; charset=utf-8', chunks: pngChunks(100) }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(result.items[0].status).toBe('generated')
    })

    it('accepts Content-Type IMAGE/PNG (case-insensitive)', async () => {
      vi.stubGlobal('fetch', makeFetchMock({ contentType: 'IMAGE/PNG', chunks: pngChunks(100) }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(result.items[0].status).toBe('generated')
    })

    // ── R14-H04: Size caps ────────────────────────────────────────────────────

    it('rejects via content-length early reject when header claims oversized response', async () => {
      vi.stubGlobal('fetch', makeFetchMock({ contentLength: MAX_IMAGE_BYTES + 1, chunks: [] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].status).toBe('failed')
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
      expect(result.items[0].failure_stage).toBe('storage_upload')
    })

    it('rejects via streaming cap when body exceeds MAX_IMAGE_BYTES without content-length', async () => {
      const chunk1 = new Uint8Array(MAX_IMAGE_BYTES)
      const chunk2 = new Uint8Array(1)
      vi.stubGlobal('fetch', makeFetchMock({ contentLength: null, chunks: [chunk1, chunk2] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].status).toBe('failed')
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
      expect(result.items[0].failure_stage).toBe('storage_upload')
    })

    // ── R14-H04: Full PNG structural validation ───────────────────────────────

    it('rejects a buffer with valid signature but IHDR length field not 13', async () => {
      const bad = Buffer.alloc(45, 0)
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(bad, 0)
      bad.writeUInt32BE(12, 8)  // IHDR length = 12 instead of required 13
      Buffer.from('IHDR').copy(bad, 12)
      vi.stubGlobal('fetch', makeFetchMock({ chunks: [new Uint8Array(bad)] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })

    it('rejects a buffer where IHDR width is zero', async () => {
      const good = makePngBuffer(0)
      // Zero out the width field (bytes 16–19)
      const bad = Buffer.from(good)
      bad.writeUInt32BE(0, 16)  // width = 0
      vi.stubGlobal('fetch', makeFetchMock({ chunks: [new Uint8Array(bad)] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })

    it('rejects a buffer where IHDR height is zero', async () => {
      const good = makePngBuffer(0)
      const bad = Buffer.from(good)
      bad.writeUInt32BE(0, 20)  // height = 0
      vi.stubGlobal('fetch', makeFetchMock({ chunks: [new Uint8Array(bad)] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })

    it('rejects a buffer with invalid bit-depth/color-type combination', async () => {
      // Color type 2 (RGB) only allows bit depths 8 and 16; 4 is invalid.
      const good = makePngBuffer(0)
      const bad = Buffer.from(good)
      bad[24] = 4   // bit depth = 4 (invalid for RGB)
      bad[25] = 2   // color type = 2 (RGB)
      vi.stubGlobal('fetch', makeFetchMock({ chunks: [new Uint8Array(bad)] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })

    it('rejects a buffer with a corrupt IHDR CRC', async () => {
      const good = makePngBuffer(0)
      const bad = Buffer.from(good)
      bad[29] ^= 0xFF  // flip all bits in the first CRC byte
      vi.stubGlobal('fetch', makeFetchMock({ chunks: [new Uint8Array(bad)] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })

    it('rejects a buffer that is missing the terminal IEND chunk', async () => {
      // Drop the last 12 bytes (the IEND chunk)
      const good = makePngBuffer(0)
      const noIend = good.subarray(0, good.length - 12)
      vi.stubGlobal('fetch', makeFetchMock({ chunks: [new Uint8Array(noIend)] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })

    it('rejects a buffer shorter than 45 bytes in the URL branch', async () => {
      const tooShort = Buffer.alloc(44, 0)
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(tooShort, 0)
      vi.stubGlobal('fetch', makeFetchMock({ chunks: [new Uint8Array(tooShort)] }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(mockUpload).not.toHaveBeenCalled()
      expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
    })
  })
})
