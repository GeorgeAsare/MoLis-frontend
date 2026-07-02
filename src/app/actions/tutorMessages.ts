'use server'

import { createClient } from '@/lib/supabase/server'
import type { TutorMessage } from '@/types/tutor'

export async function loadTutorMessages(documentId: string): Promise<TutorMessage[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('tutor_messages')
    .select('role, content, mode, created_at')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(50)

  if (!data) return []

  return data.map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content as string,
    mode: (row.mode ?? undefined) as TutorMessage['mode'],
    timestamp: new Date(row.created_at as string).getTime(),
  }))
}

export async function appendTutorMessage(
  documentId: string,
  message: { role: 'user' | 'assistant'; content: string; mode?: string | null },
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('tutor_messages').insert({
    document_id: documentId,
    user_id: user.id,
    role: message.role,
    content: message.content,
    mode: message.mode ?? null,
  })
}

export async function clearTutorMessages(documentId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('tutor_messages')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', user.id)
}
