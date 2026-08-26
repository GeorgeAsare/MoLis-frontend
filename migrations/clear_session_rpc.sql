-- ═══════════════════════════════════════════════════════════════════════════════
-- MoLis — Atomic Session Clear RPC
-- FILE:   migrations/clear_session_rpc.sql
-- STATUS: PENDING GEORGE'S APPROVAL — DO NOT APPLY TO PRODUCTION WITHOUT REVIEW
-- ORDER:  Apply AFTER add_session_fields_rpc.sql (session columns required)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE (Blocker 5)
-- ───────────────────
-- Replaces the previous direct UPDATE in clearFlashcardSession() which had no
-- lock and could race with in-flight update_flashcard_status calls:
--
--   Before (unsafe): client UPDATE to flashcard_progress ran without holding the
--     flashcards FOR UPDATE lock — an answer RPC could commit concurrently,
--     potentially restoring session state that the clear had just wiped, or
--     the clear wiping state that an answer was mid-write.
--
--   After (safe): this RPC acquires the SAME flashcards FOR UPDATE lock used by
--     start_flashcard_session, update_flashcard_status, and append_flashcards:
--
--     Answer-first: answer acquires lock → commits (position advances) →
--       lock released → clear acquires lock → sees updated (but still studying)
--       state → clears cleanly to ready
--
--     Clear-first: clear acquires lock → commits (phase='ready', indices=null,
--       config=null) → lock released → pending answer acquires lock → reads
--       phase != 'studying' → raises exception → answer rejected; session
--       cannot be resurrected
--
-- CALLER USAGE
-- ────────────
-- const { error } = await supabase.rpc('clear_flashcard_session', {
--   p_document_id: documentId,
-- })
--
-- RETURNS
-- ───────
-- { cleared: true }
-- No-ops silently if no progress row exists (e.g. session was never started).
--
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.clear_flashcard_session(uuid);

CREATE OR REPLACE FUNCTION public.clear_flashcard_session(
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- ── 1. Auth guard ──────────────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'p_document_id must not be NULL';
  END IF;

  -- ── 2. Lock flashcards row (same lock as update_flashcard_status + append) ──
  PERFORM 1
  FROM   public.flashcards
  WHERE  document_id = p_document_id
    AND  user_id     = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No flashcard set found for this document';
  END IF;

  -- ── 3. Clear session fields (no-op if no progress row exists) ─────────────
  UPDATE public.flashcard_progress
  SET
    phase                = 'ready',
    current_index        = 0,
    session_card_indices = NULL,
    session_config       = NULL,
    updated_at           = now()
  WHERE document_id = p_document_id
    AND user_id     = v_user_id;

  RETURN jsonb_build_object('cleared', true);
END;
$$;

-- ── Privileges ─────────────────────────────────────────────────────────────────
REVOKE ALL     ON FUNCTION public.clear_flashcard_session(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_flashcard_session(uuid) TO authenticated;
