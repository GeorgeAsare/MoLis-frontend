import { describe, it, expect } from 'vitest'
import {
  classifyError,
  generateSupportReference,
  publicMessageKeyForCode,
  fallbackMessageForCode,
} from '../errorClassifier'
import type { PublicErrorCode } from '../errorClassifier'

const ALL_CODES: PublicErrorCode[] = [
  'JOB_PROVIDER_UNAVAILABLE',
  'JOB_PROVIDER_RATE_LIMITED',
  'JOB_INPUT_TOO_LARGE',
  'JOB_OUTPUT_UNAVAILABLE',
  'JOB_TIMEOUT',
  'JOB_CANCELLED',
  'JOB_FAILED_TRANSIENT',
  'JOB_FAILED_PERMANENT',
  'JOB_INTERNAL_ERROR',
]

describe('classifyError', () => {
  it('classifies timeout errors', () => {
    expect(classifyError(new Error('Request timed out'))).toBe('JOB_TIMEOUT')
    expect(classifyError(new Error('deadline exceeded'))).toBe('JOB_TIMEOUT')
  })

  it('classifies rate limit errors', () => {
    expect(classifyError(new Error('rate limit exceeded'))).toBe('JOB_PROVIDER_RATE_LIMITED')
    expect(classifyError(new Error('Too many requests'))).toBe('JOB_PROVIDER_RATE_LIMITED')
    expect(classifyError(new Error('429 error'))).toBe('JOB_PROVIDER_RATE_LIMITED')
  })

  it('classifies provider unavailable errors', () => {
    expect(classifyError(new Error('service unavailable'))).toBe('JOB_PROVIDER_UNAVAILABLE')
    expect(classifyError(new Error('503 Bad Gateway'))).toBe('JOB_PROVIDER_UNAVAILABLE')
    expect(classifyError(new Error('ECONNREFUSED'))).toBe('JOB_PROVIDER_UNAVAILABLE')
    expect(classifyError(new Error('network error'))).toBe('JOB_PROVIDER_UNAVAILABLE')
  })

  it('classifies input too large errors', () => {
    expect(classifyError(new Error('context length exceeded'))).toBe('JOB_INPUT_TOO_LARGE')
    expect(classifyError(new Error('token limit reached'))).toBe('JOB_INPUT_TOO_LARGE')
    expect(classifyError(new Error('content too large'))).toBe('JOB_INPUT_TOO_LARGE')
  })

  it('classifies cancellation errors', () => {
    expect(classifyError(new Error('request was cancelled'))).toBe('JOB_CANCELLED')
    expect(classifyError(new Error('Job canceled by user'))).toBe('JOB_CANCELLED')
  })

  it('falls back to JOB_INTERNAL_ERROR for unknown errors', () => {
    expect(classifyError(new Error('some totally unknown error'))).toBe('JOB_INTERNAL_ERROR')
    expect(classifyError(new Error(''))).toBe('JOB_INTERNAL_ERROR')
  })

  it('returns JOB_INTERNAL_ERROR for non-Error values', () => {
    expect(classifyError('string error')).toBe('JOB_INTERNAL_ERROR')
    expect(classifyError(42)).toBe('JOB_INTERNAL_ERROR')
    expect(classifyError(null)).toBe('JOB_INTERNAL_ERROR')
    expect(classifyError(undefined)).toBe('JOB_INTERNAL_ERROR')
    expect(classifyError({ message: 'timeout' })).toBe('JOB_INTERNAL_ERROR')
  })

  it('never returns a code that leaks raw error text', () => {
    // classifyError returns an opaque code, never the original message
    const rawMsg = 'postgres://user:secret@host/db FATAL: connection refused'
    const code = classifyError(new Error(rawMsg))
    expect(typeof code).toBe('string')
    expect(code).not.toContain(rawMsg)
    expect(code).not.toContain('postgres')
    expect(code).not.toContain('secret')
  })
})

describe('generateSupportReference', () => {
  it('returns a string matching SR-<dayBucket>-<rand8hex> format', () => {
    const ref = generateSupportReference()
    expect(ref).toMatch(/^SR-[A-Z0-9]+-[A-F0-9]{8}$/)
  })

  it('generates different values on each call (randomness)', () => {
    const refs = new Set(Array.from({ length: 20 }, () => generateSupportReference()))
    expect(refs.size).toBeGreaterThan(1)
  })

  it('does not contain user-identifiable data or database IDs', () => {
    const ref = generateSupportReference()
    // Format enforced above; additionally assert it doesn't look like a UUID
    expect(ref).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  })
})

describe('publicMessageKeyForCode', () => {
  it('returns a non-empty i18n key string for every code', () => {
    for (const code of ALL_CODES) {
      const key = publicMessageKeyForCode(code)
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
      expect(key).toMatch(/^errors\.job\./)
    }
  })

  it('returns distinct keys for distinct codes', () => {
    const keys = ALL_CODES.map(publicMessageKeyForCode)
    const unique = new Set(keys)
    expect(unique.size).toBe(ALL_CODES.length)
  })
})

describe('fallbackMessageForCode', () => {
  it('returns a non-empty English message for every code', () => {
    for (const code of ALL_CODES) {
      const msg = fallbackMessageForCode(code)
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
    }
  })

  it('does not include raw error text or provider names', () => {
    for (const code of ALL_CODES) {
      const msg = fallbackMessageForCode(code)
      expect(msg.toLowerCase()).not.toContain('postgres')
      expect(msg.toLowerCase()).not.toContain('anthropic')
      expect(msg.toLowerCase()).not.toContain('openai')
      expect(msg.toLowerCase()).not.toContain('supabase')
      expect(msg.toLowerCase()).not.toContain('uuid')
    }
  })
})
