import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateVisualsForJob } from '@/app/actions/visuals'
import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlationId'

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json()) as { documentId?: string }
    const { documentId } = body
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    // Verify document ownership
    const { data: doc } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', documentId)
      .single()
    if (!doc || doc.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const correlationId = generateCorrelationId()

    // Cancel any stale active job
    await supabase
      .from('generation_jobs')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('document_id', documentId)
      .eq('job_type', 'visuals')
      .in('status', ['queued', 'processing'])

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: user.id,
        document_id: documentId,
        job_type: 'visuals',
        status: 'queued',
        correlation_id: correlationId,
      })
      .select()
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }

    logger.info('job.visuals.queued', {
      job_id: job.id,
      document_id: documentId,
      correlation_id: correlationId,
    })

    // Process after response is sent — continues independently of client connection
    after(async () => {
      try {
        await supabase
          .from('generation_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        const result = await generateVisualsForJob(documentId, user.id, supabase)

        await supabase
          .from('generation_jobs')
          .update({
            status: 'completed',
            result_data: { visual_count: result.visuals.length },
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        logger.info('job.visuals.completed', {
          job_id: job.id,
          visual_count: result.visuals.length,
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        await supabase
          .from('generation_jobs')
          .update({
            status: 'failed',
            error: errMsg,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
        logger.error('job.visuals.failed', { job_id: job.id, error: errMsg })
      }
    })

    return NextResponse.json({ jobId: job.id, correlationId })
  } catch (err) {
    logger.error('job.visuals.route_error', { error: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
