'use server'

import { createClient } from '@/lib/supabase/server'
import type { FlashcardProgress, FlashcardPhase, CardStatus } from '@/types/flashcardProgress'

export async function loadFlashcardProgress(documentId: string): Promise<FlashcardProgress | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('flashcard_progress')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle()

  return (data as FlashcardProgress | null) ?? null
}

export async function saveFlashcardProgress(
  documentId: string,
  progress: {
    card_statuses: CardStatus[]
    current_index: number
    phase: FlashcardPhase
    review_learning_only: boolean
    started_at?: string | null
    completed_at?: string | null
  },
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('flashcard_progress')
    .upsert(
      {
        document_id: documentId,
        user_id: user.id,
        ...progress,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'document_id,user_id' },
    )
}
