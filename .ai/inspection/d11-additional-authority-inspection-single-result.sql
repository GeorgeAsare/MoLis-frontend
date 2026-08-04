-- =============================================================================
-- D11 Additional Read-Only Authority Inspection — Single Result
-- MoLis Intelligence / molis-frontend
-- File: .ai/inspection/d11-additional-authority-inspection-single-result.sql
-- Created: 2026-07-31
--
-- Purpose
-- -------
-- Covers catalogue gaps identified by the Database Architect in Section 10 of
-- .ai/reviews/beta-foundation-v1-d11-catalogue-reconciliation.md:
--   1. All 5 public routines (no name filter): identity, source, arguments,
--      EXECUTE grants (all grantees), object dependencies, dependents.
--   2. Table and column privileges on documents, document_analysis,
--      generation_jobs, study_visuals, storage.objects — no role allowlist.
--   3. Schema privileges (public, storage, auth), default privileges,
--      custom roles, role memberships, superuser/login/BYPASSRLS attributes.
--   4. Proposed Round 5 object drift check.
--   5. Migration history manifest (supabase_migrations.schema_migrations).
--
-- Safety
-- ------
-- Wrapped in BEGIN TRANSACTION READ ONLY … ROLLBACK.
-- Contains only SELECT and catalogue-function calls.
-- Does NOT read student rows, Storage objects, or application data.
--
-- Output schema
-- -------------
-- (section TEXT, object_name TEXT, detail_type TEXT, details JSONB)
-- Ordered by section, object_name, detail_type.
-- All sections use two-digit numbers (SA00–SA18) for correct sort order.
--
-- Compatibility
-- -------------
-- aclexplode with COALESCE(col, '{}'::aclitem[]) avoids acldefault() so the
-- script runs on PostgreSQL 15 through 17.  Functions with proacl IS NULL
-- have implicit PUBLIC EXECUTE by default; SA04 will return 0 rows for such
-- functions (the proacl_raw column in SA01 confirms the NULL).
-- pg_auth_members columns: only admin_option is used (PG14+).
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH

-- ============================================================
-- SA00  Environment and read-only safety verification
-- ============================================================
sa00 AS (
  SELECT
    'SA00_env_verification'::text                AS section,
    'environment'::text                           AS object_name,
    'env'::text                                   AS detail_type,
    jsonb_build_object(
      'current_database',      current_database(),
      'current_user',          current_user,
      'session_user',          session_user,
      'pg_version',            version(),
      'transaction_read_only', current_setting('transaction_read_only'),
      'inspection_timestamp',  now()::text,
      'inspection_file',       'd11-additional-authority-inspection-single-result.sql'
    )                                             AS details
),

-- ============================================================
-- SA01  All public routines — identity and security attributes
--       (no name filter — captures all 5 functions)
-- ============================================================
sa01 AS (
  SELECT
    'SA01_all_public_routines'::text                                                  AS section,
    n.nspname || '.' || p.proname
      || '(' || pg_get_function_identity_arguments(p.oid) || ')'                     AS object_name,
    'routine_identity'::text                                                           AS detail_type,
    jsonb_build_object(
      'oid',                p.oid::text,
      'proname',            p.proname,
      'prokind',            p.prokind,
      'pronargs',           p.pronargs,
      'language',           l.lanname,
      'owner',              r.rolname,
      'return_type',        pg_get_function_result(p.oid),
      'full_arguments',     pg_get_function_arguments(p.oid),
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'volatility',         p.provolatile,
      'parallel',           p.proparallel,
      'security_definer',   p.prosecdef,
      'leakproof',          p.proleakproof,
      'strict',             p.proisstrict,
      'cost',               p.procost,
      'rows',               p.prorows,
      'proconfig',          p.proconfig::text,
      'proacl_raw',         p.proacl::text,
      'proacl_is_null',     (p.proacl IS NULL)
    )                                                                                  AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language  l ON l.oid = p.prolang
  JOIN pg_roles     r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
),

-- ============================================================
-- SA02  All public routines — full source
--       prosrc = raw body; full_definition = complete DDL via pg_get_functiondef
-- ============================================================
sa02 AS (
  SELECT
    'SA02_routine_source'::text                                                        AS section,
    n.nspname || '.' || p.proname
      || '(' || pg_get_function_identity_arguments(p.oid) || ')'                     AS object_name,
    'routine_source'::text                                                             AS detail_type,
    jsonb_build_object(
      'proname',         p.proname,
      'prokind',         p.prokind,
      'prosrc',          p.prosrc,
      'full_definition', pg_get_functiondef(p.oid)
    )                                                                                  AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),

-- ============================================================
-- SA03  All public routines — argument details
-- ============================================================
sa03 AS (
  SELECT
    'SA03_routine_arguments'::text                                                     AS section,
    n.nspname || '.' || p.proname
      || '(' || pg_get_function_identity_arguments(p.oid) || ')'                     AS object_name,
    'routine_arguments'::text                                                          AS detail_type,
    jsonb_build_object(
      'proname',          p.proname,
      'pronargs',         p.pronargs,
      'proargnames',      p.proargnames::text,
      'proargtypes',      p.proargtypes::text,
      'proallargtypes',   p.proallargtypes::text,
      'proargmodes',      p.proargmodes::text,
      'pronargdefaults',  p.pronargdefaults,
      'proargdefaults',   pg_get_expr(p.proargdefaults, 0)
    )                                                                                  AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),

-- ============================================================
-- SA04  All public routines — EXECUTE grants (all grantees)
--
--       Uses COALESCE(proacl, '{}'::aclitem[]) — compatible with PG15+.
--       A function with proacl IS NULL has 0 rows here; that means no
--       explicit ACL — PostgreSQL applies default PUBLIC EXECUTE.
--       SA01.proacl_is_null = true confirms this case.
-- ============================================================
sa04 AS (
  SELECT
    'SA04_routine_execute_grants'::text                                                AS section,
    n.nspname || '.' || p.proname
      || '(' || pg_get_function_identity_arguments(p.oid) || ')'                     AS object_name,
    'execute_grant'::text                                                              AS detail_type,
    jsonb_build_object(
      'proname',        p.proname,
      'grantor',        pg_get_userbyid(acl.grantor),
      'grantee',        COALESCE(pg_get_userbyid(acl.grantee), 'PUBLIC'),
      'privilege_type', acl.privilege_type,
      'is_grantable',   acl.is_grantable
    )                                                                                  AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(p.proacl, '{}'::aclitem[])
  ) AS acl(grantor, grantee, privilege_type, is_grantable)
  WHERE n.nspname = 'public'
),

-- ============================================================
-- SA05  Public routine dependencies — what each routine references
-- ============================================================
sa05 AS (
  SELECT
    'SA05_routine_dependencies'::text                                                  AS section,
    n.nspname || '.' || p.proname
      || '(' || pg_get_function_identity_arguments(p.oid) || ')'                     AS object_name,
    'dependency'::text                                                                 AS detail_type,
    jsonb_build_object(
      'proname',          p.proname,
      'dep_type',         d.deptype,
      'ref_classid',      d.refclassid::regclass::text,
      'ref_objid',        d.refobjid::text,
      'ref_objsubid',     d.refobjsubid,
      'ref_object_name',  CASE
        WHEN d.refclassid = 'pg_class'::regclass
          THEN (SELECT n2.nspname || '.' || c2.relname
                FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
                WHERE c2.oid = d.refobjid)
        WHEN d.refclassid = 'pg_type'::regclass
          THEN (SELECT typname FROM pg_type WHERE oid = d.refobjid)
        WHEN d.refclassid = 'pg_proc'::regclass
          THEN (SELECT proname FROM pg_proc WHERE oid = d.refobjid)
        WHEN d.refclassid = 'pg_namespace'::regclass
          THEN (SELECT nspname FROM pg_namespace WHERE oid = d.refobjid)
        ELSE d.refobjid::text
      END
    )                                                                                  AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_depend    d ON d.classid  = 'pg_proc'::regclass AND d.objid = p.oid
  WHERE n.nspname = 'public'
    AND d.deptype <> 'p'
),

-- ============================================================
-- SA06  What references public routines (dependents e.g. triggers)
-- ============================================================
sa06 AS (
  SELECT
    'SA06_routine_dependents'::text                                                    AS section,
    n.nspname || '.' || p.proname
      || '(' || pg_get_function_identity_arguments(p.oid) || ')'                     AS object_name,
    'dependent'::text                                                                  AS detail_type,
    jsonb_build_object(
      'proname',         p.proname,
      'dep_type',        d.deptype,
      'dep_classid',     d.classid::regclass::text,
      'dep_objid',       d.objid::text,
      'dep_objsubid',    d.objsubid,
      'dep_object_name', CASE
        WHEN d.classid = 'pg_class'::regclass
          THEN (SELECT n2.nspname || '.' || c2.relname
                FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
                WHERE c2.oid = d.objid)
        WHEN d.classid = 'pg_trigger'::regclass
          THEN (SELECT tg.tgname || ' on '
                       || (SELECT relname FROM pg_class WHERE oid = tg.tgrelid)
                FROM pg_trigger tg WHERE tg.oid = d.objid)
        WHEN d.classid = 'pg_constraint'::regclass
          THEN (SELECT conname FROM pg_constraint WHERE oid = d.objid)
        ELSE d.objid::text
      END
    )                                                                                  AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_depend    d ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid
  WHERE n.nspname = 'public'
    AND d.deptype <> 'p'
),

-- ============================================================
-- SA07  Table-level privileges — target public tables (all grantees)
--       No five-role allowlist; every explicit ACL entry is returned.
-- ============================================================
sa07 AS (
  SELECT
    'SA07_table_privileges'::text                                                      AS section,
    n.nspname || '.' || c.relname                                                     AS object_name,
    'table_privilege'::text                                                            AS detail_type,
    jsonb_build_object(
      'table_schema',   n.nspname,
      'table_name',     c.relname,
      'table_owner',    pg_get_userbyid(c.relowner),
      'relacl_raw',     c.relacl::text,
      'relacl_is_null', (c.relacl IS NULL),
      'grantor',        pg_get_userbyid(acl.grantor),
      'grantee',        COALESCE(pg_get_userbyid(acl.grantee), 'PUBLIC'),
      'privilege_type', acl.privilege_type,
      'is_grantable',   acl.is_grantable
    )                                                                                  AS details
  FROM pg_class     c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(c.relacl, '{}'::aclitem[])
  ) AS acl(grantor, grantee, privilege_type, is_grantable)
  WHERE n.nspname = 'public'
    AND c.relname IN ('documents', 'document_analysis', 'generation_jobs', 'study_visuals')
    AND c.relkind IN ('r', 'v', 'f', 'p')
),

-- ============================================================
-- SA08  Table-level privileges — storage.objects (all grantees)
-- ============================================================
sa08 AS (
  SELECT
    'SA08_storage_objects_privileges'::text                                            AS section,
    n.nspname || '.' || c.relname                                                     AS object_name,
    'storage_table_privilege'::text                                                    AS detail_type,
    jsonb_build_object(
      'table_schema',   n.nspname,
      'table_name',     c.relname,
      'table_owner',    pg_get_userbyid(c.relowner),
      'relacl_raw',     c.relacl::text,
      'relacl_is_null', (c.relacl IS NULL),
      'grantor',        pg_get_userbyid(acl.grantor),
      'grantee',        COALESCE(pg_get_userbyid(acl.grantee), 'PUBLIC'),
      'privilege_type', acl.privilege_type,
      'is_grantable',   acl.is_grantable
    )                                                                                  AS details
  FROM pg_class     c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(c.relacl, '{}'::aclitem[])
  ) AS acl(grantor, grantee, privilege_type, is_grantable)
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects'
    AND c.relkind IN ('r', 'v', 'f', 'p')
),

-- ============================================================
-- SA09  Column-level privileges on target tables
--       NULL attacl means no explicit column-level grants (falls back to
--       table-level ACL); those columns produce 0 rows here.
-- ============================================================
sa09 AS (
  SELECT
    'SA09_column_privileges'::text                                                     AS section,
    n.nspname || '.' || c.relname || '.' || a.attname                                AS object_name,
    'column_privilege'::text                                                           AS detail_type,
    jsonb_build_object(
      'table_schema',   n.nspname,
      'table_name',     c.relname,
      'column_name',    a.attname,
      'attacl_raw',     a.attacl::text,
      'grantor',        pg_get_userbyid(acl.grantor),
      'grantee',        COALESCE(pg_get_userbyid(acl.grantee), 'PUBLIC'),
      'privilege_type', acl.privilege_type,
      'is_grantable',   acl.is_grantable
    )                                                                                  AS details
  FROM pg_class     c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN LATERAL aclexplode(
    COALESCE(a.attacl, '{}'::aclitem[])
  ) AS acl(grantor, grantee, privilege_type, is_grantable)
  WHERE (
      (n.nspname = 'public' AND c.relname IN ('documents', 'document_analysis', 'generation_jobs', 'study_visuals'))
      OR (n.nspname = 'storage' AND c.relname = 'objects')
    )
    AND c.relkind IN ('r', 'v', 'f', 'p')
    AND a.attacl IS NOT NULL
),

-- ============================================================
-- SA10  Schema privileges — public, storage, auth
-- ============================================================
sa10 AS (
  SELECT
    'SA10_schema_privileges'::text                                                     AS section,
    n.nspname                                                                          AS object_name,
    'schema_privilege'::text                                                           AS detail_type,
    jsonb_build_object(
      'schema_name',    n.nspname,
      'schema_owner',   pg_get_userbyid(n.nspowner),
      'nspacl_raw',     n.nspacl::text,
      'nspacl_is_null', (n.nspacl IS NULL),
      'grantor',        pg_get_userbyid(acl.grantor),
      'grantee',        COALESCE(pg_get_userbyid(acl.grantee), 'PUBLIC'),
      'privilege_type', acl.privilege_type,
      'is_grantable',   acl.is_grantable
    )                                                                                  AS details
  FROM pg_namespace n
  CROSS JOIN LATERAL aclexplode(
    COALESCE(n.nspacl, '{}'::aclitem[])
  ) AS acl(grantor, grantee, privilege_type, is_grantable)
  WHERE n.nspname IN ('public', 'storage', 'auth')
),

-- ============================================================
-- SA11  Default privileges (pg_default_acl — all schemas)
-- ============================================================
sa11 AS (
  SELECT
    'SA11_default_privileges'::text                                                    AS section,
    pg_get_userbyid(d.defaclrole)
      || '/' || COALESCE(ns.nspname, '<all_schemas>')
      || '/' || CASE d.defaclobjtype
                  WHEN 'r' THEN 'TABLE'
                  WHEN 'S' THEN 'SEQUENCE'
                  WHEN 'f' THEN 'FUNCTION'
                  WHEN 'T' THEN 'TYPE'
                  WHEN 'n' THEN 'SCHEMA'
                  ELSE d.defaclobjtype::text
                END                                                                    AS object_name,
    'default_privilege'::text                                                          AS detail_type,
    jsonb_build_object(
      'defaclrole',      pg_get_userbyid(d.defaclrole),
      'defaclnamespace', COALESCE(ns.nspname, '<all_schemas>'),
      'defaclobjtype',   d.defaclobjtype::text,
      'defaclacl_raw',   d.defaclacl::text,
      'grantor',         pg_get_userbyid(acl.grantor),
      'grantee',         COALESCE(pg_get_userbyid(acl.grantee), 'PUBLIC'),
      'privilege_type',  acl.privilege_type,
      'is_grantable',    acl.is_grantable
    )                                                                                  AS details
  FROM pg_default_acl d
  LEFT JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(d.defaclacl, '{}'::aclitem[])
  ) AS acl(grantor, grantee, privilege_type, is_grantable)
),

-- ============================================================
-- SA12  All non-system roles — security attributes
--       Captures every role not prefixed pg_; includes custom roles.
--       BYPASSRLS is shown explicitly (security-critical for RLS bypass).
-- ============================================================
sa12 AS (
  SELECT
    'SA12_role_attributes'::text                                                       AS section,
    r.rolname                                                                          AS object_name,
    'role_attributes'::text                                                            AS detail_type,
    jsonb_build_object(
      'rolname',        r.rolname,
      'oid',            r.oid::text,
      'rolsuper',       r.rolsuper,
      'rolinherit',     r.rolinherit,
      'rolcreaterole',  r.rolcreaterole,
      'rolcreatedb',    r.rolcreatedb,
      'rolcanlogin',    r.rolcanlogin,
      'rolreplication', r.rolreplication,
      'rolbypassrls',   r.rolbypassrls,
      'rolconnlimit',   r.rolconnlimit,
      'rolvaliduntil',  r.rolvaliduntil::text
    )                                                                                  AS details
  FROM pg_roles r
  WHERE r.rolname NOT LIKE 'pg_%'
),

-- ============================================================
-- SA13  Role memberships (pg_auth_members)
--       Uses only admin_option (PG14+).  In PG16+, inherit_option and
--       set_option also exist but are omitted here for PG15 compatibility.
-- ============================================================
sa13 AS (
  SELECT
    'SA13_role_memberships'::text                                                      AS section,
    r.rolname || ' has_member ' || m.rolname                                          AS object_name,
    'role_membership'::text                                                            AS detail_type,
    jsonb_build_object(
      'role',         r.rolname,
      'member',       m.rolname,
      'grantor',      pg_get_userbyid(am.grantor),
      'admin_option', am.admin_option
    )                                                                                  AS details
  FROM pg_auth_members am
  JOIN pg_roles r ON r.oid = am.roleid
  JOIN pg_roles m ON m.oid = am.member
),

-- ============================================================
-- SA14  Functions capable of mutating target tables — source text scan
--       Matches any public function whose definition references target table
--       names or storage.  False positives possible (comments, string literals);
--       treat as a starting inventory for manual review.
-- ============================================================
sa14 AS (
  SELECT
    'SA14_mutation_capable_functions'::text                                            AS section,
    n.nspname || '.' || p.proname
      || '(' || pg_get_function_identity_arguments(p.oid) || ')'                     AS object_name,
    'mutation_scan'::text                                                              AS detail_type,
    jsonb_build_object(
      'proname',                    p.proname,
      'security_definer',           p.prosecdef,
      'refs_generation_jobs',       pg_get_functiondef(p.oid) ILIKE '%generation_jobs%',
      'refs_study_visuals',         pg_get_functiondef(p.oid) ILIKE '%study_visuals%',
      'refs_documents',             pg_get_functiondef(p.oid) ILIKE '%documents%',
      'refs_document_analysis',     pg_get_functiondef(p.oid) ILIKE '%document_analysis%',
      'refs_storage',               pg_get_functiondef(p.oid) ILIKE '%storage%',
      'contains_insert',            pg_get_functiondef(p.oid) ILIKE '%insert%',
      'contains_update',            pg_get_functiondef(p.oid) ILIKE '%update%',
      'contains_delete',            pg_get_functiondef(p.oid) ILIKE '%delete%'
    )                                                                                  AS details
  FROM pg_proc      p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      pg_get_functiondef(p.oid) ILIKE '%generation_jobs%'
      OR pg_get_functiondef(p.oid) ILIKE '%study_visuals%'
      OR pg_get_functiondef(p.oid) ILIKE '%documents%'
      OR pg_get_functiondef(p.oid) ILIKE '%document_analysis%'
      OR pg_get_functiondef(p.oid) ILIKE '%storage%'
    )
),

-- ============================================================
-- SA15  Proposed Round 5 object drift check
--       Reports any public-schema object already named after a proposed
--       Round 5 target.  Returns a sentinel row when none are found.
-- ============================================================
sa15 AS (
  SELECT
    'SA15_proposed_object_drift'::text                                                 AS section,
    n.nspname || '.' || c.relname                                                     AS object_name,
    'drift_detected'::text                                                             AS detail_type,
    jsonb_build_object(
      'schema',     n.nspname,
      'name',       c.relname,
      'relkind',    c.relkind::text,
      'owner',      pg_get_userbyid(c.relowner),
      'relacl_raw', c.relacl::text,
      'note',       'Object already exists in live DB matching a proposed Round 5 name'
    )                                                                                  AS details
  FROM pg_class     c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname IN (
      'generation_source_snapshots',
      'generation_job_ledger',
      'generation_job_requests'
    )
    AND n.nspname = 'public'

  UNION ALL

  SELECT
    'SA15_proposed_object_drift'::text,
    'no_drift_found'::text,
    'drift_absent'::text,
    jsonb_build_object(
      'checked_names', ARRAY[
        'generation_source_snapshots',
        'generation_job_ledger',
        'generation_job_requests'
      ]::text[],
      'note', 'No proposed Round 5 object names found in public schema — expected state before migration'
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM  pg_class     c2
    JOIN  pg_namespace n2 ON n2.oid = c2.relnamespace
    WHERE c2.relname IN (
        'generation_source_snapshots',
        'generation_job_ledger',
        'generation_job_requests'
      )
      AND n2.nspname = 'public'
  )
),

-- ============================================================
-- SA16  Migration history — catalogue-only discovery
--       Does NOT reference supabase_migrations.schema_migrations in a
--       FROM or JOIN clause (relation not confirmed to exist in this project).
--       Instead inspects pg_namespace and pg_class to discover any
--       migration-tracking schema, table, or view, then reports their
--       column definitions from pg_attribute.  Row contents are never read.
-- ============================================================
sa16 AS (
  -- SA16a  Schema existence check: supabase_migrations
  SELECT
    'SA16_migration_history'::text                                                     AS section,
    'supabase_migrations'::text                                                        AS object_name,
    'schema_existence'::text                                                           AS detail_type,
    jsonb_build_object(
      'schema_name',        'supabase_migrations',
      'schema_exists',      (n.oid IS NOT NULL),
      'schema_owner',       CASE WHEN n.oid IS NOT NULL THEN pg_get_userbyid(n.nspowner) ELSE NULL END,
      'nspacl_raw',         CASE WHEN n.oid IS NOT NULL THEN n.nspacl::text ELSE NULL END,
      'to_regclass_result', to_regclass('supabase_migrations.schema_migrations')::text
    )                                                                                  AS details
  FROM (SELECT 1) AS _dummy
  LEFT JOIN pg_namespace n ON n.nspname = 'supabase_migrations'

  UNION ALL

  -- SA16b  Any table or view named schema_migrations in any schema
  SELECT
    'SA16_migration_history'::text                                                     AS section,
    n.nspname || '.' || c.relname                                                     AS object_name,
    'migration_table_found'::text                                                      AS detail_type,
    jsonb_build_object(
      'schema',       n.nspname,
      'name',         c.relname,
      'relkind',      c.relkind::text,
      'owner',        pg_get_userbyid(c.relowner),
      'relacl_raw',   c.relacl::text,
      'column_count', (
        SELECT COUNT(*)
        FROM   pg_attribute a2
        WHERE  a2.attrelid = c.oid AND a2.attnum > 0 AND NOT a2.attisdropped
      )
    )                                                                                  AS details
  FROM pg_class     c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'schema_migrations'
    AND c.relkind IN ('r', 'v', 'f', 'p', 'm')

  UNION ALL

  -- SA16c  Any schema whose name contains 'migration'
  SELECT
    'SA16_migration_history'::text                                                     AS section,
    ns.nspname                                                                         AS object_name,
    'migration_schema'::text                                                           AS detail_type,
    jsonb_build_object(
      'schema_name', ns.nspname,
      'owner',       pg_get_userbyid(ns.nspowner),
      'nspacl_raw',  ns.nspacl::text
    )                                                                                  AS details
  FROM pg_namespace ns
  WHERE ns.nspname ILIKE '%migration%'

  UNION ALL

  -- SA16d  Any table or view (excluding schema_migrations, captured in SA16b)
  --        whose name contains 'migration'
  SELECT
    'SA16_migration_history'::text                                                     AS section,
    n.nspname || '.' || c.relname                                                     AS object_name,
    'migration_related_object'::text                                                   AS detail_type,
    jsonb_build_object(
      'schema',     n.nspname,
      'name',       c.relname,
      'relkind',    c.relkind::text,
      'owner',      pg_get_userbyid(c.relowner),
      'relacl_raw', c.relacl::text
    )                                                                                  AS details
  FROM pg_class     c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname ILIKE '%migration%'
    AND c.relname <> 'schema_migrations'
    AND c.relkind IN ('r', 'v', 'f', 'p', 'm')

  UNION ALL

  -- SA16e  Column metadata for any discovered schema_migrations table or view
  --        Row contents are not queried — catalogue only.
  SELECT
    'SA16_migration_history'::text                                                     AS section,
    n.nspname || '.' || c.relname || '.' || a.attname                                AS object_name,
    'migration_table_column'::text                                                     AS detail_type,
    jsonb_build_object(
      'schema',      n.nspname,
      'table_name',  c.relname,
      'column_name', a.attname,
      'attnum',      a.attnum,
      'data_type',   t.typname,
      'notnull',     a.attnotnull,
      'col_default',  CASE
                        WHEN ad.adbin IS NOT NULL
                        THEN pg_get_expr(ad.adbin, ad.adrelid)
                        ELSE NULL
                      END
    )                                                                                  AS details
  FROM pg_class     c
  JOIN pg_namespace n   ON n.oid    = c.relnamespace
  JOIN pg_attribute a   ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_type      t   ON t.oid    = a.atttypid
  LEFT JOIN pg_attrdef  ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
  WHERE c.relname = 'schema_migrations'
    AND c.relkind IN ('r', 'v', 'f', 'p', 'm')
),

-- ============================================================
-- SA17  Summary counts
-- ============================================================
sa17 AS (
  SELECT
    'SA17_summary_counts'::text                                                        AS section,
    'counts'::text                                                                     AS object_name,
    'summary'::text                                                                    AS detail_type,
    jsonb_build_object(
      'public_function_count',  (
        SELECT COUNT(*)
        FROM   pg_proc p2
        JOIN   pg_namespace n2 ON n2.oid = p2.pronamespace
        WHERE  n2.nspname = 'public'
      ),
      'non_system_role_count',  (
        SELECT COUNT(*) FROM pg_roles WHERE rolname NOT LIKE 'pg_%'
      ),
      'role_membership_count',  (
        SELECT COUNT(*) FROM pg_auth_members
      ),
      'default_acl_count',      (
        SELECT COUNT(*) FROM pg_default_acl
      ),
      'migration_table_exists', (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)
    )                                                                                  AS details
),

-- ============================================================
-- SA18  Final read-only verification
-- ============================================================
sa18 AS (
  SELECT
    'SA18_final_verification'::text                                                    AS section,
    'transaction_verification'::text                                                   AS object_name,
    'verification'::text                                                               AS detail_type,
    jsonb_build_object(
      'current_database',      current_database(),
      'transaction_read_only', current_setting('transaction_read_only'),
      'note',                  'ROLLBACK follows — no data was modified by this inspection'
    )                                                                                  AS details
)

-- ============================================================
-- Single unified result grid
-- ============================================================
SELECT section, object_name, detail_type, details
FROM (
  SELECT * FROM sa00
  UNION ALL SELECT * FROM sa01
  UNION ALL SELECT * FROM sa02
  UNION ALL SELECT * FROM sa03
  UNION ALL SELECT * FROM sa04
  UNION ALL SELECT * FROM sa05
  UNION ALL SELECT * FROM sa06
  UNION ALL SELECT * FROM sa07
  UNION ALL SELECT * FROM sa08
  UNION ALL SELECT * FROM sa09
  UNION ALL SELECT * FROM sa10
  UNION ALL SELECT * FROM sa11
  UNION ALL SELECT * FROM sa12
  UNION ALL SELECT * FROM sa13
  UNION ALL SELECT * FROM sa14
  UNION ALL SELECT * FROM sa15
  UNION ALL SELECT * FROM sa16
  UNION ALL SELECT * FROM sa17
  UNION ALL SELECT * FROM sa18
) all_sections
ORDER BY section, object_name, detail_type;

ROLLBACK;
