// VALIDATION ONLY — never import from application code
// Synthetic test actors for Beta Foundation V1 disposable validation.
// Uses .invalid domain addresses — never real email or production data.
// Passwords generated at runtime — never committed.

import { randomBytes, randomUUID } from 'crypto'

export function generateStrongPassword(): string {
  return randomBytes(24).toString('base64url')
}

export const ACTOR_EMAIL_A = 'test-user-a@molis-validation.invalid'
export const ACTOR_EMAIL_B = 'test-user-b@molis-validation.invalid'

export interface SyntheticActor {
  email: string
  password: string  // runtime-generated, never committed
}

export function makeSyntheticActorA(): SyntheticActor {
  return { email: ACTOR_EMAIL_A, password: generateStrongPassword() }
}

export function makeSyntheticActorB(): SyntheticActor {
  return { email: ACTOR_EMAIL_B, password: generateStrongPassword() }
}

export interface SyntheticDocument {
  title: string
  extractedText: string | null
  fileType: string | null
  sourceType: 'upload' | 'recording' | null
}

export function makeSyntheticDocument(suffix = ''): SyntheticDocument {
  return {
    title: `Validation Document ${suffix || randomUUID().slice(0, 8)}`,
    extractedText: 'Synthetic extracted text for validation testing only.',
    fileType: 'pdf',
    sourceType: 'upload',
  }
}

export interface SyntheticJobSetup {
  documentId: string
  jobType: 'visuals'
  requestKey: string
}

export function makeSyntheticJobSetup(documentId: string): SyntheticJobSetup {
  return {
    documentId,
    jobType: 'visuals',
    requestKey: randomUUID(),
  }
}

// Scoped idempotency key in the format expected by fn_enqueue_job: "${userId}:${uuid}"
export function makeScopedIdempotencyKey(userId: string): string {
  return `${userId}:${randomUUID()}`
}

// ── Validation run context ─────────────────────────────────────────────────
//
// RunContext is the single coherent fixture for a Group B validation run.
// It is populated by the beforeAll block and passed into each test or
// helper that needs actor-level or infrastructure-level access.
//
// Using an explicit RunContext ensures:
//  - test setup is deterministic (no module-level mutable globals)
//  - every test names its dependencies explicitly (no hidden closure capture)
//  - future parallel execution or multi-run orchestration is possible
//
// Import SupabaseClient and PgPool types from their respective packages —
// this file does NOT import them to avoid circular deps; callers supply them.
export interface ValidationRunContext<TClient, TPool> {
  runId:         string   // random UUID identifying this test run in evidence output
  supabaseUrl:   string
  serviceClient: TClient
  pgPool:        TPool
  actorA: {
    userId:  string
    email:   string
    client:  TClient
  }
  actorB: {
    userId:  string
    email:   string
    client:  TClient
  }
}
