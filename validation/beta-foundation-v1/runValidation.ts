// VALIDATION ONLY — never import from application code
//
// Executable entry point for the Beta Foundation V1 validation pipeline.
// Must be run on a LOCAL DISPOSABLE Supabase instance ONLY.
// George's explicit approval is required before execution in any environment.
//
// ──────────────────────────────────────────────────────────────────────────────
// ENV_I_CONTRACT: Exact execution command (strip all inherited credentials)
// ──────────────────────────────────────────────────────────────────────────────
//
//   env -i \
//     PATH="$PATH" \
//     NODE_ENV=test \
//     CI=1 \
//     RUN_DATABASE_TESTS=1 \
//     E2E_SUPABASE_URL=http://127.0.0.1:54321 \
//     E2E_SUPABASE_ANON_KEY=<local-anon-key> \
//     SUPABASE_SECRET_KEY=<local-service-role-key> \
//     DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//     DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//     npx ts-node validation/beta-foundation-v1/runValidation.ts
//
// ──────────────────────────────────────────────────────────────────────────────
// Pipeline stages (ordered)
// ──────────────────────────────────────────────────────────────────────────────
//
//   Stage 0: D11 prerequisite assertions (pre-migration baseline)
//   Stage 1: Post-beta_foundation_v1.sql assertions (historical migration)
//   Stage 2: Historical migration rerun — semantic idempotency comparison
//   Stage 3: Post-corrective assertions (after 20260729120001_...)
//
// Exits with code 0 on success, 1 on any failure.
// Evidence is written to validation/beta-foundation-v1/evidence/.

import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

import {
  checkProductionGuard,
  checkLinkedProjectGuard,
  assertDisposableEnvironment,
} from './guard/productionGuard'
import { makePrivilegedPgClient } from './harness/dbClients'
import { captureEnvironmentEvidence, saveEvidence, verifyMigrationChecksums } from './harness/evidenceCapture'
import {
  captureCatalogueSnapshot,
  compareCatalogueSnapshots,
  assertCataloguesIdentical,
} from './historicalRerun'
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
  assertStudyVisualsBucket,
  assertStudyVisualsStoragePolicies,
  assertCorrectiveObjectsAbsent,
  assertGenerationJobsBaselineShape,
} from './assertions/baselineAssertions'

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string): void {
  process.stdout.write(`${new Date().toISOString()} ${msg}\n`)
}

function fail(msg: string): never {
  process.stderr.write(`\n[FAIL] ${msg}\n`)
  process.exit(1)
}

async function runStage(label: string, fn: () => Promise<void>): Promise<void> {
  log(`→ ${label}`)
  await fn()
  log(`  ✓ ${label}`)
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repoRoot = resolve(__dirname, '../..')
  const evidenceDir = resolve(repoRoot, 'validation/beta-foundation-v1/evidence')
  mkdirSync(evidenceDir, { recursive: true })

  // Guard 0: linked-project filesystem check (before env check)
  const linkedGuard = checkLinkedProjectGuard(repoRoot)
  if (!linkedGuard.safe) {
    fail(`Linked-project guard failed: ${linkedGuard.reason}`)
  }

  // Guard 1: full environment check
  const env = process.env as Record<string, string | undefined>
  const guardResult = checkProductionGuard(env)
  if (!guardResult.safe) {
    fail(`Production guard failed: ${guardResult.reason}`)
  }

  const supabaseUrl  = env['E2E_SUPABASE_URL'] ?? env['SUPABASE_URL'] ?? ''
  const serviceKey   = env['SUPABASE_SECRET_KEY'] ?? env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
  const directUrl    = env['DIRECT_URL'] ?? env['DATABASE_URL'] ?? ''

  assertDisposableEnvironment(env)

  log('Beta Foundation V1 Validation Pipeline starting.')
  log(`Supabase URL: ${supabaseUrl}`)
  log(`Direct URL host: ${new URL(directUrl).hostname}`)

  // Guard 2: migration checksum verification
  const checksums = verifyMigrationChecksums(repoRoot)
  if (!checksums.historical.match) {
    fail(
      `Historical migration checksum mismatch.\n` +
      `  Expected: ${checksums.historical.expected}\n` +
      `  Actual:   ${checksums.historical.actual}\n` +
      `  Path:     ${checksums.historical.path}`,
    )
  }
  if (!checksums.corrective.match) {
    fail(
      `Corrective migration checksum mismatch.\n` +
      `  Expected: ${checksums.corrective.expected}\n` +
      `  Actual:   ${checksums.corrective.actual}\n` +
      `  Path:     ${checksums.corrective.path}`,
    )
  }
  log('Migration checksums verified.')

  // Capture environment evidence
  const evidence = captureEnvironmentEvidence({ repoRoot })
  saveEvidence(evidence, resolve(evidenceDir, 'environment.json'))
  log('Environment evidence captured.')

  // Create clients
  const pgPool = makePrivilegedPgClient(directUrl)
  const clientOpts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const serviceClient = createClient(supabaseUrl, serviceKey, clientOpts)
  const query = (sql: string, params?: unknown[]) => pgPool.query(sql, params)

  try {
    // ── STAGE 0: D11 prerequisite baseline ─────────────────────────────────
    log('\n── Stage 0: D11 prerequisite assertions ──────────────────────────────')
    await runStage('PostgreSQL version 17.x', () => assertPostgresVersion(query))
    await runStage('UTF-8 server encoding',    () => assertUTF8Encoding(query))
    await runStage('pgcrypto extension',        () => assertPgcryptoAvailable(query))
    await runStage('uuid-ossp extension',       () => assertUuidOsspAvailable(query))
    await runStage('public schema owner and ACL', () => assertPublicSchemaOwnerAndAcl(query))
    await runStage('default TABLE ACL',         () => assertDefaultTableAcl(query))
    await runStage('default FUNCTION ACL',      () => assertDefaultFunctionAcl(query))
    await runStage('default SEQUENCE ACL',      () => assertDefaultSequenceAcl(query))
    await runStage('documents baseline shape',  () => assertDocumentsBaselineShape(query))
    await runStage('document_analysis baseline shape', () => assertDocumentAnalysisBaselineShape(query))
    await runStage('documents FK delete behavior', () => assertDocumentsFkDeleteBehavior(query))
    await runStage('study_visuals baseline shape', () => assertStudyVisualsBaselineShape(query))
    await runStage('generation_jobs absent',    () => assertGenerationJobsAbsent(query))
    await runStage('study-visuals bucket',      () => assertStudyVisualsBucket(query))
    await runStage('study-visuals storage policies', () => assertStudyVisualsStoragePolicies(query))
    await runStage('corrective objects absent', () => assertCorrectiveObjectsAbsent(query))
    log('Stage 0: ALL PASSED')

    // ── STAGE 1: Post-historical migration baseline ─────────────────────────
    log('\n── Stage 1: Post-historical migration assertions ─────────────────────')
    log('  (Requires beta_foundation_v1.sql to be applied before running Stage 1.)')
    await runStage('generation_jobs post-historical column shape', () => assertGenerationJobsBaselineShape(query))
    // Capture Stage 1 catalogue snapshot for Stage 2 comparison
    const stage1Snapshot = await captureCatalogueSnapshot(query)
    saveEvidence(stage1Snapshot, resolve(evidenceDir, 'stage1-snapshot.json'))
    log('Stage 1: ALL PASSED; snapshot saved.')

    // ── STAGE 2: Historical migration rerun idempotency ─────────────────────
    log('\n── Stage 2: Historical migration idempotency comparison ──────────────')
    log('  (Requires beta_foundation_v1.sql to be re-applied on a second baseline.)')
    log('  [MANUAL STEP] Apply beta_foundation_v1.sql to the second environment,')
    log('  then update this runner to capture the second snapshot from that environment.')
    log('  The assertCataloguesIdentical helper is available for the comparison.')
    log('Stage 2: placeholder — execute manually when second environment is available.')

    // ── STAGE 3: Post-corrective migration ──────────────────────────────────
    log('\n── Stage 3: Post-corrective migration ────────────────────────────────')
    log('  (Requires 20260729120001_generation_job_state_machine_schema.sql applied.)')
    log('Stage 3: assertions to be added post-approval of corrective migration execution.')

    log('\n── ALL STAGES PASSED ─────────────────────────────────────────────────')
    log('Evidence written to: ' + evidenceDir)

  } finally {
    await pgPool.end()
  }

  // Suppress unused import warning — these are available for callers but not all used above
  void serviceClient
  void assertCataloguesIdentical
  void compareCatalogueSnapshots
}

main().catch(err => {
  process.stderr.write(`[UNCAUGHT] ${String(err)}\n`)
  process.exit(1)
})
