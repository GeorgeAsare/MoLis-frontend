export type MemoryCategory = 'activity' | 'knowledge' | 'preference' | 'performance' | 'engagement'

export interface UserMemory {
  id: string
  user_id: string
  source_agent: string
  source_entity_type: string | null
  source_entity_id: string | null
  category: MemoryCategory
  content: string
  metadata: Record<string, unknown>
  importance: number // 1–10
  confidence: number // 1–10
  is_active: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
  last_accessed_at: string
}

export interface SaveMemoryInput {
  source_agent: string
  source_entity_type?: string
  source_entity_id?: string
  category: MemoryCategory
  content: string
  metadata?: Record<string, unknown>
  importance?: number
  confidence?: number
  expires_at?: string | null
  supersedes_key?: string // if set, deactivate memories with this fingerprint key before inserting
}
