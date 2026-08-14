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
  schema:         string
  table:          string
  ordinal:        number
  name:           string
  data_type:      string
  udt_name:       string
  is_nullable:    string
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
  schema:     string
  table:      string
  name:       string
  type:       string
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

// ── Function snapshot (full fingerprint; OID-free) ────────────────────────────

export interface FunctionSnapshot {
  schema:           string
  name:             string
  identity:         string   // pg_get_function_identity_arguments — stable signature
  language:         string
  returns:          string
  security_definer: boolean
  proconfig:        string | null  // GUC overrides as array text, e.g. '{search_path=public}'
  acl_text:         string | null  // proacl::text — exact grant set
}

export async function captureFunctionSnapshot(query: QueryFn): Promise<FunctionSnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname                                AS schema,
       p.proname                                AS name,
       pg_get_function_identity_arguments(p.oid) AS identity,
       l.lanname                                AS language,
       pg_get_function_result(p.oid)            AS returns,
       p.prosecdef                              AS security_definer,
       p.proconfig::text                        AS proconfig,
       p.proacl::text                           AS acl_text
     FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_language  l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
     ORDER BY n.nspname, p.proname, identity`,
  )
  return rows as unknown as FunctionSnapshot[]
}

// ── Index snapshot (OID-safe; uses pg_index join rather than pg_indexes name join) ──

export interface IndexSnapshot {
  schema:     string
  table:      string
  name:       string
  is_unique:  boolean
  is_primary: boolean
  is_partial: boolean
  definition: string
}

export async function captureIndexSnapshot(query: QueryFn): Promise<IndexSnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname              AS schema,
       ct.relname             AS table,
       ci.relname             AS name,
       ix.indisunique         AS is_unique,
       ix.indisprimary        AS is_primary,
       (ix.indpred IS NOT NULL) AS is_partial,
       pg_get_indexdef(ix.indexrelid) AS definition
     FROM pg_index    ix
       JOIN pg_class  ci ON ci.oid = ix.indexrelid
       JOIN pg_class  ct ON ct.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = ct.relnamespace
     WHERE n.nspname = 'public'
     ORDER BY n.nspname, ct.relname, ci.relname`,
  )
  return rows as unknown as IndexSnapshot[]
}

// ── RLS snapshot ──────────────────────────────────────────────────────────────

export interface RlsSnapshot {
  schema:  string
  table:   string
  enabled: boolean
  forced:  boolean
}

export async function captureRlsSnapshot(query: QueryFn): Promise<RlsSnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname          AS schema,
       c.relname          AS table,
       c.relrowsecurity   AS enabled,
       c.relforcerowsecurity AS forced
     FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
     ORDER BY n.nspname, c.relname`,
  )
  return rows as unknown as RlsSnapshot[]
}

// ── Policy snapshot ───────────────────────────────────────────────────────────

export interface PolicySnapshot {
  schema:     string
  table:      string
  name:       string
  cmd:        string
  permissive: string
  roles:      string
  qual:       string | null
  with_check: string | null
}

export async function capturePolicySnapshot(query: QueryFn): Promise<PolicySnapshot[]> {
  const { rows } = await query(
    `SELECT
       schemaname  AS schema,
       tablename   AS table,
       policyname  AS name,
       cmd,
       permissive,
       roles::text AS roles,
       qual,
       with_check
     FROM pg_policies
     WHERE schemaname = 'public'
     ORDER BY schemaname, tablename, policyname`,
  )
  return rows as unknown as PolicySnapshot[]
}

// ── Table ACL snapshot (relacl text; OID-free via aclexplode) ─────────────────

export interface TableAclSnapshot {
  schema:         string
  table:          string
  grantee:        string
  privilege_type: string
  is_grantable:   boolean
}

export async function captureTableAclSnapshot(query: QueryFn): Promise<TableAclSnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname AS schema,
       c.relname AS table,
       CASE WHEN e.grantee = 0 THEN '' ELSE pg_catalog.pg_get_userbyid(e.grantee) END AS grantee,
       e.privilege_type,
       e.is_grantable
     FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL aclexplode(c.relacl) e
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
     ORDER BY n.nspname, c.relname, grantee, e.privilege_type`,
  )
  return rows as unknown as TableAclSnapshot[]
}

// ── Trigger snapshot (OID-free via function name join) ───────────────────────

export interface TriggerSnapshot {
  schema:        string
  table:         string
  name:          string
  function_name: string
  tgtype:        number
  tgenabled:     string
  tgdeferrable:  boolean
  tginitdeferred:boolean
  tgisinternal:  boolean
}

export async function captureTriggerSnapshot(query: QueryFn): Promise<TriggerSnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname          AS schema,
       ct.relname         AS table,
       t.tgname           AS name,
       p.proname          AS function_name,
       t.tgtype           AS tgtype,
       t.tgenabled        AS tgenabled,
       t.tgdeferrable     AS tgdeferrable,
       t.tginitdeferred   AS tginitdeferred,
       t.tgisinternal     AS tgisinternal
     FROM pg_trigger t
       JOIN pg_class  ct ON ct.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = ct.relnamespace
       JOIN pg_proc p     ON p.oid  = t.tgfoid
     WHERE n.nspname = 'public'
       AND NOT t.tgisinternal
     ORDER BY n.nspname, ct.relname, t.tgname`,
  )
  return rows as unknown as TriggerSnapshot[]
}

// ── Storage snapshot (bucket config) ─────────────────────────────────────────

export interface StorageSnapshot {
  id:                 string
  name:               string
  public:             boolean
  file_size_limit:    number | null
  allowed_mime_types: string | null  // array serialized as text for comparison
}

export async function captureStorageSnapshot(query: QueryFn): Promise<StorageSnapshot[]> {
  const { rows } = await query(
    `SELECT
       id,
       name,
       public,
       file_size_limit,
       allowed_mime_types::text AS allowed_mime_types
     FROM storage.buckets
     ORDER BY id`,
  )
  return rows as unknown as StorageSnapshot[]
}

// ── Default ACL snapshot ──────────────────────────────────────────────────────
// Captures pg_default_acl entries for the public schema. The corrective migration
// revokes all broad defaults (anon/authenticated/service_role) in section 1b.
// Including this in the idempotency snapshot detects unexpected ACL mutations on re-apply.

export interface DefaultAclSnapshot {
  role:      string   // pg_get_userbyid of defaclrole
  namespace: string
  objtype:   string   // 'r'=TABLE, 'f'=FUNCTION, 'S'=SEQUENCE
  acl_text:  string   // defaclacl::text
}

export async function captureDefaultAclSnapshot(query: QueryFn): Promise<DefaultAclSnapshot[]> {
  const { rows } = await query(
    `SELECT
       pg_catalog.pg_get_userbyid(da.defaclrole)::text AS role,
       n.nspname AS namespace,
       da.defaclobjtype::text AS objtype,
       da.defaclacl::text AS acl_text
     FROM pg_default_acl da
       JOIN pg_namespace n ON n.oid = da.defaclnamespace
     WHERE n.nspname IN ('public', 'storage')
     ORDER BY role, namespace, objtype`,
  )
  return rows as unknown as DefaultAclSnapshot[]
}

// ── Function body snapshot (full source) ──────────────────────────────────────
// Captures pg_get_functiondef output for all public-schema functions.
// Detects any mutation to function bodies between the two historical applies.

export interface FunctionBodySnapshot {
  schema:          string
  name:            string
  identity:        string   // pg_get_function_identity_arguments — stable signature
  full_definition: string   // pg_get_functiondef — includes body, language, security attributes
}

export async function captureFunctionBodySnapshot(query: QueryFn): Promise<FunctionBodySnapshot[]> {
  const { rows } = await query(
    `SELECT
       n.nspname AS schema,
       p.proname AS name,
       pg_get_function_identity_arguments(p.oid) AS identity,
       pg_get_functiondef(p.oid) AS full_definition
     FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
     ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)`,
  )
  return rows as unknown as FunctionBodySnapshot[]
}

// ── Storage policy snapshot (storage.objects) ─────────────────────────────────
// Captures RLS policies in the storage schema.  Separate from the public-schema
// policy snapshot because the corrective migration both drops and creates storage
// policies; this section ensures re-apply of the historical migration does not
// alter storage policies.

export interface StoragePolicySnapshot {
  schema:     string
  table:      string
  name:       string
  cmd:        string
  permissive: string
  roles:      string
  qual:       string | null
  with_check: string | null
}

export async function captureStoragePolicySnapshot(query: QueryFn): Promise<StoragePolicySnapshot[]> {
  const { rows } = await query(
    `SELECT
       schemaname  AS schema,
       tablename   AS table,
       policyname  AS name,
       cmd,
       permissive,
       roles::text AS roles,
       qual,
       with_check
     FROM pg_policies
     WHERE schemaname = 'storage'
     ORDER BY schemaname, tablename, policyname`,
  )
  return rows as unknown as StoragePolicySnapshot[]
}

// ── Catalogue snapshot (aggregates all sections) ─────────────────────────────

export interface CatalogueSnapshot {
  capturedAt:      string
  columns:         ColumnSnapshot[]
  constraints:     ConstraintSnapshot[]
  functions:       FunctionSnapshot[]
  indexes:         IndexSnapshot[]
  rls:             RlsSnapshot[]
  policies:        PolicySnapshot[]
  tableAcls:       TableAclSnapshot[]
  triggers:        TriggerSnapshot[]
  storage:         StorageSnapshot[]
  defaultAcls:     DefaultAclSnapshot[]
  functionBodies:  FunctionBodySnapshot[]
  storagePolicies: StoragePolicySnapshot[]
}

export async function captureCatalogueSnapshot(query: QueryFn): Promise<CatalogueSnapshot> {
  const [
    columns, constraints, functions, indexes,
    rls, policies, tableAcls, triggers, storage,
    defaultAcls, functionBodies, storagePolicies,
  ] = await Promise.all([
    captureColumnSnapshot(query),
    captureConstraintSnapshot(query),
    captureFunctionSnapshot(query),
    captureIndexSnapshot(query),
    captureRlsSnapshot(query),
    capturePolicySnapshot(query),
    captureTableAclSnapshot(query),
    captureTriggerSnapshot(query),
    captureStorageSnapshot(query),
    captureDefaultAclSnapshot(query),
    captureFunctionBodySnapshot(query),
    captureStoragePolicySnapshot(query),
  ])
  return {
    capturedAt: new Date().toISOString(),
    columns,
    constraints,
    functions,
    indexes,
    rls,
    policies,
    tableAcls,
    triggers,
    storage,
    defaultAcls,
    functionBodies,
    storagePolicies,
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
  identical:       boolean
  columns:         SnapshotDelta
  constraints:     SnapshotDelta
  functions:       SnapshotDelta
  indexes:         SnapshotDelta
  rls:             SnapshotDelta
  policies:        SnapshotDelta
  tableAcls:       SnapshotDelta
  triggers:        SnapshotDelta
  storage:         SnapshotDelta
  defaultAcls:     SnapshotDelta
  functionBodies:  SnapshotDelta
  storagePolicies: SnapshotDelta
}

export function compareCatalogueSnapshots(
  a: CatalogueSnapshot,
  b: CatalogueSnapshot,
): CatalogueComparison {
  type R = Record<string, unknown>
  const columns         = diffArrays(a.columns         as unknown as R[], b.columns         as unknown as R[])
  const constraints     = diffArrays(a.constraints     as unknown as R[], b.constraints     as unknown as R[])
  const functions       = diffArrays(a.functions       as unknown as R[], b.functions       as unknown as R[])
  const indexes         = diffArrays(a.indexes         as unknown as R[], b.indexes         as unknown as R[])
  const rls             = diffArrays(a.rls             as unknown as R[], b.rls             as unknown as R[])
  const policies        = diffArrays(a.policies        as unknown as R[], b.policies        as unknown as R[])
  const tableAcls       = diffArrays(a.tableAcls       as unknown as R[], b.tableAcls       as unknown as R[])
  const triggers        = diffArrays(a.triggers        as unknown as R[], b.triggers        as unknown as R[])
  const storage         = diffArrays(a.storage         as unknown as R[], b.storage         as unknown as R[])
  const defaultAcls     = diffArrays(a.defaultAcls     as unknown as R[], b.defaultAcls     as unknown as R[])
  const functionBodies  = diffArrays(a.functionBodies  as unknown as R[], b.functionBodies  as unknown as R[])
  const storagePolicies = diffArrays(a.storagePolicies as unknown as R[], b.storagePolicies as unknown as R[])

  const identical =
    columns.onlyInA.length         === 0 && columns.onlyInB.length         === 0 &&
    constraints.onlyInA.length     === 0 && constraints.onlyInB.length     === 0 &&
    functions.onlyInA.length       === 0 && functions.onlyInB.length       === 0 &&
    indexes.onlyInA.length         === 0 && indexes.onlyInB.length         === 0 &&
    rls.onlyInA.length             === 0 && rls.onlyInB.length             === 0 &&
    policies.onlyInA.length        === 0 && policies.onlyInB.length        === 0 &&
    tableAcls.onlyInA.length       === 0 && tableAcls.onlyInB.length       === 0 &&
    triggers.onlyInA.length        === 0 && triggers.onlyInB.length        === 0 &&
    storage.onlyInA.length         === 0 && storage.onlyInB.length         === 0 &&
    defaultAcls.onlyInA.length     === 0 && defaultAcls.onlyInB.length     === 0 &&
    functionBodies.onlyInA.length  === 0 && functionBodies.onlyInB.length  === 0 &&
    storagePolicies.onlyInA.length === 0 && storagePolicies.onlyInB.length === 0

  return {
    identical,
    columns, constraints, functions, indexes, rls, policies,
    tableAcls, triggers, storage,
    defaultAcls, functionBodies, storagePolicies,
  }
}

export function assertCataloguesIdentical(
  comparison: CatalogueComparison,
  label: string,
): void {
  if (!comparison.identical) {
    const lines: string[] = [`[HISTORICAL RERUN] Catalogue mismatch: ${label}`]
    const sections: Array<[string, SnapshotDelta]> = [
      ['columns',         comparison.columns],
      ['constraints',     comparison.constraints],
      ['functions',       comparison.functions],
      ['indexes',         comparison.indexes],
      ['rls',             comparison.rls],
      ['policies',        comparison.policies],
      ['tableAcls',       comparison.tableAcls],
      ['triggers',        comparison.triggers],
      ['storage',         comparison.storage],
      ['defaultAcls',     comparison.defaultAcls],
      ['functionBodies',  comparison.functionBodies],
      ['storagePolicies', comparison.storagePolicies],
    ]
    for (const [section, delta] of sections) {
      if (delta.onlyInA.length > 0 || delta.onlyInB.length > 0) {
        lines.push(`  ${section} only in A: ${JSON.stringify(delta.onlyInA)}`)
        lines.push(`  ${section} only in B: ${JSON.stringify(delta.onlyInB)}`)
      }
    }
    throw new Error(lines.join('\n'))
  }
}
