// VALIDATION ONLY — never import from application code
// Deterministic concurrency helpers for Beta Foundation V1 disposable validation.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PgPool } from './dbClients'

export interface ConcurrentResult<T> {
  results:      PromiseSettledResult<T>[]
  successCount: number
  failureCount: number
}

// Runs N async operations concurrently and returns all settled results.
export async function runConcurrent<T>(
  operations: Array<() => Promise<T>>,
): Promise<ConcurrentResult<T>> {
  const results = await Promise.allSettled(operations.map(op => op()))
  return {
    results,
    successCount: results.filter(r => r.status === 'fulfilled').length,
    failureCount: results.filter(r => r.status === 'rejected').length,
  }
}

// Barrier: waits for all N workers to arrive before any proceeds.
// Maximizes true concurrency in race condition tests.
export function makeBarrier(count: number): {
  arrive:  () => Promise<void>
  waitAll: () => Promise<void>
} {
  let arrived = 0
  const resolvers: Array<() => void> = []
  const arrivals: Promise<void>[] = []

  for (let i = 0; i < count; i++) {
    arrivals.push(new Promise<void>(resolve => { resolvers[i] = resolve }))
  }

  return {
    arrive: async () => {
      const myIndex = arrived++
      resolvers[myIndex]?.()
      await Promise.all(arrivals)
    },
    waitAll: () => Promise.all(arrivals).then(() => undefined),
  }
}

// Concurrency scenario descriptors — executed when disposable DB is available.
export type ConcurrencyScenario =
  | 'same_user_same_key_same_intent'
  | 'same_key_conflicting_intent'
  | 'different_keys_same_active_scope'
  | 'same_bare_uuid_different_users'
  | 'concurrent_claim'
  | 'cancel_vs_heartbeat'
  | 'cancel_vs_completion'
  | 'stale_worker_vs_current_lease'
  | 'publication_constraint_rollback'
  | 'stale_recovery_within_budget'
  | 'stale_recovery_past_max_attempts'
  | 'terminal_idempotent_retry'
  | 'new_key_after_terminal'

export const ALL_CONCURRENCY_SCENARIOS: ConcurrencyScenario[] = [
  'same_user_same_key_same_intent',
  'same_key_conflicting_intent',
  'different_keys_same_active_scope',
  'same_bare_uuid_different_users',
  'concurrent_claim',
  'cancel_vs_heartbeat',
  'cancel_vs_completion',
  'stale_worker_vs_current_lease',
  'publication_constraint_rollback',
  'stale_recovery_within_budget',
  'stale_recovery_past_max_attempts',
  'terminal_idempotent_retry',
  'new_key_after_terminal',
]

// Seed a stale job via the state-machine path (verified provenance).
//
// Why not direct INSERT?
//   The corrective migration revokes service_role from generation_jobs and removes the
//   legacy_unverified classification. Direct INSERTs bypass the state machine (fn_enqueue_job,
//   fn_claim_job), producing rows with incorrect provenance, missing idempotency keys, and
//   classification values that are no longer valid under the corrected schema.
//
// Process:
//   1. fn_enqueue_job via userClient  → row with correct classification and idempotency key
//   2. fn_claim_job via serviceClient → row transitions processing, worker_id and lease set,
//                                       attempt_count becomes 1
//   3. (optional) fn_request_job_cancel via userClient → processing → cancel_requested
//   4. pg pool UPDATE:
//        lease_expires_at = supplied date (to simulate stale elapsed time)
//        max_attempts     = supplied value (default 3)
//
// Parameters:
//   pool          — privileged direct pg connection (postgres superuser, bypasses REVOKE)
//   serviceClient — service-role Supabase client (for fn_claim_job)
//   userClient    — authenticated user Supabase client (for fn_enqueue_job, fn_request_job_cancel)
//
export async function seedStaleJob(
  pool:          PgPool,
  serviceClient: SupabaseClient,
  userClient:    SupabaseClient,
  opts: {
    userId:         string
    documentId:     string
    jobType?:       string
    workerId?:      string
    leaseExpiresAt?: Date
    status?:        'processing' | 'cancel_requested'
    maxAttempts?:   number
  },
): Promise<string> {
  const {
    userId,
    documentId,
    jobType       = 'visuals',
    workerId      = 'stale-test-worker',
    leaseExpiresAt = new Date(Date.now() - 2 * 60 * 1000),
    status        = 'processing',
    maxAttempts   = 3,
  } = opts

  // Step 1: enqueue via authenticated user
  const { data: enqueueData, error: enqueueErr } = await userClient.rpc('fn_enqueue_job', {
    p_user_id:     userId,
    p_document_id: documentId,
    p_job_type:    jobType,
  })
  if (enqueueErr || !enqueueData) {
    throw new Error(`seedStaleJob: fn_enqueue_job failed: ${enqueueErr?.message ?? 'no data'}`)
  }
  const jobId = (enqueueData as { job_id: string }).job_id

  // Step 2: claim via service actor (transitions to processing, sets attempt_count=1)
  const { error: claimErr } = await serviceClient.rpc('fn_claim_job', {
    p_job_id:    jobId,
    p_worker_id: workerId,
  })
  if (claimErr) {
    throw new Error(`seedStaleJob: fn_claim_job failed: ${claimErr.message}`)
  }

  // Step 3 (optional): request cancel to simulate cancel_requested state
  if (status === 'cancel_requested') {
    const { error: cancelErr } = await userClient.rpc('fn_request_job_cancel', { p_job_id: jobId })
    if (cancelErr) {
      throw new Error(`seedStaleJob: fn_request_job_cancel failed: ${cancelErr.message}`)
    }
  }

  // Step 4: mutate timing fields and max_attempts via privileged pg connection
  await pool.query(
    `UPDATE public.generation_jobs
        SET lease_expires_at = $2,
            max_attempts     = $3
      WHERE id = $1`,
    [jobId, leaseExpiresAt.toISOString(), maxAttempts],
  )

  return jobId
}
