// Storage constants for the private study-visuals bucket.
// Imported by both the worker (visuals.ts) and the signed URL endpoint.
// Must NOT be in a 'use server' file (server action files cannot export non-functions).

export const VISUALS_STORAGE_BUCKET = 'study-visuals'

// Signed URL validity in seconds. Short-lived: 5 minutes.
// Issued only by the server-side endpoint after ownership verification.
export const VISUALS_SIGNED_URL_EXPIRY_SECONDS = 300
