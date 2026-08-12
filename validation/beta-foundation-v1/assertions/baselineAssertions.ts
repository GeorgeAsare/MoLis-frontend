// VALIDATION ONLY — never import from application code
//
// Executable baseline assertions for the Beta Foundation V1 validation harness.
// Structured in three stages:
//   Stage 0: Pre-migration (after d11-baseline.sql, before beta_foundation_v1.sql)
//   Stage 1: Post-historical (after beta_foundation_v1.sql, before corrective migration)
//   Stage 2: Post-corrective (after 20260729120001_generation_job_state_machine_schema.sql)
//
// Evidence basis: .ai/inspection/d11-catalogue-results-2026-07-31.csv and
// .ai/inspection/d11-additional-authority-results-2026-07-31.csv
//
// Design contract:
//   - Every function throws an Error with a descriptive message on failure.
//   - No auto-repair logic of any kind.
//   - Fail-closed: a catalogue mismatch is always a hard failure.
//   - Takes a QueryFn — no direct database import or server-only guard here.
//   - The caller (test setup) provides the pg client's query method.

import {
  CORRECTIVE_FUNCTIONS,
  POST_CORRECTIVE_GENERATION_JOBS_INDEXES,
  POST_CORRECTIVE_NEW_TABLES,
  POST_CORRECTIVE_STUDY_VISUALS_NEW_COLUMNS,
  POST_CORRECTIVE_RESTRICTIVE_POLICIES,
  D11_DOCUMENTS_COLUMNS,
  D11_DOCUMENT_ANALYSIS_COLUMNS,
  D11_STUDY_VISUALS_COLUMNS,
  D11_GENERATION_JOBS_BASELINE_COLUMNS,
  D11_TRIGGER_FUNCTIONS,
  D11_TRIGGER_DEPENDANTS,
  D11_STUDY_VISUALS_STORAGE_POLICY_SPECS,
  D11_UNRELATED_STORAGE_POLICY_SPECS,
  D11_PUBLIC_SCHEMA_ACL,
  D11_DOCUMENTS_FK_BEHAVIOR,
  CORRECTIVE_ABSENT_DA_CONSTRAINTS,
  type DefaultAclTuple,
  type ConstraintSpec,
  type IndexSpec,
  type PublicTablePolicySpec,
  D11_DOCUMENTS_CONSTRAINTS,
  D11_DOCUMENT_ANALYSIS_CONSTRAINTS,
  D11_STUDY_VISUALS_CONSTRAINTS,
  D11_GENERATION_JOBS_CONSTRAINTS,
  D11_DOCUMENTS_INDEX_SPECS,
  D11_DOCUMENT_ANALYSIS_INDEX_SPECS,
  D11_STUDY_VISUALS_INDEX_SPECS,
  D11_GENERATION_JOBS_BASELINE_INDEX_SPECS,
  D11_DOCUMENTS_POLICY_SPECS,
  D11_DOCUMENT_ANALYSIS_POLICY_SPECS,
  D11_STUDY_VISUALS_POLICY_SPECS,
  D11_GENERATION_JOBS_BASELINE_POLICY_SPECS,
  D11_TABLE_ACL_TUPLES,
} from '../contract/validationContract'

export type QueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>

// ── ACL comparison helpers ────────────────────────────────────────────────────
//
// Uses aclexplode() — available since PostgreSQL 9.0 — to expand ACL arrays
// into structured (grantee, privilege_type, is_grantable) tuples for exact
// bidirectional comparison. String substring checks are forbidden here because
// they can silently accept supersets, subsets, or near-matches.
//
// grantee='' represents the PUBLIC pseudo-role (OID 0 in pg_authid).

interface AclTuple { grantee: string; privilege_type: string; is_grantable: boolean }

function sortKey(t: AclTuple): string {
  return `${t.grantee}|${t.privilege_type}|${String(t.is_grantable)}`
}

function compareAclTuples(
  actual:   Record<string, unknown>[],
  expected: AclTuple[],
  label:    string,
): void {
  const got = actual
    .map(r => ({
      grantee:        (r['grantee'] as string | null) ?? '',
      privilege_type: r['privilege_type'] as string,
      is_grantable:   r['is_grantable'] as boolean,
    }))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const exp = [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

  if (got.length !== exp.length) {
    throw new Error(
      `[ACL] ${label}: expected ${exp.length} entries, got ${got.length}. ` +
      `Actual: ${JSON.stringify(got)}. Expected: ${JSON.stringify(exp)}.`,
    )
  }
  for (let i = 0; i < exp.length; i++) {
    const g = got[i]!
    const e = exp[i]!
    if (g.grantee !== e.grantee || g.privilege_type !== e.privilege_type || g.is_grantable !== e.is_grantable) {
      throw new Error(
        `[ACL] ${label}: mismatch at index ${i}. ` +
        `Expected (${e.grantee}, ${e.privilege_type}, ${e.is_grantable}) ` +
        `got (${g.grantee}, ${g.privilege_type}, ${g.is_grantable}). ` +
        `Full actual: ${JSON.stringify(got)}.`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0: Pre-migration assertions
// Applied after d11-baseline.sql, before beta_foundation_v1.sql.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. PostgreSQL version ─────────────────────────────────────────────────────

export async function assertPostgresVersion(query: QueryFn): Promise<void> {
  const { rows } = await query('SELECT version() AS v')
  const v = rows[0]?.v as string | undefined
  if (!v?.startsWith('PostgreSQL 17')) {
    throw new Error(
      `[BASELINE] Expected PostgreSQL 17.x — got: ${String(v)}. ` +
      `D11 evidence: PostgreSQL 17.6 on aarch64-unknown-linux-gnu.`,
    )
  }
}

// ── 2. Server encoding ────────────────────────────────────────────────────────

export async function assertUTF8Encoding(query: QueryFn): Promise<void> {
  const { rows } = await query(`SELECT current_setting('server_encoding') AS enc`)
  const enc = rows[0]?.enc as string | undefined
  if (enc !== 'UTF8') {
    throw new Error(
      `[BASELINE] Expected server_encoding=UTF8 — got: ${String(enc)}. ` +
      `The corrective migration hash contract requires UTF-8.`,
    )
  }
}

// ── 3. pgcrypto availability ──────────────────────────────────────────────────

export async function assertPgcryptoAvailable(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`,
  )
  if (rows.length === 0) {
    throw new Error(
      `[BASELINE] pgcrypto extension not found. ` +
      `D11 S17_extensions confirmed pgcrypto 1.3 in schema extensions. ` +
      `The corrective migration requires extensions.digest().`,
    )
  }
}

// ── 4. uuid-ossp availability ─────────────────────────────────────────────────

export async function assertUuidOsspAvailable(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'`,
  )
  if (rows.length === 0) {
    throw new Error(
      `[BASELINE] uuid-ossp extension not found. ` +
      `D11 S17_extensions confirmed uuid-ossp 1.1. ` +
      `UUID defaults use gen_random_uuid() but the extension must be present.`,
    )
  }
}

// ── 5. Public schema owner and ACL ────────────────────────────────────────────
// D11 SA10_schema_privileges: owner=pg_database_owner,
// nspacl={pg_database_owner=UC, =U (public), postgres=U, anon=U, authenticated=U, service_role=U}

export async function assertPublicSchemaOwnerAndAcl(query: QueryFn): Promise<void> {
  // Verify owner
  const { rows: ownerRows } = await query(
    `SELECT nspowner::regrole::text AS owner FROM pg_namespace WHERE nspname = 'public'`,
  )
  if (ownerRows.length === 0) {
    throw new Error('[BASELINE] public schema not found in pg_namespace.')
  }
  const owner = ownerRows[0]?.owner as string
  if (owner !== 'pg_database_owner') {
    throw new Error(
      `[BASELINE] public schema owner expected pg_database_owner — got: ${owner}. ` +
      `D11 SA10 confirmed owner=pg_database_owner.`,
    )
  }

  // Exact ACL comparison via aclexplode. OID 0 = PUBLIC pseudo-role; pg_get_userbyid(0) → NULL.
  // D11 SA10: {pg_database_owner=UC, =U (public), postgres=U, anon=U, authenticated=U, service_role=U}
  const { rows: aclRows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_namespace n,
          LATERAL aclexplode(n.nspacl) e
     WHERE n.nspname = 'public'
     ORDER BY grantee, privilege_type`,
  )
  compareAclTuples(aclRows, D11_PUBLIC_SCHEMA_ACL, 'public schema nspacl (D11 SA10)')
}

// ── 6. Default TABLE ACL — exact bidirectional EXCEPT ALL ─────────────────────
// D11 SA11: postgres/public/TABLE defaclacl={postgres=arwdDxtm, anon=arwdDxtm,
// authenticated=arwdDxtm, service_role=arwdDxtm}

export async function assertDefaultTableAcl(query: QueryFn): Promise<void> {
  // Exact ACL comparison via aclexplode on defaclacl.
  // D11 SA11: {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
  // arwdDxtm = INSERT(a) SELECT(r) UPDATE(w) DELETE(d) TRUNCATE(D) REFERENCES(x) TRIGGER(t) MAINTAIN(m)
  const { rows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_default_acl da
       JOIN pg_namespace n ON n.oid = da.defaclnamespace,
       LATERAL aclexplode(da.defaclacl) e
     WHERE n.nspname = 'public'
       AND da.defaclrole = 'postgres'::regrole
       AND da.defaclobjtype = 'r'
     ORDER BY grantee, privilege_type`,
  )
  if (rows.length === 0) {
    throw new Error(
      '[BASELINE] Default TABLE ACL for postgres/public not found in pg_default_acl. ' +
      'D11 SA11 confirmed {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}.',
    )
  }
  const tablePrivileges = ['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']
  const expectedTableAcl: AclTuple[] = ['anon','authenticated','postgres','service_role'].flatMap(g =>
    tablePrivileges.map(pt => ({ grantee: g, privilege_type: pt, is_grantable: false })),
  )
  compareAclTuples(rows, expectedTableAcl, 'default TABLE ACL postgres/public (D11 SA11)')
}

// ── 7. Default FUNCTION ACL — pre-migration state ────────────────────────────
// D11 SA11 (PRE-migration state): postgres/public/FUNCTION defaclacl=
// {postgres=X, anon=X, authenticated=X, service_role=X}
// Note: the corrective migration changes this to postgres-owner-only (EXCEPT ALL).
// This assertion verifies the PRE-migration state.

export async function assertDefaultFunctionAcl(query: QueryFn): Promise<void> {
  // Exact ACL comparison via aclexplode on defaclacl.
  // D11 SA11 (PRE-migration state): {postgres=X, anon=X, authenticated=X, service_role=X}
  // X = EXECUTE
  const { rows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_default_acl da
       JOIN pg_namespace n ON n.oid = da.defaclnamespace,
       LATERAL aclexplode(da.defaclacl) e
     WHERE n.nspname = 'public'
       AND da.defaclrole = 'postgres'::regrole
       AND da.defaclobjtype = 'f'
     ORDER BY grantee, privilege_type`,
  )
  if (rows.length === 0) {
    throw new Error(
      '[BASELINE] Default FUNCTION ACL for postgres/public not found in pg_default_acl. ' +
      'D11 SA11 confirmed {postgres=X, anon=X, authenticated=X, service_role=X}.',
    )
  }
  const expectedFunctionAcl: AclTuple[] = ['anon','authenticated','postgres','service_role'].map(g => ({
    grantee: g, privilege_type: 'EXECUTE', is_grantable: false,
  }))
  compareAclTuples(rows, expectedFunctionAcl, 'default FUNCTION ACL postgres/public (D11 SA11)')
}

// ── 8. Default SEQUENCE ACL ───────────────────────────────────────────────────
// D11 SA11: postgres/public/SEQUENCE defaclacl={postgres=rwU, anon=rwU,
// authenticated=rwU, service_role=rwU}

export async function assertDefaultSequenceAcl(query: QueryFn): Promise<void> {
  // Exact ACL comparison via aclexplode on defaclacl.
  // D11 SA11: {postgres=rwU, anon=rwU, authenticated=rwU, service_role=rwU}
  // r=SELECT, w=UPDATE, U=USAGE
  const { rows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_default_acl da
       JOIN pg_namespace n ON n.oid = da.defaclnamespace,
       LATERAL aclexplode(da.defaclacl) e
     WHERE n.nspname = 'public'
       AND da.defaclrole = 'postgres'::regrole
       AND da.defaclobjtype = 'S'
     ORDER BY grantee, privilege_type`,
  )
  if (rows.length === 0) {
    throw new Error(
      '[BASELINE] Default SEQUENCE ACL for postgres/public not found in pg_default_acl. ' +
      'D11 SA11 confirmed {postgres=rwU, anon=rwU, authenticated=rwU, service_role=rwU}.',
    )
  }
  const seqPrivileges = ['SELECT','UPDATE','USAGE']
  const expectedSequenceAcl: AclTuple[] = ['anon','authenticated','postgres','service_role'].flatMap(g =>
    seqPrivileges.map(pt => ({ grantee: g, privilege_type: pt, is_grantable: false })),
  )
  compareAclTuples(rows, expectedSequenceAcl, 'default SEQUENCE ACL postgres/public (D11 SA11)')
}

// ── 9. documents baseline column shape ───────────────────────────────────────
// D11 S2_columns: exactly 10 columns in exact ordinal order.
// Canonical fingerprint imported from validationContract.ts (D11_DOCUMENTS_COLUMNS).

export async function assertDocumentsBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name, ordinal_position::int AS ordinal, data_type, is_nullable, udt_name, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'documents'
     ORDER BY ordinal_position`,
  )
  if (rows.length !== D11_DOCUMENTS_COLUMNS.length) {
    throw new Error(
      `[BASELINE] documents has ${rows.length} columns; expected ${D11_DOCUMENTS_COLUMNS.length}. ` +
      `Columns found: ${rows.map(r => r.column_name).join(', ')}. ` +
      `D11 S2_columns confirmed 10-column pre-state.`,
    )
  }
  for (const exp of D11_DOCUMENTS_COLUMNS) {
    const row = rows.find(r => r.column_name === exp.name)
    if (!row) {
      throw new Error(
        `[BASELINE] documents missing expected column: ${exp.name}. D11 S2_columns confirmed.`,
      )
    }
    if (row.ordinal !== exp.ordinal) {
      throw new Error(
        `[BASELINE] documents.${exp.name} ordinal_position expected ${exp.ordinal}; ` +
        `got: ${String(row.ordinal)}. D11 S2_columns confirms exact ordinal.`,
      )
    }
    if (row.data_type !== exp.data_type) {
      throw new Error(
        `[BASELINE] documents.${exp.name} data_type expected "${exp.data_type}"; ` +
        `got: "${String(row.data_type)}".`,
      )
    }
    if (row.is_nullable !== exp.is_nullable) {
      throw new Error(
        `[BASELINE] documents.${exp.name} is_nullable expected ${exp.is_nullable}; ` +
        `got: ${String(row.is_nullable)}.`,
      )
    }
    if (row.udt_name !== exp.udt_name) {
      throw new Error(
        `[BASELINE] documents.${exp.name} udt_name expected ${exp.udt_name}; ` +
        `got: ${String(row.udt_name)}.`,
      )
    }
    const gotDefault = (row.column_default ?? null) as string | null
    if (gotDefault !== exp.column_default) {
      throw new Error(
        `[BASELINE] documents.${exp.name} column_default expected ` +
        `${exp.column_default === null ? 'null' : `"${exp.column_default}"`}; ` +
        `got: ${gotDefault === null ? 'null' : `"${gotDefault}"`}. ` +
        `D11 S2_columns confirmed this default.`,
      )
    }
  }
  // No corrective columns
  const colNames = new Set(rows.map(r => r.column_name as string))
  for (const forbidden of ['updated_at', 'extracted_text_updated_at', 'revision']) {
    if (colNames.has(forbidden)) {
      throw new Error(
        `[BASELINE] documents unexpectedly contains column: ${forbidden}. ` +
        `This column was not present in D11 pre-state.`,
      )
    }
  }
}

// ── 10. document_analysis baseline column shape ───────────────────────────────
// D11 S2_columns: exactly 22 columns in exact ordinal order. No unique(document_id, user_id).
// Canonical fingerprint imported from validationContract.ts (D11_DOCUMENT_ANALYSIS_COLUMNS).

export async function assertDocumentAnalysisBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name, ordinal_position::int AS ordinal, data_type, is_nullable, udt_name, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'document_analysis'
     ORDER BY ordinal_position`,
  )
  if (rows.length !== D11_DOCUMENT_ANALYSIS_COLUMNS.length) {
    throw new Error(
      `[BASELINE] document_analysis has ${rows.length} columns; expected ${D11_DOCUMENT_ANALYSIS_COLUMNS.length}. ` +
      `Columns found: ${rows.map(r => r.column_name).join(', ')}`,
    )
  }
  for (const exp of D11_DOCUMENT_ANALYSIS_COLUMNS) {
    const row = rows.find(r => r.column_name === exp.name)
    if (!row) {
      throw new Error(
        `[BASELINE] document_analysis missing expected column: ${exp.name}. D11 S2_columns confirmed.`,
      )
    }
    if (row.ordinal !== exp.ordinal) {
      throw new Error(
        `[BASELINE] document_analysis.${exp.name} ordinal_position expected ${exp.ordinal}; ` +
        `got: ${String(row.ordinal)}. D11 S2_columns confirms exact ordinal.`,
      )
    }
    if (row.data_type !== exp.data_type) {
      throw new Error(
        `[BASELINE] document_analysis.${exp.name} data_type expected "${exp.data_type}"; ` +
        `got: "${String(row.data_type)}".`,
      )
    }
    if (row.is_nullable !== exp.is_nullable) {
      throw new Error(
        `[BASELINE] document_analysis.${exp.name} is_nullable expected ${exp.is_nullable}; ` +
        `got: ${String(row.is_nullable)}.`,
      )
    }
    if (row.udt_name !== exp.udt_name) {
      throw new Error(
        `[BASELINE] document_analysis.${exp.name} udt_name expected ${exp.udt_name}; ` +
        `got: ${String(row.udt_name)}.`,
      )
    }
    const gotDefault = (row.column_default ?? null) as string | null
    if (gotDefault !== exp.column_default) {
      throw new Error(
        `[BASELINE] document_analysis.${exp.name} column_default expected ` +
        `${exp.column_default === null ? 'null' : `"${exp.column_default}"`}; ` +
        `got: ${gotDefault === null ? 'null' : `"${gotDefault}"`}. ` +
        `D11 S2_columns confirmed this default.`,
      )
    }
  }
  // No unique(document_id, user_id) in pre-state — exact constraint name check
  const { rows: uniqRows } = await query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.document_analysis'::regclass
       AND contype = 'u'
       AND conname = 'document_analysis_document_id_user_id_key'`,
  )
  if (uniqRows.length > 0) {
    throw new Error(
      `[BASELINE] document_analysis has unexpected constraint ` +
      `"document_analysis_document_id_user_id_key". This is added by the corrective migration, ` +
      `not by the D11 baseline.`,
    )
  }
}

// ── 11. documents FK delete behavior ─────────────────────────────────────────
// D11 confirms: user_id ON DELETE CASCADE, subject_id ON DELETE SET NULL,
// source_recording_id ON DELETE SET NULL.

export async function assertDocumentsFkDeleteBehavior(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT conname, confdeltype, confupdtype
     FROM pg_constraint
     WHERE conrelid = 'public.documents'::regclass AND contype = 'f'`,
  )
  const fkMap = new Map(rows.map(r => [
    r.conname as string,
    { del: r.confdeltype as string, upd: r.confupdtype as string },
  ]))
  for (const exp of D11_DOCUMENTS_FK_BEHAVIOR) {
    if (!fkMap.has(exp.conname)) {
      throw new Error(`[BASELINE] documents FK ${exp.conname} not found. D11 confirms this FK.`)
    }
    const got = fkMap.get(exp.conname)!
    if (got.del !== exp.confdeltype) {
      throw new Error(
        `[BASELINE] documents FK ${exp.conname} confdeltype expected "${exp.confdeltype}"; got "${got.del}".`,
      )
    }
    if (got.upd !== exp.confupdtype) {
      throw new Error(
        `[BASELINE] documents FK ${exp.conname} confupdtype expected "${exp.confupdtype}"; got "${got.upd}".`,
      )
    }
  }
}

// ── 12. study_visuals baseline column shape ───────────────────────────────────
// D11 S24_study_visuals_columns: exactly 6 columns.
// Canonical fingerprint imported from validationContract.ts (D11_STUDY_VISUALS_COLUMNS).
// Queries udt_name (not data_type) to match the contract's udt_name field.

export async function assertStudyVisualsBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT
       ordinal_position::int AS ordinal,
       column_name           AS name,
       data_type,
       udt_name,
       is_nullable,
       column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'study_visuals'
     ORDER BY ordinal_position`,
  )
  if (rows.length !== D11_STUDY_VISUALS_COLUMNS.length) {
    throw new Error(
      `[BASELINE] study_visuals has ${rows.length} columns; expected ${D11_STUDY_VISUALS_COLUMNS.length}. ` +
      `D11 S24 confirmed 6-column pre-state. ` +
      `Columns found: ${rows.map(r => r.name).join(', ')}`,
    )
  }
  for (let i = 0; i < D11_STUDY_VISUALS_COLUMNS.length; i++) {
    const exp = D11_STUDY_VISUALS_COLUMNS[i]!
    const got = rows[i]!
    const gotOrdinal = typeof got.ordinal === 'string' ? parseInt(got.ordinal, 10) : Number(got.ordinal)
    if (gotOrdinal !== exp.ordinal || got.name !== exp.name) {
      throw new Error(
        `[BASELINE] study_visuals column at ordinal ${exp.ordinal}: ` +
        `expected name="${exp.name}"; got name="${String(got.name)}" (ordinal ${gotOrdinal}).`,
      )
    }
    if (got.data_type !== exp.data_type) {
      throw new Error(
        `[BASELINE] study_visuals.${exp.name} data_type expected "${exp.data_type}"; got "${String(got.data_type)}".`,
      )
    }
    if (got.udt_name !== exp.udt_name) {
      throw new Error(
        `[BASELINE] study_visuals.${exp.name} udt_name expected "${exp.udt_name}"; got "${String(got.udt_name)}".`,
      )
    }
    if (got.is_nullable !== exp.is_nullable) {
      throw new Error(
        `[BASELINE] study_visuals.${exp.name} is_nullable expected "${exp.is_nullable}"; got "${String(got.is_nullable)}".`,
      )
    }
    const gotDefault = (got.column_default ?? null) as string | null
    if (gotDefault !== exp.column_default) {
      throw new Error(
        `[BASELINE] study_visuals.${exp.name} column_default expected ` +
        `${exp.column_default === null ? 'null' : `"${exp.column_default}"`}; ` +
        `got: ${gotDefault === null ? 'null' : `"${gotDefault}"`}.`,
      )
    }
  }
}

// ── 13. generation_jobs DOES NOT EXIST in pre-migration state ────────────────
// generation_jobs is created by beta_foundation_v1.sql, not before it runs.
// D11 shows it because D11 was taken after the migration was applied.

export async function assertGenerationJobsAbsent(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'generation_jobs'`,
  )
  if (rows.length > 0) {
    throw new Error(
      `[BASELINE] generation_jobs table exists in pre-migration state but must not. ` +
      `generation_jobs is created by beta_foundation_v1.sql, not by the prerequisite fixture. ` +
      `Remove generation_jobs from d11-baseline.sql.`,
    )
  }
}

// ── 14. RLS enabled on non-generation_jobs target tables (pre-migration) ──────
// D11 S10_rls_status: documents, document_analysis, study_visuals all have
// rls_enabled=true, rls_forced=false. (generation_jobs added by beta_foundation_v1.sql)

export async function assertRlsEnabledOnPreMigrationTables(query: QueryFn): Promise<void> {
  const tables = ['documents', 'document_analysis', 'study_visuals']
  for (const tbl of tables) {
    const { rows } = await query(
      `SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
       FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tbl],
    )
    if (rows.length === 0) {
      throw new Error(`[BASELINE] Table public.${tbl} not found in pg_class.`)
    }
    if (!rows[0]?.rls_enabled) {
      throw new Error(
        `[BASELINE] RLS not enabled on public.${tbl}. ` +
        `D11 S10 confirmed rls_enabled=true.`,
      )
    }
    if (rows[0]?.rls_forced) {
      throw new Error(
        `[BASELINE] RLS is force-enabled on public.${tbl}. ` +
        `D11 S10 confirmed rls_forced=false.`,
      )
    }
  }
}

// ── 15. study_visuals baseline RLS policy ────────────────────────────────────
// D11 S11: one permissive FOR ALL TO public with USING and WITH CHECK.

export async function assertStudyVisualsBaselinePolicy(query: QueryFn): Promise<void> {
  await _assertTablePolicies(query, 'study_visuals', D11_STUDY_VISUALS_POLICY_SPECS, 'BASELINE')
}

// ── 16. Five trigger functions present ───────────────────────────────────────
// D11 SA01: exactly 5 public routines, all trigger functions owned by postgres.

export async function assertTriggerFunctions(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT proname
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND p.prorettype = 'trigger'::regtype`,
  )
  const found = new Set(rows.map(r => r.proname as string))
  const expected = new Set(D11_TRIGGER_FUNCTIONS)

  for (const fn of expected) {
    if (!found.has(fn)) {
      throw new Error(
        `[BASELINE] Trigger function public.${fn} not found. ` +
        `D11 SA01 confirmed all 5 trigger functions.`,
      )
    }
  }
  if (found.size !== expected.size) {
    throw new Error(
      `[BASELINE] Expected exactly ${expected.size} trigger functions; ` +
      `found ${found.size}: ${[...found].join(', ')}.`,
    )
  }
}

// ── 17. All trigger dependants present (SA06) ─────────────────────────────────
// D11 SA06 confirmed all 7 trigger instances:
//   validate_document_subject_ownership on documents (BEFORE INSERT OR UPDATE)
//   validate_recording_subject_ownership on recordings (BEFORE INSERT OR UPDATE)
//   set_subjects_updated_at on subjects (BEFORE UPDATE)
//   set_user_profiles_updated_at on user_profiles (BEFORE UPDATE)
//   sync_user_profiles_identity_trigger on user_profiles (BEFORE INSERT)
//   user_profiles_updated_at on user_profiles (BEFORE UPDATE)
//   agent_memories_updated_at on agent_memories (BEFORE UPDATE)

export async function assertAllTriggerDependants(query: QueryFn): Promise<void> {
  for (const t of D11_TRIGGER_DEPENDANTS) {
    const { rows } = await query(
      `SELECT event_manipulation, action_timing, action_orientation
       FROM information_schema.triggers
       WHERE event_object_schema = 'public'
         AND event_object_table = $1
         AND trigger_name = $2`,
      [t.table, t.name],
    )
    const foundEvents = new Set(rows.map(r => r.event_manipulation as string))
    for (const ev of t.events) {
      if (!foundEvents.has(ev)) {
        throw new Error(
          `[BASELINE] Trigger ${t.name} on ${t.table} missing event ${ev}. ` +
          `D11 SA06 confirmed this trigger.`,
        )
      }
    }
    for (const row of rows) {
      if (row.action_timing !== t.timing) {
        throw new Error(
          `[BASELINE] Trigger ${t.name} on ${t.table} action_timing expected ${t.timing}; ` +
          `got: ${String(row.action_timing)}.`,
        )
      }
      if (row.action_orientation !== 'ROW') {
        throw new Error(
          `[BASELINE] Trigger ${t.name} on ${t.table} action_orientation expected ROW; ` +
          `got: ${String(row.action_orientation)}.`,
        )
      }
    }
    if (rows.length === 0) {
      throw new Error(
        `[BASELINE] Trigger ${t.name} on ${t.table} not found. D11 SA06 confirmed this trigger.`,
      )
    }
  }
}

// ── 18. study-visuals storage bucket ─────────────────────────────────────────
// D11 S18: bucket exists, public=true, no file_size_limit, no allowed_mime_types.

export async function assertStudyVisualsBucket(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT id, public, file_size_limit, allowed_mime_types
     FROM storage.buckets WHERE id = 'study-visuals'`,
  )
  if (rows.length === 0) {
    throw new Error(
      `[BASELINE] storage.buckets: study-visuals bucket not found. ` +
      `D11 S18 confirmed bucket exists.`,
    )
  }
  const b = rows[0]
  if (b?.public !== true) {
    throw new Error(
      `[BASELINE] study-visuals bucket expected public=true; got: ${String(b?.public)}. ` +
      `D11 S18 confirmed public=true.`,
    )
  }
  if (b?.file_size_limit !== null) {
    throw new Error(
      `[BASELINE] study-visuals bucket expected file_size_limit=null; got: ${String(b?.file_size_limit)}.`,
    )
  }
  if (b?.allowed_mime_types !== null) {
    throw new Error(
      `[BASELINE] study-visuals bucket expected allowed_mime_types=null; got: ${String(b?.allowed_mime_types)}.`,
    )
  }
}

// ── 19. study-visuals storage policies — exact roles, commands, USING, WITH CHECK ──
// D11 S19: four policies with exact names, commands, USING and WITH CHECK clauses.

export async function assertStudyVisualsStoragePolicies(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT policyname, cmd, permissive, roles::text AS roles, qual AS using_clause, with_check
     FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN (
         'For full customization 137qt67_0',
         'For full customization 137qt67_1',
         'For full customization 137qt67_2',
         'For full customization 137qt67_3'
       )`,
  )

  // Exact 4 policies with exact names, commands, roles, USING, and WITH CHECK.
  // Canonical fingerprints imported from D11_STUDY_VISUALS_STORAGE_POLICY_SPECS.
  const byName = new Map(rows.map(r => [r.policyname as string, r]))

  if (rows.length !== D11_STUDY_VISUALS_STORAGE_POLICY_SPECS.length) {
    throw new Error(
      `[BASELINE] Expected exactly ${D11_STUDY_VISUALS_STORAGE_POLICY_SPECS.length} study-visuals storage policies; ` +
      `found ${rows.length}. D11 S19 confirmed 4 policies.`,
    )
  }

  for (const spec of D11_STUDY_VISUALS_STORAGE_POLICY_SPECS) {
    const row = byName.get(spec.name)
    if (!row) {
      throw new Error(
        `[BASELINE] Storage policy "${spec.name}" not found on storage.objects. ` +
        `D11 S19 confirmed this policy.`,
      )
    }
    if (row.cmd !== spec.cmd) {
      throw new Error(
        `[BASELINE] Storage policy "${spec.name}" cmd expected ${spec.cmd}; got: ${String(row.cmd)}.`,
      )
    }
    if (row.permissive !== 'PERMISSIVE') {
      throw new Error(
        `[BASELINE] Storage policy "${spec.name}" expected PERMISSIVE; got: ${String(row.permissive)}.`,
      )
    }
    const rolesRaw = String(row.roles ?? '{}')
    const rolesArr = rolesRaw === '{}' ? [] : rolesRaw.replace(/^\{|\}$/g, '').split(',')
    if (rolesArr.length !== 1 || rolesArr[0] !== spec.role) {
      throw new Error(
        `[BASELINE] Storage policy "${spec.name}" expected exactly roles={${spec.role}}; ` +
        `got: ${rolesRaw}.`,
      )
    }
    const usingRaw = (row.using_clause ?? null) as string | null
    if (usingRaw !== spec.qual) {
      throw new Error(
        `[BASELINE] Storage policy "${spec.name}" USING clause mismatch. ` +
        `Expected: ${String(spec.qual)}. Got: ${String(usingRaw)}.`,
      )
    }
    const withCheckRaw = (row.with_check ?? null) as string | null
    if (withCheckRaw !== spec.withCheck) {
      throw new Error(
        `[BASELINE] Storage policy "${spec.name}" WITH CHECK clause mismatch. ` +
        `Expected: ${String(spec.withCheck)}. Got: ${String(withCheckRaw)}.`,
      )
    }
  }

  // Verify 7 unrelated storage policies — exact USING/WITH CHECK from D11_UNRELATED_STORAGE_POLICY_SPECS.
  for (const spec of D11_UNRELATED_STORAGE_POLICY_SPECS) {
    const { rows: pr } = await query(
      `SELECT policyname, cmd, permissive, roles::text AS roles, qual AS using_clause, with_check
       FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = $1`,
      [spec.name],
    )
    if (pr.length === 0) {
      throw new Error(
        `[BASELINE] Unrelated storage policy "${spec.name}" is missing. ` +
        `This policy must not be modified by the corrective migration.`,
      )
    }
    const pr0 = pr[0]!
    if (pr0.cmd !== spec.cmd) {
      throw new Error(
        `[BASELINE] Unrelated policy "${spec.name}" cmd expected ${spec.cmd}; got: ${String(pr0.cmd)}.`,
      )
    }
    const usingActual = (pr0.using_clause ?? null) as string | null
    if (usingActual !== spec.qual) {
      throw new Error(
        `[BASELINE] Unrelated policy "${spec.name}" USING clause mismatch. ` +
        `Expected: ${String(spec.qual)}. Got: ${String(usingActual)}.`,
      )
    }
    const withCheckActual = (pr0.with_check ?? null) as string | null
    if (withCheckActual !== spec.withCheck) {
      throw new Error(
        `[BASELINE] Unrelated policy "${spec.name}" WITH CHECK clause mismatch. ` +
        `Expected: ${String(spec.withCheck)}. Got: ${String(withCheckActual)}.`,
      )
    }
  }
}

// ── 20. Corrective objects absent ────────────────────────────────────────────
// Verifies that no objects from the corrective migration exist yet.
// This ensures the fixture produces a clean pre-migration state.
// Covers all known objects introduced by 20260729120001_generation_job_state_machine_schema.sql.

export async function assertCorrectiveObjectsAbsent(query: QueryFn): Promise<void> {
  // Functions added by corrective migration must not exist.
  // Source of truth: CORRECTIVE_FUNCTIONS from validationContract.ts
  for (const fn of CORRECTIVE_FUNCTIONS) {
    const { rows } = await query(
      `SELECT proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1`,
      [fn],
    )
    if (rows.length > 0) {
      throw new Error(
        `[BASELINE] Function public.${fn} exists but must not be present in D11 pre-state. ` +
        `This is a corrective migration object.`,
      )
    }
  }

  // Tables added by corrective migration must not exist
  for (const tbl of POST_CORRECTIVE_NEW_TABLES) {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [tbl],
    )
    if (rows.length > 0) {
      throw new Error(
        `[BASELINE] Table public.${tbl} exists but must not be present in D11 pre-state. ` +
        `This is a corrective migration object.`,
      )
    }
  }

  // Corrective indexes must not exist.
  // Source of truth: POST_CORRECTIVE_GENERATION_JOBS_INDEXES from validationContract.ts
  // Includes: generation_jobs_active_exclusion, generation_jobs_originating_key,
  //           generation_jobs_active_status
  for (const idx of POST_CORRECTIVE_GENERATION_JOBS_INDEXES) {
    const { rows } = await query(
      `SELECT ci.relname AS name
       FROM pg_index    ix
         JOIN pg_class  ci ON ci.oid = ix.indexrelid
         JOIN pg_class  ct ON ct.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = ct.relnamespace
       WHERE n.nspname = 'public' AND ci.relname = $1`,
      [idx],
    )
    if (rows.length > 0) {
      throw new Error(
        `[BASELINE] Index ${idx} exists but must not be present in D11 pre-state. ` +
        `This is a corrective migration object.`,
      )
    }
  }

  // Corrective constraint must not exist — exact constraint name check
  const { rows: uniqRows } = await query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.document_analysis'::regclass
       AND contype = 'u'
       AND conname = 'document_analysis_document_id_user_id_key'`,
  )
  if (uniqRows.length > 0) {
    throw new Error(
      `[BASELINE] document_analysis has corrective constraint ` +
      `"document_analysis_document_id_user_id_key" which must not exist in D11 pre-state.`,
    )
  }

  // study_visuals provenance columns added by corrective migration must not exist
  for (const col of POST_CORRECTIVE_STUDY_VISUALS_NEW_COLUMNS) {
    const { rows } = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'study_visuals' AND column_name = $1`,
      [col],
    )
    if (rows.length > 0) {
      throw new Error(
        `[BASELINE] study_visuals.${col} exists but must not in D11 pre-state. ` +
        `This column is added by the corrective migration section 17d.`,
      )
    }
  }

  // documents_id_user_id_unique — added by corrective migration; must not exist in D11
  const { rows: docUniqRows } = await query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.documents'::regclass
       AND contype = 'u'
       AND conname = 'documents_id_user_id_unique'`,
  )
  if (docUniqRows.length > 0) {
    throw new Error(
      `[BASELINE] documents_id_user_id_unique constraint exists in D11 pre-state but must not. ` +
      `Corrective migration section 17b adds this.`,
    )
  }

  // document_analysis corrective constraints must not exist
  for (const conname of CORRECTIVE_ABSENT_DA_CONSTRAINTS) {
    const { rows } = await query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.document_analysis'::regclass
         AND conname = $1`,
      [conname],
    )
    if (rows.length > 0) {
      throw new Error(
        `[BASELINE] document_analysis.${conname} exists in D11 pre-state but must not. ` +
        `Corrective migration section 17b adds this constraint.`,
      )
    }
  }

  // Two RESTRICTIVE storage policies added by the corrective migration must not exist at D11
  for (const policyName of POST_CORRECTIVE_RESTRICTIVE_POLICIES) {
    const { rows } = await query(
      `SELECT policyname FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = $1`,
      [policyName],
    )
    if (rows.length > 0) {
      throw new Error(
        `[BASELINE] Corrective RESTRICTIVE storage policy "${policyName}" exists in D11 pre-state but must not. ` +
        `Corrective migration section 19 creates this policy.`,
      )
    }
  }

  // generation_jobs itself must not exist (created by beta_foundation_v1.sql, not by fixture)
  await assertGenerationJobsAbsent(query)
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: Post-historical assertions
// Applied after beta_foundation_v1.sql, before corrective migration.
// ─────────────────────────────────────────────────────────────────────────────

// ── 21. generation_jobs baseline column shape (post-historical) ───────────────
// D11 S2_columns: exactly 13 columns in exact ordinal order.
// Canonical fingerprint imported from validationContract.ts (D11_GENERATION_JOBS_BASELINE_COLUMNS).
// Run this AFTER beta_foundation_v1.sql has been applied.

export async function assertGenerationJobsBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name, ordinal_position::int AS ordinal, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'generation_jobs'
     ORDER BY ordinal_position`,
  )

  if (rows.length !== D11_GENERATION_JOBS_BASELINE_COLUMNS.length) {
    throw new Error(
      `[POST-HISTORICAL] generation_jobs has ${rows.length} columns; expected ${D11_GENERATION_JOBS_BASELINE_COLUMNS.length}. ` +
      `Columns found: ${rows.map(r => r.column_name).join(', ')}. ` +
      `D11 S2_columns confirmed 13-column post-historical state.`,
    )
  }

  for (const exp of D11_GENERATION_JOBS_BASELINE_COLUMNS) {
    const row = rows.find(r => r.column_name === exp.name)
    if (!row) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs missing expected column: ${exp.name}. ` +
        `D11 S2_columns confirmed 13-column post-historical state.`,
      )
    }
    const gotOrdinal = typeof row.ordinal === 'string' ? parseInt(row.ordinal, 10) : Number(row.ordinal)
    if (gotOrdinal !== exp.ordinal) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs.${exp.name} ordinal_position expected ${exp.ordinal}; ` +
        `got: ${gotOrdinal}.`,
      )
    }
    if (row.data_type !== exp.data_type) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs.${exp.name} data_type expected "${exp.data_type}"; ` +
        `got: "${String(row.data_type)}".`,
      )
    }
    if (row.udt_name !== exp.udt_name) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs.${exp.name} udt_name expected "${exp.udt_name}"; ` +
        `got: "${String(row.udt_name)}".`,
      )
    }
    if (row.is_nullable !== exp.is_nullable) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs.${exp.name} is_nullable expected "${exp.is_nullable}"; ` +
        `got: "${String(row.is_nullable)}".`,
      )
    }
    const gotDefault = (row.column_default ?? null) as string | null
    if (gotDefault !== exp.column_default) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs.${exp.name} column_default expected ` +
        `${exp.column_default === null ? 'null' : `"${exp.column_default}"`}; ` +
        `got: ${gotDefault === null ? 'null' : `"${gotDefault}"`}.`,
      )
    }
  }

  // Status check must NOT include cancel_requested
  const { rows: checkRows } = await query(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'public.generation_jobs'::regclass
       AND conname = 'generation_jobs_status_check'`,
  )
  const def = checkRows[0]?.def as string | undefined
  if (!def) {
    throw new Error(
      `[POST-HISTORICAL] generation_jobs_status_check constraint not found. ` +
      `D11 S22_pg_constraints confirmed this constraint.`,
    )
  }
  if (def.includes('cancel_requested')) {
    throw new Error(
      `[POST-HISTORICAL] generation_jobs_status_check contains 'cancel_requested'. ` +
      `This value is added by the corrective migration, not by beta_foundation_v1.sql.`,
    )
  }
  const expectedValues = ["'queued'", "'processing'", "'completed'", "'failed'", "'cancelled'"]
  for (const v of expectedValues) {
    if (!def.includes(v)) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs_status_check missing expected value ${v}. ` +
        `Constraint definition: ${def}`,
      )
    }
  }
}

// ── 22. generation_jobs baseline RLS policy (post-historical) ─────────────────
// D11 S11: one permissive FOR ALL TO public policy named "Users see own jobs".

export async function assertGenerationJobsBaselinePolicy(query: QueryFn): Promise<void> {
  await _assertTablePolicies(query, 'generation_jobs', D11_GENERATION_JOBS_BASELINE_POLICY_SPECS, 'POST-HISTORICAL')
}

// ── 23. RLS enabled on all four target tables (post-historical) ───────────────

export async function assertRlsEnabledOnAllTargetTables(query: QueryFn): Promise<void> {
  const tables = ['documents', 'document_analysis', 'generation_jobs', 'study_visuals']
  for (const tbl of tables) {
    const { rows } = await query(
      `SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
       FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tbl],
    )
    if (rows.length === 0) {
      throw new Error(`[POST-HISTORICAL] Table public.${tbl} not found in pg_class.`)
    }
    if (!rows[0]?.rls_enabled) {
      throw new Error(
        `[POST-HISTORICAL] RLS not enabled on public.${tbl}. ` +
        `D11 S10 confirmed rls_enabled=true.`,
      )
    }
    if (rows[0]?.rls_forced) {
      throw new Error(
        `[POST-HISTORICAL] RLS is force-enabled on public.${tbl}. ` +
        `D11 S10 confirmed rls_forced=false.`,
      )
    }
  }
}

// ── 20. D11 table ACL fingerprint for pre-migration tables ───────────────────
// D11 SA07: all four tables have full privileges for exactly 4 roles (no PUBLIC).
// At Stage 0 (before beta_foundation_v1.sql), generation_jobs does not exist.
// We assert only the 3 pre-migration tables: documents, document_analysis, study_visuals.
// Uses symmetric aclexplode tuple equality with grantor field.

export async function assertBaselineTableAcls(query: QueryFn): Promise<void> {
  const tables = ['documents', 'document_analysis', 'study_visuals']
  for (const tbl of tables) {
    const { rows } = await query(
      `SELECT
         pg_catalog.pg_get_userbyid(e.grantor) AS grantor,
         CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
         e.privilege_type,
         e.is_grantable
       FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(c.relacl) e
       WHERE n.nspname = 'public'
         AND c.relname = $1
         AND c.relkind = 'r'
       ORDER BY grantee, e.privilege_type`,
      [tbl],
    )
    _compareDefaultAclTuples(rows, D11_TABLE_ACL_TUPLES[tbl]!, `[BASELINE] ${tbl} table ACL (D11 SA07)`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS — baseline constraint / index / policy / ACL comparators
// ─────────────────────────────────────────────────────────────────────────────

function _defaultAclSortKey(t: DefaultAclTuple): string {
  return `${t.grantor}|${t.grantee}|${t.privilege_type}|${String(t.is_grantable)}`
}

function _compareDefaultAclTuples(
  actual:   Record<string, unknown>[],
  expected: DefaultAclTuple[],
  label:    string,
): void {
  const got: DefaultAclTuple[] = actual.map(r => ({
    grantor:        r['grantor'] as string,
    grantee:        (r['grantee'] as string | null) ?? '',
    privilege_type: r['privilege_type'] as string,
    is_grantable:   r['is_grantable'] as boolean,
  })).sort((a, b) => _defaultAclSortKey(a).localeCompare(_defaultAclSortKey(b)))
  const exp = [...expected].sort((a, b) => _defaultAclSortKey(a).localeCompare(_defaultAclSortKey(b)))

  if (got.length !== exp.length) {
    throw new Error(
      `${label}: expected ${exp.length} ACL tuples, got ${got.length}. ` +
      `Actual: ${JSON.stringify(got)}. Expected: ${JSON.stringify(exp)}.`,
    )
  }
  for (let i = 0; i < exp.length; i++) {
    const g = got[i]!
    const e = exp[i]!
    if (g.grantor !== e.grantor || g.grantee !== e.grantee || g.privilege_type !== e.privilege_type || g.is_grantable !== e.is_grantable) {
      throw new Error(
        `${label}: mismatch at sorted index ${i}. ` +
        `Expected (${e.grantor}, ${e.grantee}, ${e.privilege_type}, ${e.is_grantable}) ` +
        `got (${g.grantor}, ${g.grantee}, ${g.privilege_type}, ${g.is_grantable}). ` +
        `Full actual: ${JSON.stringify(got)}.`,
      )
    }
  }
}

async function _assertTableConstraints(
  query:     QueryFn,
  tableName: string,
  expected:  ConstraintSpec[],
  context:   string,
): Promise<void> {
  const { rows } = await query(
    `SELECT c.conname AS name, c.contype, c.condeferrable, c.condeferred,
       pg_get_constraintdef(c.oid) AS exact_def,
       c.confdeltype AS confdeltype,
       c.confupdtype AS confupdtype
     FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = 'public' AND cl.relname = $1
     ORDER BY c.conname`,
    [tableName],
  )

  const actualNames  = new Set<string>(rows.map(r => r.name as string))
  const expectedNames = new Set<string>(expected.map(s => s.name))

  for (const exp of expected) {
    if (!actualNames.has(exp.name)) {
      throw new Error(
        `[${context}] ${tableName}: expected constraint "${exp.name}" not found. ` +
        `Actual constraints: ${[...actualNames].join(', ')}.`,
      )
    }
  }
  for (const row of rows) {
    if (!expectedNames.has(row.name as string)) {
      throw new Error(
        `[${context}] ${tableName}: unexpected constraint "${row.name}". Not in D11 fingerprint. ` +
        `Expected: ${[...expectedNames].join(', ')}.`,
      )
    }
  }
  for (const exp of expected) {
    const row = rows.find(r => r.name === exp.name)!
    if (row.contype !== exp.contype) {
      throw new Error(
        `[${context}] ${tableName}.${exp.name}: contype expected "${exp.contype}"; got "${row.contype}".`,
      )
    }
    if (row.exact_def !== exp.exact_def) {
      throw new Error(
        `[${context}] ${tableName}.${exp.name}: exact_def expected "${exp.exact_def}"; got "${row.exact_def}".`,
      )
    }
    if (exp.condeferrable !== undefined && !!row.condeferrable !== exp.condeferrable) {
      throw new Error(
        `[${context}] ${tableName}.${exp.name}: condeferrable expected ${exp.condeferrable}; got ${!!row.condeferrable}.`,
      )
    }
    if (exp.condeferred !== undefined && !!row.condeferred !== exp.condeferred) {
      throw new Error(
        `[${context}] ${tableName}.${exp.name}: condeferred expected ${exp.condeferred}; got ${!!row.condeferred}.`,
      )
    }
    if (exp.confdeltype !== undefined) {
      const gotDel = row.confdeltype as string | null
      if (gotDel !== exp.confdeltype) {
        throw new Error(
          `[${context}] ${tableName}.${exp.name}: confdeltype expected "${exp.confdeltype}"; got "${gotDel}".`,
        )
      }
    }
    if (exp.confupdtype !== undefined) {
      const gotUpd = row.confupdtype as string | null
      if (gotUpd !== exp.confupdtype) {
        throw new Error(
          `[${context}] ${tableName}.${exp.name}: confupdtype expected "${exp.confupdtype}"; got "${gotUpd}".`,
        )
      }
    }
  }
}

async function _assertTableIndexes(
  query:    QueryFn,
  schema:   string,
  table:    string,
  expected: IndexSpec[],
  context:  string,
): Promise<void> {
  const { rows } = await query(
    `SELECT ci.relname AS name, ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
       (ix.indpred IS NOT NULL) AS is_partial, pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
       pg_get_indexdef(ix.indexrelid) AS indexdef, n.nspname AS schema_name, ct.relname AS table_name
     FROM pg_index ix
       JOIN pg_class ci ON ci.oid = ix.indexrelid
       JOIN pg_class ct ON ct.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = ct.relnamespace
     WHERE n.nspname = $1 AND ct.relname = $2`,
    [schema, table],
  )

  const actualNames   = new Set<string>(rows.map(r => r.name as string))
  const expectedNames = new Set<string>(expected.map(s => s.name))

  for (const exp of expected) {
    if (!actualNames.has(exp.name)) {
      throw new Error(
        `[${context}] ${table}: expected index "${exp.name}" not found. ` +
        `Actual indexes: ${[...actualNames].join(', ')}.`,
      )
    }
  }
  for (const row of rows) {
    if (!expectedNames.has(row.name as string)) {
      throw new Error(
        `[${context}] ${table}: unexpected index "${row.name}". Not in D11 fingerprint. ` +
        `Expected: ${[...expectedNames].join(', ')}.`,
      )
    }
  }
  for (const exp of expected) {
    const row = rows.find(r => r.name === exp.name)!
    if (row.schema_name !== exp.schema) {
      throw new Error(
        `[${context}] ${table}.${exp.name}: schema expected "${exp.schema}"; got "${row.schema_name}".`,
      )
    }
    if (row.table_name !== exp.table) {
      throw new Error(
        `[${context}] ${table}.${exp.name}: table binding expected "${exp.table}"; got "${row.table_name}".`,
      )
    }
    if (!!row.is_unique !== exp.is_unique) {
      throw new Error(
        `[${context}] ${table}.${exp.name}: is_unique expected ${exp.is_unique}; got ${!!row.is_unique}.`,
      )
    }
    if (!!row.is_partial !== exp.is_partial) {
      throw new Error(
        `[${context}] ${table}.${exp.name}: is_partial expected ${exp.is_partial}; got ${!!row.is_partial}.`,
      )
    }
    const gotPred = (row.predicate ?? null) as string | null
    if (gotPred !== exp.predicate) {
      throw new Error(
        `[${context}] ${table}.${exp.name}: predicate expected ${JSON.stringify(exp.predicate)}; got ${JSON.stringify(gotPred)}.`,
      )
    }
    if (row.indexdef !== exp.pg_get_indexdef) {
      throw new Error(
        `[${context}] ${table}.${exp.name}: pg_get_indexdef expected "${exp.pg_get_indexdef}"; got "${row.indexdef}".`,
      )
    }
  }
}

async function _assertTablePolicies(
  query:     QueryFn,
  tableName: string,
  expected:  PublicTablePolicySpec[],
  context:   string,
): Promise<void> {
  const { rows } = await query(
    `SELECT policyname, permissive, cmd, roles::text AS roles, qual, with_check
     FROM pg_policies
     WHERE schemaname = 'public' AND tablename = $1`,
    [tableName],
  )

  const actualNames   = new Set<string>(rows.map(r => r.policyname as string))
  const expectedNames = new Set<string>(expected.map(s => s.policyname))

  for (const exp of expected) {
    if (!actualNames.has(exp.policyname)) {
      throw new Error(
        `[${context}] ${tableName}: expected policy "${exp.policyname}" not found. ` +
        `Actual policies: ${[...actualNames].join(', ')}.`,
      )
    }
  }
  for (const row of rows) {
    if (!expectedNames.has(row.policyname as string)) {
      throw new Error(
        `[${context}] ${tableName}: unexpected policy "${row.policyname}". Not in D11 fingerprint. ` +
        `Expected: ${[...expectedNames].join(', ')}.`,
      )
    }
  }
  for (const exp of expected) {
    const row = rows.find(r => r.policyname === exp.policyname)!
    if (row.permissive !== exp.permissive) {
      throw new Error(
        `[${context}] ${tableName}.${exp.policyname}: permissive expected "${exp.permissive}"; got "${row.permissive}".`,
      )
    }
    if (row.cmd !== exp.cmd) {
      throw new Error(
        `[${context}] ${tableName}.${exp.policyname}: cmd expected "${exp.cmd}"; got "${row.cmd}".`,
      )
    }
    if (row.roles !== exp.roles) {
      throw new Error(
        `[${context}] ${tableName}.${exp.policyname}: roles expected "${exp.roles}"; got "${row.roles}".`,
      )
    }
    const gotQual = (row.qual ?? null) as string | null
    if (gotQual !== exp.qual) {
      throw new Error(
        `[${context}] ${tableName}.${exp.policyname}: qual expected ${JSON.stringify(exp.qual)}; got ${JSON.stringify(gotQual)}.`,
      )
    }
    const gotWithCheck = (row.with_check ?? null) as string | null
    if (gotWithCheck !== exp.with_check) {
      throw new Error(
        `[${context}] ${tableName}.${exp.policyname}: with_check expected ${JSON.stringify(exp.with_check)}; got ${JSON.stringify(gotWithCheck)}.`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D11 BASELINE: Symmetric constraint, index, and policy assertions
// ─────────────────────────────────────────────────────────────────────────────

export async function assertDocumentsBaselineConstraints(query: QueryFn): Promise<void> {
  await _assertTableConstraints(query, 'documents', D11_DOCUMENTS_CONSTRAINTS, 'BASELINE')
}

export async function assertDocumentAnalysisBaselineConstraints(query: QueryFn): Promise<void> {
  await _assertTableConstraints(query, 'document_analysis', D11_DOCUMENT_ANALYSIS_CONSTRAINTS, 'BASELINE')
}

export async function assertStudyVisualsBaselineConstraints(query: QueryFn): Promise<void> {
  await _assertTableConstraints(query, 'study_visuals', D11_STUDY_VISUALS_CONSTRAINTS, 'BASELINE')
}

export async function assertGenerationJobsBaselineConstraints(query: QueryFn): Promise<void> {
  await _assertTableConstraints(query, 'generation_jobs', D11_GENERATION_JOBS_CONSTRAINTS, 'POST-HISTORICAL')
}

export async function assertDocumentsBaselineIndexes(query: QueryFn): Promise<void> {
  await _assertTableIndexes(query, 'public', 'documents', D11_DOCUMENTS_INDEX_SPECS, 'BASELINE')
}

export async function assertDocumentAnalysisBaselineIndexes(query: QueryFn): Promise<void> {
  await _assertTableIndexes(query, 'public', 'document_analysis', D11_DOCUMENT_ANALYSIS_INDEX_SPECS, 'BASELINE')
}

export async function assertStudyVisualsBaselineIndexes(query: QueryFn): Promise<void> {
  await _assertTableIndexes(query, 'public', 'study_visuals', D11_STUDY_VISUALS_INDEX_SPECS, 'BASELINE')
}

export async function assertGenerationJobsBaselineIndexes(query: QueryFn): Promise<void> {
  await _assertTableIndexes(query, 'public', 'generation_jobs', D11_GENERATION_JOBS_BASELINE_INDEX_SPECS, 'POST-HISTORICAL')
}

export async function assertDocumentsBaselinePolicies(query: QueryFn): Promise<void> {
  await _assertTablePolicies(query, 'documents', D11_DOCUMENTS_POLICY_SPECS, 'BASELINE')
}

export async function assertDocumentAnalysisBaselinePolicy(query: QueryFn): Promise<void> {
  await _assertTablePolicies(query, 'document_analysis', D11_DOCUMENT_ANALYSIS_POLICY_SPECS, 'BASELINE')
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE RUNNERS
// ─────────────────────────────────────────────────────────────────────────────

// Stage 0: Run all pre-migration assertions.
// Call AFTER applying d11-baseline.sql, BEFORE applying beta_foundation_v1.sql.
export async function runStage0PreMigrationAssertions(query: QueryFn): Promise<void> {
  await assertPostgresVersion(query)
  await assertUTF8Encoding(query)
  await assertPgcryptoAvailable(query)
  await assertUuidOsspAvailable(query)
  await assertPublicSchemaOwnerAndAcl(query)
  await assertDefaultTableAcl(query)
  await assertDefaultFunctionAcl(query)
  await assertDefaultSequenceAcl(query)
  await assertDocumentsBaselineShape(query)
  await assertDocumentAnalysisBaselineShape(query)
  await assertDocumentsFkDeleteBehavior(query)
  await assertStudyVisualsBaselineShape(query)
  await assertGenerationJobsAbsent(query)
  await assertRlsEnabledOnPreMigrationTables(query)
  await assertStudyVisualsBaselinePolicy(query)
  await assertTriggerFunctions(query)
  await assertAllTriggerDependants(query)
  await assertStudyVisualsBucket(query)
  await assertStudyVisualsStoragePolicies(query)
  await assertBaselineTableAcls(query)
  await assertCorrectiveObjectsAbsent(query)
  // Exact D11 constraint / index / policy fingerprints for pre-migration tables
  await assertDocumentsBaselineConstraints(query)
  await assertDocumentsBaselineIndexes(query)
  await assertDocumentsBaselinePolicies(query)
  await assertDocumentAnalysisBaselineConstraints(query)
  await assertDocumentAnalysisBaselineIndexes(query)
  await assertDocumentAnalysisBaselinePolicy(query)
  await assertStudyVisualsBaselineConstraints(query)
  await assertStudyVisualsBaselineIndexes(query)
}

// Stage 1: Run post-historical assertions.
// Call AFTER applying beta_foundation_v1.sql, BEFORE applying corrective migration.
export async function runStage1PostHistoricalAssertions(query: QueryFn): Promise<void> {
  await assertGenerationJobsBaselineShape(query)
  await assertGenerationJobsBaselinePolicy(query)
  await assertRlsEnabledOnAllTargetTables(query)
  // Exact D11 constraint / index fingerprints for generation_jobs (created by beta_foundation_v1.sql)
  await assertGenerationJobsBaselineConstraints(query)
  await assertGenerationJobsBaselineIndexes(query)
}

// Legacy alias — runs Stage 0. Prefer runStage0PreMigrationAssertions().
export async function runAllBaselineAssertions(query: QueryFn): Promise<void> {
  await runStage0PreMigrationAssertions(query)
}
