// Provider-neutral job state machine: types, legal transitions, and safe public DTO.
// Database enforcement is authoritative; these types and helpers are supplementary.

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'cancel_requested'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type JobType = 'visuals' | 'flashcards' | 'quiz' | 'revision_notes' | 'analysis'

// Terminal states are immutable once reached.
export const TERMINAL_STATUSES = new Set<JobStatus>(['completed', 'failed', 'cancelled'])

// Active states block a new job for the same (user, document, job_type).
export const ACTIVE_STATUSES = new Set<JobStatus>(['queued', 'processing', 'cancel_requested'])

// Legal client-initiated transitions.
// D1: cancel-request/acknowledge model — processing → cancel_requested, not directly → cancelled.
// Worker transitions are separate and require lease tokens (Phase 2).
const LEGAL_CLIENT_TRANSITIONS: Readonly<Record<JobStatus, ReadonlySet<JobStatus>>> = {
  queued:           new Set<JobStatus>(['cancelled']),
  processing:       new Set<JobStatus>(['cancel_requested']),
  cancel_requested: new Set<JobStatus>([]),
  completed:        new Set<JobStatus>([]),
  failed:           new Set<JobStatus>([]),
  cancelled:        new Set<JobStatus>([]),
}

export function isLegalClientTransition(from: JobStatus, to: JobStatus): boolean {
  return LEGAL_CLIENT_TRANSITIONS[from]?.has(to) ?? false
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

export function isActive(status: JobStatus): boolean {
  return ACTIVE_STATUSES.has(status)
}

// Safe public DTO returned to browser clients.
//
// Fields deliberately omitted (never exposed to clients):
//   - raw error text (error column)
//   - worker_id, lease_token, lease_expires_at, heartbeat_at (Phase 2 operational)
//   - input_data (may contain user content)
//   - internal correlation_id
//   - result_data (raw — use result_summary instead)
//   - request_idempotency_key, request_payload_hash
//
// public_error_code, public_message_key, support_reference are populated from the
// DB columns added by migration 20260729120001. They will be null until that
// migration is applied.
export interface JobSafeDto {
  id: string
  job_type: JobType
  status: JobStatus
  public_error_code: string | null
  public_message_key: string | null
  support_reference: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  result_summary: { visual_count?: number } | null
}

// Envelope returned by the fn_enqueue_job RPC (D2: returns existing active job).
export interface EnqueueResult {
  job_id: string
  is_existing: boolean
  status: JobStatus
}
