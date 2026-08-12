/**
 * Harness self-tests — validate the validation harness itself.
 *
 * These are pure TypeScript unit tests with no database dependency.
 * They run under vitest without RUN_DATABASE_TESTS=1.
 *
 * 30 tests in 7 describe blocks:
 *   1. Stage 3 propagation (5 tests)
 *   2. Historical drift detection — original 9 sections (8 tests)
 *   3. Historical drift detection — new sections: defaultAcl, functionBody, storagePolicy (3 tests)
 *   4. Production guard rejects unsafe env vars (6 tests)
 *   5. Denial-test null guard (2 tests)
 *   6. Stage runner exact D11 assertion wiring (3 tests)
 *   7. checkLinkedProjectGuard (3 tests)
 */

import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  compareCatalogueSnapshots,
  assertCataloguesIdentical,
} from '../historicalRerun'
import type { CatalogueSnapshot } from '../historicalRerun'

import { runPipeline } from '../pipeline/runPipeline'

import {
  checkProductionGuard,
  checkLinkedProjectGuard,
} from '../guard/productionGuard'

import {
  runStage0PreMigrationAssertions,
  runStage1PostHistoricalAssertions,
} from '../assertions/baselineAssertions'

import { PRODUCTION_PROJECT_REF } from '../contract/validationContract'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmptySnapshot(): CatalogueSnapshot {
  return {
    capturedAt:      new Date().toISOString(),
    columns:         [],
    constraints:     [],
    functions:       [],
    indexes:         [],
    rls:             [],
    policies:        [],
    tableAcls:       [],
    triggers:        [],
    storage:         [],
    defaultAcls:     [],
    functionBodies:  [],
    storagePolicies: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stage 3 propagation — throwing in Stage 3 stops pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe('Stage 3 propagation', () => {
  it('runPipeline propagates a Stage 3 assertion failure to the caller', async () => {
    const stages = [
      async () => { /* Stage 0 — passes */ },
      async () => { /* Stage 1 — passes */ },
      async () => { /* Stage 2 — passes */ },
      async () => { throw new Error('POST-CORRECTIVE assertion failed: test marker') },
    ]
    await expect(runPipeline(stages)).rejects.toThrow('POST-CORRECTIVE assertion failed: test marker')
  })

  it('runPipeline stops at the first failing stage and does not run later stages', async () => {
    const ran: number[] = []
    const stages = [
      async () => { ran.push(0) },
      async () => { ran.push(1); throw new Error('Stage 1 failure') },
      async () => { ran.push(2) }, // must NOT run
    ]
    await expect(runPipeline(stages)).rejects.toThrow('Stage 1 failure')
    expect(ran).toEqual([0, 1])
  })

  it('runPipeline completes without throwing when all stages pass', async () => {
    const ran: number[] = []
    const stages = [
      async () => { ran.push(0) },
      async () => { ran.push(1) },
      async () => { ran.push(2) },
    ]
    await expect(runPipeline(stages)).resolves.toBeUndefined()
    expect(ran).toEqual([0, 1, 2])
  })

  it('assertCataloguesIdentical throws when snapshots differ — confirming Stage 3 error path', () => {
    const a = makeEmptySnapshot()
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      policies: [{ schema: 'public', table: 'generation_jobs', name: 'ghost_policy', cmd: 'ALL', permissive: 'PERMISSIVE', roles: '{authenticated}', qual: null, with_check: null }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(() => assertCataloguesIdentical(comparison, 'test label')).toThrow('[HISTORICAL RERUN]')
  })

  it('assertCataloguesIdentical does not throw on identical snapshots', () => {
    const a = makeEmptySnapshot()
    const b = makeEmptySnapshot()
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(true)
    expect(() => assertCataloguesIdentical(comparison, 'test label')).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Historical comparison detects drift in all snapshot sections
// ─────────────────────────────────────────────────────────────────────────────

describe('historicalRerun drift detection', () => {
  it('detects policy drift (policy name changed)', () => {
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      policies: [{ schema: 'public', table: 'generation_jobs', name: 'Users see own jobs', cmd: 'ALL', permissive: 'PERMISSIVE', roles: '{public}', qual: '(user_id = auth.uid())', with_check: null }],
    }
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      policies: [{ schema: 'public', table: 'generation_jobs', name: 'Users see own jobs renamed', cmd: 'ALL', permissive: 'PERMISSIVE', roles: '{public}', qual: '(user_id = auth.uid())', with_check: null }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.policies.onlyInA).toHaveLength(1)
    expect(comparison.policies.onlyInB).toHaveLength(1)
  })

  it('detects ACL drift (grantee removed)', () => {
    const fullAcl = [
      { schema: 'public', table: 'generation_jobs', grantee: 'postgres', privilege_type: 'SELECT', is_grantable: false },
      { schema: 'public', table: 'generation_jobs', grantee: 'authenticated', privilege_type: 'SELECT', is_grantable: false },
    ]
    const a: CatalogueSnapshot = { ...makeEmptySnapshot(), tableAcls: fullAcl }
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      tableAcls: [fullAcl[0]!], // authenticated grant removed
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.tableAcls.onlyInA).toHaveLength(1)
    expect(comparison.tableAcls.onlyInA[0]?.grantee).toBe('authenticated')
  })

  it('detects index binding drift (index definition changed)', () => {
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      indexes: [{ schema: 'public', table: 'generation_jobs', name: 'generation_jobs_pkey', is_unique: true, is_primary: true, is_partial: false, definition: 'CREATE UNIQUE INDEX generation_jobs_pkey ON public.generation_jobs USING btree (id)' }],
    }
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      indexes: [{ schema: 'public', table: 'generation_jobs', name: 'generation_jobs_pkey', is_unique: true, is_primary: true, is_partial: false, definition: 'CREATE UNIQUE INDEX generation_jobs_pkey ON public.generation_jobs USING btree (id, user_id)' }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.indexes.onlyInA).toHaveLength(1)
    expect(comparison.indexes.onlyInB).toHaveLength(1)
  })

  it('detects wrong-table index binding (same index name, moved to different table)', () => {
    // Snapshot A: idx_test exists on generation_jobs
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      indexes: [{
        schema: 'public', table: 'generation_jobs', name: 'idx_test',
        is_unique: false, is_primary: false, is_partial: false,
        definition: 'CREATE INDEX idx_test ON public.generation_jobs USING btree (user_id)',
      }],
    }
    // Snapshot B: idx_test exists on generation_job_requests (wrong table)
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      indexes: [{
        schema: 'public', table: 'generation_job_requests', name: 'idx_test',
        is_unique: false, is_primary: false, is_partial: false,
        definition: 'CREATE INDEX idx_test ON public.generation_job_requests USING btree (user_id)',
      }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.indexes.onlyInA).toHaveLength(1)
    expect(comparison.indexes.onlyInA[0]?.table).toBe('generation_jobs')
    expect(comparison.indexes.onlyInB).toHaveLength(1)
    expect(comparison.indexes.onlyInB[0]?.table).toBe('generation_job_requests')
  })

  it('detects trigger drift (trigger disappeared on second apply)', () => {
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      triggers: [{ schema: 'public', table: 'documents', name: 'validate_document_subject_ownership', function_name: 'validate_resource_subject_ownership', tgtype: 23, tgenabled: 'O', tgdeferrable: false, tginitdeferred: false, tgisinternal: false }],
    }
    const b = makeEmptySnapshot()  // trigger missing after second apply
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.triggers.onlyInA).toHaveLength(1)
    expect(comparison.triggers.onlyInB).toHaveLength(0)
  })

  it('detects function security drift (security_definer changed)', () => {
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      functions: [{ schema: 'public', name: 'fn_enqueue_job', identity: 'p_idempotency_key text', language: 'plpgsql', returns: 'jsonb', security_definer: true, proconfig: '{search_path=}', acl_text: '{service_role=X/postgres}' }],
    }
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      functions: [{ schema: 'public', name: 'fn_enqueue_job', identity: 'p_idempotency_key text', language: 'plpgsql', returns: 'jsonb', security_definer: false, proconfig: '{search_path=}', acl_text: '{service_role=X/postgres}' }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
  })

  it('detects RLS drift (rls enabled changed)', () => {
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      rls: [{ schema: 'public', table: 'generation_jobs', enabled: true, forced: false }],
    }
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      rls: [{ schema: 'public', table: 'generation_jobs', enabled: false, forced: false }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.rls.onlyInA).toHaveLength(1)
    expect(comparison.rls.onlyInB).toHaveLength(1)
  })

  it('detects storage drift (bucket became private)', () => {
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      storage: [{ id: 'study-visuals', name: 'study-visuals', public: true, file_size_limit: null, allowed_mime_types: null }],
    }
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      storage: [{ id: 'study-visuals', name: 'study-visuals', public: false, file_size_limit: 5242880, allowed_mime_types: '{image/png}' }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.storage.onlyInA).toHaveLength(1)
    expect(comparison.storage.onlyInB).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2b. Historical drift detection — new snapshot sections
// ─────────────────────────────────────────────────────────────────────────────

describe('historicalRerun drift detection — new sections', () => {
  it('detects defaultAcl drift (default ACL grant appears on second apply)', () => {
    // After the corrective migration revokes broad defaults the historical migration
    // must not re-introduce them on a second apply.
    const a = makeEmptySnapshot()   // no default ACLs post-historical apply #1
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      defaultAcls: [{ role: 'postgres', namespace: 'public', objtype: 'f', acl_text: '{=X/postgres}' }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.defaultAcls.onlyInB).toHaveLength(1)
    expect(comparison.defaultAcls.onlyInA).toHaveLength(0)
  })

  it('detects functionBody drift (function body changed on second apply)', () => {
    const BODY_A = 'CREATE OR REPLACE FUNCTION public.fn_sha256_hex(p_input text)\n RETURNS text\n LANGUAGE sql\nSECURITY DEFINER\nSET search_path = \'\'\nAS $function$ SELECT encode(sha256(p_input::bytea), \'hex\') $function$'
    const BODY_B = 'CREATE OR REPLACE FUNCTION public.fn_sha256_hex(p_input text)\n RETURNS text\n LANGUAGE sql\nSECURITY DEFINER\nSET search_path = \'\'\nAS $function$ SELECT encode(sha256((p_input || \'\')::bytea), \'hex\') $function$'
    const a: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      functionBodies: [{ schema: 'public', name: 'fn_sha256_hex', identity: 'p_input text', full_definition: BODY_A }],
    }
    const b: CatalogueSnapshot = {
      ...makeEmptySnapshot(),
      functionBodies: [{ schema: 'public', name: 'fn_sha256_hex', identity: 'p_input text', full_definition: BODY_B }],
    }
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.functionBodies.onlyInA).toHaveLength(1)
    expect(comparison.functionBodies.onlyInB).toHaveLength(1)
  })

  it('detects storagePolicy drift (storage policy dropped on second apply)', () => {
    const policy = {
      schema:     'storage',
      table:      'objects',
      name:       'Users can read own files',
      cmd:        'SELECT',
      permissive: 'PERMISSIVE',
      roles:      '{authenticated}',
      qual:       '((bucket_id = \'user-files\'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))',
      with_check: null,
    }
    const a: CatalogueSnapshot = { ...makeEmptySnapshot(), storagePolicies: [policy] }
    const b = makeEmptySnapshot()  // policy gone on second apply
    const comparison = compareCatalogueSnapshots(a, b)
    expect(comparison.identical).toBe(false)
    expect(comparison.storagePolicies.onlyInA).toHaveLength(1)
    expect(comparison.storagePolicies.onlyInB).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Production guard rejects unsafe environment variables
// ─────────────────────────────────────────────────────────────────────────────

describe('productionGuard.checkProductionGuard', () => {
  const LOCAL_BASE = {
    RUN_DATABASE_TESTS: '1',
    E2E_SUPABASE_URL:    'http://127.0.0.1:54321',
    E2E_SUPABASE_ANON_KEY: 'eylocal',
    SUPABASE_SECRET_KEY: 'eylocal',
    DIRECT_URL:          'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    DATABASE_URL:        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  }

  it('passes a clean local environment', () => {
    const result = checkProductionGuard(LOCAL_BASE)
    expect(result.safe).toBe(true)
  })

  it('rejects when SUPABASE_ACCESS_TOKEN is present', () => {
    const result = checkProductionGuard({ ...LOCAL_BASE, SUPABASE_ACCESS_TOKEN: 'sbp_token' })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('SUPABASE_ACCESS_TOKEN')
  })

  it('rejects when SUPABASE_PROJECT_REF is the production ref', () => {
    const result = checkProductionGuard({ ...LOCAL_BASE, SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('SUPABASE_PROJECT_REF')
  })

  it('rejects when SUPABASE_URL points to production ref', () => {
    const result = checkProductionGuard({
      ...LOCAL_BASE,
      SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    })
    expect(result.safe).toBe(false)
  })

  it('rejects when DIRECT_URL points to non-loopback host', () => {
    const result = checkProductionGuard({
      ...LOCAL_BASE,
      DIRECT_URL: `postgresql://postgres:postgres@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
    })
    expect(result.safe).toBe(false)
  })

  it('rejects when E2E_SUPABASE_URL is a remote URL', () => {
    const result = checkProductionGuard({
      ...LOCAL_BASE,
      E2E_SUPABASE_URL: 'https://remoteproject.supabase.co',
    })
    expect(result.safe).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Denial-test null causes assertion failure (not silent pass)
// ─────────────────────────────────────────────────────────────────────────────

describe('denial-test null guard', () => {
  it('null denialTestPath causes an expect assertion failure when tested', () => {
    // Simulates what test 14 does: expect(denialTestPath).toBeTruthy()
    const denialTestPath: string | null = null
    // This is what the test body does — it will throw a vitest assertion error
    expect(() => expect(denialTestPath).toBeTruthy()).toThrow()
  })

  it('a non-null denialTestPath passes the expect check', () => {
    const denialTestPath: string | null = 'some-user-id/some-uuid'
    expect(() => expect(denialTestPath).toBeTruthy()).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Stage runner wiring — exact D11 constraint/index/policy assertions
// Proves the stage runners reference all 10 exact assertion functions.
// Static inspection via .toString() — no DB required.
// ─────────────────────────────────────────────────────────────────────────────

describe('Stage runner exact D11 assertion wiring', () => {
  it('runStage0PreMigrationAssertions invokes all D11 exact constraint/index/policy assertions for pre-migration tables', () => {
    const src = runStage0PreMigrationAssertions.toString()
    expect(src).toContain('assertDocumentsBaselineConstraints')
    expect(src).toContain('assertDocumentsBaselineIndexes')
    expect(src).toContain('assertDocumentsBaselinePolicies')
    expect(src).toContain('assertDocumentAnalysisBaselineConstraints')
    expect(src).toContain('assertDocumentAnalysisBaselineIndexes')
    expect(src).toContain('assertDocumentAnalysisBaselinePolicy')
    expect(src).toContain('assertStudyVisualsBaselineConstraints')
    expect(src).toContain('assertStudyVisualsBaselineIndexes')
  })

  it('runStage1PostHistoricalAssertions invokes all D11 exact constraint/index assertions for generation_jobs', () => {
    const src = runStage1PostHistoricalAssertions.toString()
    expect(src).toContain('assertGenerationJobsBaselineConstraints')
    expect(src).toContain('assertGenerationJobsBaselineIndexes')
  })

  it('runValidation.ts orchestrates Stage 0 and Stage 1 via the runner functions, not a duplicated flat assertion list', () => {
    const src = readFileSync(join(__dirname, '../runValidation.ts'), 'utf8')
    expect(src).toContain('runStage0PreMigrationAssertions(query)')
    expect(src).toContain('runStage1PostHistoricalAssertions(query)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. checkLinkedProjectGuard rejects non-repo directories
// ─────────────────────────────────────────────────────────────────────────────

describe('checkLinkedProjectGuard', () => {
  it('passes when no marker file exists (non-existent path)', () => {
    const result = checkLinkedProjectGuard('/tmp/definitely-not-a-repo')
    expect(result.safe).toBe(true)
  })

  it('rejects when a linked-project marker exists with any content', () => {
    const tempRoot = join(tmpdir(), `harness-test-${Date.now()}`)
    const markerDir = join(tempRoot, 'supabase', '.temp')
    mkdirSync(markerDir, { recursive: true })
    writeFileSync(join(markerDir, 'project-ref'), 'someotherproject')
    try {
      const result = checkLinkedProjectGuard(tempRoot)
      expect(result.safe).toBe(false)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects when a linked-project marker exists with the production ref', () => {
    const tempRoot = join(tmpdir(), `harness-test-${Date.now()}`)
    const markerDir = join(tempRoot, 'supabase', '.temp')
    mkdirSync(markerDir, { recursive: true })
    writeFileSync(join(markerDir, 'project-ref'), PRODUCTION_PROJECT_REF)
    try {
      const result = checkLinkedProjectGuard(tempRoot)
      expect(result.safe).toBe(false)
      expect(result.reason).toContain(PRODUCTION_PROJECT_REF)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
