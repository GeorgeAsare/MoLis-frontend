-- ═══════════════════════════════════════════════════════════════════════════════
-- MoLis — Atomic Flashcard Append RPC
-- FILE:   migrations/append_flashcards_rpc.sql
-- STATUS: PENDING GEORGE'S APPROVAL — DO NOT APPLY TO PRODUCTION WITHOUT REVIEW
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE
-- ───────
-- Eliminate two production risks in the current addFlashcards() action:
--
--   RISK 1 — DECK LOSS: DELETE succeeds, INSERT fails → student loses entire deck.
--   RISK 2 — CONCURRENT LOST UPDATE: two simultaneous Add Cards requests race;
--            the later INSERT silently overwrites the earlier batch.
--
-- COLUMN TYPES — VERIFIED FROM PRODUCTION READ-ONLY INSPECTION
-- ─────────────────────────────────────────────────────────────
-- public.flashcards.cards                   data_type: jsonb  udt_name: jsonb  NOT NULL
-- public.flashcard_progress.card_statuses   data_type: jsonb  udt_name: jsonb  NOT NULL
--
-- FUNCTION BEHAVIOUR (one implicit PL/pgSQL transaction)
-- ───────────────────────────────────────────────────────
-- 1. Auth:         reject if auth.uid() is null
-- 2. Input:        NULL-guard p_document_id, p_expected_count; reject negative count;
--                  reject if p_new_cards is not a non-empty JSON array;
--                  validate every array element against the FlashcardItem contract
--                  before any mutation occurs
-- 3. Lock:         SELECT flashcards row FOR UPDATE — serialises concurrent callers
-- 4. Concurrency:  reject if jsonb_array_length(cards) ≠ p_expected_count
-- 5. Append:       UPDATE cards = cards || p_new_cards — no DELETE, no lost-deck window
-- 6. Progress:     read card_statuses length
--                  • misaligned with p_expected_count → RAISE EXCEPTION (not silent skip)
--                  • aligned → append v_new_count "unseen" strings; reset phase to 'ready'
--                  • no row → skip; progress initialises on student's next session start
-- 7. Return:       updated flashcards row as jsonb
--
-- FlashcardItem CONTRACT (authority: src/types/flashcard.ts + safeCards() validator)
-- ────────────────────────────────────────────────────────────────────────────────────
-- front        string   required   non-blank (trim)
-- back         string   required   non-blank (trim)
-- topic        string   required   any string (no blank constraint in safeCards)
-- difficulty   string   required   'easy' | 'medium' | 'hard' only
-- image_prompt string|null required  JSON null or any string
-- concept_id   string   optional   must be string if present (not null)
--
-- CALLER REPLACEMENT (in addFlashcards() once this migration is approved and applied)
-- ─────────────────────────────────────────────────────────────────────────────────────
-- Replace: DELETE + INSERT + separate progress upsert block
-- With:
--   const { data: updated, error: rpcError } = await supabase.rpc('append_flashcards', {
--     p_document_id:    documentId,
--     p_new_cards:      deduplicatedNew,
--     p_expected_count: existingCards.length,
--   })
--   if (rpcError) {
--     if (rpcError.message.includes('Concurrent modification')) {
--       throw new Error('Your deck was updated by another request. Please try again.')
--     }
--     void recordUsage({ generation_type: 'flashcards', document_id: documentId,
--                        success: false, error_type: 'save_failed', model: 'gpt-4o-mini' })
--     throw new Error(rpcError.message ?? 'Failed to save extended flashcard set')
--   }
--   void recordUsage({ generation_type: 'flashcards', document_id: documentId,
--                      success: true, model: 'gpt-4o-mini' })
--   return (updated as unknown) as FlashcardSet
--
-- VERIFICATION (run after applying)
-- SELECT proname, prosecdef, provolatile FROM pg_proc
-- WHERE proname = 'append_flashcards' AND pronamespace = 'public'::regnamespace;
--
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.append_flashcards(uuid, jsonb, integer);

CREATE OR REPLACE FUNCTION public.append_flashcards(
  p_document_id    uuid,
  p_new_cards      jsonb,    -- JSON array of FlashcardItem objects
  p_expected_count integer   -- deck size at caller's read time; used as optimistic lock
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id       uuid    := auth.uid();
  v_row           public.flashcards%ROWTYPE;
  v_current_count integer;
  v_new_count     integer;
  v_prog_count    integer;
  v_card          jsonb;
  v_idx           integer;
BEGIN
  -- ── 1. Auth guard ─────────────────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── 2. Parameter NULL and range guards ────────────────────────────────────────

  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'p_document_id must not be NULL';
  END IF;

  -- Explicit NULL check first; do not rely on NULL comparison yielding FALSE.
  IF p_expected_count IS NULL THEN
    RAISE EXCEPTION 'p_expected_count must not be NULL';
  END IF;
  IF p_expected_count < 0 THEN
    RAISE EXCEPTION 'p_expected_count must not be negative';
  END IF;

  IF p_new_cards IS NULL THEN
    RAISE EXCEPTION 'p_new_cards must not be NULL';
  END IF;

  IF jsonb_typeof(p_new_cards) <> 'array' THEN
    RAISE EXCEPTION 'p_new_cards must be a JSON array';
  END IF;

  v_new_count := jsonb_array_length(p_new_cards);
  IF v_new_count = 0 THEN
    RAISE EXCEPTION 'No new cards provided';
  END IF;

  -- ── 2a. Per-element FlashcardItem validation ───────────────────────────────────
  -- Validates every card against the authoritative contract before any mutation.
  -- Rejects non-objects, JSON null/primitive elements, missing or wrong-typed required
  -- fields, blank required strings, invalid difficulty enum, and concept_id of wrong
  -- type. Does not add constraints beyond what safeCards() and FlashcardItem enforce.
  FOR v_idx IN 0 .. v_new_count - 1 LOOP
    v_card := p_new_cards -> v_idx;

    -- Element must be a JSON object (rejects null, string, number, array)
    IF jsonb_typeof(v_card) <> 'object' THEN
      RAISE EXCEPTION 'Card at index %: element must be a JSON object', v_idx;
    END IF;

    -- front: required, string, non-blank after trim
    IF NOT (v_card ? 'front')
       OR jsonb_typeof(v_card -> 'front') <> 'string'
       OR trim(v_card ->> 'front') = ''
    THEN
      RAISE EXCEPTION 'Card at index %: front must be a non-blank string', v_idx;
    END IF;

    -- back: required, string, non-blank after trim
    IF NOT (v_card ? 'back')
       OR jsonb_typeof(v_card -> 'back') <> 'string'
       OR trim(v_card ->> 'back') = ''
    THEN
      RAISE EXCEPTION 'Card at index %: back must be a non-blank string', v_idx;
    END IF;

    -- topic: required, string (no blank constraint — matches safeCards)
    IF NOT (v_card ? 'topic')
       OR jsonb_typeof(v_card -> 'topic') <> 'string'
    THEN
      RAISE EXCEPTION 'Card at index %: topic must be a string', v_idx;
    END IF;

    -- difficulty: required, exactly one of the three supported values
    -- jsonb_typeof check before ->> prevents JSON null from bypassing the IN comparison
    IF NOT (v_card ? 'difficulty')
       OR jsonb_typeof(v_card -> 'difficulty') <> 'string'
       OR (v_card ->> 'difficulty') NOT IN ('easy', 'medium', 'hard')
    THEN
      RAISE EXCEPTION 'Card at index %: difficulty must be easy, medium, or hard', v_idx;
    END IF;

    -- image_prompt: required key; value must be JSON null or a string
    IF NOT (v_card ? 'image_prompt')
       OR jsonb_typeof(v_card -> 'image_prompt') NOT IN ('null', 'string')
    THEN
      RAISE EXCEPTION 'Card at index %: image_prompt must be a string or null', v_idx;
    END IF;

    -- concept_id: optional; if present must be a string (not JSON null)
    IF (v_card ? 'concept_id')
       AND jsonb_typeof(v_card -> 'concept_id') <> 'string'
    THEN
      RAISE EXCEPTION 'Card at index %: concept_id, if present, must be a string', v_idx;
    END IF;
  END LOOP;

  -- ── 3. Acquire exclusive row lock scoped to authenticated user ────────────────
  -- Concurrent Add Cards callers block here until the first caller commits or
  -- rolls back. WHERE user_id = v_user_id enforces per-user isolation.
  SELECT * INTO v_row
  FROM   public.flashcards
  WHERE  document_id = p_document_id
    AND  user_id     = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No flashcard set found for this document';
  END IF;

  -- ── 4. Optimistic concurrency guard ───────────────────────────────────────────
  -- The caller reads the deck before the OpenAI generation call. If a concurrent
  -- request completed and appended cards in that window, the count will differ.
  -- Both operands are concrete integers; p_expected_count IS NULL was rejected above.
  v_current_count := jsonb_array_length(v_row.cards);

  IF v_current_count <> p_expected_count THEN
    RAISE EXCEPTION
      'Concurrent modification: deck has % cards, expected %. Retry.',
      v_current_count, p_expected_count;
  END IF;

  -- ── 5. Atomic JSONB append ────────────────────────────────────────────────────
  -- No DELETE. Original card order is preserved exactly; new cards appear at the
  -- end. If this UPDATE fails, the transaction rolls back and the deck is intact.
  UPDATE public.flashcards
  SET    cards = cards || p_new_cards
  WHERE  id    = v_row.id;

  -- ── 6. Progress alignment (same transaction) ───────────────────────────────────
  -- card_statuses is jsonb (verified). Read the current length; raise an error if
  -- inconsistent; append one "unseen" string per new card when consistent.
  SELECT jsonb_array_length(card_statuses) INTO v_prog_count
  FROM   public.flashcard_progress
  WHERE  document_id = p_document_id
    AND  user_id     = v_user_id;

  IF FOUND THEN
    IF v_prog_count <> p_expected_count THEN
      RAISE EXCEPTION
        'Progress alignment inconsistent: card_statuses has % entries, deck has %. Cannot safely append new statuses.',
        v_prog_count, p_expected_count;
    END IF;

    -- Blocker 6: preserve an active session when the student adds cards mid-session.
    -- Only extend card_statuses with 'unseen' tails for the new cards.
    -- current_index, session_card_indices, session_config, review_learning_only
    -- are not listed in SET and are therefore preserved unchanged by PostgreSQL.
    UPDATE public.flashcard_progress
    SET
      card_statuses = card_statuses || (
        SELECT jsonb_agg('"unseen"'::jsonb)
        FROM   generate_series(1, v_new_count)
      ),
      phase         = CASE WHEN phase = 'studying' THEN 'studying' ELSE 'ready' END,
      updated_at    = now()
    WHERE document_id = p_document_id
      AND user_id     = v_user_id;
  END IF;
  -- No progress row: skip. Progress initialises on the student's next session start.

  -- ── 7. Return updated flashcards row ──────────────────────────────────────────
  RETURN (
    SELECT to_jsonb(f)
    FROM   public.flashcards f
    WHERE  id = v_row.id
  );
END;
$$;

-- ── Privileges ────────────────────────────────────────────────────────────────
REVOKE ALL     ON FUNCTION public.append_flashcards(uuid, jsonb, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.append_flashcards(uuid, jsonb, integer) TO authenticated;
