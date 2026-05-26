'use server'

import { createClient } from '@/lib/supabase/server'

export async function saveExtractedText(
  documentId: string,
  text: string,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify ownership before writing
  const { data: doc } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single()

  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')

  const { error } = await supabase
    .from('documents')
    .update({ extracted_text: text.trim() })
    .eq('id', documentId)
    .eq('user_id', user.id)   // belt-and-suspenders RLS guard

  if (error) throw new Error(error.message)
}
