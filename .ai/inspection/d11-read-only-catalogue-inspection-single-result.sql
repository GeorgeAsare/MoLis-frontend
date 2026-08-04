-- =============================================================================
-- MoLis Intelligence — D11 Catalogue Inspection (Single Exportable Result Set)
-- File:     .ai/inspection/d11-read-only-catalogue-inspection-single-result.sql
-- Project:  ujwfkhvmpdmgjausnbre
-- Purpose:  Resolve D11 and capture all relevant schema state in ONE result grid
--           so the Supabase SQL Editor exports the full catalogue in one pass.
-- Approved: George Asare, 2026-07-31
-- Scope:    Schema catalogue and metadata only.
--           No row content. No writes. No application RPCs.
-- Run in:   Supabase Dashboard → SQL Editor (role: postgres)
-- =============================================================================
--
-- HOW TO RUN
--   1. Open Supabase Dashboard → project ujwfkhvmpdmgjausnbre → SQL Editor
--   2. Paste this entire script
--   3. Click Run — one result grid appears containing all sections S0–S27
--   4. Use the grid's export/download option to capture all rows
--   5. Return the exported data to Claude Code for Round 5 analysis
--
-- OUTPUT SCHEMA
--   section     — inspection section identifier (S0_env_verification … S27_final_verification)
--   object_name — the schema object being described
--   detail_type — kind of metadata row (column, index, policy, …)
--   details     — JSONB object containing all catalogue values for that row
--
-- SAFETY
--   All statements inside the transaction are SELECT-only.
--   BEGIN TRANSACTION READ ONLY prevents any accidental write.
--   ROLLBACK at the end confirms read-only mode (no-op; no writes occurred).
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH

-- ─────────────────────────────────────────────────────────────────────────────
-- S0  ENVIRONMENT VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
s0 AS (
  SELECT
    'S0_env_verification'::text              AS section,
    'environment'::text                      AS object_name,
    'env'::text                              AS detail_type,
    jsonb_build_object(
      'current_database',      current_database(),
      'current_schema',        current_schema(),
      'current_user',          current_user,
      'session_user',          session_user,
      'transaction_read_only', current_setting('transaction_read_only'),
      'pg_version',            version()
    )                                        AS details
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S1  TABLE EXISTENCE CHECK
-- ─────────────────────────────────────────────────────────────────────────────
s1 AS (
  SELECT
    'S1_table_existence'::text               AS section,
    table_name::text                         AS object_name,
    'table'::text                            AS detail_type,
    jsonb_build_object(
      'table_schema', table_schema,
      'table_name',   table_name,
      'table_type',   table_type
    )                                        AS details
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S2  COLUMN CATALOGUE — ALL FIVE APPROVED TABLES
-- ─────────────────────────────────────────────────────────────────────────────
s2 AS (
  SELECT
    'S2_columns'::text                                    AS section,
    (c.table_name || '.' || c.column_name)::text          AS object_name,
    'column'::text                                        AS detail_type,
    jsonb_build_object(
      'table_name',               c.table_name,
      'ordinal_position',         c.ordinal_position,
      'column_name',              c.column_name,
      'data_type',                c.data_type,
      'udt_name',                 c.udt_name,
      'character_maximum_length', c.character_maximum_length,
      'numeric_precision',        c.numeric_precision,
      'numeric_scale',            c.numeric_scale,
      'is_nullable',              c.is_nullable,
      'column_default',           c.column_default,
      'is_generated',             c.is_generated,
      'generation_expression',    c.generation_expression,
      'is_identity',              c.is_identity,
      'identity_generation',      c.identity_generation
    )                                                     AS details
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S3  REVISION-RELATED COLUMNS — D11 PRIMARY FOCUS
--     Timestamp and update/version/hash columns in documents and
--     document_analysis only. These are the columns required for source
--     revision identity in idempotency key hashing and worker revalidation.
-- ─────────────────────────────────────────────────────────────────────────────
s3 AS (
  SELECT
    'S3_revision_columns_d11'::text                       AS section,
    (c.table_name || '.' || c.column_name)::text          AS object_name,
    'revision_column'::text                               AS detail_type,
    jsonb_build_object(
      'table_name',       c.table_name,
      'ordinal_position', c.ordinal_position,
      'column_name',      c.column_name,
      'data_type',        c.data_type,
      'udt_name',         c.udt_name,
      'is_nullable',      c.is_nullable,
      'column_default',   c.column_default
    )                                                     AS details
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN ('documents', 'document_analysis')
    AND (
      c.data_type IN (
        'timestamp with time zone',
        'timestamp without time zone',
        'date'
      )
      OR c.udt_name IN ('timestamptz', 'timestamp', 'date')
      OR c.column_name ILIKE '%update%'
      OR c.column_name ILIKE '%creat%'
      OR c.column_name ILIKE '%modif%'
      OR c.column_name ILIKE '%version%'
      OR c.column_name ILIKE '%revision%'
      OR c.column_name ILIKE '%_at'
      OR c.column_name ILIKE '%hash%'
      OR c.column_name ILIKE '%checksum%'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S4  PRIMARY KEYS
-- ─────────────────────────────────────────────────────────────────────────────
s4 AS (
  SELECT
    'S4_primary_keys'::text                               AS section,
    (tc.table_name || '.' || tc.constraint_name)::text    AS object_name,
    'primary_key'::text                                   AS detail_type,
    jsonb_build_object(
      'table_name',       tc.table_name,
      'constraint_name',  tc.constraint_name,
      'column_name',      kc.column_name,
      'ordinal_position', kc.ordinal_position
    )                                                     AS details
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kc
    ON  tc.constraint_name = kc.constraint_name
    AND tc.table_schema    = kc.table_schema
  WHERE tc.table_schema    = 'public'
    AND tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_name IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S5  UNIQUE CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────
s5 AS (
  SELECT
    'S5_unique_constraints'::text                         AS section,
    (tc.table_name || '.' || tc.constraint_name)::text    AS object_name,
    'unique_constraint'::text                             AS detail_type,
    jsonb_build_object(
      'table_name',       tc.table_name,
      'constraint_name',  tc.constraint_name,
      'column_name',      kc.column_name,
      'ordinal_position', kc.ordinal_position
    )                                                     AS details
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kc
    ON  tc.constraint_name = kc.constraint_name
    AND tc.table_schema    = kc.table_schema
  WHERE tc.table_schema    = 'public'
    AND tc.constraint_type = 'UNIQUE'
    AND tc.table_name IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S6  FOREIGN KEYS
-- ─────────────────────────────────────────────────────────────────────────────
s6 AS (
  SELECT
    'S6_foreign_keys'::text                               AS section,
    (tc.table_name || '.' || tc.constraint_name)::text    AS object_name,
    'foreign_key'::text                                   AS detail_type,
    jsonb_build_object(
      'table_name',        tc.table_name,
      'constraint_name',   tc.constraint_name,
      'column_name',       kc.column_name,
      'ordinal_position',  kc.ordinal_position,
      'referenced_table',  ccu.table_name,
      'referenced_column', ccu.column_name,
      'delete_rule',       rc.delete_rule,
      'update_rule',       rc.update_rule
    )                                                     AS details
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kc
    ON  tc.constraint_name  = kc.constraint_name
    AND tc.table_schema     = kc.table_schema
  JOIN information_schema.referential_constraints rc
    ON  tc.constraint_name   = rc.constraint_name
    AND tc.constraint_schema = rc.constraint_schema
  JOIN information_schema.constraint_column_usage ccu
    ON  rc.unique_constraint_name   = ccu.constraint_name
    AND rc.unique_constraint_schema = ccu.constraint_schema
  WHERE tc.table_schema    = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S7  CHECK CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────
s7 AS (
  SELECT
    'S7_check_constraints'::text                          AS section,
    (tc.table_name || '.' || tc.constraint_name)::text    AS object_name,
    'check_constraint'::text                              AS detail_type,
    jsonb_build_object(
      'table_name',      tc.table_name,
      'constraint_name', tc.constraint_name,
      'check_clause',    cc.check_clause
    )                                                     AS details
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc
    ON  tc.constraint_name   = cc.constraint_name
    AND tc.constraint_schema = cc.constraint_schema
  WHERE tc.table_schema    = 'public'
    AND tc.constraint_type = 'CHECK'
    AND tc.table_name IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S8  INDEXES (partial predicates and expression details)
--     Uses GROUP BY + array_agg to collapse per-column rows into one index row.
-- ─────────────────────────────────────────────────────────────────────────────
s8 AS (
  SELECT
    'S8_indexes'::text                                    AS section,
    (t.relname || '.' || i.relname)::text                 AS object_name,
    'index'::text                                         AS detail_type,
    jsonb_build_object(
      'table_name',        t.relname,
      'index_name',        i.relname,
      'is_unique',         ix.indisunique,
      'is_primary',        ix.indisprimary,
      'is_partial',        (ix.indpred IS NOT NULL),
      'partial_predicate', pg_get_expr(ix.indpred,  ix.indrelid),
      'expression',        pg_get_expr(ix.indexprs, ix.indrelid),
      'columns',           array_to_string(
                             array_agg(
                               a.attname
                               ORDER BY array_position(ix.indkey::int2[], a.attnum)
                             ),
                             ', '
                           ),
      'index_method',      am.amname
    )                                                     AS details
  FROM pg_class     t
  JOIN pg_index     ix ON t.oid          = ix.indrelid
  JOIN pg_class     i  ON i.oid          = ix.indexrelid
  JOIN pg_namespace n  ON t.relnamespace = n.oid
  JOIN pg_am        am ON i.relam        = am.oid
  LEFT JOIN pg_attribute a
    ON  a.attrelid = t.oid
    AND a.attnum   = ANY(ix.indkey)
    AND a.attnum   > 0
  WHERE n.nspname = 'public'
    AND t.relname IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
    AND t.relkind = 'r'
  GROUP BY
    t.relname, i.relname,
    ix.indisunique, ix.indisprimary,
    ix.indpred, ix.indexprs, ix.indrelid,
    am.amname
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S9  TRIGGERS (information_schema)
--     Valid columns only — is_deferrable and initially_deferred do not
--     exist in information_schema.triggers in this PostgreSQL version.
--     Deferred / constraint trigger detail is captured in S9B via pg_trigger.
-- ─────────────────────────────────────────────────────────────────────────────
s9 AS (
  SELECT
    'S9_triggers'::text                                   AS section,
    (event_object_table || '.' || trigger_name)::text     AS object_name,
    'trigger'::text                                       AS detail_type,
    jsonb_build_object(
      'trigger_name',       trigger_name,
      'table_name',         event_object_table,
      'event_manipulation', event_manipulation,
      'action_timing',      action_timing,
      'action_orientation', action_orientation,
      'action_statement',   action_statement
    )                                                     AS details
  FROM information_schema.triggers
  WHERE trigger_schema       = 'public'
    AND event_object_table IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S9B TRIGGERS (pg_trigger)
--     Exposes constraint triggers and deferred status not visible in
--     information_schema, including trg_check_ledger_binding from the
--     proposed migration.
-- ─────────────────────────────────────────────────────────────────────────────
s9b AS (
  SELECT
    'S9b_pg_triggers'::text                               AS section,
    (c.relname || '.' || t.tgname)::text                  AS object_name,
    'pg_trigger'::text                                    AS detail_type,
    jsonb_build_object(
      'table_name',            c.relname,
      'trigger_name',          t.tgname,
      'tgtype',                t.tgtype,
      'tgenabled',             t.tgenabled,
      'is_constraint_trigger', (t.tgconstraint > 0),
      'tgdeferrable',          t.tgdeferrable,
      'tginitdeferred',        t.tginitdeferred,
      'trigger_function',      p.proname
    )                                                     AS details
  FROM pg_trigger   t
  JOIN pg_class     c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_proc      p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
    AND NOT t.tgisinternal
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S10 RLS STATUS AND TABLE OWNERSHIP
-- ─────────────────────────────────────────────────────────────────────────────
s10 AS (
  SELECT
    'S10_rls_status'::text                                AS section,
    c.relname::text                                       AS object_name,
    'rls_status'::text                                    AS detail_type,
    jsonb_build_object(
      'table_name',  c.relname,
      'rls_enabled', c.relrowsecurity,
      'rls_forced',  c.relforcerowsecurity,
      'table_owner', r.rolname
    )                                                     AS details
  FROM pg_class     c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_roles     r ON c.relowner     = r.oid
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
    AND c.relkind = 'r'
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S11 RLS POLICIES — PUBLIC SCHEMA TABLES
--     Full USING and WITH CHECK expressions for every policy.
--     permissive distinguishes PERMISSIVE from RESTRICTIVE policies.
-- ─────────────────────────────────────────────────────────────────────────────
s11 AS (
  SELECT
    'S11_rls_policies'::text                              AS section,
    (tablename || '.' || policyname)::text                AS object_name,
    'rls_policy'::text                                    AS detail_type,
    jsonb_build_object(
      'schemaname', schemaname,
      'tablename',  tablename,
      'policyname', policyname,
      'permissive', permissive,
      'roles',      roles,
      'cmd',        cmd,
      'qual',       qual,
      'with_check', with_check
    )                                                     AS details
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S12 TABLE PRIVILEGES
-- ─────────────────────────────────────────────────────────────────────────────
s12 AS (
  SELECT
    'S12_table_privileges'::text                          AS section,
    (table_name || '.' || grantee || '.' || privilege_type)::text
                                                          AS object_name,
    'table_privilege'::text                               AS detail_type,
    jsonb_build_object(
      'grantee',        grantee,
      'table_name',     table_name,
      'privilege_type', privilege_type,
      'is_grantable',   is_grantable
    )                                                     AS details
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
    AND grantee IN (
      'PUBLIC', 'anon', 'authenticated', 'service_role', 'postgres'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S13 FUNCTION CATALOGUE
--     Existence, signature, return type, SECURITY DEFINER, GUC settings.
--     Functions absent here do not yet exist in the live database.
-- ─────────────────────────────────────────────────────────────────────────────
s13 AS (
  SELECT
    'S13_function_catalogue'::text                        AS section,
    p.proname::text                                       AS object_name,
    'function'::text                                      AS detail_type,
    jsonb_build_object(
      'schema_name',      n.nspname,
      'function_name',    p.proname,
      'arguments',        pg_get_function_identity_arguments(p.oid),
      'return_type',      pg_get_function_result(p.oid),
      'owner',            r.rolname,
      'security_definer', p.prosecdef,
      'guc_settings',     p.proconfig,
      'volatility',       p.provolatile,
      'leak_proof',       p.proleakproof
    )                                                     AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  JOIN pg_roles     r ON p.proowner     = r.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'fn_enqueue_job',
      'fn_claim_job',
      'fn_heartbeat_job',
      'fn_complete_job',
      'fn_complete_and_publish_job',
      'fn_fail_job',
      'fn_cancel_job',
      'fn_acknowledge_cancel',
      'fn_recover_stale_jobs',
      'fn_get_job_safe_dto',
      'fn_get_active_job_for_document',
      'fn_get_claimed_job_context',
      'fn_check_ledger_binding'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S14 FUNCTION EXECUTE PRIVILEGES
-- ─────────────────────────────────────────────────────────────────────────────
s14 AS (
  SELECT
    'S14_function_execute_grants'::text                   AS section,
    (routine_name || '.' || grantee)::text                AS object_name,
    'function_grant'::text                                AS detail_type,
    jsonb_build_object(
      'grantee',        grantee,
      'routine_schema', routine_schema,
      'routine_name',   routine_name,
      'privilege_type', privilege_type,
      'is_grantable',   is_grantable
    )                                                     AS details
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'fn_enqueue_job',
      'fn_claim_job',
      'fn_heartbeat_job',
      'fn_complete_job',
      'fn_complete_and_publish_job',
      'fn_fail_job',
      'fn_cancel_job',
      'fn_acknowledge_cancel',
      'fn_recover_stale_jobs',
      'fn_get_job_safe_dto',
      'fn_get_active_job_for_document',
      'fn_get_claimed_job_context',
      'fn_check_ledger_binding'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S15 VIEWS
--     Checks whether generation_jobs_owner_view or any replacement view
--     exists. The proposed migration drops generation_jobs_owner_view.
-- ─────────────────────────────────────────────────────────────────────────────
s15 AS (
  SELECT
    'S15_views'::text                                     AS section,
    viewname::text                                        AS object_name,
    'view'::text                                          AS detail_type,
    jsonb_build_object(
      'schemaname', schemaname,
      'viewname',   viewname,
      'viewowner',  viewowner,
      'definition', definition
    )                                                     AS details
  FROM pg_views
  WHERE schemaname = 'public'
    AND viewname IN (
      'generation_jobs_owner_view',
      'generation_jobs_safe_view',
      'generation_jobs_view'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S16 CUSTOM ENUM TYPES
--     Shows all values for each relevant enum. Migration may CREATE TYPE
--     or ADD VALUE; this section shows what already exists.
-- ─────────────────────────────────────────────────────────────────────────────
s16 AS (
  SELECT
    'S16_enum_types'::text                                AS section,
    (t.typname || '.' || e.enumlabel)::text               AS object_name,
    'enum_value'::text                                    AS detail_type,
    jsonb_build_object(
      'schema_name',   n.nspname,
      'type_name',     t.typname,
      'enumsortorder', e.enumsortorder,
      'enum_value',    e.enumlabel
    )                                                     AS details
  FROM pg_type      t
  JOIN pg_namespace n ON t.typnamespace = n.oid
  JOIN pg_enum      e ON t.oid          = e.enumtypid
  WHERE n.nspname = 'public'
    AND t.typname IN (
      'job_status',
      'job_type',
      'request_classification',
      'visual_status',
      'job_status_enum',
      'generation_job_status'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S17 EXTENSIONS
--     Checks for pgcrypto (digest()), uuid-ossp, and other extensions
--     referenced or required by the proposed migration.
-- ─────────────────────────────────────────────────────────────────────────────
s17 AS (
  SELECT
    'S17_extensions'::text                                AS section,
    extname::text                                         AS object_name,
    'extension'::text                                     AS detail_type,
    jsonb_build_object(
      'extname',        extname,
      'extversion',     extversion,
      'extrelocatable', extrelocatable
    )                                                     AS details
  FROM pg_extension
  WHERE extname IN (
    'pgcrypto',
    'uuid-ossp',
    'pg_stat_statements',
    'pg_cron',
    'pgjwt',
    'supabase_vault',
    'plpgsql'
  )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S18 STORAGE — study-visuals BUCKET METADATA
--     public = false is required. file_size_limit and allowed_mime_types
--     are inspected for any restrictions relevant to the migration.
-- ─────────────────────────────────────────────────────────────────────────────
s18 AS (
  SELECT
    'S18_storage_bucket'::text                            AS section,
    name::text                                            AS object_name,
    'bucket'::text                                        AS detail_type,
    jsonb_build_object(
      'id',                 id,
      'name',               name,
      'owner',              owner,
      'public',             public,
      'avif_autodetection', avif_autodetection,
      'file_size_limit',    file_size_limit,
      'allowed_mime_types', allowed_mime_types,
      'created_at',         created_at,
      'updated_at',         updated_at
    )                                                     AS details
  FROM storage.buckets
  WHERE id = 'study-visuals' OR name = 'study-visuals'
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S19 STORAGE — ALL POLICIES ON storage.objects
--     Returns every policy (PERMISSIVE and RESTRICTIVE) for all roles.
--     Full USING and WITH CHECK expressions are required to verify whether
--     the RESTRICTIVE deny policies from the migration are already present.
-- ─────────────────────────────────────────────────────────────────────────────
s19 AS (
  SELECT
    'S19_storage_object_policies'::text                   AS section,
    policyname::text                                      AS object_name,
    'storage_policy'::text                                AS detail_type,
    jsonb_build_object(
      'policyname', policyname,
      'permissive', permissive,
      'roles',      roles,
      'cmd',        cmd,
      'qual',       qual,
      'with_check', with_check
    )                                                     AS details
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename  = 'objects'
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S20 STORAGE — storage.objects RLS STATUS
-- ─────────────────────────────────────────────────────────────────────────────
s20 AS (
  SELECT
    'S20_storage_objects_rls'::text                       AS section,
    'storage.objects'::text                               AS object_name,
    'storage_rls'::text                                   AS detail_type,
    jsonb_build_object(
      'table_name',  c.relname,
      'rls_enabled', c.relrowsecurity,
      'rls_forced',  c.relforcerowsecurity,
      'table_owner', r.rolname
    )                                                     AS details
  FROM pg_class     c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_roles     r ON c.relowner     = r.oid
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects'
    AND c.relkind = 'r'
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S21 generation_job_requests EXISTENCE CHECK
-- ─────────────────────────────────────────────────────────────────────────────
s21 AS (
  SELECT
    'S21_job_requests_exists'::text                       AS section,
    'generation_job_requests'::text                       AS object_name,
    'existence'::text                                     AS detail_type,
    jsonb_build_object(
      'present',
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'generation_job_requests'
      ),
      'message',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name   = 'generation_job_requests'
        )
        THEN 'YES — table already exists in the live catalogue'
        ELSE 'NO  — table does not exist; migration will CREATE it'
      END
    )                                                     AS details
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S22 pg_constraint — COMPLETE CONSTRAINT CATALOGUE
--     Supplements information_schema with exact contype codes and
--     deferrable/deferred status. Catches exclusion constraints and
--     constraint triggers.
--     contype: p=primary key  u=unique  f=foreign key  c=check  x=exclusion
-- ─────────────────────────────────────────────────────────────────────────────
s22 AS (
  SELECT
    'S22_pg_constraints'::text                            AS section,
    (c.relname || '.' || con.conname)::text               AS object_name,
    'pg_constraint'::text                                 AS detail_type,
    jsonb_build_object(
      'table_name',            c.relname,
      'constraint_name',       con.conname,
      'constraint_type',       con.contype,
      'condeferrable',         con.condeferrable,
      'condeferred',           con.condeferred,
      'constraint_definition', pg_get_constraintdef(con.oid, true)
    )                                                     AS details
  FROM pg_constraint con
  JOIN pg_class      c ON c.oid = con.conrelid
  JOIN pg_namespace  n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'documents',
      'document_analysis',
      'study_visuals',
      'generation_jobs',
      'generation_job_requests'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S23 SEQUENCES
-- ─────────────────────────────────────────────────────────────────────────────
s23 AS (
  SELECT
    'S23_sequences'::text                                 AS section,
    sequence_name::text                                   AS object_name,
    'sequence'::text                                      AS detail_type,
    jsonb_build_object(
      'sequence_schema', sequence_schema,
      'sequence_name',   sequence_name,
      'data_type',       data_type,
      'start_value',     start_value,
      'minimum_value',   minimum_value,
      'maximum_value',   maximum_value,
      'increment',       increment,
      'cycle_option',    cycle_option
    )                                                     AS details
  FROM information_schema.sequences
  WHERE sequence_schema = 'public'
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S24 study_visuals COLUMN LIST
--     Confirms the JSONB visuals column and full table structure.
--     No row content is selected.
-- ─────────────────────────────────────────────────────────────────────────────
s24 AS (
  SELECT
    'S24_study_visuals_columns'::text                     AS section,
    ('study_visuals.' || column_name)::text               AS object_name,
    'column'::text                                        AS detail_type,
    jsonb_build_object(
      'column_name',      column_name,
      'ordinal_position', ordinal_position,
      'data_type',        data_type,
      'udt_name',         udt_name,
      'is_nullable',      is_nullable,
      'column_default',   column_default
    )                                                     AS details
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'study_visuals'
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S25 FUNCTION SOURCE BODIES
--     Live PL/pgSQL source for comparison with proposed migration.
--     prosrc is a catalogue column; no application logic is invoked.
-- ─────────────────────────────────────────────────────────────────────────────
s25 AS (
  SELECT
    'S25_function_source'::text                           AS section,
    p.proname::text                                       AS object_name,
    'function_source'::text                               AS detail_type,
    jsonb_build_object(
      'function_name', p.proname,
      'arguments',     pg_get_function_identity_arguments(p.oid),
      'source_body',   p.prosrc
    )                                                     AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'fn_enqueue_job',
      'fn_claim_job',
      'fn_heartbeat_job',
      'fn_complete_job',
      'fn_complete_and_publish_job',
      'fn_fail_job',
      'fn_cancel_job',
      'fn_acknowledge_cancel',
      'fn_recover_stale_jobs',
      'fn_get_job_safe_dto',
      'fn_get_active_job_for_document',
      'fn_get_claimed_job_context'
    )
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S26 SCHEMA SIZE SUMMARY
--     Counts of tables, views, and functions in public schema.
-- ─────────────────────────────────────────────────────────────────────────────
s26 AS (
  SELECT
    'S26_schema_summary'::text                            AS section,
    'schema_summary'::text                                AS object_name,
    'count'::text                                         AS detail_type,
    jsonb_build_object(
      'public_table_count', (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type   = 'BASE TABLE'
      ),
      'public_view_count', (
        SELECT count(*)
        FROM information_schema.views
        WHERE table_schema = 'public'
      ),
      'public_function_count', (
        SELECT count(*)
        FROM information_schema.routines
        WHERE routine_schema = 'public'
      )
    )                                                     AS details
),

-- ─────────────────────────────────────────────────────────────────────────────
-- S27 FINAL READ-ONLY VERIFICATION
--     Re-reads transaction_read_only immediately before ROLLBACK.
--     This is always the last data row in the unified result set.
-- ─────────────────────────────────────────────────────────────────────────────
s27 AS (
  SELECT
    'S27_final_verification'::text                        AS section,
    'transaction_verification'::text                      AS object_name,
    'verification'::text                                  AS detail_type,
    jsonb_build_object(
      'transaction_read_only', current_setting('transaction_read_only'),
      'note',                  'ROLLBACK follows — confirms read-only mode; no writes executed'
    )                                                     AS details
)

-- ─────────────────────────────────────────────────────────────────────────────
-- UNIFIED OUTPUT — single result grid covering all S0–S27 sections
-- ─────────────────────────────────────────────────────────────────────────────
SELECT section, object_name, detail_type, details
FROM (
        SELECT * FROM s0
  UNION ALL SELECT * FROM s1
  UNION ALL SELECT * FROM s2
  UNION ALL SELECT * FROM s3
  UNION ALL SELECT * FROM s4
  UNION ALL SELECT * FROM s5
  UNION ALL SELECT * FROM s6
  UNION ALL SELECT * FROM s7
  UNION ALL SELECT * FROM s8
  UNION ALL SELECT * FROM s9
  UNION ALL SELECT * FROM s9b
  UNION ALL SELECT * FROM s10
  UNION ALL SELECT * FROM s11
  UNION ALL SELECT * FROM s12
  UNION ALL SELECT * FROM s13
  UNION ALL SELECT * FROM s14
  UNION ALL SELECT * FROM s15
  UNION ALL SELECT * FROM s16
  UNION ALL SELECT * FROM s17
  UNION ALL SELECT * FROM s18
  UNION ALL SELECT * FROM s19
  UNION ALL SELECT * FROM s20
  UNION ALL SELECT * FROM s21
  UNION ALL SELECT * FROM s22
  UNION ALL SELECT * FROM s23
  UNION ALL SELECT * FROM s24
  UNION ALL SELECT * FROM s25
  UNION ALL SELECT * FROM s26
  UNION ALL SELECT * FROM s27
) all_sections
ORDER BY section, object_name, detail_type;

ROLLBACK;

-- =============================================================================
-- END OF D11 SINGLE-RESULT CATALOGUE INSPECTION SCRIPT
-- =============================================================================
