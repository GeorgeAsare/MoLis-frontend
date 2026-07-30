import { createHash, randomUUID } from 'crypto'

// Generate the UUID portion of a per-action request idempotency key.
//
// Called ONCE per logical user action (first request, no incoming key).
// The caller (enqueueJob) prefixes it with the authenticated userId:
//   storedKey = `${userId}:${buildRequestIdempotencyKey()}`
//
// On retry, the client sends the UUID back; enqueueJob reconstructs the
// scoped key rather than generating a new UUID.
//
// IDEMPOTENCY CONTRACT:
//   - One UUID per logical user action, reused on network retries.
//   - Server generates it on first request; client stores and reuses it.
//   - Terminal jobs hold the slot permanently — the same key never creates
//     a second job once any terminal outcome exists.
//   - Intentional regeneration (user wants to try again) requires a new key,
//     i.e., the client does not send incomingRequestKey on the new attempt.
export function buildRequestIdempotencyKey(): string {
  return randomUUID()
}

// Canonical hash envelope for payload conflict detection.
//
// All server-validated fields are included so that a client cannot produce
// a different job configuration by changing document_id or job_type while
// reusing the same request key.
//
// user_id is intentionally EXCLUDED from the hash: the request ledger key
// is already scoped to user_id (both via the composite "${userId}:${UUID}"
// key format and the generation_job_requests.user_id FK).
//
// Keys are sorted before serialisation so the hash is order-independent.
export interface PayloadHashEnvelope {
  schema_version: number
  operation_kind: string
  document_id: string
  job_type: string
  sanitized_input: Record<string, unknown>
}

export function buildPayloadHash(envelope: PayloadHashEnvelope): string {
  const canonical: Record<string, unknown> = {
    schema_version: envelope.schema_version,
    operation_kind: envelope.operation_kind,
    document_id:    envelope.document_id,
    job_type:       envelope.job_type,
    sanitized_input: sortedKeys(envelope.sanitized_input),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function sortedKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key]
  }
  return sorted
}
