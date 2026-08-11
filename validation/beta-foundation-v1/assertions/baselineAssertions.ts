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
  const expectedAcl: AclTuple[] = [
    { grantee: '',                 privilege_type: 'USAGE',  is_grantable: false },
    { grantee: 'anon',            privilege_type: 'USAGE',  is_grantable: false },
    { grantee: 'authenticated',   privilege_type: 'USAGE',  is_grantable: false },
    { grantee: 'pg_database_owner', privilege_type: 'CREATE', is_grantable: false },
    { grantee: 'pg_database_owner', privilege_type: 'USAGE',  is_grantable: false },
    { grantee: 'postgres',        privilege_type: 'USAGE',  is_grantable: false },
    { grantee: 'service_role',    privilege_type: 'USAGE',  is_grantable: false },
  ]
  compareAclTuples(aclRows, expectedAcl, 'public schema nspacl (D11 SA10)')
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
// Ordinal order: id(1), user_id(2), title(3), file_path(4), file_type(5),
//   extracted_text(6), created_at(7), subject_id(8), source_type(9), source_recording_id(10).

const DOCUMENTS_EXPECTED_COLUMNS: Array<{
  name: string; ordinal: number; nullable: string; udt: string; default_sql: string | null
}> = [
  { name: 'id',                  ordinal: 1,  nullable: 'NO',  udt: 'uuid',        default_sql: 'gen_random_uuid()' },
  { name: 'user_id',             ordinal: 2,  nullable: 'YES', udt: 'uuid',        default_sql: null },
  { name: 'title',               ordinal: 3,  nullable: 'NO',  udt: 'text',        default_sql: null },
  { name: 'file_path',           ordinal: 4,  nullable: 'YES', udt: 'text',        default_sql: null },
  { name: 'file_type',           ordinal: 5,  nullable: 'YES', udt: 'text',        default_sql: null },
  { name: 'extracted_text',      ordinal: 6,  nullable: 'YES', udt: 'text',        default_sql: null },
  { name: 'created_at',          ordinal: 7,  nullable: 'YES', udt: 'timestamptz', default_sql: 'now()' },
  { name: 'subject_id',          ordinal: 8,  nullable: 'YES', udt: 'uuid',        default_sql: null },
  { name: 'source_type',         ordinal: 9,  nullable: 'YES', udt: 'text',        default_sql: null },
  { name: 'source_recording_id', ordinal: 10, nullable: 'YES', udt: 'uuid',        default_sql: null },
]

export async function assertDocumentsBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name, ordinal_position::int AS ordinal, is_nullable, udt_name, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'documents'
     ORDER BY ordinal_position`,
  )
  if (rows.length !== DOCUMENTS_EXPECTED_COLUMNS.length) {
    throw new Error(
      `[BASELINE] documents has ${rows.length} columns; expected ${DOCUMENTS_EXPECTED_COLUMNS.length}. ` +
      `Columns found: ${rows.map(r => r.column_name).join(', ')}. ` +
      `D11 S2_columns confirmed 10-column pre-state.`,
    )
  }
  for (const exp of DOCUMENTS_EXPECTED_COLUMNS) {
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
    if (row.is_nullable !== exp.nullable) {
      throw new Error(
        `[BASELINE] documents.${exp.name} is_nullable expected ${exp.nullable}; ` +
        `got: ${String(row.is_nullable)}.`,
      )
    }
    if (row.udt_name !== exp.udt) {
      throw new Error(
        `[BASELINE] documents.${exp.name} udt_name expected ${exp.udt}; ` +
        `got: ${String(row.udt_name)}.`,
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
// Ordinal 15 is created_at (confirmed by D11 — different from alphabetical listing order).

const DOCUMENT_ANALYSIS_EXPECTED_COLUMNS: Array<{
  name: string; ordinal: number; nullable: string; udt: string
}> = [
  { name: 'id',                      ordinal: 1,  nullable: 'NO',  udt: 'uuid'        },
  { name: 'document_id',             ordinal: 2,  nullable: 'NO',  udt: 'uuid'        },
  { name: 'user_id',                 ordinal: 3,  nullable: 'NO',  udt: 'uuid'        },
  { name: 'subject_area',            ordinal: 4,  nullable: 'NO',  udt: 'text'        },
  { name: 'difficulty_level',        ordinal: 5,  nullable: 'NO',  udt: 'text'        },
  { name: 'estimated_study_minutes', ordinal: 6,  nullable: 'YES', udt: 'int4'        },
  { name: 'sections',                ordinal: 7,  nullable: 'NO',  udt: 'jsonb'       },
  { name: 'key_concepts',            ordinal: 8,  nullable: 'NO',  udt: 'jsonb'       },
  { name: 'definitions',             ordinal: 9,  nullable: 'NO',  udt: 'jsonb'       },
  { name: 'formulas',                ordinal: 10, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'examples',                ordinal: 11, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'keywords',                ordinal: 12, nullable: 'NO',  udt: '_text'       },
  { name: 'likely_exam_topics',      ordinal: 13, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'model',                   ordinal: 14, nullable: 'NO',  udt: 'text'        },
  { name: 'created_at',              ordinal: 15, nullable: 'NO',  udt: 'timestamptz' },
  { name: 'learning_objectives',     ordinal: 16, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'misconceptions',          ordinal: 17, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'relationships',           ordinal: 18, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'prerequisites',           ordinal: 19, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'tables',                  ordinal: 20, nullable: 'NO',  udt: 'jsonb'       },
  { name: 'concept_graph',           ordinal: 21, nullable: 'YES', udt: 'jsonb'       },
  { name: 'learning_path',           ordinal: 22, nullable: 'YES', udt: 'jsonb'       },
]

export async function assertDocumentAnalysisBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name, ordinal_position::int AS ordinal, is_nullable, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'document_analysis'
     ORDER BY ordinal_position`,
  )
  if (rows.length !== DOCUMENT_ANALYSIS_EXPECTED_COLUMNS.length) {
    throw new Error(
      `[BASELINE] document_analysis has ${rows.length} columns; expected 22. ` +
      `Columns found: ${rows.map(r => r.column_name).join(', ')}`,
    )
  }
  for (const exp of DOCUMENT_ANALYSIS_EXPECTED_COLUMNS) {
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
    if (row.is_nullable !== exp.nullable) {
      throw new Error(
        `[BASELINE] document_analysis.${exp.name} is_nullable expected ${exp.nullable}; ` +
        `got: ${String(row.is_nullable)}.`,
      )
    }
    if (row.udt_name !== exp.udt) {
      throw new Error(
        `[BASELINE] document_analysis.${exp.name} udt_name expected ${exp.udt}; ` +
        `got: ${String(row.udt_name)}.`,
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
  // confdeltype / confupdtype: 'a'=NO ACTION, 'c'=CASCADE, 'n'=SET NULL, 'r'=RESTRICT, 'd'=SET DEFAULT
  type FkExpected = { del: string; upd: string }
  const fkMap = new Map(rows.map(r => [
    r.conname as string,
    { del: r.confdeltype as string, upd: r.confupdtype as string },
  ]))
  const expected: [string, FkExpected][] = [
    ['documents_user_id_fkey',             { del: 'c', upd: 'a' }], // CASCADE, NO ACTION
    ['documents_subject_id_fkey',          { del: 'n', upd: 'a' }], // SET NULL, NO ACTION
    ['documents_source_recording_id_fkey', { del: 'n', upd: 'a' }], // SET NULL, NO ACTION
  ]
  for (const [name, exp] of expected) {
    if (!fkMap.has(name)) {
      throw new Error(`[BASELINE] documents FK ${name} not found. D11 confirms this FK.`)
    }
    const got = fkMap.get(name)!
    if (got.del !== exp.del) {
      throw new Error(
        `[BASELINE] documents FK ${name} confdeltype expected "${exp.del}"; got "${got.del}".`,
      )
    }
    if (got.upd !== exp.upd) {
      throw new Error(
        `[BASELINE] documents FK ${name} confupdtype expected "${exp.upd}"; got "${got.upd}".`,
      )
    }
  }
}

// ── 12. study_visuals baseline column shape ───────────────────────────────────
// D11 S24_study_visuals_columns: exactly 6 columns.

const STUDY_VISUALS_EXPECTED_COLUMNS = new Set([
  'id', 'document_id', 'user_id', 'visuals', 'model', 'created_at',
])

export async function assertStudyVisualsBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'study_visuals'
     ORDER BY ordinal_position`,
  )
  const colNames = new Set(rows.map(r => r.column_name as string))

  for (const expected of STUDY_VISUALS_EXPECTED_COLUMNS) {
    if (!colNames.has(expected)) {
      throw new Error(
        `[BASELINE] study_visuals missing expected column: ${expected}. ` +
        `D11 S24 confirmed 6-column pre-state.`,
      )
    }
  }
  if (colNames.size !== STUDY_VISUALS_EXPECTED_COLUMNS.size) {
    throw new Error(
      `[BASELINE] study_visuals has ${colNames.size} columns; expected 6. ` +
      `Columns found: ${[...colNames].join(', ')}`,
    )
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
  const { rows } = await query(
    `SELECT policyname, cmd, permissive, roles::text AS roles, qual, with_check
     FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'study_visuals'`,
  )
  if (rows.length !== 1) {
    throw new Error(
      `[BASELINE] study_visuals expected exactly 1 RLS policy; found ${rows.length}. ` +
      `D11 S11 confirmed only "study_visuals_owner_all".`,
    )
  }
  const p = rows[0]
  if (p?.policyname !== 'study_visuals_owner_all') {
    throw new Error(
      `[BASELINE] study_visuals policy name expected "study_visuals_owner_all"; ` +
      `got: ${String(p?.policyname)}`,
    )
  }
  if (p?.cmd !== 'ALL') {
    throw new Error(`[BASELINE] study_visuals policy cmd expected ALL; got: ${String(p?.cmd)}`)
  }
  if (p?.permissive !== 'PERMISSIVE') {
    throw new Error(`[BASELINE] study_visuals policy permissive expected PERMISSIVE; got: ${String(p?.permissive)}`)
  }
}

// ── 16. Five trigger functions present ───────────────────────────────────────
// D11 SA01: exactly 5 public routines, all trigger functions owned by postgres.

const EXPECTED_TRIGGER_FUNCTIONS = new Set([
  'validate_resource_subject_ownership',
  'set_subjects_updated_at',
  'set_user_profiles_updated_at',
  'sync_user_profiles_identity',
  'update_updated_at',
])

export async function assertTriggerFunctions(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT proname
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND p.prorettype = 'trigger'::regtype`,
  )
  const found = new Set(rows.map(r => r.proname as string))

  for (const fn of EXPECTED_TRIGGER_FUNCTIONS) {
    if (!found.has(fn)) {
      throw new Error(
        `[BASELINE] Trigger function public.${fn} not found. ` +
        `D11 SA01 confirmed all 5 trigger functions.`,
      )
    }
  }
  if (found.size !== EXPECTED_TRIGGER_FUNCTIONS.size) {
    throw new Error(
      `[BASELINE] Expected exactly ${EXPECTED_TRIGGER_FUNCTIONS.size} trigger functions; ` +
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
  const expected: Array<{ table: string; name: string; events: string[]; timing: string }> = [
    { table: 'documents',      name: 'validate_document_subject_ownership',  events: ['INSERT','UPDATE'], timing: 'BEFORE' },
    { table: 'recordings',     name: 'validate_recording_subject_ownership', events: ['INSERT','UPDATE'], timing: 'BEFORE' },
    { table: 'subjects',       name: 'set_subjects_updated_at',              events: ['UPDATE'],          timing: 'BEFORE' },
    { table: 'user_profiles',  name: 'set_user_profiles_updated_at',         events: ['UPDATE'],          timing: 'BEFORE' },
    { table: 'user_profiles',  name: 'sync_user_profiles_identity_trigger',  events: ['INSERT'],          timing: 'BEFORE' },
    { table: 'user_profiles',  name: 'user_profiles_updated_at',             events: ['UPDATE'],          timing: 'BEFORE' },
    { table: 'agent_memories', name: 'agent_memories_updated_at',            events: ['UPDATE'],          timing: 'BEFORE' },
  ]

  for (const t of expected) {
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

  // Exact 4 policies with exact names, commands, and roles
  const byName = new Map(rows.map(r => [r.policyname as string, r]))
  const expected: Array<{ name: string; cmd: string; using: string; with_check: string | null }> = [
    {
      name: 'For full customization 137qt67_0', cmd: 'SELECT',
      using: `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: null,
    },
    {
      name: 'For full customization 137qt67_1', cmd: 'INSERT',
      using: null as unknown as string,
      with_check: `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    },
    {
      name: 'For full customization 137qt67_2', cmd: 'UPDATE',
      using: `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: null,
    },
    {
      name: 'For full customization 137qt67_3', cmd: 'DELETE',
      using: `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: null,
    },
  ]

  if (rows.length !== expected.length) {
    throw new Error(
      `[BASELINE] Expected exactly ${expected.length} study-visuals storage policies; ` +
      `found ${rows.length}. D11 S19 confirmed 4 policies.`,
    )
  }

  for (const exp of expected) {
    const row = byName.get(exp.name)
    if (!row) {
      throw new Error(
        `[BASELINE] Storage policy "${exp.name}" not found on storage.objects. ` +
        `D11 S19 confirmed this policy.`,
      )
    }
    if (row.cmd !== exp.cmd) {
      throw new Error(
        `[BASELINE] Storage policy "${exp.name}" cmd expected ${exp.cmd}; got: ${String(row.cmd)}.`,
      )
    }
    if (row.permissive !== 'PERMISSIVE') {
      throw new Error(
        `[BASELINE] Storage policy "${exp.name}" expected PERMISSIVE; got: ${String(row.permissive)}.`,
      )
    }
    // Parse PostgreSQL array literal '{element,...}' returned by pg driver as text
    const rolesRaw = String(row.roles ?? '{}')
    const rolesArr = rolesRaw === '{}' ? [] : rolesRaw.replace(/^\{|\}$/g, '').split(',')
    if (rolesArr.length !== 1 || rolesArr[0] !== 'authenticated') {
      throw new Error(
        `[BASELINE] Storage policy "${exp.name}" expected exactly roles={authenticated}; ` +
        `got: ${rolesRaw}.`,
      )
    }
  }

  // Verify 7 unrelated storage policies remain present
  const unrelatedPolicies = [
    'Users can read own files',
    'Users can upload to own folder',
    'Users can delete own files',
    'recordings_read',
    'recordings_upload',
    'recordings_update',
    'recordings_delete',
  ]
  for (const pName of unrelatedPolicies) {
    const { rows: pr } = await query(
      `SELECT policyname FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = $1`,
      [pName],
    )
    if (pr.length === 0) {
      throw new Error(
        `[BASELINE] Unrelated storage policy "${pName}" is missing. ` +
        `This policy must not be modified by the corrective migration.`,
      )
    }
  }
}

// ── 20. Corrective objects absent ────────────────────────────────────────────
// Verifies that no objects from the corrective migration exist yet.
// This ensures the fixture produces a clean pre-migration state.
// Covers all known objects introduced by 20260729120001_generation_job_state_machine_schema.sql.

export async function assertCorrectiveObjectsAbsent(query: QueryFn): Promise<void> {
  // Functions added by corrective migration must not exist
  const corrFunctions = [
    'fn_enqueue_job', 'fn_claim_job', 'fn_heartbeat_job',
    'fn_complete_and_publish_job', 'fn_fail_job', 'fn_recover_stale_jobs',
    'fn_sha256_hex', 'fn_canonical_jsonb_v1', 'fn_canonical_source_v1',
    'fn_canonical_request_v1', 'fn_snapshot_immutability_guard',
  ]

  for (const fn of corrFunctions) {
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
  const corrTables = [
    'generation_source_snapshots', 'generation_job_requests',
    'generation_job_usage',
  ]
  for (const tbl of corrTables) {
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

  // Corrective indexes must not exist
  const corrIndexes = [
    'generation_jobs_active_exclusion', 'generation_jobs_originating_key',
  ]
  for (const idx of corrIndexes) {
    const { rows } = await query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = $1`,
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

  // generation_jobs itself must not exist (created by beta_foundation_v1.sql, not by fixture)
  await assertGenerationJobsAbsent(query)
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: Post-historical assertions
// Applied after beta_foundation_v1.sql, before corrective migration.
// ─────────────────────────────────────────────────────────────────────────────

// ── 21. generation_jobs baseline column shape (post-historical) ───────────────
// D11 S2_columns: exactly 13 columns. Status check: 5 values (no cancel_requested).
// Run this AFTER beta_foundation_v1.sql has been applied.

const GENERATION_JOBS_EXPECTED_COLUMNS = new Set([
  'id', 'user_id', 'document_id', 'job_type', 'status',
  'input_data', 'result_data', 'error', 'correlation_id',
  'created_at', 'updated_at', 'started_at', 'completed_at',
])

export async function assertGenerationJobsBaselineShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'generation_jobs'
     ORDER BY ordinal_position`,
  )
  const colNames = new Set(rows.map(r => r.column_name as string))

  for (const expected of GENERATION_JOBS_EXPECTED_COLUMNS) {
    if (!colNames.has(expected)) {
      throw new Error(
        `[POST-HISTORICAL] generation_jobs missing expected column: ${expected}. ` +
        `D11 S2_columns confirmed 13-column post-historical state.`,
      )
    }
  }
  if (colNames.size !== GENERATION_JOBS_EXPECTED_COLUMNS.size) {
    throw new Error(
      `[POST-HISTORICAL] generation_jobs has ${colNames.size} columns; expected 13. ` +
      `Columns found: ${[...colNames].join(', ')}`,
    )
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
  const { rows } = await query(
    `SELECT policyname, cmd, permissive, roles::text AS roles
     FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'generation_jobs'`,
  )
  if (rows.length !== 1) {
    throw new Error(
      `[POST-HISTORICAL] generation_jobs expected exactly 1 RLS policy; found ${rows.length}. ` +
      `D11 S11 confirmed only "Users see own jobs".`,
    )
  }
  const p = rows[0]
  if (p?.policyname !== 'Users see own jobs') {
    throw new Error(
      `[POST-HISTORICAL] generation_jobs policy name expected "Users see own jobs"; ` +
      `got: ${String(p?.policyname)}`,
    )
  }
  if (p?.cmd !== 'ALL') {
    throw new Error(
      `[POST-HISTORICAL] generation_jobs policy cmd expected ALL; got: ${String(p?.cmd)}`,
    )
  }
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
  await assertCorrectiveObjectsAbsent(query)
}

// Stage 1: Run post-historical assertions.
// Call AFTER applying beta_foundation_v1.sql, BEFORE applying corrective migration.
export async function runStage1PostHistoricalAssertions(query: QueryFn): Promise<void> {
  await assertGenerationJobsBaselineShape(query)
  await assertGenerationJobsBaselinePolicy(query)
  await assertRlsEnabledOnAllTargetTables(query)
}

// Legacy alias — runs Stage 0. Prefer runStage0PreMigrationAssertions().
export async function runAllBaselineAssertions(query: QueryFn): Promise<void> {
  await runStage0PreMigrationAssertions(query)
}
