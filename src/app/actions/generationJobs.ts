'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { buildRequestIdempotencyKey, buildPayloadHash } from '@/lib/jobs/idempotencyKey'
import { ENQUEUE_RETRY_REQUIRED } from '@/lib/jobs/enqueueErrors'
import type { GenerationJob, GenerationJobType } from '@/types/generationJob'
import type { JobSafeDto, EnqueueResult } from '@/lib/jobs/stateMachine'

// ─────────────────────────────────────────────────────────────────────────────
// SECURE PATH — available after migration 20260729120001 is applied
// These functions call SECURITY DEFINER RPCs that enforce:
//   - auth.uid() ownership (server-derived, not caller-supplied)
//   - document ownership check at the DB level
//   - active-job exclusion (D2: return existing, never auto-replace)
//   - request idempotency key/payload hash conflict detection
// ─────────────────────────────────────────────────────────────────────────────

// IDEMPOTENCY CONTRACT (consolidated in migration 20260729120001):
//
//   A. Durable request idempotency — authoritative ledger (generation_job_requests):
//      - The CLIENT generates the bare UUID BEFORE the first API request and
//        persists it in sessionStorage (see lib/jobs/pendingJobKey.ts).
//      - The client reuses the same UUID on network retries, duplicate submissions,
//        and temporary refresh recovery while the original action is still pending.
//      - Intentional regeneration (e.g., "Regenerate" after completion) explicitly
//        clears the client-side key and generates a new UUID.
//      - This server action receives the UUID as incomingRequestKey, validates its
//        format, and scopes it: idempotencyKey = "${userId}:${requestKey}".
//      - Server-side fallback: if no incomingRequestKey is provided (client bug or
//        degraded path), a new UUID is generated here. This is not the primary path.
//      - fn_enqueue_job atomically records every accepted (user, request_key) → job_id
//        binding in generation_job_requests — including D2 bindings where the key is
//        mapped to an already-active job. The ledger is the authoritative mapping.
//      - Same key + same payload → returns the associated job (any status incl. terminal).
//      - Same key + different payload → explicit P0004 IDEMPOTENCY_PAYLOAD_CONFLICT.
//      - Terminal jobs hold the ledger slot permanently; a new key is required for a new
//        attempt. The client must call clearPendingRequestKey + generate a new UUID.
//
//   B. Payload hash — canonical envelope (H03):
//      Hashes { schema_version, operation_kind, document_id, job_type, sanitized_input }.
//      Server-validated fields only. user_id excluded (already scoped by ledger key).
//      Changing document_id or job_type while reusing the same key → P0004 conflict.
//
//   C. Active-job exclusion (independent of A):
//      Partial unique index on generation_jobs prevents concurrent active jobs.
//      D2 bindings are durably recorded in the ledger so a key presented after D2
//      resolves to the same job even after it becomes terminal.
//
//   Error codes from fn_enqueue_job that callers may see:
//      P0001 NOT_AUTHENTICATED
//      P0002 INVALID_JOB_TYPE
//      P0003 DOCUMENT_NOT_FOUND_OR_NOT_OWNED
//      P0004 IDEMPOTENCY_PAYLOAD_CONFLICT
//      P0007 ENQUEUE_CONCURRENT_TERMINAL — rare; one automatic server retry; 503 if unresolved
//      P0008 INVALID_IDEMPOTENCY_KEY
//      P0009 INVALID_PAYLOAD_HASH
//      P0010 INVALID_INPUT
//
// Enqueue a new job or return the existing active job (D2).
// Calls fn_enqueue_job security-definer RPC.
// On P0007 (concurrent terminal race), retries once with identical key + hash.
// If P0007 persists, throws ENQUEUE_RETRY_REQUIRED for the route to return 503.
// Fails explicitly if the RPC does not exist (migration not yet applied).
export async function enqueueJob(
  documentId: string,
  jobType: GenerationJobType,
  sanitizedInputData: Record<string, unknown> = {},
  incomingRequestKey?: string,   // undefined = first call; defined = retry with same key
): Promise<EnqueueResult & { requestKey: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')

  // Validate incomingRequestKey format: must be a UUID (36-char with hyphens).
  const isValidUuid = incomingRequestKey != null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(incomingRequestKey)

  // Build the scoped key: "${userId}:${uuid}". Server always provides the userId prefix.
  const requestKey = isValidUuid ? incomingRequestKey! : buildRequestIdempotencyKey()
  const idempotencyKey = `${user.id}:${requestKey}`

  // Canonical payload hash — includes server-validated document_id and job_type
  // so that a key cannot be reused for a different resource or operation.
  const payloadHash = buildPayloadHash({
    schema_version:  1,
    operation_kind:  jobType,
    document_id:     documentId,
    job_type:        jobType,
    sanitized_input: sanitizedInputData,
  })

  const rpcArgs = {
    p_document_id:      documentId,
    p_job_type:         jobType,
    p_idempotency_key:  idempotencyKey,
    p_payload_hash:     payloadHash,
    p_sanitized_input:  sanitizedInputData,
  }

  const { data, error } = await supabase.rpc('fn_enqueue_job', rpcArgs)

  if (error) {
    logger.warn('job.enqueue_rpc_failed', { job_type: jobType, pg_code: error.code })

    // P0007: a concurrent request inserted and immediately completed a job before this
    // transaction could bind the key. Retry exactly ONCE with the identical key and hash.
    // If unresolved, throw ENQUEUE_RETRY_REQUIRED so the route can return 503.
    if (error.code === 'P0007') {
      logger.warn('job.enqueue_p0007_retry', { job_type: jobType })
      const { data: retryData, error: retryError } = await supabase.rpc('fn_enqueue_job', rpcArgs)
      if (retryError) {
        logger.warn('job.enqueue_p0007_retry_failed', { job_type: jobType, pg_code: retryError.code })
        throw new Error(ENQUEUE_RETRY_REQUIRED)
      }
      const retryResult = retryData as { job_id: string; is_existing: boolean; status: string; request_key: string | null }
      return {
        job_id:      retryResult.job_id,
        is_existing: retryResult.is_existing,
        status:      retryResult.status as EnqueueResult['status'],
        requestKey:  retryResult.request_key ?? requestKey,
      }
    }

    throw new Error(`ENQUEUE_FAILED:${error.code ?? 'UNKNOWN'}`)
  }

  const result = data as { job_id: string; is_existing: boolean; status: string; request_key: string | null }
  return {
    job_id:      result.job_id,
    is_existing: result.is_existing,
    status:      result.status as EnqueueResult['status'],
    requestKey:  result.request_key ?? requestKey,
  }
}

// Request cancellation of a job the caller owns (D1).
// Calls fn_request_job_cancel security-definer RPC.
// fn_request_job_cancel now returns JSONB (not VOID); caller receives the outcome.
// Fails explicitly if the RPC does not exist — does NOT fall back to direct UPDATE.
export async function requestJobCancel(jobId: string): Promise<{ newStatus: string; action: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')

  const { data, error } = await supabase.rpc('fn_request_job_cancel', {
    p_job_id: jobId,
  })

  if (error) {
    logger.warn('job.cancel_rpc_failed', { job_id: jobId, pg_code: error.code })
    throw new Error(`CANCEL_FAILED:${error.code ?? 'UNKNOWN'}`)
  }

  const result = data as { new_status: string; action: string }
  return { newStatus: result.new_status, action: result.action }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ PATH — narrow owner-read RPCs (replace the unsafe view approach)
//
// Safe read is via fn_get_job_safe_dto and fn_get_active_job_for_document.
// These are SECURITY DEFINER functions that:
//   - enforce auth.uid() ownership
//   - return only safe public fields (never raw result_data, lease_token, etc.)
//   - are NOT automatically updatable (unlike single-table views)
//   - are not exposed via Data API/GraphQL as updatable endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Return a safe DTO for a single owned job via fn_get_job_safe_dto RPC.
export async function getJobSafeDto(jobId: string): Promise<JobSafeDto | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('fn_get_job_safe_dto', {
    p_job_id: jobId,
  })

  if (error) {
    logger.warn('job.get_safe_dto_failed', { job_id: jobId, pg_code: error.code })
    return null
  }

  const raw = data as Record<string, unknown> | null
  if (!raw) return null

  return mapRawToJobSafeDto(raw)
}

export async function getActiveJobForDocument(
  documentId: string,
  jobType: GenerationJobType,
): Promise<JobSafeDto | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('fn_get_active_job_for_document', {
    p_document_id: documentId,
    p_job_type:    jobType,
  })

  if (error) {
    logger.warn('job.get_active_job_failed', { document_id: documentId, pg_code: error.code })
    return null
  }

  const raw = data as Record<string, unknown> | null
  if (!raw) return null

  return mapRawToJobSafeDto(raw)
}

function mapRawToJobSafeDto(raw: Record<string, unknown>): JobSafeDto {
  const resultSummary = raw.result_summary as Record<string, unknown> | null
  return {
    id:                raw.id as string,
    job_type:          raw.job_type as JobSafeDto['job_type'],
    status:            raw.status as JobSafeDto['status'],
    public_error_code: (raw.public_error_code as string | null) ?? null,
    public_message_key:(raw.public_message_key as string | null) ?? null,
    support_reference: (raw.support_reference as string | null) ?? null,
    created_at:        raw.created_at as string,
    started_at:        (raw.started_at as string | null) ?? null,
    completed_at:      (raw.completed_at as string | null) ?? null,
    result_summary:    resultSummary
      ? { visual_count: resultSummary.visual_count as number | undefined }
      : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — server-internal use only during the migration transition period
//
// These functions write directly to the generation_jobs base table.
// After migration 20260729120001 is applied:
//   - createGenerationJob: fails (INSERT revoked from authenticated role)
//   - cancelGenerationJob: fails (UPDATE blocked; use requestJobCancel RPC instead)
//
// Do NOT call these from new code. They are retained until Phase 2 cleanup only.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use enqueueJob() instead. Will fail after migration 20260729120001. */
export async function createGenerationJob(
  documentId: string,
  jobType: GenerationJobType,
  inputData?: Record<string, unknown>,
): Promise<GenerationJob> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: doc } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single()
  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')

  await supabase
    .from('generation_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('job_type', jobType)
    .in('status', ['queued', 'processing'])

  const { data, error } = await supabase
    .from('generation_jobs')
    .insert({
      user_id:     user.id,
      document_id: documentId,
      job_type:    jobType,
      status:      'queued',
      input_data:  inputData ?? null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create job')
  logger.info('job.created.deprecated_path', { job_type: jobType })
  return data as GenerationJob
}

/** @deprecated Use requestJobCancel() instead. Will fail after migration 20260729120001. */
export async function cancelGenerationJob(jobId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('generation_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', user.id)
    .in('status', ['queued', 'processing'])
}

// updateJobStatus — FULLY DEPRECATED (no remaining callers)
/** @deprecated No callers remain. Will throw on call. Remove in Phase 3 cleanup. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function updateJobStatus(...args: unknown[]): Promise<void> {
  throw new Error(
    'updateJobStatus is deprecated and has no remaining callers. ' +
    'Use fn_claim_job / fn_complete_job / fn_fail_job RPCs via workerClient.',
  )
}
