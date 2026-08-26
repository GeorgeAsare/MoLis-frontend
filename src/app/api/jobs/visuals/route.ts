import { randomUUID } from 'crypto'
import { after, NextResponse } from 'next/server'
import { stageVisualsForJob } from '@/lib/jobs/visualsWorker'
import { enqueueJob } from '@/app/actions/generationJobs'
import { ENQUEUE_RETRY_REQUIRED } from '@/lib/jobs/enqueueErrors'
import { claimJob, heartbeatJob, completeAndPublishJob, failJob, acknowledgeCancel } from '@/lib/jobs/workerClient'
import { classifyError, generateSupportReference, publicMessageKeyForCode } from '@/lib/jobs/errorClassifier'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

// D13 heartbeat timing constants.
// Lease = 90s. Heartbeat every ~30s gives ~60s buffer before expiry.
const HEARTBEAT_INTERVAL_MS  = 30_000
// Bounded transient retry: up to 3 heartbeat attempts on non-refusal RPC errors.
const HEARTBEAT_MAX_RETRIES  = 3
const HEARTBEAT_RETRY_DELAY_MS = 5_000

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
    // schema_version — not just sanitizedInput). On a concurrent new-job race, it
    // retries once automatically and throws ENQUEUE_RETRY_REQUIRED if unresolved.
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

      const claimStateVersion = stateVersion

      // Shared AbortController: signal is passed to stageVisualsForJob so that
      // cancellation or lease loss aborts all in-flight operations cleanly.
      const abortController = new AbortController()
      const { signal } = abortController

      // Typed heartbeat outcome tracking.
      // Only cancel_requested → acknowledgeCancel. Other refusal reasons → abort only.
      let aborted = false
      let heartbeatRetryCount = 0
      // R8-H04: in-flight guard prevents overlapping heartbeat calls when a slow RPC
      // takes longer than HEARTBEAT_INTERVAL_MS to respond. Without this guard, a
      // second setInterval tick could start a new heartbeat while the first is still
      // awaiting a response, creating an out-of-order state_version race.
      let heartbeatInFlight = false

      const heartbeatInterval = setInterval(async () => {
        if (aborted || heartbeatInFlight) return
        heartbeatInFlight = true

        try {
          const heartbeat = await heartbeatJob(jobId, workerId, leaseToken, claimStateVersion)

          if (heartbeat.renewed) {
            heartbeatRetryCount = 0
            return
            // finally block resets heartbeatInFlight before returning
          }

          // C07: Typed refusal — determine correct response per reason.
          switch (heartbeat.refusalReason) {
            case 'cancel_requested':
              aborted = true
              clearInterval(heartbeatInterval)
              abortController.abort()
              logger.warn('job.visuals.heartbeat_cancel_requested', { job_id: jobId })
              try {
                await acknowledgeCancel(jobId, workerId, leaseToken, claimStateVersion)
                logger.info('job.visuals.cancel_acknowledged_via_heartbeat', { job_id: jobId })
              } catch {
                logger.warn('job.visuals.heartbeat_cancel_acknowledge_failed', { job_id: jobId })
              }
              break

            case 'authority_lost':
            case 'job_not_processing':
            case 'terminal':
              // Authority lost — abort without state transition. Stale recovery handles the rest.
              aborted = true
              clearInterval(heartbeatInterval)
              abortController.abort()
              logger.warn('job.visuals.heartbeat_authority_lost', {
                job_id:        jobId,
                refusal_reason: heartbeat.refusalReason,
              })
              break

            default:
              // Transient RPC failure — bounded retry.
              heartbeatRetryCount++
              if (heartbeatRetryCount >= HEARTBEAT_MAX_RETRIES) {
                aborted = true
                clearInterval(heartbeatInterval)
                abortController.abort()
                logger.warn('job.visuals.heartbeat_max_retries_exceeded', { job_id: jobId })
              }
              await new Promise(r => setTimeout(r, HEARTBEAT_RETRY_DELAY_MS))
          }
        } catch {
          // R12-H05: heartbeatJob threw unexpectedly (network error, codec failure, etc).
          // Count as transient; abort after HEARTBEAT_MAX_RETRIES consecutive throws.
          heartbeatRetryCount++
          if (heartbeatRetryCount >= HEARTBEAT_MAX_RETRIES) {
            aborted = true
            clearInterval(heartbeatInterval)
            abortController.abort()
            logger.warn('job.visuals.heartbeat_max_retries_exceeded', { job_id: jobId })
          }
        } finally {
          // R10-H03: always reset the in-flight guard — covers success (early return),
          // cancellation, authority loss, transient failure, and thrown exceptions.
          heartbeatInFlight = false
        }
      }, HEARTBEAT_INTERVAL_MS)

      try {
        // C06 + C05: stageVisualsForJob derives userId and documentId via fn_get_claimed_job_context.
        // Never accepts userId from the request context — security boundary enforced in SQL.
        // The AbortController signal is passed so cancellation aborts all in-flight operations.
        const staged = await stageVisualsForJob(
          jobId,
          workerId,
          leaseToken,
          claimStateVersion,
          signal,
        )

        clearInterval(heartbeatInterval)

        // If authority was lost during staging, do not attempt to publish.
        if (aborted) {
          logger.info('job.visuals.aborted_after_staging', { job_id: jobId })
          return
        }

        // ATOMIC PUBLICATION: fn_complete_and_publish_job performs in one transaction:
        //   1. Validates: job ID, status='processing', worker_id, lease_token,
        //      state_version=claimVersion, lease not expired.
        //   2. If processing at claim version → completes job AND upserts study_visuals.
        //   3. If cancel_requested at claim version + 1 → cancels job (D1 wins).
        //      study_visuals NOT written. Staged Storage objects stay private/unreferenced.
        //   4. Any write failure → full rollback.
        const completion = await completeAndPublishJob(
          jobId,
          workerId,
          leaseToken,
          claimStateVersion,
          staged.items,
          staged.model,
          staged.resultCode,
        )

        logger.info('job.visuals.completion', {
          job_id:       jobId,
          outcome:      completion.outcome,
          final_status: completion.finalStatus,
          visual_count: completion.visualCount,
        })

        if (completion.outcome !== 'completed') {
          logger.info('job.visuals.not_published', { job_id: jobId, outcome: completion.outcome })
        }
      } catch (err) {
        clearInterval(heartbeatInterval)

        // If authority was already lost, just log — don't attempt a state transition.
        if (aborted) {
          logger.warn('job.visuals.generation_failed_after_abort', { job_id: jobId })
          return
        }

        const code = classifyError(err)
        const messageKey = publicMessageKeyForCode(code)
        const supportRef = generateSupportReference()

        const failure = await failJob(jobId, workerId, leaseToken, claimStateVersion, code, messageKey, supportRef)

        logger.error('job.visuals.failed', {
          job_id:           jobId,
          outcome:          failure.outcome,
          final_status:     failure.finalStatus,
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
