'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { buildRequestIdempotencyKey } from '@/lib/jobs/idempotencyKey'
import { ENQUEUE_RETRY_REQUIRED, classifyEnqueueError } from '@/lib/jobs/enqueueErrors'
import type { GenerationJobType } from '@/types/generationJob'
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
//      - Fast path: if the scoped key is already in the ledger, fn_enqueue_job validates
//        document ownership and job type before returning the bound job (any status,
//        including terminal). No new snapshot, job, or ledger row is created.
//      - Terminal jobs hold the ledger slot permanently; a new key is required for a new
//        attempt. The client must call clearPendingRequestKey + generate a new UUID.
//
//   B. Request hash — canonical envelope computed by fn_enqueue_job in PostgreSQL:
//      SHA-256 over { schema_version, source_digest, job_type, operation_descriptor,
//      sanitized_input } serialised by fn_canonical_jsonb_v1 — an explicit recursive
//      canonicalisation contract (keys sorted at every nesting level, arrays preserve order).
//      Hashing does not rely on JSONB rendering or JSONB key order.
//      source_digest captures the full document+analysis content at enqueue time.
//      operation_descriptor is server-derived (text_model, image_model, etc.) and
//      cannot be manipulated by callers. Stored in generation_job_requests.request_payload_hash.
//      PostgreSQL is authoritative; TypeScript helpers in idempotencyKey.ts are
//      non-authoritative reference implementations only.
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
//      P0008 INVALID_IDEMPOTENCY_KEY_FORMAT or INVALID_IDEMPOTENCY_KEY_OWNER
//      P0010 INVALID_INPUT (null p_sanitized_input)
//      P0017 DOCUMENT_REVISION_CHANGED — document content changed since active job was queued
//      P0018 DUPLICATE_ANALYSIS — multiple analysis rows exist; D10 quarantine applied
//   Concurrent new-job races return {outcome:'retry_required'} (not a SQLSTATE error).
//   The server action retries once automatically; throws ENQUEUE_RETRY_REQUIRED if unresolved.
//
// R7-M02: closed, versioned input schema per job type.
// Each job type declares its allowed input keys. Any unknown key is rejected before
// the RPC call. This prevents callers from accidentally sending server-internal fields
// and documents the expected input contract for each job type.
// Version 1 schemas (extend when job types add configurable caller input).
const SANITIZED_INPUT_SCHEMA_V1: Record<GenerationJobType, ReadonlyArray<string>> = {
  visuals:        [],   // no user-controlled input fields in v1
  flashcards:     [],
  quiz:           [],
  revision_notes: [],
  analysis:       [],
}

function validateSanitizedInput(
  jobType: GenerationJobType,
  input: unknown,
): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_INPUT: sanitized_input must be a non-null, non-array object')
  }
  const schema = SANITIZED_INPUT_SCHEMA_V1[jobType]
  if (!schema) {
    throw new Error(`INVALID_JOB_TYPE: no input schema for job type ${String(jobType)}`)
  }
  const obj = input as Record<string, unknown>
  const unknownKeys = Object.keys(obj).filter(k => !schema.includes(k))
  if (unknownKeys.length > 0) {
    throw new Error(`INVALID_INPUT: unexpected input keys for job type ${String(jobType)}: ${unknownKeys.join(', ')}`)
  }
  return obj
}

// Enqueue a new job or return the existing active job (D2).
// Calls fn_enqueue_job security-definer RPC.
// On a concurrent new-job race (outcome='retry_required'), retries once with the same key.
// If still unresolved, throws ENQUEUE_RETRY_REQUIRED for the route to return 503.
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

  // R7-M02: validate sanitized input against the closed per-job-type schema before RPC call.
  const validatedInput = validateSanitizedInput(jobType, sanitizedInputData)

  // Validate incomingRequestKey format: must be a UUID (36-char with hyphens).
  const isValidUuid = incomingRequestKey != null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(incomingRequestKey)

  // Build the scoped key: "${userId}:${uuid}". Server always provides the userId prefix.
  const requestKey = isValidUuid ? incomingRequestKey! : buildRequestIdempotencyKey()
  const idempotencyKey = `${user.id}:${requestKey}`

  // Source capture, canonical hashing, and snapshot creation are performed atomically
  // inside fn_enqueue_job (SECURITY DEFINER). The authenticated caller supplies only
  // the bare request key and optional sanitized input — the database derives all
  // authoritative values: user identity, document ownership, source content snapshot,
  // SHA-256 source digest, and execution descriptor.
  const rpcArgs = {
    p_document_id:     documentId,
    p_job_type:        jobType,
    p_idempotency_key: idempotencyKey,
    p_sanitized_input: validatedInput,
  }

  const { data, error } = await supabase.rpc('fn_enqueue_job', rpcArgs)

  if (error) {
    // Log only the classified error name — never the raw SQLSTATE code.
    logger.warn('job.enqueue_rpc_failed', { job_type: jobType, error_class: classifyEnqueueError(error.code) })
    throw new Error(classifyEnqueueError(error.code))
  }

  const result = data as {
    outcome?:    string
    job_id:      string | null
    is_existing: boolean
    status:      string
    request_key: string | null
  }

  // R9-H03: fn_enqueue_job returns {outcome:'retry_required'} instead of raising P0007.
  // This prevents PostgREST SQLSTATE exposure to authenticated callers who call the
  // RPC directly. The server action retries exactly once with the identical key.
  if (result.outcome === 'retry_required') {
    logger.warn('job.enqueue.concurrent_binding', { job_type: jobType })
    const { data: retryData, error: retryError } = await supabase.rpc('fn_enqueue_job', rpcArgs)
    if (retryError) {
      logger.warn('job.enqueue.concurrent_binding_retry_failed', { job_type: jobType, error_class: classifyEnqueueError(retryError.code) })
      throw new Error(classifyEnqueueError(retryError.code))
    }
    const retryResult = retryData as {
      outcome?:    string
      job_id:      string | null
      is_existing: boolean
      status:      string
      request_key: string | null
    }
    if (retryResult.outcome === 'retry_required') {
      // Still unresolved after one retry — caller gets 503.
      throw new Error(ENQUEUE_RETRY_REQUIRED)
    }
    if (!retryResult.job_id) throw new Error(ENQUEUE_RETRY_REQUIRED)
    return {
      job_id:      retryResult.job_id,
      is_existing: retryResult.is_existing,
      status:      retryResult.status as EnqueueResult['status'],
      requestKey:  retryResult.request_key ?? requestKey,
    }
  }

  if (!result.job_id) throw new Error(ENQUEUE_RETRY_REQUIRED)
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
    logger.warn('job.cancel_rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    throw new Error('CANCEL_FAILED')
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
    logger.warn('job.get_safe_dto_failed', { job_id: jobId, error_class: 'rpc_error' })
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
    logger.warn('job.get_active_job_failed', { document_id: documentId, error_class: 'rpc_error' })
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
// R9-M02: Deprecated direct base-table server actions — hard-disabled.
//
// After migration 20260729120001 is applied, direct INSERT/UPDATE on generation_jobs
// is revoked from authenticated. These stubs throw immediately so callers discover
// the breakage at development time rather than at runtime. Use enqueueJob() and
// requestJobCancel() instead.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Hard-disabled. Use enqueueJob() instead. */
export async function createGenerationJob(
  _documentId: string,
  _jobType: GenerationJobType,
  _inputData?: Record<string, unknown>,
): Promise<never> {
  throw new Error(
    'createGenerationJob is removed. Direct base-table inserts are not permitted after ' +
    'migration 20260729120001. Use enqueueJob() via the fn_enqueue_job RPC.',
  )
}

/** @deprecated Hard-disabled. Use requestJobCancel() instead. */
export async function cancelGenerationJob(_jobId: string): Promise<never> {
  throw new Error(
    'cancelGenerationJob is removed. Direct base-table updates are not permitted after ' +
    'migration 20260729120001. Use requestJobCancel() via fn_request_job_cancel.',
  )
}

/** @deprecated Hard-disabled. No callers remain. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function updateJobStatus(..._args: unknown[]): Promise<never> {
  throw new Error(
    'updateJobStatus is removed. Use fn_claim_job / fn_complete_job / fn_fail_job ' +
    'RPCs via workerClient.',
  )
}
