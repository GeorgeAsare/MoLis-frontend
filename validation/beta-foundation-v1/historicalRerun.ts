// VALIDATION ONLY — never import from application code
//
// Schema snapshot capture and OID-ignoring semantic comparison for Stage 2 of
// the validation pipeline (historical-migration idempotency verification).
//
// Stage 2 applies beta_foundation_v1.sql a second time to a clean D11 baseline
// and compares the resulting catalogue state against the Stage 1 snapshot.
// Snapshots are compared WITHOUT OIDs so that fresh allocation on the second
// apply does not create false mismatches.
//
// DO NOT EXECUTE without George's approval and a local disposable environment.

export type QueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>

// ── Column snapshot ───────────────────────────────────────────────────────────

export interface ColumnSnapshot {
  schema:       string
  table:        string
  ordinal:      number
  name:         string
  data_type:    string
  udt_name:     string
  is_nullable:  string
  column_default: string | null
}

export async function captureColumnSnapshot(query: QueryFn): Promise<ColumnSnapshot[]> {
  const { rows } = await query(
    `SELECT
       table_schema        AS schema,
       table_name          AS table,
       ordinal_position    AS ordinal,
       column_name         AS name,
       data_type,
       udt_name,
       is_nullable,
       column_default
     FROM information_schema.columns
     WHERE table_schema IN ('public', 'storage')
     ORDER BY table_schema, table_name, ordinal_position`,
  )
  return rows as unknown as ColumnSnapshot[]
}

// ── Constraint snapshot (name + definition; OID-free) ─────────────────────────

export interface ConstraintSnapshot {
  schema:    string
  table:     string
  name:      string
  type:      string
  definition: string
}

export async function captureConstraintSnapshot(query: QueryFn): Promise<ConstraintSnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname            AS schema,
       c.relname            AS table,
       con.conname          AS name,
       con.contype          AS type,
       pg_get_constraintdef(con.oid, true) AS definition
     FROM pg_constraint con
       JOIN pg_class c     ON c.oid  = con.conrelid
       JOIN pg_namespace n ON n.oid  = c.relnamespace
     WHERE n.nspname IN ('public', 'storage')
     ORDER BY n.nspname, c.relname, con.conname`,
  )
  return rows as unknown as ConstraintSnapshot[]
}

// ── Function snapshot (signature + source; OID-free) ─────────────────────────

export interface FunctionSnapshot {
  schema:     string
  name:       string
  identity:   string   // pg_get_function_identity_arguments — stable signature
  language:   string
  returns:    string
}

export async function captureFunctionSnapshot(query: QueryFn): Promise<FunctionSnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname                           AS schema,
       p.proname                           AS name,
       pg_get_function_identity_arguments(p.oid) AS identity,
       l.lanname                           AS language,
       pg_get_function_result(p.oid)       AS returns
     FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_language  l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
     ORDER BY n.nspname, p.proname, identity`,
  )
  return rows as unknown as FunctionSnapshot[]
}

// ── Index snapshot (name + definition; OID-free) ──────────────────────────────

export interface IndexSnapshot {
  schema:     string
  table:      string
  name:       string
  is_unique:  boolean
  definition: string
}

export async function captureIndexSnapshot(query: QueryFn): Promise<IndexSnapshot[]> {
  const { rows } = await query(
    `SELECT
       schemaname AS schema,
       tablename  AS table,
       indexname  AS name,
       ix.indisunique AS is_unique,
       pg_get_indexdef(ix.indexrelid) AS definition
     FROM pg_indexes
       JOIN pg_class    ic ON ic.relname  = indexname
       JOIN pg_index    ix ON ix.indexrelid = ic.oid
       JOIN pg_namespace n ON n.oid = ic.relnamespace
     WHERE schemaname = 'public'
     ORDER BY schemaname, tablename, indexname`,
  )
  return rows as unknown as IndexSnapshot[]
}

// ── Catalogue snapshot (aggregates all above) ────────────────────────────────

export interface CatalogueSnapshot {
  capturedAt:  string
  columns:     ColumnSnapshot[]
  constraints: ConstraintSnapshot[]
  functions:   FunctionSnapshot[]
  indexes:     IndexSnapshot[]
}

export async function captureCatalogueSnapshot(query: QueryFn): Promise<CatalogueSnapshot> {
  const [columns, constraints, functions, indexes] = await Promise.all([
    captureColumnSnapshot(query),
    captureConstraintSnapshot(query),
    captureFunctionSnapshot(query),
    captureIndexSnapshot(query),
  ])
  return {
    capturedAt:  new Date().toISOString(),
    columns,
    constraints,
    functions,
    indexes,
  }
}

// ── Semantic comparison ───────────────────────────────────────────────────────

export interface SnapshotDelta {
  onlyInA: Record<string, unknown>[]
  onlyInB: Record<string, unknown>[]
}

function toKey(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort())
}

function diffArrays(
  a: Record<string, unknown>[],
  b: Record<string, unknown>[],
): SnapshotDelta {
  const setA = new Set(a.map(toKey))
  const setB = new Set(b.map(toKey))
  return {
    onlyInA: a.filter(x => !setB.has(toKey(x))),
    onlyInB: b.filter(x => !setA.has(toKey(x))),
  }
}

export interface CatalogueComparison {
  identical:   boolean
  columns:     SnapshotDelta
  constraints: SnapshotDelta
  functions:   SnapshotDelta
  indexes:     SnapshotDelta
}

export function compareCatalogueSnapshots(
  a: CatalogueSnapshot,
  b: CatalogueSnapshot,
): CatalogueComparison {
  const columns     = diffArrays(a.columns     as unknown as Record<string, unknown>[], b.columns     as unknown as Record<string, unknown>[])
  const constraints = diffArrays(a.constraints as unknown as Record<string, unknown>[], b.constraints as unknown as Record<string, unknown>[])
  const functions   = diffArrays(a.functions   as unknown as Record<string, unknown>[], b.functions   as unknown as Record<string, unknown>[])
  const indexes     = diffArrays(a.indexes     as unknown as Record<string, unknown>[], b.indexes     as unknown as Record<string, unknown>[])

  const identical =
    columns.onlyInA.length     === 0 && columns.onlyInB.length     === 0 &&
    constraints.onlyInA.length === 0 && constraints.onlyInB.length === 0 &&
    functions.onlyInA.length   === 0 && functions.onlyInB.length   === 0 &&
    indexes.onlyInA.length     === 0 && indexes.onlyInB.length     === 0

  return { identical, columns, constraints, functions, indexes }
}

export function assertCataloguesIdentical(
  comparison: CatalogueComparison,
  label: string,
): void {
  if (!comparison.identical) {
    const lines: string[] = [`[HISTORICAL RERUN] Catalogue mismatch: ${label}`]
    if (comparison.columns.onlyInA.length > 0 || comparison.columns.onlyInB.length > 0) {
      lines.push(`  columns only in A: ${JSON.stringify(comparison.columns.onlyInA)}`)
      lines.push(`  columns only in B: ${JSON.stringify(comparison.columns.onlyInB)}`)
    }
    if (comparison.constraints.onlyInA.length > 0 || comparison.constraints.onlyInB.length > 0) {
      lines.push(`  constraints only in A: ${JSON.stringify(comparison.constraints.onlyInA)}`)
      lines.push(`  constraints only in B: ${JSON.stringify(comparison.constraints.onlyInB)}`)
    }
    if (comparison.functions.onlyInA.length > 0 || comparison.functions.onlyInB.length > 0) {
      lines.push(`  functions only in A: ${JSON.stringify(comparison.functions.onlyInA)}`)
      lines.push(`  functions only in B: ${JSON.stringify(comparison.functions.onlyInB)}`)
    }
    if (comparison.indexes.onlyInA.length > 0 || comparison.indexes.onlyInB.length > 0) {
      lines.push(`  indexes only in A: ${JSON.stringify(comparison.indexes.onlyInA)}`)
      lines.push(`  indexes only in B: ${JSON.stringify(comparison.indexes.onlyInB)}`)
    }
    throw new Error(lines.join('\n'))
  }
}
