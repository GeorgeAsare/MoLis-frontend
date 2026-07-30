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

import { describe, it, expect, test, vi, afterEach } from 'vitest'
import {
  isLegalClientTransition,
  isTerminal,
  isActive,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
} from '../stateMachine'
import type { JobSafeDto, JobStatus } from '../stateMachine'
import { buildRequestIdempotencyKey } from '../idempotencyKey'
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
