// VALIDATION ONLY — never import from application code
//
// Production safety guard for the Beta Foundation V1 validation harness.
// Inspects the FULL environment before any client or pg Pool is created.
// Must be called at the very top of runValidation.ts before any other setup.
//
// Run via `env -i` to strip all inherited credentials from the shell environment.
// See ENV_I_CONTRACT in runValidation.ts for the exact invocation.
//
// Rejected conditions:
//   - RUN_DATABASE_TESTS !== "1"
//   - SUPABASE_ACCESS_TOKEN set (links to Supabase cloud)
//   - SUPABASE_PROJECT_REF set to production ref
//   - Production project ref in ANY URL or key var
//   - Any *.supabase.co endpoint in ANY var
//   - Non-loopback API host
//   - Non-loopback database host
//   - Missing required local API URL
//   - Missing required local database URL
//   - Linked-project CLI marker on disk (checked in entry point)

const ALLOWED_API_HOSTS = new Set(['127.0.0.1', 'localhost'])
const ALLOWED_API_URL_PREFIXES = [
  'http://127.0.0.1:54321',
  'http://localhost:54321',
]
const PRODUCTION_REF = 'ujwfkhvmpdmgjausnbre'

export interface GuardResult {
  safe: boolean
  reason?: string
}

export function checkProductionGuard(
  env: Record<string, string | undefined>,
): GuardResult {
  // ── Check 0: RUN_DATABASE_TESTS must be exactly "1" ───────────────────────
  if (env['RUN_DATABASE_TESTS'] !== '1') {
    return {
      safe: false,
      reason:
        'RUN_DATABASE_TESTS is not set to exactly "1". ' +
        'This validation harness requires explicit opt-in via RUN_DATABASE_TESTS=1. ' +
        'An empty or inherited environment is not considered safe.',
    }
  }

  // ── Check 1: SUPABASE_ACCESS_TOKEN links to Supabase cloud ─────────────────
  if (env['SUPABASE_ACCESS_TOKEN']) {
    return {
      safe: false,
      reason:
        'SUPABASE_ACCESS_TOKEN is set — environment is linked to Supabase cloud. ' +
        'Run via env -i to strip all inherited credentials.',
    }
  }

  // ── Check 2: SUPABASE_PROJECT_REF must not be the production ref ───────────
  const projectRef = env['SUPABASE_PROJECT_REF'] ?? ''
  if (projectRef && (projectRef === PRODUCTION_REF || projectRef.includes(PRODUCTION_REF))) {
    return {
      safe: false,
      reason:
        `SUPABASE_PROJECT_REF is set to the production project ref (${PRODUCTION_REF}). ` +
        `This environment is linked to the production Supabase project.`,
    }
  }

  // ── Collect all URL-bearing and key vars ──────────────────────────────────
  const apiUrlVars: Array<[string, string]> = ([
    ['SUPABASE_URL',             env['SUPABASE_URL'] ?? ''],
    ['NEXT_PUBLIC_SUPABASE_URL', env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''],
    ['E2E_SUPABASE_URL',         env['E2E_SUPABASE_URL'] ?? ''],
  ] as Array<[string, string]>).filter(([, v]) => v !== '')

  const dbUrlVars: Array<[string, string]> = ([
    ['DIRECT_URL',   env['DIRECT_URL'] ?? ''],
    ['DATABASE_URL', env['DATABASE_URL'] ?? ''],
  ] as Array<[string, string]>).filter(([, v]) => v !== '')

  // Credential vars: check for production ref embedded in a JWT/key
  const credVars: Array<[string, string]> = ([
    ['SUPABASE_SECRET_KEY',       env['SUPABASE_SECRET_KEY'] ?? ''],
    ['SUPABASE_SERVICE_ROLE_KEY', env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''],
    ['E2E_SUPABASE_ANON_KEY',     env['E2E_SUPABASE_ANON_KEY'] ?? ''],
  ] as Array<[string, string]>).filter(([, v]) => v !== '')

  // ── Check 3: All vars must not contain the production project ref ──────────
  for (const [varName, val] of [...apiUrlVars, ...dbUrlVars, ...credVars]) {
    if (val.includes(PRODUCTION_REF)) {
      return {
        safe: false,
        reason:
          `${varName} contains production project ref (${PRODUCTION_REF}). ` +
          `This environment targets the production Supabase project.`,
      }
    }
    if (val.includes('.supabase.co')) {
      return {
        safe: false,
        reason:
          `${varName} points to a *.supabase.co endpoint (not local). ` +
          `Value prefix: ${val.slice(0, 40)}...`,
      }
    }
  }

  // ── Check 4: At least one approved local API URL must be present ───────────
  if (apiUrlVars.length === 0) {
    return {
      safe: false,
      reason:
        'No Supabase API URL set. ' +
        'SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or E2E_SUPABASE_URL is required ' +
        'and must be an approved local loopback URL.',
    }
  }

  // ── Check 5: Every API URL present must be an approved loopback URL ─────────
  for (const [varName, url] of apiUrlVars) {
    const normalized = url.replace(/\/$/, '')
    if (!ALLOWED_API_URL_PREFIXES.includes(normalized)) {
      let parsedHost = url
      try {
        parsedHost = new URL(url).hostname
      } catch {
        return {
          safe: false,
          reason: `${varName} "${url}" is not a valid URL. Cannot verify host.`,
        }
      }
      return {
        safe: false,
        reason:
          `${varName} "${url}" (host: ${parsedHost}) is not an approved loopback URL. ` +
          `Approved: ${ALLOWED_API_URL_PREFIXES.join(', ')}.`,
      }
    }
  }

  // ── Check 6: At least one approved local database URL must be present ───────
  if (dbUrlVars.length === 0) {
    return {
      safe: false,
      reason:
        'No local database URL set. DIRECT_URL or DATABASE_URL is required ' +
        '(postgres superuser URL to the local disposable instance, e.g. ' +
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres). ' +
        'This URL is required for privileged schema reads bypassing service_role REVOKE.',
    }
  }

  // ── Check 7: Every DB URL present must use a loopback host ─────────────────
  for (const [varName, url] of dbUrlVars) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return {
        safe: false,
        reason: `${varName} "${url}" is not a valid URL. Cannot verify host.`,
      }
    }
    if (!ALLOWED_API_HOSTS.has(parsed.hostname)) {
      return {
        safe: false,
        reason:
          `${varName} host "${parsed.hostname}" is not a loopback address. ` +
          `Expected: 127.0.0.1 or localhost.`,
      }
    }
  }

  return { safe: true }
}

/**
 * Throws if the environment is not provably a local disposable instance.
 * Call this before creating any database client.
 *
 * Pass the FULL process.env or an explicit env map. Do not pass a filtered subset —
 * the guard must inspect every relevant variable to prevent accidental production access.
 */
export function assertDisposableEnvironment(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): void {
  const result = checkProductionGuard(env)
  if (!result.safe) {
    throw new Error(
      `[PRODUCTION GUARD] Refusing to create database client.\n` +
      `Reason: ${result.reason}\n\n` +
      `This validation harness must only run against a local disposable Supabase instance.\n` +
      `Approved API URLs: ${ALLOWED_API_URL_PREFIXES.join(', ')}\n` +
      `Required env: RUN_DATABASE_TESTS=1, SUPABASE_URL (or equivalent), DIRECT_URL (or DATABASE_URL)\n` +
      `Run via: env -i RUN_DATABASE_TESTS=1 SUPABASE_URL=http://127.0.0.1:54321 ` +
      `DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres ... <command>`,
    )
  }
}

/**
 * Filesystem guard: rejects if a Supabase CLI linked-project marker is present.
 * Call in the entry point (runValidation.ts) BEFORE assertDisposableEnvironment.
 *
 * Returns a GuardResult so the caller decides whether to throw or log.
 */
export function checkLinkedProjectGuard(repoRoot: string): GuardResult {
  // Known Supabase CLI linked-project markers
  const markers = [
    `${repoRoot}/supabase/.temp/project-ref`,
    `${repoRoot}/.supabase/project-ref`,
  ]

  for (const markerPath of markers) {
    // Dynamic import to avoid fs at module load time; caller must be Node.js
    let content: string | undefined
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs')
      if (fs.existsSync(markerPath)) {
        content = fs.readFileSync(markerPath, 'utf8').trim()
      }
    } catch {
      continue
    }
    if (content === undefined) continue
    if (content === PRODUCTION_REF || content.includes(PRODUCTION_REF)) {
      return {
        safe: false,
        reason:
          `Supabase CLI linked-project marker found at ${markerPath} referencing the production ` +
          `project ref (${PRODUCTION_REF}). Unlink the project before running the validation harness.`,
      }
    }
    return {
      safe: false,
      reason:
        `Supabase CLI linked-project marker found at ${markerPath} with content: "${content}". ` +
        `The validation harness must not run against a linked Supabase project. ` +
        `Run "supabase unlink" or use env -i to avoid inheriting linked-project state.`,
    }
  }

  return { safe: true }
}
