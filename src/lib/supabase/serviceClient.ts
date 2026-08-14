// SERVER-ONLY — never import from client components, browser code, or 'use client' files.
// This import guard prevents this module from appearing in any browser bundle.
import 'server-only'

// The service-role client bypasses RLS. It is only for trusted server operations:
//   fn_claim_job, fn_heartbeat_job, fn_complete_job, fn_fail_job,
//   fn_acknowledge_cancel, fn_recover_stale_jobs.
// Authenticated user sessions must NOT use this client — use createClient() from server.ts.

import { createClient } from '@supabase/supabase-js'

// Creates a stateless, non-persistent Supabase client using the server service key.
//
// KEY AUTHORITY:
//   SUPABASE_SECRET_KEY (sb_secret_...) — current Supabase credential format.
//     Supabase is migrating to this naming by end of 2026. Preferred when available.
//   SUPABASE_SERVICE_ROLE_KEY — legacy credential name. Accepted as a fallback.
//   BOTH grant service_role authority: they bypass RLS and have full table access.
//   NEITHER constitutes a dedicated least-privilege worker role.
//   D3 (dedicated worker role with minimal privileges) remains an open decision
//   that requires George's approval before production deployment.
//
// Throws immediately if neither key is configured so the failure is loud and
// traceable rather than a silent permission error from the database.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // || (not ??) — fall through on empty string as well as undefined
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SECRET_KEY (preferred) or legacy SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
      'Add it to .env.local as a server-only variable (never prefix with NEXT_PUBLIC_). ' +
      'Worker transitions (claim, complete, fail, heartbeat, recovery) are blocked until this key is set.',
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
