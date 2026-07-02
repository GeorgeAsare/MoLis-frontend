'use server'

import { createClient } from '@/lib/supabase/server'

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function saveExtractedText(
  documentId: string,
  text: string,
): Promise<SaveResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Not authenticated' }

  // Verify ownership before writing
  const { data: doc } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single()

  if (!doc) return { ok: false, error: 'Document not found' }
  if (doc.user_id !== user.id) return { ok: false, error: 'Not authorized' }

  // .select('id') makes Supabase return the updated rows.
  // If RLS blocks the write or the row doesn't exist, data will be [] instead
  // of null — which lets us detect a silent 0-row update rather than treating
  // it as success.
  const { data: updated, error } = await supabase
    .from('documents')
    .update({ extracted_text: text })
    .eq('id', documentId)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    return { ok: false, error: `Database error: ${error.message}` }
  }

  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        'Save matched 0 rows — the documents table is probably missing an UPDATE policy. ' +
        'Run this in your Supabase SQL editor:\n' +
        'CREATE POLICY "documents_update" ON documents FOR UPDATE ' +
        'USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
    }
  }

  return { ok: true }
}
