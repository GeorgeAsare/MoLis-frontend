'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { RecordUsageInput } from '@/types/usageEvent'

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('usage_events').insert({
      user_id: user.id,
      document_id: input.document_id ?? null,
      generation_type: input.generation_type,
      correlation_id: input.correlation_id ?? null,
      tokens_used: input.tokens_used ?? null,
      images_generated: input.images_generated ?? 0,
      success: input.success,
      error_type: input.error_type ?? null,
      duration_ms: input.duration_ms ?? null,
      model: input.model ?? null,
    })

    logger.info('usage.recorded', {
      generation_type: input.generation_type,
      success: input.success,
      duration_ms: input.duration_ms,
    })
  } catch (err) {
    // Never surface usage-recording errors to users
    logger.error('usage.record_failed', { error: String(err) })
  }
}
