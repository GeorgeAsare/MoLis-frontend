-- =============================================================================
-- MoLis Intelligence — D11 Read-Only Catalogue Inspection Script
-- File:     .ai/inspection/d11-read-only-catalogue-inspection.sql
-- Project:  ujwfkhvmpdmgjausnbre
-- Purpose:  Resolve D11 (source revision column mapping) and catalogue all
--           relevant schema state for Round 5 migration corrections.
-- Approved: George Asare, 2026-07-31
-- Scope:    Schema catalogue and metadata queries only.
--           No row content. No writes. No application RPCs.
-- Run in:   Supabase Dashboard → SQL Editor (role: postgres)
-- =============================================================================
--
-- HOW TO RUN
--   1. Open Supabase Dashboard → project ujwfkhvmpdmgjausnbre → SQL Editor
--   2. Paste this entire script
--   3. Click Run
--   4. Copy every result set (each is labelled with its section identifier)
--   5. Return results to Claude Code for Round 5 analysis
--
-- SAFETY
--   All statements are SELECT-only.
--   BEGIN TRANSACTION READ ONLY prevents any accidental write within this
--   transaction. ROLLBACK at the end confirms read-only mode (no-op since
--   no writes occurred).
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- ─────────────────────────────────────────────────────────────────────────────
-- S0  ENVIRONMENT VERIFICATION
--     Confirms: database, schema, role, and transaction_read_only = on.
--     Must be verified before any inspection results are trusted.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S0_env_verification'                          AS section,
  current_database()                             AS current_database,
  current_schema()                               AS current_schema,
  current_user                                   AS current_user,
  session_user                                   AS session_user,
  current_setting('transaction_read_only')       AS transaction_read_only,
  version()                                      AS pg_version;


-- ─────────────────────────────────────────────────────────────────────────────
-- S1  TABLE EXISTENCE CHECK
--     Which of the five approved tables exist in the live catalogue?
--     generation_job_requests may not yet exist — its presence determines
--     whether the migration will CREATE or ALTER it.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S1_table_existence'                           AS section,
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
ORDER BY table_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- S2  COLUMN CATALOGUE — ALL FIVE APPROVED TABLES
--     Returns every column with its ordinal position, data type (both SQL
--     standard name and udt_name for custom/enum types), nullability,
--     default expression, and identity / generated properties.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S2_columns'                                   AS section,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default,
  c.is_generated,
  c.generation_expression,
  c.is_identity,
  c.identity_generation
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
ORDER BY c.table_name, c.ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- S3  REVISION-RELATED COLUMNS — D11 PRIMARY FOCUS
--     Restricted to public.documents and public.document_analysis only.
--     Returns all timestamp/timestamptz columns and any column whose name
--     contains update, creat, modif, version, revision, _at, hash, or checksum.
--     These are the exact columns the migration must reference for source
--     revision identity in idempotency key hashing and worker revalidation.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S3_revision_columns_d11'                      AS section,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
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
ORDER BY c.table_name, c.ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- S4  PRIMARY KEYS
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S4_primary_keys'                              AS section,
  tc.table_name,
  tc.constraint_name,
  kc.column_name,
  kc.ordinal_position
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
ORDER BY tc.table_name, kc.ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- S5  UNIQUE CONSTRAINTS
--     Includes named unique constraints declared via ADD CONSTRAINT.
--     Does not include unique indexes unless they also appear here.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S5_unique_constraints'                        AS section,
  tc.table_name,
  tc.constraint_name,
  kc.column_name,
  kc.ordinal_position
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
ORDER BY tc.table_name, tc.constraint_name, kc.ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- S6  FOREIGN KEYS
--     Includes referenced table/column and ON DELETE / ON UPDATE behaviour.
--     Critical for verifying the composite FK (job_id, user_id) design.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S6_foreign_keys'                              AS section,
  tc.table_name,
  tc.constraint_name,
  kc.column_name,
  kc.ordinal_position,
  ccu.table_name                                 AS referenced_table,
  ccu.column_name                                AS referenced_column,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kc
  ON  tc.constraint_name  = kc.constraint_name
  AND tc.table_schema     = kc.table_schema
JOIN information_schema.referential_constraints rc
  ON  tc.constraint_name  = rc.constraint_name
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
ORDER BY tc.table_name, tc.constraint_name, kc.ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- S7  CHECK CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S7_check_constraints'                         AS section,
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
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
ORDER BY tc.table_name, tc.constraint_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- S8  INDEXES
--     Includes partial-index predicates and expression-index definitions.
--     Required to verify whether the active-job partial unique index and
--     all other performance indexes exist in the live catalogue.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S8_indexes'                                   AS section,
  t.relname                                      AS table_name,
  i.relname                                      AS index_name,
  ix.indisunique                                 AS is_unique,
  ix.indisprimary                                AS is_primary,
  (ix.indpred IS NOT NULL)                       AS is_partial,
  pg_get_expr(ix.indpred,  ix.indrelid)          AS partial_predicate,
  pg_get_expr(ix.indexprs, ix.indrelid)          AS expression,
  array_to_string(
    array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)),
    ', '
  )                                              AS columns,
  am.amname                                      AS index_method
FROM pg_class     t
JOIN pg_index     ix ON t.oid          = ix.indrelid
JOIN pg_class     i  ON i.oid          = ix.indexrelid
JOIN pg_namespace n  ON t.relnamespace = n.oid
JOIN pg_am        am ON i.relam        = am.oid
LEFT JOIN pg_attribute a
  ON  a.attrelid = t.oid
  AND a.attnum   = ANY(ix.indkey)
  AND a.attnum   > 0
WHERE n.nspname  = 'public'
  AND t.relname IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
  AND t.relkind  = 'r'
GROUP BY
  t.relname, i.relname,
  ix.indisunique, ix.indisprimary,
  ix.indpred, ix.indexprs, ix.indrelid,
  am.amname
ORDER BY t.relname, i.relname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S9  TRIGGERS (information_schema)
--     Returns triggers visible in information_schema.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S9_triggers'                                  AS section,
  trigger_name,
  event_object_table                             AS table_name,
  event_manipulation,
  action_timing,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema       = 'public'
  AND event_object_table IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
ORDER BY event_object_table, trigger_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- S9B TRIGGERS (pg_trigger)
--     Supplements S9 to expose constraint triggers and deferred triggers
--     not always visible in information_schema, including the deferred
--     constraint trigger trg_check_ledger_binding from the proposed migration.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S9b_pg_triggers'                              AS section,
  c.relname                                      AS table_name,
  t.tgname                                       AS trigger_name,
  t.tgtype,
  t.tgenabled,
  (t.tgconstraint > 0)                           AS is_constraint_trigger,
  t.tgdeferrable,
  t.tginitdeferred,
  p.proname                                      AS trigger_function
FROM pg_trigger   t
JOIN pg_class     c ON c.oid  = t.tgrelid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc      p ON p.oid  = t.tgfoid
WHERE n.nspname  = 'public'
  AND c.relname IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S10 RLS STATUS AND TABLE OWNERSHIP
--     Confirms whether RLS is enabled and forced on each approved table,
--     and identifies the table owner role.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S10_rls_status'                               AS section,
  c.relname                                      AS table_name,
  c.relrowsecurity                               AS rls_enabled,
  c.relforcerowsecurity                          AS rls_forced,
  r.rolname                                      AS table_owner
FROM pg_class     c
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_roles     r ON c.relowner     = r.oid
WHERE n.nspname  = 'public'
  AND c.relname IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
  AND c.relkind  = 'r'
ORDER BY c.relname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S11 RLS POLICIES — PUBLIC SCHEMA TABLES
--     Returns the full USING and WITH CHECK expressions for every policy.
--     permissive column distinguishes PERMISSIVE (PERMISSIVE) from
--     RESTRICTIVE policies. Critical for verifying the storage deny policies.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S11_rls_policies'                             AS section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
ORDER BY tablename, policyname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S12 TABLE PRIVILEGES
--     Privileges granted to the four roles that matter for MoLis:
--     anon, authenticated, service_role, postgres (and PUBLIC).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S12_table_privileges'                         AS section,
  grantee,
  table_name,
  privilege_type,
  is_grantable
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
    'PUBLIC',
    'anon',
    'authenticated',
    'service_role',
    'postgres'
  )
ORDER BY table_name, grantee, privilege_type;


-- ─────────────────────────────────────────────────────────────────────────────
-- S13 FUNCTION CATALOGUE
--     Existence, signature, return type, SECURITY DEFINER status, and
--     GUC settings (search_path) for every function the migration defines.
--     Functions absent from this result do not yet exist in the live database.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S13_function_catalogue'                       AS section,
  n.nspname                                      AS schema_name,
  p.proname                                      AS function_name,
  pg_get_function_identity_arguments(p.oid)      AS arguments,
  pg_get_function_result(p.oid)                  AS return_type,
  r.rolname                                      AS owner,
  p.prosecdef                                    AS security_definer,
  p.proconfig                                    AS guc_settings,
  p.provolatile                                  AS volatility,
  p.proleakproof                                 AS leak_proof
FROM pg_proc      p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_roles     r ON p.proowner     = r.oid
WHERE n.nspname  = 'public'
  AND p.proname  IN (
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
ORDER BY p.proname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S14 FUNCTION EXECUTE PRIVILEGES
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S14_function_execute_grants'                  AS section,
  grantee,
  routine_schema,
  routine_name,
  privilege_type,
  is_grantable
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
ORDER BY routine_name, grantee;


-- ─────────────────────────────────────────────────────────────────────────────
-- S15 VIEWS
--     Checks whether generation_jobs_owner_view or any replacement view
--     exists. The proposed migration drops generation_jobs_owner_view.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S15_views'                                    AS section,
  schemaname,
  viewname,
  viewowner,
  definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'generation_jobs_owner_view',
    'generation_jobs_safe_view',
    'generation_jobs_view'
  )
ORDER BY viewname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S16 CUSTOM ENUM TYPES
--     Returns all enum values for job-related types. The proposed migration
--     may CREATE TYPE or ADD VALUE to existing enum types; this section
--     shows exactly what values are already present.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S16_enum_types'                               AS section,
  n.nspname                                      AS schema_name,
  t.typname                                      AS type_name,
  e.enumsortorder,
  e.enumlabel                                    AS enum_value
FROM pg_type      t
JOIN pg_namespace n ON t.typnamespace = n.oid
JOIN pg_enum      e ON t.oid          = e.enumtypid
WHERE n.nspname  = 'public'
  AND t.typname  IN (
    'job_status',
    'job_type',
    'request_classification',
    'visual_status',
    'job_status_enum',
    'generation_job_status'
  )
ORDER BY t.typname, e.enumsortorder;


-- ─────────────────────────────────────────────────────────────────────────────
-- S17 EXTENSIONS
--     Checks for cryptographic (pgcrypto) and UUID (uuid-ossp) extensions
--     required by the migration's digest() and gen_random_uuid() calls.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S17_extensions'                               AS section,
  extname,
  extversion,
  extrelocatable
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
ORDER BY extname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S18 STORAGE — study-visuals BUCKET
--     Returns the bucket row from storage.buckets.
--     public = false is required. file_size_limit and allowed_mime_types
--     are inspected for any restrictions relevant to the migration.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S18_storage_bucket'                           AS section,
  id,
  name,
  owner,
  public,
  avif_autodetection,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
FROM storage.buckets
WHERE id   = 'study-visuals'
   OR name = 'study-visuals';


-- ─────────────────────────────────────────────────────────────────────────────
-- S19 STORAGE — ALL POLICIES ON storage.objects
--     Returns every policy (permissive AND restrictive) on storage.objects
--     for all roles. The full USING and WITH CHECK expressions are required
--     to verify whether the RESTRICTIVE deny policies from the proposed
--     migration are already present in the live catalogue.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S19_storage_object_policies'                  AS section,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename  = 'objects'
ORDER BY policyname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S20 STORAGE — storage.objects RLS STATUS
--     Confirms RLS is enabled and not forced on storage.objects.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S20_storage_objects_rls'                      AS section,
  c.relname                                      AS table_name,
  c.relrowsecurity                               AS rls_enabled,
  c.relforcerowsecurity                          AS rls_forced,
  r.rolname                                      AS table_owner
FROM pg_class     c
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_roles     r ON c.relowner     = r.oid
WHERE n.nspname  = 'storage'
  AND c.relname  = 'objects'
  AND c.relkind  = 'r';


-- ─────────────────────────────────────────────────────────────────────────────
-- S21 generation_job_requests EXISTENCE
--     Explicit YES/NO answer so the migration author knows whether the table
--     must be created from scratch or already has rows that need preserving.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S21_job_requests_exists'                      AS section,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = 'generation_job_requests'
    )
    THEN 'YES — table already exists in the live catalogue'
    ELSE 'NO  — table does not exist; migration will CREATE it'
  END                                            AS generation_job_requests_present;


-- ─────────────────────────────────────────────────────────────────────────────
-- S22 pg_constraint — COMPLETE CONSTRAINT CATALOGUE
--     Supplements information_schema with exact contype codes and
--     deferrable / deferred status. Catches exclusion constraints and
--     constraint triggers not visible in information_schema.
--     contype legend: p=primary key  u=unique  f=foreign key
--                     c=check        x=exclusion  t=trigger
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S22_pg_constraints'                           AS section,
  c.relname                                      AS table_name,
  con.conname                                    AS constraint_name,
  con.contype                                    AS constraint_type,
  con.condeferrable,
  con.condeferred,
  pg_get_constraintdef(con.oid, true)            AS constraint_definition
FROM pg_constraint con
JOIN pg_class      c ON c.oid = con.conrelid
JOIN pg_namespace  n ON n.oid = c.relnamespace
WHERE n.nspname  = 'public'
  AND c.relname IN (
    'documents',
    'document_analysis',
    'study_visuals',
    'generation_jobs',
    'generation_job_requests'
  )
ORDER BY c.relname, con.conname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S23 SEQUENCES
--     Checks for any sequences associated with the approved tables.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S23_sequences'                                AS section,
  sequence_schema,
  sequence_name,
  data_type,
  start_value,
  minimum_value,
  maximum_value,
  increment,
  cycle_option
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- S24 study_visuals COLUMN LIST
--     Confirms the JSONB visuals column exists and shows the full table
--     structure. No row content is selected.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S24_study_visuals_columns'                    AS section,
  column_name,
  ordinal_position,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'study_visuals'
ORDER BY ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- S25 FUNCTION BODIES — LIVE SOURCE
--     Returns the PL/pgSQL source of each function currently deployed.
--     Used to compare the live implementation against the proposed migration
--     and identify which functions will be replaced vs newly created.
--     No application logic is executed; prosrc is a catalogue column.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S25_function_source'                          AS section,
  p.proname                                      AS function_name,
  pg_get_function_identity_arguments(p.oid)      AS arguments,
  p.prosrc                                       AS source_body
FROM pg_proc      p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname  = 'public'
  AND p.proname  IN (
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
ORDER BY p.proname;


-- ─────────────────────────────────────────────────────────────────────────────
-- S26 SCHEMA SIZE SUMMARY
--     Sanity check: counts of tables, views, and functions in public schema.
--     Helps detect unexpected additions since the prior inspection baseline.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S26_schema_summary'                           AS section,
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type   = 'BASE TABLE'
  )                                              AS public_table_count,
  (
    SELECT count(*)
    FROM information_schema.views
    WHERE table_schema = 'public'
  )                                              AS public_view_count,
  (
    SELECT count(*)
    FROM information_schema.routines
    WHERE routine_schema = 'public'
  )                                              AS public_function_count;


-- ─────────────────────────────────────────────────────────────────────────────
-- S27 FINAL READ-ONLY VERIFICATION
--     Re-reads transaction_read_only immediately before ROLLBACK.
--     Confirms the transaction mode was not changed at any point.
--     ROLLBACK is a no-op (no writes occurred) but is required by the
--     approved inspection protocol.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'S27_final_verification'                       AS section,
  current_setting('transaction_read_only')       AS transaction_read_only_at_end,
  'ROLLBACK follows — confirms read-only mode; no writes executed'
                                                 AS note;


ROLLBACK;

-- =============================================================================
-- END OF D11 READ-ONLY CATALOGUE INSPECTION SCRIPT
-- =============================================================================
