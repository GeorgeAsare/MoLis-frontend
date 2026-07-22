'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlationId'
import type { GenerationJob, GenerationJobStatus, GenerationJobType } from '@/types/generationJob'

export async function createGenerationJob(
  documentId: string,
  jobType: GenerationJobType,
  inputData?: Record<string, unknown>,
): Promise<GenerationJob> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify document ownership
  const { data: doc } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single()
  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')

  // Cancel any stale queued/processing job for the same document+type
  await supabase
    .from('generation_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('job_type', jobType)
    .in('status', ['queued', 'processing'])

  const correlationId = generateCorrelationId()
  const { data, error } = await supabase
    .from('generation_jobs')
    .insert({
      user_id: user.id,
      document_id: documentId,
      job_type: jobType,
      status: 'queued',
      input_data: inputData ?? null,
      correlation_id: correlationId,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create job')

  logger.info('job.created', { job_id: data.id, job_type: jobType, correlation_id: correlationId })
  return data as GenerationJob
}

export async function getGenerationJob(jobId: string): Promise<GenerationJob | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .maybeSingle()

  return (data as GenerationJob | null) ?? null
}

export async function getActiveJobForDocument(
  documentId: string,
  jobType: GenerationJobType,
): Promise<GenerationJob | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('job_type', jobType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as GenerationJob | null) ?? null
}

export async function cancelGenerationJob(jobId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('generation_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', user.id)
    .in('status', ['queued', 'processing'])
}

export async function updateJobStatus(
  jobId: string,
  status: GenerationJobStatus,
  extra?: {
    result_data?: Record<string, unknown>
    error?: string
    started_at?: string
    completed_at?: string
  },
): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('generation_jobs')
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', jobId)
}
