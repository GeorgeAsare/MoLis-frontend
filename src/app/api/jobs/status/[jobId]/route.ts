import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { JobSafeDto } from '@/lib/jobs/stateMachine'

export const dynamic = 'force-dynamic'

// Returns only the safe public DTO via fn_get_job_safe_dto RPC.
// The RPC enforces auth.uid() ownership and returns only safe fields.
// Unlike the old view approach, the RPC is NOT automatically updatable
// and is not exposed as a Data API endpoint.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabase.rpc('fn_get_job_safe_dto', {
    p_job_id: jobId,
  })

  if (error) {
    logger.warn('job.status.rpc_failed', { job_id: jobId, error_class: 'rpc_error' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const raw = data as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const resultSummary = raw.result_summary as Record<string, unknown> | null
  const dto: JobSafeDto = {
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

  return NextResponse.json(dto)
}
