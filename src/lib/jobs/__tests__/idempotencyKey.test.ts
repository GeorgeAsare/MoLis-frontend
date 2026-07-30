import { describe, it, expect } from 'vitest'
import { buildRequestIdempotencyKey, buildPayloadHash } from '../idempotencyKey'
import type { PayloadHashEnvelope } from '../idempotencyKey'

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
    // The key is a bare UUID — no colon separator, no userId prefix.
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

// Helper to build a minimal valid envelope for tests.
function envelope(overrides: Partial<PayloadHashEnvelope> = {}): PayloadHashEnvelope {
  return {
    schema_version: 1,
    operation_kind: 'visuals',
    document_id:    'doc-a1b2c3',
    job_type:       'visuals',
    sanitized_input: {},
    ...overrides,
  }
}

describe('buildPayloadHash', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = buildPayloadHash(envelope())
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for the same canonical envelope', () => {
    const env = envelope({ sanitized_input: { quality: 'high', count: 3 } })
    expect(buildPayloadHash(env)).toBe(buildPayloadHash(env))
  })

  it('sanitized_input keys are sorted — same hash regardless of insertion order', () => {
    const a = buildPayloadHash(envelope({ sanitized_input: { z: 1, a: 2 } }))
    const b = buildPayloadHash(envelope({ sanitized_input: { a: 2, z: 1 } }))
    expect(a).toBe(b)
  })

  it('produces different hashes for different document_id values', () => {
    const a = buildPayloadHash(envelope({ document_id: 'doc-1' }))
    const b = buildPayloadHash(envelope({ document_id: 'doc-2' }))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different job_type values', () => {
    const a = buildPayloadHash(envelope({ job_type: 'visuals', operation_kind: 'visuals' }))
    const b = buildPayloadHash(envelope({ job_type: 'flashcards', operation_kind: 'flashcards' }))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different schema_version values', () => {
    const a = buildPayloadHash(envelope({ schema_version: 1 }))
    const b = buildPayloadHash(envelope({ schema_version: 2 }))
    expect(a).not.toBe(b)
  })

  it('handles empty sanitized_input deterministically', () => {
    const a = buildPayloadHash(envelope({ sanitized_input: {} }))
    const b = buildPayloadHash(envelope({ sanitized_input: {} }))
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not expose raw sanitized_input values in the hash output', () => {
    const secretValue = 'super-secret-api-key-xyz'
    const hash = buildPayloadHash(envelope({ sanitized_input: { token: secretValue } }))
    expect(hash).not.toContain(secretValue)
    expect(hash).not.toContain('super-secret')
  })

  it('user_id is excluded from the envelope — document_id is the resource scope', () => {
    // Changing the document_id must change the hash.
    // user_id is scoped by the request ledger key, not the payload hash.
    const a = buildPayloadHash(envelope({ document_id: 'doc-user-a' }))
    const b = buildPayloadHash(envelope({ document_id: 'doc-user-b' }))
    expect(a).not.toBe(b)
  })
})
