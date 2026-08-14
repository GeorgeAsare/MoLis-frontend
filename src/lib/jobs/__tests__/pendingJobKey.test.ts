/**
 * Pending request key management tests.
 *
 * Tests the client-side idempotency key lifecycle in sessionStorage.
 * All tests are GROUP A (unit) — run in the Vitest node environment
 * with a mocked sessionStorage.
 *
 * GROUP B database tests for the corresponding server behaviour (same key
 * returns existing job, payload conflict) are in workerScenarios.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getPendingRequestKey,
  setPendingRequestKey,
  clearPendingRequestKey,
  getOrCreatePendingRequestKey,
} from '../pendingJobKey'

// ─────────────────────────────────────────────────────────────────────────────
// sessionStorage mock
// ─────────────────────────────────────────────────────────────────────────────

const mockStore = new Map<string, string>()
const mockSessionStorage = {
  getItem:    (key: string) => mockStore.get(key) ?? null,
  setItem:    (key: string, value: string) => { mockStore.set(key, value) },
  removeItem: (key: string) => { mockStore.delete(key) },
  clear:      () => { mockStore.clear() },
}

const TEST_USER  = 'user-aaa-111'
const TEST_DOC   = 'doc-bbb-222'
const TEST_TYPE  = 'visuals'

const OTHER_USER = 'user-ccc-333'
const OTHER_DOC  = 'doc-ddd-444'

beforeEach(() => {
  mockStore.clear()
  vi.stubGlobal('window', { sessionStorage: mockSessionStorage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────────────────────
// Basic get / set / clear
// ─────────────────────────────────────────────────────────────────────────────

describe('getPendingRequestKey', () => {
  it('returns null when no key has been stored', () => {
    expect(getPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)).toBeNull()
  })

  it('returns the stored UUID after setPendingRequestKey', () => {
    const key = '12345678-1234-1234-1234-123456789abc'
    setPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE, key)
    expect(getPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)).toBe(key)
  })
})

describe('clearPendingRequestKey', () => {
  it('removes the stored key', () => {
    setPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE, 'some-uuid')
    clearPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(getPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)).toBeNull()
  })

  it('is a no-op when no key exists', () => {
    expect(() => clearPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getOrCreatePendingRequestKey — core lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('getOrCreatePendingRequestKey — first call', () => {
  it('generates and stores a valid UUID on first call', () => {
    const key = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(getPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)).toBe(key)
  })
})

describe('getOrCreatePendingRequestKey — retry-safe idempotency', () => {
  it('returns the same UUID on every subsequent call (lost-response retry)', () => {
    // Scenario: server receives request, inserts job, but response is lost.
    // Client catches the network error. Key is still in sessionStorage.
    // On retry, the same UUID is sent → server returns the existing job.
    const first = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    const second = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    const third  = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('key is preserved after a simulated failed request (retry after error)', () => {
    // Simulate: request made, network throws before server responds.
    // The key is NOT cleared on error — it is preserved for retry.
    const key = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    // (simulated error — nothing clears the key)
    const retryKey = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(retryKey).toBe(key)
  })

  it('key is preserved after the original job completes (retry after completion)', () => {
    // Scenario: job completed but the component re-mounts (e.g., soft navigation).
    // The key is still in sessionStorage. If the user triggers the action again
    // without explicit regeneration, they get the same key back — server returns
    // the completed job. Intentional regeneration requires clearPendingRequestKey first.
    const key = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    // (job completes — key is NOT cleared automatically by the server)
    const nextKey = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(nextKey).toBe(key)
  })

  it('key persists across simulated component remounts (refresh-while-pending)', () => {
    // Scenario: user refreshes while request is pending.
    // sessionStorage persists across page refreshes (unlike component state).
    // On remount, getOrCreatePendingRequestKey retrieves the same UUID.
    const key = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    // sessionStorage is not cleared between test-remounts; simulated by calling again.
    const afterRefresh = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(afterRefresh).toBe(key)
  })

  it('two clicks for the same pending action return the same key (no duplicate submissions)', () => {
    // Scenario: user double-clicks the Generate button before the first request completes.
    // Both clicks call getOrCreatePendingRequestKey and get the same UUID.
    // Both requests carry the same key → server returns the same job for both.
    const click1 = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    const click2 = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(click1).toBe(click2)
  })
})

describe('getOrCreatePendingRequestKey — intentional regeneration', () => {
  it('generates a NEW UUID after clearPendingRequestKey (intentional regeneration)', () => {
    // Scenario: user clicks "Regenerate" after completion. The handler explicitly
    // clears the old key so a new job is created rather than the completed one returned.
    const original = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    clearPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    const regenerated = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(regenerated).not.toBe(original)
    expect(regenerated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('every intentional regeneration produces a distinct UUID', () => {
    const a = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    clearPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    const b = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    clearPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    const c = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scoping — keys do not collide across users / documents / job types
// ─────────────────────────────────────────────────────────────────────────────

describe('Storage key scoping', () => {
  it('different documents produce independent keys', () => {
    const k1 = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC,  TEST_TYPE)
    const k2 = getOrCreatePendingRequestKey(TEST_USER, OTHER_DOC, TEST_TYPE)
    expect(k1).not.toBe(k2)
  })

  it('clearing one document key does not affect another', () => {
    const k1 = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC,  TEST_TYPE)
    getOrCreatePendingRequestKey(TEST_USER, OTHER_DOC, TEST_TYPE)
    clearPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(getPendingRequestKey(TEST_USER, OTHER_DOC, TEST_TYPE)).not.toBeNull()
    expect(getPendingRequestKey(TEST_USER, TEST_DOC,  TEST_TYPE)).toBeNull()
    const k1New = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(k1New).not.toBe(k1)
  })

  it('different user IDs produce independent keys', () => {
    const k1 = getOrCreatePendingRequestKey(TEST_USER,  TEST_DOC, TEST_TYPE)
    const k2 = getOrCreatePendingRequestKey(OTHER_USER, TEST_DOC, TEST_TYPE)
    expect(k1).not.toBe(k2)
  })

  it('different job types produce independent keys', () => {
    const k1 = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, 'visuals')
    const k2 = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, 'flashcards')
    expect(k1).not.toBe(k2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Non-browser / SSR safety
// ─────────────────────────────────────────────────────────────────────────────

describe('Non-browser environment', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    // Simulate SSR: window is undefined.
    // vi.unstubAllGlobals restores window to undefined in node environment.
  })

  it('getPendingRequestKey returns null in non-browser environment (no crash)', () => {
    expect(getPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)).toBeNull()
  })

  it('setPendingRequestKey is a no-op in non-browser environment (no crash)', () => {
    expect(() => setPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE, 'uuid')).not.toThrow()
  })

  it('clearPendingRequestKey is a no-op in non-browser environment (no crash)', () => {
    expect(() => clearPendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)).not.toThrow()
  })

  it('getOrCreatePendingRequestKey returns a UUID in non-browser environment (fallback)', () => {
    // In SSR (no sessionStorage), a UUID is still generated and returned,
    // but it cannot be persisted — each call returns a new UUID.
    const key = getOrCreatePendingRequestKey(TEST_USER, TEST_DOC, TEST_TYPE)
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
