// SERVER-ONLY — never import from client components, browser code, or 'use client' files.
import 'server-only'

// Server-side worker client: wraps the SECURITY DEFINER worker RPCs.
// Uses the service-role client (createServiceClient) — NOT the user-session client.
//
// WORKER IDENTITY: every worker transition requires BOTH workerId AND leaseToken.
// workerId is assigned at claim time. leaseToken is cryptographically unique per claim.
// Both are verified inside the SECURITY DEFINER function WHERE clause (no TOCTOU).
//
// D13 TIMING: lease duration = 90 seconds (after claim or heartbeat).
//             Heartbeat interval ≈ 30 seconds → ≈ 60-second buffer before expiry.

import { createServiceClient } from '@/lib/supabase/serviceClient'
import { logger } from '@/lib/logger'
import type { JobStatus } from './stateMachine'
import type { StudyVisualItem } from '@/types/studyVisual'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// C07: Typed heartbeat result — indicates WHY renewal was refused so the worker
// can take the correct action (only cancel_requested triggers acknowledgeCancel).
//
// refusalReason values:
//   cancel_requested — worker must call acknowledgeCancel
//   expired_lease    — lease expired; abort without state transition
//   wrong_token      — workerId/leaseToken mismatch; abort without state transition
//   not_processing   — job is not in processing state; abort without state transition
//   rpc_transient    — transport/RPC error, not a DB refusal; route may retry (bounded)
export interface HeartbeatResult {
  renewed: boolean
  refusalReason?: 'cancel_requested' | 'authority_lost' | 'job_not_processing' | 'terminal' | 'transient_failure'
}

export type ClaimOutcome =
  | 'claimed'
  | 'lost_race'
  | 'not_queued'
  | 'not_found'
  | 'max_attempts_exceeded'

export interface ClaimResult {
  outcome: ClaimOutcome
  leaseToken: string | null
  stateVersion: number | null   // must be passed to ALL subsequent CAS calls
  attemptCount: number | null
}

export type CompleteOutcome =
  | 'completed'
  | 'cancelled'       // cancel was requested; result/publication discarded per D1
  | 'terminal'        // already in a terminal state (duplicate callback)
  | 'wrong_token'     // worker_id or lease_token mismatch
  | 'expired_lease'
  | 'lost_race'
  | 'not_found'

export interface TransitionResult {
  outcome: CompleteOutcome | FailOutcome | AcknowledgeOutcome
  finalStatus: JobStatus | null
}

export type FailOutcome =
  | 'failed'
  | 'cancelled'       // cancel takes precedence per D1
  | 'terminal'
  | 'wrong_token'
  | 'expired_lease'
  | 'lost_race'
  | 'not_found'

export type AcknowledgeOutcome =
  | 'cancelled'
  | 'not_cancel_requested'
  | 'terminal'
  | 'wrong_token'
  | 'expired_lease'
  | 'not_found'
  | 'lost_race'

export interface RecoverResult {
  cancelled: number
  requeued: number
  permanentlyFailed: number
}

// ─────────────────────────────────────────────────────────────────────────────
// fn_claim_job
// ─────────────────────────────────────────────────────────────────────────────

// Atomically claims a queued job: assigns worker_id and a cryptographically unique
// lease_token. Returns state_version which MUST be passed to all subsequent calls.
// D13: default lease = 90 seconds.
export async function claimJob(
  jobId: string,
  workerId: string,
  leaseDurationSeconds = 90,
): Promise<ClaimResult> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('fn_claim_job', {
    p_job_id:                 jobId,
    p_worker_id:              workerId,
    p_lease_duration_seconds: leaseDurationSeconds,
  })

  if (error) {
    logger.warn('worker.claim_rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    return { outcome: 'lost_race', leaseToken: null, stateVersion: null, attemptCount: null }
  }

  const result = data as {
    outcome: ClaimOutcome
    lease_token: string | null
    state_version: number | null
    attempt_count: number | null
  }
  return {
    outcome:      result.outcome,
    leaseToken:   result.lease_token,
    stateVersion: result.state_version,
    attemptCount: result.attempt_count,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fn_heartbeat_job
// ─────────────────────────────────────────────────────────────────────────────

// Extends the lease of a 'processing' job. CANCEL WINS: refuses to renew leases
// for cancel_requested jobs. Verifies BOTH workerId AND leaseToken.
// D13: leaseDurationSeconds = 90 (the lease is renewed to NOW() + 90s).
// A worker sending heartbeats every ≈30s always has ≈60s of buffer.
//
// C07: Returns HeartbeatResult with a typed refusal_reason. The caller must inspect
// refusalReason to determine the correct action:
//   cancel_requested → call acknowledgeCancel
//   expired_lease / wrong_token / not_processing → abort only (no state transition)
//   rpc_transient → transient RPC/transport error; bounded retry permitted (R7-H07)
export async function heartbeatJob(
  jobId: string,
  workerId: string,
  leaseToken: string,
  stateVersion: number,
  leaseDurationSeconds = 90,
): Promise<HeartbeatResult> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('fn_heartbeat_job', {
    p_job_id:                 jobId,
    p_worker_id:              workerId,
    p_lease_token:            leaseToken,
    p_state_version:          stateVersion,
    p_lease_duration_seconds: leaseDurationSeconds,
  })

  if (error) {
    // R7-H07: use 'rpc_transient' (not 'not_processing') so the route hits the bounded
    // transient retry branch (default case) rather than the authority-lost abort branch.
    logger.warn('worker.heartbeat_rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    return { renewed: false, refusalReason: 'transient_failure' }
  }

  const result = data as {
    renewed: boolean
    refusal_reason?: 'cancel_requested' | 'authority_lost' | 'job_not_processing' | 'terminal' | 'transient_failure'
  }
  if (result.renewed) return { renewed: true }
  return { renewed: false, refusalReason: result.refusal_reason ?? 'transient_failure' }
}

// ─────────────────────────────────────────────────────────────────────────────
// fn_complete_and_publish_job  (visuals job type — atomic publication)
// ─────────────────────────────────────────────────────────────────────────────

// Atomically completes a visuals job AND upserts study_visuals in one transaction.
// If either the job update or the study_visuals write fails, both roll back.
// There is NO separate publishVisuals call after this succeeds.
//
// On cancel (D1): transitions to cancelled; study_visuals is NOT written.
// Verifies: workerId, leaseToken, stateVersion, unexpired lease — all in WHERE.
export interface CompleteAndPublishResult {
  outcome: CompleteOutcome
  finalStatus: JobStatus | null
  visualCount?: number
}

export async function completeAndPublishJob(
  jobId: string,
  workerId: string,
  leaseToken: string,
  stateVersion: number,
  visuals: StudyVisualItem[],
  model: string,
  resultCode?: string,
): Promise<CompleteAndPublishResult> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('fn_complete_and_publish_job', {
    p_job_id:        jobId,
    p_worker_id:     workerId,
    p_lease_token:   leaseToken,
    p_state_version: stateVersion,
    p_visuals:       visuals,
    p_model:         model,
    p_result_code:   resultCode ?? null,
  })

  if (error) {
    logger.warn('worker.complete_and_publish_rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    throw new Error('COMPLETE_AND_PUBLISH_FAILED')
  }

  const result = data as { outcome: CompleteOutcome; final_status: string | null; visual_count?: number }
  return {
    outcome:     result.outcome,
    finalStatus: result.final_status as JobStatus | null,
    visualCount: result.visual_count,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fn_complete_job  (non-visuals job types — no publication step)
// ─────────────────────────────────────────────────────────────────────────────

// For job types that do not require an atomic publication step.
// Verifies BOTH workerId AND leaseToken.
export async function completeJob(
  jobId: string,
  workerId: string,
  leaseToken: string,
  stateVersion: number,
  resultData: Record<string, unknown> = {},
): Promise<TransitionResult> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('fn_complete_job', {
    p_job_id:        jobId,
    p_worker_id:     workerId,
    p_lease_token:   leaseToken,
    p_state_version: stateVersion,
    p_result_data:   resultData,
  })

  if (error) {
    logger.warn('worker.complete_rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    throw new Error('COMPLETE_FAILED')
  }

  const result = data as { outcome: CompleteOutcome; final_status: string | null }
  return {
    outcome:     result.outcome,
    finalStatus: result.final_status as JobStatus | null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fn_fail_job
// ─────────────────────────────────────────────────────────────────────────────

// Accepts only safe public error fields — raw error text must NOT be passed here.
// Verifies BOTH workerId AND leaseToken.
export async function failJob(
  jobId: string,
  workerId: string,
  leaseToken: string,
  stateVersion: number,
  errorCode: string,
  messageKey: string,
  supportReference: string,
): Promise<TransitionResult> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('fn_fail_job', {
    p_job_id:            jobId,
    p_worker_id:         workerId,
    p_lease_token:       leaseToken,
    p_state_version:     stateVersion,
    p_error_code:        errorCode,
    p_message_key:       messageKey,
    p_support_reference: supportReference,
  })

  if (error) {
    logger.warn('worker.fail_rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    throw new Error('FAIL_FAILED')
  }

  const result = data as { outcome: FailOutcome; final_status: string | null }
  return {
    outcome:     result.outcome,
    finalStatus: result.final_status as JobStatus | null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fn_acknowledge_cancel
// ─────────────────────────────────────────────────────────────────────────────

// For workers that detect cancel_requested mid-stream and want to acknowledge early.
// Verifies BOTH workerId AND leaseToken.
export async function acknowledgeCancel(
  jobId: string,
  workerId: string,
  leaseToken: string,
  stateVersion: number,
): Promise<TransitionResult> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('fn_acknowledge_cancel', {
    p_job_id:        jobId,
    p_worker_id:     workerId,
    p_lease_token:   leaseToken,
    p_state_version: stateVersion,
  })

  if (error) {
    logger.warn('worker.acknowledge_cancel_rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    throw new Error('ACKNOWLEDGE_CANCEL_FAILED')
  }

  const result = data as { outcome: AcknowledgeOutcome; final_status: string | null }
  return {
    outcome:     result.outcome,
    finalStatus: result.final_status as JobStatus | null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fn_recover_stale_jobs
// ─────────────────────────────────────────────────────────────────────────────

// System-wide stale-job recovery. Admin/cron only — operates on ALL users' jobs.
export async function recoverStaleJobs(): Promise<RecoverResult> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('fn_recover_stale_jobs')

  if (error) {
    logger.warn('worker.recover_stale_rpc_failed', { error_class: 'rpc_error' })
    return { cancelled: 0, requeued: 0, permanentlyFailed: 0 }
  }

  const result = data as { cancelled: number; requeued: number; permanently_failed: number }
  return {
    cancelled:         result.cancelled,
    requeued:          result.requeued,
    permanentlyFailed: result.permanently_failed,
  }
}
