'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { UserMemory, SaveMemoryInput, MemoryCategory } from '@/types/userMemory'

// Idempotent write: if a memory with same source_agent + source_entity_id + category already exists
// and is active, update it rather than inserting a duplicate. If supersedes_key is given,
// deactivate matching memories first.
export async function saveMemory(input: SaveMemoryInput): Promise<UserMemory | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const now = new Date().toISOString()

    // Supersede related memories if key provided
    if (input.supersedes_key) {
      await supabase
        .from('user_memories')
        .update({ is_active: false, updated_at: now })
        .eq('user_id', user.id)
        .eq('source_agent', input.source_agent)
        .eq('category', input.category)
        .like('content', `%${input.supersedes_key}%`)
        .eq('is_active', true)
    }

    // Build lookup query for existing active memory
    let query = supabase
      .from('user_memories')
      .select('id')
      .eq('user_id', user.id)
      .eq('source_agent', input.source_agent)
      .eq('category', input.category)
      .eq('is_active', true)

    if (input.source_entity_id) {
      query = query.eq('source_entity_id', input.source_entity_id)
    }
    if (input.source_entity_type) {
      query = query.eq('source_entity_type', input.source_entity_type)
    }

    const { data: existing } = await query.maybeSingle()

    if (existing?.id) {
      const { data } = await supabase
        .from('user_memories')
        .update({
          content: input.content,
          metadata: input.metadata ?? {},
          importance: input.importance ?? 5,
          confidence: input.confidence ?? 8,
          expires_at: input.expires_at ?? null,
          updated_at: now,
          last_accessed_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single()
      return (data as UserMemory | null)
    }

    const { data } = await supabase
      .from('user_memories')
      .insert({
        user_id: user.id,
        source_agent: input.source_agent,
        source_entity_type: input.source_entity_type ?? null,
        source_entity_id: input.source_entity_id ?? null,
        category: input.category,
        content: input.content,
        metadata: input.metadata ?? {},
        importance: input.importance ?? 5,
        confidence: input.confidence ?? 8,
        is_active: true,
        expires_at: input.expires_at ?? null,
        last_accessed_at: now,
      })
      .select()
      .single()

    return (data as UserMemory | null)
  } catch (err) {
    logger.error('memory.save_failed', { error: String(err) })
    return null
  }
}

export async function getMemories(filters: {
  source_agent?: string
  category?: MemoryCategory
  source_entity_type?: string
  source_entity_id?: string
  limit?: number
}): Promise<UserMemory[]> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    let query = supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(filters.limit ?? 50)

    if (filters.source_agent) query = query.eq('source_agent', filters.source_agent)
    if (filters.category) query = query.eq('category', filters.category)
    if (filters.source_entity_type) query = query.eq('source_entity_type', filters.source_entity_type)
    if (filters.source_entity_id) query = query.eq('source_entity_id', filters.source_entity_id)

    const { data } = await query
    return (data ?? []) as UserMemory[]
  } catch {
    return []
  }
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('user_memories')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('user_id', user.id)
}

export async function clearMemoryCategory(
  category: MemoryCategory,
  source_agent?: string,
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  let query = supabase
    .from('user_memories')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('category', category)

  if (source_agent) query = query.eq('source_agent', source_agent)

  await query
}
