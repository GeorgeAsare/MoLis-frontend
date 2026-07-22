import { createClient } from '@/lib/supabase/client'
import type { StudyDocument } from '@/types/document'

export async function fetchDocuments(userId: string): Promise<StudyDocument[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('documents')
    .select('id, user_id, title, file_path, file_type, created_at, subject_id, source_recording_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function deleteDocument(id: string, filePath: string | null): Promise<void> {
  const supabase = createClient()

  if (filePath) {
    const { error: storageError } = await supabase.storage
      .from('study-documents')
      .remove([filePath])

    if (storageError) throw new Error(storageError.message)
  }

  const { error: dbError } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)

  if (dbError) throw new Error(dbError.message)
}
