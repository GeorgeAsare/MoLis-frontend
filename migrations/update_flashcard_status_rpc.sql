-- ═══════════════════════════════════════════════════════════════════════════════
-- MoLis — Atomic Single-Card Status Update RPC (v3)
-- FILE:   migrations/update_flashcard_status_rpc.sql
-- STATUS: PENDING GEORGE'S APPROVAL — DO NOT APPLY TO PRODUCTION WITHOUT REVIEW
-- ORDER:  Apply AFTER add_session_fields_rpc.sql (references session_card_indices)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- CHANGES FROM v2 (never applied to production — safe to supersede)
-- ────────────────────────────────────────────────────────────────────
-- BLOCKER 4 (FIXED): Safety-net INSERT removed
--   • v2 INSERTed a new progress row when NOT FOUND, creating a studying session
--     from scratch with no validated start — violating the session contract
--   • v3 raises an exception: caller must call start_flashcard_session first
-- BLOCKER 4 (FIXED): Active-session invariant checks added
--   • Rejects if phase != 'studying'
--   • Rejects if session_card_indices IS NULL
--   • Rejects if session_config IS NULL
--   • Rejects if persisted current_index is out of session bounds
-- BLOCKER 4 (FIXED): Answer binding check added
--   • session_card_indices[persisted current_index] must equal p_card_index
--   • Prevents stale or wrong-position answers from succeeding
-- BLOCKER 4 (FIXED): RPC owns current_index advancement
--   • v2 accepted p_current_index from the caller (untrusted)
--   • v3 derives next index from persisted state: persisted_current_index + 1
-- BLOCKER 4 (FIXED): RPC determines session completion
--   • v2 accepted p_phase from the caller (untrusted)
--   • v3 derives phase from persisted state: done when position + 1 >= session_length
-- p_new_status: restricted to 'known' | 'learning' only (not 'unseen')
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- CALLER USAGE
-- ────────────
-- const { error } = await supabase.rpc('update_flashcard_status', {
--   p_document_id:  documentId,
--   p_card_index:   fullDeckIndex,    // 0-based index in flashcards.cards[]
--   p_new_status:   'known',          // or 'learning'
--   p_completed_at: isoString,        // or null; used when this is the final card
-- })
--
-- CONCURRENCY GUARANTEES
-- ──────────────────────
-- All four RPCs (start, update, clear, append) acquire the flashcards row FOR UPDATE
-- before touching progress. This serialises every operation:
--
--   Answer-first: answer commits (position advances) → clear acquires lock →
--     sees progress in its post-answer state → clears cleanly
--
--   Clear-first:  clear commits (phase='ready', indices=null) → next answer
--     acquires lock → sees phase != 'studying' → raises exception → rejected
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop v1 (p_review_learning_only + p_started_at)
DROP FUNCTION IF EXISTS public.update_flashcard_status(uuid, integer, text, integer, text, boolean, timestamptz, timestamptz);
-- Drop v2 (p_current_index + p_phase)
DROP FUNCTION IF EXISTS public.update_flashcard_status(uuid, integer, text, integer, text, timestamptz);
-- Drop v3 (idempotent reapplication)
DROP FUNCTION IF EXISTS public.update_flashcard_status(uuid, integer, text, timestamptz);

CREATE OR REPLACE FUNCTION public.update_flashcard_status(
  p_document_id  uuid,
  p_card_index   integer,      -- 0-based index within flashcards.cards[]
  p_new_status   text,         -- 'known' | 'learning' only; 'unseen' is not a valid answer
  p_completed_at timestamptz   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id      uuid    := auth.uid();
  v_fc_row       public.flashcards%ROWTYPE;
  v_deck_len     integer;
  v_prog         public.flashcard_progress%ROWTYPE;
  v_statuses     jsonb;
  v_gap          integer;
  v_current_pos  integer;
  v_session_len  integer;
  v_expected_idx integer;
  v_is_last      boolean;
  v_new_phase    text;
BEGIN
  -- ── 1. Auth guard ──────────────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── 2. Parameter guards ────────────────────────────────────────────────────
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'p_document_id must not be NULL';
  END IF;

  IF p_card_index IS NULL OR p_card_index < 0 THEN
    RAISE EXCEPTION 'p_card_index must be a non-negative integer';
  END IF;

  -- 'unseen' is not a valid answer — a card must be answered as known or learning
  IF p_new_status IS NULL OR p_new_status NOT IN ('known', 'learning') THEN
    RAISE EXCEPTION 'p_new_status must be known or learning; got: %',
      COALESCE(p_new_status, '<null>');
  END IF;

  -- ── 3. Lock flashcards row (serialises with append, start, and clear RPCs) ──
  SELECT * INTO v_fc_row
  FROM   public.flashcards
  WHERE  document_id = p_document_id
    AND  user_id     = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No flashcard set found for this document';
  END IF;

  v_deck_len := jsonb_array_length(v_fc_row.cards);

  -- ── 4. Validate deck index against authoritative deck length ───────────────
  IF p_card_index >= v_deck_len THEN
    RAISE EXCEPTION 'Card index % is out of range (deck has % cards)', p_card_index, v_deck_len;
  END IF;

  -- ── 5. Load progress row — reject if missing (Blocker 4) ──────────────────
  -- The safety-net INSERT has been removed. Callers must call start_flashcard_session
  -- before answering any card. Creating a studying session from scratch here would
  -- violate the session contract — session_card_indices and session_config would be
  -- absent, making every subsequent invariant check impossible.
  SELECT * INTO v_prog
  FROM   public.flashcard_progress
  WHERE  document_id = p_document_id
    AND  user_id     = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active session: call start_flashcard_session before answering cards';
  END IF;

  -- ── 6. Active-session invariant checks (Blocker 4) ────────────────────────
  IF v_prog.phase <> 'studying' THEN
    RAISE EXCEPTION 'No active session: phase is % (must be studying)', v_prog.phase;
  END IF;

  IF v_prog.session_card_indices IS NULL THEN
    RAISE EXCEPTION 'No active session: session_card_indices is null';
  END IF;

  IF v_prog.session_config IS NULL THEN
    RAISE EXCEPTION 'No active session: session_config is null';
  END IF;

  -- ── 7. Answer binding check (Blocker 4) ───────────────────────────────────
  -- The deck card being answered must match the card the session expects at the
  -- persisted current position. This prevents stale or wrong-position answers.
  v_current_pos := v_prog.current_index;
  v_session_len := jsonb_array_length(v_prog.session_card_indices);

  IF v_current_pos < 0 OR v_current_pos >= v_session_len THEN
    RAISE EXCEPTION 'Persisted current_index % is out of bounds for session of length %',
      v_current_pos, v_session_len;
  END IF;

  v_expected_idx := (v_prog.session_card_indices -> v_current_pos)::integer;
  IF v_expected_idx <> p_card_index THEN
    RAISE EXCEPTION
      'Answer binding mismatch: session expects deck card % at position %, got deck card %',
      v_expected_idx, v_current_pos, p_card_index;
  END IF;

  -- ── 8. Extend statuses if deck has grown via Add Cards ─────────────────────
  v_statuses := v_prog.card_statuses;
  v_gap := v_deck_len - jsonb_array_length(v_statuses);
  IF v_gap > 0 THEN
    v_statuses := v_statuses || (
      SELECT jsonb_agg('"unseen"'::jsonb)
      FROM   generate_series(1, v_gap)
    );
  END IF;

  -- ── 9. Update target card status ───────────────────────────────────────────
  v_statuses := jsonb_set(v_statuses, ARRAY[p_card_index::text], to_jsonb(p_new_status));

  -- ── 10. Determine session completion from persisted state ──────────────────
  -- RPC owns the current_index advance: persisted + 1, not caller-supplied value
  v_is_last   := (v_current_pos + 1) >= v_session_len;
  v_new_phase := CASE WHEN v_is_last THEN 'done' ELSE 'studying' END;

  -- ── 11. Persist ────────────────────────────────────────────────────────────
  UPDATE public.flashcard_progress
  SET
    card_statuses        = v_statuses,
    current_index        = CASE WHEN v_is_last THEN 0 ELSE v_current_pos + 1 END,
    phase                = v_new_phase,
    session_card_indices = CASE WHEN v_is_last THEN NULL ELSE session_card_indices END,
    session_config       = CASE WHEN v_is_last THEN NULL ELSE session_config       END,
    completed_at         = CASE WHEN v_is_last
                                THEN COALESCE(p_completed_at, now())
                                ELSE NULL
                           END,
    updated_at           = now()
  WHERE document_id = p_document_id
    AND user_id     = v_user_id;

  RETURN jsonb_build_object(
    'card_index',        p_card_index,
    'new_status',        p_new_status,
    'deck_length',       v_deck_len,
    'statuses_length',   jsonb_array_length(v_statuses),
    'new_current_index', CASE WHEN v_is_last THEN 0 ELSE v_current_pos + 1 END,
    'is_last',           v_is_last,
    'new_phase',         v_new_phase
  );
END;
$$;

-- ── Privileges ─────────────────────────────────────────────────────────────────
REVOKE ALL     ON FUNCTION public.update_flashcard_status(uuid, integer, text, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_flashcard_status(uuid, integer, text, timestamptz) TO authenticated;
