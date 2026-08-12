// VALIDATION ONLY — never import from application code
//
// Stage 3: Post-corrective assertions for the Beta Foundation V1 validation pipeline.
// Applied AFTER 20260729120001_generation_job_state_machine_schema.sql is executed.
//
// All canonical fingerprints (column specs, constraint specs, index specs, storage
// policy specs, function specs, ACL tuples) are imported from validationContract.ts.
// No inline fingerprint constants live in this file.
//
// Evidence basis:
//   - migrations/20260729120001_generation_job_state_machine_schema.sql (sections 2–33)
//   - .ai/inspection/d11-catalogue-results-2026-07-31.csv
//   - .ai/inspection/d11-additional-authority-results-2026-07-31.csv

import {
  type AclTuple,
  type ColumnSpec,
  type ConstraintSpec,
  type DefaultAclTuple,
  CORRECTIVE_FUNCTION_SPECS,
  IMMUTABILITY_TRIGGERS,
  IMMUTABILITY_TRIGGER_TGTYPE,
  IMMUTABILITY_TRIGGER_TGENABLED,
  LEDGER_TRIGGER_SPEC,
  POST_CORRECTIVE_NEW_TABLES,
  POST_CORRECTIVE_GENERATION_JOBS_INDEXES,
  CORRECTIVE_GENERATION_JOBS_INDEX_SPECS,
  CORRECTIVE_GENERATION_JOB_REQUESTS_INDEX_SPECS,
  CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_INDEX_SPECS,
  POST_CORRECTIVE_STORAGE_POLICY_SPECS,
  POST_CORRECTIVE_GENERATION_JOBS_COLUMNS,
  POST_CORRECTIVE_GENERATION_JOB_REQUESTS_COLUMNS,
  POST_CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_COLUMNS,
  POST_CORRECTIVE_GENERATION_JOB_USAGE_COLUMNS,
  POST_CORRECTIVE_STUDY_VISUALS_COLUMNS,
  POST_CORRECTIVE_DOCUMENTS_CONSTRAINTS,
  POST_CORRECTIVE_DOCUMENT_ANALYSIS_CONSTRAINTS,
  POST_CORRECTIVE_GENERATION_JOBS_CONSTRAINTS,
  POST_CORRECTIVE_GENERATION_JOB_REQUESTS_CONSTRAINTS,
  POST_CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_CONSTRAINTS,
  POST_CORRECTIVE_GENERATION_JOB_USAGE_CONSTRAINTS,
  POST_CORRECTIVE_STUDY_VISUALS_CONSTRAINTS,
  POST_CORRECTIVE_DOCUMENTS_ACL,
  POST_CORRECTIVE_RLS_STATES,
  POST_CORRECTIVE_DEFAULT_ACL_TUPLES,
  CLOSED_TABLE_ACL,
} from '../contract/validationContract'

export type QueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>

// ── Private helpers ───────────────────────────────────────────────────────────

function _sortKey(t: AclTuple): string {
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
    .sort((a, b) => _sortKey(a).localeCompare(_sortKey(b)))
  const exp = [...expected].sort((a, b) => _sortKey(a).localeCompare(_sortKey(b)))

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

// Verifies a table's complete column set: exact ordinal order, name, data_type, udt_name,
// is_nullable, column_default. Uses ColumnSpec from validationContract.
async function assertTableColumnShape(
  query:     QueryFn,
  tableName: string,
  expected:  ColumnSpec[],
): Promise<void> {
  const { rows } = await query(
    `SELECT
       ordinal_position::int AS ordinal,
       column_name           AS name,
       data_type,
       udt_name,
       is_nullable,
       column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  )
  if (rows.length !== expected.length) {
    throw new Error(
      `[POST-CORRECTIVE] public.${tableName} has ${rows.length} columns; expected ${expected.length}. ` +
      `Found: ${rows.map(r => r.name).join(', ')}`,
    )
  }
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i]!
    const got = rows[i]!
    const gotOrdinal = typeof got.ordinal === 'string' ? parseInt(got.ordinal, 10) : Number(got.ordinal)
    if (gotOrdinal !== exp.ordinal || got.name !== exp.name) {
      throw new Error(
        `[POST-CORRECTIVE] public.${tableName} column at position ${exp.ordinal}: ` +
        `expected "${exp.name}" (ordinal ${exp.ordinal}); got "${String(got.name)}" (ordinal ${gotOrdinal}).`,
      )
    }
    if (got.data_type !== exp.data_type) {
      throw new Error(
        `[POST-CORRECTIVE] public.${tableName}.${exp.name} data_type expected "${exp.data_type}"; ` +
        `got "${String(got.data_type)}".`,
      )
    }
    if (got.udt_name !== exp.udt_name) {
      throw new Error(
        `[POST-CORRECTIVE] public.${tableName}.${exp.name} udt_name expected "${exp.udt_name}"; ` +
        `got "${String(got.udt_name)}".`,
      )
    }
    if (got.is_nullable !== exp.is_nullable) {
      throw new Error(
        `[POST-CORRECTIVE] public.${tableName}.${exp.name} is_nullable expected ${exp.is_nullable}; ` +
        `got ${String(got.is_nullable)}.`,
      )
    }
    const gotDefault = (got.column_default ?? null) as string | null
    if (gotDefault !== exp.column_default) {
      throw new Error(
        `[POST-CORRECTIVE] public.${tableName}.${exp.name} column_default expected ` +
        `${exp.column_default === null ? 'null' : `"${exp.column_default}"`}; ` +
        `got: ${gotDefault === null ? 'null' : `"${gotDefault}"`}.`,
      )
    }
  }
}

// Verifies a table's COMPLETE constraint set with symmetric equality:
//   - every expected constraint name present in pg_constraint
//   - every actual constraint name covered by the expected set (no extras)
//   - exact pg_get_constraintdef(oid, true) match for every constraint
//   - condeferrable / condeferred match for every ConstraintSpec that declares them
// This enforces the symmetric contract required by Blocker 2.
async function assertCompleteConstraintSet(
  query:     QueryFn,
  tableName: string,
  expected:  ConstraintSpec[],
): Promise<void> {
  const { rows: nameRows } = await query(
    `SELECT conname
     FROM pg_constraint
     WHERE conrelid = $1::regclass`,
    [`public.${tableName}`],
  )
  const actualNames = new Set(nameRows.map(r => r.conname as string))
  const expectedNames = new Set(expected.map(c => c.name))

  const extra   = [...actualNames].filter(n => !expectedNames.has(n))
  const missing = [...expectedNames].filter(n => !actualNames.has(n))

  if (extra.length > 0) {
    throw new Error(
      `[POST-CORRECTIVE] ${tableName} has unexpected constraints not in contract: ${extra.join(', ')}. ` +
      `Symmetric constraint check failed — update the contract if these are intentional.`,
    )
  }
  if (missing.length > 0) {
    throw new Error(
      `[POST-CORRECTIVE] ${tableName} is missing expected constraints: ${missing.join(', ')}.`,
    )
  }

  for (const exp of expected) {
    const { rows: defRows } = await query(
      `SELECT
         pg_get_constraintdef(oid, true) AS def,
         condeferrable,
         condeferred
       FROM pg_constraint
       WHERE conrelid = $1::regclass AND conname = $2`,
      [`public.${tableName}`, exp.name],
    )
    if (defRows.length === 0) {
      throw new Error(`[POST-CORRECTIVE] ${tableName} constraint ${exp.name} unexpectedly missing.`)
    }
    const row = defRows[0]!
    const actualDef = row.def as string
    if (actualDef !== exp.exact_def) {
      throw new Error(
        `[POST-CORRECTIVE] ${tableName} constraint "${exp.name}" pg_get_constraintdef mismatch.\n` +
        `  Expected: "${exp.exact_def}"\n` +
        `  Got:      "${actualDef}"`,
      )
    }
    if (exp.condeferrable !== undefined) {
      const gotDeferrable = row.condeferrable as boolean
      if (gotDeferrable !== exp.condeferrable) {
        throw new Error(
          `[POST-CORRECTIVE] ${tableName} constraint "${exp.name}" condeferrable expected ` +
          `${exp.condeferrable}; got ${gotDeferrable}.`,
        )
      }
    }
    if (exp.condeferred !== undefined) {
      const gotDeferred = row.condeferred as boolean
      if (gotDeferred !== exp.condeferred) {
        throw new Error(
          `[POST-CORRECTIVE] ${tableName} constraint "${exp.name}" condeferred expected ` +
          `${exp.condeferred}; got ${gotDeferred}.`,
        )
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. generation_jobs — post-corrective exact column shape (28 columns)
// ─────────────────────────────────────────────────────────────────────────────

export async function assertGenerationJobsPostCorrectiveShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name, ordinal_position::int AS ordinal, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'generation_jobs'
     ORDER BY ordinal_position`,
  )

  if (rows.length !== POST_CORRECTIVE_GENERATION_JOBS_COLUMNS.length) {
    throw new Error(
      `[POST-CORRECTIVE] generation_jobs has ${rows.length} columns; expected ${POST_CORRECTIVE_GENERATION_JOBS_COLUMNS.length}. ` +
      `Found: ${rows.map(r => r.column_name).join(', ')}`,
    )
  }

  for (const exp of POST_CORRECTIVE_GENERATION_JOBS_COLUMNS) {
    const row = rows.find(r => r.column_name === exp.name)
    if (!row) {
      throw new Error(
        `[POST-CORRECTIVE] generation_jobs missing expected column: ${exp.name}. ` +
        `Corrective migration section 2 adds 15 new columns; migration preflight defines 13 baseline.`,
      )
    }
    const gotOrdinal = typeof row.ordinal === 'string' ? parseInt(row.ordinal, 10) : Number(row.ordinal)
    if (gotOrdinal !== exp.ordinal) {
      throw new Error(
        `[POST-CORRECTIVE] generation_jobs.${exp.name} ordinal_position expected ${exp.ordinal}; got ${gotOrdinal}.`,
      )
    }
    if (row.data_type !== exp.data_type) {
      throw new Error(
        `[POST-CORRECTIVE] generation_jobs.${exp.name} data_type expected "${exp.data_type}"; got "${String(row.data_type)}".`,
      )
    }
    if (row.udt_name !== exp.udt_name) {
      throw new Error(
        `[POST-CORRECTIVE] generation_jobs.${exp.name} udt_name expected "${exp.udt_name}"; got "${String(row.udt_name)}".`,
      )
    }
    if (row.is_nullable !== exp.is_nullable) {
      throw new Error(
        `[POST-CORRECTIVE] generation_jobs.${exp.name} is_nullable expected "${exp.is_nullable}"; got "${String(row.is_nullable)}".`,
      )
    }
    const gotDefault = (row.column_default ?? null) as string | null
    if (gotDefault !== exp.column_default) {
      throw new Error(
        `[POST-CORRECTIVE] generation_jobs.${exp.name} column_default expected ` +
        `${exp.column_default === null ? 'null' : `"${exp.column_default}"`}; ` +
        `got: ${gotDefault === null ? 'null' : `"${gotDefault}"`}.`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. generation_jobs — complete constraint set (12 constraints, symmetric)
// Includes the post-corrective status_check (with cancel_requested).
// ─────────────────────────────────────────────────────────────────────────────

export async function assertGenerationJobsCompleteConstraints(query: QueryFn): Promise<void> {
  await assertCompleteConstraintSet(query, 'generation_jobs', POST_CORRECTIVE_GENERATION_JOBS_CONSTRAINTS)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. generation_jobs — ACL: exact tuple equality (only postgres after section 32)
// ─────────────────────────────────────────────────────────────────────────────

export async function assertGenerationJobsAclRevoked(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL aclexplode(c.relacl) e
     WHERE n.nspname = 'public'
       AND c.relname = 'generation_jobs'
       AND c.relkind = 'r'
     ORDER BY grantee, privilege_type`,
  )
  compareAclTuples(rows, CLOSED_TABLE_ACL, 'generation_jobs table ACL (section 32)')
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. generation_jobs — old permissive policy removed; no policies remain
// ─────────────────────────────────────────────────────────────────────────────

export async function assertGenerationJobsNoPolicies(query: QueryFn): Promise<void> {
  await assertTableRlsState(
    query,
    'generation_jobs',
    'Corrective migration section 32 ensures RLS enabled (no FORCE) with deny-all (no policies).',
  )
  const { rows } = await query(
    `SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'generation_jobs'`,
  )
  if (rows.length !== 0) {
    throw new Error(
      `[POST-CORRECTIVE] generation_jobs has ${rows.length} RLS policies; expected 0. ` +
      `Corrective migration section 13 drops "Users see own jobs". ` +
      `Policies found: ${rows.map(r => r.policyname).join(', ')}`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. generation_jobs — corrective indexes present (from validationContract)
// ─────────────────────────────────────────────────────────────────────────────

async function assertIndexSpec(
  query: QueryFn,
  spec: { schema: string; table: string; name: string; is_unique: boolean; is_partial: boolean; predicate: string | null; pg_get_indexdef: string },
  migrationNote: string,
): Promise<void> {
  const { rows } = await query(
    `SELECT
       ci.relname                              AS name,
       ix.indisunique                          AS is_unique,
       ix.indisprimary                         AS is_primary,
       (ix.indpred IS NOT NULL)                AS is_partial,
       pg_get_expr(ix.indpred, ix.indrelid)    AS predicate,
       pg_get_indexdef(ix.indexrelid)          AS indexdef,
       n.nspname                               AS schema_name,
       ct.relname                              AS table_name
     FROM pg_index    ix
       JOIN pg_class  ci ON ci.oid = ix.indexrelid
       JOIN pg_class  ct ON ct.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = ct.relnamespace
     WHERE n.nspname = $1
       AND ct.relname = $2
       AND ci.relname = $3`,
    [spec.schema, spec.table, spec.name],
  )
  if (rows.length === 0) {
    throw new Error(
      `[POST-CORRECTIVE] Expected index ${spec.name} on ${spec.schema}.${spec.table} not found. ` +
      `${migrationNote}`,
    )
  }
  const row = rows[0]!
  if (row.schema_name !== spec.schema || row.table_name !== spec.table) {
    throw new Error(
      `[POST-CORRECTIVE] Index ${spec.name} table binding mismatch: expected ${spec.schema}.${spec.table}; ` +
      `got ${String(row.schema_name)}.${String(row.table_name)} (pg_index.indrelid/indexrelid chain).`,
    )
  }
  if (row.is_unique !== spec.is_unique) {
    throw new Error(
      `[POST-CORRECTIVE] Index ${spec.name} indisunique expected ${spec.is_unique}; got ${String(row.is_unique)}.`,
    )
  }
  if (row.is_primary) {
    throw new Error(`[POST-CORRECTIVE] Index ${spec.name} should not be a primary key index.`)
  }
  if (row.is_partial !== spec.is_partial) {
    throw new Error(
      `[POST-CORRECTIVE] Index ${spec.name} is_partial expected ${spec.is_partial}; got ${String(row.is_partial)}.`,
    )
  }
  const gotPredicate = (row.predicate ?? null) as string | null
  if (gotPredicate !== spec.predicate) {
    throw new Error(
      `[POST-CORRECTIVE] Index ${spec.name} predicate expected:\n  "${String(spec.predicate)}"\ngot:\n  "${String(gotPredicate)}".`,
    )
  }
  const gotIndexdef = String(row.indexdef ?? '')
  if (gotIndexdef !== spec.pg_get_indexdef) {
    throw new Error(
      `[POST-CORRECTIVE] Index ${spec.name} pg_get_indexdef mismatch.\n` +
      `  Expected: "${spec.pg_get_indexdef}"\n` +
      `  Got:      "${gotIndexdef}"`,
    )
  }
}

export async function assertGenerationJobsCorrectiveIndexes(query: QueryFn): Promise<void> {
  // generation_jobs indexes
  for (const spec of CORRECTIVE_GENERATION_JOBS_INDEX_SPECS) {
    await assertIndexSpec(query, spec, 'Corrective migration section 11 creates this index.')
  }

  // generation_job_requests index
  for (const spec of CORRECTIVE_GENERATION_JOB_REQUESTS_INDEX_SPECS) {
    await assertIndexSpec(query, spec, 'Corrective migration section 15 creates this index.')
  }

  // generation_source_snapshots index
  for (const spec of CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_INDEX_SPECS) {
    await assertIndexSpec(query, spec, 'Corrective migration section 17b creates this index.')
  }

  // Verify contract index list matches spec list (internal consistency)
  for (const name of POST_CORRECTIVE_GENERATION_JOBS_INDEXES) {
    if (!CORRECTIVE_GENERATION_JOBS_INDEX_SPECS.find(s => s.name === name)) {
      throw new Error(
        `[POST-CORRECTIVE] validationContract lists index "${name}" but it has no IndexSpec entry.`,
      )
    }
  }

  // Old generation_jobs_status index must be gone
  const { rows: oldIdx } = await query(
    `SELECT ci.relname AS name
     FROM pg_index    ix
       JOIN pg_class  ci ON ci.oid = ix.indexrelid
       JOIN pg_class  ct ON ct.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = ct.relnamespace
     WHERE n.nspname = 'public'
       AND ct.relname = 'generation_jobs'
       AND ci.relname = 'generation_jobs_status'`,
  )
  if (oldIdx.length > 0) {
    throw new Error(
      `[POST-CORRECTIVE] generation_jobs_status index still exists; corrective migration section 11 drops it.`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6a. New closed table column shapes
// ─────────────────────────────────────────────────────────────────────────────

export async function assertGenerationJobRequestsShape(query: QueryFn): Promise<void> {
  await assertTableColumnShape(query, 'generation_job_requests', POST_CORRECTIVE_GENERATION_JOB_REQUESTS_COLUMNS)
}

export async function assertGenerationSourceSnapshotsShape(query: QueryFn): Promise<void> {
  await assertTableColumnShape(query, 'generation_source_snapshots', POST_CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_COLUMNS)
}

export async function assertGenerationJobUsageShape(query: QueryFn): Promise<void> {
  await assertTableColumnShape(query, 'generation_job_usage', POST_CORRECTIVE_GENERATION_JOB_USAGE_COLUMNS)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6b. New closed table complete constraint sets
// ─────────────────────────────────────────────────────────────────────────────

export async function assertGenerationJobRequestsConstraints(query: QueryFn): Promise<void> {
  await assertCompleteConstraintSet(query, 'generation_job_requests', POST_CORRECTIVE_GENERATION_JOB_REQUESTS_CONSTRAINTS)
}

export async function assertGenerationSourceSnapshotsConstraints(query: QueryFn): Promise<void> {
  await assertCompleteConstraintSet(query, 'generation_source_snapshots', POST_CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_CONSTRAINTS)
}

export async function assertGenerationJobUsageConstraints(query: QueryFn): Promise<void> {
  await assertCompleteConstraintSet(query, 'generation_job_usage', POST_CORRECTIVE_GENERATION_JOB_USAGE_CONSTRAINTS)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6c. New closed tables — RLS, ACL (exact), and policy state
// ─────────────────────────────────────────────────────────────────────────────

const CLOSED_TABLES = POST_CORRECTIVE_NEW_TABLES

export async function assertClosedTablesExist(query: QueryFn): Promise<void> {
  for (const tbl of CLOSED_TABLES) {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [tbl],
    )
    if (rows.length === 0) {
      throw new Error(
        `[POST-CORRECTIVE] Table public.${tbl} does not exist. ` +
        `Corrective migration creates this table.`,
      )
    }
  }
}

async function assertTableRlsState(
  query:   QueryFn,
  table:   string,
  context: string,
): Promise<void> {
  const exp = POST_CORRECTIVE_RLS_STATES[table]
  if (!exp) throw new Error(`[POST-CORRECTIVE] No RLS state spec for table ${table}.`)
  const { rows } = await query(
    `SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
     FROM pg_class
     WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
    [table],
  )
  if (rows.length === 0) {
    throw new Error(`[POST-CORRECTIVE] Table public.${table} not found in pg_class.`)
  }
  const row = rows[0]!
  if (!!row.enabled !== exp.relrowsecurity) {
    throw new Error(
      `[POST-CORRECTIVE] public.${table} relrowsecurity expected ${exp.relrowsecurity}; got ${String(row.enabled)}. ${context}`,
    )
  }
  if (!!row.forced !== exp.relforcerowsecurity) {
    throw new Error(
      `[POST-CORRECTIVE] public.${table} relforcerowsecurity expected ${exp.relforcerowsecurity}; got ${String(row.forced)}. ${context}`,
    )
  }
}

export async function assertClosedTablesRls(query: QueryFn): Promise<void> {
  for (const tbl of CLOSED_TABLES) {
    await assertTableRlsState(
      query,
      tbl,
      'Corrective migration enables RLS (no FORCE) with no permissive policies (deny-all default).',
    )
  }
}

export async function assertClosedTablesAclRevoked(query: QueryFn): Promise<void> {
  for (const tbl of CLOSED_TABLES) {
    const { rows } = await query(
      `SELECT
         CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
         e.privilege_type,
         e.is_grantable
       FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(c.relacl) e
       WHERE n.nspname = 'public'
         AND c.relname = $1
         AND c.relkind = 'r'
       ORDER BY grantee, privilege_type`,
      [tbl],
    )
    compareAclTuples(rows, CLOSED_TABLE_ACL, `${tbl} table ACL (section 32)`)
  }
}

export async function assertClosedTablesNoPolicies(query: QueryFn): Promise<void> {
  for (const tbl of CLOSED_TABLES) {
    const { rows } = await query(
      `SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = $1`,
      [tbl],
    )
    if (rows.length !== 0) {
      throw new Error(
        `[POST-CORRECTIVE] ${tbl} has ${rows.length} RLS policies; expected 0. ` +
        `With RLS enabled and no policies, default is deny-all. ` +
        `Policies found: ${rows.map(r => r.policyname).join(', ')}`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. study_visuals — exact 10-column post-corrective shape
// ─────────────────────────────────────────────────────────────────────────────

export async function assertStudyVisualsPostCorrectiveShape(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT column_name, ordinal_position::int AS ordinal, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'study_visuals'
     ORDER BY ordinal_position`,
  )

  if (rows.length !== POST_CORRECTIVE_STUDY_VISUALS_COLUMNS.length) {
    throw new Error(
      `[POST-CORRECTIVE] study_visuals has ${rows.length} columns; expected ${POST_CORRECTIVE_STUDY_VISUALS_COLUMNS.length}. ` +
      `Found: ${rows.map(r => r.column_name).join(', ')}`,
    )
  }

  for (const exp of POST_CORRECTIVE_STUDY_VISUALS_COLUMNS) {
    const row = rows.find(r => r.column_name === exp.name)
    if (!row) {
      throw new Error(
        `[POST-CORRECTIVE] study_visuals missing expected column: ${exp.name}. ` +
        `Corrective migration section 17d adds provenance columns.`,
      )
    }
    const gotOrdinal = typeof row.ordinal === 'string' ? parseInt(row.ordinal as string, 10) : Number(row.ordinal)
    if (gotOrdinal !== exp.ordinal) {
      throw new Error(
        `[POST-CORRECTIVE] study_visuals.${exp.name} ordinal_position expected ${exp.ordinal}; got ${gotOrdinal}.`,
      )
    }
    if (row.data_type !== exp.data_type) {
      throw new Error(
        `[POST-CORRECTIVE] study_visuals.${exp.name} data_type expected "${exp.data_type}"; got "${String(row.data_type)}".`,
      )
    }
    if (row.udt_name !== exp.udt_name) {
      throw new Error(
        `[POST-CORRECTIVE] study_visuals.${exp.name} udt_name expected "${exp.udt_name}"; got "${String(row.udt_name)}".`,
      )
    }
    if (row.is_nullable !== exp.is_nullable) {
      throw new Error(
        `[POST-CORRECTIVE] study_visuals.${exp.name} is_nullable expected "${exp.is_nullable}"; got "${String(row.is_nullable)}".`,
      )
    }
    const gotDefault = (row.column_default ?? null) as string | null
    if (gotDefault !== exp.column_default) {
      throw new Error(
        `[POST-CORRECTIVE] study_visuals.${exp.name} column_default expected ` +
        `${exp.column_default === null ? 'null' : `"${exp.column_default}"`}; ` +
        `got: ${gotDefault === null ? 'null' : `"${gotDefault}"`}.`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7b. study_visuals — complete constraint set (10 constraints, symmetric)
// ─────────────────────────────────────────────────────────────────────────────

export async function assertStudyVisualsCompleteConstraints(query: QueryFn): Promise<void> {
  await assertCompleteConstraintSet(query, 'study_visuals', POST_CORRECTIVE_STUDY_VISUALS_CONSTRAINTS)
}

// ─────────────────────────────────────────────────────────────────────────────
// 7c. study_visuals — ACL: exact tuple equality (only postgres after section 32)
// ─────────────────────────────────────────────────────────────────────────────

export async function assertStudyVisualsAclRevoked(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL aclexplode(c.relacl) e
     WHERE n.nspname = 'public'
       AND c.relname = 'study_visuals'
       AND c.relkind = 'r'
     ORDER BY grantee, privilege_type`,
  )
  compareAclTuples(rows, CLOSED_TABLE_ACL, 'study_visuals table ACL (section 32)')
}

export async function assertStudyVisualsNoPolicies(query: QueryFn): Promise<void> {
  await assertTableRlsState(
    query,
    'study_visuals',
    'Corrective migration section 22 ensures RLS enabled (no FORCE) with deny-all (no policies).',
  )
  const { rows } = await query(
    `SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'study_visuals'`,
  )
  if (rows.length !== 0) {
    throw new Error(
      `[POST-CORRECTIVE] study_visuals has ${rows.length} RLS policies; expected 0. ` +
      `Corrective migration section 22b drops "study_visuals_owner_all". ` +
      `Policies found: ${rows.map(r => r.policyname).join(', ')}`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Storage bucket postconditions
// ─────────────────────────────────────────────────────────────────────────────

export async function assertStudyVisualsBucketPostCorrective(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT public, file_size_limit, allowed_mime_types
     FROM storage.buckets WHERE id = 'study-visuals'`,
  )
  if (rows.length === 0) {
    throw new Error(`[POST-CORRECTIVE] storage.buckets: study-visuals bucket not found.`)
  }
  const b = rows[0]!

  if (b.public !== false) {
    throw new Error(
      `[POST-CORRECTIVE] study-visuals bucket expected public=false; got: ${String(b.public)}. ` +
      `Corrective migration section 12 sets public=FALSE.`,
    )
  }
  const sizeLimit = typeof b.file_size_limit === 'string'
    ? parseInt(b.file_size_limit, 10)
    : Number(b.file_size_limit)
  if (sizeLimit !== 5242880) {
    throw new Error(
      `[POST-CORRECTIVE] study-visuals file_size_limit expected 5242880; got: ${String(b.file_size_limit)}. ` +
      `Corrective migration section 12 sets file_size_limit=5242880.`,
    )
  }
  const mimeRaw = b.allowed_mime_types
  const mimeArr: string[] = Array.isArray(mimeRaw)
    ? mimeRaw
    : typeof mimeRaw === 'string'
      ? mimeRaw.replace(/^\{|\}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''))
      : []
  if (mimeArr.length !== 1 || mimeArr[0] !== 'image/png') {
    throw new Error(
      `[POST-CORRECTIVE] study-visuals allowed_mime_types expected ['image/png']; ` +
      `got: ${JSON.stringify(mimeRaw)}. Corrective migration section 12 restricts to image/png.`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Storage policies — exact 9-policy fingerprint from validationContract
// ─────────────────────────────────────────────────────────────────────────────

export async function assertPostCorrectiveStoragePolicies(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT policyname, cmd, permissive AS mode, roles::text AS roles, qual, with_check
     FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'`,
  )

  if (rows.length !== POST_CORRECTIVE_STORAGE_POLICY_SPECS.length) {
    const found = rows.map(r => r.policyname).join(', ')
    throw new Error(
      `[POST-CORRECTIVE] storage.objects has ${rows.length} policies; expected ${POST_CORRECTIVE_STORAGE_POLICY_SPECS.length}. ` +
      `Found: ${found}. ` +
      `Corrective migration section 19 drops 4 permissive study-visuals policies and adds 2 RESTRICTIVE ones.`,
    )
  }

  // Verify old study-visuals permissive policies are gone
  const policyNames = new Set(rows.map(r => r.policyname as string))
  for (let i = 0; i <= 3; i++) {
    const old = `For full customization 137qt67_${i}`
    if (policyNames.has(old)) {
      throw new Error(
        `[POST-CORRECTIVE] Old permissive policy "${old}" still exists on storage.objects. ` +
        `Corrective migration section 19 drops all 4 legacy study-visuals policies.`,
      )
    }
  }

  const byName = new Map(rows.map(r => [r.policyname as string, r]))
  for (const exp of POST_CORRECTIVE_STORAGE_POLICY_SPECS) {
    const row = byName.get(exp.name)
    if (!row) {
      throw new Error(
        `[POST-CORRECTIVE] Storage policy "${exp.name}" not found on storage.objects.`,
      )
    }
    if (row.cmd !== exp.cmd) {
      throw new Error(`[POST-CORRECTIVE] Policy "${exp.name}" cmd expected ${exp.cmd}; got: ${String(row.cmd)}.`)
    }
    if (row.mode !== exp.mode) {
      throw new Error(`[POST-CORRECTIVE] Policy "${exp.name}" mode expected ${exp.mode}; got: ${String(row.mode)}.`)
    }
    const rolesRaw = String(row.roles ?? '{}')
    const rolesArr = rolesRaw === '{}' ? [] : rolesRaw.replace(/^\{|\}$/g, '').split(',')
    if (rolesArr.length !== 1 || rolesArr[0] !== exp.role) {
      throw new Error(
        `[POST-CORRECTIVE] Policy "${exp.name}" expected role=${exp.role}; got roles=${rolesRaw}.`,
      )
    }
    // Exact USING / WITH CHECK for ALL 9 policies
    const gotQual      = (row.qual      ?? null) as string | null
    const gotWithCheck = (row.with_check ?? null) as string | null
    const expQual      = exp.qual as string | null
    const expWithCheck = exp.withCheck as string | null
    if (gotQual !== expQual) {
      throw new Error(
        `[POST-CORRECTIVE] Policy "${exp.name}" USING (qual) mismatch.\n` +
        `  Expected: ${expQual === null ? 'null' : `"${expQual}"`}\n` +
        `  Got:      ${gotQual === null ? 'null' : `"${gotQual}"`}`,
      )
    }
    if (gotWithCheck !== expWithCheck) {
      throw new Error(
        `[POST-CORRECTIVE] Policy "${exp.name}" WITH CHECK mismatch.\n` +
        `  Expected: ${expWithCheck === null ? 'null' : `"${expWithCheck}"`}\n` +
        `  Got:      ${gotWithCheck === null ? 'null' : `"${gotWithCheck}"`}`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Corrective functions — exact identity (name + identity_args), owner, security,
//     provolatile, proconfig/search_path from validationContract FunctionSpecs
// ─────────────────────────────────────────────────────────────────────────────

export async function assertCorrectiveFunctionsPresent(query: QueryFn): Promise<void> {
  for (const spec of CORRECTIVE_FUNCTION_SPECS) {
    // Identify function by name AND pg_get_function_identity_arguments to handle overloads.
    const { rows } = await query(
      `SELECT
         p.proname,
         pg_catalog.pg_get_userbyid(p.proowner)                  AS owner,
         p.prosecdef,
         p.provolatile,
         p.proconfig,
         pg_catalog.pg_get_function_identity_arguments(p.oid)    AS identity_args
       FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = $1
         AND pg_catalog.pg_get_function_identity_arguments(p.oid) = $2`,
      [spec.name, spec.identity_args],
    )
    if (rows.length === 0) {
      throw new Error(
        `[POST-CORRECTIVE] Function public.${spec.name}(${spec.identity_args}) not found. ` +
        `Corrective migration creates this function.`,
      )
    }
    const row = rows[0]!

    if (row.owner !== 'postgres') {
      throw new Error(
        `[POST-CORRECTIVE] Function public.${spec.name}: owner expected "postgres"; got "${String(row.owner)}".`,
      )
    }
    if (row.prosecdef !== true) {
      throw new Error(
        `[POST-CORRECTIVE] Function public.${spec.name}: prosecdef expected true (SECURITY DEFINER); got ${String(row.prosecdef)}.`,
      )
    }
    if (row.provolatile !== spec.provolatile) {
      const volatilityLabel = spec.provolatile === 'v' ? 'VOLATILE' : spec.provolatile === 's' ? 'STABLE' : 'IMMUTABLE'
      throw new Error(
        `[POST-CORRECTIVE] Function public.${spec.name}: provolatile expected "${spec.provolatile}" (${volatilityLabel}); ` +
        `got "${String(row.provolatile)}".`,
      )
    }
    // proconfig is stored as text[] in pg_proc, e.g. {search_path=} or {search_path=extensions, pg_catalog}
    const proconfig = row.proconfig
    const configArr: string[] = Array.isArray(proconfig)
      ? proconfig
      : typeof proconfig === 'string'
        ? proconfig.replace(/^\{|\}$/g, '').split(',').map(s => s.trim())
        : []
    if (!configArr.includes(spec.proconfig_sp)) {
      throw new Error(
        `[POST-CORRECTIVE] Function public.${spec.name}: proconfig expected to include "${spec.proconfig_sp}"; ` +
        `got: ${JSON.stringify(configArr)}. This confirms SET search_path is correct.`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Corrective function grants — exact ACL tuple equality via aclexplode
// Source: section 32 REVOKE ALL FROM PUBLIC/anon/authenticated/service_role +
// per-function GRANT blocks. Expected tuples from CORRECTIVE_FUNCTION_SPECS.
// ─────────────────────────────────────────────────────────────────────────────

export async function assertCorrectiveFunctionGrants(query: QueryFn): Promise<void> {
  for (const spec of CORRECTIVE_FUNCTION_SPECS) {
    const { rows } = await query(
      `SELECT
         CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
         e.privilege_type,
         e.is_grantable
       FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL aclexplode(p.proacl) e
       WHERE n.nspname = 'public'
         AND p.proname = $1
         AND pg_catalog.pg_get_function_identity_arguments(p.oid) = $2
       ORDER BY grantee, privilege_type`,
      [spec.name, spec.identity_args],
    )
    compareAclTuples(rows, spec.acl, `function public.${spec.name}(${spec.identity_args})`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Immutability triggers — exact fingerprint + symmetric set comparison
// Source of truth: IMMUTABILITY_TRIGGERS from validationContract.
// For each table: asserts exact trigger exists and no unexpected non-system triggers present.
// tgtype=27: BEFORE(2) | UPDATE(16) | DELETE(8) | ROW(1)
// tgenabled='O': enabled in DEFAULT mode
// ─────────────────────────────────────────────────────────────────────────────

export async function assertImmutabilityTriggersPresent(query: QueryFn): Promise<void> {
  // Group expected triggers by table
  const expectedByTable = new Map<string, typeof IMMUTABILITY_TRIGGERS[number][]>()
  for (const spec of IMMUTABILITY_TRIGGERS) {
    const list = expectedByTable.get(spec.table) ?? []
    list.push(spec)
    expectedByTable.set(spec.table, list)
  }

  for (const [table, specs] of expectedByTable) {
    // Query all non-internal triggers on this table
    const { rows } = await query(
      `SELECT
         t.tgname,
         t.tgtype::int  AS tgtype,
         t.tgenabled,
         pg_get_triggerdef(t.oid, true) AS triggerdef
       FROM pg_trigger t
       WHERE t.tgrelid = $1::regclass
         AND NOT t.tgisinternal`,
      [`public.${table}`],
    )

    const expectedNames = new Set<string>(specs.map(s => s.trigger))
    const actualNames   = new Set<string>(rows.map(r => r.tgname as string))

    // Missing expected triggers
    for (const name of expectedNames) {
      if (!actualNames.has(name)) {
        throw new Error(
          `[POST-CORRECTIVE] Immutability trigger ${name} not found on public.${table}. ` +
          `Corrective migration creates this trigger.`,
        )
      }
    }
    // Unexpected triggers
    for (const name of actualNames) {
      if (!expectedNames.has(name)) {
        throw new Error(
          `[POST-CORRECTIVE] Unexpected trigger "${name}" found on public.${table}. ` +
          `Only expected triggers: ${[...expectedNames].join(', ')}.`,
        )
      }
    }

    // Exact fingerprint for each expected trigger
    const byName = new Map(rows.map(r => [r.tgname as string, r]))
    for (const spec of specs) {
      const row = byName.get(spec.trigger)!
      const gotTgtype = typeof row.tgtype === 'string' ? parseInt(row.tgtype as string, 10) : Number(row.tgtype)
      if (gotTgtype !== IMMUTABILITY_TRIGGER_TGTYPE) {
        throw new Error(
          `[POST-CORRECTIVE] Trigger ${spec.trigger} tgtype expected ${IMMUTABILITY_TRIGGER_TGTYPE}; got ${gotTgtype}.`,
        )
      }
      if (row.tgenabled !== IMMUTABILITY_TRIGGER_TGENABLED) {
        throw new Error(
          `[POST-CORRECTIVE] Trigger ${spec.trigger} tgenabled expected '${IMMUTABILITY_TRIGGER_TGENABLED}'; ` +
          `got '${String(row.tgenabled)}'.`,
        )
      }
      const gotDef = String(row.triggerdef ?? '')
      if (gotDef !== spec.pg_get_triggerdef) {
        throw new Error(
          `[POST-CORRECTIVE] Trigger ${spec.trigger} pg_get_triggerdef mismatch.\n` +
          `  Expected: "${spec.pg_get_triggerdef}"\n` +
          `  Got:      "${gotDef}"`,
        )
      }
    }
  }
}

// Deferred constraint trigger on generation_jobs (trg_check_ledger_binding) — full fingerprint
export async function assertLedgerBindingTriggerPresent(query: QueryFn): Promise<void> {
  const spec = LEDGER_TRIGGER_SPEC
  const { rows } = await query(
    `SELECT
       t.tgname,
       t.tgenabled,
       t.tgtype::int                    AS tgtype,
       (t.tgconstraint <> 0)            AS tgisconstraint,
       t.tgdeferrable                   AS condeferrable,
       t.tginitdeferred                 AS condeferred,
       pg_get_triggerdef(t.oid, true)   AS triggerdef
     FROM pg_trigger t
     WHERE t.tgrelid = $1::regclass
       AND t.tgname = $2`,
    [`${spec.schema}.${spec.table}`, spec.name],
  )
  if (rows.length === 0) {
    throw new Error(
      `[POST-CORRECTIVE] ${spec.name} trigger not found on ${spec.schema}.${spec.table}. ` +
      `Corrective migration section 18 creates this DEFERRABLE INITIALLY DEFERRED constraint trigger.`,
    )
  }
  const row = rows[0]!
  if (row.tgenabled !== spec.tgenabled) {
    throw new Error(
      `[POST-CORRECTIVE] ${spec.name} tgenabled expected '${spec.tgenabled}'; got '${String(row.tgenabled)}'.`,
    )
  }
  const gotTgtype = typeof row.tgtype === 'string' ? parseInt(row.tgtype as string, 10) : Number(row.tgtype)
  if (gotTgtype !== spec.tgtype) {
    throw new Error(
      `[POST-CORRECTIVE] ${spec.name} tgtype expected ${spec.tgtype} (AFTER INSERT OR UPDATE FOR EACH ROW); got ${gotTgtype}.`,
    )
  }
  if (!!row.tgisconstraint !== spec.tgisconstraint) {
    throw new Error(
      `[POST-CORRECTIVE] ${spec.name} tgisconstraint expected ${spec.tgisconstraint}; got ${String(row.tgisconstraint)}.`,
    )
  }
  if (!!row.condeferrable !== spec.condeferrable) {
    throw new Error(
      `[POST-CORRECTIVE] ${spec.name} condeferrable expected ${spec.condeferrable}; got ${String(row.condeferrable)}.`,
    )
  }
  if (!!row.condeferred !== spec.condeferred) {
    throw new Error(
      `[POST-CORRECTIVE] ${spec.name} condeferred expected ${spec.condeferred}; got ${String(row.condeferred)}.`,
    )
  }
  const gotDef = String(row.triggerdef ?? '')
  if (gotDef !== spec.pg_get_triggerdef) {
    throw new Error(
      `[POST-CORRECTIVE] ${spec.name} pg_get_triggerdef mismatch.\n` +
      `  Expected: "${spec.pg_get_triggerdef}"\n` +
      `  Got:      "${gotDef}"`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. documents — complete constraint set (6 constraints, symmetric)
// Includes both D11 constraints and corrective additions. ON DELETE RESTRICT for
// the composite owner FK (document_analysis_document_owner_fk).
// ─────────────────────────────────────────────────────────────────────────────

export async function assertDocumentsCompleteConstraints(query: QueryFn): Promise<void> {
  await assertCompleteConstraintSet(query, 'documents', POST_CORRECTIVE_DOCUMENTS_CONSTRAINTS)
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. document_analysis — complete constraint set (6 constraints, symmetric)
// document_analysis_document_owner_fk is ON DELETE RESTRICT (NOT CASCADE).
// ─────────────────────────────────────────────────────────────────────────────

export async function assertDocumentAnalysisCompleteConstraints(query: QueryFn): Promise<void> {
  await assertCompleteConstraintSet(query, 'document_analysis', POST_CORRECTIVE_DOCUMENT_ANALYSIS_CONSTRAINTS)
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. documents and document_analysis — exact table ACL (section 33)
// postgres=arwdDxtm (all 8), authenticated=arwd (4), service_role=arwd (4)
// ─────────────────────────────────────────────────────────────────────────────

export async function assertDocumentsAcl(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL aclexplode(c.relacl) e
     WHERE n.nspname = 'public'
       AND c.relname = 'documents'
       AND c.relkind = 'r'
     ORDER BY grantee, privilege_type`,
  )
  compareAclTuples(rows, POST_CORRECTIVE_DOCUMENTS_ACL, 'documents table ACL (section 33)')
}

export async function assertDocumentAnalysisAcl(query: QueryFn): Promise<void> {
  const { rows } = await query(
    `SELECT
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL aclexplode(c.relacl) e
     WHERE n.nspname = 'public'
       AND c.relname = 'document_analysis'
       AND c.relkind = 'r'
     ORDER BY grantee, privilege_type`,
  )
  compareAclTuples(rows, POST_CORRECTIVE_DOCUMENTS_ACL, 'document_analysis table ACL (section 33)')
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Default ACL locked down after corrective migration
// ─────────────────────────────────────────────────────────────────────────────

function _defaultAclSortKey(t: DefaultAclTuple): string {
  return `${t.grantor}|${t.grantee}|${t.privilege_type}|${String(t.is_grantable)}`
}

export async function assertPostCorrectiveDefaultAcl(query: QueryFn): Promise<void> {
  for (const objtype of ['r', 'f', 'S'] as const) {
    const typeLabel = objtype === 'r' ? 'TABLE' : objtype === 'f' ? 'FUNCTION' : 'SEQUENCE'
    const { rows } = await query(
      `SELECT
         pg_catalog.pg_get_userbyid(e.grantor) AS grantor,
         CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
         e.privilege_type,
         e.is_grantable
       FROM pg_default_acl da
         JOIN pg_namespace n ON n.oid = da.defaclnamespace,
         LATERAL aclexplode(da.defaclacl) e
       WHERE n.nspname = 'public'
         AND da.defaclrole = 'postgres'::regrole
         AND da.defaclobjtype = $1
       ORDER BY grantor, grantee, privilege_type`,
      [objtype],
    )
    const expected = POST_CORRECTIVE_DEFAULT_ACL_TUPLES[objtype]!
    const got: DefaultAclTuple[] = rows.map(r => ({
      grantor:        r.grantor as string,
      grantee:        (r.grantee as string | null) ?? '',
      privilege_type: r.privilege_type as string,
      is_grantable:   r.is_grantable as boolean,
    })).sort((a, b) => _defaultAclSortKey(a).localeCompare(_defaultAclSortKey(b)))
    const exp = [...expected].sort((a, b) => _defaultAclSortKey(a).localeCompare(_defaultAclSortKey(b)))

    if (got.length !== exp.length) {
      throw new Error(
        `[POST-CORRECTIVE] default ${typeLabel} ACL (public/postgres): expected ${exp.length} tuples; got ${got.length}. ` +
        `Expected: ${JSON.stringify(exp)}. Actual: ${JSON.stringify(got)}. ` +
        `Corrective migration section 1b revokes broad defaults to owner-only.`,
      )
    }
    for (let i = 0; i < exp.length; i++) {
      const e = exp[i]!
      const g = got[i]!
      if (
        g.grantor !== e.grantor ||
        g.grantee !== e.grantee ||
        g.privilege_type !== e.privilege_type ||
        g.is_grantable !== e.is_grantable
      ) {
        throw new Error(
          `[POST-CORRECTIVE] default ${typeLabel} ACL mismatch at index ${i}. ` +
          `Expected (${e.grantor},${e.grantee},${e.privilege_type},${e.is_grantable}) ` +
          `got (${g.grantor},${g.grantee},${g.privilege_type},${g.is_grantable}).`,
        )
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export async function runStage3PostCorrectiveAssertions(query: QueryFn): Promise<void> {
  // generation_jobs post-corrective state
  await assertGenerationJobsPostCorrectiveShape(query)
  await assertGenerationJobsCompleteConstraints(query)
  await assertGenerationJobsAclRevoked(query)
  await assertGenerationJobsNoPolicies(query)
  await assertGenerationJobsCorrectiveIndexes(query)

  // New closed tables — column shapes (exact ordinal/name/nullable)
  await assertGenerationJobRequestsShape(query)
  await assertGenerationJobRequestsConstraints(query)
  await assertGenerationSourceSnapshotsShape(query)
  await assertGenerationSourceSnapshotsConstraints(query)
  await assertGenerationJobUsageShape(query)
  await assertGenerationJobUsageConstraints(query)

  // New closed tables — RLS, ACL, policy closure
  await assertClosedTablesExist(query)
  await assertClosedTablesRls(query)
  await assertClosedTablesAclRevoked(query)
  await assertClosedTablesNoPolicies(query)

  // study_visuals post-corrective state
  await assertStudyVisualsPostCorrectiveShape(query)
  await assertStudyVisualsCompleteConstraints(query)
  await assertStudyVisualsAclRevoked(query)
  await assertStudyVisualsNoPolicies(query)

  // Storage postconditions
  await assertStudyVisualsBucketPostCorrective(query)
  await assertPostCorrectiveStoragePolicies(query)

  // Functions (exact identity_args + exact ACL tuples)
  await assertCorrectiveFunctionsPresent(query)
  await assertCorrectiveFunctionGrants(query)

  // Triggers
  await assertImmutabilityTriggersPresent(query)
  await assertLedgerBindingTriggerPresent(query)

  // Open tables — complete constraints (symmetric) + exact ACL + default ACL
  await assertDocumentsCompleteConstraints(query)
  await assertDocumentAnalysisCompleteConstraints(query)
  await assertDocumentsAcl(query)
  await assertDocumentAnalysisAcl(query)
  await assertPostCorrectiveDefaultAcl(query)
}
