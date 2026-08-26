'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  FlashcardProgress,
  FlashcardPhase,
  CardStatus,
  SessionPersistedConfig,
} from '@/types/flashcardProgress'

// ── Atomic session start (race-safe) ──────────────────────────────────────────
// Calls start_flashcard_session RPC (v3) which:
//   • validates p_session_config structure (Blocker 2)
//   • rejects fractional or duplicate indices (Blocker 1)
//   • locks flashcards FOR UPDATE (serialises with append + update + clear)
//   • derives review_learning_only from session_config — single source of truth
//   • creates or updates the progress row with exact session_card_indices
//   • resets current_index to 0 and sets phase to 'studying'
// p_review_learning_only is NOT passed — it is derived server-side from session_config.

export async function startFlashcardSession(
  documentId: string,
  sessionIndices: number[],
  sessionConfig: SessionPersistedConfig,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('start_flashcard_session', {
    p_document_id:          documentId,
    p_session_card_indices: sessionIndices,
    p_session_config:       sessionConfig,
    p_started_at:           new Date().toISOString(),
  })

  if (error) {
    console.error('[startFlashcardSession]', error.message)
    return { error: error.message }
  }
  return { error: null }
}

// ── Atomic per-card status update (race-safe) ─────────────────────────────────
// Calls update_flashcard_status RPC (v3) which:
//   • holds flashcards FOR UPDATE lock (serialises with all other RPCs)
//   • rejects if no progress row exists (Blocker 4: no safety-net INSERT)
//   • rejects if phase != 'studying' (Blocker 4)
//   • rejects if session_card_indices or session_config is null (Blocker 4)
//   • validates answer binding: session_card_indices[persisted_index] == p_card_index (Blocker 4)
//   • advances current_index by 1 server-side (not caller-supplied)
//   • determines session completion from persisted state (done when position+1 >= length)
//   • clears session_card_indices + session_config on session completion
// p_current_index and p_phase are NOT passed — the RPC derives them from DB state.

export async function updateFlashcardStatus(
  documentId: string,
  cardIndex: number,
  newStatus: CardStatus,
  completedAt?: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('update_flashcard_status', {
    p_document_id:   documentId,
    p_card_index:    cardIndex,
    p_new_status:    newStatus,
    p_completed_at:  completedAt ?? null,
  })

  if (error) {
    console.error('[updateFlashcardStatus]', error.message)
    return { error: error.message }
  }
  return { error: null }
}

// ── Atomic session clear (race-safe) ──────────────────────────────────────────
// Calls clear_flashcard_session RPC which:
//   • acquires flashcards FOR UPDATE lock (same lock as update_flashcard_status)
//   • ensures: answer-first → clear waits; clear-first → next answer rejects (Blocker 5)
//   • sets phase='ready', current_index=0, clears session_card_indices + session_config
//   • no-ops if no progress row exists
// Previous implementation used a direct table UPDATE with no lock — replaced by RPC.

export async function clearFlashcardSession(
  documentId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('clear_flashcard_session', {
    p_document_id: documentId,
  })

  if (error) {
    console.error('[clearFlashcardSession]', error.message)
    return { error: error.message }
  }
  return { error: null }
}

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
