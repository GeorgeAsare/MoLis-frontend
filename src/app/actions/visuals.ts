// stageVisualsForJob has moved to src/lib/jobs/visualsWorker.ts (Round 4 C05 correction).
// The server-only module does NOT use 'use server' and derives userId/documentId
// from the DB via fn_get_claimed_job_context rather than accepting them from the caller.
//
// This re-export maintains backward compatibility for any callers that still reference
// this path during the migration transition. Remove this file in Phase 3 cleanup.
export { stageVisualsForJob } from '@/lib/jobs/visualsWorker'
