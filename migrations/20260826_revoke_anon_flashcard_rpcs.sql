-- ═══════════════════════════════════════════════════════════════════════════════
-- MoLis — Revoke anon EXECUTE from Flashcard RPCs
-- FILE:   migrations/20260826_revoke_anon_flashcard_rpcs.sql
-- ORDER:  7 — apply after clear_session_rpc.sql (order 6)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHY THIS EXISTS
-- ───────────────
-- During production application of orders 3–6 (2026-08-26), Supabase was
-- observed granting explicit anon EXECUTE on each newly created function even
-- after the migration had already issued REVOKE ALL ... FROM PUBLIC.
-- George manually issued four additional REVOKE statements during the production
-- verification pass to close this gap.
--
-- This migration reproduces that exact security state so a fresh-environment
-- deployment arrives in the same privilege configuration without requiring
-- manual intervention.
--
-- SECURITY INTENT
-- ───────────────
-- All four flashcard RPCs are SECURITY DEFINER and guard auth.uid() internally,
-- but defence-in-depth requires that unauthenticated (anon) callers cannot
-- invoke them at the database-privilege layer at all.
--
-- IDEMPOTENT
-- ──────────
-- REVOKE is a no-op if the privilege is not held. Safe to reapply.
--
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL PRIVILEGES ON FUNCTION public.append_flashcards(uuid, jsonb, integer)
  FROM anon;

REVOKE ALL PRIVILEGES ON FUNCTION public.start_flashcard_session(uuid, jsonb, jsonb, timestamptz)
  FROM anon;

REVOKE ALL PRIVILEGES ON FUNCTION public.update_flashcard_status(uuid, integer, text, timestamptz)
  FROM anon;

REVOKE ALL PRIVILEGES ON FUNCTION public.clear_flashcard_session(uuid)
  FROM anon;
