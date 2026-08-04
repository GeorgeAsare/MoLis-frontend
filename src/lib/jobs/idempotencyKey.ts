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

// Immutable source snapshot identity — computed authoritatively by fn_enqueue_job in PostgreSQL.
//
// Two distinct named hash identities are maintained by the database (not the application):
//
//   1. SOURCE_DIGEST — SHA-256 over a versioned canonical source envelope containing
//      the point-in-time document+analysis content at enqueue time. Stored in
//      generation_source_snapshots.content_hash. The worker consumes only the bound
//      snapshot; it never re-reads mutable documents or document_analysis.
//
//   2. REQUEST_HASH — SHA-256 over {source_digest, job_type, operation_descriptor,
//      sanitized_input}. Stored in generation_job_requests.request_payload_hash.
//      Binds one canonical request identity to a (user, key, snapshot, job) tuple.
//
// The application (fn_enqueue_job) no longer accepts a caller-supplied hash.
// Authenticated callers supply only: p_document_id, p_job_type, p_idempotency_key,
// and optionally p_sanitized_input. The database derives everything else.
//
// The types below are reference type definitions documenting the canonical envelope schemas.
// They are NOT used in production enqueue calls.

// R8-M01 + R9-C01: SourceDigestEnvelope matches the database canonical v1 byte contract.
// document_created_at and analysis_created_at are UTC ISO-8601 strings in the DB
// (e.g. '2026-07-15T12:34:56.789012Z'), not raw Date objects. UUIDs are TEXT strings.
// This type is for documentation and testing — NOT used in production enqueue calls.
export interface SourceDigestEnvelope {
  schema_version:              number
  document_id:                 string  // UUID as text
  document_title:              string
  document_extracted_text:     string | null
  document_file_type:          string | null
  document_source_type:        string | null
  document_created_at:         string | null  // UTC ISO-8601: 'YYYY-MM-DDTHH:MM:SS.UUUUUUZ'
  document_subject_id:         string | null  // UUID as text — R8-M01: was missing
  document_source_recording_id: string | null  // UUID as text
  analysis_id:                 string | null  // UUID as text
  analysis_data:               Record<string, unknown> | null
  analysis_created_at:         string | null  // UTC ISO-8601: 'YYYY-MM-DDTHH:MM:SS.UUUUUUZ'
  analysis_model:              string | null
}

export interface RequestHashEnvelope {
  schema_version:      number
  source_digest:       string
  job_type:            string
  operation_descriptor: Record<string, unknown>
  sanitized_input:     Record<string, unknown>
}

// R9-C01 + R12-C02: These TypeScript helpers are non-authoritative reference implementations
// only. PostgreSQL (fn_enqueue_job via fn_canonical_jsonb_v1) is authoritative for
// source_digest and request_hash.
//
// Both this code and fn_canonical_jsonb_v1 use an explicit recursive canonicalisation
// contract: all object keys sorted alphabetically at every nesting level, arrays preserve
// order. Hashing does not rely on JSONB rendering or JSONB key order.
//
// Despite aligned key ordering, the byte sequences are NOT identical: JSON.stringify
// produces compact ASCII with JavaScript numeric and string serialisation semantics,
// while fn_canonical_jsonb_v1 produces text with PostgreSQL numeric and string rendering.
// Do not use the output of these functions as Known-Answer Vectors for database hash values.
export function buildSourceDigest(envelope: SourceDigestEnvelope): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(envelope)))
    .digest('hex')
}

export function buildRequestHash(envelope: RequestHashEnvelope): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(envelope)))
    .digest('hex')
}

// Recursively canonicalizes an object for deterministic JSON serialization:
// all object keys are sorted at every nesting level. Arrays preserve order.
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  return Object.fromEntries(
    Object.keys(value as object)
      .sort()
      .map(k => [k, canonicalize((value as Record<string, unknown>)[k])])
  )
}
