-- MoLis — Generation Job State Machine + Durable Request Ledger (Corrective Migration)
-- This is the SINGLE corrective migration to apply after beta_foundation_v1.sql.
--
-- ── MIGRATION ORDER ──────────────────────────────────────────────────────────
-- 1. migrations/beta_foundation_v1.sql   — historical baseline (immutable)
-- 2. migrations/20260729120001_generation_job_state_machine_schema.sql  ← this file
--
-- ── DEPLOYMENT PATHS ─────────────────────────────────────────────────────────
-- Existing-upgrade path (environment already running beta_foundation_v1):
--   This corrective migration closes the unsafe authority left by beta_foundation_v1
--   (FOR ALL policy, unrestricted authenticated table access). Execution requires
--   an approved maintenance window with enqueue disabled end-to-end before apply.
--   Runbook, backup, and forward-recovery plan are required before execution.
--
-- Fresh-project path (new environment, no migrations applied yet):
--   The API must NOT be exposed between the application of beta_foundation_v1.sql
--   and this corrective migration. Both migrations must be applied before the
--   environment becomes accessible.
--
-- DO NOT claim beta_foundation_v1.sql is independently secure. On its own it leaves
-- authenticated users with FOR ALL table access including UPDATE on generation_jobs.
-- This migration is the security closure.
--
-- ── WHY fn_enqueue_job IS GRANTED LAST ───────────────────────────────────────
-- fn_enqueue_job requires the generation_job_requests ledger table and all
-- constraints to exist BEFORE any enqueue call can be accepted. Granting
-- authenticated execute before the ledger is ready creates a window where request
-- keys are not durably bound. This migration therefore grants enqueue as its FINAL
-- action.
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
--     fn_get_owner_study_visuals  ← public-safe fields only (no storage_path/image_prompt)
--     fn_enqueue_job  ← granted last
--
--   Service-role callable RPCs:
--     fn_get_visuals_signing_manifest(p_document_id, p_user_id)  ← storage paths for signing
--
--   Service-role-only RPCs:
--     fn_get_claimed_job_context
--     fn_claim_job, fn_heartbeat_job, fn_complete_job,
--     fn_complete_and_publish_job, fn_fail_job,
--     fn_acknowledge_cancel, fn_recover_stale_jobs
--
-- ── REQUEST CLASSIFICATION ────────────────────────────────────────────────────
--   request_classification = 'client_verified':
--     Non-null request_idempotency_key and request_payload_hash required.
--     Ledger binding enforced by deferred constraint trigger at COMMIT time.
--     All new jobs created by fn_enqueue_job are client_verified.
--   request_classification = 'legacy_unverified':
--     Both key and hash are NULL. Backfilled for historical rows without keys.
--     Not reusable as a client key. Never matched by fn_enqueue_job ledger lookup.
--
-- ── SOURCE REVISION IDENTITY ─────────────────────────────────────────────────
--   The authoritative source binding is the immutable generation_source_snapshots row
--   created atomically by fn_enqueue_job. The snapshot captures document+analysis
--   content at enqueue time using a single consistent read (FOR SHARE locking).
--   The worker receives only the bound snapshot via fn_get_claimed_job_context —
--   never re-reads mutable tables. The snapshot content_hash is the sole source
--   identity. expected_*_updated_at columns are NOT added (R8-M04: omitted).
--   DOCUMENT_REVISION_CHANGED (P0017): raised at D2 active-job binding when the
--   current source digest differs from the existing job's snapshot hash.
--
-- ── IDEMPOTENCY CONTRACT ──────────────────────────────────────────────────────
--   The generation_job_requests table is the authoritative idempotency ledger.
--   Key format: "${userId}:${UUID}". Payload hash: 64 lowercase hex characters.
--   Same key + same hash → return associated job (any status, including terminal).
--   Same key + different hash → P0004 IDEMPOTENCY_PAYLOAD_CONFLICT.
--
-- ── CANCELLATION VERSION PROTOCOL ────────────────────────────────────────────
--   1. fn_claim_job: queued (N) → processing (N+1). Returns N+1.
--   2. fn_request_job_cancel: processing → cancel_requested increments version to N+2.
--   3. Worker passes claim version (N+1) to all subsequent calls.
--   4. Cancel branch WHERE clauses check state_version = p_state_version + 1 (= N+2).
--
-- ── CORRECTION LOG (Round 4) ─────────────────────────────────────────────────
-- C01: ADD COLUMN statements moved BEFORE all preflight assertions that reference those columns.
-- C02: ADD CONSTRAINT IF NOT EXISTS (invalid PostgreSQL syntax) replaced with catalog-checked DO block.
-- C03: Storage RESTRICTIVE deny policies replace the old PERMISSIVE USING(FALSE) defect.
-- C04: request_classification column with client_verified/legacy_unverified classification.
-- C05: Deferred constraint trigger (fn_check_ledger_binding) enforces ledger binding at COMMIT.
-- C06: fn_get_claimed_job_context narrow RPC (service_role only) replaces unrestricted reads.
-- C07: fn_heartbeat_job returns typed JSONB with refusal_reason (cancel_requested/expired_lease/
--       wrong_token/not_processing) instead of opaque boolean.
-- C08: fn_complete_job blocks visuals jobs (must use fn_complete_and_publish_job).
-- C09: fn_complete_and_publish_job enforces NO_VISUAL_TOPICS result code for empty manifests
--       and validates storage_path prefix ownership.
-- C10: fn_recover_stale_jobs uses FOR UPDATE SKIP LOCKED with LIMIT 100 per batch.
-- C11: fn_enqueue_job rejects NULL idempotency key/hash (mandatory for all new jobs).
-- C12: Source revision columns (expected_*_updated_at) added and stored at enqueue.
--
-- ── CORRECTION LOG (Round 9) ─────────────────────────────────────────────────
-- R9-C01: fn_sha256_hex — STRICT + explicit UTF-8 bytes (convert_to). Source envelope
--         timestamps frozen to UTC ISO-8601 via to_char(... AT TIME ZONE 'UTC', ...).
--         UUID fields cast to TEXT explicitly. UTF-8 server_encoding asserted in preflight.
--         Known-answer vectors (KAVs) added as migration-time postcondition DO block.
-- R9-C02: UNIQUE(document_id,user_id) added to document_analysis (section 17b) as the
--         authoritative concurrency control. Raceable COUNT removed from fn_enqueue_job.
-- R9-H01: ACL baseline check changed to per-privilege (avoids comma-list ANY ambiguity).
-- R9-H02: study_visuals provenance columns added (section 17d): source_job_id,
--         source_snapshot_id, source_request_hash, publication_attempt. Populated
--         atomically by fn_complete_and_publish_job. FK constraints added.
-- R9-H03: All three P0007 RAISE EXCEPTION replaced with structured {outcome:'retry_required'}
--         returns. Prevents PostgREST SQLSTATE exposure to authenticated callers.
-- R9-M02: Closed empty-object input schema enforced at DB boundary in fn_enqueue_job.
--         Rejects non-object inputs and non-empty objects for all v1 job types.
--
-- ── CORRECTION LOG (Round 10) ────────────────────────────────────────────────
-- R10-C01 (was R9-C01): OBJECT ORDERING FIX. CREATE TABLE generation_source_snapshots
--         moved to section 17b-create (before section 17d) so that
--         study_visuals_source_snapshot_fk can reference an already-existing table.
--         The previous ordering caused a deterministic migration failure.
-- R10-C02 (was R9-C02): FULL-ENVELOPE KAV DO BLOCK. Section 30c added: three PostgreSQL-
--         executed known-answer vectors (KAV-SRC-1, KAV-SRC-2, KAV-REQ-1) freeze the
--         complete source and request envelope byte contract. Expected hashes computed
--         independently (Node.js, 2026-08-02). Comment block documents CRLF/LF, Unicode,
--         null-vs-missing, and integer/float canonical rules.
-- R10-H01: ANALYSIS OWNERSHIP. Two D10 preflight fail-closed checks added: (1) rejects
--         analysis rows where user_id != documents.user_id; (2) rejects duplicate
--         document_id in document_analysis across any user. Composite FK
--         document_analysis_document_owner_fk (document_id,user_id) -> documents(id,user_id)
--         added declaratively after documents_id_user_id_unique parent key.
-- R10-H02: PROVENANCE COHERENCE. study_visuals_provenance_coherence CHECK constraint added:
--         provenance columns are either all NULL (legacy) or all NOT NULL (verified).
-- R10-H03: HEARTBEAT LIFECYCLE FIX (route.ts). heartbeatInFlight reset moved to try/finally
--         so all paths (success, cancellation, authority loss, thrown exception) reset the
--         guard. Previous early-return on success left the guard stuck = true.
-- R10-H04: SOURCE COLUMN PREFLIGHT EXTENDED. Section 1 source column check now verifies
--         nullability (is_nullable), identity/generated state, and column_default in
--         addition to udt_name. Values confirmed from d11-catalogue-results-2026-07-31.csv.
--         keywords column corrected from jsonb to _text (D11 type).
-- R10-H05: ACL POSTCONDITIONS TIGHTENED. (a) Storage service privilege check changed from
--         comma-list (any-semantics) to individual has_table_privilege calls. (b) Function
--         search_path verification extended: fn_sha256_hex must have exactly
--         'extensions, pg_catalog'; all other functions must have empty path ('search_path=').
-- R10-H06: STORAGE MIME/SIZE LIMITS. Bucket UPDATE sets allowed_mime_types=ARRAY['image/png']
--         and file_size_limit=5242880 (5 MiB). Postcondition verifies both. Worker-level
--         guard (MAX_IMAGE_BYTES = 5 MiB) rejects oversized provider responses before upload.
--
-- Forward-only. Do NOT edit after application. Corrections go in a new migration.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. D11 fail-closed catalogue preflight (MUST precede every mutation)
--
-- This migration deliberately accepts only the catalogue captured by the two
-- approved D11 read-only inspections.  It is not a partially-repeatable repair
-- script.  A partially applied copy, an unexpected policy/function/column, or a
-- baseline definition that has drifted is a hard stop before default privileges,
-- ACLs, policies, buckets, tables, columns, constraints, indexes, or functions are
-- changed.  Transaction rollback remains a recovery boundary, not a substitute
-- for this compatibility gate.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_ext_schema TEXT;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'MIGRATION_OWNER_REQUIRED: expected postgres, got %', current_user;
  END IF;

  SELECT n.nspname INTO v_ext_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';
  IF v_ext_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: pgcrypto schema is %, expected extensions', v_ext_schema;
  END IF;

  -- R9-C01: Assert UTF-8 server encoding — required for deterministic fn_sha256_hex output.
  -- fn_sha256_hex calls convert_to(input,'UTF8'); a non-UTF-8 database encoding means
  -- convert_to may produce different bytes for the same logical string across environments.
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: server_encoding is %, expected UTF8 for deterministic hashing',
      current_setting('server_encoding');
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = ANY (ARRAY[
    'documents','document_analysis','generation_jobs','study_visuals'
  ]) AND c.relkind = 'r' AND pg_get_userbyid(c.relowner) = 'postgres'
    AND c.relrowsecurity AND NOT c.relforcerowsecurity;
  IF v_count <> 4 THEN
    RAISE EXCEPTION
      'D11 DRIFT: expected four postgres-owned, RLS-enabled, non-forced public baseline tables; found %',
      v_count;
  END IF;

  -- Exact baseline column signatures used by this correction.  Count checks
  -- prevent both missing and extra columns on the two tables being transformed.
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='generation_jobs') <> 13 THEN
    RAISE EXCEPTION 'D11 DRIFT: generation_jobs must have exactly 13 baseline columns';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('id','uuid','NO','gen_random_uuid()'),('user_id','uuid','NO',NULL),
      ('document_id','uuid','YES',NULL),('job_type','text','NO',NULL),
      ('status','text','NO','''queued''::text'),('input_data','jsonb','YES',NULL),
      ('result_data','jsonb','YES',NULL),('error','text','YES',NULL),
      ('correlation_id','text','YES',NULL),('created_at','timestamptz','NO','now()'),
      ('updated_at','timestamptz','NO','now()'),('started_at','timestamptz','YES',NULL),
      ('completed_at','timestamptz','YES',NULL)
    ) AS expected(name, udt, nullable, default_sql)
    LEFT JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name='generation_jobs'
     AND c.column_name=expected.name
    WHERE c.column_name IS NULL OR c.udt_name<>expected.udt
       OR c.is_nullable<>expected.nullable
       OR c.is_identity<>'NO' OR c.is_generated<>'NEVER'
       OR c.column_default IS DISTINCT FROM expected.default_sql
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: generation_jobs baseline column signature changed';
  END IF;

  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='study_visuals') <> 6 THEN
    RAISE EXCEPTION 'D11 DRIFT: study_visuals must have exactly six baseline columns';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('id','uuid','NO','gen_random_uuid()'),('document_id','uuid','NO',NULL),
      ('user_id','uuid','NO',NULL),('visuals','jsonb','NO','''[]''::jsonb'),
      ('model','text','NO','''gpt-4o-mini''::text'),
      ('created_at','timestamptz','NO','now()')
    ) AS expected(name, udt, nullable, default_sql)
    LEFT JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name='study_visuals'
     AND c.column_name=expected.name
    WHERE c.column_name IS NULL OR c.udt_name<>expected.udt
       OR c.is_nullable<>expected.nullable
       OR c.is_identity<>'NO' OR c.is_generated<>'NEVER'
       OR c.column_default IS DISTINCT FROM expected.default_sql
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: study_visuals baseline column signature changed';
  END IF;

  -- R10-H04: The source columns consumed by the canonical snapshot must exist with
  -- their inspected types, nullability, identity/generated state, and defaults.
  -- Values confirmed from d11-catalogue-results-2026-07-31.csv (S2_columns rows).
  -- Nullability is checked because the canonical envelope and ownership FK rely on
  -- specific NOT NULL guarantees (e.g., document_analysis.document_id NOT NULL).
  IF EXISTS (
    SELECT 1 FROM (VALUES
      -- documents (source columns only — complete table may have unrelated columns)
      ('documents','id',         'uuid',        'NO', 'gen_random_uuid()'),
      ('documents','user_id',    'uuid',        'YES',NULL),
      ('documents','file_path',  'text',        'YES',NULL),
      ('documents','title',      'text',        'NO', NULL),
      ('documents','extracted_text','text',     'YES',NULL),
      ('documents','file_type',  'text',        'YES',NULL),
      ('documents','source_type','text',        'YES',NULL),
      ('documents','created_at', 'timestamptz', 'YES','now()'),
      ('documents','subject_id', 'uuid',        'YES',NULL),
      ('documents','source_recording_id','uuid','YES',NULL),
      -- document_analysis (all D11-confirmed columns)
      ('document_analysis','id',              'uuid',        'NO', 'gen_random_uuid()'),
      ('document_analysis','document_id',     'uuid',        'NO', NULL),
      ('document_analysis','user_id',         'uuid',        'NO', NULL),
      ('document_analysis','subject_area',    'text',        'NO', NULL),
      ('document_analysis','difficulty_level','text',        'NO', NULL),
      ('document_analysis','estimated_study_minutes','int4', 'YES',NULL),
      ('document_analysis','sections',        'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','key_concepts',    'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','definitions',     'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','formulas',        'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','examples',        'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','keywords',        '_text',       'NO', '''{}''::text[]'),
      ('document_analysis','likely_exam_topics','jsonb',     'NO', '''[]''::jsonb'),
      ('document_analysis','learning_objectives','jsonb',    'NO', '''[]''::jsonb'),
      ('document_analysis','misconceptions',  'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','relationships',   'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','prerequisites',   'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','tables',          'jsonb',       'NO', '''[]''::jsonb'),
      ('document_analysis','concept_graph',   'jsonb',       'YES',NULL),
      ('document_analysis','learning_path',   'jsonb',       'YES',NULL),
      ('document_analysis','model',           'text',        'NO', NULL),
      ('document_analysis','created_at',      'timestamptz', 'NO', 'now()')
    ) AS expected(table_name,column_name,udt_name,is_nullable,default_sql)
    LEFT JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name=expected.table_name
     AND c.column_name=expected.column_name
    WHERE c.column_name IS NULL
       OR c.udt_name   <> expected.udt_name
       OR c.is_nullable <> expected.is_nullable
       OR c.is_identity <> 'NO' OR c.is_generated <> 'NEVER'
       OR c.column_default IS DISTINCT FROM expected.default_sql
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: source table column contract changed (type, nullability, or default mismatch)';
  END IF;

  -- Exact baseline constraints that will be preserved or replaced.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.generation_jobs'::regclass
      AND conname='generation_jobs_status_check' AND pg_get_constraintdef(oid)=
      'CHECK ((status = ANY (ARRAY[''queued''::text, ''processing''::text, ''completed''::text, ''failed''::text, ''cancelled''::text])))')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.generation_jobs'::regclass
      AND conname='generation_jobs_type_check' AND pg_get_constraintdef(oid)=
      'CHECK ((job_type = ANY (ARRAY[''visuals''::text, ''flashcards''::text, ''quiz''::text, ''revision_notes''::text, ''analysis''::text])))')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.study_visuals'::regclass
      AND conname='study_visuals_document_id_user_id_key'
      AND pg_get_constraintdef(oid)='UNIQUE (document_id, user_id)') THEN
    RAISE EXCEPTION 'D11 DRIFT: required baseline check/unique constraints changed';
  END IF;

  -- R14-H02: exact pg_index property assertions for generation_jobs.
  -- Replaces the previous permissive LIKE checks with indisunique/indisprimary/
  -- indispartial/indpred exact property verification per D11 S8_indexes evidence.
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='generation_jobs') <> 3 THEN
    RAISE EXCEPTION 'D11 DRIFT: generation_jobs index count changed';
  END IF;
  -- generation_jobs_pkey: unique, primary, non-partial
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='generation_jobs' AND ci.relname='generation_jobs_pkey'
      AND i.indisunique AND i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: generation_jobs_pkey index properties changed';
  END IF;
  -- generation_jobs_status: partial, non-unique, non-primary; exact predicate
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='generation_jobs' AND ci.relname='generation_jobs_status'
      AND NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NOT NULL
      AND pg_get_expr(i.indpred,i.indrelid)=
        '(status = ANY (ARRAY[''queued''::text, ''processing''::text]))'
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: generation_jobs_status index properties or predicate changed';
  END IF;
  -- generation_jobs_user_doc_type: non-unique, non-primary, non-partial
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='generation_jobs' AND ci.relname='generation_jobs_user_doc_type'
      AND NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: generation_jobs_user_doc_type index properties changed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='generation_jobs' AND policyname='Users see own jobs'
      AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND cmd='ALL'
      AND qual='(auth.uid() = user_id)' AND with_check IS NULL)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='generation_jobs')<>1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='study_visuals' AND policyname='study_visuals_owner_all'
      AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND cmd='ALL'
      AND qual='(auth.uid() = user_id)' AND with_check='(auth.uid() = user_id)')
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='study_visuals')<>1 THEN
    RAISE EXCEPTION 'D11 DRIFT: target public RLS policy fingerprint changed';
  END IF;

  -- D11 authority baseline: every application runtime role currently has all
  -- direct privileges on both target tables.  Reconciliation below depends on
  -- observing that exact unsafe starting point.
  --
  -- R9-H05: Check each privilege individually. has_table_privilege(role, table,
  -- 'SELECT,INSERT,...') returns true when ANY listed privilege is held, not all,
  -- so a comma-list cannot prove a "role holds ALL of these" baseline.
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) role_name
    CROSS JOIN unnest(ARRAY['generation_jobs','study_visuals']) table_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv
    WHERE NOT has_table_privilege(role_name, format('public.%I',table_name), priv)
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: target table ACL baseline changed';
  END IF;

  -- All Round-8 objects must be absent.  This rejects a partial prior attempt.
  IF to_regclass('public.generation_job_requests') IS NOT NULL
     OR to_regclass('public.generation_source_snapshots') IS NOT NULL
     OR to_regclass('public.generation_job_usage') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='generation_jobs' AND column_name = ANY (ARRAY[
         'state_version','worker_id','lease_token','lease_expires_at','heartbeat_at',
         'attempt_count','max_attempts','request_idempotency_key','request_payload_hash',
         'request_classification','public_error_code','public_message_key',
         'support_reference','snapshot_id','originating_request_id']))
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = ANY (ARRAY[
         'fn_enqueue_job','fn_claim_job','fn_heartbeat_job','fn_complete_job',
         'fn_complete_and_publish_job','fn_fail_job','fn_acknowledge_cancel',
         'fn_request_job_cancel','fn_recover_stale_jobs','fn_get_job_safe_dto',
         'fn_get_active_job_for_document','fn_get_claimed_job_context',
         'fn_get_owner_study_visuals','fn_get_visuals_signing_manifest','fn_sha256_hex',
         'fn_check_ledger_binding','fn_snapshot_immutability_guard',
         'fn_canonical_jsonb_v1','fn_canonical_source_v1','fn_canonical_request_v1'])) THEN
    RAISE EXCEPTION 'D11 DRIFT: Round-8 object already exists; partial application is not accepted';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ANY(ARRAY[
       'documents_id_user_id_unique','document_analysis_id_document_user_unique',
       'document_analysis_document_user_unique',
       'generation_jobs_verified_binding_unique','generation_jobs_snapshot_scope_fk',
       'generation_jobs_originating_request_fk']))
     OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname = ANY(ARRAY[
         'generation_jobs_active_exclusion','generation_jobs_originating_key',
         'generation_jobs_active_status']))
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage'
       AND policyname = ANY(ARRAY['study_visuals_block_authenticated','study_visuals_block_anon']))
     OR EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='study_visuals'
         AND column_name = ANY (ARRAY[
           'source_job_id','source_snapshot_id','source_request_hash','publication_attempt'])) THEN
    RAISE EXCEPTION 'D11 DRIFT: proposed constraint/index/policy already exists';
  END IF;

  -- Existing application trigger routines are an inspected dependency, not a
  -- migration target.  Prove their identity/security before continuing.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
        'set_subjects_updated_at','set_user_profiles_updated_at',
        'sync_user_profiles_identity','update_updated_at',
        'validate_resource_subject_ownership'])) <> 5
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
        'set_subjects_updated_at','set_user_profiles_updated_at',
        'sync_user_profiles_identity','update_updated_at',
        'validate_resource_subject_ownership'])
       AND (p.proowner<>'postgres'::regrole OR p.prosecdef))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
       WHERE tgrelid='public.documents'::regclass
         AND tgname='validate_document_subject_ownership' AND NOT tgisinternal
         AND tgfoid='public.validate_resource_subject_ownership()'::regprocedure) THEN
    RAISE EXCEPTION 'D11 DRIFT: existing public routine/trigger authority changed';
  END IF;

  -- D10 fail-closed data compatibility checks are reads and therefore belong in
  -- this preflight, before any schema or authority mutation.
  IF EXISTS (SELECT 1 FROM public.document_analysis
       GROUP BY user_id,document_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'D10 PREFLIGHT: duplicate document_analysis scope requires quarantine';
  END IF;
  IF EXISTS (SELECT 1 FROM public.generation_jobs
       WHERE status IN ('queued','processing')
       GROUP BY user_id,document_id,job_type HAVING count(*)>1) THEN
    RAISE EXCEPTION 'D10 PREFLIGHT: duplicate active jobs require quarantine';
  END IF;

  -- R10-H01: Fail closed on analysis rows where user_id doesn't match documents.user_id.
  -- The product model requires analysis to belong to the same user who owns the document.
  -- The composite FK added later (document_analysis_document_owner_fk) enforces this
  -- declaratively; this pre-mutation check rejects any divergent live rows before the FK
  -- would fail with a less diagnostic error.
  IF EXISTS (
    SELECT 1 FROM public.document_analysis da
    JOIN public.documents d ON d.id = da.document_id
    WHERE da.user_id <> d.user_id
  ) THEN
    RAISE EXCEPTION 'D10 PREFLIGHT: document_analysis contains rows where user_id does not match documents.user_id. Manual cleanup required before migration.';
  END IF;

  -- R10-H01: Fail closed on duplicate document_id in document_analysis (global, any user).
  -- The one-analysis-per-document product contract means the same document_id must not
  -- appear for two different user_ids. The composite FK above and UNIQUE(document_id)
  -- added later enforce this declaratively; this check surfaces violations early.
  IF EXISTS (
    SELECT 1 FROM public.document_analysis
    GROUP BY document_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'D10 PREFLIGHT: document_analysis contains rows with duplicate document_id (possibly cross-user). Manual cleanup required.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid IN
      ('public.generation_jobs'::regclass,'public.study_visuals'::regclass)
      AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'D11 DRIFT: unexpected baseline trigger on a target table';
  END IF;

  -- D11 S18: full storage bucket row — id, name, public flag, and the D11-null size/MIME/avif
  -- fields.  A non-null file_size_limit or allowed_mime_types would change the worker's upload
  -- contract; avif_autodetection off is an explicit product choice.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='study-visuals'
      AND name='study-visuals' AND public
      AND file_size_limit IS NULL AND allowed_mime_types IS NULL
      AND NOT avif_autodetection) THEN
    RAISE EXCEPTION 'D11 DRIFT: study-visuals bucket full row fingerprint changed';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 11
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
       AND policyname IN ('For full customization 137qt67_0','For full customization 137qt67_1',
         'For full customization 137qt67_2','For full customization 137qt67_3')
       AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[]) <> 4 THEN
    RAISE EXCEPTION 'D11 DRIFT: Storage policy identity/count baseline changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('For full customization 137qt67_0','SELECT',
       '((bucket_id = ''study-visuals''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
      ('For full customization 137qt67_1','INSERT',NULL,
       '((bucket_id = ''study-visuals''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))'),
      ('For full customization 137qt67_2','UPDATE',
       '((bucket_id = ''study-visuals''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
      ('For full customization 137qt67_3','DELETE',
       '((bucket_id = ''study-visuals''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
      ('Users can delete own files','DELETE',
       '((bucket_id = ''study-documents''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
      ('Users can read own files','SELECT',
       '((bucket_id = ''study-documents''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
      ('Users can upload to own folder','INSERT',NULL,
       '((bucket_id = ''study-documents''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))'),
      ('recordings_delete','DELETE',
       '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
      ('recordings_read','SELECT',
       '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
      ('recordings_update','UPDATE',
       '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',
       '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))'),
      ('recordings_upload','INSERT',NULL,
       '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))')
    ) AS expected(name,cmd,qual,with_check)
    LEFT JOIN pg_policies p ON p.schemaname='storage' AND p.tablename='objects'
      AND p.policyname=expected.name
    WHERE p.policyname IS NULL OR p.cmd<>expected.cmd OR p.permissive<>'PERMISSIVE'
       OR p.qual IS DISTINCT FROM expected.qual OR p.with_check IS DISTINCT FROM expected.with_check
       OR p.roles <> CASE WHEN expected.name LIKE 'recordings_%'
                         THEN ARRAY['public']::name[] ELSE ARRAY['authenticated']::name[] END
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: exact Storage policy fingerprint changed';
  END IF;

  -- ── R12-H02: Additional D11 fingerprints not yet in preflight ────────────────

  -- D11 S22: exact primary-key fingerprints for every referenced/altered table.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.document_analysis'::regclass
        AND conname='document_analysis_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.documents'::regclass
        AND conname='documents_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.generation_jobs'::regclass
        AND conname='generation_jobs_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.study_visuals'::regclass
        AND conname='study_visuals_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)') THEN
    RAISE EXCEPTION 'D11 DRIFT: primary key fingerprint changed';
  END IF;

  -- D11 S22: exact foreign-key fingerprints (delete action, non-deferrable).
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('document_analysis'::text,'document_analysis_document_id_fkey'::text,
       'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE'::text),
      ('document_analysis','document_analysis_user_id_fkey',
       'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('documents','documents_source_recording_id_fkey',
       'FOREIGN KEY (source_recording_id) REFERENCES recordings(id) ON DELETE SET NULL'),
      ('documents','documents_subject_id_fkey',
       'FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL'),
      ('documents','documents_user_id_fkey',
       'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('generation_jobs','generation_jobs_document_id_fkey',
       'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE'),
      ('generation_jobs','generation_jobs_user_id_fkey',
       'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('study_visuals','study_visuals_document_id_fkey',
       'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE'),
      ('study_visuals','study_visuals_user_id_fkey',
       'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE')
    ) AS expected(tbl, cname, def)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public'
        AND c.conrelid=to_regclass('public.' || expected.tbl)
        AND c.conname=expected.cname
        AND pg_get_constraintdef(c.oid)=expected.def
        AND NOT c.condeferrable AND NOT c.condeferred
    )
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: foreign key fingerprint changed';
  END IF;

  -- D11 S22: documents_source_type_check (not included in the named-check block above).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.documents'::regclass
      AND conname='documents_source_type_check'
      AND pg_get_constraintdef(oid)=
      'CHECK (((source_type = ANY (ARRAY[''upload''::text, ''recording''::text])) OR (source_type IS NULL)))') THEN
    RAISE EXCEPTION 'D11 DRIFT: documents_source_type_check fingerprint changed';
  END IF;

  -- R14-H02: exact pg_index property assertions for document_analysis, documents,
  -- and study_visuals per D11 S8_indexes evidence. Replaces permissive LIKE checks.

  -- document_analysis (3 indexes: pkey + 2 non-unique non-partial)
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='document_analysis') <> 3 THEN
    RAISE EXCEPTION 'D11 DRIFT: document_analysis index count changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='document_analysis' AND ci.relname='document_analysis_pkey'
      AND i.indisunique AND i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: document_analysis_pkey index properties changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='document_analysis' AND ci.relname='idx_document_analysis_document_id'
      AND NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: idx_document_analysis_document_id index properties changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='document_analysis' AND ci.relname='idx_document_analysis_user_id'
      AND NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: idx_document_analysis_user_id index properties changed';
  END IF;

  -- documents (3 indexes: pkey, partial-unique, non-unique non-partial)
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='documents') <> 3 THEN
    RAISE EXCEPTION 'D11 DRIFT: documents index count changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='documents' AND ci.relname='documents_pkey'
      AND i.indisunique AND i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: documents_pkey index properties changed';
  END IF;
  -- documents_source_recording_unique: unique, partial (source_recording_id IS NOT NULL), non-primary
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='documents' AND ci.relname='documents_source_recording_unique'
      AND i.indisunique AND NOT i.indisprimary AND i.indpred IS NOT NULL
      AND pg_get_expr(i.indpred,i.indrelid)='(source_recording_id IS NOT NULL)'
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: documents_source_recording_unique index properties or predicate changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='documents' AND ci.relname='documents_subject_id_idx'
      AND NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: documents_subject_id_idx index properties changed';
  END IF;

  -- study_visuals (2 indexes: pkey + unique non-partial)
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='study_visuals') <> 2 THEN
    RAISE EXCEPTION 'D11 DRIFT: study_visuals index count changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='study_visuals' AND ci.relname='study_visuals_pkey'
      AND i.indisunique AND i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: study_visuals_pkey index properties changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class ct ON ct.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=ct.relnamespace
    WHERE n.nspname='public' AND ct.relname='study_visuals' AND ci.relname='study_visuals_document_id_user_id_key'
      AND i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: study_visuals_document_id_user_id_key index properties changed';
  END IF;

  -- D11 SA01: exact routine language, return type, volatility, strictness.
  -- All five existing routines are plpgsql trigger functions, VOLATILE, non-strict, non-leakproof.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    JOIN pg_type t ON t.oid=p.prorettype
    WHERE n.nspname='public'
      AND p.proname = ANY(ARRAY[
        'set_subjects_updated_at','set_user_profiles_updated_at',
        'sync_user_profiles_identity','update_updated_at',
        'validate_resource_subject_ownership'])
      AND (l.lanname <> 'plpgsql' OR t.typname <> 'trigger'
           OR p.provolatile <> 'v' OR p.proisstrict OR p.proretset OR p.proleakproof)
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: existing routine language/return/volatility fingerprint changed';
  END IF;

  -- D11 SA01: exact proconfig — four routines have NULL, validate_resource_subject_ownership
  -- has exactly search_path=public (no other GUC permitted).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname = ANY(ARRAY[
        'set_subjects_updated_at','set_user_profiles_updated_at',
        'sync_user_profiles_identity','update_updated_at'])
      AND p.proconfig IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='validate_resource_subject_ownership'
      AND p.proconfig = ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: existing routine proconfig fingerprint changed';
  END IF;

  -- D11 SA01/SA04: exact EXECUTE ACL for all five routines.
  -- Expected: PUBLIC + postgres + anon + authenticated + service_role, all granted by postgres,
  -- no grant options.  This is the inspected Supabase default for public trigger functions.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname = ANY(ARRAY[
        'set_subjects_updated_at','set_user_profiles_updated_at',
        'sync_user_profiles_identity','update_updated_at',
        'validate_resource_subject_ownership'])
      AND p.proacl::text IS DISTINCT FROM
        '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: existing routine EXECUTE ACL fingerprint changed';
  END IF;

  -- D11 SA07: exact relacl for all four tables — same Supabase-default grant set, postgres as
  -- grantor, no grant options, exactly these four grantees (no PUBLIC, no unexpected roles).
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname = ANY(ARRAY['document_analysis','documents','generation_jobs','study_visuals'])
      AND c.relkind='r'
      AND c.relacl::text IS DISTINCT FROM
        '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: exact table ACL fingerprint changed';
  END IF;

  -- D11 SA11: postgres/public FUNCTION default ACL before-state.
  -- The ALTER DEFAULT PRIVILEGES at section 1c overwrites this to revoke from
  -- anon/authenticated/service_role for new functions.  Fail closed if it has already run.
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl
    WHERE defaclrole='postgres'::regrole
      AND defaclnamespace='public'::regnamespace
      AND defaclobjtype='f'
      AND defaclacl::text='{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: postgres/public FUNCTION default ACL before-state changed';
  END IF;

  -- ── R13-H02: Remaining D11 preflight assertions ───────────────────────────

  -- R13-H02: documents exact baseline column count.
  -- The source column check above is list-based; this count blocks silent extra columns.
  -- Confirmed: 10 columns from d11-catalogue-results-2026-07-31.csv (S2_columns).
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='documents') <> 10 THEN
    RAISE EXCEPTION 'D11 DRIFT: documents must have exactly 10 baseline columns';
  END IF;

  -- R13-H02: document_analysis exact baseline column count.
  -- Confirmed: 22 columns from d11-catalogue-results-2026-07-31.csv (S2_columns).
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='document_analysis') <> 22 THEN
    RAISE EXCEPTION 'D11 DRIFT: document_analysis must have exactly 22 baseline columns';
  END IF;

  -- R13-H02: validate_document_subject_ownership trigger full fingerprint.
  -- tgtype=23 = BEFORE(1)|ROW(2)|INSERT(4)|UPDATE(16). tgenabled='O' = origin (active).
  -- tgconstraint=0 (not a constraint trigger). Not deferrable. Not internal.
  -- Confirmed from d11-catalogue-results-2026-07-31.csv (S9b_pg_triggers).
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.documents'::regclass
      AND t.tgname  = 'validate_document_subject_ownership'
      AND t.tgtype  = 23
      AND t.tgenabled = 'O'
      AND t.tgconstraint = 0
      AND NOT t.tgdeferrable
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'D11 DRIFT: validate_document_subject_ownership trigger type/enabled/constraint fingerprint changed';
  END IF;

  -- R14-H02 / R14-H03: No column-level ACLs on any MoLis table in public schema.
  -- D11 baseline shows zero column ACLs; any presence indicates an unexpected grant.
  -- Covers all seven tables: two source tables and all five closed tables.
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY(ARRAY['documents','document_analysis','generation_jobs',
          'generation_job_requests','generation_source_snapshots',
          'generation_job_usage','study_visuals'])
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attacl IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: unexpected column-level ACL on a MoLis table';
  END IF;

  -- R14-H02: No type-level ACLs for user-defined types in public schema.
  -- The D11 baseline has no custom types with ACL entries; any presence is unexpected.
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typacl IS NOT NULL
      AND t.typtype NOT IN ('b', 'p')  -- exclude base and pseudo-types
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: unexpected type ACL for user-defined type in public schema';
  END IF;

  -- R15-H01: D11 SA10 records public schema owner as pg_database_owner (not postgres).
  -- Exact nspacl from D11 SA10 inspection (2026-07-31):
  --   {pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,
  --    anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}
  -- Order-independent aclexplode comparison: tuple order varies by grant sequence across
  -- environments; semantic content is identical to SA10 and matches Stage 0 assertions exactly.
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace
    WHERE nspname = 'public'
      AND nspowner = 'pg_database_owner'::regrole
  )
  OR (SELECT count(1) FROM pg_namespace n, LATERAL aclexplode(n.nspacl) e
      WHERE n.nspname = 'public') <> 7
  OR EXISTS (
    SELECT 1 FROM (VALUES
      ('pg_database_owner'::text, 'CREATE'::text, false),
      ('pg_database_owner',       'USAGE',         false),
      ('',                         'USAGE',         false),
      ('postgres',                 'USAGE',         false),
      ('anon',                     'USAGE',         false),
      ('authenticated',            'USAGE',         false),
      ('service_role',             'USAGE',         false)
    ) AS expected(grantee, privilege_type, is_grantable)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) e
      WHERE n.nspname = 'public'
        AND CASE WHEN e.grantee = 0 THEN '' ELSE pg_get_userbyid(e.grantee) END = expected.grantee
        AND e.privilege_type = expected.privilege_type
        AND e.is_grantable = expected.is_grantable
    )
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: public schema owner or ACL does not match D11 SA10 baseline (expected pg_database_owner with exact ACL)';
  END IF;

  -- R13-H02: TABLE default ACL before-state (postgres grantor, public namespace).
  -- arwdDxtm = INSERT+SELECT+UPDATE+DELETE+TRUNCATE+REFERENCES+TRIGGER+MAINTAIN.
  -- Confirmed from d11-additional-authority-results-2026-07-31.csv (SA11).
  -- The ALTER DEFAULT PRIVILEGES at section 1c overwrites this; fail closed if already changed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl
    WHERE defaclrole      = 'postgres'::regrole
      AND defaclnamespace = 'public'::regnamespace
      AND defaclobjtype   = 'r'
      AND defaclacl::text = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: postgres/public TABLE default ACL before-state changed';
  END IF;

  -- R13-H02: SEQUENCE default ACL before-state (postgres grantor, public namespace).
  -- rwU = SELECT(r)+UPDATE(w)+USAGE(U).
  -- Confirmed from d11-additional-authority-results-2026-07-31.csv (SA11).
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl
    WHERE defaclrole      = 'postgres'::regrole
      AND defaclnamespace = 'public'::regnamespace
      AND defaclobjtype   = 'S'
      AND defaclacl::text = '{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}'
  ) THEN
    RAISE EXCEPTION 'D11 DRIFT: postgres/public SEQUENCE default ACL before-state changed';
  END IF;

END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. R7-H09: Column drift preflight — positioned before the first mutation.
--
--     Verifies that any generation_jobs columns with the same names as the new
--     columns added in section 2 have compatible types.  ADD COLUMN IF NOT
--     EXISTS silently accepts an incompatible existing column; this block fails
--     closed before any mutation takes place.
--
--     In practice the main preflight above rejects the migration if ANY of the
--     proposed new columns already exist, making this block defence-in-depth.
--     Positioned here for audit clarity: all reads that could abort the migration
--     precede all writes.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col_type TEXT;
BEGIN
  -- state_version: integer
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='state_version';
  IF FOUND AND v_col_type != 'integer' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.state_version exists as %, expected integer.', v_col_type;
  END IF;

  -- worker_id: text
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='worker_id';
  IF FOUND AND v_col_type NOT IN ('text','character varying') THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.worker_id exists as %, expected text.', v_col_type;
  END IF;

  -- lease_token: uuid
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='lease_token';
  IF FOUND AND v_col_type != 'uuid' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.lease_token exists as %, expected uuid.', v_col_type;
  END IF;

  -- lease_expires_at: timestamp with time zone
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='lease_expires_at';
  IF FOUND AND v_col_type != 'timestamp with time zone' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.lease_expires_at exists as %, expected timestamptz.', v_col_type;
  END IF;

  -- heartbeat_at: timestamp with time zone
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='heartbeat_at';
  IF FOUND AND v_col_type != 'timestamp with time zone' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.heartbeat_at exists as %, expected timestamptz.', v_col_type;
  END IF;

  -- attempt_count: integer
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='attempt_count';
  IF FOUND AND v_col_type != 'integer' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.attempt_count exists as %, expected integer.', v_col_type;
  END IF;

  -- max_attempts: integer
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='max_attempts';
  IF FOUND AND v_col_type != 'integer' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.max_attempts exists as %, expected integer.', v_col_type;
  END IF;

  -- request_idempotency_key: text
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='request_idempotency_key';
  IF FOUND AND v_col_type NOT IN ('text','character varying') THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.request_idempotency_key exists as %, expected text.', v_col_type;
  END IF;

  -- request_payload_hash: text
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='request_payload_hash';
  IF FOUND AND v_col_type NOT IN ('text','character varying') THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.request_payload_hash exists as %, expected text.', v_col_type;
  END IF;

  -- request_classification: text
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='request_classification';
  IF FOUND AND v_col_type NOT IN ('text','character varying') THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.request_classification exists as %, expected text.', v_col_type;
  END IF;

  -- public_error_code: text
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='public_error_code';
  IF FOUND AND v_col_type NOT IN ('text','character varying') THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.public_error_code exists as %, expected text.', v_col_type;
  END IF;

  -- public_message_key: text
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='public_message_key';
  IF FOUND AND v_col_type NOT IN ('text','character varying') THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.public_message_key exists as %, expected text.', v_col_type;
  END IF;

  -- support_reference: text
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='support_reference';
  IF FOUND AND v_col_type NOT IN ('text','character varying') THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.support_reference exists as %, expected text.', v_col_type;
  END IF;

  -- snapshot_id: uuid
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='snapshot_id';
  IF FOUND AND v_col_type != 'uuid' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.snapshot_id exists as %, expected uuid.', v_col_type;
  END IF;

  -- originating_request_id: uuid
  SELECT data_type INTO v_col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs' AND column_name='originating_request_id';
  IF FOUND AND v_col_type != 'uuid' THEN
    RAISE EXCEPTION 'COLUMN DRIFT: generation_jobs.originating_request_id exists as %, expected uuid.', v_col_type;
  END IF;

  -- Nullability coherence: state_version must be NOT NULL if it exists
  PERFORM 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs'
    AND column_name='state_version' AND is_nullable = 'YES';
  IF FOUND THEN
    RAISE EXCEPTION
      'COLUMN DRIFT: generation_jobs.state_version is nullable; expected NOT NULL. '
      'This prevents safe CAS operations.';
  END IF;

  -- Nullability coherence: attempt_count must be NOT NULL if it exists
  PERFORM 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='generation_jobs'
    AND column_name='attempt_count' AND is_nullable = 'YES';
  IF FOUND THEN
    RAISE EXCEPTION
      'COLUMN DRIFT: generation_jobs.attempt_count is nullable; expected NOT NULL.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Harden postgres default privileges in public schema (Round 5 correction)
--
--     Without this, every table/function/sequence created by postgres in public
--     automatically inherits explicit grants to anon, authenticated, and
--     service_role (from the postgres/public/* default ACL confirmed in SA11).
--     Revoke these defaults before creating any new MoLis objects so new tables
--     and functions begin with owner-only access.
--
--     Only the postgres/public defaults are changed. supabase_admin defaults
--     and all managed-schema (auth/storage/realtime) defaults are preserved.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role, PUBLIC;

-- Owner was asserted in the mutation-free preflight above.
-- Forward recovery note: if a future MoLis migration must create public objects with broad
-- default access, the migration author must add explicit GRANT statements — broad defaults
-- are not restored as a security rollback. Every new public object requires an explicit
-- least-privilege GRANT to only the intended actor(s).
-- Versioned MoLis objects must not be owned by supabase_admin; only postgres-owned objects
-- are governed by these defaults.
-- R8: Require exactly postgres; supabase_admin creates objects with different defaults,
-- which would leave MoLis objects under the wrong owner and ACL regime.
-- pgcrypto extnamespace and column drift checks consolidated before first mutation (sections 1 and 1a).

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ADD COLUMNS
--    R7-H09: Column compatibility preflight moved to section 1a (before first mutation).
--    pgcrypto extnamespace check: consolidated in section 1 (main preflight, lines 129–135).
-- ─────────────────────────────────────────────────────────────────────────────

-- State machine and worker identity columns
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS state_version    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS worker_id        TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS lease_token      UUID;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS heartbeat_at     TIMESTAMPTZ;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS attempt_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS max_attempts     INTEGER NOT NULL DEFAULT 3;

-- Idempotency columns
-- request_idempotency_key: the ORIGINATING key that CREATED this job.
-- Format: "${userId}:${UUID}". Authoritative idempotency mapping is in generation_job_requests.
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS request_idempotency_key TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS request_payload_hash    TEXT;

-- C04: Classification column. NOT NULL with DEFAULT 'client_verified'; historical rows
-- without keys are backfilled to 'legacy_unverified' in the next step.
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS request_classification TEXT NOT NULL DEFAULT 'client_verified';

-- R8-M04: expected_*_updated_at columns omitted. D11 disproved timestamp-revision
-- identity (documents has no update trigger). The snapshot content_hash is the
-- sole authoritative source binding. No rows populated these fields under the new
-- architecture, so there is nothing to retain.

-- Safe public error fields (set by worker on failure, returned via fn_get_job_safe_dto)
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS public_error_code  TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS public_message_key TEXT;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS support_reference  TEXT;

-- Snapshot binding column — bound at enqueue time by fn_enqueue_job.
-- NULL for legacy_unverified rows (pre-contract). NOT NULL for all client_verified rows.
-- FK added after generation_source_snapshots is created (Step 17b-ext below).
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS snapshot_id UUID;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS originating_request_id UUID;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Widen status CHECK to include cancel_requested
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_jobs
  DROP CONSTRAINT generation_jobs_status_check;
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_status_check
    CHECK (status IN ('queued','processing','cancel_requested','completed','failed','cancelled'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill state_version for pre-migration rows
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.generation_jobs
  SET state_version = 1
  WHERE state_version IS NULL OR state_version = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. C04: Classify legacy rows as legacy_unverified
--    Historical rows with no idempotency key cannot be reused as client keys.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.generation_jobs
  SET request_classification = 'legacy_unverified'
  WHERE request_idempotency_key IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. C04: Zero-NULL assertion for request_classification (after backfill)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.generation_jobs
  WHERE request_classification IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % generation_jobs rows have NULL request_classification after backfill.',
      v_count;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. C04: Classification coherence CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_classification_coherence
  CHECK (
    ( request_classification = 'client_verified'
      AND request_idempotency_key IS NOT NULL
      AND request_payload_hash    IS NOT NULL
      AND originating_request_id IS NOT NULL )
    OR
    ( request_classification = 'legacy_unverified'
      AND request_idempotency_key IS NULL
      AND request_payload_hash    IS NULL
      AND originating_request_id IS NULL )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Key and hash format CHECK constraints
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_key_format
  CHECK (
    request_idempotency_key IS NULL
    OR request_idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_hash_format
  CHECK (
    request_payload_hash IS NULL
    OR request_payload_hash ~ '^[0-9a-f]{64}$'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. C01: Preflight assertions — now run AFTER ADD COLUMN (columns exist)
-- ─────────────────────────────────────────────────────────────────────────────

-- Assert idempotency key XOR: no row has one of (key, hash) without the other.
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.generation_jobs
  WHERE (request_idempotency_key IS NULL) != (request_payload_hash IS NULL);
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: % generation_jobs rows have (request_idempotency_key, '
      'request_payload_hash) XOR state. Manual inspection required.',
      v_count;
  END IF;
END;
$$;

-- Assert no duplicate active jobs (would block the partial unique index).
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT user_id, document_id, job_type
    FROM public.generation_jobs
    WHERE status IN ('queued','processing','cancel_requested')
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

-- Assert no duplicate (user_id, request_idempotency_key) pairs.
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
      'multiple generation_jobs rows. Manual resolution required.',
      v_count;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. C02: Catalog-checked UNIQUE constraint on (id, user_id)
--     Required for the composite FK from generation_job_requests.
--     ADD CONSTRAINT IF NOT EXISTS is INVALID PostgreSQL syntax — only
--     ADD COLUMN supports IF NOT EXISTS. Use a catalog-checked DO block instead.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.generation_jobs'::regclass
      AND conname  = 'generation_jobs_id_user_id_unique'
  ) THEN
    ALTER TABLE public.generation_jobs
      ADD CONSTRAINT generation_jobs_id_user_id_unique UNIQUE (id, user_id);
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Indexes on generation_jobs
-- ─────────────────────────────────────────────────────────────────────────────
-- D2 active-job exclusion: at most one active job per (user, document, job_type).
CREATE UNIQUE INDEX generation_jobs_active_exclusion
  ON public.generation_jobs (user_id, document_id, job_type)
  WHERE status IN ('queued','processing','cancel_requested');

-- Originating-key uniqueness: data-integrity constraint (not the idempotency lookup path).
CREATE UNIQUE INDEX generation_jobs_originating_key
  ON public.generation_jobs (user_id, request_idempotency_key)
  WHERE request_idempotency_key IS NOT NULL;

-- Active-status polling index.
DROP INDEX public.generation_jobs_status;

CREATE INDEX generation_jobs_active_status
  ON public.generation_jobs (status)
  WHERE status IN ('queued','processing','cancel_requested');

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Storage bucket assertion and private enforcement
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'study-visuals') THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: storage bucket ''study-visuals'' does not exist. '
      'Create a PRIVATE bucket named study-visuals before applying this migration.';
  END IF;
END;
$$;
-- R10-H06: Set bucket private + restrict MIME types to image/png + cap upload size.
-- 5,242,880 bytes (5 MiB) matches the image/png output range for DALL-E/gpt-image-2
-- 1024×1024 images. This supplements the Storage policy and worker-level guards.
UPDATE storage.buckets
SET public             = FALSE,
    allowed_mime_types = ARRAY['image/png'],
    file_size_limit    = 5242880
WHERE name = 'study-visuals';

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Remove only the exact D11 generation_jobs policy
--
-- The mutation-free preflight proved all proposed views/functions are absent,
-- so there is nothing to replace or drop.  Name-only DROP IF EXISTS statements
-- are intentionally omitted: an unexpected object is drift, not a repair target.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY "Users see own jobs" ON public.generation_jobs;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. REVOKE all direct table access from runtime roles
--
--     All runtime access to generation_jobs, generation_job_requests, and
--     generation_source_snapshots goes through narrow SECURITY DEFINER RPCs.
--     service_role is revoked because SECURITY DEFINER functions run as the
--     function owner (postgres), not the caller — they retain access regardless.
--     BYPASSRLS on service_role means REVOKE does not protect RLS-only gates;
--     the correct approach is to revoke table-level access and use RPCs exclusively.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs FROM service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Create generation_job_requests — authoritative idempotency ledger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.generation_job_requests (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL,
  request_idempotency_key TEXT        NOT NULL,
  -- DB-computed canonical request hash: SHA-256 over {source_digest, job_type,
  -- operation_descriptor, sanitized_input}. Computed by fn_enqueue_job, not the caller.
  request_payload_hash    TEXT        NOT NULL,
  document_id             UUID        NOT NULL,
  job_type                TEXT        NOT NULL,
  job_id                  UUID        NOT NULL,
  -- Snapshot that was bound at enqueue time for this request + job.
  -- NOT NULL: every ledger row created by fn_enqueue_job binds an immutable snapshot.
  -- (Pre-contract legacy rows were never backfilled into this table — see Step 17.)
  snapshot_id             UUID        NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT generation_job_requests_pkey
    PRIMARY KEY (id),

  CONSTRAINT generation_job_requests_unique_key
    UNIQUE (user_id, request_idempotency_key),

  CONSTRAINT generation_job_requests_user_fk
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE RESTRICT,

  -- Snapshot binding: proves the request was bound to an immutable source snapshot.
  -- snapshot_id is added as a FK after generation_source_snapshots is created (Step 17b).
  -- The column and FK constraint are added together below; this placeholder documents intent.
  CONSTRAINT generation_job_requests_hash_format
    CHECK (request_payload_hash ~ '^[0-9a-f]{64}$'),

  CONSTRAINT generation_job_requests_job_type_check
    CHECK (job_type IN ('visuals','flashcards','quiz','revision_notes','analysis')),

  -- Referenced by the originating-request FK added after both authoritative
  -- tables exist.  Including every scope value prevents a key from proving a
  -- job whose user/document/snapshot/hash/type differs.
  CONSTRAINT generation_job_requests_binding_unique
    UNIQUE (user_id, request_idempotency_key, request_payload_hash,
            job_id, document_id, snapshot_id, job_type),

  CONSTRAINT generation_job_requests_id_binding_unique
    UNIQUE (id, user_id, request_idempotency_key, request_payload_hash,
            job_id, document_id, snapshot_id, job_type)
);

CREATE INDEX generation_job_requests_job_id
  ON public.generation_job_requests (job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. RLS + REVOKE on generation_job_requests
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_job_requests ENABLE ROW LEVEL SECURITY;

-- No explicit RLS policies: RLS is enabled with no permissive or restrictive policies.
-- With RLS enabled and no policies, the default is deny-all for all roles.
-- REVOKE ALL below removes table-level privileges; the combination is fully closed.
-- (Explicit deny policies would be redundant and could cause confusion during review.)

REVOKE ALL PRIVILEGES ON TABLE public.generation_job_requests FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.generation_job_requests FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.generation_job_requests FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.generation_job_requests FROM service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. Legacy rows — NO ledger backfill (DBR6-H06)
--
--     Pre-contract rows in generation_jobs (with or without request_idempotency_key)
--     are classified as legacy_unverified and NEVER backfilled into generation_job_requests.
--     The ledger is authoritative only for rows created by fn_enqueue_job after this migration.
--
--     Rationale: Pre-contract keys and hashes were supplied by the caller, not derived
--     by the database. Backfilling them as verified ledger entries would falsely grant
--     them the same authority as atomically bound, snapshot-verified requests.
--
--     All existing generation_jobs rows with request_idempotency_key are already
--     classified legacy_unverified by Step 5. They remain searchable in generation_jobs
--     for historical audit but cannot be matched by fn_enqueue_job ledger lookup.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.generation_job_requests;
  IF v_count != 0 THEN
    RAISE EXCEPTION
      'POSTCONDITION FAILED: generation_job_requests must be empty before this migration. '
      'Found % rows. This table should have been created fresh in Step 15.',
      v_count;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17b. generation_source_snapshots — immutable content snapshot table
--
--      Stores a point-in-time snapshot of document + analysis content at enqueue
--      time. fn_enqueue_job creates one snapshot per new request atomically.
--      The worker receives only the bound snapshot via fn_get_claimed_job_context
--      and never re-reads mutable documents or document_analysis after claim.
--
--      Immutability enforcement:
--        - No UPDATE or DELETE granted to any runtime role (postgres owns the table).
--        - All writes go through fn_enqueue_job (SECURITY DEFINER, runs as postgres).
--        - All reads go through fn_get_claimed_job_context (SECURITY DEFINER).
--        - No direct table access from authenticated, anon, or service_role.
--
--      FK references use RESTRICT to prevent deletion while snapshots exist.
--      Lifecycle cleanup (DELETE) requires a separate approved migration.
--
--      Snapshot schema version 1 fields captured:
--        - Full document metadata: title, text, file_type, source_type, subject_id,
--          created_at, source_recording_id (from D11 confirmed documents columns).
--        - Analysis data (nullable: no analysis → all analysis_* fields null):
--          id, data (full JSONB consumed by worker), created_at, model/provenance.
--        - operation_descriptor: server-owned JSONB with model IDs, parameters,
--          prompt schema version. Never supplied by the caller.
--        - content_hash: database SHA-256 over the versioned canonical source envelope.
-- ─────────────────────────────────────────────────────────────────────────────
-- Parent composite keys make ownership/scope part of the reference itself.  They
-- supplement (and do not replace) the historical primary keys and foreign keys.
ALTER TABLE public.documents
  ADD CONSTRAINT documents_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.document_analysis
  ADD CONSTRAINT document_analysis_id_document_user_unique
  UNIQUE (id, document_id, user_id);

-- R9-C02: Enforce true one-row-per-(document_id, user_id) scope on document_analysis.
-- The existing (id, document_id, user_id) composite unique is redundant with the primary key
-- and does NOT prevent multiple analysis rows per (document_id, user_id). This new constraint
-- is required so that fn_enqueue_job's LEFT JOIN returns at most one analysis row, closing
-- the concurrent-insertion race identified in R8-C02. The D10 preflight (section 1) verified
-- that no duplicate (document_id, user_id) scopes exist before this constraint is added.
ALTER TABLE public.document_analysis
  ADD CONSTRAINT document_analysis_document_user_unique
  UNIQUE (document_id, user_id);

-- R10-H01: Composite FK proving analysis ownership matches document ownership.
-- UNIQUE(document_id, user_id) above prevents two rows per scope, but does NOT prevent
-- an analysis row whose user_id differs from documents.user_id. This FK closes the gap:
-- a document_analysis row can only reference a (document_id, user_id) pair that exists
-- in documents, ensuring the analysis belongs to the same user who owns the document.
-- Parent key: documents_id_user_id_unique (added at the top of this section).
ALTER TABLE public.document_analysis
  ADD CONSTRAINT document_analysis_document_owner_fk
  FOREIGN KEY (document_id, user_id)
  REFERENCES public.documents (id, user_id)
  ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17b-create. generation_source_snapshots — CREATE TABLE (R10-C01 ordering fix)
--
--   R9-C01 DEFECT FIXED: the original migration added study_visuals_source_snapshot_fk
--   (REFERENCES public.generation_source_snapshots) BEFORE this CREATE TABLE executed.
--   PostgreSQL requires the referenced table to exist at ADD CONSTRAINT time. This block
--   is moved before section 17d so all FKs that reference generation_source_snapshots
--   are added only after the table exists.
--
--   Dependency order verified:
--     - generation_source_snapshots references auth.users — always exists.
--     - generation_source_snapshots references public.documents (id, user_id)
--       via documents_id_user_id_unique — added above.
--     - generation_source_snapshots references public.document_analysis (id, document_id, user_id)
--       via document_analysis_id_document_user_unique — added above.
--     - study_visuals_source_snapshot_fk (section 17d below) references this table — now valid.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.generation_source_snapshots (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL,
  document_id             UUID        NOT NULL,
  snapshot_schema_version INTEGER     NOT NULL DEFAULT 1,
  captured_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Point-in-time copy of consumed document fields at enqueue time.
  -- D11 confirmed: documents.created_at is nullable in the live catalogue.
  document_title                TEXT        NOT NULL,
  document_extracted_text       TEXT,
  document_file_type            TEXT,
  document_source_type          TEXT,
  document_subject_id           UUID,
  document_created_at           TIMESTAMPTZ,           -- nullable per D11 live catalogue
  document_source_recording_id  UUID,                  -- nullable (from documents.source_recording_id)

  -- Point-in-time copy of consumed analysis fields (all nullable: no analysis → all null).
  analysis_id             UUID,
  analysis_data           JSONB,                       -- full JSONB consumed by the worker
  analysis_created_at     TIMESTAMPTZ,
  analysis_model          TEXT,                        -- model/provenance identifier from document_analysis

  -- Server-owned operation descriptor: model identifiers, prompt schema version,
  -- generation parameters. Never supplied by the caller. Closed JSONB schema:
  -- { schema_version, job_type, text_model, image_model, temperature,
  --   max_tokens, image_size, image_count, prompt_schema_version }
  operation_descriptor    JSONB       NOT NULL,

  -- Database-computed SHA-256 over the versioned canonical source envelope.
  -- Computed by fn_enqueue_job via fn_sha256_hex. Format: 64 lowercase hex characters.
  -- Used as the authoritative source identity for DOCUMENT_REVISION_CHANGED detection.
  content_hash            TEXT        NOT NULL,

  CONSTRAINT generation_source_snapshots_pkey
    PRIMARY KEY (id),

  CONSTRAINT generation_source_snapshots_scope_unique
    UNIQUE (id, user_id, document_id),

  CONSTRAINT generation_source_snapshots_content_hash_format
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),

  CONSTRAINT generation_source_snapshots_user_fk
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE RESTRICT,

  CONSTRAINT generation_source_snapshots_operation_descriptor_check
    CHECK (
      jsonb_typeof(operation_descriptor) = 'object'
      AND operation_descriptor ?& ARRAY[
        'schema_version','job_type','text_model','image_model','temperature',
        'max_tokens','image_size','image_count','prompt_schema_version'
      ]
      AND (operation_descriptor - ARRAY[
        'schema_version','job_type','text_model','image_model','temperature',
        'max_tokens','image_size','image_count','prompt_schema_version'
      ]::TEXT[]) = '{}'::JSONB
      AND jsonb_typeof(operation_descriptor->'schema_version') = 'number'
      AND operation_descriptor->>'job_type' IN
          ('visuals','flashcards','quiz','revision_notes','analysis')
      AND jsonb_typeof(operation_descriptor->'text_model') = 'string'
      AND jsonb_typeof(operation_descriptor->'image_model') = 'string'
      AND jsonb_typeof(operation_descriptor->'temperature') = 'number'
      AND jsonb_typeof(operation_descriptor->'max_tokens') = 'number'
      AND jsonb_typeof(operation_descriptor->'image_size') = 'string'
      AND jsonb_typeof(operation_descriptor->'image_count') = 'number'
      AND jsonb_typeof(operation_descriptor->'prompt_schema_version') = 'number'
    ),

  CONSTRAINT generation_source_snapshots_document_scope_fk
    FOREIGN KEY (document_id, user_id)
    REFERENCES public.documents (id, user_id)
    ON DELETE RESTRICT,

  CONSTRAINT generation_source_snapshots_analysis_scope_fk
    FOREIGN KEY (analysis_id, document_id, user_id)
    REFERENCES public.document_analysis (id, document_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX generation_source_snapshots_document_id
  ON public.generation_source_snapshots (document_id, user_id);

ALTER TABLE public.generation_source_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.generation_source_snapshots FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.generation_source_snapshots FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.generation_source_snapshots FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.generation_source_snapshots FROM service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17b-imm. Snapshot immutability enforcement (R8-C04)
--
--           Database-level guard: prevent any UPDATE or DELETE on snapshot rows.
--           Even the function owner (postgres) cannot mutate snapshots through
--           normal DML — a separately approved retention procedure must drop this
--           trigger before lifecycle cleanup, ensuring audit intentionality.
--           The trigger function itself receives no EXECUTE grant.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_snapshot_immutability_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'SNAPSHOT_IMMUTABLE: generation_source_snapshots rows cannot be updated. '
      'Source snapshots are append-only; create a new snapshot rather than modifying one.'
      USING ERRCODE = 'P0019';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'SNAPSHOT_IMMUTABLE: generation_source_snapshots rows cannot be deleted outside '
      'the approved retention procedure. The retention procedure must drop this trigger '
      'before performing lifecycle cleanup and restore it afterward.'
      USING ERRCODE = 'P0020';
  END IF;
  RETURN NULL; -- BEFORE trigger returning NULL cancels the operation
END;
$$;

-- Trigger functions receive no client/worker EXECUTE grant.
REVOKE ALL ON FUNCTION public.fn_snapshot_immutability_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_snapshot_immutability_guard() FROM anon;
REVOKE ALL ON FUNCTION public.fn_snapshot_immutability_guard() FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_snapshot_immutability_guard() FROM service_role;

CREATE TRIGGER trg_snapshot_immutability
  BEFORE UPDATE OR DELETE ON public.generation_source_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_snapshot_immutability_guard();

-- The verified request ledger is append-only under the same retention gate.
-- A separate trigger name makes both postconditions independently auditable.
CREATE TRIGGER trg_job_request_immutability
  BEFORE UPDATE OR DELETE ON public.generation_job_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_snapshot_immutability_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 17d. R9-H02: study_visuals publication provenance columns
--
--      Adds durable provenance to study_visuals so the database can prove which
--      exact job/snapshot/attempt/request produced the current manifest. Populated
--      atomically by fn_complete_and_publish_job in the same transaction as the
--      manifest upsert and generation_job_usage insert.
--
--      source_job_id        — FK to the generation_jobs row that published this manifest.
--      source_snapshot_id   — FK to the generation_source_snapshots row bound at enqueue.
--      source_request_hash  — request_payload_hash (64-char hex) for intent audit.
--      publication_attempt  — attempt_count when publication succeeded.
--
--      R10-C01 ordering fix: generation_source_snapshots now exists (created above)
--      before this FK is added. This was the deterministic failure identified in R9-C01.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.study_visuals
  ADD COLUMN IF NOT EXISTS source_job_id        UUID,
  ADD COLUMN IF NOT EXISTS source_snapshot_id   UUID,
  ADD COLUMN IF NOT EXISTS source_request_hash  TEXT,
  ADD COLUMN IF NOT EXISTS publication_attempt  INTEGER;

ALTER TABLE public.study_visuals
  ADD CONSTRAINT study_visuals_source_job_fk
  FOREIGN KEY (source_job_id)
  REFERENCES public.generation_jobs (id)
  ON DELETE RESTRICT;

-- R10-C01: This FK now succeeds because generation_source_snapshots was created above.
ALTER TABLE public.study_visuals
  ADD CONSTRAINT study_visuals_source_snapshot_fk
  FOREIGN KEY (source_snapshot_id)
  REFERENCES public.generation_source_snapshots (id)
  ON DELETE RESTRICT;

ALTER TABLE public.study_visuals
  ADD CONSTRAINT study_visuals_request_hash_format
  CHECK (source_request_hash IS NULL OR source_request_hash ~ '^[0-9a-f]{64}$');

-- Null coherence: provenance columns are either all NULL (legacy rows) or all NOT NULL
-- (verified publications). A partially-populated provenance tuple is not a valid state.
ALTER TABLE public.study_visuals
  ADD CONSTRAINT study_visuals_provenance_coherence
  CHECK (
    (source_job_id IS NULL AND source_snapshot_id IS NULL
     AND source_request_hash IS NULL AND publication_attempt IS NULL)
    OR
    (source_job_id IS NOT NULL AND source_snapshot_id IS NOT NULL
     AND source_request_hash IS NOT NULL AND publication_attempt IS NOT NULL)
  );

-- R11-C03: publication_attempt must be positive when present.
-- Attempt 0 is not a valid publication outcome; fn_complete_and_publish_job always
-- publishes at attempt_count >= 1.
ALTER TABLE public.study_visuals
  ADD CONSTRAINT study_visuals_publication_attempt_positive
  CHECK (publication_attempt IS NULL OR publication_attempt > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 17c. Back-reference FKs: bind snapshot_id on generation_jobs and generation_job_requests
--      to the newly created generation_source_snapshots table.
--      Must run after generation_source_snapshots exists.
-- ─────────────────────────────────────────────────────────────────────────────

-- A verified job exposes one canonical scope tuple.  Any number of equivalent
-- request keys may bind to that tuple, but a ledger row with a conflicting
-- document, snapshot, request hash, or job type cannot reference the job.
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_verified_binding_unique
  UNIQUE (id, user_id, document_id, snapshot_id, request_payload_hash, job_type);

ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_snapshot_scope_fk
  FOREIGN KEY (snapshot_id, user_id, document_id)
  REFERENCES public.generation_source_snapshots (id, user_id, document_id)
  ON DELETE RESTRICT;

ALTER TABLE public.generation_job_requests
  ADD CONSTRAINT generation_job_requests_snapshot_scope_fk
  FOREIGN KEY (snapshot_id, user_id, document_id)
  REFERENCES public.generation_source_snapshots (id, user_id, document_id)
  ON DELETE RESTRICT;

ALTER TABLE public.generation_job_requests
  ADD CONSTRAINT generation_job_requests_job_scope_fk
  FOREIGN KEY (job_id, user_id, document_id, snapshot_id,
               request_payload_hash, job_type)
  REFERENCES public.generation_jobs
    (id, user_id, document_id, snapshot_id, request_payload_hash, job_type)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- The key stored on a verified job is its originating ledger row.  This circular
-- relationship is intentionally deferred: fn_enqueue_job creates snapshot, job,
-- then ledger in one transaction and COMMIT validates the complete graph.
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_originating_request_fk
  FOREIGN KEY (originating_request_id, user_id, request_idempotency_key,
               request_payload_hash, id, document_id, snapshot_id, job_type)
  REFERENCES public.generation_job_requests
    (id, user_id, request_idempotency_key, request_payload_hash,
     job_id, document_id, snapshot_id, job_type)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- Authoritative, idempotent visual usage evidence.  This deliberately does not
-- write the legacy client-insertable usage_events table.  One winning completion
-- can create one row for one job; the row is committed or rolled back with the
-- manifest and terminal job transition.  Monetary costing remains a later trusted
-- usage-events concern, while Phase 1–2 records the billable model/image units.
CREATE TABLE public.generation_job_usage (
  job_id               UUID        NOT NULL,
  user_id              UUID        NOT NULL,
  document_id          UUID        NOT NULL,
  snapshot_id          UUID        NOT NULL,
  request_payload_hash TEXT        NOT NULL,
  job_type              TEXT        NOT NULL,
  attempt_count        INTEGER     NOT NULL,
  model                 TEXT        NOT NULL,
  generated_count       INTEGER     NOT NULL,
  failed_count          INTEGER     NOT NULL,
  result_code           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT generation_job_usage_pkey PRIMARY KEY (job_id),
  CONSTRAINT generation_job_usage_counts_check CHECK (
    attempt_count > 0 AND generated_count >= 0 AND failed_count >= 0
    AND generated_count + failed_count <= 10
  ),
  CONSTRAINT generation_job_usage_job_scope_fk FOREIGN KEY
    (job_id, user_id, document_id, snapshot_id, request_payload_hash, job_type)
    REFERENCES public.generation_jobs
      (id, user_id, document_id, snapshot_id, request_payload_hash, job_type)
    ON DELETE RESTRICT
);

-- R11-C03: composite UNIQUE required so study_visuals can composite-FK reference
-- (job_id, user_id, document_id, snapshot_id, request_payload_hash, attempt_count).
-- PRIMARY KEY (job_id) alone is insufficient because the FK must pin the exact attempt.
ALTER TABLE public.generation_job_usage
  ADD CONSTRAINT generation_job_usage_publication_unique
    UNIQUE (job_id, user_id, document_id, snapshot_id, request_payload_hash, attempt_count);

-- R12-C01 ORDER-CORRECTED: composite FK pins study_visuals to the exact generation_job_usage
-- row (job, user, document, snapshot, request, attempt). Placed here — after both the
-- generation_job_usage table and generation_job_usage_publication_unique — so the target
-- table and UNIQUE constraint both exist before this FK is declared.
-- NULL columns (legacy rows) bypass the FK check.
ALTER TABLE public.study_visuals
  ADD CONSTRAINT study_visuals_usage_provenance_fk
  FOREIGN KEY (source_job_id, user_id, document_id, source_snapshot_id,
               source_request_hash, publication_attempt)
  REFERENCES public.generation_job_usage
    (job_id, user_id, document_id, snapshot_id, request_payload_hash, attempt_count)
  ON DELETE RESTRICT;

ALTER TABLE public.generation_job_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.generation_job_usage
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_generation_job_usage_immutability
  BEFORE UPDATE OR DELETE ON public.generation_job_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_snapshot_immutability_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. C05: Deferred constraint trigger for client_verified ledger binding
--     Fires at COMMIT time (DEFERRABLE INITIALLY DEFERRED). Verifies that every
--     client_verified job has a matching generation_job_requests row.
--     fn_enqueue_job inserts both rows in the same transaction; the deferred
--     trigger fires at commit when both are present.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_check_ledger_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.request_classification = 'client_verified' THEN
    -- Verify ledger entry exists and binds the correct snapshot.
    IF NOT EXISTS (
      SELECT 1 FROM public.generation_job_requests r
      WHERE r.job_id = NEW.id
        AND r.id = NEW.originating_request_id
        AND r.user_id = NEW.user_id
        AND r.document_id = NEW.document_id
        AND r.snapshot_id = NEW.snapshot_id
        AND r.request_idempotency_key = NEW.request_idempotency_key
        AND r.request_payload_hash = NEW.request_payload_hash
        AND r.job_type = NEW.job_type
    ) THEN
      RAISE EXCEPTION
        'LEDGER_BINDING_MISSING: client_verified job % (user %) has no matching ledger entry '
        'with a bound snapshot_id at COMMIT time. '
        'fn_enqueue_job must atomically create snapshot, job, and ledger in one transaction.',
        NEW.id, NEW.user_id
        USING ERRCODE = 'P0099';
    END IF;

    -- Verify the snapshot belongs to the same user and document.
    IF NOT EXISTS (
      SELECT 1 FROM public.generation_source_snapshots s
      WHERE s.id = NEW.snapshot_id
        AND s.user_id = NEW.user_id
        AND s.document_id = NEW.document_id
    ) THEN
      RAISE EXCEPTION
        'SNAPSHOT_OWNERSHIP_MISMATCH: job % snapshot_id does not match user+document scope.',
        NEW.id USING ERRCODE = 'P0099';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_check_ledger_binding
  AFTER INSERT OR UPDATE ON public.generation_jobs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_ledger_binding();

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. C03: Storage RESTRICTIVE deny policies for study-visuals
--
--     SECURITY DEFECT FIXED: the previous policy used
--       USING (bucket_id = 'study-visuals' AND FALSE)
--     which always evaluates to FALSE for ALL rows (not just study-visuals rows).
--     As a PERMISSIVE policy with USING(FALSE), it does NOT override other
--     permissive policies that allow access — authenticated users could still
--     read study-visuals objects through any other permissive policy.
--
--     CORRECT APPROACH: RESTRICTIVE policies.
--     For RESTRICTIVE policies, ALL must pass for access to be granted.
--       USING (bucket_id != 'study-visuals'):
--         - Returns FALSE for study-visuals rows → denies authenticated/anon access.
--         - Returns TRUE for other bucket rows → does not restrict them.
--     service_role bypasses RLS entirely — worker uploads are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the four exact study-visuals permissive policies by exact name.
-- Names confirmed in d11-additional-authority-results-2026-07-31.csv (SA11/SA14).
-- Using exact names prevents accidentally dropping unrelated policies.
DROP POLICY IF EXISTS "For full customization 137qt67_0" ON storage.objects;
DROP POLICY IF EXISTS "For full customization 137qt67_1" ON storage.objects;
DROP POLICY IF EXISTS "For full customization 137qt67_2" ON storage.objects;
DROP POLICY IF EXISTS "For full customization 137qt67_3" ON storage.objects;

-- No pattern-based safety net: pattern deletion is removed (DBR6-H04).
-- Pattern drops exceed the authority to reconcile only the four catalogued policies
-- and could delete an unrelated or future policy. Only the four exact named policies
-- above are dropped. If additional unexpected study-visuals policies are discovered
-- during execution, the migration should fail explicitly — not silently remove them.
-- A future manual review or approved static inspection should resolve unexpected policies.

-- Restrictive policy: authenticated cannot access study-visuals objects.
CREATE POLICY "study_visuals_block_authenticated"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING     (bucket_id != 'study-visuals')
  WITH CHECK (bucket_id != 'study-visuals');

-- Restrictive policy: anon cannot access study-visuals objects.
CREATE POLICY "study_visuals_block_anon"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING     (bucket_id != 'study-visuals')
  WITH CHECK (bucket_id != 'study-visuals');

-- Postcondition: verify old policies gone, restrictive policies present,
-- and the four exact D11-catalogued legacy policies are absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets
      WHERE id='study-visuals' AND name='study-visuals' AND public=FALSE) THEN
    RAISE EXCEPTION 'STORAGE POSTCONDITION: study-visuals is not private';
  END IF;

  -- R10-H06: Verify MIME restriction and size cap were applied.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets
      WHERE id='study-visuals'
        AND allowed_mime_types = ARRAY['image/png']
        AND file_size_limit = 5242880) THEN
    RAISE EXCEPTION 'STORAGE POSTCONDITION: study-visuals MIME types or file_size_limit not set correctly';
  END IF;

  -- Exactly seven unrelated D11 policies plus the two bucket-scoped restrictive
  -- guards must remain.  Definitions are compared, not merely names or counts.
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects') <> 9
     OR EXISTS (
       SELECT 1 FROM (VALUES
        ('Users can delete own files','DELETE','PERMISSIVE','authenticated',
         '((bucket_id = ''study-documents''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
        ('Users can read own files','SELECT','PERMISSIVE','authenticated',
         '((bucket_id = ''study-documents''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
        ('Users can upload to own folder','INSERT','PERMISSIVE','authenticated',NULL,
         '((bucket_id = ''study-documents''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))'),
        ('recordings_delete','DELETE','PERMISSIVE','public',
         '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
        ('recordings_read','SELECT','PERMISSIVE','public',
         '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',NULL),
        ('recordings_update','UPDATE','PERMISSIVE','public',
         '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',
         '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))'),
        ('recordings_upload','INSERT','PERMISSIVE','public',NULL,
         '((bucket_id = ''recordings''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))'),
        ('study_visuals_block_authenticated','ALL','RESTRICTIVE','authenticated',
         '(bucket_id <> ''study-visuals''::text)','(bucket_id <> ''study-visuals''::text)'),
        ('study_visuals_block_anon','ALL','RESTRICTIVE','anon',
         '(bucket_id <> ''study-visuals''::text)','(bucket_id <> ''study-visuals''::text)')
       ) AS expected(name,cmd,mode,role_name,qual,with_check)
       LEFT JOIN pg_policies p ON p.schemaname='storage' AND p.tablename='objects'
        AND p.policyname=expected.name
       WHERE p.policyname IS NULL OR p.cmd<>expected.cmd OR p.permissive<>expected.mode
         OR p.roles<>ARRAY[expected.role_name]::name[]
         OR p.qual IS DISTINCT FROM expected.qual
         OR p.with_check IS DISTINCT FROM expected.with_check
     ) THEN
    RAISE EXCEPTION 'STORAGE POSTCONDITION: exact nine-policy fingerprint failed';
  END IF;

  -- R10-H05: Supabase-managed service authority is preserved for trusted upload/signing.
  -- Test each privilege individually — has_table_privilege(role, table, 'A,B,...')
  -- uses ANY semantics (true if at least one of the listed privileges is held), which
  -- cannot prove "role holds ALL of these." Each check is independent.
  IF NOT has_table_privilege('service_role','storage.objects','SELECT')
     OR NOT has_table_privilege('service_role','storage.objects','INSERT')
     OR NOT has_table_privilege('service_role','storage.objects','UPDATE')
     OR NOT has_table_privilege('service_role','storage.objects','DELETE')
     OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'STORAGE POSTCONDITION: trusted upload/signing authority changed';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. C06: fn_get_claimed_job_context — GRANT TO service_role ONLY
--
--     Narrow RPC: verifies all 6 post-claim predicates and returns only the
--     fields the worker needs. Prevents unrestricted service-role reads of
--     generation_jobs using only job ID and status.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_get_claimed_job_context(
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
  v_job  RECORD;
  v_snap RECORD;
BEGIN
  -- Verify all 6 post-claim predicates (worker_id, lease_token, state_version,
  -- status=processing, unexpired lease). Returns NULL if any predicate fails.
  SELECT j.user_id, j.document_id, j.job_type, j.attempt_count, j.snapshot_id
  INTO v_job
  FROM public.generation_jobs j
  WHERE j.id              = p_job_id
    AND j.worker_id        = p_worker_id
    AND j.lease_token      = p_lease_token
    AND j.state_version    = p_state_version
    AND j.status           = 'processing'
    AND j.lease_expires_at > NOW()
    AND j.request_classification = 'client_verified'
    AND EXISTS (
      SELECT 1 FROM public.generation_job_requests r
      WHERE (r.id,r.job_id,r.user_id,r.document_id,r.snapshot_id,
             r.request_payload_hash,r.job_type,r.request_idempotency_key)
          = (j.originating_request_id,j.id,j.user_id,j.document_id,j.snapshot_id,
             j.request_payload_hash,j.job_type,j.request_idempotency_key)
    );

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Return NULL if no snapshot is bound (legacy_unverified job — cannot execute safely).
  IF v_job.snapshot_id IS NULL THEN RETURN NULL; END IF;

  -- Fetch the immutable snapshot. This is the only source of truth for the worker.
  -- The worker never reads mutable documents or document_analysis after this point.
  SELECT s.document_title,
         s.document_extracted_text,
         s.document_file_type,
         s.document_source_type,
         s.analysis_data,
         s.operation_descriptor,
         s.content_hash
  INTO v_snap
  FROM public.generation_source_snapshots s
  WHERE s.id          = v_job.snapshot_id
    AND s.user_id     = v_job.user_id
    AND s.document_id = v_job.document_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'user_id',              v_job.user_id,
    'document_id',          v_job.document_id,
    'job_type',             v_job.job_type,
    'attempt_count',        v_job.attempt_count,
    'snapshot_id',          v_job.snapshot_id,
    'snapshot_title',       v_snap.document_title,
    'snapshot_text',        v_snap.document_extracted_text,
    'snapshot_analysis',    v_snap.analysis_data,
    'content_hash',         v_snap.content_hash,
    'operation_descriptor', v_snap.operation_descriptor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_claimed_job_context(UUID, TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_claimed_job_context(UUID, TEXT, UUID, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. fn_get_job_safe_dto — GRANT TO authenticated
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
                            THEN jsonb_build_object(
                                   'visual_count', v_job.result_data -> 'visual_count',
                                   'result_code',  v_job.result_data -> 'result_code'
                                 )
                            ELSE NULL
                          END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_job_safe_dto(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_job_safe_dto(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. fn_get_active_job_for_document — GRANT TO authenticated
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
    AND status IN ('queued','processing','cancel_requested')
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
                            THEN jsonb_build_object(
                                   'visual_count', v_job.result_data -> 'visual_count',
                                   'result_code',  v_job.result_data -> 'result_code'
                                 )
                            ELSE NULL
                          END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_active_job_for_document(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_active_job_for_document(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22a. fn_get_owner_study_visuals — GRANT TO authenticated
--
--      R8-H04 correction: this function now returns ONLY the public-safe visual shape.
--      storage_path and image_prompt are stripped from each item in the visuals array
--      at the database boundary. Authenticated callers (including direct Data API calls)
--      can never retrieve private Storage paths or internal prompt text through this RPC.
--
--      The companion fn_get_visuals_signing_manifest (service_role only) returns the
--      full visuals JSONB including storage_path for server-side URL signing. The API
--      route calls both: this function to verify ownership, the signing function to
--      obtain paths for URL generation.
--
--      Returned shape (PublicVisualSet):
--        { id, document_id, model, created_at, visuals: [{ topic, description,
--          status, image_url: null, error?, failure_stage? }] }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_get_owner_study_visuals(p_document_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id      UUID;
  v_row          RECORD;
  v_public_items JSONB;
  v_item         JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, document_id, visuals, model, created_at
  INTO   v_row
  FROM   public.study_visuals
  WHERE  document_id = p_document_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Build a public-safe visuals array: strip storage_path and image_prompt
  -- from each item. Construct by allowlist — only explicitly listed keys pass.
  v_public_items := '[]'::jsonb;
  FOR v_item IN SELECT jsonb_array_elements(v_row.visuals) LOOP
    v_public_items := v_public_items || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id',            v_item->>'id',
        'topic',         v_item->>'topic',
        'description',   v_item->>'description',
        'status',        v_item->>'status',
        'image_url',     NULL::text,          -- signed URLs resolved by the API route
        'error',         v_item->'error',     -- null → stripped by jsonb_strip_nulls
        'failure_stage', v_item->'failure_stage'
      ))
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id',          v_row.id,
    'document_id', v_row.document_id,
    'visuals',     v_public_items,
    'model',       v_row.model,
    'created_at',  v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_owner_study_visuals(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_owner_study_visuals(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_get_owner_study_visuals(UUID) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_owner_study_visuals(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22a-sign. fn_get_visuals_signing_manifest — service_role only
--
--      Returns the full visuals JSONB including storage_path values for server-side
--      URL signing. Takes an explicit p_user_id parameter because service_role
--      bypasses RLS and auth.uid() is unavailable. The API route passes the
--      authenticated user's ID (verified separately by the user-session client).
--      Never callable by anon or authenticated roles.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_get_visuals_signing_manifest(p_document_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_visuals JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_USER_ID: p_user_id must not be NULL' USING ERRCODE = 'P0001';
  END IF;

  SELECT visuals INTO v_visuals
  FROM   public.study_visuals
  WHERE  document_id = p_document_id AND user_id = p_user_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN v_visuals;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_visuals_signing_manifest(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_visuals_signing_manifest(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_get_visuals_signing_manifest(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_visuals_signing_manifest(UUID, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22b. Revoke direct study_visuals table access from runtime roles (DBR6-H02)
--
--      study_visuals is now worker-authoritative: only fn_complete_and_publish_job
--      (SECURITY DEFINER, runs as postgres) may write to it. All authenticated reads
--      use fn_get_owner_study_visuals. The study_visuals_owner_all RLS policy is
--      dropped to prevent direct authenticated write/delete/update.
--
--      SECURITY DEFINER functions run as postgres (the function owner) — they retain
--      table access regardless of these REVOKE statements. service_role BYPASSRLS
--      means REVOKE protects the direct-access path but not the RLS layer, which is
--      correct here since we need fn_complete_and_publish_job (postgres) to write.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY "study_visuals_owner_all" ON public.study_visuals;

REVOKE ALL PRIVILEGES ON TABLE public.study_visuals FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.study_visuals FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.study_visuals FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.study_visuals FROM service_role;

ALTER TABLE public.study_visuals ENABLE ROW LEVEL SECURITY;

-- Postcondition: study_visuals direct access is closed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_visuals'
      AND policyname IN ('study_visuals_owner_all', 'Users can manage own visuals', 'study_visuals_owner_select')
  ) THEN
    RAISE EXCEPTION
      'POSTCONDITION FAILED: legacy study_visuals RLS policy still exists after DROP.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 23. fn_claim_job — GRANT TO service_role ONLY
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
    AND request_classification = 'client_verified'
    AND EXISTS (
      SELECT 1 FROM public.generation_job_requests r
      WHERE (r.id,r.job_id,r.user_id,r.document_id,r.snapshot_id,
             r.request_payload_hash,r.job_type,r.request_idempotency_key)
          = (generation_jobs.originating_request_id,generation_jobs.id,
             generation_jobs.user_id,generation_jobs.document_id,
             generation_jobs.snapshot_id,generation_jobs.request_payload_hash,
             generation_jobs.job_type,generation_jobs.request_idempotency_key)
    )
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
-- 24. C07: fn_heartbeat_job — GRANT TO service_role ONLY
--
--     Returns typed JSONB with refusal_reason indicating WHY renewal was refused.
--     CANCEL WINS: refuses to renew leases for cancel_requested jobs.
--
--     Return values:
--       { renewed: true,  lease_expires_at: "..." }
--       { renewed: false, refusal_reason: "cancel_requested" }
--       { renewed: false, refusal_reason: "expired_lease" }
--       { renewed: false, refusal_reason: "wrong_token" }
--       { renewed: false, refusal_reason: "not_processing" }
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
  v_new_expires   TIMESTAMPTZ;
  v_row_count     INTEGER;
  v_status        TEXT;
  v_stored_token  UUID;
  v_stored_worker TEXT;
  v_lease_expires TIMESTAMPTZ;
  v_stored_version INTEGER;
BEGIN
  IF p_lease_duration_seconds < 30 OR p_lease_duration_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_LEASE_DURATION: must be between 30 and 3600 seconds'
      USING ERRCODE = 'P0011';
  END IF;

  BEGIN
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
  END IF;

  -- Determine why the renewal was refused.
  SELECT status, lease_token, worker_id, lease_expires_at, state_version
  INTO v_status, v_stored_token, v_stored_worker, v_lease_expires, v_stored_version
  FROM public.generation_jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('renewed', FALSE, 'refusal_reason', 'job_not_processing');
  END IF;

  IF v_status = 'cancel_requested' THEN
    RETURN jsonb_build_object('renewed', FALSE, 'refusal_reason', 'cancel_requested');
  END IF;

  IF v_status IN ('completed','failed','cancelled') THEN
    RETURN jsonb_build_object('renewed', FALSE, 'refusal_reason', 'terminal');
  END IF;

  IF v_stored_token IS DISTINCT FROM p_lease_token
     OR v_stored_worker IS DISTINCT FROM p_worker_id
     OR v_stored_version IS DISTINCT FROM p_state_version
     OR v_lease_expires IS NULL OR v_lease_expires <= NOW() THEN
    RETURN jsonb_build_object('renewed', FALSE, 'refusal_reason', 'authority_lost');
  END IF;

  RETURN jsonb_build_object('renewed', FALSE, 'refusal_reason', 'job_not_processing');
  EXCEPTION WHEN OTHERS THEN
    -- Stable internal classification only.  SQLSTATE, relation names, and raw
    -- diagnostics are intentionally neither returned nor logged by this RPC.
    RETURN jsonb_build_object('renewed', FALSE, 'refusal_reason', 'transient_failure');
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_heartbeat_job(UUID, TEXT, UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_heartbeat_job(UUID, TEXT, UUID, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 25. C08: fn_complete_job — GRANT TO service_role ONLY
--
--     For NON-VISUALS job types only. Visuals jobs MUST use fn_complete_and_publish_job
--     to ensure atomic publication of study_visuals. fn_complete_job for job_type='visuals'
--     raises P0012 to prevent incomplete publication.
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
  v_job_type      TEXT;
  v_status        TEXT;
  v_stored_token  UUID;
  v_stored_worker TEXT;
  v_lease_expires TIMESTAMPTZ;
BEGIN
  -- C08: type guard — visuals jobs must use fn_complete_and_publish_job.
  SELECT job_type INTO v_job_type FROM public.generation_jobs WHERE id = p_job_id;
  IF FOUND AND v_job_type = 'visuals' THEN
    RAISE EXCEPTION
      'USE_PUBLISH_RPC: visuals jobs must use fn_complete_and_publish_job, not fn_complete_job'
      USING ERRCODE = 'P0012';
  END IF;

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

  -- Attempt 2: D1 cancel wins. state_version = claim_version + 1 proves one cancel increment.
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
-- 26. C09: fn_complete_and_publish_job — GRANT TO service_role ONLY
--
--     Atomic: completes a visuals job AND writes the study_visuals manifest.
--     C09a: p_result_code = 'NO_VISUAL_TOPICS' required when p_visuals is empty.
--           Empty manifest without this code → P0013 (cannot infer absence of topics).
--     C09b: Storage path prefix validation — every generated item's storage_path
--           must begin with {user_id}/{document_id}/{job_id}/ to prevent workers
--           from referencing arbitrary Storage paths.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_complete_and_publish_job(
  p_job_id        UUID,
  p_worker_id     TEXT,
  p_lease_token   UUID,
  p_state_version INTEGER,
  p_visuals       JSONB,
  p_model         TEXT,
  p_result_code   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document_id     UUID;
  v_user_id         UUID;
  v_job_type        TEXT;
  v_attempt_count   INTEGER;
  v_ok              UUID;
  v_status          TEXT;
  v_stored_token    UUID;
  v_stored_worker   TEXT;
  v_lease_expires   TIMESTAMPTZ;
  v_visual_count    INTEGER;
  v_generated_count INTEGER := 0;
  v_failed_count    INTEGER := 0;
  v_expected_prefix TEXT;
  v_expected_model  TEXT;
  v_snapshot_id     UUID;
  v_request_hash    TEXT;
  v_item            JSONB;
  v_item_id         TEXT;
  v_item_status     TEXT;
  v_item_path       TEXT;
  v_seen_ids        TEXT[] := ARRAY[]::TEXT[];
  v_seen_paths      TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT j.user_id, j.document_id, j.job_type, j.attempt_count,
         j.snapshot_id, j.request_payload_hash,
         (s.operation_descriptor->>'text_model') || '+' ||
           (s.operation_descriptor->>'image_model')
  INTO v_user_id, v_document_id, v_job_type, v_attempt_count,
       v_snapshot_id, v_request_hash, v_expected_model
  FROM public.generation_jobs j
  JOIN public.generation_source_snapshots s
    ON (s.id,s.user_id,s.document_id)=(j.snapshot_id,j.user_id,j.document_id)
  WHERE j.id = p_job_id
    AND j.request_classification = 'client_verified'
    AND EXISTS (
      SELECT 1 FROM public.generation_job_requests r
      WHERE (r.id,r.job_id,r.user_id,r.document_id,r.snapshot_id,
             r.request_payload_hash,r.job_type,r.request_idempotency_key)
          = (j.originating_request_id,j.id,j.user_id,j.document_id,j.snapshot_id,
             j.request_payload_hash,j.job_type,j.request_idempotency_key)
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','final_status',NULL);
  END IF;

  IF v_job_type != 'visuals' THEN
    RAISE EXCEPTION
      'WRONG_JOB_TYPE: fn_complete_and_publish_job is only for visuals jobs, got %',
      v_job_type USING ERRCODE = 'P0012';
  END IF;

  IF p_model IS NULL OR p_model <> v_expected_model OR char_length(p_model) > 200 THEN
    RAISE EXCEPTION 'INVALID_MANIFEST: model does not match the bound operation descriptor'
      USING ERRCODE = 'P0013';
  END IF;

  -- Closed manifest validation (DBR6-H05).

  -- p_visuals must be a JSON array (not null, not object).
  IF p_visuals IS NULL OR jsonb_typeof(p_visuals) != 'array' THEN
    RAISE EXCEPTION
      'INVALID_MANIFEST: p_visuals must be a non-null JSON array'
      USING ERRCODE = 'P0013';
  END IF;

  v_visual_count := jsonb_array_length(p_visuals);

  -- Bounded manifest size (max 10 items per generation).
  IF v_visual_count > 10 THEN
    RAISE EXCEPTION
      'INVALID_MANIFEST: p_visuals exceeds maximum of 10 items (got %)', v_visual_count
      USING ERRCODE = 'P0013';
  END IF;

  IF octet_length(p_visuals::TEXT) > 65536 THEN
    RAISE EXCEPTION 'INVALID_MANIFEST: encoded manifest exceeds 64 KB'
      USING ERRCODE = 'P0013';
  END IF;

  -- Allowed result codes.
  IF p_result_code IS NOT NULL AND p_result_code NOT IN ('NO_VISUAL_TOPICS') THEN
    RAISE EXCEPTION
      'INVALID_RESULT_CODE: % is not an allowed result code', p_result_code
      USING ERRCODE = 'P0013';
  END IF;

  -- C09a: NO_VISUAL_TOPICS result code required for empty manifests.
  IF p_result_code = 'NO_VISUAL_TOPICS' AND v_visual_count != 0 THEN
    RAISE EXCEPTION
      'INVALID_MANIFEST: NO_VISUAL_TOPICS result code requires an empty visuals array'
      USING ERRCODE = 'P0013';
  END IF;

  IF p_result_code IS NULL AND v_visual_count = 0 THEN
    RAISE EXCEPTION
      'INVALID_MANIFEST: empty visuals array requires p_result_code = ''NO_VISUAL_TOPICS'''
      USING ERRCODE = 'P0013';
  END IF;

  -- C09b: Per-item field and Storage path validation.
  IF v_visual_count > 0 THEN
    -- Exact current-attempt prefix: {user_id}/{document_id}/{job_id}/{attempt_count}/
    v_expected_prefix := v_user_id::TEXT || '/' || v_document_id::TEXT || '/'
                      || p_job_id::TEXT || '/' || v_attempt_count::TEXT || '/';

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_visuals)
    LOOP
      IF jsonb_typeof(v_item) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_MANIFEST: every array item must be an object'
          USING ERRCODE = 'P0013';
      END IF;

      IF (v_item - ARRAY[
            'id','topic','description','image_prompt','storage_path','image_url',
            'mime_type','status','error','failure_stage'
          ]::TEXT[]) <> '{}'::JSONB
         OR NOT (v_item ?& ARRAY[
            'id','topic','description','image_prompt','storage_path','image_url',
            'mime_type','status'
          ]) THEN
        RAISE EXCEPTION 'INVALID_MANIFEST: item keys are not the closed manifest schema'
          USING ERRCODE = 'P0013';
      END IF;

      IF jsonb_typeof(v_item->'id') <> 'string'
         OR jsonb_typeof(v_item->'topic') <> 'string'
         OR jsonb_typeof(v_item->'description') <> 'string'
         OR jsonb_typeof(v_item->'image_prompt') <> 'string'
         OR jsonb_typeof(v_item->'status') <> 'string'
         OR jsonb_typeof(v_item->'image_url') <> 'null' THEN
        RAISE EXCEPTION 'INVALID_MANIFEST: required field type or image_url null contract failed'
          USING ERRCODE = 'P0013';
      END IF;

      v_item_id     := v_item->>'id';
      v_item_status := v_item->>'status';
      v_item_path   := v_item->>'storage_path';

      IF v_item_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_item_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'INVALID_MANIFEST: visual id is invalid or duplicated'
          USING ERRCODE = 'P0013';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_item_id);

      IF char_length(btrim(v_item->>'topic')) NOT BETWEEN 1 AND 100
         OR char_length(v_item->>'description') > 1000
         OR char_length(btrim(v_item->>'image_prompt')) NOT BETWEEN 1 AND 4000 THEN
        RAISE EXCEPTION 'INVALID_MANIFEST: topic, description, or prompt length is invalid'
          USING ERRCODE = 'P0013';
      END IF;

      -- A terminal publication never contains pending work.
      IF v_item_status NOT IN ('generated', 'failed') THEN
        RAISE EXCEPTION
          'INVALID_MANIFEST: terminal item status % is not allowed', v_item_status
          USING ERRCODE = 'P0013';
      END IF;

      -- generated items must have a non-null storage_path within the exact current-attempt prefix.
      IF v_item_status = 'generated' THEN
        IF v_item_path IS NULL THEN
          RAISE EXCEPTION
            'INVALID_MANIFEST: generated item has null storage_path'
            USING ERRCODE = 'P0013';
        END IF;
        IF jsonb_typeof(v_item->'storage_path') <> 'string'
           OR jsonb_typeof(v_item->'mime_type') <> 'string'
           OR v_item->>'mime_type' <> 'image/png'
           OR v_item_path <> v_expected_prefix || v_item_id || '.png' THEN
          RAISE EXCEPTION
            'INVALID_STORAGE_PATH: generated item must be the current-attempt UUID PNG path'
            USING ERRCODE = 'P0013';
        END IF;
        IF v_item_path = ANY(v_seen_paths) OR v_item ? 'error' OR v_item ? 'failure_stage' THEN
          RAISE EXCEPTION 'INVALID_MANIFEST: generated path duplicated or failure fields present'
            USING ERRCODE = 'P0013';
        END IF;
        v_seen_paths := array_append(v_seen_paths, v_item_path);
        v_generated_count := v_generated_count + 1;
      ELSE
        IF jsonb_typeof(v_item->'storage_path') <> 'null'
           OR jsonb_typeof(v_item->'mime_type') <> 'null'
           OR NOT (v_item ?& ARRAY['error','failure_stage'])
           OR jsonb_typeof(v_item->'error') <> 'string'
           OR jsonb_typeof(v_item->'failure_stage') <> 'string'
           OR v_item->>'error' NOT IN ('IMAGE_GENERATION_FAILED','STORAGE_UPLOAD_FAILED')
           OR v_item->>'failure_stage' NOT IN ('image_generation','storage_upload')
           OR (v_item->>'error'='IMAGE_GENERATION_FAILED' AND v_item->>'failure_stage'<>'image_generation')
           OR (v_item->>'error'='STORAGE_UPLOAD_FAILED' AND v_item->>'failure_stage'<>'storage_upload') THEN
          RAISE EXCEPTION 'INVALID_MANIFEST: failed item field/status contract failed'
            USING ERRCODE = 'P0013';
        END IF;
        v_failed_count := v_failed_count + 1;
      END IF;
    END LOOP;

    IF v_generated_count = 0 THEN
      RAISE EXCEPTION
        'INVALID_MANIFEST: a completed non-empty manifest requires at least one generated item'
        USING ERRCODE = 'P0013';
    END IF;
  END IF;

  -- Attempt 1: processing (claim version) → completed + publish manifest.
  UPDATE public.generation_jobs
  SET status           = 'completed',
      result_data      = jsonb_build_object(
                           'visual_count', v_visual_count,
                           'result_code',  p_result_code
                         ),
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
    -- R9-H02: Include provenance columns so the database can prove which exact
    -- job/snapshot/attempt produced the current manifest. All values are derived
    -- from the verified job record read at the top of this function.
    -- R11-C03: generation_job_usage must be inserted FIRST because study_visuals
    -- composite-FKs to it. The FK references (job_id, user_id, document_id, snapshot_id,
    -- request_payload_hash, attempt_count) which must exist before study_visuals is upserted.
    INSERT INTO public.generation_job_usage (
      job_id, user_id, document_id, snapshot_id, request_payload_hash, job_type,
      attempt_count, model, generated_count, failed_count, result_code
    ) VALUES (
      p_job_id, v_user_id, v_document_id, v_snapshot_id, v_request_hash, v_job_type,
      v_attempt_count, p_model, v_generated_count, v_failed_count, p_result_code
    );

    INSERT INTO public.study_visuals (
      document_id, user_id, visuals, model,
      source_job_id, source_snapshot_id, source_request_hash, publication_attempt,
      created_at
    )
    VALUES (
      v_document_id, v_user_id, COALESCE(p_visuals, '[]'::JSONB), p_model,
      p_job_id, v_snapshot_id, v_request_hash, v_attempt_count,
      NOW()
    )
    ON CONFLICT (document_id, user_id)
    DO UPDATE SET
      visuals             = EXCLUDED.visuals,
      model               = EXCLUDED.model,
      source_job_id       = EXCLUDED.source_job_id,
      source_snapshot_id  = EXCLUDED.source_snapshot_id,
      source_request_hash = EXCLUDED.source_request_hash,
      publication_attempt = EXCLUDED.publication_attempt;

    RETURN jsonb_build_object(
      'outcome','completed','final_status','completed',
      'visual_count', v_visual_count,
      'result_code',  p_result_code
    );
  END IF;

  -- Attempt 2: D1 cancel wins. state_version = claim_version + 1.
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

REVOKE ALL ON FUNCTION public.fn_complete_and_publish_job(UUID, TEXT, UUID, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_complete_and_publish_job(UUID, TEXT, UUID, INTEGER, JSONB, TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 27. fn_fail_job — GRANT TO service_role ONLY
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
  -- H07: Database-enforced allowlists for public diagnostic fields (DBR6-C12).
  -- Only reviewed (error_code, message_key) PAIRS are accepted — validating each
  -- field independently would still allow mismatched pairs to reach the DB.
  IF NOT (
       (p_error_code = 'JOB_PROVIDER_UNAVAILABLE' AND p_message_key = 'errors.job.provider_unavailable')
    OR (p_error_code = 'JOB_PROVIDER_RATE_LIMITED' AND p_message_key = 'errors.job.rate_limited')
    OR (p_error_code = 'JOB_INPUT_TOO_LARGE'       AND p_message_key = 'errors.job.input_too_large')
    OR (p_error_code = 'JOB_OUTPUT_UNAVAILABLE'    AND p_message_key = 'errors.job.output_unavailable')
    OR (p_error_code = 'JOB_TIMEOUT'               AND p_message_key = 'errors.job.timeout')
    OR (p_error_code = 'JOB_CANCELLED'             AND p_message_key = 'errors.job.cancelled')
    OR (p_error_code = 'JOB_FAILED_TRANSIENT'      AND p_message_key = 'errors.job.failed_retry')
    OR (p_error_code = 'JOB_FAILED_PERMANENT'      AND p_message_key = 'errors.job.failed')
    OR (p_error_code = 'JOB_INTERNAL_ERROR'        AND p_message_key = 'errors.job.internal')
  ) THEN
    RAISE EXCEPTION
      'INVALID_ERROR_CODE_MESSAGE_PAIR: (%, %) is not a recognised pair',
      p_error_code, p_message_key
      USING ERRCODE = 'P0021';
  END IF;

  -- Support reference: SR- prefix followed by 2–61 uppercase alphanumeric/hyphen chars.
  -- Regex enforces exact format; LIKE alone only validated the prefix.
  IF p_support_reference IS NULL
      OR NOT (p_support_reference ~ '^SR-[A-Z0-9][A-Z0-9-]{1,60}$') THEN
    RAISE EXCEPTION
      'INVALID_SUPPORT_REFERENCE: must match SR-[A-Z0-9][A-Z0-9-]{1,60} (e.g. SR-JOB-12345)'
      USING ERRCODE = 'P0022';
  END IF;

  -- Attempt 1: D1 cancel wins. state_version = claim_version + 1.
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
-- 28. fn_acknowledge_cancel — GRANT TO service_role ONLY
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
-- 29. C10: fn_recover_stale_jobs — GRANT TO service_role ONLY
--
--     Three separate batches with FOR UPDATE SKIP LOCKED and LIMIT 100.
--     Batch 1: stale cancel_requested → cancelled (cancel wins, never requeued).
--     Batch 2: stale processing + below max_attempts → queued for retry.
--     Batch 3: stale processing + at/above max_attempts → permanently failed.
--     SKIP LOCKED: safe for concurrent recovery runners (no row is double-processed).
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

  -- Batch 1: stale cancel_requested → cancelled (cancel wins, never requeued)
  WITH stale AS (
    SELECT id FROM public.generation_jobs
    WHERE status = 'cancel_requested'
      AND lease_expires_at < NOW()
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.generation_jobs g
  SET status           = 'cancelled',
      worker_id        = NULL,
      lease_token      = NULL,
      lease_expires_at = NULL,
      completed_at     = COALESCE(g.completed_at, NOW()),
      updated_at       = NOW(),
      state_version    = g.state_version + 1
  FROM stale WHERE g.id = stale.id;
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Batch 2: stale processing + below max_attempts → requeued
  WITH stale AS (
    SELECT id FROM public.generation_jobs
    WHERE status = 'processing'
      AND lease_expires_at < NOW()
      AND attempt_count < max_attempts
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.generation_jobs g
  SET status           = 'queued',
      worker_id        = NULL,
      lease_token      = NULL,
      lease_expires_at = NULL,
      heartbeat_at     = NULL,
      updated_at       = NOW(),
      state_version    = g.state_version + 1
  FROM stale WHERE g.id = stale.id;
  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  -- Batch 3: stale processing + at/above max_attempts → permanently failed
  WITH stale AS (
    SELECT id FROM public.generation_jobs
    WHERE status = 'processing'
      AND lease_expires_at < NOW()
      AND attempt_count >= max_attempts
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.generation_jobs g
  SET status             = 'failed',
      public_error_code  = 'JOB_FAILED_PERMANENT',
      public_message_key = 'errors.job.failed',
      support_reference  = 'SR-STALE-' || v_day_bucket,
      lease_token        = NULL,
      lease_expires_at   = NULL,
      worker_id          = NULL,
      completed_at       = NOW(),
      updated_at         = NOW(),
      state_version      = g.state_version + 1
  FROM stale WHERE g.id = stale.id;
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
-- 30. fn_request_job_cancel — GRANT TO authenticated
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
    completed_at  = CASE status
                      WHEN 'queued' THEN NOW()
                      ELSE completed_at
                    END,
    updated_at    = NOW()
  WHERE id      = p_job_id
    AND user_id = v_user_id
    AND status NOT IN ('completed','failed','cancelled')
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
-- 30b. fn_sha256_hex — SECURITY DEFINER helper for pgcrypto SHA-256
--
--      R8-C02 corrections:
--        1. search_path must NOT be quoted (quoted single string = one path entry).
--           Fixed to: SET search_path = extensions, pg_catalog  (two separate schemas,
--           no 'public' — public in a SECURITY DEFINER path allows object shadowing).
--        2. digest() is schema-qualified to extensions.digest() — the D11 preflight
--           confirmed pgcrypto is installed in the extensions schema.
--        3. encode() is schema-qualified to pg_catalog.encode() — built-in function,
--           no pgcrypto dependency.
--        4. Explicit revokes for anon, authenticated, service_role in addition to PUBLIC
--           (D11 SA11 confirmed these roles receive EXECUTE by default on postgres-created
--           functions in public; REVOKE FROM PUBLIC alone is insufficient).
--        5. NOT granted to any runtime role — called only by other SECURITY DEFINER functions.
-- ─────────────────────────────────────────────────────────────────────────────
-- R9-C01: fn_sha256_hex — frozen UTF-8 byte contract
--   STRICT: returns NULL when p_input IS NULL (explicit, not inherited from digest).
--   convert_to(p_input, 'UTF8'): hashes explicit UTF-8 bytes, not database-encoding-dependent
--   internal representation. The preflight asserts server_encoding='UTF8' before this function
--   is created, so convert_to never re-encodes — it is an explicit declaration of the byte
--   contract for environments that may differ from the hashing server.
CREATE FUNCTION public.fn_sha256_hex(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = extensions, pg_catalog
AS $$
  SELECT pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_input, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

-- Named-role revokes required: D11 SA11 proves postgres/public default grants EXECUTE
-- to anon, authenticated, and service_role on every new postgres-created function.
-- REVOKE FROM PUBLIC alone does not remove those explicit named-role grants.
REVOKE ALL ON FUNCTION public.fn_sha256_hex(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_sha256_hex(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_sha256_hex(TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_sha256_hex(TEXT) FROM service_role;

-- R9-C01: Known-answer vectors (KAVs) — PostgreSQL-executed postcondition.
-- Verifies fn_sha256_hex produces correct deterministic UTF-8 SHA-256 output
-- before any job snapshot hash is stored. These are standard FIPS 180-4 vectors.
-- This DO block runs during migration execution only; it is not a test-suite assertion.
DO $$
DECLARE v_result TEXT;
BEGIN
  -- SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  v_result := public.fn_sha256_hex('');
  IF v_result <> 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' THEN
    RAISE EXCEPTION 'KAV FAILED: fn_sha256_hex('''') expected e3b0c44..., got %', v_result;
  END IF;

  -- SHA-256('hello') = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  v_result := public.fn_sha256_hex('hello');
  IF v_result <> '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' THEN
    RAISE EXCEPTION 'KAV FAILED: fn_sha256_hex(''hello'') expected 2cf24db..., got %', v_result;
  END IF;

  -- NULL input → STRICT returns NULL (not an error).
  v_result := public.fn_sha256_hex(NULL);
  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'KAV FAILED: fn_sha256_hex(NULL) must return NULL (STRICT), got %', v_result;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 30c. R12-C02: Explicit canonical envelope serialisers and KAVs
--
-- R11-C01 introduced two IMMUTABLE LANGUAGE sql envelope functions with frozen
-- field order.  R12-C02 adds a recursive JSONB serialiser (fn_canonical_jsonb_v1)
-- and updates both envelope functions to use it for all JSONB-typed fields.
--
-- Serialisation format — top-level TEXT/INTEGER params (v:<n>:<value> envelope):
--   fieldname=NULL          SQL NULL — distinct from empty string
--   fieldname=v:<n>:<value> non-null; n = octet_length(value) in UTF-8
--
-- Serialisation format — JSONB-typed fields (fn_canonical_jsonb_v1):
--   SQL null JSONB param → fieldname=NULL\n
--   Key absent in JSONB object → fieldname=missing\n
--   Key present (any value) → fieldname=<fn_canonical_jsonb_v1 output>\n
--
-- fn_canonical_jsonb_v1 type tokens:
--   N;            SQL null (should not appear at call-site; internal guard)
--   n;            JSON null
--   B1; / B0;     boolean true / false
--   I<n>;         integer (NUMERIC scale() = 0 after trim_scale; e.g. 1, 1.0, 1.00 → I1;)
--   D<n>;         decimal (NUMERIC scale() > 0 after trim_scale; e.g. 1.5, 1.50 → D1.5;)
--   S<bytes>:<utf8-bytes>     string; bytes = octet_length in UTF-8
--   A<count>:<elements>       array; elements concatenated, order preserved
--   O<count>:<key-val pairs>  object; keys sorted COLLATE "C" (bytewise UTF-8), each
--                             key as S<bytes>:<utf8-bytes> followed by value token
--
-- Byte-contract invariants:
--   Field order    : frozen by function body — independent of JSONB storage order.
--   Object keys    : sorted COLLATE "C" (bytewise) — uppercase before lowercase.
--   Array order    : preserved — [1,2] ≠ [2,1].
--   LF vs CRLF     : byte-preserved; hash commits to exact bytes stored (no normalisation).
--   NFC vs NFD     : byte-preserved; hash commits to exact bytes stored (no normalisation).
--   NULL vs ''     : NULL → 'fieldname=NULL\n'; '' → 'fieldname=S0:\n' — distinct.
--   NULL vs missing: SQL-null analysis JSONB → fieldname=NULL\n;
--                    absent key → fieldname=missing\n;
--                    JSON-null value → fieldname=n;\n — three distinct tokens.
--   Encoding       : octet_length() in UTF-8; preflight asserts server_encoding=UTF8.
--   search_path    : SET search_path = '' prevents ambient object resolution.
--   Scientific notation: accepted transparently via NUMERIC (JSONB normalizes 1e2→100
--                        on ingestion; NUMERIC handles any residual notation).
--
-- Known-answer hashes computed 2026-08-03 using Node.js:
--   KAV-SRC-1 (minimal, null analysis):   c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be
--   KAV-SRC-2 (with timestamps and text): 8df917c2723e07371442b0e7104ebb17f6281cc40809ac9725676a1e07d01682
--   KAV-REQ-1 (request over KAV-SRC-1):   7872494e6a422b9e4695227dc2d6728d9f52a76de35dc029c9d7b96b068778ec
-- ─────────────────────────────────────────────────────────────────────────────

-- ── fn_canonical_jsonb_v1: recursive self-delimiting JSONB serialiser ─────────
-- R13-C01 numeric contract: numbers are extracted via (#>> '{}')::NUMERIC (not
-- p_value::TEXT / jsonb::text) to be independent of JSONB rendering, lc_numeric,
-- extra_float_digits, and session settings.  trim_scale() removes trailing zeros
-- so that numerically equivalent values such as 1, 1.0, 1.00 all canonicalize to
-- I1; and 1.5, 1.50 both canonicalize to D1.5;.  scale()=0 after normalization
-- → integer tag 'I'; scale()>0 → decimal tag 'D'.  Negative zero is coerced to 0
-- before classification.  NUMERIC cannot represent NaN or infinity from any valid
-- JSON input; those cases need no special-casing.  JSONB normalizes scientific
-- notation on ingestion (e.g. 1e2 → 100), so the old explicit [eE] guard is
-- unnecessary; the NUMERIC path handles any residual notation transparently.
--
-- R13-C01 collation contract: object keys are sorted with COLLATE "C" (bytewise
-- UTF-8).  This is independent of database collation, lc_collate, locale, and
-- case rules.  COLLATE "C" means uppercase letters (A-Z, 0x41-0x5A) sort before
-- lowercase (a-z, 0x61-0x7A), and accented characters (0x80+) sort after ASCII.
-- CRLF/LF and NFC/NFD are deliberately byte-preserving: distinct byte sequences
-- remain distinct.  Callers may normalize before calling but the database does not.
CREATE FUNCTION public.fn_canonical_jsonb_v1(p_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type   TEXT;
  v_text   TEXT;
  v_result TEXT;
  v_elem   JSONB;
  v_key    TEXT;
  v_val    JSONB;
  v_num    NUMERIC;
BEGIN
  IF p_value IS NULL THEN RETURN 'N;'; END IF;
  v_type := jsonb_typeof(p_value);
  CASE v_type
    WHEN 'null' THEN
      RETURN 'n;';
    WHEN 'boolean' THEN
      IF p_value = 'true'::jsonb THEN RETURN 'B1;'; ELSE RETURN 'B0;'; END IF;
    WHEN 'number' THEN
      -- R13-C01: NUMERIC path — independent of JSONB rendering and session settings.
      -- trim_scale normalises trailing zeros; canonical negative zero → 0.
      v_num := trim_scale((p_value #>> '{}')::NUMERIC);
      IF v_num = 0 THEN v_num := 0; END IF;
      IF scale(v_num) = 0 THEN RETURN 'I' || v_num::TEXT || ';';
                           ELSE RETURN 'D' || v_num::TEXT || ';'; END IF;
    WHEN 'string' THEN
      v_text := p_value #>> '{}';
      RETURN 'S' || octet_length(v_text)::TEXT || ':' || v_text;
    WHEN 'array' THEN
      v_result := 'A' || jsonb_array_length(p_value)::TEXT || ':';
      FOR v_elem IN SELECT value FROM jsonb_array_elements(p_value) LOOP
        v_result := v_result || public.fn_canonical_jsonb_v1(v_elem);
      END LOOP;
      RETURN v_result;
    WHEN 'object' THEN
      v_result := 'O' || (SELECT count(*) FROM jsonb_each(p_value))::TEXT || ':';
      FOR v_key, v_val IN
          SELECT key, value FROM jsonb_each(p_value) ORDER BY key COLLATE "C" LOOP
        v_result := v_result
                    || 'S' || octet_length(v_key)::TEXT || ':' || v_key
                    || public.fn_canonical_jsonb_v1(v_val);
      END LOOP;
      RETURN v_result;
    ELSE
      RAISE EXCEPTION 'CANONICAL_JSONB_V1: unknown JSONB type: %', v_type;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_canonical_jsonb_v1(JSONB) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.fn_canonical_source_v1(
  p_schema_version               INTEGER,
  p_document_id                  TEXT,
  p_document_title               TEXT,
  p_document_extracted_text      TEXT,
  p_document_file_type           TEXT,
  p_document_source_type         TEXT,
  p_document_created_at          TEXT,
  p_document_subject_id          TEXT,
  p_document_source_recording_id TEXT,
  p_analysis_id                  TEXT,
  p_analysis_data                JSONB,
  p_analysis_created_at          TEXT,
  p_analysis_model               TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    'molis/source/v1' || E'\n' ||
    CASE WHEN p_schema_version IS NULL
         THEN 'schema_version=NULL' || E'\n'
         ELSE 'schema_version=v:' || octet_length(p_schema_version::TEXT)::TEXT
              || ':' || p_schema_version::TEXT || E'\n' END ||
    CASE WHEN p_document_id IS NULL
         THEN 'document_id=NULL' || E'\n'
         ELSE 'document_id=v:' || octet_length(p_document_id)::TEXT
              || ':' || p_document_id || E'\n' END ||
    CASE WHEN p_document_title IS NULL
         THEN 'document_title=NULL' || E'\n'
         ELSE 'document_title=v:' || octet_length(p_document_title)::TEXT
              || ':' || p_document_title || E'\n' END ||
    CASE WHEN p_document_extracted_text IS NULL
         THEN 'document_extracted_text=NULL' || E'\n'
         ELSE 'document_extracted_text=v:' || octet_length(p_document_extracted_text)::TEXT
              || ':' || p_document_extracted_text || E'\n' END ||
    CASE WHEN p_document_file_type IS NULL
         THEN 'document_file_type=NULL' || E'\n'
         ELSE 'document_file_type=v:' || octet_length(p_document_file_type)::TEXT
              || ':' || p_document_file_type || E'\n' END ||
    CASE WHEN p_document_source_type IS NULL
         THEN 'document_source_type=NULL' || E'\n'
         ELSE 'document_source_type=v:' || octet_length(p_document_source_type)::TEXT
              || ':' || p_document_source_type || E'\n' END ||
    CASE WHEN p_document_created_at IS NULL
         THEN 'document_created_at=NULL' || E'\n'
         ELSE 'document_created_at=v:' || octet_length(p_document_created_at)::TEXT
              || ':' || p_document_created_at || E'\n' END ||
    CASE WHEN p_document_subject_id IS NULL
         THEN 'document_subject_id=NULL' || E'\n'
         ELSE 'document_subject_id=v:' || octet_length(p_document_subject_id)::TEXT
              || ':' || p_document_subject_id || E'\n' END ||
    CASE WHEN p_document_source_recording_id IS NULL
         THEN 'document_source_recording_id=NULL' || E'\n'
         ELSE 'document_source_recording_id=v:' || octet_length(p_document_source_recording_id)::TEXT
              || ':' || p_document_source_recording_id || E'\n' END ||
    CASE WHEN p_analysis_id IS NULL
         THEN 'analysis_id=NULL' || E'\n'
         ELSE 'analysis_id=v:' || octet_length(p_analysis_id)::TEXT
              || ':' || p_analysis_id || E'\n' END ||
    -- 17 analysis sub-fields: three-way distinction.
    -- p_analysis_data IS NULL (SQL-null param)       → fieldname=NULL
    -- key absent from the JSONB object               → fieldname=missing
    -- key present (including JSON null or any value) → fieldname=<fn_canonical_jsonb_v1 output>
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.subject_area=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'subject_area') THEN 'analysis.subject_area=missing' || E'\n'
         ELSE 'analysis.subject_area=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'subject_area') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.difficulty_level=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'difficulty_level') THEN 'analysis.difficulty_level=missing' || E'\n'
         ELSE 'analysis.difficulty_level=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'difficulty_level') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.estimated_study_minutes=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'estimated_study_minutes') THEN 'analysis.estimated_study_minutes=missing' || E'\n'
         ELSE 'analysis.estimated_study_minutes=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'estimated_study_minutes') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.sections=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'sections') THEN 'analysis.sections=missing' || E'\n'
         ELSE 'analysis.sections=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'sections') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.key_concepts=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'key_concepts') THEN 'analysis.key_concepts=missing' || E'\n'
         ELSE 'analysis.key_concepts=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'key_concepts') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.definitions=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'definitions') THEN 'analysis.definitions=missing' || E'\n'
         ELSE 'analysis.definitions=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'definitions') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.formulas=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'formulas') THEN 'analysis.formulas=missing' || E'\n'
         ELSE 'analysis.formulas=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'formulas') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.examples=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'examples') THEN 'analysis.examples=missing' || E'\n'
         ELSE 'analysis.examples=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'examples') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.keywords=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'keywords') THEN 'analysis.keywords=missing' || E'\n'
         ELSE 'analysis.keywords=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'keywords') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.likely_exam_topics=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'likely_exam_topics') THEN 'analysis.likely_exam_topics=missing' || E'\n'
         ELSE 'analysis.likely_exam_topics=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'likely_exam_topics') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.learning_objectives=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'learning_objectives') THEN 'analysis.learning_objectives=missing' || E'\n'
         ELSE 'analysis.learning_objectives=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'learning_objectives') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.misconceptions=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'misconceptions') THEN 'analysis.misconceptions=missing' || E'\n'
         ELSE 'analysis.misconceptions=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'misconceptions') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.relationships=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'relationships') THEN 'analysis.relationships=missing' || E'\n'
         ELSE 'analysis.relationships=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'relationships') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.prerequisites=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'prerequisites') THEN 'analysis.prerequisites=missing' || E'\n'
         ELSE 'analysis.prerequisites=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'prerequisites') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.tables=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'tables') THEN 'analysis.tables=missing' || E'\n'
         ELSE 'analysis.tables=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'tables') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.concept_graph=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'concept_graph') THEN 'analysis.concept_graph=missing' || E'\n'
         ELSE 'analysis.concept_graph=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'concept_graph') || E'\n' END ||
    CASE WHEN p_analysis_data IS NULL THEN 'analysis.learning_path=NULL' || E'\n'
         WHEN NOT (p_analysis_data ? 'learning_path') THEN 'analysis.learning_path=missing' || E'\n'
         ELSE 'analysis.learning_path=' || public.fn_canonical_jsonb_v1(p_analysis_data -> 'learning_path') || E'\n' END ||
    CASE WHEN p_analysis_created_at IS NULL
         THEN 'analysis_created_at=NULL' || E'\n'
         ELSE 'analysis_created_at=v:' || octet_length(p_analysis_created_at)::TEXT
              || ':' || p_analysis_created_at || E'\n' END ||
    CASE WHEN p_analysis_model IS NULL
         THEN 'analysis_model=NULL' || E'\n'
         ELSE 'analysis_model=v:' || octet_length(p_analysis_model)::TEXT
              || ':' || p_analysis_model || E'\n' END
$$;

REVOKE ALL ON FUNCTION public.fn_canonical_source_v1(
  INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.fn_canonical_request_v1(
  p_schema_version  INTEGER,
  p_source_digest   TEXT,
  p_job_type        TEXT,
  p_sanitized_input JSONB,
  p_op_descriptor   JSONB
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    'molis/request/v1' || E'\n' ||
    CASE WHEN p_schema_version IS NULL
         THEN 'schema_version=NULL' || E'\n'
         ELSE 'schema_version=v:' || octet_length(p_schema_version::TEXT)::TEXT
              || ':' || p_schema_version::TEXT || E'\n' END ||
    CASE WHEN p_source_digest IS NULL
         THEN 'source_digest=NULL' || E'\n'
         ELSE 'source_digest=v:' || octet_length(p_source_digest)::TEXT
              || ':' || p_source_digest || E'\n' END ||
    CASE WHEN p_job_type IS NULL
         THEN 'job_type=NULL' || E'\n'
         ELSE 'job_type=v:' || octet_length(p_job_type)::TEXT
              || ':' || p_job_type || E'\n' END ||
    -- sanitized_input: SQL-null JSONB param → NULL; any JSONB value → fn_canonical_jsonb_v1
    CASE WHEN p_sanitized_input IS NULL
         THEN 'sanitized_input=NULL' || E'\n'
         ELSE 'sanitized_input=' || public.fn_canonical_jsonb_v1(p_sanitized_input) || E'\n' END ||
    -- operation descriptor sub-fields: three-way distinction (same as analysis fields above)
    CASE WHEN p_op_descriptor IS NULL THEN 'op.schema_version=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'schema_version') THEN 'op.schema_version=missing' || E'\n'
         ELSE 'op.schema_version=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'schema_version') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.job_type=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'job_type') THEN 'op.job_type=missing' || E'\n'
         ELSE 'op.job_type=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'job_type') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.text_model=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'text_model') THEN 'op.text_model=missing' || E'\n'
         ELSE 'op.text_model=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'text_model') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.image_model=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'image_model') THEN 'op.image_model=missing' || E'\n'
         ELSE 'op.image_model=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'image_model') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.temperature=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'temperature') THEN 'op.temperature=missing' || E'\n'
         ELSE 'op.temperature=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'temperature') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.max_tokens=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'max_tokens') THEN 'op.max_tokens=missing' || E'\n'
         ELSE 'op.max_tokens=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'max_tokens') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.image_size=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'image_size') THEN 'op.image_size=missing' || E'\n'
         ELSE 'op.image_size=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'image_size') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.image_count=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'image_count') THEN 'op.image_count=missing' || E'\n'
         ELSE 'op.image_count=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'image_count') || E'\n' END ||
    CASE WHEN p_op_descriptor IS NULL THEN 'op.prompt_schema_version=NULL' || E'\n'
         WHEN NOT (p_op_descriptor ? 'prompt_schema_version') THEN 'op.prompt_schema_version=missing' || E'\n'
         ELSE 'op.prompt_schema_version=' || public.fn_canonical_jsonb_v1(p_op_descriptor -> 'prompt_schema_version') || E'\n' END
$$;

REVOKE ALL ON FUNCTION public.fn_canonical_request_v1(INTEGER, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;

-- ── Known-answer vectors ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_result        TEXT;
  v_hash          TEXT;
  v_expected      TEXT;
  v_expected_hash TEXT;
  v_result2       TEXT;
BEGIN

  -- ── KAV-SRC-1: minimal source — null analysis, no timestamps ─────────────
  v_expected := $kav1$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000001
document_title=v:17:MoLis KAV minimal
document_extracted_text=NULL
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=NULL
analysis.difficulty_level=NULL
analysis.estimated_study_minutes=NULL
analysis.sections=NULL
analysis.key_concepts=NULL
analysis.definitions=NULL
analysis.formulas=NULL
analysis.examples=NULL
analysis.keywords=NULL
analysis.likely_exam_topics=NULL
analysis.learning_objectives=NULL
analysis.misconceptions=NULL
analysis.relationships=NULL
analysis.prerequisites=NULL
analysis.tables=NULL
analysis.concept_graph=NULL
analysis.learning_path=NULL
analysis_created_at=NULL
analysis_model=NULL
$kav1$;
  v_expected_hash := 'c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be';

  v_result := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000001', 'MoLis KAV minimal',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-SRC-1 TEXT MISMATCH: got: %', v_result;
  END IF;
  v_hash := public.fn_sha256_hex(v_result);
  IF v_hash <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-SRC-1 HASH FAILED: expected %, got %', v_expected_hash, v_hash;
  END IF;

  -- ── KAV-SRC-2: source with timestamps, extracted text, file type ──────────
  v_expected := $kav2$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000002
document_title=v:19:MoLis KAV timestamp
document_extracted_text=v:11:Hello world
document_file_type=v:3:pdf
document_source_type=v:6:upload
document_created_at=v:27:2026-01-01T00:00:00.000000Z
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=NULL
analysis.difficulty_level=NULL
analysis.estimated_study_minutes=NULL
analysis.sections=NULL
analysis.key_concepts=NULL
analysis.definitions=NULL
analysis.formulas=NULL
analysis.examples=NULL
analysis.keywords=NULL
analysis.likely_exam_topics=NULL
analysis.learning_objectives=NULL
analysis.misconceptions=NULL
analysis.relationships=NULL
analysis.prerequisites=NULL
analysis.tables=NULL
analysis.concept_graph=NULL
analysis.learning_path=NULL
analysis_created_at=NULL
analysis_model=NULL
$kav2$;
  v_expected_hash := '8df917c2723e07371442b0e7104ebb17f6281cc40809ac9725676a1e07d01682';

  v_result := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000002', 'MoLis KAV timestamp',
    'Hello world', 'pdf', 'upload', '2026-01-01T00:00:00.000000Z',
    NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-SRC-2 TEXT MISMATCH: got: %', v_result;
  END IF;
  v_hash := public.fn_sha256_hex(v_result);
  IF v_hash <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-SRC-2 HASH FAILED: expected %, got %', v_expected_hash, v_hash;
  END IF;

  -- ── KAV-NULL-VS-EMPTY: SQL NULL and empty string must produce different hashes
  -- R15-H03: freeze complete expected canonical output for both cases.
  -- Expected texts and SHA-256 independently computed 2026-08-04 with Python.
  v_expected := $kavnull$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000003
document_title=v:17:KAV null vs empty
document_extracted_text=NULL
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=NULL
analysis.difficulty_level=NULL
analysis.estimated_study_minutes=NULL
analysis.sections=NULL
analysis.key_concepts=NULL
analysis.definitions=NULL
analysis.formulas=NULL
analysis.examples=NULL
analysis.keywords=NULL
analysis.likely_exam_topics=NULL
analysis.learning_objectives=NULL
analysis.misconceptions=NULL
analysis.relationships=NULL
analysis.prerequisites=NULL
analysis.tables=NULL
analysis.concept_graph=NULL
analysis.learning_path=NULL
analysis_created_at=NULL
analysis_model=NULL
$kavnull$;
  v_expected_hash := 'c591c01b35b3f6ca7acebaef4e034cd1a187af8756cc73de7937bb02e327f40c';
  v_result  := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000003', 'KAV null vs empty',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-NULL-VS-EMPTY NULL TEXT MISMATCH: got: %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-NULL-VS-EMPTY NULL hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result);
  END IF;

  v_expected := $kavempty$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000003
document_title=v:17:KAV null vs empty
document_extracted_text=v:0:
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=NULL
analysis.difficulty_level=NULL
analysis.estimated_study_minutes=NULL
analysis.sections=NULL
analysis.key_concepts=NULL
analysis.definitions=NULL
analysis.formulas=NULL
analysis.examples=NULL
analysis.keywords=NULL
analysis.likely_exam_topics=NULL
analysis.learning_objectives=NULL
analysis.misconceptions=NULL
analysis.relationships=NULL
analysis.prerequisites=NULL
analysis.tables=NULL
analysis.concept_graph=NULL
analysis.learning_path=NULL
analysis_created_at=NULL
analysis_model=NULL
$kavempty$;
  v_expected_hash := '25eaffaf1777f69927c6275b06ca5d8fd320401fb03f8b02bb055aacd9a9f360';
  v_result2 := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000003', 'KAV null vs empty',
    '', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_result2 <> v_expected THEN
    RAISE EXCEPTION 'KAV-NULL-VS-EMPTY EMPTY TEXT MISMATCH: got: %', v_result2;
  END IF;
  IF public.fn_sha256_hex(v_result2) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-NULL-VS-EMPTY EMPTY hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result2);
  END IF;
  IF v_result = v_result2 THEN
    RAISE EXCEPTION 'KAV-NULL-VS-EMPTY: NULL and empty string produced identical canonical text';
  END IF;

  -- ── KAV-CRLF-VS-LF: CRLF and LF must produce different hashes (no normalisation)
  -- R15-H03: freeze complete expected canonical output for both cases.
  -- LF expected text: dollar-quoted (embedded LF in value is a literal newline in the string).
  -- CRLF expected text: constructed via concatenation (CRLF cannot be safely dollar-quoted).
  -- Both SHA-256 independently computed 2026-08-04 with Python.
  v_expected := $kavlf$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000004
document_title=v:14:KAV CRLF vs LF
document_extracted_text=v:11:line1
line2
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=NULL
analysis.difficulty_level=NULL
analysis.estimated_study_minutes=NULL
analysis.sections=NULL
analysis.key_concepts=NULL
analysis.definitions=NULL
analysis.formulas=NULL
analysis.examples=NULL
analysis.keywords=NULL
analysis.likely_exam_topics=NULL
analysis.learning_objectives=NULL
analysis.misconceptions=NULL
analysis.relationships=NULL
analysis.prerequisites=NULL
analysis.tables=NULL
analysis.concept_graph=NULL
analysis.learning_path=NULL
analysis_created_at=NULL
analysis_model=NULL
$kavlf$;
  v_expected_hash := 'd6c3864ffb688dedc26750221befb7e208fe3652d951cfc9bf509213b83018ca';
  v_result  := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000004', 'KAV CRLF vs LF',
    'line1' || E'\n' || 'line2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-CRLF-VS-LF LF TEXT MISMATCH: got: %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-CRLF-VS-LF LF hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result);
  END IF;

  -- CRLF expected canonical text constructed via concatenation to embed literal CRLF (0x0D 0x0A).
  -- document_extracted_text=v:12:line1<CR><LF>line2<LF> — 12 bytes for the value (5+2+5).
  v_expected :=
    'molis/source/v1'                                                           || E'\n' ||
    'schema_version=v:1:1'                                                      || E'\n' ||
    'document_id=v:36:00000000-0000-0000-0000-000000000004'                     || E'\n' ||
    'document_title=v:14:KAV CRLF vs LF'                                        || E'\n' ||
    'document_extracted_text=v:12:line1' || E'\r\n' || 'line2'                  || E'\n' ||
    'document_file_type=NULL'                                                    || E'\n' ||
    'document_source_type=NULL'                                                  || E'\n' ||
    'document_created_at=NULL'                                                   || E'\n' ||
    'document_subject_id=NULL'                                                   || E'\n' ||
    'document_source_recording_id=NULL'                                          || E'\n' ||
    'analysis_id=NULL'                                                           || E'\n' ||
    'analysis.subject_area=NULL'                                                 || E'\n' ||
    'analysis.difficulty_level=NULL'                                             || E'\n' ||
    'analysis.estimated_study_minutes=NULL'                                      || E'\n' ||
    'analysis.sections=NULL'                                                     || E'\n' ||
    'analysis.key_concepts=NULL'                                                 || E'\n' ||
    'analysis.definitions=NULL'                                                  || E'\n' ||
    'analysis.formulas=NULL'                                                     || E'\n' ||
    'analysis.examples=NULL'                                                     || E'\n' ||
    'analysis.keywords=NULL'                                                     || E'\n' ||
    'analysis.likely_exam_topics=NULL'                                           || E'\n' ||
    'analysis.learning_objectives=NULL'                                          || E'\n' ||
    'analysis.misconceptions=NULL'                                               || E'\n' ||
    'analysis.relationships=NULL'                                                || E'\n' ||
    'analysis.prerequisites=NULL'                                                || E'\n' ||
    'analysis.tables=NULL'                                                       || E'\n' ||
    'analysis.concept_graph=NULL'                                                || E'\n' ||
    'analysis.learning_path=NULL'                                                || E'\n' ||
    'analysis_created_at=NULL'                                                   || E'\n' ||
    'analysis_model=NULL'                                                        || E'\n';
  v_expected_hash := '12ccc8315990a85ce89d3c2382e0c89a40d69a50801b480c60004feb81545c49';
  v_result2 := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000004', 'KAV CRLF vs LF',
    'line1' || E'\r\n' || 'line2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_result2 <> v_expected THEN
    RAISE EXCEPTION 'KAV-CRLF-VS-LF CRLF TEXT MISMATCH: got: %', v_result2;
  END IF;
  IF public.fn_sha256_hex(v_result2) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-CRLF-VS-LF CRLF hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result2);
  END IF;
  IF v_result = v_result2 THEN
    RAISE EXCEPTION 'KAV-CRLF-VS-LF: LF and CRLF produced identical canonical text';
  END IF;

  -- ── KAV-REQ-1: request envelope over KAV-SRC-1 hash (R12-C02: new JSONB format)
  v_expected := $kavr1$molis/request/v1
schema_version=v:1:1
source_digest=v:64:c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be
job_type=v:7:visuals
sanitized_input=O0:
op.schema_version=I1;
op.job_type=S7:visuals
op.text_model=S11:gpt-4o-mini
op.image_model=S11:gpt-image-2
op.temperature=D0.3;
op.max_tokens=I1200;
op.image_size=S9:1024x1024
op.image_count=I1;
op.prompt_schema_version=I1;
$kavr1$;
  v_expected_hash := '7872494e6a422b9e4695227dc2d6728d9f52a76de35dc029c9d7b96b068778ec';

  v_result := public.fn_canonical_request_v1(
    1,
    'c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be',
    'visuals',
    '{}'::JSONB,
    jsonb_build_object(
      'schema_version',        1,
      'job_type',              'visuals',
      'text_model',            'gpt-4o-mini',
      'image_model',           'gpt-image-2',
      'temperature',           0.3,
      'max_tokens',            1200,
      'image_size',            '1024x1024',
      'image_count',           1,
      'prompt_schema_version', 1
    )
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-REQ-1 TEXT MISMATCH: got: %', v_result;
  END IF;
  v_hash := public.fn_sha256_hex(v_result);
  IF v_hash <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-REQ-1 HASH FAILED: expected %, got %', v_expected_hash, v_hash;
  END IF;

  -- ── KAV-JSONB-MISSING: three-way NULL/missing/value distinction ───────────
  -- All four calls share the same text params and document UUID 10.
  -- Only p_analysis_data differs.  The hashes must be distinct.
  -- R15-H03: every case freezes complete expected canonical output; LIKE fragments removed.

  -- A: SQL-null analysis JSONB → all analysis fields emit =NULL
  v_expected := $kavmissa$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000010
document_title=v:13:KAV missing A
document_extracted_text=NULL
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=NULL
analysis.difficulty_level=NULL
analysis.estimated_study_minutes=NULL
analysis.sections=NULL
analysis.key_concepts=NULL
analysis.definitions=NULL
analysis.formulas=NULL
analysis.examples=NULL
analysis.keywords=NULL
analysis.likely_exam_topics=NULL
analysis.learning_objectives=NULL
analysis.misconceptions=NULL
analysis.relationships=NULL
analysis.prerequisites=NULL
analysis.tables=NULL
analysis.concept_graph=NULL
analysis.learning_path=NULL
analysis_created_at=NULL
analysis_model=NULL
$kavmissa$;
  v_expected_hash := 'ddbe52bda3f29198644d7074db70f92391d9ce97b59ac3752f1417784e3ed870';
  v_result := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000010', 'KAV missing A',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL::JSONB, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-A text mismatch: got %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-A hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result);
  END IF;

  -- B: empty JSONB object → all analysis fields emit =missing
  v_expected := $kavmissb$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000010
document_title=v:13:KAV missing A
document_extracted_text=NULL
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=missing
analysis.difficulty_level=missing
analysis.estimated_study_minutes=missing
analysis.sections=missing
analysis.key_concepts=missing
analysis.definitions=missing
analysis.formulas=missing
analysis.examples=missing
analysis.keywords=missing
analysis.likely_exam_topics=missing
analysis.learning_objectives=missing
analysis.misconceptions=missing
analysis.relationships=missing
analysis.prerequisites=missing
analysis.tables=missing
analysis.concept_graph=missing
analysis.learning_path=missing
analysis_created_at=NULL
analysis_model=NULL
$kavmissb$;
  v_expected_hash := '675bac68bc300226e6c51463b70ca5564b4797cc9901cdb3e1ff433c3285cd25';
  v_result2 := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000010', 'KAV missing A',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::JSONB, NULL, NULL
  );
  IF v_result2 <> v_expected THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-B text mismatch: got %', v_result2;
  END IF;
  IF public.fn_sha256_hex(v_result2) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-B hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result2);
  END IF;
  IF v_result = v_result2 THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-A and -B must differ';
  END IF;

  -- C: {subject_area: null} → subject_area emits =n; (JSON null); other fields =missing
  v_expected := $kavmissc$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000010
document_title=v:13:KAV missing A
document_extracted_text=NULL
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=n;
analysis.difficulty_level=missing
analysis.estimated_study_minutes=missing
analysis.sections=missing
analysis.key_concepts=missing
analysis.definitions=missing
analysis.formulas=missing
analysis.examples=missing
analysis.keywords=missing
analysis.likely_exam_topics=missing
analysis.learning_objectives=missing
analysis.misconceptions=missing
analysis.relationships=missing
analysis.prerequisites=missing
analysis.tables=missing
analysis.concept_graph=missing
analysis.learning_path=missing
analysis_created_at=NULL
analysis_model=NULL
$kavmissc$;
  v_expected_hash := 'a130fb303032d5c1e8fadb31a588a466abc32c58025efa0429acff04ef923b9b';
  v_result := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000010', 'KAV missing A',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{"subject_area": null}'::JSONB, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-C text mismatch: got %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-C hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result);
  END IF;

  -- D: {subject_area: "biology"} → subject_area emits =S7:biology; other fields =missing
  v_expected := $kavmissd$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000010
document_title=v:13:KAV missing A
document_extracted_text=NULL
document_file_type=NULL
document_source_type=NULL
document_created_at=NULL
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=S7:biology
analysis.difficulty_level=missing
analysis.estimated_study_minutes=missing
analysis.sections=missing
analysis.key_concepts=missing
analysis.definitions=missing
analysis.formulas=missing
analysis.examples=missing
analysis.keywords=missing
analysis.likely_exam_topics=missing
analysis.learning_objectives=missing
analysis.misconceptions=missing
analysis.relationships=missing
analysis.prerequisites=missing
analysis.tables=missing
analysis.concept_graph=missing
analysis.learning_path=missing
analysis_created_at=NULL
analysis_model=NULL
$kavmissd$;
  v_expected_hash := '9e56cd7127a2c4a0f2e26573e291750e9186f018133b99f17701fbba1a03c1a0';
  v_result := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000010', 'KAV missing A',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{"subject_area": "biology"}'::JSONB, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-D text mismatch: got %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-JSONB-MISSING-D hash mismatch: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result);
  END IF;

  -- ── KAV-JSONB-OBJ-KEY-ORDER: key ordering is alphabetical regardless of JSONB storage
  -- {b:1,a:2} and {a:2,b:1} must produce identical canonical text → O2:S1:aI2;S1:bI1;
  v_result  := public.fn_canonical_jsonb_v1('{"b": 1, "a": 2}'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('{"a": 2, "b": 1}'::JSONB);
  IF v_result <> 'O2:S1:aI2;S1:bI1;' THEN
    RAISE EXCEPTION 'KAV-JSONB-OBJ-KEY-ORDER {b:1,a:2} mismatch: got %', v_result;
  END IF;
  IF v_result2 <> 'O2:S1:aI2;S1:bI1;' THEN
    RAISE EXCEPTION 'KAV-JSONB-OBJ-KEY-ORDER {a:2,b:1} mismatch: got %', v_result2;
  END IF;

  -- ── KAV-JSONB-ARRAY: array order is preserved; [1,2] ≠ [2,1]
  v_result  := public.fn_canonical_jsonb_v1('[1, 2]'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('[2, 1]'::JSONB);
  IF v_result <> 'A2:I1;I2;' THEN
    RAISE EXCEPTION 'KAV-JSONB-ARRAY [1,2] mismatch: got %', v_result;
  END IF;
  IF v_result2 <> 'A2:I2;I1;' THEN
    RAISE EXCEPTION 'KAV-JSONB-ARRAY [2,1] mismatch: got %', v_result2;
  END IF;
  IF v_result = v_result2 THEN
    RAISE EXCEPTION 'KAV-JSONB-ARRAY [1,2] and [2,1] must differ';
  END IF;

  -- ── KAV-JSONB-BOOL: boolean tokens B1; and B0;
  v_result  := public.fn_canonical_jsonb_v1('true'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('false'::JSONB);
  IF v_result  <> 'B1;' THEN RAISE EXCEPTION 'KAV-JSONB-BOOL true mismatch: got %', v_result;  END IF;
  IF v_result2 <> 'B0;' THEN RAISE EXCEPTION 'KAV-JSONB-BOOL false mismatch: got %', v_result2; END IF;

  -- ── KAV-JSONB-NESTED: nested objects and arrays
  -- {outer:{inner:[1,null,true]}} → O1:S5:outerO1:S5:innerA3:I1;n;B1;
  v_result := public.fn_canonical_jsonb_v1('{"outer": {"inner": [1, null, true]}}'::JSONB);
  IF v_result <> 'O1:S5:outerO1:S5:innerA3:I1;n;B1;' THEN
    RAISE EXCEPTION 'KAV-JSONB-NESTED mismatch: got %', v_result;
  END IF;

  -- ── KAV-JSONB-UNICODE: UTF-8 multibyte string octet_length
  -- 'café' is 4 chars, 5 bytes (é = U+00E9, 2 bytes)
  v_result := public.fn_canonical_jsonb_v1('"café"'::JSONB);
  IF v_result <> 'S5:café' THEN
    RAISE EXCEPTION 'KAV-JSONB-UNICODE café mismatch: got %', v_result;
  END IF;

  -- ── KAV-JSONB-OP-DESC-MISSING: op descriptor with missing keys emits =missing
  v_result := public.fn_canonical_request_v1(
    1,
    'c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be',
    'visuals',
    '{}'::JSONB,
    jsonb_build_object(
      'schema_version', 1, 'job_type', 'visuals', 'text_model', 'gpt-4o-mini',
      'temperature', 0.3, 'max_tokens', 1200, 'prompt_schema_version', 1
      -- image_model, image_size, image_count intentionally absent
    )
  );
  v_hash := public.fn_sha256_hex(v_result);
  IF v_hash <> '46b873adc1625d26b0e773c916dbc79490c6f5bba9b1383b77f4617a20bc1573' THEN
    RAISE EXCEPTION 'KAV-JSONB-OP-DESC-MISSING hash mismatch: got %', v_hash;
  END IF;
  IF v_result NOT LIKE '%op.image_model=missing%' THEN
    RAISE EXCEPTION 'KAV-JSONB-OP-DESC-MISSING: expected op.image_model=missing, got: %', v_result;
  END IF;
  IF v_result NOT LIKE '%op.image_size=missing%' THEN
    RAISE EXCEPTION 'KAV-JSONB-OP-DESC-MISSING: expected op.image_size=missing, got: %', v_result;
  END IF;

  -- ── R13-H01: Hard-coded SHA-256 for existing text-only vector assertions ──

  IF public.fn_sha256_hex('O2:S1:aI2;S1:bI1;') <> '585aa8fdcdde9c6429fac093943a6be5c0208b4c0cf15c95df299ce625355bd3' THEN
    RAISE EXCEPTION 'KAV-HASH: O2:S1:aI2;S1:bI1; hash mismatch';
  END IF;
  IF public.fn_sha256_hex('A2:I1;I2;') <> '92d2982c41679873dfbf0fc4097d13b79cb3b5bc9a338e7035c52b31ff91b416' THEN
    RAISE EXCEPTION 'KAV-HASH: A2:I1;I2; hash mismatch';
  END IF;
  IF public.fn_sha256_hex('A2:I2;I1;') <> '212049110bef683da1a36cc941f29d55b7feeb53235bc1ddfd21b70a7a7c87dc' THEN
    RAISE EXCEPTION 'KAV-HASH: A2:I2;I1; hash mismatch';
  END IF;
  IF public.fn_sha256_hex('B1;') <> '63410e6051317b72283e78d1d34940721f931fb4753022dbef54c2b26d14bed3' THEN
    RAISE EXCEPTION 'KAV-HASH: B1; hash mismatch';
  END IF;
  IF public.fn_sha256_hex('B0;') <> 'ed04aed4f87691b831633ca5a3e3d2b23c3d36e9901c6d05350846ec3036cbf7' THEN
    RAISE EXCEPTION 'KAV-HASH: B0; hash mismatch';
  END IF;
  IF public.fn_sha256_hex('O1:S5:outerO1:S5:innerA3:I1;n;B1;') <> '8dc41ca56cc1ef0c6e043adccce52416b66e0db573b23c643bc813e6bc02e342' THEN
    RAISE EXCEPTION 'KAV-HASH: nested object hash mismatch';
  END IF;
  IF public.fn_sha256_hex('S5:café') <> '61adb5cd6816d9f821c6c908da2dd17e26d397ab53087b4c9a06380ae990d2c4' THEN
    RAISE EXCEPTION 'KAV-HASH: S5:café hash mismatch';
  END IF;

  -- ── R13-H01: Numeric canonical equivalence (R13-C01 NUMERIC contract) ─────

  -- KAV-NUM-INT-EQUIV: 1, 1.0, 1.00 must all → I1; (trim_scale removes trailing zeros)
  v_result  := public.fn_canonical_jsonb_v1('1'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('1.0'::JSONB);
  IF v_result <> 'I1;' THEN
    RAISE EXCEPTION 'KAV-NUM-INT-EQUIV: 1 expected I1;, got %', v_result;
  END IF;
  IF v_result2 <> 'I1;' THEN
    RAISE EXCEPTION 'KAV-NUM-INT-EQUIV: 1.0 expected I1;, got %', v_result2;
  END IF;
  IF v_result <> v_result2 THEN
    RAISE EXCEPTION 'KAV-NUM-INT-EQUIV: 1 and 1.0 must produce identical canonical text';
  END IF;
  IF public.fn_sha256_hex(v_result) <> '3c5defc4cc6437aaff06786fb6eb9d4d3d9d5d7d817381eafc7dfc6285e862b6' THEN
    RAISE EXCEPTION 'KAV-NUM-INT-EQUIV: I1; hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- KAV-NUM-DEC-EQUIV: 1.5 and 1.50 must both → D1.5; (trim_scale(1.50)=1.5)
  v_result  := public.fn_canonical_jsonb_v1('1.5'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('1.50'::JSONB);
  IF v_result <> 'D1.5;' THEN
    RAISE EXCEPTION 'KAV-NUM-DEC-EQUIV: 1.5 expected D1.5;, got %', v_result;
  END IF;
  IF v_result2 <> 'D1.5;' THEN
    RAISE EXCEPTION 'KAV-NUM-DEC-EQUIV: 1.50 expected D1.5;, got %', v_result2;
  END IF;
  IF v_result <> v_result2 THEN
    RAISE EXCEPTION 'KAV-NUM-DEC-EQUIV: 1.5 and 1.50 must produce identical canonical text';
  END IF;
  IF public.fn_sha256_hex(v_result) <> 'be61f052603a96705042c593e9511ad2d6998692bccd1e555cbe637f10496292' THEN
    RAISE EXCEPTION 'KAV-NUM-DEC-EQUIV: D1.5; hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- KAV-NUM-TRAILING: 1.500 → D1.5; (same as 1.5 and 1.50); R15-H03: freeze hash.
  v_result := public.fn_canonical_jsonb_v1('1.500'::JSONB);
  IF v_result <> 'D1.5;' THEN
    RAISE EXCEPTION 'KAV-NUM-TRAILING: 1.500 expected D1.5;, got %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> 'be61f052603a96705042c593e9511ad2d6998692bccd1e555cbe637f10496292' THEN
    RAISE EXCEPTION 'KAV-NUM-TRAILING: D1.5; hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- KAV-NUM-NEG-ZERO: -0 → I0; (canonical negative zero equals positive zero)
  v_result  := public.fn_canonical_jsonb_v1('0'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('-0'::JSONB);
  IF v_result <> 'I0;' THEN
    RAISE EXCEPTION 'KAV-NUM-NEG-ZERO: 0 expected I0;, got %', v_result;
  END IF;
  IF v_result2 <> 'I0;' THEN
    RAISE EXCEPTION 'KAV-NUM-NEG-ZERO: -0 expected I0;, got %', v_result2;
  END IF;
  IF v_result <> v_result2 THEN
    RAISE EXCEPTION 'KAV-NUM-NEG-ZERO: 0 and -0 must be canonically equal';
  END IF;
  IF public.fn_sha256_hex(v_result) <> '17e45e033c0badd32f6a972b7a6b77afe5afdcfb0c02aecbeb6af1c80cc3e1a8' THEN
    RAISE EXCEPTION 'KAV-NUM-NEG-ZERO: I0; hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- KAV-NUM-EXP: JSONB normalizes 1e2 to 100 → I100; (no exponent in output)
  v_result := public.fn_canonical_jsonb_v1('1e2'::JSONB);
  IF v_result <> 'I100;' THEN
    RAISE EXCEPTION 'KAV-NUM-EXP: 1e2 expected I100;, got %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> 'c50bb87e636beba80bf8ca83d1114aa4860fc92683ec357302951798a193b7e2' THEN
    RAISE EXCEPTION 'KAV-NUM-EXP: I100; hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- KAV-NUM-NEG: -1 → I-1; and -0.5 → D-0.5;
  v_result  := public.fn_canonical_jsonb_v1('-1'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('-0.5'::JSONB);
  IF v_result <> 'I-1;' THEN
    RAISE EXCEPTION 'KAV-NUM-NEG: -1 expected I-1;, got %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> '3effcf990767829820f62e88a39432d625b0b13f2f7428f870890f88d39d7627' THEN
    RAISE EXCEPTION 'KAV-NUM-NEG: I-1; hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;
  IF v_result2 <> 'D-0.5;' THEN
    RAISE EXCEPTION 'KAV-NUM-NEG: -0.5 expected D-0.5;, got %', v_result2;
  END IF;
  IF public.fn_sha256_hex(v_result2) <> 'ef760d0340067117da2dc3356f09612084f29f6a22d6289745f5b2efecdf36cc' THEN
    RAISE EXCEPTION 'KAV-NUM-NEG: D-0.5; hash mismatch: got %', public.fn_sha256_hex(v_result2);
  END IF;

  -- ── R13-H01: Collation-independent key ordering (COLLATE "C") ─────────────

  -- KAV-COLLATE-C-UPPER-LOWER: Z (0x5A) < a (0x61) under COLLATE "C" (bytewise UTF-8).
  -- {Z:1,a:2} and {a:2,Z:1} must both produce O2:S1:ZI1;S1:aI2;
  -- (Under locale-aware ordering Z might sort after a.)
  v_result  := public.fn_canonical_jsonb_v1('{"Z": 1, "a": 2}'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('{"a": 2, "Z": 1}'::JSONB);
  IF v_result <> 'O2:S1:ZI1;S1:aI2;' THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-UPPER-LOWER {Z:1,a:2} expected O2:S1:ZI1;S1:aI2;, got %', v_result;
  END IF;
  IF v_result <> v_result2 THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-UPPER-LOWER: key-insertion order must not affect canonical output';
  END IF;
  IF public.fn_sha256_hex(v_result) <> '364a300a5dc19b5debd3f4b55eabf19ce2bbfccc3fea91aae6b5e80d18b1a686' THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-UPPER-LOWER: hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- KAV-COLLATE-C-MIXED-CASE: B (0x42) < a (0x61) under COLLATE "C".
  -- {a:1,B:2} and {B:2,a:1} must both produce O2:S1:BI2;S1:aI1;
  -- (Under locale-aware ordering lowercase a may sort before uppercase B.)
  v_result  := public.fn_canonical_jsonb_v1('{"a": 1, "B": 2}'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('{"B": 2, "a": 1}'::JSONB);
  IF v_result <> 'O2:S1:BI2;S1:aI1;' THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-MIXED-CASE expected O2:S1:BI2;S1:aI1;, got %', v_result;
  END IF;
  IF v_result <> v_result2 THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-MIXED-CASE: key-insertion order must not affect canonical output';
  END IF;
  IF public.fn_sha256_hex(v_result) <> 'c7bbd5886cee20c4836a926ecc71fbad90c30532cbb31ddc660413a5b3679347' THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-MIXED-CASE: hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- KAV-COLLATE-C-ACCENTED: e (0x65) < é (0xC3 0xA9) under COLLATE "C".
  -- {é:1,e:2} and {e:2,é:1} must both produce O2:S1:eI2;S2:éI1;
  -- (Locale-aware ordering may group e and é together.)
  v_result  := public.fn_canonical_jsonb_v1('{"é": 1, "e": 2}'::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1('{"e": 2, "é": 1}'::JSONB);
  IF v_result <> 'O2:S1:eI2;S2:éI1;' THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-ACCENTED expected O2:S1:eI2;S2:éI1;, got %', v_result;
  END IF;
  IF v_result <> v_result2 THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-ACCENTED: key-insertion order must not affect canonical output';
  END IF;
  IF public.fn_sha256_hex(v_result) <> 'e0f17c56c6c32ba4b42645bfac81d938d9ab4d71772f5230541b9230f1906d82' THEN
    RAISE EXCEPTION 'KAV-COLLATE-C-ACCENTED: hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;

  -- ── R13-H01: NFC/NFD byte-preserving policy ───────────────────────────────

  -- KAV-NFC-NFD: NFC é (U+00E9, 2 UTF-8 bytes 0xC3 0xA9) and NFD e+combining
  -- (U+0065 U+0301, 3 UTF-8 bytes 0x65 0xCC 0x81) are distinct byte sequences.
  -- fn_canonical_jsonb_v1 is byte-preserving and does NOT normalize Unicode.
  -- Distinct byte inputs must produce distinct canonical text and distinct hashes.
  -- NFC hash (independently computed): 52669a268b3de8bd030d5dca3e0171b22b253b2ac8ccc8a7a238985fe419e171
  -- NFD hash (independently computed): dee6503e438c6491ef34ba5357aa08831dda270cd4ab8cb72ad5424d159eb7f6
  v_result  := public.fn_canonical_jsonb_v1(('"' || E'é' || '"')::JSONB);
  v_result2 := public.fn_canonical_jsonb_v1(('"' || E'é' || '"')::JSONB);
  IF v_result = v_result2 THEN
    RAISE EXCEPTION 'KAV-NFC-NFD: NFC and NFD must produce different canonical text';
  END IF;
  -- Hard-coded canonical text assertions: S<octet_length>:<value>.
  -- NFC é = U+00E9 = 2 UTF-8 bytes (C3 A9) → canonical text = S2:é
  IF v_result <> 'S2:é' THEN
    RAISE EXCEPTION 'KAV-NFC-NFD NFC canonical text mismatch: expected S2:é, got %', v_result;
  END IF;
  -- NFD e+combining-acute = 3 UTF-8 bytes (65 CC 81) → canonical text = S3: + raw NFD bytes.
  IF v_result2 <> ('S3:' || convert_from(decode('65CC81', 'hex'), 'UTF8')) THEN
    RAISE EXCEPTION 'KAV-NFC-NFD NFD canonical text mismatch: expected S3:e+combining-acute (3 bytes), got %', v_result2;
  END IF;
  IF public.fn_sha256_hex(v_result) <> '52669a268b3de8bd030d5dca3e0171b22b253b2ac8ccc8a7a238985fe419e171' THEN
    RAISE EXCEPTION 'KAV-NFC-NFD NFC hash mismatch: got %', public.fn_sha256_hex(v_result);
  END IF;
  IF public.fn_sha256_hex(v_result2) <> 'dee6503e438c6491ef34ba5357aa08831dda270cd4ab8cb72ad5424d159eb7f6' THEN
    RAISE EXCEPTION 'KAV-NFC-NFD NFD hash mismatch: got %', public.fn_sha256_hex(v_result2);
  END IF;

  -- ── R13-H01: Timezone-equivalent UTC normalisation ────────────────────────

  -- KAV-TZ-EQUIV: two timestamptz values at the same UTC instant must produce
  -- identical formatted text via fn_enqueue_job's UTC formatting expression.
  -- 2026-01-01T00:00:00Z ≡ 2026-01-01T01:00:00+01 (same UTC moment).
  v_result  := to_char('2026-01-01T00:00:00Z'::timestamptz AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_result2 := to_char('2026-01-01T01:00:00+01'::timestamptz AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  IF v_result <> '2026-01-01T00:00:00.000000Z' THEN
    RAISE EXCEPTION 'KAV-TZ-EQUIV: UTC format of 2026-01-01T00:00:00Z unexpected: %', v_result;
  END IF;
  IF v_result <> v_result2 THEN
    RAISE EXCEPTION 'KAV-TZ-EQUIV: offset-equivalent timestamps must produce identical UTC text; got % vs %',
      v_result, v_result2;
  END IF;
  -- R14-H01: independently computed Node.js SHA-256 of '2026-01-01T00:00:00.000000Z'
  IF public.fn_sha256_hex(v_result) <> 'f46a75be78d92927fa330974ed449c45abd83afff88112ce7a050624d3e51a8a' THEN
    RAISE EXCEPTION 'KAV-TZ-EQUIV: UTC text hash mismatch (expected f46a75be...): got %',
      public.fn_sha256_hex(v_result);
  END IF;

  -- R15-H03: Flow the UTC-formatted timestamp through fn_canonical_source_v1 to prove that
  -- the complete canonical source envelope embeds the correctly formatted timezone text.
  -- UUID 00000000-0000-0000-0000-000000000005 / title 'KAV timezone source' (19 chars).
  -- Expected canonical text and SHA-256 independently computed 2026-08-04 with Python/Node.js.
  v_expected := $kavtz$molis/source/v1
schema_version=v:1:1
document_id=v:36:00000000-0000-0000-0000-000000000005
document_title=v:19:KAV timezone source
document_extracted_text=NULL
document_file_type=NULL
document_source_type=NULL
document_created_at=v:27:2026-01-01T00:00:00.000000Z
document_subject_id=NULL
document_source_recording_id=NULL
analysis_id=NULL
analysis.subject_area=NULL
analysis.difficulty_level=NULL
analysis.estimated_study_minutes=NULL
analysis.sections=NULL
analysis.key_concepts=NULL
analysis.definitions=NULL
analysis.formulas=NULL
analysis.examples=NULL
analysis.keywords=NULL
analysis.likely_exam_topics=NULL
analysis.learning_objectives=NULL
analysis.misconceptions=NULL
analysis.relationships=NULL
analysis.prerequisites=NULL
analysis.tables=NULL
analysis.concept_graph=NULL
analysis.learning_path=NULL
analysis_created_at=NULL
analysis_model=NULL
$kavtz$;
  v_expected_hash := '826f457faa15dfc85db55961951bafc99854a04e5d28f4d98a21e546bfb227b4';
  v_result := public.fn_canonical_source_v1(
    1, '00000000-0000-0000-0000-000000000005', 'KAV timezone source',
    NULL, NULL, NULL,
    to_char('2026-01-01T00:00:00Z'::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-TZ-ENV TEXT MISMATCH: got: %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-TZ-ENV HASH FAILED: expected %, got %', v_expected_hash, public.fn_sha256_hex(v_result);
  END IF;

  -- ── R13-H01: Model/configuration change → different request hash ──────────

  -- KAV-MODEL-CHANGE: changing image_model must produce a different request hash.
  -- R15-H03: freeze complete canonical output for both baseline and variant.
  -- Both SHA-256 computed 2026-08-04 with Python hashlib.

  -- Baseline (gpt-image-2) — must match KAV-REQ-1 hash exactly.
  v_expected := $kavreqbase$molis/request/v1
schema_version=v:1:1
source_digest=v:64:c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be
job_type=v:7:visuals
sanitized_input=O0:
op.schema_version=I1;
op.job_type=S7:visuals
op.text_model=S11:gpt-4o-mini
op.image_model=S11:gpt-image-2
op.temperature=D0.3;
op.max_tokens=I1200;
op.image_size=S9:1024x1024
op.image_count=I1;
op.prompt_schema_version=I1;
$kavreqbase$;
  v_expected_hash := '7872494e6a422b9e4695227dc2d6728d9f52a76de35dc029c9d7b96b068778ec';
  v_result := public.fn_canonical_request_v1(
    1,
    'c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be',
    'visuals', '{}'::JSONB,
    jsonb_build_object('schema_version',1,'job_type','visuals','text_model','gpt-4o-mini',
      'image_model','gpt-image-2','temperature',0.3,'max_tokens',1200,
      'image_size','1024x1024','image_count',1,'prompt_schema_version',1)
  );
  IF v_result <> v_expected THEN
    RAISE EXCEPTION 'KAV-MODEL-CHANGE baseline text mismatch: got %', v_result;
  END IF;
  IF public.fn_sha256_hex(v_result) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-MODEL-CHANGE: baseline hash must equal KAV-REQ-1: expected %, got %',
      v_expected_hash, public.fn_sha256_hex(v_result);
  END IF;

  -- Variant (gpt-image-3) — only op.image_model changes.
  v_expected := $kavreqgpt3$molis/request/v1
schema_version=v:1:1
source_digest=v:64:c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be
job_type=v:7:visuals
sanitized_input=O0:
op.schema_version=I1;
op.job_type=S7:visuals
op.text_model=S11:gpt-4o-mini
op.image_model=S11:gpt-image-3
op.temperature=D0.3;
op.max_tokens=I1200;
op.image_size=S9:1024x1024
op.image_count=I1;
op.prompt_schema_version=I1;
$kavreqgpt3$;
  v_expected_hash := '1369b1bb7a8b55b2d20056e16ef9456561c4f638f3b4c4a686ecf364ebebda49';
  v_result2 := public.fn_canonical_request_v1(
    1,
    'c427acbfca15a4cc2195eaf2e41c7158b70cdbeadf942ee21786745f99fd24be',
    'visuals', '{}'::JSONB,
    jsonb_build_object('schema_version',1,'job_type','visuals','text_model','gpt-4o-mini',
      'image_model','gpt-image-3','temperature',0.3,'max_tokens',1200,
      'image_size','1024x1024','image_count',1,'prompt_schema_version',1)
  );
  IF v_result2 <> v_expected THEN
    RAISE EXCEPTION 'KAV-MODEL-CHANGE gpt-image-3 text mismatch: got %', v_result2;
  END IF;
  IF public.fn_sha256_hex(v_result2) <> v_expected_hash THEN
    RAISE EXCEPTION 'KAV-MODEL-CHANGE: gpt-image-3 hash mismatch (expected 1369b1bb...): expected %, got %',
      v_expected_hash, public.fn_sha256_hex(v_result2);
  END IF;
  IF public.fn_sha256_hex(v_result) = public.fn_sha256_hex(v_result2) THEN
    RAISE EXCEPTION 'KAV-MODEL-CHANGE: different image_model must produce different request hash';
  END IF;

END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 31. fn_enqueue_job — atomic snapshot+job+ledger — GRANT TO authenticated LAST
--
--     Rewritten per DBR6-C01/C02. The caller supplies only:
--       p_document_id, p_job_type, p_idempotency_key, p_sanitized_input.
--     The DB derives all authoritative values: source content, source digest,
--     operation descriptor, request hash. No caller-supplied hashes, timestamps,
--     model names, or cost parameters are accepted.
--
--     All new jobs are 'client_verified'. The legacy_unverified classification
--     exists only for historical generation_jobs rows (pre-migration); no new
--     rows are created with that classification.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_enqueue_job(
  p_document_id     UUID,
  p_job_type        TEXT,
  p_idempotency_key TEXT,
  p_sanitized_input JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Auth / key parts
  v_user_id              UUID;
  v_key_user_part        TEXT;
  v_request_key          TEXT;
  -- Document fields (point-in-time copy)
  v_doc_title            TEXT;
  v_doc_extracted_text   TEXT;
  v_doc_file_type        TEXT;
  v_doc_source_type      TEXT;
  v_doc_created_at       TIMESTAMPTZ;
  v_doc_subject_id       UUID;
  v_doc_source_rec_id    UUID;
  -- Analysis fields (all nullable)
  v_analysis_id          UUID;
  v_analysis_data        JSONB;       -- explicit jsonb_build_object over D11 columns; NULL if no analysis
  v_analysis_created_at  TIMESTAMPTZ;
  v_analysis_model       TEXT;
  -- Digest / snapshot
  v_source_envelope_text TEXT;
  v_source_digest        TEXT;
  v_op_descriptor        JSONB;
  v_request_envelope_txt TEXT;
  v_request_hash         TEXT;
  v_snapshot_id          UUID;
  v_request_id           UUID;
  -- Ledger / job state
  v_ledger_job_id        UUID;
  v_ledger_snap_id       UUID;
  v_ledger_hash          TEXT;
  v_ledger_document_id   UUID;
  v_ledger_job_type      TEXT;
  v_ledger_input         JSONB;
  v_active_job_id        UUID;
  v_active_snap_id       UUID;
  v_active_content_hash  TEXT;
  v_active_request_hash  TEXT;
  v_active_job_status    TEXT;
  v_new_job_id           UUID;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- ── Idempotency key validation ─────────────────────────────────────────────
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION
      'IDEMPOTENCY_KEY_REQUIRED: p_idempotency_key must be provided for all new jobs'
      USING ERRCODE = 'P0015';
  END IF;

  IF NOT (p_idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY_FORMAT: expected ${userId}:${uuid}'
      USING ERRCODE = 'P0008';
  END IF;

  v_key_user_part := split_part(p_idempotency_key, ':', 1);
  IF v_key_user_part::UUID != v_user_id THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY_OWNER: userId prefix does not match caller'
      USING ERRCODE = 'P0008';
  END IF;

  -- ── Job type and input validation ─────────────────────────────────────────
  IF p_job_type NOT IN ('visuals','flashcards','quiz','revision_notes','analysis') THEN
    RAISE EXCEPTION 'INVALID_JOB_TYPE: %', p_job_type USING ERRCODE = 'P0002';
  END IF;

  IF p_sanitized_input IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_sanitized_input must be a JSON object, not NULL'
      USING ERRCODE = 'P0010';
  END IF;

  -- R9-M02 (R7-M02): Enforce closed empty-object input schema at the database boundary.
  -- All v1 job types accept no user-configurable input fields. Direct PostgREST callers
  -- cannot bypass this check. Extend the per-job branches if future job types accept input.
  IF jsonb_typeof(p_sanitized_input) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_sanitized_input must be a JSON object, got %',
      jsonb_typeof(p_sanitized_input) USING ERRCODE = 'P0010';
  END IF;

  IF p_job_type IN ('visuals','flashcards','quiz','revision_notes','analysis')
     AND p_sanitized_input <> '{}'::JSONB THEN
    RAISE EXCEPTION
      'INVALID_INPUT: v1 job type % accepts no input fields (empty object required), got %',
      p_job_type, p_sanitized_input USING ERRCODE = 'P0010';
  END IF;

  IF octet_length(p_sanitized_input::TEXT) > 65536 THEN
    RAISE EXCEPTION 'INVALID_INPUT: sanitized input exceeds 64 KB limit'
      USING ERRCODE = 'P0010';
  END IF;

  v_request_key := split_part(p_idempotency_key, ':', 2);

  -- ── Fast path: exact ledger lookup before touching mutable tables ──────────
  -- If this exact idempotency key was already committed, return immediately.
  -- FOR SHARE prevents concurrent deletion of the ledger row while we read it.
  SELECT r.job_id, r.snapshot_id, r.request_payload_hash,
         r.document_id, r.job_type, j.input_data
  INTO   v_ledger_job_id, v_ledger_snap_id, v_ledger_hash,
         v_ledger_document_id, v_ledger_job_type, v_ledger_input
  FROM   public.generation_job_requests r
  JOIN   public.generation_jobs j
    ON   (j.id, j.user_id, j.document_id, j.snapshot_id,
          j.request_payload_hash, j.job_type)
       = (r.job_id, r.user_id, r.document_id, r.snapshot_id,
          r.request_payload_hash, r.job_type)
  WHERE  r.user_id                 = v_user_id
    AND  r.request_idempotency_key = p_idempotency_key
  FOR    SHARE OF r, j;

  IF FOUND THEN
    IF v_ledger_document_id IS DISTINCT FROM p_document_id
       OR v_ledger_job_type IS DISTINCT FROM p_job_type
       OR v_ledger_input IS DISTINCT FROM p_sanitized_input THEN
      RAISE EXCEPTION
        'IDEMPOTENCY_PAYLOAD_CONFLICT: request key is already bound to different intent'
        USING ERRCODE = 'P0004';
    END IF;
    SELECT status INTO v_active_job_status
    FROM   public.generation_jobs WHERE id = v_ledger_job_id;
    RETURN jsonb_build_object(
      'job_id',      v_ledger_job_id,
      'is_existing', TRUE,
      'status',      COALESCE(v_active_job_status, 'unknown'),
      'request_key', v_request_key
    );
  END IF;

  -- ── R9-C02: Analysis uniqueness — UNIQUE(document_id, user_id) on document_analysis
  -- (constraint document_analysis_document_user_unique, added in section 17b) prevents
  -- concurrent inserts from creating multiple analysis rows for the same scope.
  -- The LEFT JOIN below therefore returns zero or one analysis row atomically.
  -- No raceable separate COUNT step is required or used as the concurrency authority.

  -- ── R8-C04: Consistent point-in-time source read with shared lock ──────────
  -- Single statement reads document and analysis together. FOR SHARE prevents
  -- concurrent UPDATE/DELETE on the document row between this read and the snapshot
  -- INSERT, ensuring the captured content matches what we hash and store.
  -- The left join returns analysis fields as NULL when no analysis exists (v_analysis_count = 0).
  SELECT
    d.title,
    d.extracted_text,
    d.file_type,
    d.source_type,
    d.created_at,
    d.subject_id,
    d.source_recording_id,
    a.id,
    CASE WHEN a.id IS NOT NULL THEN
      jsonb_build_object(
        -- R8-C01: all 17 analysis content fields from D11 catalogue (no synthetic 'data' column)
        'subject_area',            a.subject_area,
        'difficulty_level',        a.difficulty_level,
        'estimated_study_minutes', a.estimated_study_minutes,
        'sections',                a.sections,
        'key_concepts',            a.key_concepts,
        'definitions',             a.definitions,
        'formulas',                a.formulas,
        'examples',                a.examples,
        'keywords',                a.keywords,
        'likely_exam_topics',      a.likely_exam_topics,
        'learning_objectives',     a.learning_objectives,
        'misconceptions',          a.misconceptions,
        'relationships',           a.relationships,
        'prerequisites',           a.prerequisites,
        'tables',                  a.tables,
        'concept_graph',           a.concept_graph,
        'learning_path',           a.learning_path
      )
    ELSE NULL END,
    a.created_at,
    a.model
  INTO
    v_doc_title,
    v_doc_extracted_text,
    v_doc_file_type,
    v_doc_source_type,
    v_doc_created_at,
    v_doc_subject_id,
    v_doc_source_rec_id,
    v_analysis_id,
    v_analysis_data,
    v_analysis_created_at,
    v_analysis_model
  FROM   public.documents d
  LEFT JOIN public.document_analysis a
         ON a.document_id = d.id AND a.user_id = v_user_id
  WHERE  d.id = p_document_id AND d.user_id = v_user_id
  FOR    SHARE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND_OR_NOT_OWNED' USING ERRCODE = 'P0003';
  END IF;

  -- ── Compute source digest ──────────────────────────────────────────────────
  -- R11-C01: fn_canonical_source_v1 produces the explicit canonical byte sequence
  -- whose field order is frozen in the function body (not JSONB key ordering).
  -- Timestamps pre-converted to UTC ISO-8601 strings (to_char) before passing;
  -- UUIDs cast to TEXT; analysis_data passed as JSONB for named sub-field extraction.
  v_source_envelope_text := public.fn_canonical_source_v1(
    1,
    p_document_id::TEXT,
    v_doc_title,
    v_doc_extracted_text,
    v_doc_file_type,
    v_doc_source_type,
    to_char(v_doc_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    v_doc_subject_id::TEXT,
    v_doc_source_rec_id::TEXT,
    v_analysis_id::TEXT,
    v_analysis_data,
    to_char(v_analysis_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    v_analysis_model
  );

  v_source_digest := public.fn_sha256_hex(v_source_envelope_text);

  -- ── Build server-owned operation descriptor ────────────────────────────────
  -- All generation config is set by the server. The caller supplies only job_type.
  v_op_descriptor := jsonb_build_object(
    'schema_version',       1,
    'job_type',             p_job_type,
    'text_model',           'gpt-4o-mini',
    'image_model',          'gpt-image-2',
    'temperature',          0.3,
    'max_tokens',           1200,
    'image_size',           '1024x1024',
    'image_count',          1,
    'prompt_schema_version', 1
  );

  -- ── Compute request hash ───────────────────────────────────────────────────
  -- R11-C01: fn_canonical_request_v1 extracts op_descriptor sub-fields by name.
  v_request_envelope_txt := public.fn_canonical_request_v1(
    1,
    v_source_digest,
    p_job_type,
    p_sanitized_input,
    v_op_descriptor
  );

  v_request_hash := public.fn_sha256_hex(v_request_envelope_txt);

  -- ── D2 active-job exclusion (with source-identity check) ──────────────────
  -- Join to snapshot to get authoritative content_hash for the active job.
  SELECT gj.id, gj.status, gj.snapshot_id, gss.content_hash, gj.request_payload_hash
  INTO   v_active_job_id, v_active_job_status, v_active_snap_id,
         v_active_content_hash, v_active_request_hash
  FROM   public.generation_jobs     gj
  JOIN   public.generation_source_snapshots gss ON gss.id = gj.snapshot_id
  WHERE  gj.user_id     = v_user_id
    AND  gj.document_id = p_document_id
    AND  gj.job_type    = p_job_type
    AND  gj.status IN ('queued','processing','cancel_requested')
  ORDER  BY gj.created_at DESC
  LIMIT  1;

  IF FOUND THEN
    IF v_active_content_hash IS DISTINCT FROM v_source_digest THEN
      -- Document content changed since the active job was queued.
      -- Caller must cancel the active job before enqueuing with updated content.
      RAISE EXCEPTION
        'DOCUMENT_REVISION_CHANGED: document content changed since the active job was queued; '
        'cancel the active job before enqueuing with updated content'
        USING ERRCODE = 'P0017';
    END IF;

    IF v_active_request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION
        'ACTIVE_JOB_INTENT_CONFLICT: active job has different sanitized input or operation configuration'
        USING ERRCODE = 'P0004';
    END IF;

    -- Same source: bind this idempotency key to the existing active job's snapshot.
    -- R8-C03: Verify the binding was actually created (not silently discarded).
    -- A concurrent race where two different keys both try to bind the same active job
    -- is safe — both keys resolve to the same job. ON CONFLICT here means the key
    -- was already committed (race won by another transaction), which is idempotent.
    INSERT INTO public.generation_job_requests
      (user_id, request_idempotency_key, request_payload_hash,
       document_id, job_type, job_id, snapshot_id)
    VALUES (v_user_id, p_idempotency_key, v_request_hash,
            p_document_id, p_job_type, v_active_job_id, v_active_snap_id)
    ON CONFLICT (user_id, request_idempotency_key) DO NOTHING;

    -- Verify the key is now bound to this job (either by this INSERT or a prior one).
    -- If the key was pre-existing but bound to a DIFFERENT job, the unique constraint
    -- would have allowed the INSERT above (different key prefix already ruled out in
    -- the fast path). This check catches any unexpected divergence.
    SELECT job_id INTO v_ledger_job_id
    FROM   public.generation_job_requests
    WHERE  user_id = v_user_id AND request_idempotency_key = p_idempotency_key;

    IF NOT FOUND OR v_ledger_job_id IS DISTINCT FROM v_active_job_id THEN
      -- R9-H03: Return a structured outcome instead of raising P0007.
      -- Authenticated callers who call fn_enqueue_job directly via PostgREST would
      -- otherwise receive the raw P0007 SQLSTATE and internal message.
      -- The server action checks for outcome='retry_required' and handles it identically
      -- to the former P0007 error branch (one automatic retry, then ENQUEUE_RETRY_REQUIRED).
      RETURN jsonb_build_object(
        'outcome',     'retry_required',
        'job_id',      NULL,
        'is_existing', FALSE,
        'status',      'race_unresolved',
        'request_key', v_request_key
      );
    END IF;

    RETURN jsonb_build_object(
      'job_id',      v_active_job_id,
      'is_existing', TRUE,
      'status',      v_active_job_status,
      'request_key', v_request_key
    );
  END IF;

  -- ── New job: atomically create snapshot → job → ledger (one transaction) ───
  -- R8-C03: If two concurrent transactions both reach this point (no active job found
  -- for the same user/document/job_type), the partial unique index on generation_jobs
  -- means only one INSERT succeeds. The losing transaction catches unique_violation
  -- (23505), re-reads the winner's job, and durably binds its key to that job.
  v_new_job_id  := gen_random_uuid();
  v_snapshot_id := gen_random_uuid();
  v_request_id  := gen_random_uuid();

  BEGIN
    INSERT INTO public.generation_source_snapshots (
      id, user_id, document_id,
      document_title, document_extracted_text,
      document_file_type, document_source_type,
      document_subject_id, document_created_at, document_source_recording_id,
      analysis_id, analysis_data, analysis_created_at, analysis_model,
      operation_descriptor, content_hash
    ) VALUES (
      v_snapshot_id, v_user_id, p_document_id,
      v_doc_title, v_doc_extracted_text,
      v_doc_file_type, v_doc_source_type,
      v_doc_subject_id, v_doc_created_at, v_doc_source_rec_id,
      v_analysis_id, v_analysis_data, v_analysis_created_at, v_analysis_model,
      v_op_descriptor, v_source_digest
    );

    INSERT INTO public.generation_jobs (
      id, user_id, document_id, job_type, status, state_version,
      request_idempotency_key, request_payload_hash, request_classification,
      input_data, snapshot_id, originating_request_id
    ) VALUES (
      v_new_job_id, v_user_id, p_document_id, p_job_type, 'queued', 1,
      p_idempotency_key, v_request_hash, 'client_verified',
      p_sanitized_input, v_snapshot_id, v_request_id
    );

    INSERT INTO public.generation_job_requests
      (id, user_id, request_idempotency_key, request_payload_hash,
       document_id, job_type, job_id, snapshot_id)
    VALUES (v_request_id, v_user_id, p_idempotency_key, v_request_hash,
            p_document_id, p_job_type, v_new_job_id, v_snapshot_id);

  EXCEPTION WHEN unique_violation THEN
    -- R8-C03: Concurrent new-job race. Another transaction won the partial unique index
    -- on (user_id, document_id, job_type) for active jobs. Re-read the winner and
    -- durably bind this key to it.
    SELECT gj.id, gj.status, gj.snapshot_id, gss.content_hash, gj.request_payload_hash
    INTO   v_active_job_id, v_active_job_status, v_active_snap_id,
           v_active_content_hash, v_active_request_hash
    FROM   public.generation_jobs     gj
    JOIN   public.generation_source_snapshots gss ON gss.id = gj.snapshot_id
    WHERE  gj.user_id     = v_user_id
      AND  gj.document_id = p_document_id
      AND  gj.job_type    = p_job_type
      AND  gj.status IN ('queued','processing','cancel_requested')
    ORDER  BY gj.created_at DESC
    LIMIT  1;

    IF NOT FOUND THEN
      -- The winner completed or failed extremely quickly — no longer active.
      -- R9-H03: Structured return instead of P0007.
      RETURN jsonb_build_object(
        'outcome',     'retry_required',
        'job_id',      NULL,
        'is_existing', FALSE,
        'status',      'race_unresolved',
        'request_key', v_request_key
      );
    END IF;

    -- Validate source identity of the winning job before binding this key.
    IF v_active_content_hash IS DISTINCT FROM v_source_digest THEN
      RAISE EXCEPTION
        'DOCUMENT_REVISION_CHANGED: concurrent enqueue won with different source content; '
        'cancel the active job before enqueuing with updated content'
        USING ERRCODE = 'P0017';
    END IF;

    IF v_active_request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION
        'ACTIVE_JOB_INTENT_CONFLICT: concurrent active job has different request intent'
        USING ERRCODE = 'P0004';
    END IF;

    -- Durably bind the losing key to the winning job.
    INSERT INTO public.generation_job_requests
      (user_id, request_idempotency_key, request_payload_hash,
       document_id, job_type, job_id, snapshot_id)
    VALUES (v_user_id, p_idempotency_key, v_request_hash,
            p_document_id, p_job_type, v_active_job_id, v_active_snap_id)
    ON CONFLICT (user_id, request_idempotency_key) DO NOTHING;

    -- Re-read the ledger to verify the key is durably bound to the active job.
    -- ON CONFLICT DO NOTHING fires when the concurrent winner already committed this
    -- key (same-key double-click race). ROW_COUNT would be 0 in that case, but the
    -- key is correctly bound. Reading the ledger directly handles both paths:
    -- (a) this INSERT created the row → v_ledger_job_id = v_active_job_id → success
    -- (b) ON CONFLICT fired (winner already committed) → same verification → success
    -- Only an unexpected divergence (key absent or bound to a different job) returns
    -- retry_required, preserving R9-H03 for genuine unresolvable races.
    SELECT job_id INTO v_ledger_job_id
    FROM   public.generation_job_requests
    WHERE  user_id = v_user_id AND request_idempotency_key = p_idempotency_key;

    IF NOT FOUND OR v_ledger_job_id IS DISTINCT FROM v_active_job_id THEN
      -- R9-H03: Structured return instead of P0007.
      RETURN jsonb_build_object(
        'outcome',     'retry_required',
        'job_id',      NULL,
        'is_existing', FALSE,
        'status',      'race_unresolved',
        'request_key', v_request_key
      );
    END IF;

    RETURN jsonb_build_object(
      'job_id',      v_active_job_id,
      'is_existing', TRUE,
      'status',      v_active_job_status,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 32. Exact existing-object ACL reconciliation and authority postconditions
--
-- Defaults governed object creation; these explicit identity-signature revokes
-- govern every existing object regardless of inherited/default ACL history.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON TABLE public.generation_jobs,
  public.generation_job_requests, public.generation_source_snapshots,
  public.generation_job_usage, public.study_visuals
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_get_claimed_job_context(UUID,TEXT,UUID,INTEGER),
  public.fn_get_job_safe_dto(UUID),
  public.fn_get_active_job_for_document(UUID,TEXT),
  public.fn_get_owner_study_visuals(UUID),
  public.fn_get_visuals_signing_manifest(UUID,UUID),
  public.fn_claim_job(UUID,TEXT,INTEGER),
  public.fn_heartbeat_job(UUID,TEXT,UUID,INTEGER,INTEGER),
  public.fn_complete_job(UUID,TEXT,UUID,INTEGER,JSONB),
  public.fn_complete_and_publish_job(UUID,TEXT,UUID,INTEGER,JSONB,TEXT,TEXT),
  public.fn_fail_job(UUID,TEXT,UUID,INTEGER,TEXT,TEXT,TEXT),
  public.fn_acknowledge_cancel(UUID,TEXT,UUID,INTEGER),
  public.fn_recover_stale_jobs(),
  public.fn_request_job_cancel(UUID),
  public.fn_sha256_hex(TEXT),
  public.fn_enqueue_job(UUID,TEXT,TEXT,JSONB),
  public.fn_snapshot_immutability_guard(),
  public.fn_check_ledger_binding(),
  public.fn_canonical_jsonb_v1(JSONB),
  public.fn_canonical_source_v1(INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT),
  public.fn_canonical_request_v1(INTEGER,TEXT,TEXT,JSONB,JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fn_get_job_safe_dto(UUID),
  public.fn_get_active_job_for_document(UUID,TEXT),
  public.fn_get_owner_study_visuals(UUID),
  public.fn_request_job_cancel(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_get_claimed_job_context(UUID,TEXT,UUID,INTEGER),
  public.fn_get_visuals_signing_manifest(UUID,UUID),
  public.fn_claim_job(UUID,TEXT,INTEGER),
  public.fn_heartbeat_job(UUID,TEXT,UUID,INTEGER,INTEGER),
  public.fn_complete_job(UUID,TEXT,UUID,INTEGER,JSONB),
  public.fn_complete_and_publish_job(UUID,TEXT,UUID,INTEGER,JSONB,TEXT,TEXT),
  public.fn_fail_job(UUID,TEXT,UUID,INTEGER,TEXT,TEXT,TEXT),
  public.fn_acknowledge_cancel(UUID,TEXT,UUID,INTEGER),
  public.fn_recover_stale_jobs()
  TO service_role;

-- fn_enqueue_job is the final authority grant after the complete graph exists.
GRANT EXECUTE ON FUNCTION public.fn_enqueue_job(UUID,TEXT,TEXT,JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 33. R13-H03: ACL reconciliation for source tables — documents and document_analysis
--
-- D11 baseline: both tables carry arwdDxtm for anon/authenticated/service_role
-- (Supabase default-ACL inheritance).  Required final state:
--   anon          — REVOKE ALL (no direct read or write path for anonymous callers)
--   authenticated — CRUD only (SELECT,INSERT,UPDATE,DELETE); TRUNCATE,REFERENCES,
--                   TRIGGER,MAINTAIN revoked (not legitimate app-layer operations)
--   service_role  — CRUD only for operational tooling; same non-DML revocation
-- RLS already enforces row-level ownership; these REVOKE statements add explicit
-- privilege-layer defence independent of RLS bypass (BYPASSRLS is set on service_role).
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL PRIVILEGES ON TABLE public.documents, public.document_analysis FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.documents, public.document_analysis
  FROM authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.documents, public.document_analysis
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.documents, public.document_analysis
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_name TEXT;
  v_sig REGPROCEDURE;
  v_acl RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname = ANY(ARRAY['generation_jobs','generation_job_requests',
        'generation_source_snapshots','generation_job_usage','study_visuals'])
      AND (pg_get_userbyid(c.relowner)<>'postgres' OR NOT c.relrowsecurity)
  ) THEN
    RAISE EXCEPTION 'ACL POSTCONDITION: table owner/RLS contract failed';
  END IF;

  -- R14-H03: Individual per-privilege checks for closed tables.
  -- Comma-list ANY semantics cannot prove each privilege is absent; each must be checked individually.
  FOREACH v_name IN ARRAY ARRAY['generation_jobs','generation_job_requests',
      'generation_source_snapshots','generation_job_usage','study_visuals'] LOOP
    -- anon: zero privileges on closed tables
    IF has_table_privilege('anon',format('public.%I',v_name),'SELECT')
       OR has_table_privilege('anon',format('public.%I',v_name),'INSERT')
       OR has_table_privilege('anon',format('public.%I',v_name),'UPDATE')
       OR has_table_privilege('anon',format('public.%I',v_name),'DELETE')
       OR has_table_privilege('anon',format('public.%I',v_name),'TRUNCATE')
       OR has_table_privilege('anon',format('public.%I',v_name),'REFERENCES')
       OR has_table_privilege('anon',format('public.%I',v_name),'TRIGGER')
       OR has_table_privilege('anon',format('public.%I',v_name),'MAINTAIN') THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: anon retains a privilege on closed table %', v_name;
    END IF;
    -- authenticated: zero privileges on closed tables
    IF has_table_privilege('authenticated',format('public.%I',v_name),'SELECT')
       OR has_table_privilege('authenticated',format('public.%I',v_name),'INSERT')
       OR has_table_privilege('authenticated',format('public.%I',v_name),'UPDATE')
       OR has_table_privilege('authenticated',format('public.%I',v_name),'DELETE')
       OR has_table_privilege('authenticated',format('public.%I',v_name),'TRUNCATE')
       OR has_table_privilege('authenticated',format('public.%I',v_name),'REFERENCES')
       OR has_table_privilege('authenticated',format('public.%I',v_name),'TRIGGER')
       OR has_table_privilege('authenticated',format('public.%I',v_name),'MAINTAIN') THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: authenticated retains a privilege on closed table %', v_name;
    END IF;
    -- service_role: zero privileges on closed tables
    IF has_table_privilege('service_role',format('public.%I',v_name),'SELECT')
       OR has_table_privilege('service_role',format('public.%I',v_name),'INSERT')
       OR has_table_privilege('service_role',format('public.%I',v_name),'UPDATE')
       OR has_table_privilege('service_role',format('public.%I',v_name),'DELETE')
       OR has_table_privilege('service_role',format('public.%I',v_name),'TRUNCATE')
       OR has_table_privilege('service_role',format('public.%I',v_name),'REFERENCES')
       OR has_table_privilege('service_role',format('public.%I',v_name),'TRIGGER')
       OR has_table_privilege('service_role',format('public.%I',v_name),'MAINTAIN') THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: service_role retains a privilege on closed table %', v_name;
    END IF;
    -- R15-H02: Verify no unexpected grantee in relacl using aclexplode for exact comparison.
    -- Rejects grant-option markers (is_grantable=true), wrong grantors, and non-postgres grantees.
    -- Only postgres (owner) may appear; no runtime role should have explicit relacl entries.
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_name AND c.relkind='r'
        AND EXISTS (
          SELECT 1 FROM aclexplode(c.relacl) ace
          WHERE ace.grantee <> 'postgres'::regrole
             OR ace.grantor <> 'postgres'::regrole
             OR ace.is_grantable
        )
    ) THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: unexpected grantee, grantor, or grant option in relacl for closed table %', v_name;
    END IF;
  END LOOP;

  FOR v_sig IN SELECT unnest(ARRAY[
    'public.fn_get_claimed_job_context(uuid,text,uuid,integer)'::regprocedure,
    'public.fn_get_job_safe_dto(uuid)'::regprocedure,
    'public.fn_get_active_job_for_document(uuid,text)'::regprocedure,
    'public.fn_get_owner_study_visuals(uuid)'::regprocedure,
    'public.fn_get_visuals_signing_manifest(uuid,uuid)'::regprocedure,
    'public.fn_claim_job(uuid,text,integer)'::regprocedure,
    'public.fn_heartbeat_job(uuid,text,uuid,integer,integer)'::regprocedure,
    'public.fn_complete_job(uuid,text,uuid,integer,jsonb)'::regprocedure,
    'public.fn_complete_and_publish_job(uuid,text,uuid,integer,jsonb,text,text)'::regprocedure,
    'public.fn_fail_job(uuid,text,uuid,integer,text,text,text)'::regprocedure,
    'public.fn_acknowledge_cancel(uuid,text,uuid,integer)'::regprocedure,
    'public.fn_recover_stale_jobs()'::regprocedure,
    'public.fn_request_job_cancel(uuid)'::regprocedure,
    'public.fn_sha256_hex(text)'::regprocedure,
    'public.fn_enqueue_job(uuid,text,text,jsonb)'::regprocedure,
    'public.fn_snapshot_immutability_guard()'::regprocedure,
    'public.fn_check_ledger_binding()'::regprocedure,
    'public.fn_canonical_jsonb_v1(jsonb)'::regprocedure,
    'public.fn_canonical_source_v1(integer,text,text,text,text,text,text,text,text,text,jsonb,text,text)'::regprocedure,
    'public.fn_canonical_request_v1(integer,text,text,jsonb,jsonb)'::regprocedure
  ]) LOOP
    -- R12-C02: use exact proconfig equality, not EXISTS LIKE.
    -- PG17: SET search_path='' stores as search_path=""; SET search_path=extensions,pg_catalog (bare) stores as search_path=extensions, pg_catalog (no quotes).
    -- fn_sha256_hex uses bare SET search_path=extensions,pg_catalog; all other MoLis functions use SET search_path=''.
    IF NOT EXISTS (SELECT 1 FROM pg_proc
        WHERE oid=v_sig AND proowner='postgres'::regrole AND prosecdef
          AND (
            CASE WHEN v_sig = 'public.fn_sha256_hex(text)'::regprocedure
                 THEN proconfig = ARRAY['search_path=extensions, pg_catalog']
                 ELSE proconfig = ARRAY['search_path=""']
            END
          )) THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: owner/security/search_path failed for %', v_sig;
    END IF;
  END LOOP;

  -- Exact role allowlists. PUBLIC grants are detected because they give anon an
  -- effective privilege. Internal helpers have no runtime allowlist.
  FOR v_acl IN SELECT * FROM (VALUES
    ('public.fn_get_claimed_job_context(uuid,text,uuid,integer)'::regprocedure,FALSE,TRUE),
    ('public.fn_get_job_safe_dto(uuid)'::regprocedure,TRUE,FALSE),
    ('public.fn_get_active_job_for_document(uuid,text)'::regprocedure,TRUE,FALSE),
    ('public.fn_get_owner_study_visuals(uuid)'::regprocedure,TRUE,FALSE),
    ('public.fn_get_visuals_signing_manifest(uuid,uuid)'::regprocedure,FALSE,TRUE),
    ('public.fn_claim_job(uuid,text,integer)'::regprocedure,FALSE,TRUE),
    ('public.fn_heartbeat_job(uuid,text,uuid,integer,integer)'::regprocedure,FALSE,TRUE),
    ('public.fn_complete_job(uuid,text,uuid,integer,jsonb)'::regprocedure,FALSE,TRUE),
    ('public.fn_complete_and_publish_job(uuid,text,uuid,integer,jsonb,text,text)'::regprocedure,FALSE,TRUE),
    ('public.fn_fail_job(uuid,text,uuid,integer,text,text,text)'::regprocedure,FALSE,TRUE),
    ('public.fn_acknowledge_cancel(uuid,text,uuid,integer)'::regprocedure,FALSE,TRUE),
    ('public.fn_recover_stale_jobs()'::regprocedure,FALSE,TRUE),
    ('public.fn_request_job_cancel(uuid)'::regprocedure,TRUE,FALSE),
    ('public.fn_enqueue_job(uuid,text,text,jsonb)'::regprocedure,TRUE,FALSE),
    ('public.fn_sha256_hex(text)'::regprocedure,FALSE,FALSE),
    ('public.fn_snapshot_immutability_guard()'::regprocedure,FALSE,FALSE),
    ('public.fn_check_ledger_binding()'::regprocedure,FALSE,FALSE),
    ('public.fn_canonical_jsonb_v1(jsonb)'::regprocedure,FALSE,FALSE),
    ('public.fn_canonical_source_v1(integer,text,text,text,text,text,text,text,text,text,jsonb,text,text)'::regprocedure,FALSE,FALSE),
    ('public.fn_canonical_request_v1(integer,text,text,jsonb,jsonb)'::regprocedure,FALSE,FALSE)
  ) AS expected(sig,authenticated_ok,service_ok) LOOP
    -- R15-H02: Exact proacl proof via aclexplode — rejects grant-option markers (is_grantable),
    -- wrong grantors, wrong privilege types, PUBLIC grants, anon grants, and unexpected grantees.
    -- LIKE prefix checks (e.g. 'postgres=X%') wrongly accept 'postgres=X*/postgres' (grant option).
    -- aclexplode decomposes each aclitem to (grantor oid, grantee oid, privilege_type, is_grantable).
    IF (SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig) IS NULL THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % has null proacl (REVOKE did not materialise)', v_acl.sig;
    END IF;
    -- No PUBLIC (grantee OID=0) grant
    IF EXISTS (
      SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig))
      WHERE grantee = 0
    ) THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % retains a PUBLIC (=) EXECUTE grant', v_acl.sig;
    END IF;
    -- No anon grant
    IF EXISTS (
      SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig))
      WHERE grantee = 'anon'::regrole
    ) THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % grants EXECUTE to anon', v_acl.sig;
    END IF;
    -- All entries: privilege must be EXECUTE, grantor must be postgres, no grant option
    IF EXISTS (
      SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig))
      WHERE privilege_type <> 'EXECUTE'
         OR grantor <> 'postgres'::regrole
         OR is_grantable
    ) THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % has wrong privilege, grantor, or grant option in proacl', v_acl.sig;
    END IF;
    -- postgres must hold EXECUTE explicitly
    IF NOT EXISTS (
      SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig))
      WHERE grantee = 'postgres'::regrole
    ) THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % postgres owner missing EXECUTE in proacl', v_acl.sig;
    END IF;
    -- authenticated present iff authenticated_ok
    IF (EXISTS (
      SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig))
      WHERE grantee = 'authenticated'::regrole
    )) <> v_acl.authenticated_ok THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % authenticated EXECUTE mismatch', v_acl.sig;
    END IF;
    -- service_role present iff service_ok
    IF (EXISTS (
      SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig))
      WHERE grantee = 'service_role'::regrole
    )) <> v_acl.service_ok THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % service_role EXECUTE mismatch', v_acl.sig;
    END IF;
    -- No unexpected grantees: only postgres, authenticated (if ok), service_role (if ok) allowed
    IF EXISTS (
      SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = v_acl.sig)) ace
      WHERE ace.grantee <> 'postgres'::regrole
        AND NOT (v_acl.authenticated_ok AND ace.grantee = 'authenticated'::regrole)
        AND NOT (v_acl.service_ok AND ace.grantee = 'service_role'::regrole)
    ) THEN
      RAISE EXCEPTION 'ACL POSTCONDITION: function % has unexpected grantee in proacl', v_acl.sig;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='S'
        AND c.relname LIKE 'generation_job%') THEN
    RAISE EXCEPTION 'ACL POSTCONDITION: unexpected related application sequence exists';
  END IF;

  -- R13-H03 / R14-H03: documents and document_analysis postconditions (verified after section 33 below).
  -- MAINTAIN added throughout: R14-H03 found MAINTAIN was missing from every prohibited check.
  -- anon: all eight privileges must be absent.
  IF has_table_privilege('anon','public.documents','SELECT')
     OR has_table_privilege('anon','public.documents','INSERT')
     OR has_table_privilege('anon','public.documents','UPDATE')
     OR has_table_privilege('anon','public.documents','DELETE')
     OR has_table_privilege('anon','public.documents','TRUNCATE')
     OR has_table_privilege('anon','public.documents','REFERENCES')
     OR has_table_privilege('anon','public.documents','TRIGGER')
     OR has_table_privilege('anon','public.documents','MAINTAIN') THEN
    RAISE EXCEPTION 'R13-H03: anon retains privilege on public.documents';
  END IF;
  IF has_table_privilege('anon','public.document_analysis','SELECT')
     OR has_table_privilege('anon','public.document_analysis','INSERT')
     OR has_table_privilege('anon','public.document_analysis','UPDATE')
     OR has_table_privilege('anon','public.document_analysis','DELETE')
     OR has_table_privilege('anon','public.document_analysis','TRUNCATE')
     OR has_table_privilege('anon','public.document_analysis','REFERENCES')
     OR has_table_privilege('anon','public.document_analysis','TRIGGER')
     OR has_table_privilege('anon','public.document_analysis','MAINTAIN') THEN
    RAISE EXCEPTION 'R13-H03: anon retains privilege on public.document_analysis';
  END IF;

  -- authenticated: CRUD required; TRUNCATE, REFERENCES, TRIGGER, MAINTAIN prohibited.
  IF NOT has_table_privilege('authenticated','public.documents','SELECT')
     OR NOT has_table_privilege('authenticated','public.documents','INSERT')
     OR NOT has_table_privilege('authenticated','public.documents','UPDATE')
     OR NOT has_table_privilege('authenticated','public.documents','DELETE') THEN
    RAISE EXCEPTION 'R13-H03: authenticated lost CRUD on public.documents';
  END IF;
  IF has_table_privilege('authenticated','public.documents','TRUNCATE')
     OR has_table_privilege('authenticated','public.documents','REFERENCES')
     OR has_table_privilege('authenticated','public.documents','TRIGGER')
     OR has_table_privilege('authenticated','public.documents','MAINTAIN') THEN
    RAISE EXCEPTION 'R13-H03: authenticated retains non-DML privilege on public.documents';
  END IF;
  IF NOT has_table_privilege('authenticated','public.document_analysis','SELECT')
     OR NOT has_table_privilege('authenticated','public.document_analysis','INSERT')
     OR NOT has_table_privilege('authenticated','public.document_analysis','UPDATE')
     OR NOT has_table_privilege('authenticated','public.document_analysis','DELETE') THEN
    RAISE EXCEPTION 'R13-H03: authenticated lost CRUD on public.document_analysis';
  END IF;
  IF has_table_privilege('authenticated','public.document_analysis','TRUNCATE')
     OR has_table_privilege('authenticated','public.document_analysis','REFERENCES')
     OR has_table_privilege('authenticated','public.document_analysis','TRIGGER')
     OR has_table_privilege('authenticated','public.document_analysis','MAINTAIN') THEN
    RAISE EXCEPTION 'R13-H03: authenticated retains non-DML privilege on public.document_analysis';
  END IF;

  -- service_role: CRUD required; TRUNCATE, REFERENCES, TRIGGER, MAINTAIN prohibited.
  IF NOT has_table_privilege('service_role','public.documents','SELECT')
     OR NOT has_table_privilege('service_role','public.documents','INSERT')
     OR NOT has_table_privilege('service_role','public.documents','UPDATE')
     OR NOT has_table_privilege('service_role','public.documents','DELETE') THEN
    RAISE EXCEPTION 'R13-H03: service_role lost CRUD on public.documents';
  END IF;
  IF has_table_privilege('service_role','public.documents','TRUNCATE')
     OR has_table_privilege('service_role','public.documents','REFERENCES')
     OR has_table_privilege('service_role','public.documents','TRIGGER')
     OR has_table_privilege('service_role','public.documents','MAINTAIN') THEN
    RAISE EXCEPTION 'R13-H03: service_role retains non-DML privilege on public.documents';
  END IF;
  IF NOT has_table_privilege('service_role','public.document_analysis','SELECT')
     OR NOT has_table_privilege('service_role','public.document_analysis','INSERT')
     OR NOT has_table_privilege('service_role','public.document_analysis','UPDATE')
     OR NOT has_table_privilege('service_role','public.document_analysis','DELETE') THEN
    RAISE EXCEPTION 'R13-H03: service_role lost CRUD on public.document_analysis';
  END IF;
  IF has_table_privilege('service_role','public.document_analysis','TRUNCATE')
     OR has_table_privilege('service_role','public.document_analysis','REFERENCES')
     OR has_table_privilege('service_role','public.document_analysis','TRIGGER')
     OR has_table_privilege('service_role','public.document_analysis','MAINTAIN') THEN
    RAISE EXCEPTION 'R13-H03: service_role retains non-DML privilege on public.document_analysis';
  END IF;
  -- R15-H02: Exact relacl proof for source tables using aclexplode.
  -- Rejects unexpected grantees, wrong grantors, grant-option markers, and wrong privilege sets.
  -- Only postgres (owner: all privileges), authenticated (arwd CRUD), service_role (arwd CRUD)
  -- may appear. Anon absence already proven above via has_table_privilege.
  FOREACH v_name IN ARRAY ARRAY['documents','document_analysis'] LOOP
    -- No unexpected grantee in relacl
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_name AND c.relkind='r'
        AND EXISTS (
          SELECT 1 FROM aclexplode(c.relacl) ace
          WHERE ace.grantee <> 'postgres'::regrole
            AND ace.grantee <> 'authenticated'::regrole
            AND ace.grantee <> 'service_role'::regrole
        )
    ) THEN
      RAISE EXCEPTION 'R15-H02: unexpected grantee in relacl for source table %', v_name;
    END IF;
    -- No grant option on any grantee (neither owner nor runtime roles)
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_name AND c.relkind='r'
        AND EXISTS (SELECT 1 FROM aclexplode(c.relacl) ace WHERE ace.is_grantable)
    ) THEN
      RAISE EXCEPTION 'R15-H02: unexpected grant option in relacl for source table %', v_name;
    END IF;
    -- All entries must be granted by postgres
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_name AND c.relkind='r'
        AND EXISTS (SELECT 1 FROM aclexplode(c.relacl) ace WHERE ace.grantor <> 'postgres'::regrole)
    ) THEN
      RAISE EXCEPTION 'R15-H02: unexpected grantor in relacl for source table %', v_name;
    END IF;
  END LOOP;

  -- R15-H02: Exact TABLE/FUNCTION/SEQUENCE default ACL postconditions using aclexplode.
  -- LIKE prefix checks accepted wrong privilege sets, grantors, and grant-option markers.
  -- aclexplode decomposes each aclitem to exact (grantor, grantee, privilege_type, is_grantable) rows.

  -- ── TABLE default ACL ────────────────────────────────────────────────────────────────────────────────────────────────────────
  -- After section 1b REVOKE ALL ON TABLES FROM anon, authenticated, service_role, PUBLIC:
  -- only the postgres self-grant remains: {postgres=arwdDxtm/postgres}.
  -- Runtime roles (anon, authenticated, service_role, PUBLIC/OID-0, any other) must have no entries.
  -- Exact owner-only design: reject any extra grantee, require the complete postgres self-grant.

  -- Reject any entry where the grantee is not postgres (catches all runtime roles and PUBLIC/OID 0).
  IF EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='r'
      AND EXISTS (
        SELECT 1 FROM aclexplode(da.defaclacl) ace
        WHERE ace.grantee <> 'postgres'::regrole
      )
  ) THEN
    RAISE EXCEPTION 'R17-H01: unexpected grantee in TABLE default ACL for public schema after revocation (expected owner-only)';
  END IF;
  -- Reject any grant options.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='r'
      AND EXISTS (SELECT 1 FROM aclexplode(da.defaclacl) ace WHERE ace.is_grantable)
  ) THEN
    RAISE EXCEPTION 'R17-H01: grant option present in TABLE default ACL for public schema';
  END IF;
  -- Reject any unexpected grantors.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='r'
      AND EXISTS (SELECT 1 FROM aclexplode(da.defaclacl) ace WHERE ace.grantor <> 'postgres'::regrole)
  ) THEN
    RAISE EXCEPTION 'R17-H01: unexpected grantor in TABLE default ACL for public schema';
  END IF;
  -- Require the postgres self-grant with all 8 TABLE privileges (arwdDxtm).
  -- Before-state had 8 privileges; after revoking only runtime roles, the postgres entry is unchanged.
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='r'
      AND 8 = (SELECT count(*) FROM aclexplode(da.defaclacl) ace
               WHERE ace.grantee = 'postgres'::regrole
                 AND ace.grantor = 'postgres'::regrole
                 AND NOT ace.is_grantable)
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(da.defaclacl) ace
        WHERE ace.grantee = 'postgres'::regrole
          AND ace.privilege_type NOT IN ('INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
      )
  ) THEN
    RAISE EXCEPTION 'R17-H01: postgres self-grant TABLE default ACL (arwdDxtm, 8 privileges) not found or incomplete after revocation';
  END IF;

  -- ── FUNCTION default ACL ────────────────────────────────────────────────────────────────────────────────────────────────────────
  -- After section 1b REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role, PUBLIC:
  -- required exact state: exactly one decomposed row (grantor=postgres, grantee=postgres,
  -- privilege_type=EXECUTE, is_grantable=false). No more, no fewer.
  -- Bidirectional EXCEPT ALL proves both directions:
  --   Expected EXCEPT Actual → any required row that is absent (row missing → fails).
  --   Actual EXCEPT Expected → any extra row not in the allowlist (unexpected row → fails).
  -- This catches: absent postgres row, anon/authenticated/service_role/PUBLIC (OID 0),
  -- wrong grantors, unexpected privilege types, grant options, and any other extra entry.
  IF EXISTS (
    -- Required row absent from actual ACL.
    SELECT 'postgres'::regrole::oid AS grantor, 'postgres'::regrole::oid AS grantee,
           'EXECUTE'::text AS privilege_type, false::boolean AS is_grantable
    EXCEPT ALL
    SELECT ace.grantor, ace.grantee, ace.privilege_type, ace.is_grantable
    FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    CROSS JOIN LATERAL aclexplode(da.defaclacl) ace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='f'
  ) OR EXISTS (
    -- Extra row in actual ACL not in the allowlist.
    SELECT ace.grantor, ace.grantee, ace.privilege_type, ace.is_grantable
    FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    CROSS JOIN LATERAL aclexplode(da.defaclacl) ace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='f'
    EXCEPT ALL
    SELECT 'postgres'::regrole::oid, 'postgres'::regrole::oid, 'EXECUTE'::text, false::boolean
  ) THEN
    RAISE EXCEPTION 'R17-H03/PATCH: FUNCTION default ACL for public schema does not exactly match the single required row (grantor=postgres, grantee=postgres, privilege_type=EXECUTE, is_grantable=false); the required row is absent, extra rows exist, or unexpected grantees/grantors/privileges/grant-options are present';
  END IF;

  -- ── SEQUENCE default ACL ────────────────────────────────────────────────────────────────────────────────────────────────────────
  -- After section 1b REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role, PUBLIC:
  -- only the postgres self-grant remains: {postgres=rwU/postgres}.
  -- Reject any entry where the grantee is not postgres (catches anon, authenticated,
  -- service_role, PUBLIC/OID 0, and any other role), any unexpected grantors, and grant options.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='S'
      AND EXISTS (
        SELECT 1 FROM aclexplode(da.defaclacl) ace
        WHERE ace.grantee <> 'postgres'::regrole
           OR ace.grantor <> 'postgres'::regrole
           OR ace.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'R17-H03: unexpected entry in SEQUENCE default ACL for public schema after revocation (expected postgres self-grant only; anon, authenticated, service_role, and PUBLIC must not appear)';
  END IF;
  -- Require the postgres self-grant with all 3 SEQUENCE privileges (rwU): SELECT(r), UPDATE(w), USAGE(U).
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid=da.defaclnamespace
    WHERE n.nspname='public' AND da.defaclrole='postgres'::regrole AND da.defaclobjtype='S'
      AND 3 = (SELECT count(*) FROM aclexplode(da.defaclacl) ace
               WHERE ace.grantee = 'postgres'::regrole
                 AND ace.grantor = 'postgres'::regrole
                 AND NOT ace.is_grantable)
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(da.defaclacl) ace
        WHERE ace.grantee = 'postgres'::regrole
          AND ace.privilege_type NOT IN ('SELECT','UPDATE','USAGE')
      )
  ) THEN
    RAISE EXCEPTION 'R17-H03: postgres self-grant SEQUENCE default ACL (rwU, 3 privileges) not found or incomplete after revocation';
  END IF;

  -- R10-H05: Verify exact search_path for each function.
  -- fn_sha256_hex requires 'extensions, pg_catalog' (needs extensions schema for pgcrypto).
  -- All other MoLis functions must have the empty search_path (every schema explicitly qualified).
  -- PG17: fn_sha256_hex uses bare SET search_path=extensions,pg_catalog → stored as search_path=extensions, pg_catalog (no quotes).
  IF NOT EXISTS (SELECT 1 FROM pg_proc
      WHERE oid = 'public.fn_sha256_hex(text)'::regprocedure
        AND proconfig IS NOT NULL
        AND EXISTS (SELECT 1 FROM unnest(proconfig) s
                    WHERE s = 'search_path=extensions, pg_catalog')) THEN
    RAISE EXCEPTION 'ACL POSTCONDITION: fn_sha256_hex search_path is not exactly ''extensions, pg_catalog''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = ANY(ARRAY[
      'public.fn_get_claimed_job_context(uuid,text,uuid,integer)'::regprocedure,
      'public.fn_get_job_safe_dto(uuid)'::regprocedure,
      'public.fn_get_active_job_for_document(uuid,text)'::regprocedure,
      'public.fn_get_owner_study_visuals(uuid)'::regprocedure,
      'public.fn_get_visuals_signing_manifest(uuid,uuid)'::regprocedure,
      'public.fn_claim_job(uuid,text,integer)'::regprocedure,
      'public.fn_heartbeat_job(uuid,text,uuid,integer,integer)'::regprocedure,
      'public.fn_complete_job(uuid,text,uuid,integer,jsonb)'::regprocedure,
      'public.fn_complete_and_publish_job(uuid,text,uuid,integer,jsonb,text,text)'::regprocedure,
      'public.fn_fail_job(uuid,text,uuid,integer,text,text,text)'::regprocedure,
      'public.fn_acknowledge_cancel(uuid,text,uuid,integer)'::regprocedure,
      'public.fn_recover_stale_jobs()'::regprocedure,
      'public.fn_request_job_cancel(uuid)'::regprocedure,
      'public.fn_enqueue_job(uuid,text,text,jsonb)'::regprocedure,
      'public.fn_snapshot_immutability_guard()'::regprocedure,
      'public.fn_check_ledger_binding()'::regprocedure,
      'public.fn_canonical_jsonb_v1(jsonb)'::regprocedure,
      'public.fn_canonical_source_v1(integer,text,text,text,text,text,text,text,text,text,jsonb,text,text)'::regprocedure,
      'public.fn_canonical_request_v1(integer,text,text,jsonb,jsonb)'::regprocedure
    ])
    AND NOT (proconfig IS NOT NULL
             AND EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s = 'search_path=""'))
  ) THEN
    RAISE EXCEPTION 'ACL POSTCONDITION: one or more MoLis functions do not have the expected empty search_path';
  END IF;
END;
$$;

COMMIT;
