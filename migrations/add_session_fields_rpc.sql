-- ═══════════════════════════════════════════════════════════════════════════════
-- MoLis — Session Resume Contract: Forward Migration + start_flashcard_session (v3)
-- FILE:   migrations/add_session_fields_rpc.sql
-- STATUS: PENDING GEORGE'S APPROVAL — DO NOT APPLY TO PRODUCTION WITHOUT REVIEW
-- ORDER:  Apply this file BEFORE update_flashcard_status_rpc.sql (columns required)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- CHANGES FROM v2 (never applied to production — safe to supersede)
-- ────────────────────────────────────────────────────────────────────
-- BLOCKER 1 (FIXED): Fractional index rejection
--   • v2 cast (p_session_card_indices -> v_idx)::integer which silently rounds 2.5 → 3
--   • v3 casts to numeric first and checks v_num_val <> floor(v_num_val) — rejects fractions
-- BLOCKER 1 (FIXED): Duplicate index rejection
--   • v2 had no duplicate check; [1, 4, 4, 7] was accepted
--   • v3 tracks seen indices in v_seen_indices integer[] and rejects any repeat
-- BLOCKER 2 (FIXED): session_config validation
--   • v2 accepted any value (NULL, JSON null, primitive, missing fields, wrong types)
--   • v3 validates: must be a JSON object; difficulty must be in enum; selected_topics
--     must be an array of strings; review_learning_only must be a boolean
-- BLOCKER 2 (FIXED): Single source of truth for review_learning_only
--   • v2 accepted a separate p_review_learning_only parameter which could differ from
--     session_config.review_learning_only — two conflicting sources of truth
--   • v3 removes p_review_learning_only; the value is derived exclusively from
--     session_config.review_learning_only and written to review_learning_only column
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Forward migration: add columns (idempotent — safe to reapply) ──────────

ALTER TABLE public.flashcard_progress
  ADD COLUMN IF NOT EXISTS session_card_indices jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS session_config       jsonb DEFAULT NULL;

-- ── 2. Drop old signatures for idempotent reapplication ───────────────────────

DROP FUNCTION IF EXISTS public.start_flashcard_session(uuid, jsonb, jsonb, boolean, timestamptz); -- v2
DROP FUNCTION IF EXISTS public.start_flashcard_session(uuid, jsonb, jsonb, timestamptz);           -- v3 (idempotent)

-- ── 3. start_flashcard_session RPC (v3) ───────────────────────────────────────
--
-- Atomically begins a flashcard study session:
--   • locks flashcards FOR UPDATE (serialises with append_flashcards + update_flashcard_status)
--   • validates session_config structure (Blocker 2)
--   • validates every index: type, non-fractional, in-range, non-duplicate (Blocker 1)
--   • creates or updates progress row with exact session_card_indices + session_config
--   • derives review_learning_only exclusively from session_config (single source of truth)
--   • resets current_index to 0
--
-- CALLER USAGE
-- ────────────
-- const { error } = await supabase.rpc('start_flashcard_session', {
--   p_document_id:          documentId,
--   p_session_card_indices: sessionIndices,   // number[] — strict integers, no dups
--   p_session_config:       { difficulty, selected_topics, review_learning_only },
--   p_started_at:           new Date().toISOString(),  // optional
-- })

CREATE OR REPLACE FUNCTION public.start_flashcard_session(
  p_document_id          uuid,
  p_session_card_indices jsonb,       -- ordered array of 0-based deck indices (strict integers, no dups)
  p_session_config       jsonb,       -- { difficulty, selected_topics, review_learning_only }
  p_started_at           timestamptz  DEFAULT NOW()
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
  v_sess_len     integer;
  v_statuses     jsonb;
  v_gap          integer;
  v_idx          integer;
  v_num_val      numeric;
  v_idx_val      integer;
  v_seen_indices integer[] := '{}';
  v_difficulty   text;
  v_sel_topics   jsonb;
  v_rl_only      boolean;
BEGIN
  -- ── 1. Auth guard ──────────────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── 2. Core parameter guards ───────────────────────────────────────────────
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'p_document_id must not be NULL';
  END IF;

  IF p_session_card_indices IS NULL OR jsonb_typeof(p_session_card_indices) <> 'array' THEN
    RAISE EXCEPTION 'p_session_card_indices must be a non-null JSON array';
  END IF;

  v_sess_len := jsonb_array_length(p_session_card_indices);
  IF v_sess_len = 0 THEN
    RAISE EXCEPTION 'p_session_card_indices must not be empty';
  END IF;

  -- ── 3. Validate p_session_config (Blocker 2) ──────────────────────────────

  -- Must be a non-null JSON object (rejects SQL NULL, JSON null, primitives, arrays)
  IF p_session_config IS NULL OR jsonb_typeof(p_session_config) <> 'object' THEN
    RAISE EXCEPTION 'p_session_config must be a non-null JSON object';
  END IF;

  -- difficulty: must be one of the four allowed enum values
  v_difficulty := p_session_config ->> 'difficulty';
  IF v_difficulty IS NULL OR v_difficulty NOT IN ('easy', 'medium', 'hard', 'mixed') THEN
    RAISE EXCEPTION 'session_config.difficulty must be easy, medium, hard, or mixed; got: %',
      COALESCE(v_difficulty, '<null>');
  END IF;

  -- selected_topics: must be a JSON array
  v_sel_topics := p_session_config -> 'selected_topics';
  IF v_sel_topics IS NULL OR jsonb_typeof(v_sel_topics) <> 'array' THEN
    RAISE EXCEPTION 'session_config.selected_topics must be a JSON array';
  END IF;

  -- Each topic element must be a string
  FOR v_idx IN 0 .. jsonb_array_length(v_sel_topics) - 1 LOOP
    IF jsonb_typeof(v_sel_topics -> v_idx) <> 'string' THEN
      RAISE EXCEPTION 'session_config.selected_topics[%] must be a string', v_idx;
    END IF;
  END LOOP;

  -- review_learning_only: must be a JSON boolean — NOT a JSON string, null, number, or object.
  -- ->> converts any JSON value to text, so "true" (string) and true (boolean) both produce
  -- the text 'true'. jsonb_typeof check is applied FIRST to reject the string case.
  -- IS DISTINCT FROM handles both: missing field (SQL NULL) and non-boolean JSON types.
  IF jsonb_typeof(p_session_config -> 'review_learning_only') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION
      'session_config.review_learning_only must be a JSON boolean (true or false); got type: %',
      COALESCE(jsonb_typeof(p_session_config -> 'review_learning_only'), '<missing field>');
  END IF;
  -- Type is confirmed 'boolean' — cast directly; no ->> text round-trip needed
  v_rl_only := (p_session_config -> 'review_learning_only')::boolean;

  -- ── 4. Lock flashcards row (serialises with append_flashcards + update_flashcard_status) ──
  SELECT * INTO v_fc_row
  FROM   public.flashcards
  WHERE  document_id = p_document_id
    AND  user_id     = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No flashcard set found for this document';
  END IF;

  v_deck_len := jsonb_array_length(v_fc_row.cards);

  -- ── 5. Validate every session index (Blocker 1) ────────────────────────────
  FOR v_idx IN 0 .. v_sess_len - 1 LOOP
    -- Must be a JSON number type (rejects strings, booleans, null, objects, arrays)
    IF jsonb_typeof(p_session_card_indices -> v_idx) <> 'number' THEN
      RAISE EXCEPTION 'session_card_indices[%] is not a number (type: %)',
        v_idx, jsonb_typeof(p_session_card_indices -> v_idx);
    END IF;

    -- Cast to numeric first to detect fractional values (2.5::integer would silently round)
    v_num_val := (p_session_card_indices -> v_idx)::numeric;
    IF v_num_val <> floor(v_num_val) THEN
      RAISE EXCEPTION 'session_card_indices[%] is not an integer: %', v_idx, v_num_val;
    END IF;
    v_idx_val := v_num_val::integer;

    -- Must be within the authoritative deck bounds
    IF v_idx_val < 0 OR v_idx_val >= v_deck_len THEN
      RAISE EXCEPTION 'session_card_indices[%] = % is out of range (deck has % cards)',
        v_idx, v_idx_val, v_deck_len;
    END IF;

    -- Must not appear more than once in the session
    IF v_idx_val = ANY(v_seen_indices) THEN
      RAISE EXCEPTION 'session_card_indices[%] is a duplicate: %', v_idx, v_idx_val;
    END IF;
    v_seen_indices := v_seen_indices || v_idx_val;
  END LOOP;

  -- ── 6. Get or create progress row ─────────────────────────────────────────
  SELECT card_statuses INTO v_statuses
  FROM   public.flashcard_progress
  WHERE  document_id = p_document_id
    AND  user_id     = v_user_id;

  IF NOT FOUND THEN
    v_statuses := (
      SELECT jsonb_agg('"unseen"'::jsonb)
      FROM   generate_series(1, v_deck_len)
    );
    INSERT INTO public.flashcard_progress (
      document_id, user_id, card_statuses,
      current_index, phase, review_learning_only,
      session_card_indices, session_config,
      started_at, completed_at, updated_at
    ) VALUES (
      p_document_id, v_user_id, v_statuses,
      0, 'studying', v_rl_only,
      p_session_card_indices, p_session_config,
      p_started_at, NULL, now()
    );
    RETURN jsonb_build_object(
      'deck_length',    v_deck_len,
      'session_length', v_sess_len,
      'created',        true
    );
  END IF;

  -- ── 7. Extend statuses to current deck length (deck may have grown via Add Cards) ──
  v_gap := v_deck_len - jsonb_array_length(v_statuses);
  IF v_gap > 0 THEN
    v_statuses := v_statuses || (
      SELECT jsonb_agg('"unseen"'::jsonb)
      FROM   generate_series(1, v_gap)
    );
  END IF;

  -- ── 8. Persist session start ──────────────────────────────────────────────
  -- review_learning_only derived from session_config: single source of truth
  UPDATE public.flashcard_progress
  SET
    card_statuses        = v_statuses,
    current_index        = 0,
    phase                = 'studying',
    review_learning_only = v_rl_only,
    session_card_indices = p_session_card_indices,
    session_config       = p_session_config,
    started_at           = p_started_at,
    completed_at         = NULL,
    updated_at           = now()
  WHERE document_id = p_document_id
    AND user_id     = v_user_id;

  RETURN jsonb_build_object(
    'deck_length',    v_deck_len,
    'session_length', v_sess_len,
    'created',        false
  );
END;
$$;

-- ── Privileges ─────────────────────────────────────────────────────────────────
REVOKE ALL     ON FUNCTION public.start_flashcard_session(uuid, jsonb, jsonb, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_flashcard_session(uuid, jsonb, jsonb, timestamptz) TO authenticated;
