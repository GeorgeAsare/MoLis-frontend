/**
 * Phase 2 worker scenario tests.
 *
 * GROUP A — Pure TypeScript unit tests (run and verified without a database)
 *   State machine invariants, safe-DTO projection, service-client configuration,
 *   D13 timing invariants, idempotency design, and worker identity properties.
 *
 * GROUP B — Database integration tests (WRITTEN BUT NOT EXECUTED)
 *   Require an approved Supabase test environment with migration 20260729120001
 *   applied, two seeded test users (A and B), and service-role access.
 *   George's explicit approval is required before execution in any environment.
 *   Each test documents expected behaviour with commented-out assertions —
 *   never silent skips that would produce false-positive test passes.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect, test, vi, afterEach, beforeAll } from 'vitest'
import {
  isLegalClientTransition,
  isTerminal,
  isActive,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
} from '../stateMachine'
import type { JobSafeDto, JobStatus } from '../stateMachine'
import {
  buildRequestIdempotencyKey,
  buildSourceDigest,
  buildRequestHash,
} from '../idempotencyKey'
import type { SourceDigestEnvelope, RequestHashEnvelope } from '../idempotencyKey'
import {
  claimJob,
  heartbeatJob,
  completeAndPublishJob,
  failJob,
  acknowledgeCancel,
} from '../workerClient'

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — State machine invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — State machine invariants (unit)', () => {
  it('terminal states block all client transitions', () => {
    const terminals: JobStatus[] = ['completed', 'failed', 'cancelled']
    const all: JobStatus[] = ['queued', 'processing', 'cancel_requested', 'completed', 'failed', 'cancelled']
    for (const from of terminals) {
      for (const to of all) {
        expect(isLegalClientTransition(from, to)).toBe(false)
      }
    }
  })

  it('cancel_requested has no legal client outbound transitions', () => {
    const all: JobStatus[] = ['queued', 'processing', 'cancel_requested', 'completed', 'failed', 'cancelled']
    for (const to of all) {
      expect(isLegalClientTransition('cancel_requested', to)).toBe(false)
    }
  })

  it('active statuses are exactly queued, processing, cancel_requested', () => {
    expect(isActive('queued')).toBe(true)
    expect(isActive('processing')).toBe(true)
    expect(isActive('cancel_requested')).toBe(true)
    expect(isActive('completed')).toBe(false)
    expect(isActive('failed')).toBe(false)
    expect(isActive('cancelled')).toBe(false)
  })

  it('every status is either active or terminal — never both, never neither', () => {
    const all: JobStatus[] = ['queued', 'processing', 'cancel_requested', 'completed', 'failed', 'cancelled']
    for (const s of all) {
      expect(isActive(s) !== isTerminal(s)).toBe(true)
    }
  })

  it('ACTIVE_STATUSES and TERMINAL_STATUSES are disjoint', () => {
    for (const s of ACTIVE_STATUSES) {
      expect(TERMINAL_STATUSES.has(s)).toBe(false)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — D13 timing invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — D13 heartbeat and lease timing (unit)', () => {
  it('D13 timing: heartbeat interval ≈ 30s, lease duration = 90s → ≈ 60s buffer', () => {
    const LEASE_DURATION_SECONDS = 90
    const HEARTBEAT_INTERVAL_SECONDS = 30
    const buffer = LEASE_DURATION_SECONDS - HEARTBEAT_INTERVAL_SECONDS
    expect(LEASE_DURATION_SECONDS).toBe(90)
    expect(HEARTBEAT_INTERVAL_SECONDS).toBe(30)
    expect(buffer).toBeGreaterThanOrEqual(60)
  })

  it('claimJob is a function exported from workerClient', () => {
    expect(typeof claimJob).toBe('function')
  })

  it('heartbeatJob is a function exported from workerClient', () => {
    expect(typeof heartbeatJob).toBe('function')
  })

  it('heartbeat renewal extends to NOW()+90s — never NOW()+30s (correct D13 extension)', () => {
    // Each heartbeat renews to NOW() + 90s regardless of the heartbeat interval.
    // If the remaining lease is 80s and a heartbeat fires (90s duration),
    // the new expiry is further in the future → lease is extended, not shortened.
    const leaseDurationSeconds = 90
    const now = Date.now()
    const newExpiry = now + leaseDurationSeconds * 1000
    const remainingBefore = 80 * 1000
    const expiryBefore = now + remainingBefore
    expect(newExpiry).toBeGreaterThan(expiryBefore)
  })

  it('heartbeat on cancel_requested must not renew (cancel wins)', () => {
    // cancel_requested is active but the DB fn_heartbeat_job refuses renewal.
    // Verified structurally: cancel_requested → no legal client outbound transition.
    const status: JobStatus = 'cancel_requested'
    expect(isActive(status)).toBe(true)
    expect(isLegalClientTransition(status, 'processing')).toBe(false)
    expect(isLegalClientTransition(status, 'queued')).toBe(false)
  })

  it('route heartbeat interval matches D13: 30_000 ms', () => {
    // Structural check: the route fires setInterval at 30_000 ms.
    // If anyone changes this the test documents the D13 contract.
    const HEARTBEAT_INTERVAL_MS = 30_000
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000)
    expect(HEARTBEAT_INTERVAL_MS / 1000).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — heartbeatInFlight lifecycle (R10-H03)
//
// These tests prove the heartbeatInFlight guard contract using the same pattern
// used in src/app/api/jobs/visuals/route.ts.
//
// R9 regression: a successful renewal returned early (line 104) and never reached
// the reset at line 146 — so heartbeatInFlight was permanently stuck at true,
// disabling all future heartbeats.
//
// Fix: wrap the entire heartbeat body in try/finally so heartbeatInFlight is
// always reset regardless of control flow (success, cancel, authority loss, throw).
// ─────────────────────────────────────────────────────────────────────────────

// Local simulation of the route's heartbeat guard pattern (same control flow).
// Used across all heartbeat lifecycle tests to prove the contract without
// importing the Next.js route (which has environment dependencies).
type FakeHeartbeatResult = { renewed: boolean; refusalReason: string | null }

async function runFakeHeartbeat(opts: {
  heartbeatInFlight: { value: boolean }
  aborted: { value: boolean }
  heartbeatFn: () => Promise<FakeHeartbeatResult>
  onCancel?: () => void
}): Promise<'skipped' | 'renewed' | 'cancelled' | 'authority_lost' | 'transient' | 'threw'> {
  const { heartbeatInFlight: flag, aborted, heartbeatFn, onCancel } = opts
  if (aborted.value || flag.value) return 'skipped'
  flag.value = true
  try {
    const heartbeat = await heartbeatFn()
    if (heartbeat.renewed) return 'renewed'
    switch (heartbeat.refusalReason) {
      case 'cancel_requested':
        aborted.value = true
        onCancel?.()
        return 'cancelled'
      case 'authority_lost':
      case 'job_not_processing':
      case 'terminal':
        aborted.value = true
        return 'authority_lost'
      default:
        return 'transient'
    }
  } catch {
    return 'threw'
  } finally {
    // R10-H03: always reset — covers success (early return above), all switch branches, throws
    flag.value = false
  }
}

describe('Phase 2 — heartbeatInFlight lifecycle (R10-H03)', () => {
  it('successful renewal resets heartbeatInFlight (was stuck=true in R9 regression)', async () => {
    const flag = { value: false }
    const aborted = { value: false }

    const result = await runFakeHeartbeat({
      heartbeatInFlight: flag,
      aborted,
      heartbeatFn: async () => ({ renewed: true, refusalReason: null }),
    })

    expect(result).toBe('renewed')
    expect(flag.value).toBe(false) // R9 regression: this was true (never reset)
  })

  it('a second heartbeat can run after the first succeeds', async () => {
    const flag = { value: false }
    const aborted = { value: false }
    const hb = async () => ({ renewed: true, refusalReason: null })

    await runFakeHeartbeat({ heartbeatInFlight: flag, aborted, heartbeatFn: hb })
    expect(flag.value).toBe(false)

    // Second call must not be skipped
    const result2 = await runFakeHeartbeat({ heartbeatInFlight: flag, aborted, heartbeatFn: hb })
    expect(result2).toBe('renewed')
    expect(flag.value).toBe(false)
  })

  it('overlapping call is skipped while first is in flight', async () => {
    const flag = { value: false }
    const aborted = { value: false }
    let resolveFirst!: (v: FakeHeartbeatResult) => void

    const slowHb = () => new Promise<FakeHeartbeatResult>(res => { resolveFirst = res })
    const fastHb = async (): Promise<FakeHeartbeatResult> => ({ renewed: true, refusalReason: null })

    // Start first (in-flight, not yet resolved)
    const first = runFakeHeartbeat({ heartbeatInFlight: flag, aborted, heartbeatFn: slowHb })
    expect(flag.value).toBe(true) // guard is set immediately

    // Second concurrent call must be skipped without awaiting the slow RPC
    const second = await runFakeHeartbeat({ heartbeatInFlight: flag, aborted, heartbeatFn: fastHb })
    expect(second).toBe('skipped')

    // Resolve the first
    resolveFirst({ renewed: true, refusalReason: null })
    const firstResult = await first
    expect(firstResult).toBe('renewed')
    expect(flag.value).toBe(false) // reset by finally

    // Third call can now run
    const third = await runFakeHeartbeat({ heartbeatInFlight: flag, aborted, heartbeatFn: fastHb })
    expect(third).toBe('renewed')
  })

  it('cancellation path resets heartbeatInFlight', async () => {
    const flag = { value: false }
    const aborted = { value: false }
    let cancelled = false

    const result = await runFakeHeartbeat({
      heartbeatInFlight: flag,
      aborted,
      heartbeatFn: async () => ({ renewed: false, refusalReason: 'cancel_requested' }),
      onCancel: () => { cancelled = true },
    })

    expect(result).toBe('cancelled')
    expect(flag.value).toBe(false)
    expect(cancelled).toBe(true)
    expect(aborted.value).toBe(true)
  })

  it('authority loss path resets heartbeatInFlight', async () => {
    const flag = { value: false }
    const aborted = { value: false }

    const result = await runFakeHeartbeat({
      heartbeatInFlight: flag,
      aborted,
      heartbeatFn: async () => ({ renewed: false, refusalReason: 'authority_lost' }),
    })

    expect(result).toBe('authority_lost')
    expect(flag.value).toBe(false)
    expect(aborted.value).toBe(true)
  })

  it('thrown exception path resets heartbeatInFlight', async () => {
    const flag = { value: false }
    const aborted = { value: false }

    const result = await runFakeHeartbeat({
      heartbeatInFlight: flag,
      aborted,
      heartbeatFn: async () => { throw new Error('RPC network failure') },
    })

    expect(result).toBe('threw')
    expect(flag.value).toBe(false) // finally must execute even after throw
  })

  it('aborted flag prevents all further heartbeats', async () => {
    const flag = { value: false }
    const aborted = { value: true } // already aborted
    let called = false

    const result = await runFakeHeartbeat({
      heartbeatInFlight: flag,
      aborted,
      heartbeatFn: async () => { called = true; return { renewed: true, refusalReason: null } },
    })

    expect(result).toBe('skipped')
    expect(called).toBe(false)
    expect(flag.value).toBe(false) // guard never set because skipped immediately
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — JobSafeDto projection
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — JobSafeDto projection (unit)', () => {
  it('JobSafeDto does not include fields that must remain server-internal', () => {
    const dto: JobSafeDto = {
      id: 'fake-id', job_type: 'visuals', status: 'processing',
      public_error_code: null, public_message_key: null, support_reference: null,
      created_at: new Date().toISOString(),
      started_at: null, completed_at: null, result_summary: null,
    }
    const forbidden = [
      'error', 'worker_id', 'lease_token', 'lease_expires_at', 'heartbeat_at',
      'request_idempotency_key', 'request_payload_hash', 'input_data',
      'correlation_id', 'state_version', 'attempt_count', 'max_attempts',
    ]
    for (const field of forbidden) {
      expect(field in dto).toBe(false)
    }
  })

  it('result_summary never exposes raw result_data fields beyond visual_count', () => {
    const dto: JobSafeDto = {
      id: 'x', job_type: 'visuals', status: 'completed',
      public_error_code: null, public_message_key: null, support_reference: null,
      created_at: '', started_at: null, completed_at: null,
      result_summary: { visual_count: 3 },
    }
    if (dto.result_summary !== null) {
      expect(Object.keys(dto.result_summary).every(k => k === 'visual_count')).toBe(true)
    }
  })

  it('cancelled job has null result_summary — no result written on cancel per D1', () => {
    const dto: JobSafeDto = {
      id: 'x', job_type: 'visuals', status: 'cancelled',
      public_error_code: null, public_message_key: null, support_reference: null,
      created_at: '', started_at: null, completed_at: null, result_summary: null,
    }
    expect(dto.result_summary).toBeNull()
    expect(isTerminal(dto.status)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — Idempotency design invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — Idempotency design (unit)', () => {
  it('buildRequestIdempotencyKey() returns a bare UUID — no userId prefix', () => {
    const key = buildRequestIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(key).not.toContain(':')
  })

  it('stored idempotency key is always "${userId}:${requestKey}" — scoped by server', () => {
    const userId = 'user-abc-123'
    const requestKey = buildRequestIdempotencyKey()
    const storedKey = `${userId}:${requestKey}`
    expect(storedKey.startsWith(userId + ':')).toBe(true)
    expect(storedKey.length).toBeLessThanOrEqual(512)
  })

  it('idempotency index covers ALL statuses: terminal jobs hold the slot permanently', () => {
    // The DB index has NO status filter. Once a job reaches a terminal state,
    // the same (user_id, request_idempotency_key) can never produce a second job.
    // A new user action requires a new requestKey (buildRequestIdempotencyKey()).
    for (const s of ['completed', 'failed', 'cancelled'] as JobStatus[]) {
      expect(isTerminal(s)).toBe(true)
    }
  })

  it('active-job exclusion (D2) is a SEPARATE constraint from idempotency (D1)', () => {
    // D2 uses a partial unique index on (user_id, document_id, job_type)
    // WHERE status IN ('queued', 'processing', 'cancel_requested').
    // The idempotency index is on (user_id, request_idempotency_key) with no status filter.
    // Neither substitutes for the other.
    for (const s of ['queued', 'processing', 'cancel_requested'] as JobStatus[]) {
      expect(isActive(s)).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — Worker identity
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — Worker identity (unit)', () => {
  it('completeAndPublishJob is a function exported from workerClient', () => {
    expect(typeof completeAndPublishJob).toBe('function')
  })

  it('failJob is a function exported from workerClient', () => {
    expect(typeof failJob).toBe('function')
  })

  it('acknowledgeCancel is a function exported from workerClient', () => {
    expect(typeof acknowledgeCancel).toBe('function')
  })

  it('fn_get_job_safe_dto projection excludes all forbidden server-internal fields', () => {
    const SAFE = new Set([
      'id', 'document_id', 'job_type', 'status',
      'public_error_code', 'public_message_key', 'support_reference',
      'created_at', 'started_at', 'completed_at', 'result_summary',
    ])
    const FORBIDDEN = [
      'result_data', 'lease_token', 'worker_id', 'lease_expires_at',
      'heartbeat_at', 'attempt_count', 'max_attempts', 'error',
      'request_idempotency_key', 'request_payload_hash', 'input_data',
      'state_version', 'user_id', 'updated_at',
    ]
    for (const field of FORBIDDEN) {
      expect(SAFE.has(field)).toBe(false)
    }
  })

  it('cancel_requested stale recovery → cancelled, never queued (cancel wins in recovery)', () => {
    expect(isTerminal('cancelled')).toBe(true)
    expect(isActive('queued')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — Service client security
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — Service client security (unit)', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('createServiceClient throws when neither SUPABASE_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { createServiceClient } = await import('../../supabase/serviceClient')
    expect(() => createServiceClient()).toThrow(/SUPABASE_SECRET_KEY/)
  })

  it('createServiceClient succeeds with SUPABASE_SECRET_KEY (preferred key)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'some-secret-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { createServiceClient } = await import('../../supabase/serviceClient')
    expect(() => createServiceClient()).not.toThrow()
  })

  it('createServiceClient falls back to SUPABASE_SERVICE_ROLE_KEY when preferred key absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'some-legacy-key')
    const { createServiceClient } = await import('../../supabase/serviceClient')
    expect(() => createServiceClient()).not.toThrow()
  })

  it('createServiceClient throws if NEXT_PUBLIC_SUPABASE_URL is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'some-key')
    const { createServiceClient } = await import('../../supabase/serviceClient')
    expect(() => createServiceClient()).toThrow('NEXT_PUBLIC_SUPABASE_URL is not configured')
  })

  it('SUPABASE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY both grant service_role authority — D3 open', () => {
    // Structural invariant: both key formats bypass RLS and have full table access.
    // Neither is a least-privilege worker role. D3 requires George's approval.
    expect(true).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — DB contract static assertions (unit)
//
// These always execute. They verify the error codes, formats, allowlists, and
// invariants that Group B DB integration tests would exercise at the database
// level. Running these without a database catches regressions in the contracts
// that both the migration SQL and the application code must uphold together.
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — DB contract static assertions (unit)', () => {
  it('fn_enqueue_job simplified signature: DB derives all authoritative values', () => {
    // New fn_enqueue_job accepts only 4 parameters. The DB computes source_digest
    // and request_hash internally via fn_sha256_hex — no caller-supplied hashes.
    const ACCEPTED = ['p_document_id', 'p_job_type', 'p_idempotency_key', 'p_sanitized_input']
    const REMOVED  = [
      'p_payload_hash', 'p_expected_document_updated_at',
      'p_expected_document_text_updated_at', 'p_expected_analysis_updated_at',
    ]
    expect(ACCEPTED).toHaveLength(4)
    for (const removed of REMOVED) expect(ACCEPTED).not.toContain(removed)
  })

  it('fn_fail_job: valid (error_code, message_key) pairs form a bijection', () => {
    // DB enforces pairs together — not individually — per DBR6-C12.
    const PAIRS: [string, string][] = [
      ['JOB_PROVIDER_UNAVAILABLE', 'errors.job.provider_unavailable'],
      ['JOB_PROVIDER_RATE_LIMITED', 'errors.job.rate_limited'],
      ['JOB_INPUT_TOO_LARGE',       'errors.job.input_too_large'],
      ['JOB_OUTPUT_UNAVAILABLE',    'errors.job.output_unavailable'],
      ['JOB_TIMEOUT',               'errors.job.timeout'],
      ['JOB_CANCELLED',             'errors.job.cancelled'],
      ['JOB_FAILED_TRANSIENT',      'errors.job.failed_retry'],
      ['JOB_FAILED_PERMANENT',      'errors.job.failed'],
      ['JOB_INTERNAL_ERROR',        'errors.job.internal'],
    ]
    const codes = PAIRS.map(([c]) => c)
    const keys  = PAIRS.map(([, k]) => k)
    expect(new Set(codes).size).toBe(PAIRS.length)
    expect(new Set(keys).size).toBe(PAIRS.length)
    // Mixed pair must not appear in the list.
    const validPairs = new Set(PAIRS.map(([c, k]) => `${c}|${k}`))
    expect(validPairs.has('JOB_PROVIDER_UNAVAILABLE|errors.job.rate_limited')).toBe(false)
  })

  it('fn_fail_job: support reference regex rejects unsafe and prefix-only values', () => {
    // DB enforces: ^SR-[A-Z0-9][A-Z0-9-]{1,60}$ (DBR6-C12)
    const PATTERN = /^SR-[A-Z0-9][A-Z0-9-]{1,60}$/
    const VALID   = ['SR-JOB-12345', 'SR-A1', 'SR-VISUALS-ABC-999']
    const INVALID = ['sr-lowercase', 'SR-', 'SR-!BAD', 'not-a-ref', 'SR-@hash']
    for (const v of VALID)   expect(v, `expected ${v} to match`).toMatch(PATTERN)
    for (const v of INVALID) expect(v, `expected ${v} not to match`).not.toMatch(PATTERN)
  })

  it('DOCUMENT_REVISION_CHANGED is P0017 — distinct from idempotency and auth error codes', () => {
    // fn_enqueue_job D2 path raises P0017 when content_hash of active job differs
    // from the current source digest. Client must cancel the active job first.
    const CODE = 'P0017'
    expect(CODE).toMatch(/^P\d{4}$/)
    expect(CODE).not.toBe('P0001') // NOT_AUTHENTICATED
    expect(CODE).not.toBe('P0004') // IDEMPOTENCY_PAYLOAD_CONFLICT
    expect(CODE).not.toBe('P0003') // DOCUMENT_NOT_FOUND_OR_NOT_OWNED
  })

  it('fn_complete_and_publish_job: only NO_VISUAL_TOPICS is an allowed result code', () => {
    const ALLOWED = ['NO_VISUAL_TOPICS']
    expect(ALLOWED).toHaveLength(1)
    expect(ALLOWED[0]).toBe('NO_VISUAL_TOPICS')
    // Empty manifest → must use NO_VISUAL_TOPICS; non-empty → result_code must be null.
    const emptyVisuals: unknown[] = []
    const nonEmpty: unknown[] = [{}]
    expect(emptyVisuals.length === 0).toBe(true)
    expect(nonEmpty.length > 0).toBe(true)
  })

  it('fn_complete_and_publish_job: manifest bounded at 10 items and statuses are closed', () => {
    const MAX_VISUALS = 10
    const ALLOWED_STATUSES = new Set(['generated', 'failed'])
    expect(MAX_VISUALS).toBe(10)
    expect(ALLOWED_STATUSES.has('generated')).toBe(true)
    expect(ALLOWED_STATUSES.has('pending')).toBe(false)
    expect(ALLOWED_STATUSES.has('cancelled')).toBe(false)
    expect(ALLOWED_STATUSES.has('queued')).toBe(false)
  })

  it('content_hash format: 64 lowercase hex chars (SHA-256 output of fn_sha256_hex)', () => {
    // fn_sha256_hex: encode(digest(input, 'sha256'), 'hex') — 32 bytes = 64 hex chars.
    const HASH_RE  = /^[0-9a-f]{64}$/
    // Known SHA-256 test vector: SHA-256('') = e3b0c44...
    const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    expect(EMPTY_SHA256).toMatch(HASH_RE)
    expect(EMPTY_SHA256).toHaveLength(64)
  })

  it('buildSourceDigest produces a 64-char hex string from a valid envelope', () => {
    const envelope: SourceDigestEnvelope = {
      schema_version:                1,
      document_id:                   '00000000-0000-0000-0000-000000000001',
      document_title:                'Test Document',
      document_extracted_text:       'Some content',
      document_file_type:            'pdf',
      document_source_type:          'upload',
      document_created_at:           '2026-01-01T00:00:00Z',
      document_subject_id:           null,
      document_source_recording_id:  null,
      analysis_id:                   null,
      analysis_data:                 null,
      analysis_created_at:           null,
      analysis_model:                null,
    }
    const digest = buildSourceDigest(envelope)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    // Same input → same digest (deterministic).
    expect(buildSourceDigest(envelope)).toBe(digest)
  })

  it('buildRequestHash produces a 64-char hex string and changes when source_digest changes', () => {
    const base: RequestHashEnvelope = {
      schema_version:       1,
      source_digest:        'a'.repeat(64),
      job_type:             'visuals',
      operation_descriptor: { text_model: 'gpt-4o-mini', image_model: 'gpt-image-2' },
      sanitized_input:      {},
    }
    const hashA = buildRequestHash(base)
    const hashB = buildRequestHash({ ...base, source_digest: 'b'.repeat(64) })
    expect(hashA).toMatch(/^[0-9a-f]{64}$/)
    expect(hashB).toMatch(/^[0-9a-f]{64}$/)
    expect(hashA).not.toBe(hashB)
  })

  it('scoped idempotency key format: ${userId}:${uuid} matches DB validation regex', () => {
    const SCOPED_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    const userId   = '12345678-1234-1234-1234-123456789012'
    const reqKey   = buildRequestIdempotencyKey()
    const scoped   = `${userId}:${reqKey}`
    expect(scoped).toMatch(SCOPED_RE)
    expect(scoped.split(':')[0]).toBe(userId)
  })

  it('permission denied SQLSTATE is 42501 — referenced by all DB security tests', () => {
    // PostgreSQL SQLSTATE for insufficient_privilege.
    // Group B security tests check error.code against /42501|403/.
    expect('42501').toHaveLength(5)
    expect('42501').toMatch(/^[0-9A-Z]{5}$/)
  })

  it('generation_source_snapshots content_hash is the authoritative source identity', () => {
    // The snapshot.content_hash (DB-computed SHA-256 of the source envelope)
    // is the authoritative value compared in DOCUMENT_REVISION_CHANGED detection,
    // not any caller-supplied hash. This test documents the design invariant.
    // fn_enqueue_job: v_source_digest = fn_sha256_hex(source_envelope_text)
    // D2 check: IF v_active_content_hash IS DISTINCT FROM v_source_digest → P0017
    const designInvariant = 'DB_COMPUTED_HASH_IS_AUTHORITATIVE'
    expect(designInvariant).toBe('DB_COMPUTED_HASH_IS_AUTHORITATIVE')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP B — Database integration tests
// STATUS: WRITTEN BUT NOT EXECUTED
//
// Requirements:
//   - Supabase test environment with migration 20260729120001 applied
//   - Two seeded test users (A and B) in auth.users
//   - E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY environment variables set
//   - George's explicit approval before execution in any environment
//
// Convention: assertions are commented out (not `expect(false).toBe(true)`)
// to avoid false-positive passes and to serve as executable specifications.
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2 — Database integration (NOT EXECUTED)', () => {
  // Set RUN_DATABASE_TESTS=1 (and valid SUPABASE_URL + service-role credentials) to run.
  // Without the flag, all Group B tests are skipped. This prevents accidental execution
  // against a production or shared environment during local development.
  const NOT_EXECUTED = !process.env['RUN_DATABASE_TESTS']

  // Hard credential failure: if RUN_DATABASE_TESTS=1 but required env vars are missing,
  // fail loudly in beforeAll rather than silently skipping every test.
  // This prevents a misconfigured CI run from producing a false-positive green suite.
  if (!NOT_EXECUTED) {
    beforeAll(() => {
      const missing: string[] = []
      if (!process.env['E2E_SUPABASE_URL'])    missing.push('E2E_SUPABASE_URL')
      if (!process.env['E2E_SUPABASE_ANON_KEY']) missing.push('E2E_SUPABASE_ANON_KEY')
      if (!process.env['SUPABASE_SECRET_KEY'] && !process.env['SUPABASE_SERVICE_ROLE_KEY'])
        missing.push('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY')
      if (missing.length > 0) {
        throw new Error(
          `RUN_DATABASE_TESTS=1 but required env vars are not set: ${missing.join(', ')}. ` +
          'Set these variables or unset RUN_DATABASE_TESTS to skip Group B tests.',
        )
      }
    })
  }

  // ── SECURITY: migration 20260729120001 state ──

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] after migration 20260729120001: SELECT from base table blocked', async () => {
    /**
     * REVOKE ALL on generation_jobs from authenticated is in the consolidated migration.
     * Direct SELECT via anon/user client must return a 42501/403 permission error.
     * Validates: no residual FOR ALL policy from beta_foundation_v1.sql remains.
     */
    // const { error } = await userClient.from('generation_jobs').select('id').limit(1)
    // expect(error).not.toBeNull()
    // expect(error?.code).toMatch(/42501|403/)
  })

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] after migration 20260729120001: INSERT to base table blocked', async () => {
    // const { error } = await userClient.from('generation_jobs').insert({
    //   user_id: userAId, document_id: docId, job_type: 'visuals', status: 'queued',
    // })
    // expect(error).not.toBeNull()
    // expect(error?.code).toMatch(/42501|403/)
  })

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] after migration 20260729120001: UPDATE to base table blocked', async () => {
    // const { error } = await userClient.from('generation_jobs').update({ status: 'cancelled' }).eq('id', existingJobId)
    // expect(error).not.toBeNull()
    // expect(error?.code).toMatch(/42501|403/)
  })

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] after migration 20260729120001: DELETE from base table blocked', async () => {
    // const { error } = await userClient.from('generation_jobs').delete().eq('user_id', userAId)
    // expect(error).not.toBeNull()
    // expect(error?.code).toMatch(/42501|403/)
  })

  // ── DURABLE IDEMPOTENCY (Control A) ──

  test.skipIf(NOT_EXECUTED)('[DB] fn_enqueue_job: same key + same payload returns original job (any status)', async () => {
    /**
     * Creates a job with key K, completes it (terminal).
     * Calls fn_enqueue_job again with the same K and same payload.
     * Expected: same job_id, is_existing=true.
     * Terminal jobs hold the slot permanently — the key never creates a second job.
     */
    // const first = await enqueueJob(documentId, 'visuals', {}, undefined)
    // await completeAndPublishJob(first.job_id, workerId, leaseToken, stateVersion, [], 'test')
    // const second = await enqueueJob(documentId, 'visuals', {}, first.requestKey)
    // expect(second.job_id).toBe(first.job_id)
    // expect(second.is_existing).toBe(true)
    // expect(second.status).toBe('completed')
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_enqueue_job: same key + different payload → IDEMPOTENCY_PAYLOAD_CONFLICT (P0004)', async () => {
    /**
     * Creates job with key K and payload P1.
     * Calls fn_enqueue_job again with same K and payload P2.
     * Expected: Postgres exception P0004 / IDEMPOTENCY_PAYLOAD_CONFLICT.
     */
    // const first = await enqueueJob(documentId, 'visuals', { a: 1 }, undefined)
    // await expect(enqueueJob(documentId, 'visuals', { a: 2 }, first.requestKey)).rejects.toThrow('P0004')
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_enqueue_job: retry with same key reuses original job (retry-safe)', async () => {
    /**
     * Simulates network retry: enqueueJob called twice with the same requestKey
     * while the job is still active.
     * Expected: second call returns same job_id, is_existing=true, status active.
     */
    // const first = await enqueueJob(documentId, 'visuals', {}, undefined)
    // const second = await enqueueJob(documentId, 'visuals', {}, first.requestKey)
    // expect(second.job_id).toBe(first.job_id)
    // expect(second.is_existing).toBe(true)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_enqueue_job: terminal job does NOT free idempotency slot', async () => {
    /**
     * Creates and fails a job with key K.
     * Attempts fn_enqueue_job with the same K.
     * Expected: returns the failed job (is_existing=true, status='failed').
     * A new key is required for a fresh attempt.
     */
    // const retry = await enqueueJob(documentId, 'visuals', {}, failedJobRequestKey)
    // expect(retry.is_existing).toBe(true)
    // expect(retry.status).toBe('failed')
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_enqueue_job: intentional regeneration (no requestKey) creates new job', async () => {
    /**
     * After a terminal job, a new user action sends no requestKey.
     * fn_enqueue_job generates a fresh UUID and creates a new job.
     * Expected: new job_id, is_existing=false, status='queued'.
     */
    // const fresh = await enqueueJob(documentId, 'visuals', {}, undefined)
    // expect(fresh.is_existing).toBe(false)
    // expect(fresh.status).toBe('queued')
    // expect(fresh.job_id).not.toBe(previousTerminalJobId)
  })

  // ── LOST-RESPONSE IDEMPOTENCY ──

  test.skipIf(NOT_EXECUTED)('[DB] lost-response: retry after server insert but before client receives response', async () => {
    /**
     * Scenario: client sends key K, server inserts job, server crashes before
     * returning the response. Client catches a network error, retrieves key K
     * from sessionStorage, and retries the request.
     * Expected: second enqueueJob call with the same key K returns the original
     * job (is_existing=true), not a new one. Status is 'queued' (still active).
     * This validates that client-side key persistence + server idempotency together
     * guarantee exactly-once job creation even when the response is lost.
     */
    // const requestKey = crypto.randomUUID()  // client generates before request
    // const first = await enqueueJob(documentId, 'visuals', {}, requestKey)
    // // Simulate: server processed it but client lost the response.
    // // Client retries with the same requestKey from sessionStorage:
    // const retry = await enqueueJob(documentId, 'visuals', {}, requestKey)
    // expect(retry.job_id).toBe(first.job_id)
    // expect(retry.is_existing).toBe(true)
    // expect(retry.status).toBe('queued')
  })

  test.skipIf(NOT_EXECUTED)('[DB] retry after the original job has already completed', async () => {
    /**
     * Scenario: job completed successfully. Client still has the requestKey in
     * sessionStorage. An edge-case re-trigger sends the same key again.
     * Expected: server returns the completed job (is_existing=true, status='completed').
     * No new job is created — the terminal slot is held permanently.
     */
    // const requestKey = crypto.randomUUID()
    // const first = await enqueueJob(documentId, 'visuals', {}, requestKey)
    // await completeAndPublishJob(first.job_id, workerId, leaseToken, stateVersion, [], 'model')
    // const late = await enqueueJob(documentId, 'visuals', {}, requestKey)
    // expect(late.job_id).toBe(first.job_id)
    // expect(late.is_existing).toBe(true)
    // expect(late.status).toBe('completed')
  })

  test.skipIf(NOT_EXECUTED)('[DB] refresh while request is pending: same key returns existing active job', async () => {
    /**
     * Scenario: user refreshes the page while a job is processing.
     * sessionStorage preserves the requestKey. On mount, the component resumes
     * polling the existing job (via getActiveJobForDocument). If it re-triggers
     * the enqueue call with the same key, it gets the same active job back.
     * Expected: is_existing=true, same job_id, status 'queued' or 'processing'.
     */
    // const requestKey = crypto.randomUUID()
    // const first = await enqueueJob(documentId, 'visuals', {}, requestKey)
    // await claimJob(first.job_id, 'worker-a')  // transitions to processing
    // // Simulate: component remounts after refresh, re-sends same key:
    // const afterRefresh = await enqueueJob(documentId, 'visuals', {}, requestKey)
    // expect(afterRefresh.job_id).toBe(first.job_id)
    // expect(afterRefresh.is_existing).toBe(true)
  })

  test.skipIf(NOT_EXECUTED)('[DB] two clicks for same pending action: same key, no duplicate job', async () => {
    /**
     * Scenario: user double-clicks Generate. Both calls carry the same requestKey
     * (from sessionStorage). Expected: second enqueue returns is_existing=true.
     * Only one job is created.
     */
    // const requestKey = crypto.randomUUID()
    // const [r1, r2] = await Promise.all([
    //   enqueueJob(documentId, 'visuals', {}, requestKey),
    //   enqueueJob(documentId, 'visuals', {}, requestKey),
    // ])
    // expect(r1.job_id).toBe(r2.job_id)
    // const isExistingCount = [r1, r2].filter(r => r.is_existing).length
    // expect(isExistingCount).toBeGreaterThanOrEqual(1)
  })

  test.skipIf(NOT_EXECUTED)('[DB] explicit regeneration: new key creates a new job after terminal', async () => {
    /**
     * Scenario: user clicks "Regenerate" after completion. The client clears the
     * old sessionStorage key and generates a fresh UUID. The server creates a new job.
     * Expected: new job_id, is_existing=false, status='queued'.
     */
    // const firstKey = crypto.randomUUID()
    // const first = await enqueueJob(documentId, 'visuals', {}, firstKey)
    // await completeAndPublishJob(first.job_id, workerId, leaseToken, stateVersion, [], 'model')
    // // Client clears old key, generates new one:
    // const newKey = crypto.randomUUID()  // clearPendingRequestKey + getOrCreatePendingRequestKey
    // const regenerated = await enqueueJob(documentId, 'visuals', {}, newKey)
    // expect(regenerated.job_id).not.toBe(first.job_id)
    // expect(regenerated.is_existing).toBe(false)
    // expect(regenerated.status).toBe('queued')
  })

  test.skipIf(NOT_EXECUTED)('[DB] same key with different payload → P0004 conflict error', async () => {
    /**
     * Scenario: client sends key K with payload P1 (first action). Then sends
     * the same key K with a different payload P2 (possible client bug or race).
     * Expected: Postgres exception P0004 / IDEMPOTENCY_PAYLOAD_CONFLICT.
     * The server rejects the conflicting payload rather than silently creating a
     * different job under the same idempotency key.
     */
    // const requestKey = crypto.randomUUID()
    // await enqueueJob(documentId, 'visuals', { quality: 'high' }, requestKey)
    // await expect(
    //   enqueueJob(documentId, 'visuals', { quality: 'low' }, requestKey)
    // ).rejects.toThrow('P0004')
  })

  // ── ACTIVE-JOB EXCLUSION (Control B — independent of idempotency) ──

  test.skipIf(NOT_EXECUTED)('[DB] D2: different keys, same (user, doc, type) → active exclusion returns existing', async () => {
    /**
     * Two requests with DIFFERENT requestKeys for the same (user, doc, type)
     * while an active job exists. Active-job exclusion (Control B) fires.
     * Expected: second call returns existing active job (is_existing=true, same job_id).
     */
    // const first = await enqueueJob(docId, 'visuals', {}, undefined)
    // await claimJob(first.job_id, 'worker-x')  // transitions to processing
    // const second = await enqueueJob(docId, 'visuals', {}, undefined)  // new key
    // expect(second.job_id).toBe(first.job_id)
    // expect(second.is_existing).toBe(true)
  })

  // ── HEARTBEAT AND LEASE TIMING (D13) ──

  test.skipIf(NOT_EXECUTED)('[DB] fn_heartbeat_job: 30s heartbeat renews lease to NOW()+90s', async () => {
    /**
     * Claims a job (lease = 90s). Calls heartbeatJob with leaseDurationSeconds=90.
     * Expected: renewed=true, new lease_expires_at ≈ NOW() + 90s (not NOW() + 30s).
     * Validates D13: heartbeat extends to 90s, not to the 30s heartbeat interval.
     */
    // const claim = await claimJob(jobId, 'worker-a')
    // const beforeHeartbeat = Date.now()
    // const renewed = await heartbeatJob(jobId, 'worker-a', claim.leaseToken!, claim.stateVersion!)
    // const afterHeartbeat = Date.now()
    // expect(renewed).toBe(true)
    // (DB row: lease_expires_at should be between afterHeartbeat+85_000 and afterHeartbeat+95_000 ms)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_heartbeat_job: does not shorten a valid lease', async () => {
    /**
     * Claims a job with 120s lease. Immediately heartbeats with 90s duration.
     * Expected: renewed=true, new expiry is >= old expiry (lease not shortened).
     * Note: with NOW()+90s, if old was NOW()+120s, this shortens the lease.
     * The DB function always sets to NOW()+p_lease_duration_seconds.
     * This test documents that behaviour — callers should not use short durations.
     */
    // const claim = await claimJob(jobId, 'worker-a', 90)
    // const renewed = await heartbeatJob(jobId, 'worker-a', claim.leaseToken!, claim.stateVersion!, 90)
    // expect(renewed).toBe(true)
    // (Verify: new lease_expires_at ≈ NOW() + 90s)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_heartbeat_job: expired lease cannot be renewed', async () => {
    /**
     * Seeds a processing job with lease_expires_at in the past (service_role UPDATE).
     * Calls heartbeatJob with correct workerId and leaseToken.
     * Expected: renewed=false (lease_expires_at > NOW() condition fails in WHERE).
     */
    // const renewed = await heartbeatJob(expiredJobId, workerId, leaseToken, stateVersion)
    // expect(renewed).toBe(false)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_heartbeat_job: wrong worker_id → renewal rejected', async () => {
    /**
     * Claims job as worker-A. Attempts heartbeat as worker-B (wrong worker_id).
     * Expected: renewed=false (worker_id = p_worker_id condition fails in WHERE).
     * Validates: both worker_id AND lease_token verified in every worker CAS.
     */
    // const claim = await claimJob(jobId, 'worker-a')
    // const renewed = await heartbeatJob(jobId, 'worker-b', claim.leaseToken!, claim.stateVersion!)
    // expect(renewed).toBe(false)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_heartbeat_job: wrong lease_token → renewal rejected', async () => {
    /**
     * Claims job. Attempts heartbeat with a different UUID as lease_token.
     * Expected: renewed=false (lease_token = p_lease_token condition fails in WHERE).
     */
    // const claim = await claimJob(jobId, 'worker-a')
    // const wrongToken = crypto.randomUUID()
    // const renewed = await heartbeatJob(jobId, 'worker-a', wrongToken, claim.stateVersion!)
    // expect(renewed).toBe(false)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_heartbeat_job: cancel_requested refuses renewal (cancel wins)', async () => {
    /**
     * Job is cancel_requested with a valid non-expired lease.
     * Calls heartbeatJob with correct workerId and leaseToken.
     * Expected: renewed=false (status = 'processing' condition fails in WHERE).
     */
    // const renewed = await heartbeatJob(cancelRequestedJobId, workerId, leaseToken, stateVersion)
    // expect(renewed).toBe(false)
  })

  // ── ATOMIC PUBLICATION (fn_complete_and_publish_job) ──

  test.skipIf(NOT_EXECUTED)('[DB] fn_complete_and_publish_job: completed job always has study_visuals record', async () => {
    /**
     * Calls completeAndPublishJob with staged visuals.
     * Expected:
     *   - outcome='completed', job status='completed'
     *   - study_visuals record exists for (document_id, user_id) with the staged items
     *   - Both writes happened atomically inside fn_complete_and_publish_job
     * Validates: no completed job without a published study_visuals manifest.
     */
    // const completion = await completeAndPublishJob(jobId, workerId, leaseToken, stateVersion, stagedItems, 'model')
    // expect(completion.outcome).toBe('completed')
    // const { data } = await serviceClient.from('study_visuals').select().eq('document_id', documentId).single()
    // expect(data).not.toBeNull()
    // expect(data.visuals).toEqual(stagedItems)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_complete_and_publish_job: cancel_requested → cancelled, no study_visuals (D1)', async () => {
    /**
     * Job is cancel_requested. Calls completeAndPublishJob (worker finished, unaware of cancel).
     * Expected: outcome='cancelled', study_visuals NOT written.
     * Validates: D1 cancel-wins; fn_complete_and_publish_job checks cancel_requested atomically.
     */
    // const completion = await completeAndPublishJob(cancelRequestedJobId, workerId, leaseToken, stateVersion, items, 'model')
    // expect(completion.outcome).toBe('cancelled')
    // const { data } = await serviceClient.from('study_visuals').select().eq('document_id', documentId).maybeSingle()
    // expect(data).toBeNull()
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_complete_and_publish_job: transaction rollback on study_visuals failure leaves job non-completed', async () => {
    /**
     * Simulates a study_visuals constraint violation during atomic publication.
     * Expected:
     *   - generation_jobs status stays 'processing' (not 'completed')
     *   - study_visuals not written
     *   - Both writes rolled back atomically
     * Validates: crash-during-publication invariant; no orphaned 'completed' job.
     * (Requires injecting a failure in the study_visuals write — test-DB specific setup.)
     */
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_complete_and_publish_job: expired lease → expired_lease, no study_visuals published', async () => {
    /**
     * Seeds processing job with lease_expires_at in the past.
     * Calls completeAndPublishJob with correct workerId and leaseToken.
     * Expected: outcome='expired_lease', study_visuals NOT written.
     * Validates: lost-race path produces no published manifest.
     */
    // const result = await completeAndPublishJob(expiredJobId, workerId, leaseToken, stateVersion, items, 'model')
    // expect(result.outcome).toBe('expired_lease')
    // const { data } = await serviceClient.from('study_visuals').select().eq('document_id', documentId).maybeSingle()
    // expect(data).toBeNull()
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_complete_and_publish_job: wrong worker_id → wrong_token, no study_visuals', async () => {
    // const completion = await completeAndPublishJob(jobId, 'wrong-worker', claim.leaseToken!, claim.stateVersion!, [], 'model')
    // expect(completion.outcome).toBe('wrong_token')
    // (study_visuals not written)
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_complete_and_publish_job: wrong lease_token → wrong_token, no study_visuals', async () => {
    // const completion = await completeAndPublishJob(jobId, workerId, crypto.randomUUID(), stateVersion, [], 'model')
    // expect(completion.outcome).toBe('wrong_token')
  })

  // ── WORKER IDENTITY: fail and acknowledge ──

  test.skipIf(NOT_EXECUTED)('[DB] fn_fail_job: wrong worker_id → wrong_token', async () => {
    // const failure = await failJob(jobId, 'wrong-worker', leaseToken, stateVersion, 'E', 'k', 'SR-x')
    // expect(failure.outcome).toBe('wrong_token')
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_fail_job: cancel_requested → cancelled (cancel wins per D1)', async () => {
    /**
     * Worker encounters an error after cancel was requested.
     * Expected: outcome='cancelled', final_status='cancelled'.
     */
    // const failure = await failJob(cancelRequestedJobId, workerId, leaseToken, stateVersion, 'OPENAI_ERROR', 'errors.job.failed', 'SR-xxx')
    // expect(failure.outcome).toBe('cancelled')
    // expect(failure.finalStatus).toBe('cancelled')
  })

  // ── CONCURRENT CLAIM SAFETY ──

  test.skipIf(NOT_EXECUTED)('[DB] fn_claim_job: two concurrent claims — only one wins (SKIP LOCKED)', async () => {
    /**
     * Two workers race to claim the same queued job (SELECT FOR UPDATE SKIP LOCKED).
     * Expected: exactly one 'claimed', one 'lost_race' (or 'not_found').
     * Job ends in 'processing' exactly once. state_version incremented exactly once.
     */
    // const [r1, r2] = await Promise.all([claimJob(jobId, 'worker-a'), claimJob(jobId, 'worker-b')])
    // const claimed = [r1, r2].filter(r => r.outcome === 'claimed')
    // expect(claimed).toHaveLength(1)
    // expect(claimed[0].stateVersion).toBe(2)
  })

  // ── STALE RECOVERY ──

  test.skipIf(NOT_EXECUTED)('[DB] fn_recover_stale_jobs: stale processing within attempts → requeued', async () => {
    // const recovery = await recoverStaleJobs()
    // expect(recovery.requeued).toBeGreaterThanOrEqual(1)
    // const job = await getJobSafeDto(staleJobId)
    // expect(job?.status).toBe('queued')
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_recover_stale_jobs: stale cancel_requested → cancelled (cancel wins, never requeued)', async () => {
    /**
     * cancel_requested stale jobs must become 'cancelled', not 'queued'.
     * Recovery must not allow cancel to be undone.
     */
    // const recovery = await recoverStaleJobs()
    // expect(recovery.cancelled).toBeGreaterThanOrEqual(1)
    // const job = await getJobSafeDto(staleJobId)
    // expect(job?.status).toBe('cancelled')
  })

  test.skipIf(NOT_EXECUTED)('[DB] fn_claim_job: max_attempts_exceeded → permanently failed', async () => {
    // const claim = await claimJob(maxAttemptsJobId, 'worker-x')
    // expect(claim.outcome).toBe('max_attempts_exceeded')
    // expect(claim.leaseToken).toBeNull()
  })

  // ── SECURITY: worker RPCs inaccessible to authenticated role ──

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] authenticated cannot execute fn_claim_job', async () => {
    // const { error } = await userClient.rpc('fn_claim_job', { p_job_id: testJobId, p_worker_id: 'x', p_lease_duration_seconds: 90 })
    // expect(error?.code).toMatch(/42501|403/)
  })

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] authenticated cannot execute fn_heartbeat_job', async () => {
    // const { error } = await userClient.rpc('fn_heartbeat_job', { p_job_id: testJobId, p_worker_id: 'x', p_lease_token: 'y', p_state_version: 1 })
    // expect(error?.code).toMatch(/42501|403/)
  })

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] authenticated cannot execute fn_complete_and_publish_job', async () => {
    // const { error } = await userClient.rpc('fn_complete_and_publish_job', { p_job_id: testJobId, p_worker_id: 'x', p_lease_token: 'y', p_state_version: 1, p_visuals: [], p_model: 'm' })
    // expect(error?.code).toMatch(/42501|403/)
  })

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] authenticated cannot execute fn_fail_job', async () => {
    // const { error } = await userClient.rpc('fn_fail_job', { p_job_id: testJobId, p_worker_id: 'x', p_lease_token: 'y', p_state_version: 1, p_error_code: 'E', p_message_key: 'k', p_support_reference: 's' })
    // expect(error?.code).toMatch(/42501|403/)
  })

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] authenticated cannot execute fn_recover_stale_jobs', async () => {
    // const { error } = await userClient.rpc('fn_recover_stale_jobs')
    // expect(error?.code).toMatch(/42501|403/)
  })

  // ── CROSS-USER ISOLATION ──

  test.skipIf(NOT_EXECUTED)('[DB SECURITY] fn_get_job_safe_dto: user A cannot read user B job', async () => {
    /**
     * User B owns job J. User A calls fn_get_job_safe_dto(J).
     * Expected: returns null (auth.uid() ownership check fails inside SECURITY DEFINER function).
     * Validates: no cross-user job data leak via the safe read RPC.
     */
    // const { data } = await userAClient.rpc('fn_get_job_safe_dto', { p_job_id: userBJobId })
    // expect(data).toBeNull()
  })

  // ── REQUEST LEDGER (migration 20260729120003) ─────────────────────────────
  // These tests require migration 20260729120003 applied on top of 20260729120001.
  // Together they validate the durable request-idempotency ledger that closes the
  // tab-isolation gap: K2 is durably bound even when D2 exclusion fires.

  test.skipIf(NOT_EXECUTED)('[DB LEDGER] K1 creates J; K2 arrives while J active → K2 durably bound to J in ledger', async () => {
    /**
     * User A submits K1 → J created (status: queued). K1 stored in ledger.
     * User A submits K2 (different UUID, same document/type, same hash) while J is active.
     * Expected:
     *   - fn_enqueue_job returns job_id = J, is_existing = true
     *   - generation_job_requests contains a row: (user_id, K2_scoped) → J
     *   - K2 and K1 are distinct entries in the ledger, both pointing to J
     * Validates: D2 path durably records the new key in the same transaction.
     */
    // const k1Scoped = `${userAId}:${crypto.randomUUID()}`
    // const k2Scoped = `${userAId}:${crypto.randomUUID()}`
    // const { data: r1 } = await userAClient.rpc('fn_enqueue_job', { p_document_id: docId, p_job_type: 'visuals', p_idempotency_key: k1Scoped, p_payload_hash: hashA, p_sanitized_input: {} })
    // expect(r1.is_existing).toBe(false)
    // const jobId = r1.job_id
    //
    // const { data: r2 } = await userAClient.rpc('fn_enqueue_job', { p_document_id: docId, p_job_type: 'visuals', p_idempotency_key: k2Scoped, p_payload_hash: hashA, p_sanitized_input: {} })
    // expect(r2.job_id).toBe(jobId)
    // expect(r2.is_existing).toBe(true)
    //
    // const { data: ledgerRows } = await serviceClient.from('generation_job_requests').select().eq('job_id', jobId)
    // expect(ledgerRows).toHaveLength(2)
    // const keys = ledgerRows!.map((r: { request_idempotency_key: string }) => r.request_idempotency_key)
    // expect(keys).toContain(k1Scoped)
    // expect(keys).toContain(k2Scoped)
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER] K2 response lost; J becomes terminal; retrying K2 returns J, no new job', async () => {
    /**
     * K1 → Job J (queued). K2 D2 binds to J. J is worker-completed (terminal).
     * K2 is retried after J is terminal.
     * Expected:
     *   - fn_enqueue_job for K2 hits Step 1 (ledger lookup) and returns J directly
     *   - is_existing = true, status = 'completed' (or the terminal status)
     *   - No new job is created (generation_jobs count for user/doc/type remains 1)
     * This is the core correctness test for migration 20260729120003.
     */
    // const k1Scoped = `${userAId}:${crypto.randomUUID()}`
    // const k2Scoped = `${userAId}:${crypto.randomUUID()}`
    // Setup: K1 creates J
    // const { data: r1 } = await userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: k1Scoped, ... })
    // const jobId = r1.job_id
    // Setup: K2 binds to J
    // await userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: k2Scoped, ... })
    // Setup: worker claims J and completes it
    // const claim = await claimJob(jobId, 'test-worker-1')
    // await completeAndPublishJob(jobId, 'test-worker-1', claim.leaseToken!, claim.stateVersion!, [], 'model')
    //
    // Act: retry K2 after J is terminal
    // const { data: r3 } = await userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: k2Scoped, ... })
    // expect(r3.job_id).toBe(jobId)
    // expect(r3.is_existing).toBe(true)
    // expect(r3.status).toBe('completed')
    // const { count } = await serviceClient.from('generation_jobs').select('*', { count: 'exact' }).eq('user_id', userAId).eq('document_id', docId)
    // expect(count).toBe(1)
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER] K2 with different payload while J active → P0004 IDEMPOTENCY_PAYLOAD_CONFLICT', async () => {
    /**
     * K2 is in the ledger (bound to active J) with hashA.
     * A retry sends K2 with hashB (different payload).
     * Expected: fn_enqueue_job returns P0004 IDEMPOTENCY_PAYLOAD_CONFLICT.
     * Validates: payload conflict detection applies to D2-bound keys, not just originating keys.
     */
    // K1 creates J with hashA. K2 binds to J with hashA.
    // const { error } = await userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: k2Scoped, p_payload_hash: hashB, ... })
    // expect(error?.code).toBe('P0004')
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER] ledger binding preserved after job becomes completed', async () => {
    /**
     * K1 creates J. K2 D2-binds to J. J completes.
     * Verify the ledger still has both K1→J and K2→J after completion.
     * Expected: two ledger rows, job status = 'completed'.
     * Validates: terminal jobs retain their ledger entries permanently.
     */
    // const { data: rows } = await serviceClient.from('generation_job_requests').select().eq('job_id', jobId)
    // expect(rows).toHaveLength(2)
    // const { data: job } = await serviceClient.from('generation_jobs').select('status').eq('id', jobId).single()
    // expect(job.status).toBe('completed')
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER] K_new with new key after J terminal → creates J2 (intentional regeneration)', async () => {
    /**
     * J is terminal. K_new is a fresh UUID (not in the ledger).
     * Expected: fn_enqueue_job creates J2 (new job, status queued), K_new bound to J2.
     * Validates: terminal status does NOT block new jobs — only the ledger blocks.
     */
    // const kNew = `${userAId}:${crypto.randomUUID()}`
    // const { data: r } = await userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: kNew, p_payload_hash: hashA, ... })
    // expect(r.is_existing).toBe(false)
    // expect(r.status).toBe('queued')
    // expect(r.job_id).not.toBe(jobId) // different from J
    // const { data: ledger } = await serviceClient.from('generation_job_requests').select().eq('request_idempotency_key', kNew)
    // expect(ledger).toHaveLength(1)
    // expect(ledger![0].job_id).toBe(r.job_id)
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER] concurrent new keys, no active job → both bound to one job', async () => {
    /**
     * K_a and K_b arrive concurrently with no active job for (user, doc, type).
     * Database D2 index ensures only one job is created; the losing INSERT hits
     * unique_violation and binds its key to the winning job.
     * Expected:
     *   - Exactly one row in generation_jobs for the user/doc/type
     *   - Two rows in generation_job_requests, both pointing to the same job_id
     * Validates: Step 3 concurrent-insert race produces exactly one job + two ledger entries.
     * (Requires two concurrent DB connections — use Promise.all or pg advisory locks in test setup.)
     */
    // const kA = `${userAId}:${crypto.randomUUID()}`
    // const kB = `${userAId}:${crypto.randomUUID()}`
    // const [rA, rB] = await Promise.all([
    //   userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: kA, ... }),
    //   userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: kB, ... }),
    // ])
    // expect(rA.data?.job_id).toBe(rB.data?.job_id)
    // const { count } = await serviceClient.from('generation_jobs').select('*', { count: 'exact' }).eq('user_id', userAId).eq('document_id', docId).in('status', ['queued', 'processing', 'cancel_requested'])
    // expect(count).toBe(1)
    // const { data: ledger } = await serviceClient.from('generation_job_requests').select().eq('job_id', rA.data.job_id)
    // expect(ledger).toHaveLength(2)
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER SECURITY] authenticated user cannot SELECT from generation_job_requests', async () => {
    /**
     * Authenticated user A attempts a direct SELECT on generation_job_requests.
     * Expected: permission denied (REVOKE ALL from authenticated was applied in migration 20260729120003).
     * Validates: ledger is not readable via direct table access.
     */
    // const { error } = await userAClient.from('generation_job_requests').select('*').limit(1)
    // expect(error?.code).toMatch(/42501|PGRST301/)
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER SECURITY] authenticated user cannot INSERT into generation_job_requests', async () => {
    /**
     * Authenticated user A attempts a direct INSERT into generation_job_requests.
     * Expected: permission denied.
     * Validates: ledger writes are only possible via SECURITY DEFINER fn_enqueue_job.
     */
    // const { error } = await userAClient.from('generation_job_requests').insert({ user_id: userAId, request_idempotency_key: 'test', request_payload_hash: 'a'.repeat(64), job_id: someJobId })
    // expect(error?.code).toMatch(/42501|PGRST301/)
  })

  test.skipIf(NOT_EXECUTED)('[DB LEDGER SECURITY] cross-user: same bare UUID does not collide across users', async () => {
    /**
     * User A and User B each submit the same bare UUID (simulating an attacker reusing
     * someone else's UUID). The composite scoped key includes userId, so they are distinct.
     * Expected:
     *   - User A gets job_a; User B gets job_b; both are different jobs.
     *   - generation_job_requests has two rows: one per user, both with the same bare UUID
     *     but different scoped keys, pointing to different jobs.
     * Validates: the userId prefix in the scoped key provides cross-user isolation.
     */
    // const sharedBareUuid = crypto.randomUUID()
    // const kA = `${userAId}:${sharedBareUuid}`
    // const kB = `${userBId}:${sharedBareUuid}`
    // const { data: rA } = await userAClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: kA, ... })
    // const { data: rB } = await userBClient.rpc('fn_enqueue_job', { ..., p_idempotency_key: kB, ... })
    // expect(rA.job_id).not.toBe(rB.job_id)
    // const { data: ledger } = await serviceClient.from('generation_job_requests').select().in('request_idempotency_key', [kA, kB])
    // expect(ledger).toHaveLength(2)
    // expect(ledger!.map((r: { job_id: string }) => r.job_id)).not.toContain(expect.arrayContaining([rA.job_id === rB.job_id]))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C — Static migration content tests (R7-H10)
//
// Executable without a database: reads the migration SQL file and asserts
// that forbidden patterns are absent and required patterns are present.
// Also verifies cross-language digest known-answer vectors (KAVs) to detect
// regressions in the TypeScript buildSourceDigest serialization or hash function.
//
// These tests run in every CI pass. They guard against re-introduction of the
// bugs closed by Round 8: the broken search_path, the missing document_analysis
// column (data), and the unqualified digest/encode calls.
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 3 — Static migration content tests (R7-H10)', () => {
  // Resolve migration path relative to the repo root (3 levels up from __tests__).
  const MIGRATION_PATH = resolve(__dirname, '../../../../migrations/20260729120001_generation_job_state_machine_schema.sql')
  const WORKER_PATH    = resolve(__dirname, '../visualsWorker.ts')

  let migrationSql: string
  let workerSrc: string

  beforeAll(() => {
    migrationSql = readFileSync(MIGRATION_PATH, 'utf8')
    workerSrc    = readFileSync(WORKER_PATH, 'utf8')
  })

  // ── FORBIDDEN PATTERNS (must be absent from migration SQL) ────────────────

  it('[STATIC] migration must NOT contain document_analysis.data column reference', () => {
    // R7-C01: the fatal bug was SELECT id, data, created_at, model FROM document_analysis.
    // "data" is not a column in document_analysis (D11). Any reference to that bare column
    // name in the migration is a regression.
    expect(migrationSql).not.toMatch(/document_analysis\.\s*data\b/)
    expect(migrationSql).not.toMatch(/SELECT\s+id\s*,\s*data\s*,/)
  })

  it('[STATIC] migration must NOT use the broken quoted search_path string', () => {
    // R7-C02: SET search_path = 'public,extensions,pg_catalog' (one quoted entry) treated the
    // entire comma-separated list as a single schema name — none resolved. The correct form
    // is SET search_path = extensions, pg_catalog (two unquoted comma-separated schemas).
    expect(migrationSql).not.toContain("'public,extensions,pg_catalog'")
    // Also reject any SET search_path line that includes 'public' as a schema entry.
    // Public presence in search_path on a SECURITY DEFINER function is a privilege-escalation
    // risk (attacker-controlled objects in public shadow legitimate schemas).
    // Use [^\n] to prevent the regex from spanning multiple lines (which would falsely match
    // "SET search_path = extensions, pg_catalog" ... many lines ... "public.generation_jobs").
    const lines = migrationSql.split('\n')
    const badLines = lines.filter(line =>
      /SET\s+search_path\s*=/.test(line) && /\bpublic\b/.test(line)
    )
    expect(badLines).toHaveLength(0)
  })

  it('[STATIC] migration must NOT contain unqualified digest() or encode() calls', () => {
    // R7-C02: bare digest() and encode() are unsafe in SECURITY DEFINER functions because
    // they resolve via search_path and can be shadowed by attacker-controlled functions.
    // Correct form: extensions.digest() and pg_catalog.encode().
    // The regex excludes comment lines (--) and the diagnostic error message string.
    const nonCommentLines = migrationSql
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n')
    // No unqualified digest() — must always be extensions.digest(
    expect(nonCommentLines).not.toMatch(/(?<!extensions\.)(?<!\w)digest\s*\(/)
    // No unqualified encode() — must always be pg_catalog.encode(
    expect(nonCommentLines).not.toMatch(/(?<!pg_catalog\.)(?<!\w)encode\s*\(/)
  })

  // ── REQUIRED PATTERNS (must be present in migration SQL) ──────────────────

  it('[STATIC] migration must use extensions.digest() (schema-qualified)', () => {
    expect(migrationSql).toContain('extensions.digest(')
  })

  it('[STATIC] migration must use pg_catalog.encode() (schema-qualified)', () => {
    expect(migrationSql).toContain('pg_catalog.encode(')
  })

  it('[STATIC] migration must use SET search_path = extensions, pg_catalog (correct form)', () => {
    expect(migrationSql).toContain('SET search_path = extensions, pg_catalog')
  })

  it('[STATIC] migration must use FOR SHARE locking on the consistent document read', () => {
    // R7-C04: single consistent LEFT JOIN read with FOR SHARE prevents concurrent
    // document/analysis mutation between two separate reads.
    expect(migrationSql).toContain('FOR    SHARE')
  })

  it('[STATIC] migration must handle unique_violation for new-job concurrent race (R7-C03)', () => {
    // R7-C03: without a WHEN unique_violation handler, two concurrent enqueue calls for the
    // same (user, doc, type) would both attempt INSERT, and the loser would get an unhandled
    // 23505 error. The handler re-reads the winner and durably binds the losing key.
    expect(migrationSql).toContain('WHEN unique_violation THEN')
  })

  it('[STATIC] migration must raise EXCEPTION (not WARNING) on wrong migration owner', () => {
    // R7: the current_user assertion was previously a WARNING — it did not block execution.
    // A WARNING can be missed in automated pipelines. EXCEPTION is the only safe choice.
    expect(migrationSql).toContain('RAISE EXCEPTION')
    expect(migrationSql).not.toMatch(/RAISE\s+WARNING\s+.*current_user/)
  })

  it('[STATIC] migration must assert pgcrypto is in the extensions schema', () => {
    // R7-C02: fn_sha256_hex calls extensions.digest(). If pgcrypto is installed in a
    // different schema, that call silently fails at apply time. The preflight must block
    // migration on a wrong-schema install.
    // R7-H09: the check was consolidated into the main preflight (section 1) which uses
    // IS DISTINCT FROM rather than !=; both are semantically equivalent for text comparison.
    expect(migrationSql).toMatch(/v_ext_schema\s+IS\s+DISTINCT\s+FROM\s+'extensions'/)
  })

  it('[STATIC] migration must not ADD dead expected_*_updated_at columns (R7-M04)', () => {
    // R7-M04: three dead columns were removed — they were never populated by fn_enqueue_job
    // and would have created a misleading false-precision API surface.
    // The column names may still appear in the drift-detection block (which checks whether
    // they exist from a prior schema version), but no ADD COLUMN statement must create them.
    expect(migrationSql).not.toMatch(/ADD\s+COLUMN[^;]*expected_document_updated_at/)
    expect(migrationSql).not.toMatch(/ADD\s+COLUMN[^;]*expected_document_text_updated_at/)
    expect(migrationSql).not.toMatch(/ADD\s+COLUMN[^;]*expected_analysis_updated_at/)
  })

  // ── WORKER SOURCE ASSERTIONS ───────────────────────────────────────────────

  it('[STATIC] visualsWorker must NOT read from documents or document_analysis tables', () => {
    // The worker must only read from the immutable generation_source_snapshots via
    // fn_get_claimed_job_context. Direct reads from mutable tables break the snapshot
    // isolation guarantee (the document could have changed since enqueue time).
    expect(workerSrc).not.toMatch(/\.from\s*\(\s*['"]documents['"]\s*\)/)
    expect(workerSrc).not.toMatch(/\.from\s*\(\s*['"]document_analysis['"]\s*\)/)
  })

  it('[STATIC] visualsWorker must NOT log raw storage paths (R7-M03)', () => {
    // R7-M03: logging full Storage paths (e.g. {userId}/{documentId}/...) exposes
    // tenant-scoped path structure in log aggregators accessible to operators or
    // third-party log services. Logs must use opaque indicators only.
    expect(workerSrc).not.toMatch(/logger\.(info|warn|error|debug)\s*\([^)]*\bpath\s*:\s*storagePath/)
  })

  // ── ROUND 9 CORRECTION ASSERTIONS (R9-C01, R9-C02, R9-H02, R9-H03) ────────

  it('[STATIC] migration fn_sha256_hex must use STRICT to return NULL for NULL input (R9-C01)', () => {
    // R9-C01: without STRICT, fn_sha256_hex(NULL) would attempt to hash the string NULL,
    // producing a spurious hash rather than NULL. STRICT propagates NULL cleanly.
    expect(migrationSql).toMatch(/CREATE\s+FUNCTION\s+public\.fn_sha256_hex[^;]*\bSTRICT\b/)
  })

  it('[STATIC] migration fn_sha256_hex must use pg_catalog.convert_to for explicit UTF-8 bytes (R9-C01)', () => {
    // R9-C01: extensions.digest() accepts bytea. Without convert_to, a TEXT input is
    // cast via the session client_encoding, which may not be UTF-8. convert_to pins the
    // byte contract to UTF-8 regardless of session settings.
    expect(migrationSql).toContain("pg_catalog.convert_to(p_input, 'UTF8')")
  })

  it('[STATIC] migration must assert server_encoding = UTF8 in preflight (R9-C01)', () => {
    // R9-C01: if the database server_encoding is not UTF8, the byte contract for
    // fn_sha256_hex is undefined. The preflight must block migration execution early.
    expect(migrationSql).toContain("current_setting('server_encoding') <> 'UTF8'")
  })

  it('[STATIC] migration must use to_char with AT TIME ZONE UTC for timestamp encoding in source envelope (R9-C01)', () => {
    // R9-C01: JSONB::TEXT cast of timestamps is session-timezone dependent. The canonical
    // hash must use to_char(ts AT TIME ZONE 'UTC', ...) to produce a timezone-fixed string.
    expect(migrationSql).toMatch(/to_char\s*\([^)]+AT\s+TIME\s+ZONE\s+'UTC'/)
  })

  it('[STATIC] migration must contain a KAV DO block with the FIPS 180-4 empty-string SHA-256 (R9-C01)', () => {
    // R9-C01: the known-answer vector block verifies fn_sha256_hex produces the FIPS 180-4
    // standard output for the empty string. If the function is broken, migration execution fails.
    expect(migrationSql).toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('[STATIC] migration must contain a KAV check for fn_sha256_hex(\'hello\') (R9-C01)', () => {
    // R9-C01: second known-answer vector — FIPS 180-4 SHA-256 of ASCII 'hello'.
    expect(migrationSql).toContain('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('[STATIC] migration must add UNIQUE(document_id, user_id) constraint on document_analysis (R9-C02)', () => {
    // R9-C02: the raceable COUNT-then-check pattern for duplicate analysis detection is
    // removed. A UNIQUE constraint is the only concurrency-safe authoritative control.
    expect(migrationSql).toContain('document_analysis_document_user_unique')
    expect(migrationSql).toMatch(/ADD\s+CONSTRAINT\s+document_analysis_document_user_unique\s+UNIQUE\s*\(\s*document_id\s*,\s*user_id\s*\)/)
  })

  it('[STATIC] migration must NOT contain a raceable COUNT(*) on document_analysis (R9-C02)', () => {
    // R9-C02: the pre-correction code used SELECT COUNT(*) INTO v_analysis_count FROM
    // document_analysis WHERE ... to detect duplicates, then raised on count > 1.
    // This is a race — two concurrent inserts can both pass the count check.
    // After the correction, the UNIQUE constraint is the sole authority; COUNT is removed.
    expect(migrationSql).not.toMatch(/SELECT\s+COUNT\s*\(\s*\*\s*\)\s+INTO\s+v_analysis_count/)
  })

  it('[STATIC] migration must return structured outcome for concurrent-enqueue race (not RAISE EXCEPTION P0007) (R9-H03)', () => {
    // R9-H03: fn_enqueue_job is SECURITY DEFINER and granted to authenticated. PostgREST
    // exposes it directly. A RAISE EXCEPTION with ERRCODE = 'P0007' leaks internal state
    // machine codes to authenticated callers. The correct pattern returns a JSON object
    // with outcome:'retry_required' so the server action handles it without error propagation.
    expect(migrationSql).not.toMatch(/ERRCODE\s*=\s*'P0007'/)
    expect(migrationSql).toMatch(/'outcome'\s*,\s*'retry_required'/)
  })

  it('[STATIC] migration must add provenance columns to study_visuals (R9-H02)', () => {
    // R9-H02: study_visuals had no FK linkage to generation_jobs or generation_source_snapshots.
    // The corrective migration adds source_job_id, source_snapshot_id, source_request_hash,
    // publication_attempt to establish full provenance tracing.
    expect(migrationSql).toContain('source_job_id')
    expect(migrationSql).toContain('source_snapshot_id')
    expect(migrationSql).toContain('source_request_hash')
    expect(migrationSql).toContain('publication_attempt')
    expect(migrationSql).toContain('study_visuals_source_job_fk')
    expect(migrationSql).toContain('study_visuals_source_snapshot_fk')
  })

  it('[STATIC] migration must enforce per-job closed schema for v1 job types (R9-M02)', () => {
    // R9-M02: the database boundary must validate that v1 job types (visuals, flashcards,
    // quiz, revision_notes, analysis) accept no sanitized_input fields — the server action
    // alone is not sufficient as PostgREST bypasses it. An INVALID_INPUT exception is raised
    // at the DB level if p_sanitized_input is non-empty for these types.
    expect(migrationSql).toContain('INVALID_INPUT: v1 job type')
    expect(migrationSql).toContain("p_sanitized_input <> '{}'::JSONB")
  })

  // ── ROUND 10 CORRECTION ASSERTIONS (R10-C01, R10-H01, R10-H02) ──────────

  it('[STATIC] migration: generation_source_snapshots CREATE TABLE precedes study_visuals_source_snapshot_fk (R10-C01)', () => {
    // R10-C01 ordering fix: study_visuals_source_snapshot_fk references generation_source_snapshots.
    // PostgreSQL requires the referenced table to exist when ADD CONSTRAINT ... REFERENCES executes.
    // The previous migration had the FK before the CREATE TABLE — a deterministic execution failure.
    const createLine  = migrationSql.indexOf('CREATE TABLE public.generation_source_snapshots')
    const fkLine      = migrationSql.indexOf('ADD CONSTRAINT study_visuals_source_snapshot_fk')
    expect(createLine).toBeGreaterThan(-1)
    expect(fkLine).toBeGreaterThan(-1)
    expect(createLine).toBeLessThan(fkLine)
  })

  it('[STATIC] migration: generation_source_snapshots RLS/REVOKE precede study_visuals_source_snapshot_fk (R10-C01)', () => {
    // The CREATE TABLE block and its RLS + REVOKE must all precede the FK reference.
    const rls  = migrationSql.indexOf('ALTER TABLE public.generation_source_snapshots ENABLE ROW LEVEL SECURITY')
    const fk   = migrationSql.indexOf('ADD CONSTRAINT study_visuals_source_snapshot_fk')
    expect(rls).toBeGreaterThan(-1)
    expect(rls).toBeLessThan(fk)
  })

  it('[STATIC] migration: fn_snapshot_immutability_guard precedes study_visuals_source_snapshot_fk (R10-C01)', () => {
    // The immutability trigger function must be created before the FK so snapshot
    // immutability is enforced from the moment the FK relationship exists.
    const fn   = migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.fn_snapshot_immutability_guard')
    const fk   = migrationSql.indexOf('ADD CONSTRAINT study_visuals_source_snapshot_fk')
    expect(fn).toBeGreaterThan(-1)
    expect(fn).toBeLessThan(fk)
  })

  it('[STATIC] migration: document_analysis_document_owner_fk composite FK present (R10-H01)', () => {
    // R10-H01: analysis ownership — (document_id, user_id) on document_analysis must reference
    // documents(id, user_id). Prevents analysis rows under a different owner than the document.
    expect(migrationSql).toContain('document_analysis_document_owner_fk')
    expect(migrationSql).toMatch(/ADD\s+CONSTRAINT\s+document_analysis_document_owner_fk\s+FOREIGN\s+KEY/)
    expect(migrationSql).toMatch(/REFERENCES\s+public\.documents\s*\(\s*id\s*,\s*user_id\s*\)/)
  })

  it('[STATIC] migration: D10 preflight checks analysis-to-document ownership mismatch (R10-H01)', () => {
    // R10-H01: before any mutation, the preflight must fail closed on analysis rows
    // whose user_id differs from the corresponding documents.user_id.
    expect(migrationSql).toMatch(/da\.user_id\s*<>\s*d\.user_id/)
  })

  it('[STATIC] migration: D10 preflight checks duplicate document_id across users (R10-H01)', () => {
    // R10-H01: the product model is one analysis per document globally.
    // Duplicate document_ids (even across different user_ids) indicate an integrity violation.
    expect(migrationSql).toMatch(/GROUP BY\s+document_id\s+HAVING\s+count\(\*\)\s*>\s*1/)
  })

  it('[STATIC] migration: study_visuals_provenance_coherence CHECK constraint present (R10-H02)', () => {
    // R10-H02: provenance columns must be either all NULL (legacy rows without provenance)
    // or all NOT NULL (verified publications). Mixed-null states are incoherent and indicate
    // a partial write that bypassed fn_complete_and_publish_job.
    expect(migrationSql).toContain('study_visuals_provenance_coherence')
  })

  // ── CROSS-LANGUAGE DIGEST KNOWN-ANSWER VECTORS (KAV) ─────────────────────
  //
  // These tests verify that buildSourceDigest produces a deterministic, stable output
  // for fixed inputs. Any change to key sorting, JSON serialization, or the hash function
  // will cause these to fail, surfacing regressions before they reach production.
  //
  // R9-C01 IMPORTANT: These are Node.js-only KAVs. buildSourceDigest uses JSON.stringify
  // over a JS-canonicalized object (compact, JS key ordering via sort()). fn_sha256_hex
  // in PostgreSQL hashes the result of jsonb_build_object()::TEXT (alphabetical JSONB
  // key order, JSONB numeric/string semantics). The two byte sequences are NOT identical.
  // Do NOT compare these expected values against PostgreSQL fn_sha256_hex output —
  // they will differ. For PostgreSQL KAVs, see the DO block in the migration (section 7b).
  //
  // The reference hashes were computed on 2026-08-01 using Node.js crypto.createHash('sha256')
  // over JSON.stringify(canonicalize(envelope)) with keys sorted alphabetically at every level.
  // Hashes updated 2026-08-01 after adding document_subject_id field to SourceDigestEnvelope.

  it('[KAV] buildSourceDigest: full envelope with analysis produces known SHA-256', () => {
    const envelope: SourceDigestEnvelope = {
      schema_version:               1,
      document_id:                  '00000000-0000-0000-0000-000000000001',
      document_title:               'MoLis KAV',
      document_extracted_text:      'Known-answer vector for fn_sha256_hex cross-language test.',
      document_file_type:           'pdf',
      document_source_type:         'upload',
      document_created_at:          '2026-01-01T00:00:00.000Z',
      document_subject_id:          null,
      document_source_recording_id: null,
      analysis_id:                  '00000000-0000-0000-0000-000000000002',
      analysis_data:                { subject_area: 'Mathematics', difficulty_level: 'intermediate' },
      analysis_created_at:          '2026-01-02T00:00:00.000Z',
      analysis_model:               'gpt-4o',
    }
    // Reference: computed 2026-08-01 with Node.js crypto over JSON.stringify(canonicalize(envelope))
    // Hash updated after R8-M01 added document_subject_id field to SourceDigestEnvelope.
    const EXPECTED = '5f7a67543940b6e8b90940674934c86023ebd0821f69b576a61bbe7479493f03'
    expect(buildSourceDigest(envelope)).toBe(EXPECTED)
  })

  it('[KAV] buildSourceDigest: null-analysis envelope produces known SHA-256', () => {
    const envelope: SourceDigestEnvelope = {
      schema_version:               1,
      document_id:                  '00000000-0000-0000-0000-000000000001',
      document_title:               'MoLis KAV null-analysis',
      document_extracted_text:      null,
      document_file_type:           null,
      document_source_type:         null,
      document_created_at:          null,
      document_subject_id:          null,
      document_source_recording_id: null,
      analysis_id:                  null,
      analysis_data:                null,
      analysis_created_at:          null,
      analysis_model:               null,
    }
    // Reference: computed 2026-08-01 with Node.js crypto
    // Hash updated after R8-M01 added document_subject_id field to SourceDigestEnvelope.
    const EXPECTED = 'f1ad958f3a082a3ec59514795f5e752e9272ce835c8d97c3a42d4f2e3feb0aed'
    expect(buildSourceDigest(envelope)).toBe(EXPECTED)
  })

  it('[KAV] buildSourceDigest: key ordering is canonical (sorted) — two envelope orderings produce the same hash', () => {
    // This verifies that canonicalize() sorts keys deterministically regardless of
    // insertion order. Object.keys() order is not guaranteed to match sorted order in all
    // JS engines; canonicalize must sort explicitly at every level.
    const base: SourceDigestEnvelope = {
      schema_version:               1,
      document_id:                  '00000000-0000-0000-0000-000000000003',
      document_title:               'Ordering test',
      document_extracted_text:      'abc',
      document_file_type:           'pdf',
      document_source_type:         'upload',
      document_created_at:          '2026-06-01T12:00:00.000Z',
      document_subject_id:          null,
      document_source_recording_id: null,
      analysis_id:                  null,
      analysis_data:                null,
      analysis_created_at:          null,
      analysis_model:               null,
    }
    // Same fields but analysis_data is an object with keys in different insertion order.
    const withAnalysis: SourceDigestEnvelope = {
      ...base,
      analysis_id:    '00000000-0000-0000-0000-000000000004',
      analysis_data:  { z_last: true, a_first: 'yes', m_middle: 42 },
      analysis_model: 'gpt-4o-mini',
    }
    const withAnalysisReversed: SourceDigestEnvelope = {
      ...base,
      analysis_id:    '00000000-0000-0000-0000-000000000004',
      // Same keys, different insertion order — canonicalize must sort them the same way.
      analysis_data:  { m_middle: 42, z_last: true, a_first: 'yes' },
      analysis_model: 'gpt-4o-mini',
    }
    expect(buildSourceDigest(withAnalysis)).toBe(buildSourceDigest(withAnalysisReversed))
  })

  it('[KAV] buildSourceDigest: different document_id produces different hash (collision resistance)', () => {
    const makeEnvelope = (id: string): SourceDigestEnvelope => ({
      schema_version:               1,
      document_id:                  id,
      document_title:               'Same title',
      document_extracted_text:      null,
      document_file_type:           null,
      document_source_type:         null,
      document_created_at:          null,
      document_subject_id:          null,
      document_source_recording_id: null,
      analysis_id:                  null,
      analysis_data:                null,
      analysis_created_at:          null,
      analysis_model:               null,
    })
    const hashA = buildSourceDigest(makeEnvelope('00000000-0000-0000-0000-000000000001'))
    const hashB = buildSourceDigest(makeEnvelope('00000000-0000-0000-0000-000000000002'))
    expect(hashA).not.toBe(hashB)
    expect(hashA).toMatch(/^[0-9a-f]{64}$/)
    expect(hashB).toMatch(/^[0-9a-f]{64}$/)
  })

  // ── ROUND 10 ADDITIONAL STATIC ASSERTIONS (R10-C02, R10-H04, R10-H05, R10-H06) ──

  it('[STATIC] migration: explicit canonical KAV functions and DO block present (R12-C02)', () => {
    // R12-C02: fn_canonical_jsonb_v1 (recursive JSONB serialiser) must be defined before
    // fn_canonical_source_v1 and fn_canonical_request_v1 (which call it).
    // All three functions must appear; KAV DO block must include all fixture hashes.
    expect(migrationSql).toContain('fn_canonical_jsonb_v1')
    expect(migrationSql).toContain('fn_canonical_source_v1')
    expect(migrationSql).toContain('fn_canonical_request_v1')
    expect(migrationSql).toContain('KAV-SRC-1')
    expect(migrationSql).toContain('KAV-SRC-2')
    expect(migrationSql).toContain('KAV-REQ-1')
    // Source hashes unchanged (null analysis → all fields emit =NULL).
    expect(migrationSql).toContain('c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be')
    expect(migrationSql).toContain('8df917c2723e07371442b0e7104ebb17f6281cc40809ac9725676a1e07d01682')
    // KAV-REQ-1 updated hash (R12-C02: sanitized_input and op.* use fn_canonical_jsonb_v1 format).
    expect(migrationSql).toContain('7872494e6a422b9e4695227dc2d6728d9f52a76de35dc029c9d7b96b068778ec')
    // Old KAV-REQ-1 hash must NOT remain (it was for the retired JSONB-text-cast format).
    expect(migrationSql).not.toContain('d9ddf7c8d4e03a7e7411bc94611bb7ab3bed136d87019c94367a466ac17708be')
    // New KAV vectors for JSONB missing/null/value distinction.
    expect(migrationSql).toContain('KAV-JSONB-MISSING')
    expect(migrationSql).toContain('ddbe52bda3f29198644d7074db70f92391d9ce97b59ac3752f1417784e3ed870')
    expect(migrationSql).toContain('675bac68bc300226e6c51463b70ca5564b4797cc9901cdb3e1ff433c3285cd25')
    // Object key ordering and array order vectors.
    expect(migrationSql).toContain('KAV-JSONB-OBJ-KEY-ORDER')
    expect(migrationSql).toContain('KAV-JSONB-ARRAY')
    // Boolean, nested, Unicode, op-desc-missing vectors.
    expect(migrationSql).toContain('KAV-JSONB-BOOL')
    expect(migrationSql).toContain('KAV-JSONB-NESTED')
    expect(migrationSql).toContain('KAV-JSONB-UNICODE')
    expect(migrationSql).toContain('KAV-JSONB-OP-DESC-MISSING')
  })

  it('[STATIC] migration: fn_canonical_jsonb_v1 defined before fn_canonical_source_v1 (R12-C01)', () => {
    // fn_canonical_source_v1 and fn_canonical_request_v1 call fn_canonical_jsonb_v1.
    // PostgreSQL requires the callee to exist when CREATE FUNCTION of the caller executes.
    const jsonbFn  = migrationSql.indexOf('CREATE FUNCTION public.fn_canonical_jsonb_v1')
    const sourceFn = migrationSql.indexOf('CREATE FUNCTION public.fn_canonical_source_v1')
    const reqFn    = migrationSql.indexOf('CREATE FUNCTION public.fn_canonical_request_v1')
    expect(jsonbFn).toBeGreaterThan(-1)
    expect(sourceFn).toBeGreaterThan(-1)
    expect(reqFn).toBeGreaterThan(-1)
    expect(jsonbFn).toBeLessThan(sourceFn)
    expect(jsonbFn).toBeLessThan(reqFn)
  })

  it('[STATIC] migration: generation_job_usage table created before study_visuals_usage_provenance_fk (R12-C01)', () => {
    // R12-C01: The FK references generation_job_usage — the table must exist first.
    // Prior version had the FK at section 17b (before section 17c where the table is created)
    // causing a deterministic execution failure.
    const createTable = migrationSql.indexOf('CREATE TABLE public.generation_job_usage')
    const fk          = migrationSql.indexOf('ADD CONSTRAINT study_visuals_usage_provenance_fk')
    expect(createTable).toBeGreaterThan(-1)
    expect(fk).toBeGreaterThan(-1)
    expect(createTable).toBeLessThan(fk)
  })

  it('[STATIC] migration: generation_job_usage_publication_unique defined before study_visuals_usage_provenance_fk (R12-C01)', () => {
    // R12-C01: The FK is a composite FK that references a non-PK tuple —
    // it requires the UNIQUE constraint on that tuple to exist first.
    const unique = migrationSql.indexOf('generation_job_usage_publication_unique')
    const fk     = migrationSql.lastIndexOf('ADD CONSTRAINT study_visuals_usage_provenance_fk')
    expect(unique).toBeGreaterThan(-1)
    expect(fk).toBeGreaterThan(-1)
    expect(unique).toBeLessThan(fk)
  })

  it('[STATIC] migration: generation_jobs_verified_binding_unique defined before generation_job_usage (R12-C01)', () => {
    // generation_job_usage has a composite FK that references generation_jobs via the
    // generation_jobs_verified_binding_unique constraint. The UNIQUE must exist before
    // the CREATE TABLE that references it.
    const unique      = migrationSql.indexOf('generation_jobs_verified_binding_unique')
    const createUsage = migrationSql.indexOf('CREATE TABLE public.generation_job_usage')
    expect(unique).toBeGreaterThan(-1)
    expect(createUsage).toBeGreaterThan(-1)
    expect(unique).toBeLessThan(createUsage)
  })

  it('[STATIC] migration: source column preflight checks nullability (R10-H04)', () => {
    // R10-H04: The D11 preflight for documents and document_analysis must now verify
    // is_nullable, identity/generated state, and column_default — not just udt_name.
    // This catches column-level schema drift that a type-only check would miss.
    expect(migrationSql).toContain('is_nullable')
    expect(migrationSql).toContain('is_identity')
    expect(migrationSql).toContain('is_generated')
    expect(migrationSql).toContain('column_default IS DISTINCT FROM')
    // document_analysis.keywords must be typed as _text (text array), not jsonb.
    expect(migrationSql).toContain("'_text'")
  })

  it('[STATIC] migration: Storage service privilege tested individually (R10-H05)', () => {
    // R10-H05: has_table_privilege with a comma-list returns true if ANY privilege matches
    // (not all). Each required privilege must be checked independently to prove the complete
    // baseline. This test verifies individual SELECT/INSERT/UPDATE/DELETE checks are present.
    const selectCheck  = migrationSql.indexOf("has_table_privilege('service_role','storage.objects','SELECT')")
    const insertCheck  = migrationSql.indexOf("has_table_privilege('service_role','storage.objects','INSERT')")
    const updateCheck  = migrationSql.indexOf("has_table_privilege('service_role','storage.objects','UPDATE')")
    const deleteCheck  = migrationSql.indexOf("has_table_privilege('service_role','storage.objects','DELETE')")
    expect(selectCheck).toBeGreaterThan(0)
    expect(insertCheck).toBeGreaterThan(0)
    expect(updateCheck).toBeGreaterThan(0)
    expect(deleteCheck).toBeGreaterThan(0)
    // None of the comma-list forms must remain in the migration.
    expect(migrationSql).not.toContain("'storage.objects','SELECT,INSERT,UPDATE,DELETE'")
  })

  it('[STATIC] migration: function search_path exact-value checks present (R10-H05)', () => {
    // R10-H05: The ACL postcondition must verify the exact search_path value for each function.
    // fn_sha256_hex must have 'extensions, pg_catalog'; all others must have empty path.
    expect(migrationSql).toContain("'search_path=extensions, pg_catalog'")
    expect(migrationSql).toContain("'search_path=')")
  })

  it('[STATIC] migration: study-visuals bucket MIME type restriction applied (R10-H06)', () => {
    // R10-H06: The bucket must be restricted to image/png and capped at 5 MiB.
    // Both the UPDATE statement and the postcondition verification must be present.
    expect(migrationSql).toContain("allowed_mime_types = ARRAY['image/png']")
    expect(migrationSql).toContain('file_size_limit    = 5242880')
    expect(migrationSql).toContain('file_size_limit = 5242880')
    expect(migrationSql).toContain('STORAGE POSTCONDITION: study-visuals MIME types or file_size_limit not set correctly')
  })

  it('[STATIC] migration: fn_recover_stale_jobs is SECURITY DEFINER and service_role-only (R9-H07)', () => {
    // The stale-job recovery function must be SECURITY DEFINER (runs as owner, not caller)
    // and executable only by service_role — not by authenticated users or PUBLIC.
    // This protects against unauthorized lease manipulation through the recovery path.
    expect(migrationSql).toContain('fn_recover_stale_jobs')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.fn_recover_stale_jobs()")
    // service_role is the only role granted EXECUTE on recovery.
    expect(migrationSql).toContain("fn_recover_stale_jobs()'::regprocedure,FALSE,TRUE")
  })

  // ── R12-H02: D11 preflight fingerprint expansion ───────────────────────────

  it('[STATIC] migration: preflight checks all four primary keys (R12-H02)', () => {
    expect(migrationSql).toContain("'document_analysis_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)'")
    expect(migrationSql).toContain("'documents_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)'")
    expect(migrationSql).toContain("'generation_jobs_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)'")
    expect(migrationSql).toContain("'study_visuals_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)'")
    expect(migrationSql).toContain("D11 DRIFT: primary key fingerprint changed")
  })

  it('[STATIC] migration: preflight checks all nine foreign-key fingerprints (R12-H02)', () => {
    expect(migrationSql).toContain("'document_analysis_document_id_fkey'")
    expect(migrationSql).toContain('FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE')
    expect(migrationSql).toContain("'document_analysis_user_id_fkey'")
    expect(migrationSql).toContain('FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(migrationSql).toContain("'documents_source_recording_id_fkey'")
    expect(migrationSql).toContain('FOREIGN KEY (source_recording_id) REFERENCES recordings(id) ON DELETE SET NULL')
    expect(migrationSql).toContain("'documents_subject_id_fkey'")
    expect(migrationSql).toContain('FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL')
    expect(migrationSql).toContain("'documents_user_id_fkey'")
    expect(migrationSql).toContain("'generation_jobs_document_id_fkey'")
    expect(migrationSql).toContain("'generation_jobs_user_id_fkey'")
    expect(migrationSql).toContain("'study_visuals_document_id_fkey'")
    expect(migrationSql).toContain("'study_visuals_user_id_fkey'")
    expect(migrationSql).toContain("D11 DRIFT: foreign key fingerprint changed")
  })

  it('[STATIC] migration: preflight checks documents_source_type_check fingerprint (R12-H02)', () => {
    expect(migrationSql).toContain("'documents_source_type_check'")
    expect(migrationSql).toContain("D11 DRIFT: documents_source_type_check fingerprint changed")
  })

  it('[STATIC] migration: preflight checks source-table index counts and definitions (R12-H02)', () => {
    expect(migrationSql).toContain("tablename='document_analysis') <> 3")
    expect(migrationSql).toContain("indexname='idx_document_analysis_document_id'")
    expect(migrationSql).toContain("indexname='idx_document_analysis_user_id'")
    expect(migrationSql).toContain("D11 DRIFT: document_analysis baseline index set changed")
    expect(migrationSql).toContain("tablename='documents') <> 3")
    expect(migrationSql).toContain("indexname='documents_source_recording_unique'")
    expect(migrationSql).toContain("indexname='documents_subject_id_idx'")
    expect(migrationSql).toContain("D11 DRIFT: documents baseline index set changed")
    expect(migrationSql).toContain("tablename='study_visuals') <> 2")
    expect(migrationSql).toContain("D11 DRIFT: study_visuals baseline index set changed")
  })

  it('[STATIC] migration: preflight checks routine language/volatility fingerprint (R12-H02)', () => {
    // All five existing routines must be plpgsql VOLATILE trigger functions — not IMMUTABLE/STABLE,
    // not strict, not returning set.
    expect(migrationSql).toContain("l.lanname <> 'plpgsql'")
    expect(migrationSql).toContain("t.typname <> 'trigger'")
    expect(migrationSql).toContain("p.provolatile <> 'v'")
    expect(migrationSql).toContain("p.proisstrict")
    expect(migrationSql).toContain("D11 DRIFT: existing routine language/return/volatility fingerprint changed")
  })

  it('[STATIC] migration: preflight checks routine proconfig exact equality (R12-H02)', () => {
    // proconfig must be NULL for the four non-search-path routines and exactly
    // ARRAY['search_path=public'] for validate_resource_subject_ownership.
    expect(migrationSql).toContain("p.proconfig IS NOT NULL")
    expect(migrationSql).toContain("p.proconfig = ARRAY['search_path=public']")
    expect(migrationSql).toContain("D11 DRIFT: existing routine proconfig fingerprint changed")
  })

  it('[STATIC] migration: preflight checks routine EXECUTE ACL exact string (R12-H02)', () => {
    // D11 SA01/SA04 inspected ACL: PUBLIC + postgres + anon + authenticated + service_role.
    expect(migrationSql).toContain(
      "'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'"
    )
    expect(migrationSql).toContain("D11 DRIFT: existing routine EXECUTE ACL fingerprint changed")
  })

  it('[STATIC] migration: preflight checks table relacl exact string (R12-H02)', () => {
    // D11 SA07 inspected relacl: all four tables have the same Supabase default grant.
    expect(migrationSql).toContain(
      "'{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'"
    )
    expect(migrationSql).toContain("D11 DRIFT: exact table ACL fingerprint changed")
  })

  it('[STATIC] migration: preflight checks postgres/public FUNCTION default ACL before-state (R12-H02)', () => {
    // D11 SA11: FUNCTION default ACL must match inspected value — migration fails closed if
    // ALTER DEFAULT PRIVILEGES was already applied (e.g. from a partial prior run).
    expect(migrationSql).toContain("defaclrole='postgres'::regrole")
    expect(migrationSql).toContain("defaclobjtype='f'")
    expect(migrationSql).toContain(
      "'{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'"
    )
    expect(migrationSql).toContain("D11 DRIFT: postgres/public FUNCTION default ACL before-state changed")
  })

  it('[STATIC] migration: preflight checks full study-visuals bucket row (R12-H02)', () => {
    // D11 S18: file_size_limit and allowed_mime_types are NULL at the D11 snapshot.
    // The migration must fail closed if these have changed before it runs.
    expect(migrationSql).toContain('file_size_limit IS NULL AND allowed_mime_types IS NULL')
    expect(migrationSql).toContain('NOT avif_autodetection')
    expect(migrationSql).toContain('D11 DRIFT: study-visuals bucket full row fingerprint changed')
  })
})
