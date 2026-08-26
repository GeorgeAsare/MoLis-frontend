// VALIDATION ONLY — never import from application code
// Database client factories for Beta Foundation V1 disposable validation.
// The production guard is called before any client or pool is created.
//
// Cleanup philosophy
// ──────────────────
// Synthetic rows created during Group B tests (jobs, requests, snapshots, usage,
// study_visuals, documents) are NOT deleted in afterAll. They remain in the disposable
// Supabase instance until the full stack is destroyed. Ledger/snapshot rows are immutable
// by design (generation_job_usage, generation_source_snapshots). Auth users are left
// in place to preserve FK integrity on those immutable rows.
//
// The ONLY cleanup performed in afterAll is closing the pg Pool:
//   if (pgPool) await pgPool.end()
//
// This keeps tests deterministic and avoids violating the immutability guarantee
// of the schema under test.

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableEnvironment, checkProductionGuard } from '../guard/productionGuard'
import { randomBytes } from 'crypto'

// Minimal Pool interface matched by pg@8.x — avoids hard dep on @types/pg at compile time.
// pg must be installed (devDependency) before running Group B tests.
export interface PgPoolClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  release(): void
}

export interface PgPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  connect(): Promise<PgPoolClient>
  end(): Promise<void>
}

export interface DisposableClientEnv {
  supabaseUrl: string
  anonKey:     string
  serviceKey:  string
  directUrl:   string
}

export interface DisposableClients {
  serviceClient:    SupabaseClient
  createUserClient: (accessToken: string) => SupabaseClient
}

// Creates Supabase clients for the local disposable instance.
// Calls the production guard on the FULL environment before creating any client.
// Throws if the environment is not provably local loopback.
export function createDisposableClients(env: DisposableClientEnv): DisposableClients {
  assertDisposableEnvironment({
    RUN_DATABASE_TESTS:        process.env['RUN_DATABASE_TESTS'] ?? '',
    SUPABASE_URL:              env.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_URL:  env.supabaseUrl,
    DIRECT_URL:                env.directUrl,
  })

  const serviceClient = createClient(env.supabaseUrl, env.serviceKey, {
    auth: {
      persistSession:     false,
      autoRefreshToken:   false,
      detectSessionInUrl: false,
    },
  })

  const createUserClient = (accessToken: string): SupabaseClient =>
    createClient(env.supabaseUrl, env.anonKey, {
      auth: {
        persistSession:     false,
        autoRefreshToken:   false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    })

  return { serviceClient, createUserClient }
}

// Creates a privileged postgres direct-connection pool for tests that require
// access to tables revoked from service_role (generation_jobs, generation_job_requests,
// generation_source_snapshots, generation_job_usage). Uses the postgres superuser,
// which bypasses the REVOKE applied by the corrective migration.
//
// directUrl must point to a loopback address (127.0.0.1 or localhost).
// Requires RUN_DATABASE_TESTS=1 and the pg npm package to be installed.
//
// Example: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export function makePrivilegedPgClient(directUrl: string): PgPool {
  const guard = checkProductionGuard({
    RUN_DATABASE_TESTS: process.env['RUN_DATABASE_TESTS'] ?? '',
    SUPABASE_URL:       process.env['E2E_SUPABASE_URL'] ?? process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321',
    DIRECT_URL:         directUrl,
  })
  if (!guard.safe) {
    throw new Error(`[PRODUCTION GUARD] makePrivilegedPgClient refused: ${guard.reason}`)
  }

  // Dynamic require avoids breaking tsc when pg is not yet installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg') as { Pool: new (opts: { connectionString: string }) => PgPool }
  return new Pool({ connectionString: directUrl })
}

export interface TestActorSession {
  userId:      string
  accessToken: string
}

// Create a test user in the local auth.users via admin API.
export async function createTestUser(
  serviceClient: SupabaseClient,
  email:         string,
  password:      string,
): Promise<TestActorSession> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`createTestUser failed for ${email}: ${error?.message ?? 'no user returned'}`)
  }
  return { userId: data.user.id, accessToken: '' }
}

// Sign in a test user via an existing unauthenticated client and return their JWT.
// Uses the supplied anonClient rather than creating a new transient client per call —
// avoids leaking client instances and keeps client configuration consistent.
export async function signInTestUser(
  anonClient: SupabaseClient,
  email:      string,
  password:   string,
): Promise<string> {
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`signInTestUser failed for ${email}: ${error?.message ?? 'no session'}`)
  }
  return data.session.access_token
}

// Insert a synthetic document owned by userId. Returns the new document id.
export async function insertSyntheticDocument(
  serviceClient: SupabaseClient,
  userId:        string,
  opts?:         { title?: string; extractedText?: string; fileType?: string },
): Promise<string> {
  const { data, error } = await serviceClient
    .from('documents')
    .insert({
      user_id:        userId,
      title:          opts?.title ?? 'Validation Document',
      extracted_text: opts?.extractedText ?? 'Synthetic test content for validation only.',
      file_type:      opts?.fileType ?? 'pdf',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`insertSyntheticDocument failed: ${error?.message}`)
  return (data as { id: string }).id
}

// Generate a runtime-only strong password. Never committed.
export function generateTestPassword(): string {
  return randomBytes(24).toString('base64url')
}

// ── Teardown helper ───────────────────────────────────────────────────────────
//
// The ONLY cleanup needed in afterAll is closing the pg Pool.
// See cleanup philosophy at the top of this file.
export async function teardownPgPool(pool: PgPool | null): Promise<void> {
  if (pool) await pool.end()
}
