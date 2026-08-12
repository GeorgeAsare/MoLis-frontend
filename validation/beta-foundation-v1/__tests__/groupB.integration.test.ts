// VALIDATION ONLY — never import from application code
//
// Group B: Database integration tests for the Beta Foundation V1 validation harness.
//
// ── Skip guard ────────────────────────────────────────────────────────────────
// ALL tests in this file skip unless RUN_DATABASE_TESTS=1.
// Never set RUN_DATABASE_TESTS=1 against a production or shared environment.
// These tests require a LOCAL disposable Supabase instance only.
//
// ── Stage dependencies ────────────────────────────────────────────────────────
// Stage 0 tests expect the D11 pre-migration state (before beta_foundation_v1.sql).
// Stage 1 tests expect the post-historical state (after beta_foundation_v1.sql,
//   before corrective migration).
// Stage 3 tests expect the post-corrective state (after corrective migration).
// Run each describe block against the appropriate pipeline stage.
//
// ── Expected skip count in normal vitest run ──────────────────────────────────
// Total: 49 tests, all skipped (RUN_DATABASE_TESTS not set).
// Stage 0: 21  |  Stage 1: 3  |  Stage 3: 25

import { describe, it, beforeAll, afterAll } from 'vitest'
import { makePrivilegedPgClient, type PgPool } from '../harness/dbClients'

// Stage 0 assertions
import {
  assertPostgresVersion,
  assertUTF8Encoding,
  assertPgcryptoAvailable,
  assertUuidOsspAvailable,
  assertPublicSchemaOwnerAndAcl,
  assertDefaultTableAcl,
  assertDefaultFunctionAcl,
  assertDefaultSequenceAcl,
  assertDocumentsBaselineShape,
  assertDocumentAnalysisBaselineShape,
  assertDocumentsFkDeleteBehavior,
  assertStudyVisualsBaselineShape,
  assertGenerationJobsAbsent,
  assertRlsEnabledOnPreMigrationTables,
  assertStudyVisualsBaselinePolicy,
  assertTriggerFunctions,
  assertAllTriggerDependants,
  assertStudyVisualsBucket,
  assertStudyVisualsStoragePolicies,
  assertBaselineTableAcls,
  assertCorrectiveObjectsAbsent,
  // Stage 1
  assertGenerationJobsBaselineShape,
  assertGenerationJobsBaselinePolicy,
  assertRlsEnabledOnAllTargetTables,
} from '../assertions/baselineAssertions'

// Stage 3 assertions
import {
  assertGenerationJobsPostCorrectiveShape,
  assertGenerationJobsCompleteConstraints,
  assertGenerationJobsAclRevoked,
  assertGenerationJobsNoPolicies,
  assertGenerationJobsCorrectiveIndexes,
  assertGenerationJobRequestsShape,
  assertGenerationJobRequestsConstraints,
  assertGenerationSourceSnapshotsShape,
  assertGenerationSourceSnapshotsConstraints,
  assertGenerationJobUsageShape,
  assertGenerationJobUsageConstraints,
  assertClosedTablesExist,
  assertClosedTablesRls,
  assertClosedTablesAclRevoked,
  assertClosedTablesNoPolicies,
  assertStudyVisualsPostCorrectiveShape,
  assertStudyVisualsCompleteConstraints,
  assertStudyVisualsAclRevoked,
  assertStudyVisualsNoPolicies,
  assertStudyVisualsBucketPostCorrective,
  assertPostCorrectiveStoragePolicies,
  assertCorrectiveFunctionsPresent,
  assertCorrectiveFunctionGrants,
  assertImmutabilityTriggersPresent,
  assertLedgerBindingTriggerPresent,
  assertDocumentsCompleteConstraints,
  assertDocumentsAcl,
  assertDocumentAnalysisCompleteConstraints,
  assertDocumentAnalysisAcl,
  assertPostCorrectiveDefaultAcl,
} from '../assertions/postCorrectiveAssertions'

const SKIP = process.env['RUN_DATABASE_TESTS'] !== '1'

// ── Shared pg pool (created only when SKIP=false) ────────────────────────────

let pgPool: PgPool | null = null
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
let query: QueryFn = () => Promise.reject(new Error('DB not initialized'))

beforeAll(() => {
  if (SKIP) return
  const directUrl = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? ''
  if (!directUrl) throw new Error('[Group B] DIRECT_URL / DATABASE_URL must be set when RUN_DATABASE_TESTS=1')
  pgPool = makePrivilegedPgClient(directUrl)
  query  = (sql, params) => pgPool!.query(sql, params)
})

afterAll(async () => {
  if (pgPool) await pgPool.end()
})

// ─────────────────────────────────────────────────────────────────────────────
// Stage 0: Pre-migration baseline assertions (21 tests)
// Run against D11 state: AFTER d11-baseline.sql, BEFORE beta_foundation_v1.sql.
// ─────────────────────────────────────────────────────────────────────────────

describe('Group B — Stage 0: Pre-migration baseline', () => {

  it.skipIf(SKIP)('PostgreSQL version is 17.x', async () => {
    await assertPostgresVersion(query)
  })

  it.skipIf(SKIP)('server encoding is UTF-8', async () => {
    await assertUTF8Encoding(query)
  })

  it.skipIf(SKIP)('pgcrypto extension present', async () => {
    await assertPgcryptoAvailable(query)
  })

  it.skipIf(SKIP)('uuid-ossp extension present', async () => {
    await assertUuidOsspAvailable(query)
  })

  it.skipIf(SKIP)('public schema owner and ACL match D11 SA10', async () => {
    await assertPublicSchemaOwnerAndAcl(query)
  })

  it.skipIf(SKIP)('default TABLE ACL matches D11 SA11', async () => {
    await assertDefaultTableAcl(query)
  })

  it.skipIf(SKIP)('default FUNCTION ACL matches D11 SA11 pre-migration state', async () => {
    await assertDefaultFunctionAcl(query)
  })

  it.skipIf(SKIP)('default SEQUENCE ACL matches D11 SA11', async () => {
    await assertDefaultSequenceAcl(query)
  })

  it.skipIf(SKIP)('documents baseline column shape (10 cols, exact ordinal/udt/default)', async () => {
    await assertDocumentsBaselineShape(query)
  })

  it.skipIf(SKIP)('document_analysis baseline column shape (22 cols, exact ordinal/udt/default)', async () => {
    await assertDocumentAnalysisBaselineShape(query)
  })

  it.skipIf(SKIP)('documents FK delete behavior matches D11 (CASCADE/SET NULL)', async () => {
    await assertDocumentsFkDeleteBehavior(query)
  })

  it.skipIf(SKIP)('study_visuals baseline column shape (6 cols, exact ordinal/udt/default)', async () => {
    await assertStudyVisualsBaselineShape(query)
  })

  it.skipIf(SKIP)('generation_jobs absent in pre-migration state', async () => {
    await assertGenerationJobsAbsent(query)
  })

  it.skipIf(SKIP)('RLS enabled on pre-migration tables (documents, document_analysis, study_visuals)', async () => {
    await assertRlsEnabledOnPreMigrationTables(query)
  })

  it.skipIf(SKIP)('study_visuals baseline RLS policy (study_visuals_owner_all, exact USING/WITH CHECK)', async () => {
    await assertStudyVisualsBaselinePolicy(query)
  })

  it.skipIf(SKIP)('all 5 D11 trigger functions present', async () => {
    await assertTriggerFunctions(query)
  })

  it.skipIf(SKIP)('all 7 D11 trigger dependants present (exact table/event/timing)', async () => {
    await assertAllTriggerDependants(query)
  })

  it.skipIf(SKIP)('study-visuals bucket exists with D11 config (public=true, no size/MIME limit)', async () => {
    await assertStudyVisualsBucket(query)
  })

  it.skipIf(SKIP)('study-visuals storage policies match D11 (4 permissive + 7 unrelated, exact clauses)', async () => {
    await assertStudyVisualsStoragePolicies(query)
  })

  it.skipIf(SKIP)('D11 table ACLs: arwdDxtm for postgres/anon/authenticated/service_role on 3 pre-migration tables', async () => {
    await assertBaselineTableAcls(query)
  })

  it.skipIf(SKIP)('all corrective objects absent in pre-migration state', async () => {
    await assertCorrectiveObjectsAbsent(query)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Post-historical migration assertions (3 tests)
// Run AFTER beta_foundation_v1.sql, BEFORE corrective migration.
// ─────────────────────────────────────────────────────────────────────────────

describe('Group B — Stage 1: Post-historical migration', () => {

  it.skipIf(SKIP)('generation_jobs baseline column shape (13 cols, exact ordinal/udt/default)', async () => {
    await assertGenerationJobsBaselineShape(query)
  })

  it.skipIf(SKIP)('generation_jobs baseline RLS policy ("Users see own jobs", exact USING clause)', async () => {
    await assertGenerationJobsBaselinePolicy(query)
  })

  it.skipIf(SKIP)('RLS enabled on all 4 target tables (documents, document_analysis, generation_jobs, study_visuals)', async () => {
    await assertRlsEnabledOnAllTargetTables(query)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Post-corrective assertions (25 tests)
// Run AFTER 20260729120001_generation_job_state_machine_schema.sql is applied.
// ─────────────────────────────────────────────────────────────────────────────

describe('Group B — Stage 3: Post-corrective', () => {

  // ── generation_jobs ────────────────────────────────────────────────────────

  it.skipIf(SKIP)('generation_jobs post-corrective column shape (28 cols, exact ordinal/udt/default)', async () => {
    await assertGenerationJobsPostCorrectiveShape(query)
  })

  it.skipIf(SKIP)('generation_jobs complete constraint set (12 constraints, symmetric equality, exact pg_get_constraintdef)', async () => {
    await assertGenerationJobsCompleteConstraints(query)
  })

  it.skipIf(SKIP)('generation_jobs table ACL: exact tuples — only postgres after section 32 REVOKE', async () => {
    await assertGenerationJobsAclRevoked(query)
  })

  it.skipIf(SKIP)('generation_jobs has no RLS policies (deny-all via RLS with no policy)', async () => {
    await assertGenerationJobsNoPolicies(query)
  })

  it.skipIf(SKIP)('generation_jobs corrective partial indexes present and old status index dropped', async () => {
    await assertGenerationJobsCorrectiveIndexes(query)
  })

  // ── generation_job_requests ────────────────────────────────────────────────

  it.skipIf(SKIP)('generation_job_requests column shape (9 cols, exact ordinal/udt/default)', async () => {
    await assertGenerationJobRequestsShape(query)
  })

  it.skipIf(SKIP)('generation_job_requests complete constraint set (9 constraints, symmetric equality)', async () => {
    await assertGenerationJobRequestsConstraints(query)
  })

  // ── generation_source_snapshots ────────────────────────────────────────────

  it.skipIf(SKIP)('generation_source_snapshots column shape (18 cols, exact ordinal/udt/default)', async () => {
    await assertGenerationSourceSnapshotsShape(query)
  })

  it.skipIf(SKIP)('generation_source_snapshots complete constraint set (7 constraints, symmetric equality)', async () => {
    await assertGenerationSourceSnapshotsConstraints(query)
  })

  // ── generation_job_usage ───────────────────────────────────────────────────

  it.skipIf(SKIP)('generation_job_usage column shape (12 cols, exact ordinal/udt/default)', async () => {
    await assertGenerationJobUsageShape(query)
  })

  it.skipIf(SKIP)('generation_job_usage complete constraint set (4 constraints, symmetric equality)', async () => {
    await assertGenerationJobUsageConstraints(query)
  })

  // ── Closed tables (generation_job_requests, generation_source_snapshots, generation_job_usage)

  it.skipIf(SKIP)('closed tables exist in public schema', async () => {
    await assertClosedTablesExist(query)
  })

  it.skipIf(SKIP)('closed tables have RLS enabled', async () => {
    await assertClosedTablesRls(query)
  })

  it.skipIf(SKIP)('closed tables ACL: exact tuples — only postgres (section 32 REVOKE ALL)', async () => {
    await assertClosedTablesAclRevoked(query)
  })

  it.skipIf(SKIP)('closed tables have no RLS policies (deny-all via RLS with no policy)', async () => {
    await assertClosedTablesNoPolicies(query)
  })

  // ── study_visuals ──────────────────────────────────────────────────────────

  it.skipIf(SKIP)('study_visuals post-corrective column shape (10 cols, exact ordinal/udt/default)', async () => {
    await assertStudyVisualsPostCorrectiveShape(query)
  })

  it.skipIf(SKIP)('study_visuals complete constraint set (10 constraints, symmetric equality)', async () => {
    await assertStudyVisualsCompleteConstraints(query)
  })

  it.skipIf(SKIP)('study_visuals table ACL: exact tuples — only postgres (section 32 REVOKE ALL)', async () => {
    await assertStudyVisualsAclRevoked(query)
  })

  it.skipIf(SKIP)('study_visuals has no RLS policies (study_visuals_owner_all dropped)', async () => {
    await assertStudyVisualsNoPolicies(query)
  })

  // ── Storage ────────────────────────────────────────────────────────────────

  it.skipIf(SKIP)('study-visuals bucket: public=false, file_size_limit=5242880, allowed_mime_types=[image/png]', async () => {
    await assertStudyVisualsBucketPostCorrective(query)
  })

  it.skipIf(SKIP)('storage.objects has exactly 9 policies with correct cmd/mode/role/USING/WITH CHECK', async () => {
    await assertPostCorrectiveStoragePolicies(query)
  })

  // ── Corrective functions ───────────────────────────────────────────────────

  it.skipIf(SKIP)('all 20 corrective functions: exact identity_args, owner=postgres, SECURITY DEFINER, provolatile, proconfig', async () => {
    await assertCorrectiveFunctionsPresent(query)
  })

  it.skipIf(SKIP)('all 20 corrective function grants: exact ACL tuples (aclexplode) per function per category', async () => {
    await assertCorrectiveFunctionGrants(query)
  })

  // ── Triggers ───────────────────────────────────────────────────────────────

  it.skipIf(SKIP)('immutability triggers present (tgtype=27, tgenabled=O) and ledger binding trigger deferrable', async () => {
    await assertImmutabilityTriggersPresent(query)
    await assertLedgerBindingTriggerPresent(query)
  })

  // ── Open tables (documents, document_analysis) — constraints + ACL + default ACL ──

  it.skipIf(SKIP)(
    'documents (6 constraints symmetric) + document_analysis (6 constraints, RESTRICT FK) + both ACLs exact + default ACL locked',
    async () => {
      await assertDocumentsCompleteConstraints(query)
      await assertDocumentsAcl(query)
      await assertDocumentAnalysisCompleteConstraints(query)
      await assertDocumentAnalysisAcl(query)
      await assertPostCorrectiveDefaultAcl(query)
    },
  )

})
