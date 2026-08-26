// VALIDATION ONLY — never import from application code
// Evidence capture helpers for Beta Foundation V1 disposable validation.
// NEVER retain: raw keys, passwords, tokens, signed URLs, production credentials, real data.

import { createHash } from 'crypto'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export interface EnvironmentEvidence {
  capturedAt: string
  commitHash: string
  migrationChecksums: {
    historical: string
    corrective: string
  }
  cliVersions: {
    node: string
    npm: string
    docker: string
    supabaseCli: string
  }
  loopbackIdentityProof: string
  localKeyHashes: {
    anonKeyHash: string     // SHA-256 of local anon key — never raw key
    serviceKeyHash: string  // SHA-256 of local service key — never raw key
  }
  fixtureChecksum: string
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim()
  } catch {
    return 'unavailable'
  }
}

function hashFile(p: string): string {
  if (!existsSync(p)) return 'file-not-found'
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

export function captureEnvironmentEvidence(opts: {
  repoRoot: string
  anonKey?: string
  serviceKey?: string
}): EnvironmentEvidence {
  const { repoRoot, anonKey, serviceKey } = opts

  const historicalPath = join(repoRoot, 'migrations/beta_foundation_v1.sql')
  const correctivePath = join(repoRoot, 'migrations/20260729120001_generation_job_state_machine_schema.sql')
  const fixturePath    = join(repoRoot, 'validation/beta-foundation-v1/fixtures/d11-baseline.sql')

  return {
    capturedAt: new Date().toISOString(),
    commitHash: runCommand('git rev-parse HEAD'),
    migrationChecksums: {
      historical: hashFile(historicalPath),
      corrective: hashFile(correctivePath),
    },
    cliVersions: {
      node:        process.version,
      npm:         runCommand('npm --version'),
      docker:      runCommand('docker --version'),
      supabaseCli: runCommand('supabase --version'),
    },
    loopbackIdentityProof: '127.0.0.1 (loopback — local disposable only)',
    localKeyHashes: {
      anonKeyHash:    anonKey    ? hashSecret(anonKey)    : 'not-provided',
      serviceKeyHash: serviceKey ? hashSecret(serviceKey) : 'not-provided',
    },
    fixtureChecksum: hashFile(fixturePath),
  }
}

export function saveEvidence(evidence: unknown, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2), 'utf8')
}

// Remove rows containing credential material before saving a CSV.
export function sanitiseCatalogueCsv(csv: string): string {
  return csv
    .split('\n')
    .filter(line => {
      const lower = line.toLowerCase()
      return !lower.includes('secret') && !lower.includes('token') && !lower.includes('password')
    })
    .join('\n')
}

// Verify that both migration files on disk match the manifest-recorded checksums.
export function verifyMigrationChecksums(repoRoot: string): {
  historical: { path: string; actual: string; expected: string; match: boolean }
  corrective: { path: string; actual: string; expected: string; match: boolean }
} {
  const EXPECTED_HISTORICAL = 'd2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b'
  const EXPECTED_CORRECTIVE = 'bf76114abd8157637c42bef9fbb2e64751f5a6f8cc19868c22e1c2a7d21afdf9'

  const historicalPath = join(repoRoot, 'migrations/beta_foundation_v1.sql')
  const correctivePath = join(repoRoot, 'migrations/20260729120001_generation_job_state_machine_schema.sql')

  const actualHistorical = hashFile(historicalPath)
  const actualCorrective = hashFile(correctivePath)

  return {
    historical: {
      path:     historicalPath,
      actual:   actualHistorical,
      expected: EXPECTED_HISTORICAL,
      match:    actualHistorical === EXPECTED_HISTORICAL,
    },
    corrective: {
      path:     correctivePath,
      actual:   actualCorrective,
      expected: EXPECTED_CORRECTIVE,
      match:    actualCorrective === EXPECTED_CORRECTIVE,
    },
  }
}
