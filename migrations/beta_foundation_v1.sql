-- MoLis Beta Foundation V1 — DB Migration
-- Run in Supabase SQL Editor (Project → SQL Editor → New query)
-- Safe to re-run: uses IF NOT EXISTS; DROP POLICY IF EXISTS before CREATE POLICY
-- Execute each section in order.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. generation_jobs
--    Tracks background AI generation tasks (visuals, quiz, flashcards, etc.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generation_jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id    UUID        REFERENCES documents(id) ON DELETE CASCADE,
  job_type       TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'queued',
  input_data     JSONB,
  result_data    JSONB,
  error          TEXT,
  correlation_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,

  CONSTRAINT generation_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT generation_jobs_type_check
    CHECK (job_type IN ('visuals', 'flashcards', 'quiz', 'revision_notes', 'analysis'))
);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own jobs" ON generation_jobs;
CREATE POLICY "Users see own jobs" ON generation_jobs
  FOR ALL
  USING (auth.uid() = user_id);

-- Composite index for the most common lookup: find jobs for a doc+type
CREATE INDEX IF NOT EXISTS generation_jobs_user_doc_type
  ON generation_jobs (user_id, document_id, job_type);

-- Partial index for polling active jobs — keeps the set tiny
CREATE INDEX IF NOT EXISTS generation_jobs_status
  ON generation_jobs (status)
  WHERE status IN ('queued', 'processing');


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. user_memories
--    Persistent, user-scoped memory for Study, Recorder and future agents.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_memories (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_agent       TEXT        NOT NULL,           -- 'study' | 'recorder' | future agents
  source_entity_type TEXT,                           -- 'document' | 'recording' | etc.
  source_entity_id   TEXT,                           -- UUID of the entity (stored as text for flexibility)
  category           TEXT        NOT NULL,
  content            TEXT        NOT NULL,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  importance         INTEGER     NOT NULL DEFAULT 5, -- 1–10
  confidence         INTEGER     NOT NULL DEFAULT 8, -- 1–10
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_memories_category_check
    CHECK (category IN (
      'preference', 'goal', 'knowledge', 'weakness', 'activity', 'decision', 'context'
    )),
  CONSTRAINT user_memories_importance_check
    CHECK (importance BETWEEN 1 AND 10),
  CONSTRAINT user_memories_confidence_check
    CHECK (confidence BETWEEN 1 AND 10)
);

ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own memories" ON user_memories;
CREATE POLICY "Users see own memories" ON user_memories
  FOR ALL
  USING (auth.uid() = user_id);

-- Fast filtering for active memories by category and agent
CREATE INDEX IF NOT EXISTS user_memories_user_category
  ON user_memories (user_id, category)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS user_memories_user_agent
  ON user_memories (user_id, source_agent)
  WHERE is_active = TRUE;

-- Entity-scoped memory lookup (e.g. memories for a specific document)
CREATE INDEX IF NOT EXISTS user_memories_entity
  ON user_memories (user_id, source_entity_id)
  WHERE is_active = TRUE;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. usage_events
--    Immutable audit log of AI generation operations. Used for entitlement
--    enforcement, analytics and billing integration.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id       UUID        REFERENCES documents(id) ON DELETE SET NULL,
  generation_type   TEXT        NOT NULL,
  correlation_id    TEXT,                            -- links to generation_jobs.correlation_id
  tokens_used       INTEGER,
  images_generated  INTEGER     NOT NULL DEFAULT 0,
  success           BOOLEAN     NOT NULL DEFAULT TRUE,
  error_type        TEXT,
  duration_ms       INTEGER,
  model             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No updated_at — usage events are immutable append-only records
);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage for display purposes
DROP POLICY IF EXISTS "Users see own usage" ON usage_events;
CREATE POLICY "Users see own usage" ON usage_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Server-side inserts via anon key (server actions run as the authenticated user)
DROP POLICY IF EXISTS "Authenticated users insert own usage" ON usage_events;
CREATE POLICY "Authenticated users insert own usage" ON usage_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Chronological usage lookup (period billing, recent activity)
CREATE INDEX IF NOT EXISTS usage_events_user_date
  ON usage_events (user_id, created_at DESC);

-- Per-type usage counting for entitlement enforcement
CREATE INDEX IF NOT EXISTS usage_events_user_type
  ON usage_events (user_id, generation_type, success);

-- Correlation ID lookup to prevent retry double-counting
CREATE INDEX IF NOT EXISTS usage_events_correlation
  ON usage_events (correlation_id)
  WHERE correlation_id IS NOT NULL;
