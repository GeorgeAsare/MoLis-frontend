/**
 * Beta Foundation V1 — Storage Integration Tests
 *
 * SEPARATE FROM GROUP B WORKER/STATE-MACHINE TESTS.
 * These 17 tests verify storage bucket policies and access controls applied by
 * the corrective migration (20260729120001_generation_job_state_machine_schema.sql).
 *
 * All tests are SKIPPED unless:
 *   - RUN_DATABASE_TESTS=1
 *   - E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY set
 *   - DIRECT_URL or DATABASE_URL set (local disposable postgres superuser URL)
 *
 * George's explicit approval is required before executing these tests in any environment.
 *
 * DO NOT modify the corrective migration file in connection with these tests.
 * DO NOT run against any non-local environment.
 */

import { resolve } from 'node:path'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  assertDisposableEnvironment,
  checkLinkedProjectGuard,
  checkProductionGuard,
} from '../guard/productionGuard'
import {
  createTestUser,
  signInTestUser,
  makePrivilegedPgClient,
} from '../harness/dbClients'
import type { PgPool } from '../harness/dbClients'
import { makeSyntheticActorA, makeSyntheticActorB } from '../actors/syntheticActors'
import {
  makeSyntheticPngBytes,
  makeStoragePath,
  VALIDATION_BUCKET,
  VALID_MIME_TYPE,
} from '../harness/storageHelpers'

// ── Env guard ─────────────────────────────────────────────────────────────────

const NOT_STORAGE_EXECUTED = process.env['RUN_DATABASE_TESTS'] !== '1'

describe('Storage Integration [STORAGE]', () => {
  let serviceClient:  SupabaseClient
  let userAClient:    SupabaseClient
  let userBClient:    SupabaseClient
  let pgPool:         PgPool | null = null
  let userAId: string
  let userBId: string
  let uploadedPath:   string | null = null  // Track one upload for signed URL tests
  let denialTestPath: string | null = null  // Service-created object for UPDATE/DELETE denial tests

  if (!NOT_STORAGE_EXECUTED) {
    beforeAll(async () => {
      const supabaseUrl = process.env['E2E_SUPABASE_URL'] ?? ''
      const anonKey     = process.env['E2E_SUPABASE_ANON_KEY'] ?? ''
      const serviceKey  = process.env['SUPABASE_SECRET_KEY'] ?? process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
      const directUrl   = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? ''

      const missing = [
        !supabaseUrl && 'E2E_SUPABASE_URL',
        !anonKey     && 'E2E_SUPABASE_ANON_KEY',
        !serviceKey  && 'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY',
        !directUrl   && 'DIRECT_URL or DATABASE_URL',
      ].filter(Boolean) as string[]

      if (missing.length > 0) {
        throw new Error(
          `Storage tests require: ${missing.join(', ')}. ` +
          'Set these variables or unset RUN_DATABASE_TESTS to skip.',
        )
      }

      // Guard 0: linked-project filesystem markers
      const repoRoot = resolve(__dirname, '../../..')
      const linkedGuard = checkLinkedProjectGuard(repoRoot)
      if (!linkedGuard.safe) {
        throw new Error(`[STORAGE] Linked-project guard failed: ${linkedGuard.reason}`)
      }
      // Guard 1: full production guard on complete process.env
      const fullEnvGuard = checkProductionGuard(process.env as Record<string, string | undefined>)
      if (!fullEnvGuard.safe) {
        throw new Error(`[STORAGE] Production guard failed: ${fullEnvGuard.reason}`)
      }
      // Guard 2: disposable environment check against full process.env
      assertDisposableEnvironment(process.env as Record<string, string | undefined>)

      pgPool = makePrivilegedPgClient(directUrl)

      const clientOpts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      serviceClient = createClient(supabaseUrl, serviceKey, clientOpts)
      const createUserClient = (token: string): SupabaseClient =>
        createClient(supabaseUrl, anonKey, {
          ...clientOpts,
          global: { headers: { Authorization: `Bearer ${token}` } },
        })

      const actorA = makeSyntheticActorA()
      const actorB = makeSyntheticActorB()

      // Remove any leftover actors — each deletion is exception-isolated so all users are attempted
      const { data: { users } } = await serviceClient.auth.admin.listUsers()
      const leftoverErrors: Error[] = []
      for (const u of users ?? []) {
        if (u.email === actorA.email || u.email === actorB.email) {
          try {
            const { error: delErr } = await serviceClient.auth.admin.deleteUser(u.id)
            if (delErr) leftoverErrors.push(new Error(`beforeAll: failed to delete leftover user ${u.email}: ${delErr.message}`))
          } catch (err) {
            leftoverErrors.push(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }
      if (leftoverErrors.length === 1) throw leftoverErrors[0]
      if (leftoverErrors.length > 1) throw new AggregateError(leftoverErrors, `beforeAll: ${leftoverErrors.length} leftover-user deletion failures`)

      // Sequential creation: retain each ID immediately so teardown can recover it
      // even if the second creation fails.
      const sA = await createTestUser(serviceClient, actorA.email, actorA.password)
      userAId = sA.userId
      const sB = await createTestUser(serviceClient, actorB.email, actorB.password)
      userBId = sB.userId

      const anonClient = createClient(supabaseUrl, anonKey, clientOpts)
      const [tokenA, tokenB] = await Promise.all([
        signInTestUser(anonClient, actorA.email, actorA.password),
        signInTestUser(anonClient, actorB.email, actorB.password),
      ])
      userAClient = createUserClient(tokenA)
      userBClient = createUserClient(tokenB)

      // Upload a service-owned object for UPDATE/DELETE denial tests (tests 14 and 15)
      const denialPath = makeStoragePath(userAId, randomUUID())
      const denialBytes = makeSyntheticPngBytes()
      const { error: denialUploadError } = await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .upload(denialPath, denialBytes, { contentType: VALID_MIME_TYPE, upsert: false })
      if (denialUploadError) {
        throw new Error(`beforeAll: failed to upload denial test object: ${denialUploadError.message}`)
      }
      denialTestPath = denialPath
    }, 30_000)

    afterAll(async () => {
      const cleanupErrors: Error[] = []

      // Storage cleanup — each action has its own try/catch so a thrown exception
      // does not prevent subsequent cleanup steps from running
      if (uploadedPath && serviceClient) {
        try {
          const { error } = await serviceClient.storage.from(VALIDATION_BUCKET).remove([uploadedPath])
          if (error) cleanupErrors.push(new Error(`Storage cleanup failed for ${uploadedPath}: ${error.message}`))
        } catch (err) {
          cleanupErrors.push(err instanceof Error ? err : new Error(String(err)))
        }
      }
      if (denialTestPath && serviceClient) {
        try {
          const { error } = await serviceClient.storage.from(VALIDATION_BUCKET).remove([denialTestPath])
          if (error) cleanupErrors.push(new Error(`Storage cleanup failed for ${denialTestPath}: ${error.message}`))
        } catch (err) {
          cleanupErrors.push(err instanceof Error ? err : new Error(String(err)))
        }
      }

      // Auth user deletion — each action has its own try/catch
      for (const [uid, label] of [[userAId, 'userA'], [userBId, 'userB']] as const) {
        if (uid && serviceClient) {
          try {
            const { error: delErr } = await serviceClient.auth.admin.deleteUser(uid)
            if (delErr) cleanupErrors.push(new Error(`afterAll: failed to delete ${label} (${uid}): ${delErr.message}`))
          } catch (err) {
            cleanupErrors.push(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }

      // Pool closure — always executed regardless of earlier failures
      if (pgPool) {
        try {
          await pgPool.end()
        } catch (poolErr) {
          cleanupErrors.push(poolErr instanceof Error ? poolErr : new Error(String(poolErr)))
        }
      }

      // Surface all collected errors — fail the suite if any cleanup step failed
      if (cleanupErrors.length === 1) throw cleanupErrors[0]
      if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, `afterAll: ${cleanupErrors.length} cleanup failures`)
    }, 15_000)
  }

  // ── [STORAGE] 1: Service actor can upload valid PNG ───────────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] service actor can upload valid PNG to user path',
    async () => {
      const storagePath = makeStoragePath(userAId, randomUUID())
      const pngBytes = makeSyntheticPngBytes()
      const { data, error } = await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .upload(storagePath, pngBytes, { contentType: VALID_MIME_TYPE, upsert: false })
      expect(error).toBeNull()
      expect(data?.path).toBeDefined()
      uploadedPath = storagePath
    },
  )

  // ── [STORAGE] 2: Anonymous cannot access objects via public URL ───────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] anonymous user cannot download via public URL (bucket is private post-migration)',
    async () => {
      // uploadedPath must be set by test 1 — if not, that is a test failure
      expect(uploadedPath).toBeTruthy()
      // After the corrective migration, the study-visuals bucket has RLS-protected policies.
      // A direct public URL without authentication must be rejected.
      const anonClient = createClient(
        process.env['E2E_SUPABASE_URL'] ?? '',
        process.env['E2E_SUPABASE_ANON_KEY'] ?? '',
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      )
      const { data, error } = await anonClient.storage.from(VALIDATION_BUCKET).download(uploadedPath!)
      expect(error).not.toBeNull()
      expect(data).toBeNull()
    },
  )

  // ── [STORAGE] 3: User A cannot list study-visuals directly ───────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] authenticated user A cannot list study-visuals root (post-migration policy)',
    async () => {
      const { data: listData, error } = await userAClient.storage.from(VALIDATION_BUCKET).list('')
      // Post-migration: direct listing at root denied or returns empty with error
      if (error) {
        expect(error).toBeTruthy()
      } else {
        // If no error, the list must be empty (no cross-user visibility)
        expect(listData?.length ?? 0).toBe(0)
      }
    },
  )

  // ── [STORAGE] 4: User A cannot upload directly via authenticated role ─────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] authenticated user A cannot upload directly (INSERT policy revoked post-migration)',
    async () => {
      const storagePath = makeStoragePath(userAId, randomUUID())
      const pngBytes = makeSyntheticPngBytes()
      const { data, error } = await userAClient.storage
        .from(VALIDATION_BUCKET)
        .upload(storagePath, pngBytes, { contentType: VALID_MIME_TYPE, upsert: false })
      expect(error).not.toBeNull()
      expect(data).toBeNull()
    },
  )

  // ── [STORAGE] 5: User B cannot access User A path ────────────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] user B cannot download objects stored under user A path',
    async () => {
      // uploadedPath must be set by test 1 — if not, that is a test failure, not a skip
      expect(uploadedPath).toBeTruthy()
      const { data, error } = await userBClient.storage.from(VALIDATION_BUCKET).download(uploadedPath!)
      expect(error).not.toBeNull()
      expect(data).toBeNull()
    },
  )

  // ── [STORAGE] 6: Invalid MIME type is rejected ────────────────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] upload with non-image MIME type is rejected (post-migration allowed_mime_types)',
    async () => {
      const storagePath = makeStoragePath(userAId, randomUUID())
      const { error } = await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .upload(storagePath, Buffer.from('not-an-image'), { contentType: 'text/plain', upsert: false })
      // After corrective migration, allowed_mime_types=['image/png'] — text/plain must be rejected
      expect(error).not.toBeNull()
    },
  )

  // ── [STORAGE] 7: Service actor can create signed URL ─────────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] service actor can generate a signed URL for an uploaded object',
    async () => {
      // uploadedPath must be set by test 1
      expect(uploadedPath).toBeTruthy()
      const { data, error } = await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .createSignedUrl(uploadedPath!, 60)
      expect(error).toBeNull()
      expect(data?.signedUrl).toBeTruthy()
    },
  )

  // ── [STORAGE] 8: Signed URL round-trips to image/png Content-Type ─────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] signed URL response has Content-Type: image/png',
    async () => {
      // uploadedPath must be set by test 1
      expect(uploadedPath).toBeTruthy()
      const { data: urlData, error: urlErr } = await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .createSignedUrl(uploadedPath!, 60)
      expect(urlErr).toBeNull()
      expect(urlData?.signedUrl).toBeTruthy()

      const res = await fetch(urlData!.signedUrl, { method: 'HEAD' })
      expect(res.ok).toBe(true)
      expect(res.headers.get('content-type')).toContain('image/png')
    },
  )

  // ── [STORAGE] 9: Expired signed URL is rejected ───────────────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] expired signed URL is rejected (expiresIn=1 → stale by test assertion time)',
    async () => {
      // uploadedPath must be set by test 1
      expect(uploadedPath).toBeTruthy()
      const { data: urlData, error: urlErr } = await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .createSignedUrl(uploadedPath!, 1)
      expect(urlErr).toBeNull()
      expect(urlData?.signedUrl).toBeTruthy()

      // Wait for the 1-second signed URL to expire
      await new Promise(r => setTimeout(r, 1500))
      const res = await fetch(urlData!.signedUrl, { method: 'HEAD' })
      // Expired tokens must be rejected (4xx)
      expect(res.ok).toBe(false)
    },
  )

  // ── [STORAGE] 10: Service actor delete ───────────────────────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] service actor can delete an uploaded object',
    async () => {
      const storagePath = makeStoragePath(userAId, randomUUID())
      const pngBytes = makeSyntheticPngBytes()
      await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .upload(storagePath, pngBytes, { contentType: VALID_MIME_TYPE, upsert: false })
      const { error } = await serviceClient.storage.from(VALIDATION_BUCKET).remove([storagePath])
      expect(error).toBeNull()
    },
  )

  // ── [STORAGE] 11: Unrelated policies unaffected — exact cmd/permissive/roles/qual/with_check ──
  // Evidence: .ai/inspection/d11-catalogue-results-2026-07-31.csv S19_storage_object_policies
  // These 7 policies must survive the corrective migration unchanged.

  const UNRELATED_POLICY_SPECS: Array<{
    name:       string
    cmd:        string
    permissive: string
    roles:      string   // PostgreSQL array literal format, e.g. '{authenticated}'
    qual:       string | null
    with_check: string | null
  }> = [
    {
      name:       'Users can delete own files',
      cmd:        'DELETE',
      permissive: 'PERMISSIVE',
      roles:      '{authenticated}',
      qual:       `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: null,
    },
    {
      name:       'Users can read own files',
      cmd:        'SELECT',
      permissive: 'PERMISSIVE',
      roles:      '{authenticated}',
      qual:       `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: null,
    },
    {
      name:       'Users can upload to own folder',
      cmd:        'INSERT',
      permissive: 'PERMISSIVE',
      roles:      '{authenticated}',
      qual:       null,
      with_check: `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    },
    {
      name:       'recordings_delete',
      cmd:        'DELETE',
      permissive: 'PERMISSIVE',
      roles:      '{public}',
      qual:       `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: null,
    },
    {
      name:       'recordings_read',
      cmd:        'SELECT',
      permissive: 'PERMISSIVE',
      roles:      '{public}',
      qual:       `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: null,
    },
    {
      name:       'recordings_update',
      cmd:        'UPDATE',
      permissive: 'PERMISSIVE',
      roles:      '{public}',
      qual:       `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
      with_check: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    },
    {
      name:       'recordings_upload',
      cmd:        'INSERT',
      permissive: 'PERMISSIVE',
      roles:      '{public}',
      qual:       null,
      with_check: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    },
  ]

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] 7 unrelated storage policies remain present and unmodified after corrective migration',
    async () => {
      const { rows } = await pgPool!.query(
        `SELECT policyname, cmd, permissive, roles::text AS roles, qual, with_check
         FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname IN (
             'Users can read own files',
             'Users can upload to own folder',
             'Users can delete own files',
             'recordings_read',
             'recordings_upload',
             'recordings_update',
             'recordings_delete'
           )`,
      )
      expect(rows.length).toBe(7)
      const byName = new Map(rows.map(r => [r['policyname'] as string, r]))
      for (const spec of UNRELATED_POLICY_SPECS) {
        const row = byName.get(spec.name)
        expect(row, `policy "${spec.name}" not found`).toBeDefined()
        if (!row) continue
        expect(row['cmd'], `${spec.name} cmd`).toBe(spec.cmd)
        expect(row['permissive'], `${spec.name} permissive`).toBe(spec.permissive)
        expect(row['roles'], `${spec.name} roles`).toBe(spec.roles)
        expect(row['qual'] ?? null, `${spec.name} qual`).toBe(spec.qual)
        expect(row['with_check'] ?? null, `${spec.name} with_check`).toBe(spec.with_check)
      }
    },
  )

  // ── [STORAGE] 12: Exact bucket size limit post-migration ─────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] study-visuals bucket has file_size_limit=5242880 post-migration',
    async () => {
      const { rows } = await pgPool!.query(
        `SELECT file_size_limit FROM storage.buckets WHERE id = 'study-visuals'`,
      )
      expect(rows[0]).toBeDefined()
      const raw = rows[0]!['file_size_limit']
      const limit = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
      // Corrective migration section 12 sets file_size_limit = 5242880 (5 MiB)
      expect(limit).toBe(5242880)
    },
  )

  // ── [STORAGE] 13: Exact bucket allowed_mime_types post-migration ──────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] study-visuals bucket has allowed_mime_types=[image/png] post-migration',
    async () => {
      const { rows } = await pgPool!.query(
        `SELECT allowed_mime_types FROM storage.buckets WHERE id = 'study-visuals'`,
      )
      expect(rows[0]).toBeDefined()
      const raw = rows[0]!['allowed_mime_types']
      // Normalize PostgreSQL array to JS array
      const arr: string[] = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? raw.replace(/^\{|\}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''))
          : []
      // Corrective migration section 12 restricts to exactly ['image/png']
      expect(arr).toHaveLength(1)
      expect(arr[0]).toBe('image/png')
    },
  )

  // ── [STORAGE] 14: User A cannot UPDATE an existing object ────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] user A cannot update (overwrite) an existing study-visuals object',
    async () => {
      // denialTestPath must be set by beforeAll — if not, that is a test failure
      expect(denialTestPath).toBeTruthy()
      const pngBytes = makeSyntheticPngBytes()
      const { error } = await userAClient.storage
        .from(VALIDATION_BUCKET)
        .update(denialTestPath!, pngBytes, { contentType: VALID_MIME_TYPE })
      expect(error).not.toBeNull()
    },
  )

  // ── [STORAGE] 15: User A cannot DELETE an existing object ────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] user A cannot delete an existing study-visuals object',
    async () => {
      // denialTestPath must be set by beforeAll — if not, that is a test failure
      expect(denialTestPath).toBeTruthy()
      const { error } = await userAClient.storage
        .from(VALIDATION_BUCKET)
        .remove([denialTestPath!])
      expect(error).not.toBeNull()
    },
  )

  // ── [STORAGE] 16: Oversized upload is rejected (5A) ──────────────────────

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] upload exceeding 5242880 bytes is rejected (file_size_limit enforcement)',
    async () => {
      // Create a buffer just over 5 MiB with a valid PNG header prefix
      const oversize = Buffer.alloc(5242881)
      // Write minimal PNG signature so MIME sniffing still passes
      oversize.write('\x89PNG\r\n\x1a\n', 0, 'binary')
      const storagePath = makeStoragePath(userAId, randomUUID())
      const { error } = await serviceClient.storage
        .from(VALIDATION_BUCKET)
        .upload(storagePath, oversize, { contentType: VALID_MIME_TYPE, upsert: false })
      // Corrective migration sets file_size_limit=5242880; uploads above must be rejected
      expect(error).not.toBeNull()
    },
  )

  // ── [STORAGE] 17: study-visuals bucket is not public (direct SQL) ─────────
  // Corrective migration section 12 sets public=FALSE on the study-visuals bucket.
  // This test queries storage.buckets directly via the privileged pg client to confirm
  // the flag value — the Supabase JS client does not expose this property.

  it.skipIf(NOT_STORAGE_EXECUTED)(
    '[STORAGE] study-visuals bucket has public=false after corrective migration',
    async () => {
      const { rows } = await pgPool!.query(
        `SELECT public FROM storage.buckets WHERE id = 'study-visuals'`,
      )
      expect(rows.length).toBe(1)
      // PostgreSQL returns boolean columns as JS booleans via pg driver
      expect(rows[0]!['public']).toBe(false)
    },
  )
})
