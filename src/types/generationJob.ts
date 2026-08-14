// Legacy base-table type — still represents the raw DB row shape.
// Browser clients must NOT receive this type directly; use JobSafeDto instead.
// After migration 20260729120001 is applied, direct authenticated INSERT/DELETE/UPDATE
// on this table is revoked; this type exists for server-side internal use only.
export type GenerationJobStatus =
  | 'queued'
  | 'processing'
  | 'cancel_requested'   // added: D1 cancel-request/acknowledge model
  | 'completed'
  | 'failed'
  | 'cancelled'

export type GenerationJobType = 'visuals' | 'flashcards' | 'quiz' | 'revision_notes' | 'analysis'

// Raw base-table row. Do not expose to clients.
export interface GenerationJob {
  id: string
  user_id: string
  document_id: string | null
  job_type: GenerationJobType
  status: GenerationJobStatus
  input_data: Record<string, unknown> | null
  result_data: Record<string, unknown> | null
  // Raw error — server-internal only. Must never be returned to browser clients.
  // Use public_error_code and public_message_key for client-facing error information.
  error: string | null
  correlation_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null

  // Columns added by migration 20260729120001_generation_job_state_machine_schema.sql
  // Present only after that migration is applied.
  state_version: number
  // ORIGINATING request key (composite "${userId}:${uuid}") — the key that CREATED this job.
  // NOT the authoritative idempotency mapping. The generation_job_requests ledger table
  // (consolidated into 20260729120001) is authoritative: multiple request keys may resolve
  // to this job via active-job exclusion (D2). The unique index on this column prevents two
  // jobs from sharing an originating key; it does not serve as the idempotency lookup path.
  request_idempotency_key: string | null
  request_payload_hash: string | null
  public_error_code: string | null
  public_message_key: string | null
  support_reference: string | null
  // Lease management columns — set by fn_claim_job, cleared on terminal states.
  worker_id: string | null
  lease_token: string | null
  lease_expires_at: string | null
  heartbeat_at: string | null
  // Retry tracking columns.
  attempt_count: number
  max_attempts: number
  // Snapshot and request binding — set at enqueue time.
  snapshot_id: string | null
  originating_request_id: string | null
  // Classification applied by fn_enqueue_job.
  request_classification: 'client_verified' | 'legacy_unverified' | null
}

// Ledger entry consolidated into migration 20260729120001.
// Records every (user, request_key) → job_id binding, including D2 bindings where a
// different request key was mapped to an already-active job. Bindings are permanent:
// terminal jobs do NOT free their ledger slot. Direct authenticated access is revoked;
// read and write are only possible via SECURITY DEFINER RPCs.
export interface GenerationJobRequest {
  id: string
  user_id: string
  document_id: string
  job_type: GenerationJobType
  snapshot_id: string | null
  // Composite "${userId}:${uuid}" — same format as generation_jobs.request_idempotency_key.
  request_idempotency_key: string
  request_payload_hash: string
  // The job this request key is bound to. May be in any status including terminal.
  job_id: string
  created_at: string
}

// Re-export the safe DTO as the canonical type for all API responses.
export type { JobSafeDto, EnqueueResult } from '@/lib/jobs/stateMachine'
