import { randomUUID } from 'crypto'
import { after, NextResponse } from 'next/server'
import { stageVisualsForJob } from '@/app/actions/visuals'
import { enqueueJob } from '@/app/actions/generationJobs'
import { ENQUEUE_RETRY_REQUIRED } from '@/lib/jobs/enqueueErrors'
import { claimJob, heartbeatJob, completeAndPublishJob, failJob, acknowledgeCancel } from '@/lib/jobs/workerClient'
import { classifyError, generateSupportReference, publicMessageKeyForCode } from '@/lib/jobs/errorClassifier'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json()) as { documentId?: string; requestKey?: string }
    const { documentId, requestKey: incomingRequestKey } = body
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    // DURABLE IDEMPOTENCY:
    // Pass incomingRequestKey (undefined on first call, UUID string on retry).
    // enqueueJob builds the canonical payload hash (includes documentId, jobType,
    // schema_version — not just sanitizedInput). On P0007, it retries once automatically
    // and throws ENQUEUE_RETRY_REQUIRED if unresolved.
    let enqueueResult
    try {
      enqueueResult = await enqueueJob(documentId, 'visuals', {}, incomingRequestKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === ENQUEUE_RETRY_REQUIRED) {
        logger.warn('job.visuals.enqueue_retry_required', { document_id: documentId })
        return NextResponse.json(
          { code: 'JOB_ENQUEUE_RETRY_REQUIRED' },
          { status: 503 },
        )
      }
      throw err
    }

    const jobId = enqueueResult.job_id
    const returnedRequestKey = enqueueResult.requestKey

    logger.info('job.visuals.queued', {
      job_id: jobId,
      document_id: documentId,
      is_existing: enqueueResult.is_existing,
    })

    after(async () => {
      // workerId identifies this specific worker instance. Passed to every CAS call
      // so the DB verifies BOTH worker_id AND lease_token.
      const workerId = `visuals-route-${randomUUID()}`

      // fn_claim_job: atomically queued → processing.
      // Assigns worker_id and a unique lease_token. Returns state_version (claim version N).
      const claim = await claimJob(jobId, workerId)

      if (claim.outcome !== 'claimed' || !claim.leaseToken || claim.stateVersion === null) {
        logger.info('job.visuals.claim_skipped', { job_id: jobId, outcome: claim.outcome })
        return
      }

      const { leaseToken, stateVersion, attemptCount } = claim

      logger.info('job.visuals.claimed', {
        job_id: jobId, worker_id: workerId, attempt_count: attemptCount,
      })

      // D13: heartbeat every ≈30s; each heartbeat renews to NOW() + 90s.
      // CANCELLATION ABORT: if the heartbeat is refused (fn_heartbeat_job returns false),
      // it means cancel_requested has been set. Set the abort flag, clear the interval,
      // and immediately call acknowledgeCancel (cancel_requested → cancelled).
      // acknowledgeCancel checks state_version = claimVersion + 1 internally (SQL fixed).
      const claimStateVersion = stateVersion
      let cancelledByHeartbeat = false

      const heartbeatInterval = setInterval(async () => {
        if (cancelledByHeartbeat) return
        const renewed = await heartbeatJob(jobId, workerId, leaseToken, claimStateVersion)
        if (!renewed) {
          cancelledByHeartbeat = true
          clearInterval(heartbeatInterval)
          logger.warn('job.visuals.heartbeat_refused_abort', { job_id: jobId })
          // Acknowledge the cancellation immediately. The SQL checks state_version = N+1.
          // We pass the claim version N; the DB verifies N+1 is the current version.
          try {
            await acknowledgeCancel(jobId, workerId, leaseToken, claimStateVersion)
            logger.info('job.visuals.cancel_acknowledged_via_heartbeat', { job_id: jobId })
          } catch {
            // acknowledgeCancel failed — job may be in a terminal state already or the
            // lease expired. Stale recovery will handle the cancel_requested transition.
            logger.warn('job.visuals.heartbeat_cancel_acknowledge_failed', { job_id: jobId })
          }
        }
      }, 30_000)

      try {
        // C03: Stage visuals in versioned attempt-scoped Storage paths FIRST.
        // study_visuals is NOT written here — only after the CAS wins.
        // Staged objects in the private bucket remain unreferenced if CAS fails.
        // stageVisualsForJob creates its own authenticated + service-role clients
        // internally (no client passed from the request context).
        const staged = await stageVisualsForJob(
          documentId,
          user.id,
          jobId,
          attemptCount ?? 1,
        )

        clearInterval(heartbeatInterval)

        // If cancelled by heartbeat, do not attempt to publish.
        // The cancel has already been acknowledged (or will be handled by stale recovery).
        if (cancelledByHeartbeat) {
          logger.info('job.visuals.aborted_after_staging', { job_id: jobId })
          return
        }

        // ATOMIC PUBLICATION: fn_complete_and_publish_job performs in one transaction:
        //   1. Validates: job ID, status = 'processing', worker_id, lease_token,
        //      state_version = claimVersion, lease not expired.
        //   2. If processing at claim version → completes job AND upserts study_visuals.
        //   3. If cancel_requested at claim version + 1 → cancels job (D1 wins).
        //      study_visuals NOT written. Staged Storage objects stay private/unreferenced.
        //   4. Any write failure → full rollback; job stays at current status.
        const completion = await completeAndPublishJob(
          jobId,
          workerId,
          leaseToken,
          claimStateVersion,
          staged.items,
          staged.model,
        )

        logger.info('job.visuals.completion', {
          job_id: jobId,
          outcome: completion.outcome,
          final_status: completion.finalStatus,
          visual_count: completion.visualCount,
        })

        if (completion.outcome !== 'completed') {
          logger.info('job.visuals.not_published', { job_id: jobId, outcome: completion.outcome })
        }
      } catch (err) {
        clearInterval(heartbeatInterval)

        // If heartbeat already acknowledged cancel, just log — don't fail the job twice.
        if (cancelledByHeartbeat) {
          logger.warn('job.visuals.generation_failed_after_cancel', { job_id: jobId })
          return
        }

        const code = classifyError(err)
        const messageKey = publicMessageKeyForCode(code)
        const supportRef = generateSupportReference()

        const failure = await failJob(jobId, workerId, leaseToken, claimStateVersion, code, messageKey, supportRef)

        logger.error('job.visuals.failed', {
          job_id: jobId,
          outcome: failure.outcome,
          final_status: failure.finalStatus,
          public_error_code: code,
          support_reference: supportRef,
        })
      }
    })

    return NextResponse.json({
      jobId,
      requestKey: returnedRequestKey,
      isExisting: enqueueResult.is_existing,
    })
  } catch {
    logger.error('job.visuals.route_error', { error_code: 'ROUTE_ERROR' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
