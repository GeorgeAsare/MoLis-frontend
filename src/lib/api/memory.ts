import { api } from './client'

export interface MemoryRecord {
  id: string
  content: string
  type: string
  created_at: string
  tags?: string[]
}

export async function getMemory(): Promise<MemoryRecord[]> {
  return api.get<MemoryRecord[]>('/memory')
}

export async function deleteMemory(id: string): Promise<void> {
  return api.delete<void>(`/memory/${id}`)
}
