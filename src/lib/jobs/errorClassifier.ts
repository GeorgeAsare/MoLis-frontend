import { randomBytes } from 'crypto'

// Stable public-facing error codes.
// Values are opaque strings safe to expose in APIs, UI, and logs.
// They must never contain provider names, SQL state, stack traces, or user data.
export type PublicErrorCode =
  | 'JOB_PROVIDER_UNAVAILABLE'
  | 'JOB_PROVIDER_RATE_LIMITED'
  | 'JOB_INPUT_TOO_LARGE'
  | 'JOB_OUTPUT_UNAVAILABLE'
  | 'JOB_TIMEOUT'
  | 'JOB_CANCELLED'
  | 'JOB_FAILED_TRANSIENT'
  | 'JOB_FAILED_PERMANENT'
  | 'JOB_INTERNAL_ERROR'

// Message key → i18n key (not a message). Resolved client-side to localised text.
// Exposed in the public API as public_message_key.
const MESSAGE_KEYS: Readonly<Record<PublicErrorCode, string>> = {
  JOB_PROVIDER_UNAVAILABLE:  'errors.job.provider_unavailable',
  JOB_PROVIDER_RATE_LIMITED: 'errors.job.rate_limited',
  JOB_INPUT_TOO_LARGE:       'errors.job.input_too_large',
  JOB_OUTPUT_UNAVAILABLE:    'errors.job.output_unavailable',
  JOB_TIMEOUT:               'errors.job.timeout',
  JOB_CANCELLED:             'errors.job.cancelled',
  JOB_FAILED_TRANSIENT:      'errors.job.failed_retry',
  JOB_FAILED_PERMANENT:      'errors.job.failed',
  JOB_INTERNAL_ERROR:        'errors.job.internal',
}

// Default user-facing fallback strings (used before i18n is wired).
const FALLBACK_MESSAGES: Readonly<Record<PublicErrorCode, string>> = {
  JOB_PROVIDER_UNAVAILABLE:  'The generation service is temporarily unavailable. Please try again shortly.',
  JOB_PROVIDER_RATE_LIMITED: 'Too many requests. Please wait a moment before trying again.',
  JOB_INPUT_TOO_LARGE:       'The document is too large to process. Try a shorter document.',
  JOB_OUTPUT_UNAVAILABLE:    'Generated content could not be retrieved. Please try again.',
  JOB_TIMEOUT:               'Generation timed out. Please try again.',
  JOB_CANCELLED:             'Generation was cancelled.',
  JOB_FAILED_TRANSIENT:      'Generation failed. Retrying automatically.',
  JOB_FAILED_PERMANENT:      'Generation failed. Please try again.',
  JOB_INTERNAL_ERROR:        'An internal error occurred. Please try again.',
}

export function publicMessageKeyForCode(code: PublicErrorCode): string {
  return MESSAGE_KEYS[code]
}

export function fallbackMessageForCode(code: PublicErrorCode): string {
  return FALLBACK_MESSAGES[code]
}

// Classify a raw error into a safe public code.
//
// IMPORTANT: Raw error text must never leave this function.
// The returned code is all that is safe to persist in the database or return to clients.
// This function reads error text only to classify; it never stores or re-emits it.
export function classifyError(err: unknown): PublicErrorCode {
  if (!(err instanceof Error)) return 'JOB_INTERNAL_ERROR'
  const msg = err.message.toLowerCase()

  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline')) {
    return 'JOB_TIMEOUT'
  }
  if (
    msg.includes('rate limit') || msg.includes('ratelimit') ||
    msg.includes('too many requests') || msg.includes('429')
  ) {
    return 'JOB_PROVIDER_RATE_LIMITED'
  }
  if (
    msg.includes('unavailable') || msg.includes('503') ||
    msg.includes('connection refused') || msg.includes('econnrefused') ||
    msg.includes('network') || msg.includes('enotfound')
  ) {
    return 'JOB_PROVIDER_UNAVAILABLE'
  }
  if (
    msg.includes('too large') || msg.includes('maximum context') ||
    msg.includes('content_policy') || msg.includes('context length') ||
    msg.includes('token limit')
  ) {
    return 'JOB_INPUT_TOO_LARGE'
  }
  if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('cancel')) {
    return 'JOB_CANCELLED'
  }

  return 'JOB_INTERNAL_ERROR'
}

// Generate an opaque support reference.
// Must contain no user data, database IDs, secrets, or error text.
// Format: SR-<day-bucket>-<8 random hex chars>
// The day bucket provides rough chronological ordering for support lookup
// without exposing row IDs or precise timestamps.
export function generateSupportReference(): string {
  const dayBucket = Math.floor(Date.now() / (1000 * 60 * 60 * 24)).toString(36).toUpperCase()
  const rand = randomBytes(4).toString('hex').toUpperCase()
  return `SR-${dayBucket}-${rand}`
}
