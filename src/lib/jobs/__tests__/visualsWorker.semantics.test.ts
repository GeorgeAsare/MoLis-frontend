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
import zlib from 'node:zlib'

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

// Build a structurally and content-valid minimal PNG satisfying the bounded chunk parser.
// IDAT uses real zlib-compressed pixel data for a 1×1 RGBA image (filter byte 0x00 + R=0,G=0,B=0,A=255).
// makePngBuffer(0) is the canonical valid fixture for positive tests (status:'generated').
// extraBodyBytes appends raw bytes AFTER the zlib stream inside IDAT; the resulting IDAT
// is CRC-valid but its payload is not decodable — use it ONLY for negative tests (oversize
// rejection, abort tests) where the image is never validated for content.
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

  // IDAT: real zlib-compressed scanline. PNG IDAT uses zlib wrapper format (RFC 1950).
  const idatType = Buffer.from('IDAT')
  const rawPixels = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xFF])  // filter=None, R=0,G=0,B=0,A=255
  const compressed = zlib.deflateSync(rawPixels)
  const idatData = extraBodyBytes > 0 ? Buffer.concat([compressed, Buffer.alloc(extraBodyBytes, 0)]) : compressed
  const idatLen  = Buffer.alloc(4)
  idatLen.writeUInt32BE(idatData.byteLength)
  const idatCrc = Buffer.alloc(4)
  idatCrc.writeUInt32BE(pngCrc32(Buffer.concat([idatType, idatData])))
  const idat = Buffer.concat([idatLen, idatType, idatData, idatCrc])

  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])

  return Buffer.concat([sig, ihdr, idat, iend])
}

// PNG_BASE_SIZE: actual byte size of makePngBuffer(0); computed dynamically so it reflects
// the real compressed IDAT payload rather than a hardcoded constant.
const PNG_BASE_SIZE = makePngBuffer(0).length

// Build a content-valid PNG by inserting a valid tEXt ancillary chunk of exactly `dataBytes` bytes.
// PNG tEXt data field structure per spec: keyword (1–79 Latin-1 bytes, no NUL) + NUL (0x00) + text.
// This implementation uses a 1-byte keyword 'x' + NUL separator + (dataBytes − 2) bytes of filler.
// Requires dataBytes >= 2.
// Total size = PNG_BASE_SIZE + 12 + dataBytes (12 = 4-len + 4-type + 4-CRC overhead).
// Use this for positive size-boundary tests instead of appending padding to IDAT.
function makePngBufferWithAncillaryChunk(dataBytes: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  const ihdrType = Buffer.from('IHDR')
  const ihdrData = Buffer.from([0x00,0x00,0x00,0x01, 0x00,0x00,0x00,0x01, 0x08, 0x06, 0x00,0x00,0x00])
  const ihdrLen = Buffer.alloc(4); ihdrLen.writeUInt32BE(13)
  const ihdrCrc = Buffer.alloc(4); ihdrCrc.writeUInt32BE(pngCrc32(Buffer.concat([ihdrType, ihdrData])))
  const ihdr = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc])

  const idatType = Buffer.from('IDAT')
  const rawPixels = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xFF])
  const compressed = zlib.deflateSync(rawPixels)
  const idatLen = Buffer.alloc(4); idatLen.writeUInt32BE(compressed.byteLength)
  const idatCrc = Buffer.alloc(4); idatCrc.writeUInt32BE(pngCrc32(Buffer.concat([idatType, compressed])))
  const idat = Buffer.concat([idatLen, idatType, compressed, idatCrc])

  // Valid tEXt data: 1-byte keyword 'x' (0x78) + NUL separator + text filler.
  const textType = Buffer.from('tEXt')
  const textData = Buffer.concat([
    Buffer.from([0x78]),                    // keyword: 'x' (1 byte, no NUL)
    Buffer.from([0x00]),                    // NUL separator (required by PNG tEXt spec)
    Buffer.alloc(dataBytes - 2, 0x41),      // text filler: 'A' × (dataBytes − 2)
  ])
  const textLen = Buffer.alloc(4); textLen.writeUInt32BE(dataBytes)
  const textCrc = Buffer.alloc(4); textCrc.writeUInt32BE(pngCrc32(Buffer.concat([textType, textData])))
  const textChunk = Buffer.concat([textLen, textType, textData, textCrc])

  const iend = Buffer.from([0x00,0x00,0x00,0x00, 0x49,0x45,0x4E,0x44, 0xAE,0x42,0x60,0x82])

  return Buffer.concat([sig, ihdr, idat, textChunk, iend])
}

// Per-chunk overhead: 4 (length field) + 4 (type field) + 4 (CRC field) bytes beyond the data field.
// tEXt chunks require dataBytes >= 2 (1-byte keyword + 1-byte NUL separator minimum).
const ANCILLARY_CHUNK_OVERHEAD = 12

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
    // Use a content-valid PNG with a tEXt ancillary chunk padded to exactly MAX_IMAGE_BYTES − 1 bytes.
    // Total = PNG_BASE_SIZE + ANCILLARY_CHUNK_OVERHEAD + dataBytes; solve for dataBytes.
    const dataBytes = MAX_IMAGE_BYTES - 1 - PNG_BASE_SIZE - ANCILLARY_CHUNK_OVERHEAD
    const atLimit = makePngBufferWithAncillaryChunk(dataBytes)
    expect(atLimit.byteLength).toBe(MAX_IMAGE_BYTES - 1)  // self-check: exact target size
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
    const validPng = makePngBuffer(0)
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
    const validPng = makePngBuffer(0)
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
    const validPng = makePngBuffer(0)
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
      vi.stubGlobal('fetch', makeFetchMock({ chunks: pngChunks(0) }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(result.items[0].status).toBe('generated')
      expect(mockUpload).toHaveBeenCalledOnce()
      const [, , opts] = mockUpload.mock.calls[0]
      expect(opts.contentType).toBe('image/png')
    })

    it('passes redirect:error option to fetch so redirect chains are blocked', async () => {
      vi.stubGlobal('fetch', makeFetchMock({ chunks: pngChunks(0) }))
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
      vi.stubGlobal('fetch', makeFetchMock({ contentType: 'image/png; charset=utf-8', chunks: pngChunks(0) }))
      const signal = new AbortController().signal
      const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      expect(result.items[0].status).toBe('generated')
    })

    it('accepts Content-Type IMAGE/PNG (case-insensitive)', async () => {
      vi.stubGlobal('fetch', makeFetchMock({ contentType: 'IMAGE/PNG', chunks: pngChunks(0) }))
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

  // ── R17-M02: Additional negative PNG structural tests (b64_json branch) ──────

  it('rejects a buffer with a corrupt IDAT CRC', async () => {
    const good = makePngBuffer(0)
    const bad  = Buffer.from(good)
    // IDAT starts at byte 33 (8 sig + 4+4+13+4 IHDR)
    const idatStart    = 33
    const idatDataLen  = good.readUInt32BE(idatStart)
    const idatCrcOff   = idatStart + 4 + 4 + idatDataLen
    bad[idatCrcOff] ^= 0xFF
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: bad.toString('base64') }] })
    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
  })

  it('rejects a buffer that has no IDAT chunk (IHDR followed directly by IEND)', async () => {
    const good        = makePngBuffer(0)
    const idatStart   = 33
    const idatDataLen = good.readUInt32BE(idatStart)
    const idatChunkSz = 4 + 4 + idatDataLen + 4
    const noIdat = Buffer.concat([good.subarray(0, idatStart), good.subarray(idatStart + idatChunkSz)])
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: noIdat.toString('base64') }] })
    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
  })

  it('rejects a buffer with trailing bytes after the IEND chunk', async () => {
    const withTrailing = Buffer.concat([makePngBuffer(0), Buffer.from([0x00, 0x00])])
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: withTrailing.toString('base64') }] })
    const signal = new AbortController().signal
    const result = await stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(result.items[0].error).toBe('STORAGE_UPLOAD_FAILED')
  })

  // ── R17-H02: Deadline / abort — zero-upload guarantees ───────────────────────

  describe('Deadline / abort — zero-upload guarantees (R17-H02)', () => {
    it('does not upload and re-throws when TimeoutError is thrown during image generation', async () => {
      const timeoutErr = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })
      mockImagesGenerate.mockRejectedValue(timeoutErr)
      const signal = new AbortController().signal
      await expect(
        stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      ).rejects.toMatchObject({ name: 'TimeoutError' })
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('does not upload and re-throws when TimeoutError is thrown during text completion', async () => {
      const timeoutErr = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })
      mockChatCreate.mockRejectedValue(timeoutErr)
      const signal = new AbortController().signal
      await expect(
        stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      ).rejects.toMatchObject({ name: 'TimeoutError' })
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('does not upload and re-throws when AbortError is thrown during image generation', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
      mockImagesGenerate.mockRejectedValue(abortErr)
      const signal = new AbortController().signal
      await expect(
        stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('does not upload and re-throws when AbortError is thrown during text completion', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
      mockChatCreate.mockRejectedValue(abortErr)
      const signal = new AbortController().signal
      await expect(
        stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('does not upload when the job signal is aborted after image generation returns', async () => {
      const validPng   = makePngBuffer(0)
      const controller = new AbortController()
      mockImagesGenerate.mockImplementation(async () => {
        controller.abort()
        return { data: [{ b64_json: validPng.toString('base64') }] }
      })
      await expect(
        stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, controller.signal)
      ).rejects.toThrow()
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('does not upload when the job signal is aborted after text completion returns', async () => {
      const controller = new AbortController()
      mockChatCreate.mockImplementation(async () => {
        controller.abort()
        return {
          choices: [{ message: { content: JSON.stringify({ visuals: [{ topic: 'T', description: 'D', visual_type: 'diagram', image_prompt: 'P' }] }) } }],
        }
      })
      await expect(
        stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, controller.signal)
      ).rejects.toThrow()
      expect(mockUpload).not.toHaveBeenCalled()
    })
  })

  // ── PNG fixture self-validation (R17-PATCH) ───────────────────────────────────

  describe('PNG fixture self-validation', () => {
    it('makePngBuffer(0) is a decodable content-valid 1×1 RGBA PNG: all CRCs correct, IDAT inflates to expected scanline', () => {
      const png = makePngBuffer(0)

      // Parse every chunk and verify CRCs.
      let offset = 8
      let foundIHDR = false, foundIDAT = false, foundIEND = false
      let ihdrWidth = 0, ihdrHeight = 0, ihdrBitDepth = 0, ihdrColorType = 0
      const idatData: Buffer[] = []

      while (offset < png.length) {
        const chunkLength = png.readUInt32BE(offset)
        const typeOffset  = offset + 4
        const dataOffset  = offset + 8
        const crcOffset   = dataOffset + chunkLength

        // Every chunk CRC must be valid.
        expect(pngCrc32(png.subarray(typeOffset, crcOffset))).toBe(png.readUInt32BE(crcOffset))

        const chunkType = png.toString('ascii', typeOffset, typeOffset + 4)
        if (chunkType === 'IHDR') {
          foundIHDR  = true
          expect(chunkLength).toBe(13)
          ihdrWidth     = png.readUInt32BE(dataOffset)
          ihdrHeight    = png.readUInt32BE(dataOffset + 4)
          ihdrBitDepth  = png[dataOffset + 8]
          ihdrColorType = png[dataOffset + 9]
          expect(ihdrWidth).toBe(1)
          expect(ihdrHeight).toBe(1)
          expect(ihdrBitDepth).toBe(8)
          expect(ihdrColorType).toBe(6)  // RGBA
        } else if (chunkType === 'IDAT') {
          foundIDAT = true
          idatData.push(png.subarray(dataOffset, crcOffset))
        } else if (chunkType === 'IEND') {
          foundIEND = true
          expect(chunkLength).toBe(0)
        }
        offset = crcOffset + 4
      }

      expect(foundIHDR).toBe(true)
      expect(foundIDAT).toBe(true)
      expect(foundIEND).toBe(true)

      // Inflate the concatenated IDAT payload.
      const decompressed = zlib.inflateSync(Buffer.concat(idatData))
      // 1×1 RGBA: 1 row × (1 filter byte + 1 pixel × 4 channels) = 5 bytes.
      const bytesPerPixel = ihdrColorType === 6 ? 4 : 1
      const expectedBytes = ihdrHeight * (1 + ihdrWidth * bytesPerPixel)
      expect(decompressed.length).toBe(expectedBytes)
      expect(decompressed[0]).toBe(0x00)  // filter = None
      expect(decompressed[1]).toBe(0x00)  // R
      expect(decompressed[2]).toBe(0x00)  // G
      expect(decompressed[3]).toBe(0x00)  // B
      expect(decompressed[4]).toBe(0xFF)  // A = 255
    })

    it('makePngBufferWithAncillaryChunk: correct total size, valid signature, all CRCs, IHDR first/once, tEXt valid keyword+NUL, IEND once/last/zero-length/no-trailing, IDAT decodable', () => {
      const dataBytes = 100
      const png = makePngBufferWithAncillaryChunk(dataBytes)

      expect(png.byteLength).toBe(PNG_BASE_SIZE + ANCILLARY_CHUNK_OVERHEAD + dataBytes)

      // PNG signature must be the canonical 8-byte sequence.
      expect(png.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      )).toBe(true)

      let offset = 8
      let ihdrCount = 0, iendCount = 0, foundTEXT = false, foundIDAT = false
      let firstChunkType = '', lastChunkType = ''
      let textPayloadOffset = -1, textPayloadLength = -1
      const idatData: Buffer[] = []

      while (offset < png.length) {
        const chunkLength = png.readUInt32BE(offset)
        const typeOffset  = offset + 4
        const dataOffset  = offset + 8
        const crcOffset   = dataOffset + chunkLength

        // Every chunk boundary must lie within the buffer.
        expect(crcOffset + 4).toBeLessThanOrEqual(png.length)
        // Every chunk CRC must be valid.
        expect(pngCrc32(png.subarray(typeOffset, crcOffset))).toBe(png.readUInt32BE(crcOffset))

        const chunkType = png.toString('ascii', typeOffset, typeOffset + 4)
        if (!firstChunkType) firstChunkType = chunkType
        lastChunkType = chunkType

        if (chunkType === 'IHDR') {
          ihdrCount++
        } else if (chunkType === 'tEXt') {
          foundTEXT = true
          expect(chunkLength).toBe(dataBytes)
          textPayloadOffset = dataOffset
          textPayloadLength = chunkLength
        } else if (chunkType === 'IDAT') {
          foundIDAT = true
          idatData.push(png.subarray(dataOffset, crcOffset))
        } else if (chunkType === 'IEND') {
          iendCount++
          expect(chunkLength).toBe(0)   // IEND carries no data
        }
        offset = crcOffset + 4
      }

      // IHDR must be the first chunk and appear exactly once.
      expect(firstChunkType).toBe('IHDR')
      expect(ihdrCount).toBe(1)

      expect(foundIDAT).toBe(true)
      expect(foundTEXT).toBe(true)

      // IEND must appear exactly once, be the final chunk, and be followed by no trailing bytes.
      expect(iendCount).toBe(1)
      expect(lastChunkType).toBe('IEND')
      expect(offset).toBe(png.length)   // parser offset === buffer length: no trailing bytes

      // tEXt chunk data must contain a valid keyword (1–79 bytes, no NUL) + NUL separator + text.
      const textPayload = png.subarray(textPayloadOffset, textPayloadOffset + textPayloadLength)
      const nulIdx = textPayload.indexOf(0x00)
      expect(nulIdx).toBeGreaterThanOrEqual(1)   // keyword at least 1 byte before NUL
      expect(nulIdx).toBeLessThanOrEqual(79)     // keyword at most 79 bytes before NUL
      expect(textPayload[nulIdx]).toBe(0x00)     // NUL separator byte is 0x00

      // IDAT payload must inflate successfully — the ancillary chunk must not affect image data.
      const decompressed = zlib.inflateSync(Buffer.concat(idatData))
      expect(decompressed.length).toBe(5)   // 1×1 RGBA: 1 filter byte + 4 channel bytes
      expect(decompressed[0]).toBe(0x00)    // filter = None
      expect(decompressed[4]).toBe(0xFF)    // A = 255
    })
  })

  // ── Real composed deadline tests — fake timers (R17-PATCH) ───────────────────

  describe('Real composed deadline tests — fake timers (R17-PATCH)', () => {
    // Must match the private constants in visualsWorker.ts exactly.
    const PROVIDER_IMAGE_TIMEOUT_MS = 120_000
    const PROVIDER_TEXT_TIMEOUT_MS  =  60_000

    const ONE_VISUAL = JSON.stringify({
      visuals: [{ topic: 'T', description: 'D', visual_type: 'diagram', image_prompt: 'P' }],
    })

    beforeEach(() => {
      vi.clearAllMocks()
      process.env.OPENAI_API_KEY = 'sk-test-key'
      mockRpc.mockResolvedValue({ data: makeContext(), error: null })
      mockUpload.mockResolvedValue({ error: null })
    })

    afterEach(() => {
      vi.useRealTimers()
      delete process.env.OPENAI_API_KEY
    })

    it('provider image deadline: real composed providerSignal aborts when timeout fires; upload never occurs', async () => {
      vi.useFakeTimers()

      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: ONE_VISUAL } }] })

      // Image generation hangs and listens on the real providerSignal passed by the worker.
      let capturedProviderSignal: AbortSignal | undefined
      mockImagesGenerate.mockImplementation((_body: unknown, opts: { signal?: AbortSignal }) => {
        capturedProviderSignal = opts?.signal
        const p = new Promise<never>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(opts.signal!.reason), { once: true })
        })
        // Prevent transient unhandledRejection: the abort fires synchronously inside the fake-timer
        // callback before the worker's microtask-based catch handler runs. Adding .catch(()=>{})
        // marks the promise as handled immediately, so Node.js does not report it as unhandled.
        p.catch(() => {})
        return p
      })

      const signal = new AbortController().signal
      const workerPromise = stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      // workerPromise.catch(() => {}) prevents unhandledRejection in the window between when the
      // worker rejects (inside advanceTimersByTimeAsync) and when expect().rejects attaches a handler.
      workerPromise.catch(() => {})

      // Drain microtasks so the worker progresses through text completion and suspends at image generation.
      await vi.advanceTimersByTimeAsync(1)

      // Advance past the provider image deadline.
      await vi.advanceTimersByTimeAsync(PROVIDER_IMAGE_TIMEOUT_MS)

      // The real composed providerSignal must be aborted with the correct DOMException reason.
      expect(capturedProviderSignal?.aborted).toBe(true)
      expect(capturedProviderSignal?.reason?.name).toBe('TimeoutError')

      await expect(workerPromise).rejects.toMatchObject({ name: 'TimeoutError' })
      expect(mockUpload).not.toHaveBeenCalled()

      // All timer resources freed: no pending fake timers remain.
      expect(vi.getTimerCount()).toBe(0)
    })

    it('text completion deadline: real composed textSignal aborts when timeout fires; upload never occurs', async () => {
      vi.useFakeTimers()

      // Text completion hangs and listens on the real textSignal passed by the worker.
      let capturedTextSignal: AbortSignal | undefined
      mockChatCreate.mockImplementation((_body: unknown, opts: { signal?: AbortSignal }) => {
        capturedTextSignal = opts?.signal
        const p = new Promise<never>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(opts.signal!.reason), { once: true })
        })
        p.catch(() => {})
        return p
      })

      const signal = new AbortController().signal
      const workerPromise = stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      workerPromise.catch(() => {})

      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(PROVIDER_TEXT_TIMEOUT_MS)

      expect(capturedTextSignal?.aborted).toBe(true)
      expect(capturedTextSignal?.reason?.name).toBe('TimeoutError')

      await expect(workerPromise).rejects.toMatchObject({ name: 'TimeoutError' })
      expect(mockImagesGenerate).not.toHaveBeenCalled()
      expect(mockUpload).not.toHaveBeenCalled()

      expect(vi.getTimerCount()).toBe(0)
    })

    it('upload-time deadline: upload completes after deadline but post-upload check throws; publication prevented', async () => {
      vi.useFakeTimers()

      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: ONE_VISUAL } }] })

      // Capture real providerSignal; return a valid PNG immediately (image generation does not hang).
      let capturedProviderSignal: AbortSignal | undefined
      mockImagesGenerate.mockImplementation((_body: unknown, opts: { signal?: AbortSignal }) => {
        capturedProviderSignal = opts?.signal
        return Promise.resolve({ data: [{ b64_json: makePngBuffer(0).toString('base64') }] })
      })

      // Upload is pending: its resolution is controlled externally so the deadline can fire first.
      let resolveUpload!: () => void
      mockUpload.mockImplementation(() =>
        new Promise<{ error: null }>(r => { resolveUpload = () => r({ error: null }) }),
      )

      const signal = new AbortController().signal
      const workerPromise = stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      workerPromise.catch(() => {})

      // Drain microtasks: worker progresses through text, image, PNG validation, reaches upload await.
      await vi.advanceTimersByTimeAsync(1)

      // Advance past the provider image deadline while upload is still pending.
      await vi.advanceTimersByTimeAsync(PROVIDER_IMAGE_TIMEOUT_MS)

      // providerSignal is now aborted; upload was called but its promise is still pending.
      expect(capturedProviderSignal?.aborted).toBe(true)
      expect(capturedProviderSignal?.reason?.name).toBe('TimeoutError')
      expect(mockUpload).toHaveBeenCalledOnce()

      // Resolve the upload (simulates upload completing after the deadline expired).
      resolveUpload()

      // Let the worker process the post-upload providerSignal.throwIfAborted() check.
      await vi.advanceTimersByTimeAsync(0)

      // Worker must throw — the post-upload check fires and the route never receives status:'generated'.
      await expect(workerPromise).rejects.toMatchObject({ name: 'TimeoutError' })

      expect(vi.getTimerCount()).toBe(0)
    })

    it('caller abort: job signal abort propagates through composed providerSignal; upload never occurs', async () => {
      vi.useFakeTimers()

      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: ONE_VISUAL } }] })

      const controller = new AbortController()
      let capturedProviderSignal: AbortSignal | undefined
      mockImagesGenerate.mockImplementation((_body: unknown, opts: { signal?: AbortSignal }) => {
        capturedProviderSignal = opts?.signal
        const p = new Promise<never>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(opts.signal!.reason), { once: true })
        })
        p.catch(() => {})
        return p
      })

      const workerPromise = stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, controller.signal)
      workerPromise.catch(() => {})

      await vi.advanceTimersByTimeAsync(1)

      // Abort the caller signal before the provider deadline fires.
      controller.abort(new DOMException('Job cancelled', 'AbortError'))

      expect(capturedProviderSignal?.aborted).toBe(true)
      expect(capturedProviderSignal?.reason?.name).toBe('AbortError')

      await vi.advanceTimersByTimeAsync(0)

      await expect(workerPromise).rejects.toMatchObject({ name: 'AbortError' })
      expect(mockUpload).not.toHaveBeenCalled()

      // providerTimer cleaned up in finally even when caller aborted.
      expect(vi.getTimerCount()).toBe(0)
    })

    it('upload-time deadline: worker throws and completeAndPublishJob cannot receive status:generated result', async () => {
      vi.useFakeTimers()

      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: ONE_VISUAL } }] })
      mockImagesGenerate.mockImplementation(() =>
        Promise.resolve({ data: [{ b64_json: makePngBuffer(0).toString('base64') }] })
      )

      let resolveUpload!: () => void
      mockUpload.mockImplementation(() =>
        new Promise<{ error: null }>(r => { resolveUpload = () => r({ error: null }) }),
      )

      const signal = new AbortController().signal
      const workerPromise = stageVisualsForJob(JOB_ID, WORKER_ID, LEASE, VERSION, signal)
      workerPromise.catch(() => {})

      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(PROVIDER_IMAGE_TIMEOUT_MS)
      resolveUpload()
      await vi.advanceTimersByTimeAsync(0)

      // The route calls completeAndPublishJob only when stageVisualsForJob returns successfully.
      // Rejection here proves no status:'generated' items were returned, so publication cannot occur.
      await expect(workerPromise).rejects.toThrow()

      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
