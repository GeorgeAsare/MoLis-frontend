// CLIENT-SIDE ONLY — safe to import in client components and browser code.
// Do NOT import from server-only modules or route handlers.
//
// Persists per-action request idempotency keys in sessionStorage so the same UUID
// survives network retries, duplicate submissions caused by the same logical click,
// and temporary page-refresh recovery while the original action is still pending.
//
// LIFECYCLE:
//   1. getOrCreatePendingRequestKey — call BEFORE the first API request for an action.
//      Returns an existing key if the action was already started this session,
//      or generates and stores a fresh UUID if not.
//   2. Key persists in sessionStorage until explicitly cleared.
//   3. clearPendingRequestKey — call when the user wants a genuinely new job
//      (e.g., "Regenerate" after completion). Removes the stored key so the
//      next getOrCreatePendingRequestKey generates a fresh UUID.
//
// SCOPING: storage entry = "molis:pending:v1:<userId>:<documentId>:<jobType>"
//   Scoped by userId so different authenticated users sharing a browser session
//   cannot collide. Scoped by documentId and jobType for the specific action.
//
// SERVER CONTRACT:
//   The client sends the bare UUID. The server prepends auth.uid(), stores
//   the composite key, and enforces idempotency:
//     same key + same payload  → returns original job (any status)
//     same key + diff payload  → explicit P0004 conflict error
//   Terminal jobs hold the DB slot permanently; a new key is required for a new attempt.

const STORAGE_KEY_PREFIX = 'molis:pending:v1'

function getSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    // May throw in sandboxed iframes or unusual browser configurations.
    return null
  }
}

function buildStorageKey(userId: string, documentId: string, jobType: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${documentId}:${jobType}`
}

export function getPendingRequestKey(
  userId: string,
  documentId: string,
  jobType: string,
): string | null {
  return getSessionStorage()?.getItem(buildStorageKey(userId, documentId, jobType)) ?? null
}

export function setPendingRequestKey(
  userId: string,
  documentId: string,
  jobType: string,
  requestKey: string,
): void {
  getSessionStorage()?.setItem(buildStorageKey(userId, documentId, jobType), requestKey)
}

// Remove the stored key. Call this for intentional regeneration — the next
// getOrCreatePendingRequestKey call will generate a fresh UUID.
export function clearPendingRequestKey(
  userId: string,
  documentId: string,
  jobType: string,
): void {
  getSessionStorage()?.removeItem(buildStorageKey(userId, documentId, jobType))
}

// Returns the existing pending request key for this action, or generates and
// stores a new UUID if none exists. Always call this BEFORE the first network
// request so retries and duplicate submissions reuse the same key.
export function getOrCreatePendingRequestKey(
  userId: string,
  documentId: string,
  jobType: string,
): string {
  const existing = getPendingRequestKey(userId, documentId, jobType)
  if (existing) return existing
  const key = crypto.randomUUID()
  setPendingRequestKey(userId, documentId, jobType, key)
  return key
}
