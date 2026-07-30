-- MoLis — Generation Job State Machine + Durable Request Ledger (Consolidated)
-- This is the SINGLE corrective migration to apply after beta_foundation_v1.sql.
--
-- ── MIGRATION ORDER ──────────────────────────────────────────────────────────
-- 1. migrations/beta_foundation_v1.sql   — historical baseline (immutable)
-- 2. migrations/20260729120001_generation_job_state_machine_schema.sql  ← this file
--
-- ── DEPLOYMENT PATHS ─────────────────────────────────────────────────────────
-- Existing-upgrade path (environment already running beta_foundation_v1):
--   beta_foundation_v1.sql is already applied and the application may be running.
--   This corrective migration closes the unsafe authority left by beta_foundation_v1
--   (FOR ALL policy, unrestricted authenticated table access). Execution requires
--   an approved maintenance window with enqueue disabled end-to-end before apply.
--   Database and application state must be rehearsed before the production window.
--   Runbook, backup, and forward-recovery plan are required before execution.
--
-- Fresh-project path (new environment, no migrations applied yet):
--   The API must NOT be exposed and must NOT accept users between the application
--   of beta_foundation_v1.sql and this corrective migration. Both migrations must
--   be completed atomically before the environment becomes accessible. A canonical
--   fresh baseline combining both migrations remains an open item requiring database
--   inspection (D12) and George's approval before it can be finalised.
--
-- DO NOT claim beta_foundation_v1.sql is independently secure. On its own it leaves
-- authenticated users with FOR ALL table access including UPDATE on generation_jobs.
-- This migration is the security closure.
--
-- ── WHY fn_enqueue_job IS GRANTED LAST ───────────────────────────────────────
-- fn_enqueue_job requires the generation_job_requests ledger table and its constraints
-- to exist BEFORE any enqueue call can be accepted. Granting authenticated execute
-- before the ledger is ready creates a window where request keys are not durably
-- bound. This migration therefore grants enqueue as its FINAL action, after:
--   (a) generation_job_requests is created, RLS-enabled, and deny-all policies applied;
--   (b) the strict backfill validates and migrates all historical data;
--   (c) all worker RPCs, safe reads, and cancel RPCs are ready.
-- There must be NO committed boundary where fn_enqueue_job is callable by authenticated
-- but the ledger does not exist and is not validated.
--
-- Forward-only. Do NOT edit after application. Corrections go in a new migration.
--
-- ── SECURITY STATE AFTER THIS MIGRATION ──────────────────────────────────────
--   generation_jobs:
--     anon          — REVOKE ALL
--     authenticated — REVOKE ALL (direct table access). Callable only via RPCs.
--     service_role  — full access (Supabase superuser-equivalent)
--
--   generation_job_requests:
--     anon          — REVOKE ALL, RLS deny-all policy
--     authenticated — REVOKE ALL, RLS deny-all policy (access only via fn_enqueue_job)
--     service_role  — full access (bypasses RLS)
--
--   Authenticated callable RPCs:
--     fn_get_job_safe_dto, fn_get_active_job_for_document
--     fn_request_job_cancel
--     fn_enqueue_job  ← granted last
--
--   Service-role-only RPCs:
--     fn_claim_job, fn_heartbeat_job, fn_complete_job,
--     fn_complete_and_publish_job, fn_fail_job,
--     fn_acknowledge_cancel, fn_recover_stale_jobs
--
-- ── IDEMPOTENCY CONTRACT ──────────────────────────────────────────────────────
--   The generation_job_requests table is the authoritative idempotency ledger.
--   It records every (user, request_key) → job_id binding, including D2 bindings
--   where a second key resolves to an already-active job. Bindings are permanent:
--   terminal jobs do NOT free their ledger slot. A new key is required for a new
--   user action.
--
--   generation_jobs.request_idempotency_key is the ORIGINATING key only — the key
--   that CREATED the job. Its unique index is a data-integrity constraint, not the
--   authoritative idempotency lookup path.
--
--   Key format: "${userId}:${UUID}" — composite userId prefix is verified in SQL.
--   Payload hash: canonical SHA-256 of { schema_version, operation_kind, document_id,
--                 job_type, sanitized_input } — must be 64 lowercase hex characters.
--   Same key + same hash → return associated job (any status, including terminal).
--   Same key + different hash → P0004 IDEMPOTENCY_PAYLOAD_CONFLICT.
--   Active-job exclusion (D2) is a SEPARATE control: a second key while one job is
--   active is durably bound to that job in the same transaction.
--
-- ── CANCELLATION VERSION PROTOCOL ────────────────────────────────────────────
--   1. fn_claim_job: queued (version N) → processing (version N+1). Returns N+1.
--   2. fn_request_job_cancel: processing (N+1) → cancel_requested (N+2).
--      queued → cancelled (terminal) is also legal.
--      Repeated requests on cancel_requested are no-ops (version unchanged).
--   3. Worker passes the claim version (N+1) to all subsequent calls.
--   4. fn_acknowledge_cancel / cancel branches of complete/fail:
--      Must check state_version = p_state_version + 1 (= N+2).
--      This proves the worker holds the legitimate claim and that exactly one
--      cancellation increment has occurred.
--   5. Stale workers from a prior claim have a different lease_token and are
--      rejected regardless of version.
--   6. cancel_requested → cancelled is the only transition; it sets completed_at.
--      cancel_requested can never become completed, failed, or queued.
--   7. Stale recovery (fn_recover_stale_jobs) correctly moves stale cancel_requested
--      → cancelled and never requeues cancel_requested jobs.
--
-- ── WORKER IDENTITY ──────────────────────────────────────────────────────────
--   Every worker transition verifies BOTH worker_id AND lease_token in the WHERE
--   clause. D13: lease = 90 seconds (renewed per heartbeat). Heartbeat interval ≈ 30s.
--
-- ── ATOMIC PUBLICATION ───────────────────────────────────────────────────────
--   fn_complete_and_publish_job transitions the job to completed AND writes
--   study_visuals in one transaction. The stored manifest contains Storage paths
--   (not public URLs). Signed URLs are issued by a trusted server endpoint after
--   ownership verification. If either write fails, both roll back.
--
-- ── PRIVATE STORAGE ──────────────────────────────────────────────────────────
--   The study-visuals Storage bucket must exist and be private before this migration
--   runs. This migration asserts that invariant, sets public = FALSE, and adds a
--   deny-all RLS policy on storage.objects for the bucket.
--   Images are stored at immutable, attempt-scoped paths. Upload uses upsert = false.
--   Orphaned (lost-race or post-cancel) objects are private and unreachable.
--   Cleanup of orphaned objects is blocked on D8-D10 retention/deletion gates.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Prerequisite assertions — fail before weakening any permissions
-- ─────────────────────────────────────────────────────────────────────────────

-- Assert generation_jobs has no duplicate active jobs that would block the index.
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT user_id, document_id, job_type
    FROM public.generation_jobs
    WHERE status IN ('queued', 'processing', 'cancel_requested')
    GROUP BY user_id, document_id, job_type
    HAVING COUNT(*) > 1
  ) dup;
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: % row group(s) have duplicate active jobs for the same '
      '(user_id, document_id, job_type). Resolve before applying this migration.',
      v_count;
  END IF;
END;
$$;

-- Assert idempotency key XOR: no row has one of (key, hash) without the other.
-- Rows with both NULL are acceptable (no idempotency key supplied).
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.generation_jobs
  WHERE (request_idempotency_key IS NULL) != (request_payload_hash IS NULL);
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: % generation_jobs rows have (request_idempotency_key, '
      'request_payload_hash) XOR state (one NULL, one not NULL). '
      'Manual inspection required before applying this migration.',
      v_count;
  END IF;
END;
$$;

-- Assert no duplicate (user_id, request_idempotency_key) pairs in generation_jobs.
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM (
    SELECT user_id, request_idempotency_key
    FROM public.generation_jobs
    WHERE request_idempotency_key IS NOT NULL
    GROUP BY user_id, request_idempotency_key
    HAVING COUNT(*) > 1
  ) dup;
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: % (user_id, request_idempotency_key) pairs appear in '
      'multiple generation_jobs rows. This contradicts the idempotency contract '
      'and must be manually resolved before applying this migration.',
      v_count;
  END IF;
END;
$$;

-- Assert study-visuals Storage bucket exists and is private.
-- Create the bucket externally (via Supabase console or management API) before
-- applying this migration. Setting public = FALSE here is idempotent if already set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'study-visuals') THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: storage bucket ''study-visuals'' does not exist. '
      'Create a PRIVATE bucket named study-visuals before applying this migration.';
  END IF;
END;
$$;
UPDATE storage.buckets SET public = FALSE WHERE name = 'study-visuals';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Schema: widen status CHECK to include cancel_requested
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_status_check;
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'cancel_requested', 'completed', 'failed', 'cancelled'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Schema: add state-machine and worker columns (nullable/defaulted — safe)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS state_version        INTEGER     NOT NULL DEFAULT 1;
-- Originating request key (the key that CREATED this job). NOT the ledger lookup path.
-- Format: "${userId}:${UUID}". Authoritative idempotency mapping is in generation_job_requests.
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS request_idempotency_key TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS request_payload_hash    TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS public_error_code       TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS public_message_key      TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS support_reference       TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS worker_id               TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS lease_token             UUID;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS lease_expires_at        TIMESTAMPTZ;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS heartbeat_at            TIMESTAMPTZ;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS attempt_count           INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS max_attempts            INTEGER     NOT NULL DEFAULT 3;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill state_version for pre-migration rows
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.generation_jobs SET state_version = 1 WHERE state_version IS NULL OR state_version = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Indexes on generation_jobs
-- ─────────────────────────────────────────────────────────────────────────────
-- D2 active-job exclusion: at most one active job per (user, document, job_type).
CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_active_exclusion
  ON public.generation_jobs (user_id, document_id, job_type)
  WHERE status IN ('queued', 'processing', 'cancel_requested');

-- Originating-key uniqueness: prevents two jobs from sharing the same creating key.
-- This is a data-integrity constraint, NOT the authoritative idempotency path.
CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_originating_key
  ON public.generation_jobs (user_id, request_idempotency_key)
  WHERE request_idempotency_key IS NOT NULL;

-- Active-status polling index.
CREATE INDEX IF NOT EXISTS generation_jobs_active_status
  ON public.generation_jobs (status)
  WHERE status IN ('queued', 'processing', 'cancel_requested');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Unique constraint on (id, user_id) required for the composite FK from the ledger
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT IF NOT EXISTS generation_jobs_id_user_id_unique UNIQUE (id, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Drop legacy views, policies, and all prior function signatures
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.generation_jobs_owner_view;
DROP VIEW IF EXISTS public.generation_jobs_safe_view;
DROP POLICY IF EXISTS "Users see own jobs"           ON public.generation_jobs;
DROP POLICY IF EXISTS "generation_jobs_owner_select" ON public.generation_jobs;

DROP FUNCTION IF EXISTS public.fn_claim_job(UUID, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.fn_claim_job(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.fn_heartbeat_job(UUID, UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.fn_heartbeat_job(UUID, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.fn_heartbeat_job(UUID, TEXT, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.fn_complete_job(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.fn_complete_job(UUID, UUID, INTEGER, JSONB);
DROP FUNCTION IF EXISTS public.fn_complete_job(UUID, TEXT, UUID, INTEGER, JSONB);
DROP FUNCTION IF EXISTS public.fn_complete_and_publish_job(UUID, TEXT, UUID, INTEGER, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.fn_fail_job(UUID, UUID, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_fail_job(UUID, UUID, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_fail_job(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_acknowledge_cancel(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.fn_acknowledge_cancel(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.fn_acknowledge_cancel(UUID, TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.fn_request_job_cancel(UUID);
DROP FUNCTION IF EXISTS public.fn_get_job_safe_dto(UUID);
DROP FUNCTION IF EXISTS public.fn_get_active_job_for_document(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_enqueue_job(UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.fn_recover_stale_jobs();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Revoke all direct table access from non-privileged roles on generation_jobs
--    REVOKE ALL includes SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
--    service_role bypasses RLS and retains full access.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Create generation_job_requests — the authoritative idempotency ledger
--
--    Separates "which key maps to which job" from "which key created the job".
--    Every accepted (user, request_key) → job_id binding is recorded here,
--    including D2 bindings (a second key while an active job exists).
--    Bindings are permanent: terminal jobs do NOT free their slot.
--
--    Composite FK (job_id, user_id) → generation_jobs(id, user_id):
--      Proves ledger.user_id == jobs.user_id at the database level.
--      Requires the UNIQUE constraint added in step 6.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.generation_job_requests (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL,
  request_idempotency_key TEXT        NOT NULL,
  request_payload_hash    TEXT        NOT NULL,
  job_id                  UUID        NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT generation_job_requests_pkey
    PRIMARY KEY (id),

  CONSTRAINT generation_job_requests_unique_key
    UNIQUE (user_id, request_idempotency_key),

  -- Composite FK: verifies ledger.user_id == jobs.user_id at the DB level.
  -- ON DELETE RESTRICT: prevents deletion of a job that has ledger entries.
  -- Deletion policy is blocked on D8-D10 retention/tombstone gates.
  CONSTRAINT generation_job_requests_job_user_fk
    FOREIGN KEY (job_id, user_id)
    REFERENCES public.generation_jobs (id, user_id)
    ON DELETE RESTRICT,

  CONSTRAINT generation_job_requests_user_fk
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE RESTRICT
);

CREATE INDEX generation_job_requests_job_id
  ON public.generation_job_requests (job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Enable RLS on generation_job_requests + deny-all policies
--     ACL revocation below denies direct access. RLS provides defense in depth:
--     even if a future GRANT accidentally allows table access, no rows are visible.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_job_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_deny_authenticated"
  ON public.generation_job_requests
  FOR ALL
  TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE POLICY "ledger_deny_anon"
  ON public.generation_job_requests
  FOR ALL
  TO anon
  USING (FALSE)
  WITH CHECK (FALSE);

REVOKE ALL PRIVILEGES ON TABLE public.generation_job_requests FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.generation_job_requests FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.generation_job_requests FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Strict backfill: migrate existing originating keys into the ledger
--
--     Preflight validates historical data before touching the ledger.
--     INSERT is strict (no ON CONFLICT DO NOTHING): any conflict indicates
--     a data-integrity violation that must be investigated, not silently skipped.
--     Postcondition asserts every eligible row is represented in the ledger.
--
--     Only rows with BOTH key and hash are eligible (XOR rows were caught in step 1).
--     Rows with both NULL have no idempotency key and require no ledger entry.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_eligible_count INTEGER;
  v_ledger_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_eligible_count
  FROM public.generation_jobs
  WHERE request_idempotency_key IS NOT NULL
    AND request_payload_hash    IS NOT NULL;

  IF v_eligible_count > 0 THEN
    INSERT INTO public.generation_job_requests
      (user_id, request_idempotency_key, request_payload_hash, job_id)
    SELECT user_id, request_idempotency_key, request_payload_hash, id
    FROM public.generation_jobs
    WHERE request_idempotency_key IS NOT NULL
      AND request_payload_hash    IS NOT NULL;
    -- No ON CONFLICT clause: any conflict is a data violation and must fail.

    SELECT COUNT(*) INTO v_ledger_count FROM public.generation_job_requests;

    IF v_ledger_count != v_eligible_count THEN
      RAISE EXCEPTION
        'BACKFILL ASSERTION FAILED: expected % ledger rows (one per eligible '
        'generation_jobs row), but found %. Data integrity check required.',
        v_eligible_count, v_ledger_count;
    END IF;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Storage: deny direct authenticated/anon access to study-visuals objects
--     Workers upload via service_role (bypasses RLS).
--     Students receive short-lived signed URLs from the server-side endpoint.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "study_visuals_deny_direct" ON storage.objects;
CREATE POLICY "study_visuals_deny_direct"
  ON storage.objects
  FOR ALL
  TO authenticated, anon
  USING  (bucket_id = 'study-visuals' AND FALSE)
  WITH CHECK (FALSE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. fn_get_job_safe_dto — GRANT TO authenticated
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_get_job_safe_dto(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_job     RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, document_id, job_type, status,
         public_error_code, public_message_key, support_reference,
         created_at, started_at, completed_at, result_data
  INTO v_job
  FROM public.generation_jobs
  WHERE id = p_job_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id',                 v_job.id,
    'document_id',        v_job.document_id,
    'job_type',           v_job.job_type,
    'status',             v_job.status,
    'public_error_code',  v_job.public_error_code,
    'public_message_key', v_job.public_message_key,
    'support_reference',  v_job.support_reference,
    'created_at',         v_job.created_at,
    'started_at',         v_job.started_at,
    'completed_at',       v_job.completed_at,
    'result_summary',     CASE
                            WHEN v_job.result_data IS NOT NULL
                            THEN jsonb_build_object('visual_count', v_job.result_data -> 'visual_count')
                            ELSE NULL
                          END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_job_safe_dto(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_job_safe_dto(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. fn_get_active_job_for_document — GRANT TO authenticated
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_get_active_job_for_document(p_document_id UUID, p_job_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_job     RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, document_id, job_type, status,
         public_error_code, public_message_key, support_reference,
         created_at, started_at, completed_at, result_data
  INTO v_job
  FROM public.generation_jobs
  WHERE user_id     = v_user_id
    AND document_id = p_document_id
    AND job_type    = p_job_type
    AND status IN ('queued', 'processing', 'cancel_requested')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id',                 v_job.id,
    'document_id',        v_job.document_id,
    'job_type',           v_job.job_type,
    'status',             v_job.status,
    'public_error_code',  v_job.public_error_code,
    'public_message_key', v_job.public_message_key,
    'support_reference',  v_job.support_reference,
    'created_at',         v_job.created_at,
    'started_at',         v_job.started_at,
    'completed_at',       v_job.completed_at,
    'result_summary',     CASE
                            WHEN v_job.result_data IS NOT NULL
                            THEN jsonb_build_object('visual_count', v_job.result_data -> 'visual_count')
                            ELSE NULL
                          END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_active_job_for_document(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_active_job_for_document(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. fn_claim_job — GRANT TO service_role ONLY
--
--    queued (N) → processing (N+1). Returns the new state_version (N+1).
--    The route stores this as the claim version and passes it to all subsequent calls.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_claim_job(
  p_job_id                 UUID,
  p_worker_id              TEXT,
  p_lease_duration_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status        TEXT;
  v_attempt_count INTEGER;
  v_max_attempts  INTEGER;
  v_state_version INTEGER;
  v_new_token     UUID;
  v_new_version   INTEGER;
  v_new_attempt   INTEGER;
BEGIN
  IF p_lease_duration_seconds < 30 OR p_lease_duration_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_LEASE_DURATION: must be between 30 and 3600 seconds'
      USING ERRCODE = 'P0011';
  END IF;

  SELECT status, attempt_count, max_attempts, state_version
  INTO v_status, v_attempt_count, v_max_attempts, v_state_version
  FROM public.generation_jobs
  WHERE id = p_job_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','lease_token',NULL,'state_version',NULL,'attempt_count',NULL);
  END IF;

  IF v_status != 'queued' THEN
    RETURN jsonb_build_object('outcome','not_queued','lease_token',NULL,'state_version',NULL,'attempt_count',v_attempt_count);
  END IF;

  IF v_attempt_count >= v_max_attempts THEN
    UPDATE public.generation_jobs
    SET status             = 'failed',
        public_error_code  = 'JOB_FAILED_PERMANENT',
        public_message_key = 'errors.job.failed',
        support_reference  = 'SR-MAXATTEMPTS-' || UPPER(TO_CHAR(NOW(), 'J')),
        completed_at       = NOW(),
        updated_at         = NOW(),
        state_version      = state_version + 1
    WHERE id = p_job_id AND status = 'queued' AND state_version = v_state_version;
    RETURN jsonb_build_object('outcome','max_attempts_exceeded','lease_token',NULL,'state_version',NULL,'attempt_count',v_attempt_count);
  END IF;

  v_new_token := gen_random_uuid();

  UPDATE public.generation_jobs
  SET status           = 'processing',
      worker_id        = p_worker_id,
      lease_token      = v_new_token,
      lease_expires_at = NOW() + (p_lease_duration_seconds || ' seconds')::INTERVAL,
      heartbeat_at     = NOW(),
      attempt_count    = attempt_count + 1,
      state_version    = state_version + 1,
      started_at       = COALESCE(started_at, NOW()),
      updated_at       = NOW()
  WHERE id            = p_job_id
    AND status        = 'queued'
    AND state_version = v_state_version
  RETURNING state_version, attempt_count INTO v_new_version, v_new_attempt;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','lost_race','lease_token',NULL,'state_version',NULL,'attempt_count',NULL);
  END IF;

  RETURN jsonb_build_object(
    'outcome',       'claimed',
    'lease_token',   v_new_token::TEXT,
    'state_version', v_new_version,
    'attempt_count', v_new_attempt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_job(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_claim_job(UUID, TEXT, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. fn_heartbeat_job — GRANT TO service_role ONLY
--
--    D13: renews lease to NOW() + 90s (default). Refuses cancel_requested.
--    CANCEL WINS: a refused heartbeat signals the worker to call fn_acknowledge_cancel.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_heartbeat_job(
  p_job_id                 UUID,
  p_worker_id              TEXT,
  p_lease_token            UUID,
  p_state_version          INTEGER,
  p_lease_duration_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_expires TIMESTAMPTZ;
  v_row_count   INTEGER;
BEGIN
  IF p_lease_duration_seconds < 30 OR p_lease_duration_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_LEASE_DURATION: must be between 30 and 3600 seconds'
      USING ERRCODE = 'P0011';
  END IF;

  v_new_expires := NOW() + (p_lease_duration_seconds || ' seconds')::INTERVAL;

  UPDATE public.generation_jobs
  SET lease_expires_at = v_new_expires,
      heartbeat_at     = NOW(),
      updated_at       = NOW()
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version
    AND status           = 'processing'
    AND lease_expires_at > NOW();

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count > 0 THEN
    RETURN jsonb_build_object('renewed', TRUE, 'lease_expires_at', v_new_expires);
  ELSE
    RETURN jsonb_build_object('renewed', FALSE, 'lease_expires_at', NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_heartbeat_job(UUID, TEXT, UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_heartbeat_job(UUID, TEXT, UUID, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. fn_complete_job — GRANT TO service_role ONLY
--
--    For non-visuals job types (no separate publication step).
--    CANCELLATION VERSION PROTOCOL:
--      Cancel branch checks state_version = p_state_version + 1 (the N+2 version).
--      Worker passes claim version N+1; after cancel fn_request_job_cancel incremented
--      to N+2. This proves exactly one cancellation occurred since the claim.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_complete_job(
  p_job_id        UUID,
  p_worker_id     TEXT,
  p_lease_token   UUID,
  p_state_version INTEGER,
  p_result_data   JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ok            UUID;
  v_status        TEXT;
  v_stored_token  UUID;
  v_stored_worker TEXT;
  v_lease_expires TIMESTAMPTZ;
BEGIN
  -- Attempt 1: processing (claim version) → completed.
  UPDATE public.generation_jobs
  SET status           = 'completed',
      result_data      = p_result_data,
      lease_token      = NULL,
      lease_expires_at = NULL,
      worker_id        = NULL,
      completed_at     = NOW(),
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version
    AND status           = 'processing'
    AND lease_expires_at > NOW()
  RETURNING id INTO v_ok;

  IF v_ok IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','completed','final_status','completed');
  END IF;

  -- Attempt 2: D1 cancel wins. Cancel path requires state_version = claim_version + 1
  -- (fn_request_job_cancel incremented once after the claim).
  UPDATE public.generation_jobs
  SET status           = 'cancelled',
      lease_token      = NULL,
      lease_expires_at = NULL,
      worker_id        = NULL,
      completed_at     = NOW(),
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version + 1
    AND status           = 'cancel_requested'
    AND lease_expires_at > NOW()
  RETURNING id INTO v_ok;

  IF v_ok IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','cancelled','final_status','cancelled');
  END IF;

  SELECT status, lease_token, worker_id, lease_expires_at
  INTO v_status, v_stored_token, v_stored_worker, v_lease_expires
  FROM public.generation_jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','final_status',NULL);
  END IF;
  IF v_status IN ('completed','failed','cancelled') THEN
    RETURN jsonb_build_object('outcome','terminal','final_status',v_status);
  END IF;
  IF v_stored_token IS DISTINCT FROM p_lease_token OR v_stored_worker IS DISTINCT FROM p_worker_id THEN
    RETURN jsonb_build_object('outcome','wrong_token','final_status',NULL);
  END IF;
  IF v_lease_expires <= NOW() THEN
    RETURN jsonb_build_object('outcome','expired_lease','final_status',NULL);
  END IF;
  RETURN jsonb_build_object('outcome','lost_race','final_status',NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_complete_job(UUID, TEXT, UUID, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_complete_job(UUID, TEXT, UUID, INTEGER, JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. fn_complete_and_publish_job — GRANT TO service_role ONLY
--
--    Atomic: completes the job AND writes the study_visuals manifest in one transaction.
--    p_visuals JSONB: array of { topic, description, image_prompt, storage_path, status }
--                    Storage PATHS not public URLs (private bucket + signed-URL serving).
--    Cancel branch: state_version = p_state_version + 1 (see CANCELLATION VERSION PROTOCOL).
--    If cancel_requested: transitions to cancelled; study_visuals NOT written (D1).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_complete_and_publish_job(
  p_job_id        UUID,
  p_worker_id     TEXT,
  p_lease_token   UUID,
  p_state_version INTEGER,
  p_visuals       JSONB,
  p_model         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document_id   UUID;
  v_user_id       UUID;
  v_ok            UUID;
  v_status        TEXT;
  v_stored_token  UUID;
  v_stored_worker TEXT;
  v_lease_expires TIMESTAMPTZ;
  v_visual_count  INTEGER;
BEGIN
  v_visual_count := jsonb_array_length(COALESCE(p_visuals, '[]'::JSONB));

  -- Attempt 1: processing (claim version) → completed + publish manifest.
  UPDATE public.generation_jobs
  SET status           = 'completed',
      result_data      = jsonb_build_object('visual_count', v_visual_count),
      lease_token      = NULL,
      lease_expires_at = NULL,
      worker_id        = NULL,
      completed_at     = NOW(),
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version
    AND status           = 'processing'
    AND lease_expires_at > NOW()
  RETURNING id, document_id, user_id INTO v_ok, v_document_id, v_user_id;

  IF v_ok IS NOT NULL THEN
    -- CAS won: atomically publish storage manifest. Failure rolls back the job update.
    INSERT INTO public.study_visuals (document_id, user_id, visuals, model, created_at)
    VALUES (v_document_id, v_user_id, p_visuals, p_model, NOW())
    ON CONFLICT (document_id, user_id)
    DO UPDATE SET
      visuals    = EXCLUDED.visuals,
      model      = EXCLUDED.model;

    RETURN jsonb_build_object('outcome','completed','final_status','completed','visual_count',v_visual_count);
  END IF;

  -- Attempt 2: D1 cancel wins. Checks state_version = claim_version + 1.
  -- Does NOT write study_visuals. Staged Storage objects remain private and unreferenced.
  UPDATE public.generation_jobs
  SET status           = 'cancelled',
      lease_token      = NULL,
      lease_expires_at = NULL,
      worker_id        = NULL,
      completed_at     = NOW(),
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version + 1
    AND status           = 'cancel_requested'
    AND lease_expires_at > NOW()
  RETURNING id INTO v_ok;

  IF v_ok IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','cancelled','final_status','cancelled');
  END IF;

  SELECT status, lease_token, worker_id, lease_expires_at
  INTO v_status, v_stored_token, v_stored_worker, v_lease_expires
  FROM public.generation_jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','final_status',NULL);
  END IF;
  IF v_status IN ('completed','failed','cancelled') THEN
    RETURN jsonb_build_object('outcome','terminal','final_status',v_status);
  END IF;
  IF v_stored_token IS DISTINCT FROM p_lease_token OR v_stored_worker IS DISTINCT FROM p_worker_id THEN
    RETURN jsonb_build_object('outcome','wrong_token','final_status',NULL);
  END IF;
  IF v_lease_expires <= NOW() THEN
    RETURN jsonb_build_object('outcome','expired_lease','final_status',NULL);
  END IF;
  RETURN jsonb_build_object('outcome','lost_race','final_status',NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_complete_and_publish_job(UUID, TEXT, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_complete_and_publish_job(UUID, TEXT, UUID, INTEGER, JSONB, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. fn_fail_job — GRANT TO service_role ONLY
--
--    Cancel branch: state_version = p_state_version + 1.
--    Cancel takes precedence over failure (D1).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_fail_job(
  p_job_id            UUID,
  p_worker_id         TEXT,
  p_lease_token       UUID,
  p_state_version     INTEGER,
  p_error_code        TEXT,
  p_message_key       TEXT,
  p_support_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ok            UUID;
  v_status        TEXT;
  v_stored_token  UUID;
  v_stored_worker TEXT;
  v_lease_expires TIMESTAMPTZ;
BEGIN
  -- Attempt 1: D1 cancel wins. Checks state_version = claim_version + 1.
  UPDATE public.generation_jobs
  SET status           = 'cancelled',
      lease_token      = NULL,
      lease_expires_at = NULL,
      worker_id        = NULL,
      completed_at     = NOW(),
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version + 1
    AND status           = 'cancel_requested'
    AND lease_expires_at > NOW()
  RETURNING id INTO v_ok;

  IF v_ok IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','cancelled','final_status','cancelled');
  END IF;

  -- Attempt 2: normal failure (processing at claim version).
  UPDATE public.generation_jobs
  SET status             = 'failed',
      public_error_code  = p_error_code,
      public_message_key = p_message_key,
      support_reference  = p_support_reference,
      lease_token        = NULL,
      lease_expires_at   = NULL,
      worker_id          = NULL,
      completed_at       = NOW(),
      updated_at         = NOW(),
      state_version      = state_version + 1
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version
    AND status           = 'processing'
    AND lease_expires_at > NOW()
  RETURNING id INTO v_ok;

  IF v_ok IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','failed','final_status','failed');
  END IF;

  SELECT status, lease_token, worker_id, lease_expires_at
  INTO v_status, v_stored_token, v_stored_worker, v_lease_expires
  FROM public.generation_jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','final_status',NULL);
  END IF;
  IF v_status IN ('completed','failed','cancelled') THEN
    RETURN jsonb_build_object('outcome','terminal','final_status',v_status);
  END IF;
  IF v_stored_token IS DISTINCT FROM p_lease_token OR v_stored_worker IS DISTINCT FROM p_worker_id THEN
    RETURN jsonb_build_object('outcome','wrong_token','final_status',NULL);
  END IF;
  IF v_lease_expires <= NOW() THEN
    RETURN jsonb_build_object('outcome','expired_lease','final_status',NULL);
  END IF;
  RETURN jsonb_build_object('outcome','lost_race','final_status',NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_fail_job(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fail_job(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. fn_acknowledge_cancel — GRANT TO service_role ONLY
--
--    Called by the worker when heartbeat is refused (cancel_requested detected).
--    CANCELLATION VERSION PROTOCOL: checks state_version = p_state_version + 1.
--    Worker passes claim version (N+1); cancel increment made it N+2.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_acknowledge_cancel(
  p_job_id        UUID,
  p_worker_id     TEXT,
  p_lease_token   UUID,
  p_state_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ok            UUID;
  v_status        TEXT;
  v_stored_token  UUID;
  v_stored_worker TEXT;
  v_lease_expires TIMESTAMPTZ;
BEGIN
  -- Check state_version = p_state_version + 1: proves this is the one legitimate
  -- cancellation increment and the worker holds the correct claim.
  UPDATE public.generation_jobs
  SET status           = 'cancelled',
      lease_token      = NULL,
      lease_expires_at = NULL,
      worker_id        = NULL,
      completed_at     = NOW(),
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE id              = p_job_id
    AND worker_id        = p_worker_id
    AND lease_token      = p_lease_token
    AND state_version    = p_state_version + 1
    AND status           = 'cancel_requested'
    AND lease_expires_at > NOW()
  RETURNING id INTO v_ok;

  IF v_ok IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','cancelled','final_status','cancelled');
  END IF;

  SELECT status, lease_token, worker_id, lease_expires_at
  INTO v_status, v_stored_token, v_stored_worker, v_lease_expires
  FROM public.generation_jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','final_status',NULL);
  END IF;
  IF v_status IN ('completed','failed','cancelled') THEN
    RETURN jsonb_build_object('outcome','terminal','final_status',v_status);
  END IF;
  IF v_stored_token IS DISTINCT FROM p_lease_token OR v_stored_worker IS DISTINCT FROM p_worker_id THEN
    RETURN jsonb_build_object('outcome','wrong_token','final_status',NULL);
  END IF;
  IF v_lease_expires <= NOW() THEN
    RETURN jsonb_build_object('outcome','expired_lease','final_status',NULL);
  END IF;
  IF v_status != 'cancel_requested' THEN
    RETURN jsonb_build_object('outcome','not_cancel_requested','final_status',v_status);
  END IF;
  RETURN jsonb_build_object('outcome','lost_race','final_status',NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_acknowledge_cancel(UUID, TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_acknowledge_cancel(UUID, TEXT, UUID, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. fn_recover_stale_jobs — GRANT TO service_role ONLY
--
--    Cancel wins: stale cancel_requested → cancelled (never requeued).
--    stale processing: requeue if below max_attempts; permanently fail if at max.
--    Operational note: this function is unbounded and unscheduled. A scheduler
--    or cron trigger must be configured externally. Batch sizing and SKIP LOCKED
--    are deferred until volume metrics justify it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_recover_stale_jobs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cancelled   INTEGER := 0;
  v_requeued    INTEGER := 0;
  v_perm_failed INTEGER := 0;
  v_day_bucket  TEXT;
BEGIN
  v_day_bucket := UPPER(TO_CHAR(NOW(), 'J'));

  UPDATE public.generation_jobs
  SET status           = 'cancelled',
      worker_id        = NULL,
      lease_token      = NULL,
      lease_expires_at = NULL,
      completed_at     = COALESCE(completed_at, NOW()),
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE status          = 'cancel_requested'
    AND lease_expires_at < NOW();
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.generation_jobs
  SET status           = 'queued',
      worker_id        = NULL,
      lease_token      = NULL,
      lease_expires_at = NULL,
      heartbeat_at     = NULL,
      updated_at       = NOW(),
      state_version    = state_version + 1
  WHERE status          = 'processing'
    AND lease_expires_at < NOW()
    AND attempt_count   < max_attempts;
  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  UPDATE public.generation_jobs
  SET status             = 'failed',
      public_error_code  = 'JOB_FAILED_PERMANENT',
      public_message_key = 'errors.job.failed',
      support_reference  = 'SR-STALE-' || v_day_bucket,
      lease_token        = NULL,
      lease_expires_at   = NULL,
      worker_id          = NULL,
      completed_at       = NOW(),
      updated_at         = NOW(),
      state_version      = state_version + 1
  WHERE status          = 'processing'
    AND lease_expires_at < NOW()
    AND attempt_count   >= max_attempts;
  GET DIAGNOSTICS v_perm_failed = ROW_COUNT;

  RETURN jsonb_build_object(
    'cancelled',          v_cancelled,
    'requeued',           v_requeued,
    'permanently_failed', v_perm_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recover_stale_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_recover_stale_jobs() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. fn_request_job_cancel — GRANT TO authenticated
--
--    User-initiated cancellation. Atomic single UPDATE — no TOCTOU.
--    queued → cancelled (terminal; completed_at set).
--    processing → cancel_requested (intermediate; worker must acknowledge).
--    cancel_requested → no-op (idempotent; version unchanged).
--    Repeated calls on cancel_requested are no-ops (version does NOT increment again).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_request_job_cancel(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id    UUID;
  v_new_status TEXT;
  v_action     TEXT;
  v_chk_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.generation_jobs
  SET
    status        = CASE status
                      WHEN 'queued'     THEN 'cancelled'
                      WHEN 'processing' THEN 'cancel_requested'
                      ELSE status
                    END,
    state_version = CASE status
                      WHEN 'queued'     THEN state_version + 1
                      WHEN 'processing' THEN state_version + 1
                      ELSE state_version
                    END,
    -- Set completed_at when the job reaches a terminal state immediately (queued → cancelled).
    completed_at  = CASE status
                      WHEN 'queued' THEN NOW()
                      ELSE completed_at
                    END,
    updated_at    = NOW()
  WHERE id      = p_job_id
    AND user_id = v_user_id
    AND status NOT IN ('completed', 'failed', 'cancelled')
  RETURNING status INTO v_new_status;

  IF NOT FOUND THEN
    SELECT status INTO v_chk_status
    FROM public.generation_jobs
    WHERE id = p_job_id AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = 'P0005';
    ELSE
      RAISE EXCEPTION 'JOB_NOT_CANCELLABLE: current status is %', v_chk_status
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  v_action := CASE v_new_status
    WHEN 'cancelled'        THEN 'cancelled'
    WHEN 'cancel_requested' THEN 'cancel_requested'
    ELSE 'already_cancelling'
  END;

  RETURN jsonb_build_object('new_status', v_new_status, 'action', v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_request_job_cancel(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_request_job_cancel(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 23. fn_enqueue_job — LEDGER-AWARE — GRANT TO authenticated LAST
--
--    This function is granted to authenticated AS THE FINAL STEP in this migration.
--    The generation_job_requests table and all constraints must already exist.
--
--    THREE-STEP IDEMPOTENCY PROTOCOL:
--
--    Step 1 — Ledger lookup (authoritative):
--      If (user, key) exists in generation_job_requests:
--        same hash  → return the bound job (any status including terminal)
--        diff hash  → P0004 IDEMPOTENCY_PAYLOAD_CONFLICT
--
--    Step 2 — D2 active-job exclusion (independent):
--      If an active job exists for (user, doc, type):
--        WITH key → bind key to active job in ledger; return active job
--        No key   → return active job without ledger binding
--
--    Step 3 — Create new job + bind to ledger atomically:
--      BEGIN/EXCEPTION handles concurrent D2 race (unique_violation on generation_jobs)
--      and concurrent ledger binding (P0006 on generation_job_requests).
--
--    KEY FORMAT VALIDATION:
--      p_idempotency_key must be "${userId}:${UUID}" — both segments are UUIDs.
--      The userId prefix must match auth.uid(). This prevents false-prefix attacks.
--      p_payload_hash must be exactly 64 lowercase hex characters.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_enqueue_job(
  p_document_id       UUID,
  p_job_type          TEXT,
  p_idempotency_key   TEXT,
  p_payload_hash      TEXT,
  p_sanitized_input   JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id           UUID;
  v_request_key       TEXT;
  v_ledger_job_id     UUID;
  v_ledger_hash       TEXT;
  v_active_job_id     UUID;
  v_job_status        TEXT;
  v_new_job_id        UUID;
  v_rows              INTEGER;
  v_key_user_part     TEXT;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- ── Input validation ──────────────────────────────────────────────────────
  IF p_job_type NOT IN ('visuals', 'flashcards', 'quiz', 'revision_notes', 'analysis') THEN
    RAISE EXCEPTION 'INVALID_JOB_TYPE: %', p_job_type USING ERRCODE = 'P0002';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    -- Validate format: ${UUID}:${UUID} (both segments must be UUIDs).
    IF NOT (p_idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY_FORMAT: expected ${userId}:${uuid}' USING ERRCODE = 'P0008';
    END IF;
    -- Validate that the userId prefix matches the authenticated caller.
    v_key_user_part := split_part(p_idempotency_key, ':', 1);
    IF v_key_user_part::UUID != v_user_id THEN
      RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY_OWNER: userId prefix does not match caller' USING ERRCODE = 'P0008';
    END IF;
  END IF;

  IF p_payload_hash IS NOT NULL THEN
    IF NOT (p_payload_hash ~ '^[0-9a-f]{64}$') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD_HASH_FORMAT: expected 64 lowercase hex characters' USING ERRCODE = 'P0009';
    END IF;
  END IF;

  IF octet_length(p_sanitized_input::TEXT) > 65536 THEN
    RAISE EXCEPTION 'INVALID_INPUT: sanitized input exceeds 64 KB limit' USING ERRCODE = 'P0010';
  END IF;

  -- ── Document ownership ────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = p_document_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND_OR_NOT_OWNED' USING ERRCODE = 'P0003';
  END IF;

  -- Extract the bare UUID (after "${userId}:") for return to caller.
  v_request_key := CASE
    WHEN p_idempotency_key IS NOT NULL THEN split_part(p_idempotency_key, ':', 2)
    ELSE NULL
  END;

  -- ── STEP 1: Ledger lookup ─────────────────────────────────────────────────
  IF p_idempotency_key IS NOT NULL THEN
    SELECT job_id, request_payload_hash
    INTO   v_ledger_job_id, v_ledger_hash
    FROM   public.generation_job_requests
    WHERE  user_id                 = v_user_id
      AND  request_idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_ledger_hash IS DISTINCT FROM p_payload_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE = 'P0004';
      END IF;
      SELECT status INTO v_job_status
      FROM   public.generation_jobs WHERE id = v_ledger_job_id;
      RETURN jsonb_build_object(
        'job_id',      v_ledger_job_id,
        'is_existing', TRUE,
        'status',      COALESCE(v_job_status, 'unknown'),
        'request_key', v_request_key
      );
    END IF;
  END IF;

  -- ── STEP 2: D2 active-job exclusion ──────────────────────────────────────
  SELECT id, status
  INTO   v_active_job_id, v_job_status
  FROM   public.generation_jobs
  WHERE  user_id     = v_user_id
    AND  document_id = p_document_id
    AND  job_type    = p_job_type
    AND  status IN ('queued', 'processing', 'cancel_requested')
  LIMIT 1;

  IF FOUND THEN
    IF p_idempotency_key IS NOT NULL THEN
      -- Durably bind this key to the existing active job in the ledger.
      INSERT INTO public.generation_job_requests
        (user_id, request_idempotency_key, request_payload_hash, job_id)
      VALUES (v_user_id, p_idempotency_key, p_payload_hash, v_active_job_id)
      ON CONFLICT (user_id, request_idempotency_key) DO NOTHING;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        -- Concurrent transaction bound this key to something else. Re-read ledger.
        SELECT job_id, request_payload_hash
        INTO   v_ledger_job_id, v_ledger_hash
        FROM   public.generation_job_requests
        WHERE  user_id = v_user_id AND request_idempotency_key = p_idempotency_key;

        IF FOUND AND v_ledger_hash IS DISTINCT FROM p_payload_hash THEN
          RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE = 'P0004';
        END IF;
        IF FOUND THEN
          SELECT status INTO v_job_status FROM public.generation_jobs WHERE id = v_ledger_job_id;
          RETURN jsonb_build_object(
            'job_id', v_ledger_job_id, 'is_existing', TRUE,
            'status', COALESCE(v_job_status, 'unknown'), 'request_key', v_request_key
          );
        END IF;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'job_id',      v_active_job_id,
      'is_existing', TRUE,
      'status',      v_job_status,
      'request_key', v_request_key
    );
  END IF;

  -- ── STEP 3: Create new job + bind ledger entry ────────────────────────────
  v_new_job_id := gen_random_uuid();

  BEGIN
    INSERT INTO public.generation_jobs (
      id, user_id, document_id, job_type, status, state_version,
      request_idempotency_key, request_payload_hash, input_data
    ) VALUES (
      v_new_job_id, v_user_id, p_document_id, p_job_type, 'queued', 1,
      p_idempotency_key, p_payload_hash, p_sanitized_input
    );

    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.generation_job_requests
        (user_id, request_idempotency_key, request_payload_hash, job_id)
      VALUES (v_user_id, p_idempotency_key, p_payload_hash, v_new_job_id)
      ON CONFLICT (user_id, request_idempotency_key) DO NOTHING;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        -- Key concurrently bound to a different job. Raise to rollback job insert.
        RAISE EXCEPTION 'KEY_CONCURRENTLY_BOUND' USING ERRCODE = 'P0006';
      END IF;
    END IF;

  EXCEPTION
    WHEN unique_violation THEN
      -- D2 race: concurrent tab created the active job first.
      SELECT id, status
      INTO   v_active_job_id, v_job_status
      FROM   public.generation_jobs
      WHERE  user_id = v_user_id AND document_id = p_document_id AND job_type = p_job_type
        AND  status IN ('queued', 'processing', 'cancel_requested')
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'ENQUEUE_CONCURRENT_TERMINAL: concurrent job became terminal before key binding; retry'
          USING ERRCODE = 'P0007';
      END IF;

      IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.generation_job_requests
          (user_id, request_idempotency_key, request_payload_hash, job_id)
        VALUES (v_user_id, p_idempotency_key, p_payload_hash, v_active_job_id)
        ON CONFLICT (user_id, request_idempotency_key) DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
          SELECT job_id, request_payload_hash
          INTO   v_ledger_job_id, v_ledger_hash
          FROM   public.generation_job_requests
          WHERE  user_id = v_user_id AND request_idempotency_key = p_idempotency_key;
          IF FOUND AND v_ledger_hash IS DISTINCT FROM p_payload_hash THEN
            RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE = 'P0004';
          END IF;
          IF FOUND THEN
            SELECT status INTO v_job_status FROM public.generation_jobs WHERE id = v_ledger_job_id;
            RETURN jsonb_build_object(
              'job_id', v_ledger_job_id, 'is_existing', TRUE,
              'status', COALESCE(v_job_status, 'unknown'), 'request_key', v_request_key
            );
          END IF;
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'job_id', v_active_job_id, 'is_existing', TRUE,
        'status', v_job_status, 'request_key', v_request_key
      );

    WHEN SQLSTATE 'P0006' THEN
      -- Generation_jobs insert was rolled back (concurrent key binding).
      -- Re-read the authoritative ledger state.
      SELECT job_id, request_payload_hash
      INTO   v_ledger_job_id, v_ledger_hash
      FROM   public.generation_job_requests
      WHERE  user_id = v_user_id AND request_idempotency_key = p_idempotency_key;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'ENQUEUE_LEDGER_INCONSISTENCY' USING ERRCODE = 'P0099';
      END IF;
      IF v_ledger_hash IS DISTINCT FROM p_payload_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE = 'P0004';
      END IF;
      SELECT status INTO v_job_status FROM public.generation_jobs WHERE id = v_ledger_job_id;
      RETURN jsonb_build_object(
        'job_id',      v_ledger_job_id,
        'is_existing', TRUE,
        'status',      COALESCE(v_job_status, 'unknown'),
        'request_key', v_request_key
      );
  END;

  RETURN jsonb_build_object(
    'job_id',      v_new_job_id,
    'is_existing', FALSE,
    'status',      'queued',
    'request_key', v_request_key
  );
END;
$$;

-- fn_enqueue_job is granted LAST: all ledger infrastructure must already exist.
REVOKE ALL ON FUNCTION public.fn_enqueue_job(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_job(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
