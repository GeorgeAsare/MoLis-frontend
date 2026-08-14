/**
 * Recovery semantic tests for the visuals job route — Group A (no database).
 *
 * These tests prove the route worker's recovery-boundary behaviors:
 *   - Provider/upload failure transitions to failJob with classified error code
 *   - Publication failure (completeAndPublishJob throws) transitions to failJob
 *   - Claim not won → early return, no staging, no failJob
 *   - Aborted state prevents failJob (authority loss is stale-recovery's concern)
 *   - Heartbeat bounded-retry exhaustion stops the controller
 *   - Heartbeat authority-loss stops immediately without counting toward retry
 *   - Heartbeat cancel calls acknowledgeCancel before stopping
 *
 * Group B database/integration tests are not approved and remain skipped.
 *
 * The review finding (R11-H05) noted:
 *   "No semantic route test proves provider, upload or publication failure transitions,
 *    retry exhaustion, stale lease rejection or unexpected internal failure wiring."
 * This file closes those gaps using two complementary approaches:
 *
 *   1. Route-level tests: mock next/server.after to capture and invoke the after()
 *      callback, then verify failJob/early-return behaviors.
 *
 *   2. Heartbeat controller simulation: a local function that mirrors the production
 *      route's heartbeat retry logic with bounded counting, proving the three stop
 *      conditions without requiring fake timers or Next.js imports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── server-only mock ─────────────────────────────────────────────────────────
vi.mock('server-only', () => ({}))

// ── Capture next/server.after callback ───────────────────────────────────────
let capturedAfterCallback: (() => Promise<void>) | null = null

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200 }),
    ),
  },
  after: vi.fn((cb: () => Promise<void>) => {
    capturedAfterCallback = cb
  }),
}))

// ── Hoisted mock references ──────────────────────────────────────────────────
const {
  mockClaimJob,
  mockHeartbeatJob,
  mockAcknowledgeCancel,
  mockStageVisuals,
  mockCompleteAndPublishJob,
  mockFailJob,
  mockEnqueueJob,
} = vi.hoisted(() => ({
  mockClaimJob:              vi.fn(),
  mockHeartbeatJob:          vi.fn(),
  mockAcknowledgeCancel:     vi.fn(),
  mockStageVisuals:          vi.fn(),
  mockCompleteAndPublishJob: vi.fn(),
  mockFailJob:               vi.fn(),
  mockEnqueueJob:            vi.fn(),
}))

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/jobs/workerClient', () => ({
  claimJob:              mockClaimJob,
  heartbeatJob:          mockHeartbeatJob,
  acknowledgeCancel:     mockAcknowledgeCancel,
  completeAndPublishJob: mockCompleteAndPublishJob,
  failJob:               mockFailJob,
}))

vi.mock('@/lib/jobs/visualsWorker', () => ({
  stageVisualsForJob: mockStageVisuals,
}))

vi.mock('@/app/actions/generationJobs', () => ({
  enqueueJob: mockEnqueueJob,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-test-1' } } })),
    },
  })),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/jobs/enqueueErrors', () => ({
  ENQUEUE_RETRY_REQUIRED: 'ENQUEUE_RETRY_REQUIRED',
}))

// Use real classifyError so error codes are correctly derived from message text.
// vi.unmock is not needed — errorClassifier has no problematic dependencies.

// ── Import the route AFTER all mocks ────────────────────────────────────────
import { POST } from '../../../app/api/jobs/visuals/route'

// ── Test fixtures ────────────────────────────────────────────────────────────
const JOB_ID      = '00000000-0000-0000-0000-aaa000000001'
const REQUEST_KEY = 'req-key-test-1'
const DOC_ID      = '00000000-0000-0000-0000-bbb000000001'
const LEASE_TOKEN = 'lease-tok-test'

function makeRequest(documentId = DOC_ID): Request {
  return new Request('http://localhost/api/jobs/visuals', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ documentId }),
  })
}

// ── Route-level recovery tests ───────────────────────────────────────────────

describe('visualsRoute — provider and publication failure transitions (Group A)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedAfterCallback = null

    // Enqueue always succeeds by default
    mockEnqueueJob.mockResolvedValue({
      job_id:      JOB_ID,
      requestKey:  REQUEST_KEY,
      is_existing: false,
    })

    // Claim always succeeds by default
    mockClaimJob.mockResolvedValue({
      outcome:      'claimed',
      leaseToken:   LEASE_TOKEN,
      stateVersion: 1,
      attemptCount: 1,
    })

    // Heartbeat always renews by default (no heartbeat fires in these tests because
    // stage/complete mocks resolve synchronously before the 30s interval fires)
    mockHeartbeatJob.mockResolvedValue({ renewed: true })

    // stage, complete, fail — test-specific setup per test
    mockCompleteAndPublishJob.mockResolvedValue({
      outcome: 'completed', finalStatus: 'completed', visualCount: 0,
    })
    mockFailJob.mockResolvedValue({ outcome: 'failed', finalStatus: 'failed' })
    mockAcknowledgeCancel.mockResolvedValue({ outcome: 'cancelled', finalStatus: 'cancelled' })
  })

  it('stageVisualsForJob failure routes to failJob with classified error code', async () => {
    mockStageVisuals.mockRejectedValue(
      new Error('rate limit exceeded — try again later'),
    )

    await POST(makeRequest())
    expect(capturedAfterCallback).toBeTruthy()
    await capturedAfterCallback!()

    expect(mockFailJob).toHaveBeenCalledOnce()
    const [, , , , errorCode] = mockFailJob.mock.calls[0]
    expect(errorCode).toBe('JOB_PROVIDER_RATE_LIMITED')
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
  })

  it('stageVisualsForJob timeout routes to JOB_TIMEOUT error code', async () => {
    mockStageVisuals.mockRejectedValue(
      new Error('Request timed out after 60 seconds'),
    )

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockFailJob).toHaveBeenCalledOnce()
    const [, , , , errorCode] = mockFailJob.mock.calls[0]
    expect(errorCode).toBe('JOB_TIMEOUT')
  })

  it('unexpected internal stageVisualsForJob error routes to JOB_INTERNAL_ERROR', async () => {
    mockStageVisuals.mockRejectedValue(new Error('Unexpected descriptor shape'))

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockFailJob).toHaveBeenCalledOnce()
    const [, , , , errorCode] = mockFailJob.mock.calls[0]
    expect(errorCode).toBe('JOB_INTERNAL_ERROR')
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
  })

  it('failJob receives a support reference and message key (not raw error text)', async () => {
    mockStageVisuals.mockRejectedValue(new Error('network connection refused'))

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockFailJob).toHaveBeenCalledOnce()
    const [jobId, , , , , messageKey, supportRef] = mockFailJob.mock.calls[0]
    // jobId must be the actual job ID (not a placeholder)
    expect(jobId).toBe(JOB_ID)
    // messageKey is an i18n key (dot-notation string), not raw error text
    expect(messageKey).toMatch(/^errors\.job\./)
    // supportRef follows the SR-<bucket>-<rand> format
    expect(supportRef).toMatch(/^SR-[A-Z0-9]+-[A-Z0-9]+$/)
    // No raw error text in any of the fail arguments
    const allArgs = mockFailJob.mock.calls[0].map(String).join(' ')
    expect(allArgs).not.toContain('connection refused')
  })

  it('completeAndPublishJob throw routes to failJob (publication failure transition)', async () => {
    mockStageVisuals.mockResolvedValue({
      items: [], model: 'gpt-4o-mini+gpt-image-2', resultCode: 'NO_VISUAL_TOPICS',
    })
    mockCompleteAndPublishJob.mockRejectedValue(new Error('COMPLETE_AND_PUBLISH_FAILED'))

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockFailJob).toHaveBeenCalledOnce()
    // Stage was attempted
    expect(mockStageVisuals).toHaveBeenCalledOnce()
  })

  it('claim not won → stageVisualsForJob never called, failJob never called', async () => {
    mockClaimJob.mockResolvedValue({
      outcome: 'lost_race', leaseToken: null, stateVersion: null, attemptCount: null,
    })

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockStageVisuals).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
  })

  it('claim max_attempts_exceeded → no staging, no failJob', async () => {
    mockClaimJob.mockResolvedValue({
      outcome: 'max_attempts_exceeded', leaseToken: null, stateVersion: null, attemptCount: null,
    })

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockStageVisuals).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })
})

// ── R14-H05: Heartbeat production interval tests (fake timers) ───────────────
//
// These tests drive the CAPTURED production after() callback with vi.useFakeTimers()
// so that the real setInterval heartbeat callback from route.ts is exercised.
// stageVisualsForJob is held open with a deferred promise that responds to the
// AbortController signal, matching the production signal-passing contract.
//
// The simulateHeartbeatController copy that was here previously has been removed.
// All heartbeat stop conditions are now proved through the production code path.

describe('visualsRoute — heartbeat production interval (fake timers, Group A)', () => {
  const HEARTBEAT_INTERVAL_MS = 30_000  // matches route.ts
  const HEARTBEAT_MAX_RETRIES = 3       // matches route.ts

  let resolveStage!: (v: { items: unknown[]; model: string; resultCode: string }) => void
  let rejectStage!:  (e: Error) => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    capturedAfterCallback = null

    mockEnqueueJob.mockResolvedValue({ job_id: JOB_ID, requestKey: REQUEST_KEY, is_existing: false })
    mockClaimJob.mockResolvedValue({ outcome: 'claimed', leaseToken: LEASE_TOKEN, stateVersion: 1, attemptCount: 1 })
    mockHeartbeatJob.mockResolvedValue({ renewed: true })
    mockCompleteAndPublishJob.mockResolvedValue({ outcome: 'completed', finalStatus: 'completed', visualCount: 1 })
    mockFailJob.mockResolvedValue({ outcome: 'failed', finalStatus: 'failed' })
    mockAcknowledgeCancel.mockResolvedValue({ outcome: 'cancelled', finalStatus: 'cancelled' })

    // stageVisualsForJob hangs on a deferred promise and aborts cleanly when signal fires.
    // This allows heartbeat intervals to fire before stage completes.
    const deferred = new Promise<{ items: unknown[]; model: string; resultCode: string }>((res, rej) => {
      resolveStage = res
      rejectStage  = rej
    })
    mockStageVisuals.mockImplementation(
      (_id: string, _wid: string, _lease: string, _ver: number, signal: AbortSignal) => {
        signal.addEventListener('abort', () => {
          rejectStage(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        })
        return deferred
      },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Helper: flush microtasks without advancing timers
  async function flushMicrotasks() {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }

  it('heartbeat renews: called at each interval, retryCount stays zero, completes cleanly', async () => {
    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()  // claim resolves, setInterval created, stage starts

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + 1)
    expect(mockHeartbeatJob).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(mockHeartbeatJob).toHaveBeenCalledTimes(2)

    // Stage resolves — route clears interval and publishes
    resolveStage({ items: [], model: 'gpt-4o-mini+gpt-image-2', resultCode: 'NO_VISUAL_TOPICS' })
    await afterPromise

    expect(mockCompleteAndPublishJob).toHaveBeenCalledOnce()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('authority_lost: heartbeat aborts controller, stage sees AbortError, no publish or fail', async () => {
    mockHeartbeatJob.mockResolvedValue({ renewed: false, refusalReason: 'authority_lost' })

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    // Fire first interval: heartbeat fires, sets aborted=true, aborts controller
    // stage promise rejects with AbortError (via signal listener), route returns
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + 1)
    await afterPromise

    expect(mockHeartbeatJob).toHaveBeenCalledTimes(1)
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('job_not_processing stops immediately: treated as authority_lost, no publish or fail', async () => {
    mockHeartbeatJob.mockResolvedValue({ renewed: false, refusalReason: 'job_not_processing' })

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + 1)
    await afterPromise

    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('cancel_requested: acknowledgeCancel called, controller aborts, no publish or fail', async () => {
    mockHeartbeatJob.mockResolvedValue({ renewed: false, refusalReason: 'cancel_requested' })

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + 1)
    await afterPromise

    expect(mockAcknowledgeCancel).toHaveBeenCalledOnce()
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('thrown heartbeat counts as transient: 3 consecutive throws exhaust HEARTBEAT_MAX_RETRIES', async () => {
    mockHeartbeatJob.mockRejectedValue(new Error('RPC codec failure'))

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    // Each throw increments retryCount (no retry delay in the catch branch).
    // 3 throws across 3 interval fires = HEARTBEAT_MAX_RETRIES exhausted.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * HEARTBEAT_MAX_RETRIES + 1)
    await afterPromise

    expect(mockHeartbeatJob).toHaveBeenCalledTimes(HEARTBEAT_MAX_RETRIES)
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('successful renewal resets retry counter: 2 throws → renewal → 3 more throws → exhausted', async () => {
    let callCount = 0
    mockHeartbeatJob.mockImplementation(async () => {
      callCount++
      if (callCount <= 2) throw new Error('transient')
      if (callCount === 3) return { renewed: true }  // renewal resets retryCount to 0
      throw new Error('transient again')
    })

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    // 2 throws + 1 renewal + 3 throws = 6 interval fires needed
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 6 + 1)
    await afterPromise

    expect(callCount).toBe(6)
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('in-flight overlap guard: second interval skipped while first heartbeat is still resolving', async () => {
    let resolveFirstHeartbeat!: (v: unknown) => void
    const hangingHeartbeat = new Promise(r => { resolveFirstHeartbeat = r })
    mockHeartbeatJob
      .mockReturnValueOnce(hangingHeartbeat)       // first call hangs
      .mockResolvedValue({ renewed: true })         // subsequent calls resolve immediately

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    // Fire first interval: heartbeat starts, in-flight guard set
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + 1)
    expect(mockHeartbeatJob).toHaveBeenCalledTimes(1)

    // Fire second interval: in-flight guard blocks it (heartbeat still awaiting)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(mockHeartbeatJob).toHaveBeenCalledTimes(1)  // still 1

    // Resolve the first heartbeat: in-flight guard resets
    resolveFirstHeartbeat({ renewed: true })
    await flushMicrotasks()

    // Resolve stage and verify clean completion
    resolveStage({ items: [], model: 'gpt-4o-mini+gpt-image-2', resultCode: 'NO_VISUAL_TOPICS' })
    await afterPromise

    expect(mockCompleteAndPublishJob).toHaveBeenCalledOnce()
  })

  it('transient_failure refusal: 3 bounded retries with 5 s delay each, then abort (no publish or fail)', async () => {
    const HEARTBEAT_RETRY_DELAY_MS = 5_000  // mirrors route.ts HEARTBEAT_RETRY_DELAY_MS
    mockHeartbeatJob.mockResolvedValue({ renewed: false, refusalReason: 'transient_failure' })

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    // Each transient_failure increments retryCount and runs a 5 s delay inside the callback.
    // Intervals fire at t=30s, 60s, 90s; each has a 5 s inner sleep.
    // On the 3rd retry (t=90s), retryCount reaches HEARTBEAT_MAX_RETRIES → abort fires.
    await vi.advanceTimersByTimeAsync(
      HEARTBEAT_INTERVAL_MS * HEARTBEAT_MAX_RETRIES +
      HEARTBEAT_RETRY_DELAY_MS * HEARTBEAT_MAX_RETRIES + 1
    )
    await afterPromise

    expect(mockHeartbeatJob).toHaveBeenCalledTimes(HEARTBEAT_MAX_RETRIES)
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('terminal refusal: aborts immediately on first heartbeat, no publish or fail', async () => {
    mockHeartbeatJob.mockResolvedValue({ renewed: false, refusalReason: 'terminal' })

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + 1)
    await afterPromise

    expect(mockHeartbeatJob).toHaveBeenCalledTimes(1)
    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('attempt supersession: authority_lost prevents publication even if staging completes after abort', async () => {
    // Supersession: a newer worker attempt owns the job; heartbeat returns authority_lost.
    // Stage mock does NOT reject on abort so it can resolve after the abort fires.
    // Route must check if (aborted) and return without calling completeAndPublishJob.
    mockHeartbeatJob.mockResolvedValue({ renewed: false, refusalReason: 'authority_lost' })

    let resolveSupersededStage!: (v: { items: unknown[]; model: string; resultCode: string }) => void
    const supersededDeferred = new Promise<{ items: unknown[]; model: string; resultCode: string }>(
      res => { resolveSupersededStage = res },
    )
    mockStageVisuals.mockReturnValue(supersededDeferred)

    await POST(makeRequest())
    const afterPromise = capturedAfterCallback!()
    await flushMicrotasks()

    // Authority lost at first interval — abort fires but stage deferred is still pending.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS + 1)

    // Resolve stage AFTER abort — old attempt must not publish.
    resolveSupersededStage({ items: [], model: 'gpt-4o-mini+gpt-image-2', resultCode: 'NO_VISUAL_TOPICS' })
    await afterPromise

    expect(mockCompleteAndPublishJob).not.toHaveBeenCalled()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('stale authority: stage resolves before first heartbeat interval, no heartbeat fires', async () => {
    // Stage completes synchronously (from the test's perspective) — the route clears
    // the interval before 30s elapses, so heartbeatJob is never called.
    vi.useRealTimers()  // real timers: stage resolves, no fake interval ever fires
    vi.clearAllMocks()
    capturedAfterCallback = null

    mockEnqueueJob.mockResolvedValue({ job_id: JOB_ID, requestKey: REQUEST_KEY, is_existing: false })
    mockClaimJob.mockResolvedValue({ outcome: 'claimed', leaseToken: LEASE_TOKEN, stateVersion: 1, attemptCount: 1 })
    mockHeartbeatJob.mockResolvedValue({ renewed: true })
    mockCompleteAndPublishJob.mockResolvedValue({ outcome: 'completed', finalStatus: 'completed', visualCount: 0 })
    mockFailJob.mockResolvedValue({ outcome: 'failed', finalStatus: 'failed' })
    mockStageVisuals.mockResolvedValue({ items: [], model: 'gpt-4o-mini+gpt-image-2', resultCode: 'NO_VISUAL_TOPICS' })

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockCompleteAndPublishJob).toHaveBeenCalledOnce()
    expect(mockFailJob).not.toHaveBeenCalled()
    expect(mockHeartbeatJob).not.toHaveBeenCalled()

    vi.useFakeTimers()  // restore for afterEach
  })
})

// ── R14-H05: Full manifest publication contract and publication failure ───────

describe('visualsRoute — manifest contract and publication failure (Group A)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedAfterCallback = null

    mockEnqueueJob.mockResolvedValue({ job_id: JOB_ID, requestKey: REQUEST_KEY, is_existing: false })
    mockClaimJob.mockResolvedValue({ outcome: 'claimed', leaseToken: LEASE_TOKEN, stateVersion: 1, attemptCount: 1 })
    mockHeartbeatJob.mockResolvedValue({ renewed: true })
    mockCompleteAndPublishJob.mockResolvedValue({ outcome: 'completed', finalStatus: 'completed', visualCount: 1 })
    mockFailJob.mockResolvedValue({ outcome: 'failed', finalStatus: 'failed' })
    mockAcknowledgeCancel.mockResolvedValue({ outcome: 'cancelled', finalStatus: 'cancelled' })
  })

  it('full manifest contract: ALL items (generated and failed) passed to completeAndPublishJob', async () => {
    // Production passes staged.items in full — SQL decides which to record.
    // The previous "only generated items" assertion was wrong.
    const item1 = { id: 'v1', status: 'generated', storage_path: 'u/d/j/1/v1.png', image_url: null,
      mime_type: 'image/png', error: null, failure_stage: null,
      topic: 'T1', description: 'D1', visual_type: 'diagram', image_prompt: 'P1' }
    const item2 = { id: 'v2', status: 'failed', storage_path: null, image_url: null,
      mime_type: null, error: 'STORAGE_UPLOAD_FAILED', failure_stage: 'storage_upload',
      topic: 'T2', description: 'D2', visual_type: 'diagram', image_prompt: 'P2' }

    mockStageVisuals.mockResolvedValue({
      items: [item1, item2],
      model: 'gpt-4o-mini+gpt-image-2',
      resultCode: 'PARTIAL',
    })

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockCompleteAndPublishJob).toHaveBeenCalledOnce()
    const [jobIdArg, , leaseArg, versionArg, itemsArg, modelArg, resultCodeArg] =
      mockCompleteAndPublishJob.mock.calls[0]

    expect(jobIdArg).toBe(JOB_ID)
    expect(leaseArg).toBe(LEASE_TOKEN)
    expect(versionArg).toBe(1)
    // Both items are passed — production intent: SQL validates and records both
    expect(itemsArg).toHaveLength(2)
    expect(itemsArg[0].id).toBe('v1')
    expect(itemsArg[0].status).toBe('generated')
    expect(itemsArg[1].id).toBe('v2')
    expect(itemsArg[1].status).toBe('failed')
    expect(modelArg).toBe('gpt-4o-mini+gpt-image-2')
    expect(resultCodeArg).toBe('PARTIAL')
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('publication failure fallback: completeAndPublishJob throw routes to failJob', async () => {
    mockStageVisuals.mockResolvedValue({
      items: [], model: 'gpt-4o-mini+gpt-image-2', resultCode: 'NO_VISUAL_TOPICS',
    })
    mockCompleteAndPublishJob.mockRejectedValue(new Error('COMPLETE_AND_PUBLISH_FAILED'))

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockStageVisuals).toHaveBeenCalledOnce()
    expect(mockFailJob).toHaveBeenCalledOnce()
    const [jobIdArg, , , , errorCode] = mockFailJob.mock.calls[0]
    expect(jobIdArg).toBe(JOB_ID)
    // Error code comes from classifyError — generic internal error for unknown throw
    expect(typeof errorCode).toBe('string')
    expect(errorCode.length).toBeGreaterThan(0)
  })

  it('stale CAS refusal: wrong_token outcome logs not_published and does NOT call failJob', async () => {
    // completeAndPublishJob resolves with wrong_token (worker_id/lease_token mismatch).
    // Route logs job.visuals.not_published and returns — no failJob call.
    mockStageVisuals.mockResolvedValue({
      items: [], model: 'gpt-4o-mini+gpt-image-2', resultCode: 'NO_VISUAL_TOPICS',
    })
    mockCompleteAndPublishJob.mockResolvedValue({ outcome: 'wrong_token', finalStatus: null, visualCount: 0 })

    await POST(makeRequest())
    await capturedAfterCallback!()

    expect(mockCompleteAndPublishJob).toHaveBeenCalledOnce()
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('failJob throws: callback rejects and the row stays processing (lease-recovery handles it)', async () => {
    // Stage fails → route tries failJob → failJob throws.
    // The after() callback rejects. The row remains processing until lease expiry,
    // at which point the durable stale-recovery actor (gated by D3) will pick it up.
    // No local recovery is attempted here; that actor is not represented in these tests.
    mockStageVisuals.mockRejectedValue(new Error('generation error'))
    mockFailJob.mockRejectedValue(new Error('FAIL_FAILED'))

    await POST(makeRequest())

    await expect(capturedAfterCallback!()).rejects.toThrow()
    expect(mockFailJob).toHaveBeenCalledOnce()
  })
})
