// Enqueue error codes shared between the server action and the route handler.
// Must NOT be in a 'use server' file (server action files cannot export non-functions).

// Thrown by enqueueJob when fn_enqueue_job returns {outcome:'retry_required'} on both
// the first attempt and one immediate server retry. The route catches this and returns
// HTTP 503 { code: 'JOB_ENQUEUE_RETRY_REQUIRED' }. The client must preserve the request
// key and show a safe retry message.
export const ENQUEUE_RETRY_REQUIRED   = 'ENQUEUE_RETRY_REQUIRED'   as const
export const IDEMPOTENCY_CONFLICT     = 'IDEMPOTENCY_CONFLICT'      as const
export const AUTHORIZATION_FAILED     = 'AUTHORIZATION_FAILED'      as const
export const ENQUEUE_INTERNAL_FAILURE = 'ENQUEUE_INTERNAL_FAILURE'  as const

// Maps PostgreSQL SQLSTATE codes from fn_enqueue_job to safe public error names.
// SQLSTATE codes must NEVER appear in logs, responses, or thrown error messages.
const CLASSIFY: Record<string, string> = {
  P0001: AUTHORIZATION_FAILED,         // NOT_AUTHENTICATED
  P0002: ENQUEUE_INTERNAL_FAILURE,      // INVALID_JOB_TYPE
  P0003: AUTHORIZATION_FAILED,         // DOCUMENT_NOT_FOUND_OR_NOT_OWNED
  P0004: IDEMPOTENCY_CONFLICT,          // IDEMPOTENCY_PAYLOAD_CONFLICT / ACTIVE_JOB_INTENT_CONFLICT
  P0008: IDEMPOTENCY_CONFLICT,          // INVALID_IDEMPOTENCY_KEY_FORMAT / OWNER
  P0009: IDEMPOTENCY_CONFLICT,          // INVALID_PAYLOAD_HASH_FORMAT
  P0010: ENQUEUE_INTERNAL_FAILURE,      // INVALID_INPUT
  P0012: ENQUEUE_INTERNAL_FAILURE,      // USE_PUBLISH_RPC (wrong call site)
  P0013: ENQUEUE_INTERNAL_FAILURE,      // INVALID_MANIFEST
  P0014: IDEMPOTENCY_CONFLICT,          // (reserved key conflict)
  P0015: ENQUEUE_INTERNAL_FAILURE,      // IDEMPOTENCY_KEY_REQUIRED
  P0017: IDEMPOTENCY_CONFLICT,          // DOCUMENT_REVISION_CHANGED
  P0018: ENQUEUE_INTERNAL_FAILURE,      // DUPLICATE_ANALYSIS (D10 quarantine)
}

export function classifyEnqueueError(code: string | null | undefined): string {
  if (!code) return ENQUEUE_INTERNAL_FAILURE
  return CLASSIFY[code] ?? ENQUEUE_INTERNAL_FAILURE
}
