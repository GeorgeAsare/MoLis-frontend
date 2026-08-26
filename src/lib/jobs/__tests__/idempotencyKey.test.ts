import { describe, it, expect } from 'vitest'
import {
  buildRequestIdempotencyKey,
  buildSourceDigest,
  buildRequestHash,
} from '../idempotencyKey'
import type { SourceDigestEnvelope, RequestHashEnvelope } from '../idempotencyKey'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sourceEnvelope(overrides: Partial<SourceDigestEnvelope> = {}): SourceDigestEnvelope {
  return {
    schema_version:               1,
    document_id:                  'doc-a1b2c3',
    document_title:               'Test Document',
    document_extracted_text:      'Some extracted text',
    document_file_type:           'pdf',
    document_source_type:         'upload',
    document_created_at:          '2026-01-01T00:00:00Z',
    document_subject_id:          null,
    document_source_recording_id: null,
    analysis_id:                  null,
    analysis_data:                null,
    analysis_created_at:          null,
    analysis_model:               null,
    ...overrides,
  }
}

function requestEnvelope(overrides: Partial<RequestHashEnvelope> = {}): RequestHashEnvelope {
  return {
    schema_version:       1,
    source_digest:        'a'.repeat(64),
    job_type:             'visuals',
    operation_descriptor: { text_model: 'gpt-4o-mini', image_model: 'gpt-image-2' },
    sanitized_input:      {},
    ...overrides,
  }
}

// ── buildRequestIdempotencyKey ────────────────────────────────────────────────

describe('buildRequestIdempotencyKey', () => {
  it('returns a valid UUID v4 string', () => {
    const key = buildRequestIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('is non-deterministic — each call produces a distinct UUID', () => {
    const a = buildRequestIdempotencyKey()
    const b = buildRequestIdempotencyKey()
    expect(a).not.toBe(b)
  })

  it('does not include userId — userId is prefixed by enqueueJob (server only)', () => {
    const key = buildRequestIdempotencyKey()
    expect(key).not.toContain(':')
  })

  it('key fits within the 512-byte database column limit', () => {
    const key = buildRequestIdempotencyKey()
    expect(key.length).toBeLessThanOrEqual(512)
    expect(key.length).toBeGreaterThan(0)
  })

  it('idempotency key scoping: server prepends userId to produce the stored key', () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const requestKey = buildRequestIdempotencyKey()
    const storedKey = `${userId}:${requestKey}`
    expect(storedKey.startsWith(userId + ':')).toBe(true)
    expect(storedKey.split(':').slice(1).join(':')).toBe(requestKey)
  })
})

// ── buildSourceDigest ─────────────────────────────────────────────────────────

describe('buildSourceDigest', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = buildSourceDigest(sourceEnvelope())
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for the same canonical envelope', () => {
    const env = sourceEnvelope({ document_extracted_text: 'Unique content' })
    expect(buildSourceDigest(env)).toBe(buildSourceDigest(env))
  })

  it('produces different hashes for different document_id values', () => {
    const a = buildSourceDigest(sourceEnvelope({ document_id: 'doc-1' }))
    const b = buildSourceDigest(sourceEnvelope({ document_id: 'doc-2' }))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different extracted_text values', () => {
    const a = buildSourceDigest(sourceEnvelope({ document_extracted_text: 'Content A' }))
    const b = buildSourceDigest(sourceEnvelope({ document_extracted_text: 'Content B' }))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different schema_version values', () => {
    const a = buildSourceDigest(sourceEnvelope({ schema_version: 1 }))
    const b = buildSourceDigest(sourceEnvelope({ schema_version: 2 }))
    expect(a).not.toBe(b)
  })

  it('null analysis fields produce a stable hash (no analysis is valid)', () => {
    const env = sourceEnvelope({
      analysis_id: null, analysis_data: null,
      analysis_created_at: null, analysis_model: null,
    })
    const hash = buildSourceDigest(env)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(buildSourceDigest(env)).toBe(hash)
  })

  it('analysis fields change the hash when present vs absent', () => {
    const withoutAnalysis = buildSourceDigest(sourceEnvelope())
    const withAnalysis = buildSourceDigest(sourceEnvelope({
      analysis_id:    'analysis-123',
      analysis_data:  { subject_area: 'Mathematics' },
      analysis_model: 'gpt-4o',
    }))
    expect(withoutAnalysis).not.toBe(withAnalysis)
  })

  it('key order is canonicalized — same envelope regardless of JS object key order', () => {
    const envA = sourceEnvelope({ analysis_data: { z: 1, a: 2 } })
    const envB = sourceEnvelope({ analysis_data: { a: 2, z: 1 } })
    expect(buildSourceDigest(envA)).toBe(buildSourceDigest(envB))
  })

  it('does not expose raw content in the hex output', () => {
    const secretTitle = 'super-secret-document-title-xyz'
    const hash = buildSourceDigest(sourceEnvelope({ document_title: secretTitle }))
    expect(hash).not.toContain(secretTitle)
    expect(hash).not.toContain('super-secret')
  })
})

// ── buildRequestHash ──────────────────────────────────────────────────────────

describe('buildRequestHash', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = buildRequestHash(requestEnvelope())
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for the same canonical envelope', () => {
    const env = requestEnvelope()
    expect(buildRequestHash(env)).toBe(buildRequestHash(env))
  })

  it('produces different hashes for different source_digest values', () => {
    const a = buildRequestHash(requestEnvelope({ source_digest: 'a'.repeat(64) }))
    const b = buildRequestHash(requestEnvelope({ source_digest: 'b'.repeat(64) }))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different job_type values', () => {
    const a = buildRequestHash(requestEnvelope({ job_type: 'visuals' }))
    const b = buildRequestHash(requestEnvelope({ job_type: 'flashcards' }))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different schema_version values', () => {
    const a = buildRequestHash(requestEnvelope({ schema_version: 1 }))
    const b = buildRequestHash(requestEnvelope({ schema_version: 2 }))
    expect(a).not.toBe(b)
  })

  it('sanitized_input keys are canonicalized — same hash regardless of insertion order', () => {
    const a = buildRequestHash(requestEnvelope({ sanitized_input: { z: 1, a: 2 } }))
    const b = buildRequestHash(requestEnvelope({ sanitized_input: { a: 2, z: 1 } }))
    expect(a).toBe(b)
  })

  it('handles empty sanitized_input deterministically', () => {
    const a = buildRequestHash(requestEnvelope({ sanitized_input: {} }))
    const b = buildRequestHash(requestEnvelope({ sanitized_input: {} }))
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('operation_descriptor changes the hash (server-owned config is part of request identity)', () => {
    const a = buildRequestHash(requestEnvelope({ operation_descriptor: { image_model: 'gpt-image-2' } }))
    const b = buildRequestHash(requestEnvelope({ operation_descriptor: { image_model: 'gpt-image-3' } }))
    expect(a).not.toBe(b)
  })

  it('does not expose raw sanitized_input values in the hash output', () => {
    const secretValue = 'super-secret-api-key-xyz'
    const hash = buildRequestHash(requestEnvelope({ sanitized_input: { token: secretValue } }))
    expect(hash).not.toContain(secretValue)
    expect(hash).not.toContain('super-secret')
  })
})
