/**
 * RLS two-user isolation test for generation_jobs.
 *
 * STATUS: WRITTEN BUT NOT EXECUTED.
 *
 * This test requires:
 *   1. A Supabase test environment (local or staging) with the anon key and URL configured.
 *   2. Two real test user accounts seeded in auth.users.
 *   3. migration 20260729120001 applied in the target environment.
 *   4. A seed job owned by User B already present in the DB (or set up in beforeAll).
 *   5. The playwright test environment variables set (see below).
 *
 * Required env vars for execution:
 *   E2E_SUPABASE_URL        — test environment project URL
 *   E2E_SUPABASE_ANON_KEY   — anon key (NOT the service role key)
 *   E2E_USER_A_EMAIL        — email for user A
 *   E2E_USER_A_PASSWORD     — password for user A
 *   E2E_USER_B_EMAIL        — email for user B
 *   E2E_USER_B_PASSWORD     — password for user B
 *   E2E_USER_B_JOB_ID       — a known job ID owned by User B (seed before running)
 *
 * This test must NEVER use the service role key. The anon key with user JWT
 * tokens is the only credential permitted here. The service role key must not
 * appear in test files, committed files, or public environment variables.
 *
 * After migration 20260729120001:
 *   - REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM PUBLIC, authenticated, anon
 *   - generation_jobs_owner_view is DROPPED (no view-based access exists)
 *   - Clients read jobs ONLY via fn_get_job_safe_dto and fn_get_active_job_for_document RPCs
 *   - Ownership isolation is enforced inside those SECURITY DEFINER functions via auth.uid()
 *
 * George's approval is required before executing this test against any
 * environment that contains real user data.
 */

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.E2E_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY ?? ''

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function signIn(email: string, password: string) {
  const client = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message}`)
  return client
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RLS: generation_jobs cross-user isolation', () => {
  test.skip(!supabaseUrl || !supabaseAnonKey, 'E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY must be set')

  // Hard credential failure: if E2E vars are set but required credentials are wrong/empty,
  // fail loudly rather than producing silent test skips that mask misconfiguration.
  test.beforeAll(async () => {
    if (!supabaseUrl || !supabaseAnonKey) return
    const userAEmail    = process.env.E2E_USER_A_EMAIL    ?? ''
    const userAPassword = process.env.E2E_USER_A_PASSWORD ?? ''
    if (!userAEmail || !userAPassword) {
      throw new Error(
        'E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY are set, but ' +
        'E2E_USER_A_EMAIL or E2E_USER_A_PASSWORD are missing. ' +
        'Set all required env vars or unset E2E_SUPABASE_URL to skip this suite.',
      )
    }
  })

  // ── Base table access revoked ─────────────────────────────────────────────

  test('Authenticated user cannot SELECT from base generation_jobs table (all privileges revoked)', async () => {
    /**
     * After migration 20260729120001: REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs
     * FROM PUBLIC, authenticated, anon.
     *
     * Even a user reading their own rows via the base table must receive a permission error.
     * All access must go through fn_get_job_safe_dto or fn_get_active_job_for_document RPCs.
     */
    const userAEmail = process.env.E2E_USER_A_EMAIL ?? ''
    const userAPassword = process.env.E2E_USER_A_PASSWORD ?? ''
    test.skip(!userAEmail, 'E2E user A credentials must be set')

    const clientA = await signIn(userAEmail, userAPassword)
    const { data: userData } = await clientA.auth.getUser()
    const userAId = userData.user?.id
    expect(userAId).toBeTruthy()

    // Direct SELECT on the base table must fail — no SELECT privilege on generation_jobs
    const { data, error } = await clientA
      .from('generation_jobs')
      .select('id, user_id')
      .eq('user_id', userAId!)
      .limit(1)

    // PostgREST returns error 403 / Postgres code 42501 when relation permission is denied.
    expect(error).not.toBeNull()
    expect(error?.code).toMatch(/42501|403/)
    expect(data).toBeNull()
  })

  test('User A cannot INSERT directly into generation_jobs (INSERT revoked)', async () => {
    const userAEmail = process.env.E2E_USER_A_EMAIL ?? ''
    const userAPassword = process.env.E2E_USER_A_PASSWORD ?? ''
    test.skip(!userAEmail, 'E2E user A credentials must be set')

    const clientA = await signIn(userAEmail, userAPassword)
    const { data: userData } = await clientA.auth.getUser()
    const userId = userData.user?.id
    expect(userId).toBeTruthy()

    // After migration 20260729120001, INSERT is revoked from authenticated.
    // Direct insert must fail — jobs are created only via fn_enqueue_job RPC.
    const { error } = await clientA
      .from('generation_jobs')
      .insert({
        user_id: userId,
        document_id: null,
        job_type: 'visuals',
        status: 'queued',
      })

    expect(error).not.toBeNull()
    expect(error?.code).toMatch(/42501|403/)
  })

  test('User A cannot directly DELETE a job (DELETE revoked)', async () => {
    const userAEmail = process.env.E2E_USER_A_EMAIL ?? ''
    const userAPassword = process.env.E2E_USER_A_PASSWORD ?? ''
    test.skip(!userAEmail, 'E2E user A credentials must be set')

    const clientA = await signIn(userAEmail, userAPassword)
    const { data: userData } = await clientA.auth.getUser()

    // Attempt to delete all jobs for user A — must fail (DELETE revoked from authenticated)
    const { error } = await clientA
      .from('generation_jobs')
      .delete()
      .eq('user_id', userData.user?.id ?? '')

    expect(error).not.toBeNull()
    expect(error?.code).toMatch(/42501|403/)
  })

  // ── RPC-level cross-user isolation ────────────────────────────────────────

  test('User A cannot read User B job via fn_get_job_safe_dto (ownership isolation)', async () => {
    /**
     * Validates that fn_get_job_safe_dto enforces auth.uid() ownership:
     * User A calling the RPC with User B's job_id must receive null (not the row).
     *
     * This replaces the dropped generation_jobs_owner_view isolation test.
     * The view was dropped by migration 20260729120001; ownership isolation is
     * now exclusively enforced inside the SECURITY DEFINER function via auth.uid().
     *
     * Requires: E2E_USER_B_JOB_ID set to a job_id owned by User B.
     */
    const userAEmail = process.env.E2E_USER_A_EMAIL ?? ''
    const userAPassword = process.env.E2E_USER_A_PASSWORD ?? ''
    const userBJobId = process.env.E2E_USER_B_JOB_ID ?? ''

    test.skip(!userAEmail || !userBJobId, 'E2E user A credentials and E2E_USER_B_JOB_ID must be set')

    const clientA = await signIn(userAEmail, userAPassword)

    // User A calls fn_get_job_safe_dto with a job_id owned by User B.
    // The function's WHERE clause includes: AND user_id = auth.uid()
    // Expected: returns null (ownership check fails silently — no error leaked)
    const { data, error } = await clientA.rpc('fn_get_job_safe_dto', {
      p_job_id: userBJobId,
    })

    // No Postgres error — ownership mismatch returns null, not an exception
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  test('fn_get_job_safe_dto does not expose forbidden fields in DTO', async () => {
    /**
     * Validates that the safe DTO projection returned by fn_get_job_safe_dto
     * never includes server-internal fields, even for a user reading their own job.
     *
     * This test requires:
     *   - User A has at least one job visible via the RPC.
     *   - E2E_USER_A_JOB_ID set to a job_id owned by User A.
     *
     * The view generation_jobs_owner_view is DROPPED. This test documents that
     * the RPC-based replacement enforces the same column restriction.
     */
    const userAEmail = process.env.E2E_USER_A_EMAIL ?? ''
    const userAPassword = process.env.E2E_USER_A_PASSWORD ?? ''
    const userAJobId = process.env.E2E_USER_A_JOB_ID ?? ''

    test.skip(!userAEmail || !userAJobId, 'E2E user A credentials and E2E_USER_A_JOB_ID must be set')

    const clientA = await signIn(userAEmail, userAPassword)
    const { data, error } = await clientA.rpc('fn_get_job_safe_dto', {
      p_job_id: userAJobId,
    })

    expect(error).toBeNull()
    if (data !== null) {
      const row = data as Record<string, unknown>

      // Fields that must NEVER appear in the safe DTO
      const forbidden = [
        'result_data',        // replaced by result_summary
        'lease_token',
        'worker_id',
        'lease_expires_at',
        'heartbeat_at',
        'attempt_count',
        'max_attempts',
        'error',              // raw internal error text
        'request_idempotency_key',
        'request_payload_hash',
        'input_data',
        'state_version',
        'updated_at',
      ]

      for (const field of forbidden) {
        expect(field in row).toBe(false)
      }

      // Fields that must be present in the safe DTO
      const required = [
        'id', 'job_type', 'status',
        'public_error_code', 'public_message_key', 'support_reference',
        'created_at', 'started_at', 'completed_at', 'result_summary',
      ]
      for (const field of required) {
        expect(field in row).toBe(true)
      }
    }
  })
})
