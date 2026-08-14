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
// Pipeline stages (ordered — all fully deterministic, no manual steps)
// ──────────────────────────────────────────────────────────────────────────────
//
//   Stage 0: D11 prerequisite assertions (pre-migration baseline)
//   → apply beta_foundation_v1.sql (first time, via psql child process)
//   Stage 1: Post-beta_foundation_v1.sql assertions + capture catalogue snapshot A
//   → apply beta_foundation_v1.sql (second time — idempotency test)
//   Stage 2: Capture snapshot B; compare A vs B; fail non-zero on any semantic drift
//   → apply 20260729120001_generation_job_state_machine_schema.sql
//   Stage 3: Post-corrective assertions
//
// Exits with code 0 on success, 1 on any failure.
// Evidence is written to validation/beta-foundation-v1/evidence/.

import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

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
  runStage0PreMigrationAssertions,
  runStage1PostHistoricalAssertions,
} from './assertions/baselineAssertions'
import { runStage3PostCorrectiveAssertions } from './assertions/postCorrectiveAssertions'
import { runPipeline } from './pipeline/runPipeline'

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

// Applies a SQL migration file via psql child process.
// Must not be called before both production guards pass.
// Throws on non-zero psql exit (ON_ERROR_STOP=1 ensures a hard failure on any SQL error).
function applyMigrationWithPsql(directUrl: string, migrationPath: string): void {
  log(`  Applying: ${migrationPath}`)
  execFileSync('psql', [directUrl, '-f', migrationPath, '-v', 'ON_ERROR_STOP=1'], {
    stdio: 'inherit',
    timeout: 120_000,
  })
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

  const directUrl  = env['DIRECT_URL'] ?? env['DATABASE_URL'] ?? ''
  const supabaseUrl = env['E2E_SUPABASE_URL'] ?? env['SUPABASE_URL'] ?? ''

  assertDisposableEnvironment(env)

  log('Beta Foundation V1 Validation Pipeline starting.')
  log(`Supabase URL: ${supabaseUrl}`)
  log(`Direct URL host: ${new URL(directUrl).hostname}`)

  // Guard 2: migration checksum verification (before creating any client or pool)
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

  const historicalPath = resolve(repoRoot, 'migrations/beta_foundation_v1.sql')
  const correctivePath = resolve(repoRoot, 'migrations/20260729120001_generation_job_state_machine_schema.sql')

  // Capture environment evidence
  const evidence = captureEnvironmentEvidence({ repoRoot })
  saveEvidence(evidence, resolve(evidenceDir, 'environment.json'))
  log('Environment evidence captured.')

  // Both guards have passed — create pg pool
  const pgPool = makePrivilegedPgClient(directUrl)
  const query = (sql: string, params?: unknown[]) => pgPool.query(sql, params)

  try {
    // ── STAGE 0: D11 prerequisite baseline ─────────────────────────────────
    log('\n── Stage 0: D11 prerequisite assertions ──────────────────────────────')
    await runStage0PreMigrationAssertions(query)
    log('Stage 0: ALL PASSED')

    // ── Apply historical migration (first time) ─────────────────────────────
    log('\n── Applying beta_foundation_v1.sql (first time) ──────────────────────')
    applyMigrationWithPsql(directUrl, historicalPath)
    log('Historical migration applied (first time).')

    // ── STAGE 1: Post-historical assertions + snapshot A ─────────────────────
    log('\n── Stage 1: Post-historical migration assertions ─────────────────────')
    await runStage1PostHistoricalAssertions(query)
    const snapshotA = await captureCatalogueSnapshot(query)
    saveEvidence(snapshotA, resolve(evidenceDir, 'stage2-snapshot-a.json'))
    log('Stage 1: ALL PASSED; snapshot A captured and saved.')

    // ── Apply historical migration (second time — idempotency test) ─────────
    log('\n── Applying beta_foundation_v1.sql (second time — idempotency) ───────')
    applyMigrationWithPsql(directUrl, historicalPath)
    log('Historical migration applied (second time).')

    // Capture snapshot B immediately after second apply
    const snapshotB = await captureCatalogueSnapshot(query)
    saveEvidence(snapshotB, resolve(evidenceDir, 'stage2-snapshot-b.json'))
    log('Snapshot B captured and saved.')

    // ── STAGE 2: Semantic idempotency comparison ────────────────────────────
    log('\n── Stage 2: Historical migration idempotency comparison ──────────────')
    const comparison = compareCatalogueSnapshots(snapshotA, snapshotB)
    saveEvidence(comparison, resolve(evidenceDir, 'stage2-comparison.json'))
    // Throws with a full delta report if any semantic drift is detected.
    // The corrective migration is NOT applied if this assertion fails.
    assertCataloguesIdentical(comparison, 'beta_foundation_v1.sql first apply vs. second apply')
    log('Stage 2: PASSED — catalogue semantically identical after second apply.')

    // ── Apply corrective migration ──────────────────────────────────────────
    log('\n── Applying corrective migration ─────────────────────────────────────')
    applyMigrationWithPsql(directUrl, correctivePath)
    log('Corrective migration applied.')

    // ── STAGE 3: Post-corrective assertions ─────────────────────────────────
    log('\n── Stage 3: Post-corrective assertions ───────────────────────────────')
    await runPipeline([
      () => runStage('Stage 3: post-corrective assertions', () => runStage3PostCorrectiveAssertions(query)),
    ])
    log('Stage 3: ALL PASSED')

    log('\n── ALL STAGES PASSED ─────────────────────────────────────────────────')
    log('Evidence written to: ' + evidenceDir)

  } finally {
    await pgPool.end()
  }
}

main().catch(err => {
  process.stderr.write(`[UNCAUGHT] ${String(err)}\n`)
  process.exit(1)
})
