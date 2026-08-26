# Beta Foundation V1 Phases 1–2 Static Implementation Re-review — Round 4

- **Reviewer:** MoLis Database Architect
- **Review date:** 2026-07-30
- **Target commit:** `7a2029fa2dfda82bd8727bbf1ec6069083391d16`
- **Comparison base:** `7f723138e0e7d522aa7ba2428ba07513ecf9ec62`
- **Branch observed:** `feature/remediate-beta-foundation-v1`
- **Review type:** static repository and commit-diff review
- **Database, Supabase, and Storage execution:** none
- **Verdict:** **REJECT**

## Executive conclusion

Commit `7a2029f` is not technically suitable as a disposable-environment test candidate. The Round 4 implementation genuinely consolidates the ledger and job security work into one migration, removes the second corrective migration, places the authenticated enqueue grant last, preserves the historical migration checksum, repairs the principal cancellation-version mismatch, stages visuals at immutable paths with `upsert: false`, and couples job completion with `study_visuals` publication in one database function.

The corrective migration nevertheless cannot execute against the approved historical baseline. Its preflight reads `generation_jobs.request_idempotency_key` and `request_payload_hash` before those columns are added, although `beta_foundation_v1.sql` creates neither column. It also uses unsupported PostgreSQL syntax, `ADD CONSTRAINT IF NOT EXISTS`, for the required composite unique constraint. Either defect stops the migration before it can establish the reviewed state.

There are also unresolved security and integrity blockers independent of those syntax/order failures:

1. Authenticated callers can invoke `fn_enqueue_job` with both key and hash `NULL`, creating a job with no durable ledger entry.
2. The new permissive `FALSE` policy on `storage.objects` does not override any pre-existing permissive allow policy. The migration neither inventories nor removes conflicting `study-visuals` policies, so an upgraded project is not proven private.
3. `stageVisualsForJob` is exported from a file-level `'use server'` module and accepts caller-controlled user/job/attempt identifiers before using full-bypass Storage authority. It is therefore a privileged, expensive Server Action boundary that bypasses the queue/lease contract.
4. The visual request hash omits the document content/analysis identity and almost every output-affecting generation setting.
5. P0007 and other SQLSTATE codes are logged, and the UI's displayed retry action clears the request key that the 503 contract requires it to preserve.
6. Every SQL-backed test remains an empty or comment-only test body. Setting `RUN_DATABASE_TESTS=true` makes those bodies pass without making a database call or assertion.

No migration, Supabase request, Storage request, test-environment action, deployment action, or Git mutation was performed during this review.

## Evidence and governing contract reviewed

The following were read and compared with the target commit:

- `.ai/reviews/beta-foundation-v1-phase1-2-implementation-review.md`
- `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round3.md`
- `.ai/plans/beta-foundation-v1-remediation.md`
- `.ai/decisions/beta-foundation-v1-founder-decisions.md`
- the complete `7f72313..7a2029f` name-status, stat, and content diff
- the current application call paths, including the unchanged SSR `study_visuals` read in `src/app/dashboard/study/[id]/page.tsx`
- the installed Next.js security guidance in `node_modules/next/dist/docs/01-app/02-guides/data-security.md` and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`

Official platform references used for security semantics:

- PostgreSQL's `ALTER TABLE` grammar supports `IF NOT EXISTS` for `ADD COLUMN`, not `ADD CONSTRAINT`: [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html).
- PostgreSQL permissive RLS policies are combined with `OR`; a `FALSE` permissive policy does not deny rows allowed by another permissive policy: [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- Supabase Storage uses `storage.objects` RLS for private access, while a service key bypasses those controls: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- Private-bucket assets require an authenticated download or a time-limited signed URL: [Supabase private Storage serving](https://supabase.com/docs/guides/storage/serving/downloads).
- `sb_secret_...` is the preferred current backend key; it and the legacy `service_role` key are elevated, backend-only, full-RLS-bypass credentials: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Round 3 Critical and High disposition

| Round 3 finding | Round 4 status | Static result |
|---|---|---|
| C01: committed non-ledger enqueue boundary | **Corrected structurally** | The ledger and enqueue function are in `120001`; the grant is the final DDL action before `COMMIT`. No `120003` file remains. The consolidated migration is not executable for separate reasons. |
| C02: cancellation version mismatch | **Mostly corrected** | Cancel branches now require claim version `+ 1`, and the route calls acknowledgement after a refused heartbeat. Repeated cancellation still writes `updated_at`, and work is only observed as cancelled at the next heartbeat/post-staging checkpoint. |
| C03: public/mutable Storage | **Partly corrected, still Critical** | No `getPublicUrl` remains; upload is immutable and signed access is added. Policy reconciliation is not fail-closed, trusted path validation is absent, and a privileged Server Action bypass remains. |
| H01: under-scoped request hash and key lifecycle | **Not corrected** | Document ID and job type were added, but source/config identity remains absent. The P0007 UI retry clears the stored key. |
| H02: P0007 behavior | **Partly corrected** | One same-argument retry and safe 503 exist. SQLSTATE is logged; any second error is mislabeled retry-required; the user retry clears the key. |
| H03: ledger integrity/RLS/backfill/deletion | **Partly corrected, with new Critical bypass** | Composite ownership FK, `RESTRICT`, strict insert, count check, and ACL revocation exist. NULL keys bypass the ledger; explicit client policies violate the approved no-policy shape; format/scope constraints and retention remain absent; the preflight cannot run. |
| H04: authoritative worker/database invariants | **Partly corrected** | Principal CAS and cancellation checks are improved. Visual/non-visual completion is not type-guarded, manifest/error shapes are unconstrained, and recovery remains unbounded and unscheduled. |
| H05: full-bypass worker authority | **Acceptable only for temporary testing after other blockers** | Server-only/stateless client and key preference are correct. D3 still blocks production authority. The new Storage Server Action widens the trusted boundary improperly. |
| H06: fresh/upgrade reproducibility | **Not corrected** | The single migration removes the inter-migration window, but it fails against the baseline, depends on unversioned prerequisites/bucket creation, and lacks fresh/upgrade evidence. |
| H07: non-executing database tests | **Not corrected** | The gate changed, but all database operations/assertions remain comments. E2E still names removed migration `120002` and silently skips fixtures. |

## Requirement-by-requirement verification

| # | Requirement | Result | Assessment |
|---:|---|---|---|
| 1 | Ledger and security changes in one corrective migration | **PASS structurally** | `generation_job_requests`, restrictions, worker functions, Storage policy, enqueue, and grants are all in `20260729120001`. |
| 2 | No second/placeholder corrective migration | **PASS for migration files** | The directory contains only the immutable historical file and `120001`. Stale `120003` test comments remain but no migration placeholder exists. |
| 3 | One deterministic `BEGIN…COMMIT` | **FAIL** | There is exactly one `BEGIN` and one `COMMIT`, but the body is neither executable nor deterministic against drift. |
| 4 | Authenticated enqueue granted only after prerequisites/restrictions/function | **PASS ordering; FAIL usable outcome** | The grant at lines 1454–1456 is last. The earlier SQL errors prevent reaching it. |
| 5 | Historical checksum unchanged | **PASS** | Base object, target object, and working copy all hash to `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`. |
| 6 | Cancellation version contract | **PASS core CAS; PARTIAL operational behavior** | Processing cancellation increments once; cancel branches accept claim version + 1; wrong token/version cannot acknowledge; cancel_requested has no requeue/complete/fail path. Repeated cancel still updates `updated_at`. |
| 7 | Every worker transition checks complete predicate | **PARTIAL** | Claim and normal lease transitions check the appropriate state/version/worker/token/expiry fields. Attempt limits are enforced at claim/recovery, not in every post-claim transition or by table constraints. Recovery has no caller-supplied worker identity by design. |
| 8 | Visual Storage genuinely private | **FAIL** | Bucket `public=false`, immutable paths, no public URL generation, and five-minute signing exist. Conflicting policies, path signing, row authority, DTO exposure, and privileged action reachability remain unsafe/unproven. |
| 9 | All `storage.objects` policies/privileges reviewed and safe | **FAIL** | Only one named policy is dropped. Existing allow policies and table privileges are not reconciled. The trusted service client bypasses RLS as expected. |
| 10 | Atomic completion/publication | **PARTIAL** | The reviewed visuals route has one transactional RPC and no second publication. Generic `fn_complete_job` can still complete a visuals job without a manifest; manifest shape/path ownership is not constrained. |
| 11 | Canonical hash covers all output-affecting values | **FAIL** | It covers document ID, job type, schema version, operation kind, and `{}` input only. Source and generation configuration are omitted. |
| 12 | Executable safe P0007 contract | **FAIL** | One retry and 503 code exist, but SQLSTATE is logged and the visible retry clears the key. Retry-error classification is also overbroad. |
| 13 | Ledger integrity and isolation | **FAIL** | Core unique/FK/ACL elements exist; NULL RPC inputs bypass it, SQL trusts caller-supplied hash scope, approved no-policy RLS is not followed, and format/retention constraints are missing. |
| 14 | Backfill fails closed | **FAIL** | `ON CONFLICT DO NOTHING` is gone and counts are compared, but the preflight references absent columns. It does not validate key/hash format or authoritative operation scope. |
| 15 | Database tests execute with `RUN_DATABASE_TESTS=true` | **FAIL** | The tests unskip but their database setup, calls, and assertions are comments; empty async bodies pass. |
| 16 | Commit secret/raw-error/scope hygiene | **PARTIAL** | No real secret or unrelated/generated file was found. SQLSTATE logging and private-path/identifier logging remain. |
| 17 | `SUPABASE_SECRET_KEY` contract | **PASS only as temporary local/test authority** | It is server-only and preferred over a documented legacy fallback. Both are correctly described as full bypass. D3 remains unresolved. |
| 18 | Unauthorized commit content | **Scope-clean but governance-invalid** | The commit contains Phase 1–2 remediation plus directly related plan/decision/review files. It contains no unrelated implementation. Creation of the commit violated George's instruction and conveys no approval. |

## Critical findings

### BFV1-P12-R4-C01 — The corrective migration cannot execute against the approved baseline

**Confirmed evidence**

- `migrations/beta_foundation_v1.sql:11-30` creates `generation_jobs` without `request_idempotency_key` or `request_payload_hash`.
- `migrations/20260729120001_generation_job_state_machine_schema.sql:143-180` queries those columns.
- The same migration does not add them until lines 208–212.
- Lines 250–251 use `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS ...`, which is not valid PostgreSQL `ADD CONSTRAINT` syntax.

**Assessment and impact:** The first preflight fails with an undefined-column error before the additive schema step. Independently, the composite constraint statement is a parse/execution error. The one transaction would roll back, but no reviewed final state can be produced. This is not suitable even as an intentionally failing disposable test candidate because the failures are known static defects, not hypotheses requiring environment evidence.

**Required correction:** Reorder additive column creation and exact catalog assertions so preflight can inspect the actual source state without weakening access; replace invalid constraint syntax with deterministic catalog validation plus valid DDL. Reject incompatible existing columns/constraints/indexes rather than hiding them with `IF NOT EXISTS`. Static-parse the complete migration before requesting environment execution.

### BFV1-P12-R4-C02 — Authenticated enqueue can bypass the durable request ledger

**Confirmed evidence**

- `fn_enqueue_job` validates the key and hash only inside independent `IS NOT NULL` branches (`120001:1245-1261`).
- Steps 1–3 write the ledger only when `p_idempotency_key IS NOT NULL` (`120001:1281-1302`, `1314-1341`, `1363-1374`).
- The job insert accepts both NULL values (`120001:1355-1361`).
- The function is directly executable by `authenticated` (`120001:1454-1456`).

**Assessment and impact:** A student can call the Data API RPC directly with both values NULL. The database accepts the job but creates no durable request binding, defeating the central Round 3 correction and allowing retry duplication. The application normally supplies values, but client behavior is not an authority boundary.

**Required correction:** Make key and hash mandatory for the authenticated enqueue signature and enforce exact format/check constraints. Prefer a canonical function that cannot represent an unledgered accepted request. If a trusted migration/legacy path needs NULL, give it a separate non-client operation with explicit authority and audit semantics.

### BFV1-P12-R4-C03 — The Storage policy does not fail closed on an upgraded project

**Confirmed evidence**

- The migration drops only `study_visuals_deny_direct`, then creates a default-permissive policy whose predicate is `FALSE` (`120001:406-412`).
- It does not inspect/drop/replace other policies that apply to `study-visuals`, does not assert the normalized final policy set, and does not reconcile `storage.objects` grants.
- PostgreSQL combines applicable permissive policies with `OR`, so any older allow policy still grants its rows.
- The repository has no version-controlled prior Storage policy baseline; schema drift is an explicitly identified project risk.

**Assessment and impact:** Setting the bucket private removes unauthenticated public-URL bypass, but it does not prove anon/authenticated Storage API denial when another RLS policy allows SELECT/INSERT/UPDATE/DELETE. Lost-race and cancelled objects may be readable by a browser role despite the new `FALSE` policy. The current policy also conflicts with the requested ledger-style “no client policy” deny-by-default approach: adding a permissive false policy is not a deny override.

**Required correction:** Preflight and normalize every policy applicable to this bucket. Use an exact final policy contract: no direct browser policies if all access is server-signed, or narrowly scoped restrictive/operation-specific policies if browser operations are intentionally required. Assert bucket privacy, policy names/commands/roles/expressions, grants, and actor behavior. Preserve service/secret access only as the temporary trusted bypass allowed for disposable testing.

### BFV1-P12-R4-C04 — A reachable Server Action bypasses queue, lease, and cost authority

**Confirmed evidence**

- `src/app/actions/visuals.ts` is a file-level `'use server'` module.
- It exports `stageVisualsForJob(documentId, userId, jobId, attemptCount)` at lines 296–323.
- `userId`, `jobId`, and `attemptCount` are caller parameters; the function does not derive the actor from `auth.getUser()` or prove a current database lease.
- It calls the provider and uploads with `createServiceClient()` at lines 143–212.
- Installed Next.js guidance says Server Actions must be treated as directly reachable POST boundaries and must authenticate/authorize every operation (`node_modules/next/dist/docs/01-app/02-guides/data-security.md:277-282`).

**Assessment and impact:** An authenticated client able to address this Server Action can invoke expensive AI generation and full-bypass Storage upload outside `fn_claim_job`, active-job exclusion, attempt limits, cancellation, and lease CAS. The document query may limit the common case to an owned document through RLS, but the caller is still authoritatively selecting `userId` and operational identifiers. This is a confused-deputy and cost-abuse path in production code.

**Required correction:** Move staging into a `server-only` worker module that is not a Server Action. Derive job/user/document/attempt from a verified claimed job or a narrow worker read RPC; do not accept them as authoritative caller inputs. Keep any thin user action limited to enqueue/cancel. Add a build/action-manifest test proving the worker staging primitive is not client-addressable.

## High findings

### BFV1-P12-R4-H01 — The request hash does not bind the output-producing operation

`generationJobs.ts:85-91` hashes a versioned envelope, but the current visuals route supplies `sanitized_input: {}`. The actual generation path reads and uses all of the following without binding them to the request key:

- document title and extracted text, including the selected/truncated 10,000-character content;
- presence and full content/version of `document_analysis` (sections, summaries, concepts, formulas, subject, difficulty);
- the system prompt and both user-prompt templates;
- prompt model `gpt-4o-mini` and image model from `OPENAI_IMAGE_MODEL` or `gpt-image-2` fallback;
- response format, temperature `0.3`, max tokens `1200`;
- requested image size `1024x1024`, image count `1`, and maximum accepted visual count `1`;
- prompt/output schema and validation logic versions.

Top-level sorting of `sanitized_input` is also not recursive, so semantically identical nested objects can hash differently. More importantly, SQL trusts the client-provided hash. A direct RPC caller can reuse the same key/hash with different document/type arguments; ledger Step 1 returns the bound job without independently comparing stored document/type/operation scope.

**Required correction:** At enqueue, capture a trusted, stable source revision/content digest and a versioned generation-config digest, or snapshot the complete output-affecting envelope. Store authoritative operation scope in the ledger and compare it directly; do not rely solely on a caller-asserted hash. Recursively canonicalize JSON with explicit number/null/array semantics. Tests must demonstrate that every listed change alters the digest while key-order-only changes do not.

### BFV1-P12-R4-H02 — P0007 handling violates the approved logging and client-key contract

- `generationJobs.ts:104` logs the initial `error.code`; for P0007 that writes P0007/SQLSTATE to logs.
- Line 113 logs the retry SQLSTATE. The explicit founder contract forbids P0007, SQLSTATE details, and raw database text in logs as well as UI/browser output.
- Any retry error, not only a second P0007, becomes `ENQUEUE_RETRY_REQUIRED`; authentication, payload conflict, or other failures are therefore mislabeled as a transient 503.
- The route correctly returns only `{code: 'JOB_ENQUEUE_RETRY_REQUIRED'}` with 503.
- The UI preserves the key when it receives 503, but renders the generic “Try Again” control whose handler is `handleRegenerate` (`VisualsPanel.tsx:289-305`). That handler clears the key (`246-249`) before retrying.

**Required correction:** Log only an internal safe classification, not PostgreSQL error codes. Retry exactly once only for P0007 with identical arguments. If the second result is P0007, return the approved 503; map every other error through its own safe path. Track retry-required separately from terminal failed/cancelled/stale UI states so that its control invokes `handleGenerate` with the existing key, while explicit regeneration alone clears it.

### BFV1-P12-R4-H03 — “Completed visuals always have a valid manifest” is not database-enforced

The route uses `fn_complete_and_publish_job`, and that function updates the job plus `study_visuals` in one PostgreSQL call. If the insert/upsert throws, the enclosing statement/transaction rolls back the job update. There is no application-side publication after completion. Those properties pass static review.

The authoritative invariant still has bypasses:

- `fn_complete_job` does not reject `job_type='visuals'`; a privileged caller can mark a visuals job completed with no manifest.
- `fn_complete_and_publish_job` does not require `job_type='visuals'`.
- The function checks only that `p_visuals` is an array via `jsonb_array_length`; it does not validate element fields, statuses, private path prefixes, job/attempt ownership, public-URL absence, model length, or manifest size.
- The function can publish failed/pending items and caller-selected paths.

**Required correction:** Enforce job-type-specific completion in SQL. Validate a bounded manifest schema and require every generated path to match the winning user's/document's/job's/current-attempt prefix; forbid URL-bearing fields in stored JSON. Define whether an empty manifest is a valid completed “no visual needed” result and test it explicitly.

### BFV1-P12-R4-H04 — Ledger RLS, scope, format, and lifecycle are incomplete

The table has the required unique `(user_id, request_idempotency_key)`, composite job/user FK, `ON DELETE RESTRICT`, job index, RLS enablement, and full ACL revocation. Those are real improvements.

Remaining issues:

- The requested contract was RLS enabled with **no** anon/authenticated policies; lines 341–353 create two client policies. RLS with no policies is already default-deny.
- Table CHECK constraints do not enforce exact key format, hash format, size, operation kind, or source/config schema version.
- The ledger stores no authoritative document/job-type/operation scope beyond an opaque caller-supplied hash.
- The originating columns on `generation_jobs` remain nullable and have no XOR/format CHECK after migration.
- No expiry/retention field or cleanup index exists. `ON DELETE RESTRICT` deliberately blocks deletion until D8–D10, but the operational retention/tombstone path remains undefined.
- At scale, permanent request rows have no bounded retention job, backlog metric, or partition-review evidence.

**Required correction:** Remove unnecessary client policies, keep RLS enabled plus explicit ACL denial, add exact constraints and authoritative scope, and define the legal-gated lifecycle before any deletion. Keep `RESTRICT` until that forward design is approved.

### BFV1-P12-R4-H05 — Signed-URL authority can sign an untrusted cross-prefix path

`src/app/api/visuals/[documentId]/route.ts` reads a `study_visuals` row through the user client and filters by the authenticated user. It then passes each stored `storage_path` unchanged to a full-bypass service client. It does not prove that the path begins with the exact authenticated-user/document prefix or that its job/attempt components correspond to a completed owned job.

The repository migration chain does not create or secure `study_visuals`, so direct INSERT/UPDATE authority and RLS for that table are not reproducible. If a user or drifted policy can write an owned row containing another user's object path, the endpoint signs that object. In addition, the endpoint's claim that it never returns a storage path is false: spreading `item` preserves `storage_path`, and the resulting `StudyVisualSet` is serialized. The unchanged SSR page also selects `study_visuals.*` and sends the manifest, including private paths, into the client component before the signed-URL refresh.

**Required correction:** Version-control `study_visuals` ACL/RLS/constraints. Prefer a narrow database read that returns only a verified current manifest, validate exact path structure before signing, and return a separate public DTO that omits `storage_path`, `user_id`, prompt internals, and failure internals. Remove the SSR raw-row serialization.

### BFV1-P12-R4-H06 — Database tests are still specifications masquerading as executable tests

`workerScenarios.test.ts:318` changes the gate to `!process.env['RUN_DATABASE_TESTS']`, so `RUN_DATABASE_TESTS=true` does unskip Group B. Every setup, database call, and meaningful assertion in those tests is still commented out. An empty async test body passes. Several Group A “structural” tests compare hard-coded constants or assert `true`, not the migration/application artifacts.

The E2E file has some real Supabase calls but remains stale and incomplete:

- it requires removed migration `120002` in comments;
- it silently skips when credentials/fixtures are absent;
- it omits authenticated UPDATE/TRUNCATE, anon actor operations, ledger UPDATE/DELETE/TRUNCATE, function-catalog grants, concurrency barriers, P0007, cancellation versions, rollback injection, private Storage, signed URLs, and GraphQL/Data API metadata;
- its safe-DTO test performs no forbidden-field assertion when the supplied owned fixture returns `null`.

**Required correction:** Replace comment blocks with real fixture creation, calls, assertions, teardown, and explicit environment classification. Require `RUN_DATABASE_TESTS === 'true'`; in the approved release evidence job, missing configuration or any release-blocking skip must fail. Update all migration names and signatures to the consolidated schema.

### BFV1-P12-R4-H07 — Fresh and upgrade reproducibility remain unproven

The consolidated file correctly eliminates a committed application-visible boundary between two corrective migrations. It should still be applied only in an approved maintenance operation because the historical baseline is insecure and because a failed transaction leaves that baseline in place.

However:

- the repository cannot build prerequisites such as `documents` or `study_visuals` from its versioned migration chain;
- bucket creation is explicitly external, so a fresh project is not migration-reproducible;
- the migration's preflight is broken and its widespread `IF NOT EXISTS` clauses conceal incompatible drift;
- there is no normalized catalog assertion for types/defaults/constraints/owners/grants/RLS/functions/policies;
- there is no executed populated-upgrade, fresh-build, lock-duration, backup/restore, forced-failure, or forward-recovery evidence.

**Required correction:** Supply the D11 prerequisite manifest/baseline and exact catalog preflight. After another static PASS and George's environment approval, rehearse both a fresh synthetic project and a representative populated upgrade. Keep enqueue/API traffic disabled until the whole transaction commits and actor/catalog validation passes; on failure, remain contained and recover forward.

### BFV1-P12-R4-H08 — Remaining worker/state invariants and D13 operations are not production-complete

The core lease CAS now checks job ID, expected processing/cancel status, expected version, worker ID, lease token, and database-time expiry. Claim enforces attempt limits, and stale recovery separates cancellation from retry. A persisted cancellation wins over a later completion/failure update; a completion that linearizes first may legitimately become terminal before cancellation is recorded.

Remaining gaps:

- post-claim functions do not also assert `attempt_count <= max_attempts`, and the table has no positive/range constraints for attempt/version fields;
- repeated cancellation changes `updated_at`, so it is not a literal row-level no-op;
- a refused heartbeat is treated as cancellation even when the cause is a transient RPC error, wrong token, or expired lease;
- the provider/image call is not abortable; cancellation is observed only at heartbeat and post-staging checkpoints;
- heartbeat callbacks can overlap because `setInterval` does not serialize async calls;
- stale recovery is unbounded, unscheduled, and has no `SKIP LOCKED` batch contract, retry delay/backoff, or two-minute reconciliation evidence;
- the browser still polls every three seconds with possible overlap and decides authoritative staleness at ten minutes, contrary to D13's 2/5/10/30-second jittered backoff, one-in-flight limit, hidden/offline pause, and server-authoritative stale handling.

**Required correction:** Add bounded database constraints and recovery, typed heartbeat outcomes, serialized/abort-aware worker checkpoints, and the approved polling/reconciliation behavior. These are release blockers even after disposable schema execution becomes safe.

### BFV1-P12-R4-H09 — Public diagnostics are not constrained at the database boundary

`fn_fail_job` accepts arbitrary `p_error_code`, `p_message_key`, and `p_support_reference` and persists them into the safe DTO. There are no database allowlists/format/length checks. Worker wrappers log PostgreSQL error codes and throw strings containing SQLSTATE. The current route often catches these safely, but future callers can expose them.

**Required correction:** Enforce an approved public-code/message-key allowlist and opaque support-reference format/length in SQL. Keep restricted diagnostics in a separate server-only sink. Never store or return raw provider/database errors in public columns, manifests, responses, or browser state, and do not log P0007/SQLSTATE under the explicit Round 4 contract.

### BFV1-P12-R4-H10 — Full-bypass authority remains a temporary test mechanism, not D3 completion

`serviceClient.ts` correctly imports `server-only`, uses a plain stateless client, disables session persistence/refresh/URL detection, prefers `SUPABASE_SECRET_KEY`, documents the legacy fallback, and uses no `NEXT_PUBLIC_` privileged variable. No actual privileged value was found in the commit.

Both keys still bypass RLS and can access all project data. The privileged client is used for worker RPCs, Storage upload, and URL signing. D3 therefore continues to block final production least-privilege worker authority and provider-specific production deployment. It does not by itself block a later, separately approved disposable local test after all other Critical/High execution blockers are corrected.

## Storage and atomic-publication assessment

| Property | Static outcome |
|---|---|
| Bucket exists and is private | Asserted and updated, but externally provisioned and not fresh-reproducible. |
| No `getPublicUrl` or public URL generation | **Pass** in the target diff/current visuals path. |
| Immutable versioned attempt path | **Pass** for the route call: `{user}/{document}/{job}/{attempt}/{index}.png`. Inputs are not all trusted at the exported Server Action boundary. |
| `upsert: false` | **Pass**. |
| Database stores path, not public URL | **Pass** in the new worker path; stored JSON shape is not database-constrained. |
| Five-minute signed URL | **Pass** (`300` seconds). |
| Server-only signing after ownership verification | **Partial**: session/row owner filter exists; object-path ownership is not verified. |
| Anon/non-owner cannot obtain URL | **Unproven**: no executable test; path confused-deputy and unversioned row authority remain. |
| Lost-race/cancelled object inaccessible | **Unproven/fail-closed failure**: object is unreferenced, but old permissive Storage policies may still allow access. |
| Trusted server not blocked | **Pass by authority model**: service/secret key bypasses RLS. This is full privilege, not least privilege. |
| Atomic job plus manifest publication | **Pass on intended RPC path**, with job-type/manifest validation bypasses described in H03. |

## Request-ledger and backfill scenario assessment

| Scenario | Static outcome |
|---|---|
| Same key + same payload after terminal | Intended ledger lookup returns the original job, but the payload's authoritative scope is under-specified and caller-controlled. |
| Same key + conflicting hash | P0004 is implemented when a ledger row exists. No safe executable API/UI test proves the mapping. |
| Multiple keys resolving to one active job | Ordinary D2 path durably inserts each non-NULL key. NULL bypass and concurrency remain untested. |
| Concurrent new keys resolving to one job | SQL exception path intends one job plus all accepted keys; real barrier testing is absent. |
| Identical bare UUID across users | Composite string plus ledger `user_id` scopes the normal path. Real two-user execution is absent. |
| Direct anon/authenticated ledger table access | ACL revocation is statically present; all-actor runtime proof is absent. |
| Job deletion | Composite FK uses deliberate `RESTRICT`; deletion remains legally and operationally blocked under D8–D10. |
| Backfill conflict/mismatch | Strict insert and count check are improvements. The source-column ordering defect prevents execution, and malformed scope/key/hash is not checked. |
| Ledger growth | Unique and job lookup indexes exist. Retention/cleanup/partition thresholds are not implemented or evidenced. |

## Required corrections before any migration execution

1. Fix both fatal SQL defects: preflight/source-column order and invalid `ADD CONSTRAINT IF NOT EXISTS` syntax. Add static SQL parsing evidence.
2. Make authenticated enqueue incapable of accepting NULL key/hash; constrain and authoritatively bind operation scope, source revision, and generation configuration.
3. Replace the Storage false-policy pattern with exact fail-closed policy/grant reconciliation and normalized catalog assertions.
4. Move `stageVisualsForJob` out of the Server Action surface into a lease-authorized `server-only` worker primitive.
5. Validate exact owned Storage path prefixes before signing and publishing; return a public DTO with no private paths/raw manifest internals.
6. Enforce visuals-only atomic completion and a bounded private-manifest schema; forbid generic completion of visuals jobs.
7. Correct P0007 logging, second-error classification, and the client's same-key retry control.
8. Implement a recursively canonical trusted hash covering source/config/prompt/model/schema identity.
9. Replace every comment-only/empty database test and stale E2E assumption with real executable assertions.
10. Add the D11 prerequisite manifest, bucket/table/RLS baseline, populated-upgrade/fresh-build runbook, backup, validation, and forward-recovery evidence.
11. Add public-error, attempt/version, worker input, and state/timestamp constraints plus bounded scheduled stale recovery.
12. Keep the full-bypass key path local/test-only; production worker/provider deployment remains blocked under D3.

## Tests still requiring execution

No test was executed in this static review. After all Critical and High corrections receive another static approval and George separately authorizes a disposable environment, the evidence suite must include:

1. SQL parse/lint plus a fresh build from the complete approved prerequisite manifest and exact migration checksum.
2. Representative populated upgrade under maintenance, with preflight, backup/restore proof, lock timing, forced transaction failure, full rollback, forward recovery, and enqueue kept closed until validation passes.
3. Catalog equality assertions for columns/types/defaults/checks/FKs/indexes/owners/ACLs/RLS/function signatures/function grants/buckets/Storage policies.
4. Direct anon, User A, User B, authenticated non-owner, and temporary service actor tests for base job and ledger SELECT/INSERT/UPDATE/DELETE/TRUNCATE plus every RPC.
5. Ledger tests for NULL/malformed key/hash, same key/same terminal result, same key/different authoritative scope, many keys/one job, concurrent keys, P0007 barriers, response loss, and identical UUIDs across users.
6. Worker races covering duplicate claims/callbacks, stale versions, wrong worker/token, expiry, heartbeat/recovery, max attempts, cancel/heartbeat/complete/fail/ack, terminal immutability, and two-minute cancellation recovery.
7. Atomic-publication failure injection, wrong completion-function/job-type calls, malformed/cross-prefix manifests, and proof that failed publication leaves the job non-completed.
8. Private Storage matrix for anon/owner/non-owner/service actor list/read/sign/upload/update/upsert/delete, conflicting legacy policy preflight, signed expiry, cross-prefix signing, immutable collision, and orphan isolation.
9. API/UI tests proving exactly one same-key P0007 retry, safe 503, the displayed retry preserves the key, intentional regeneration changes it, and no SQLSTATE/raw error/path/secret reaches browser or logs.
10. Build/action-manifest/client-bundle and secret scans proving the worker staging primitive and privileged keys cannot be reached or bundled client-side.
11. D13 polling, heartbeat, bounded recovery, query-plan, concurrency, and representative load evidence.

## Unauthorized commit and full-diff hygiene

Commit `7a2029f` was created on `feature/remediate-beta-foundation-v1`, not on `main`, and the user describes it as local/unpushed. Its 32 changed files are limited to:

- the consolidated Phase 1–2 job/ledger/Storage migration;
- the associated job, visual, API, UI, type, privileged-client, and test changes;
- directly related `.ai` plan/decision/review governance artifacts;
- the relevant `.env.example` and Vitest configuration changes.

No unrelated feature, binary, generated artifact, temporary file, real Supabase/OpenAI key, privileged `NEXT_PUBLIC_` credential, or committed secret was found in this commit diff. `.env.example` contains obvious placeholders only. The expected Git author identity exists in commit metadata; no accidental personal data was found in the changed product files.

The commit remains unauthorized because George explicitly instructed the implementer not to commit. Its existence must not be treated as implementation, review, merge, migration, or deployment approval. This review does not alter, amend, reset, restore, or otherwise rewrite it. George should decide its eventual Git disposition only after a corrected static PASS; there is no reason to rewrite `main`.

## Phase 3, disposable execution, and D3 disposition

- **Commit `7a2029f` as test candidate:** **No**. It is statically known not to execute and has unresolved Critical security boundaries.
- **Corrective migration in disposable local Supabase:** **No**. Do not spend an authorized environment run on known syntax/order failures.
- **Private Storage tests in a disposable environment:** **No, not against this candidate**. The exact policy and signing contract must be corrected first. Later disposable Storage testing requires its own George-approved scope/credentials.
- **Phase 3:** **No implementation may begin on the assumption that Phases 1–2 are approved.** Independent planning may continue, but dependent implementation must wait for corrections and re-review.
- **D3:** blocks provider-specific production deployment and acceptance of service/secret role as final worker authority. It does not block static review or a later approved disposable test of a corrected provider-neutral contract.
- **D8–D10:** irreversible cleanup/deletion remains blocked. The current `RESTRICT` behavior should stay until legal, backup, recovery, retention, and founder gates are complete.

## Files reviewed

### Governing and prior-review files

- `.ai/reviews/beta-foundation-v1-phase1-2-implementation-review.md`
- `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round3.md`
- `.ai/plans/beta-foundation-v1-remediation.md`
- `.ai/decisions/beta-foundation-v1-founder-decisions.md`

### Migration and configuration files

- `migrations/beta_foundation_v1.sql`
- `migrations/20260729120001_generation_job_state_machine_schema.sql`
- `.env.example`
- `vitest.config.ts`

### Application and type files

- `src/app/actions/generationJobs.ts`
- `src/app/actions/visuals.ts`
- `src/app/api/jobs/visuals/route.ts`
- `src/app/api/jobs/status/[jobId]/route.ts`
- `src/app/api/visuals/[documentId]/route.ts`
- `src/app/dashboard/study/[id]/page.tsx` (supporting unchanged call path)
- `src/components/study/VisualsPanel.tsx`
- `src/components/study/StudySetView.tsx` (supporting unchanged call path)
- `src/lib/jobs/enqueueErrors.ts`
- `src/lib/jobs/errorClassifier.ts`
- `src/lib/jobs/idempotencyKey.ts`
- `src/lib/jobs/pendingJobKey.ts`
- `src/lib/jobs/stateMachine.ts`
- `src/lib/jobs/visualsStorage.ts`
- `src/lib/jobs/workerClient.ts`
- `src/lib/supabase/serviceClient.ts`
- `src/types/generationJob.ts`
- `src/types/studyVisual.ts`

### Test files

- `src/lib/jobs/__tests__/errorClassifier.test.ts`
- `src/lib/jobs/__tests__/idempotencyKey.test.ts`
- `src/lib/jobs/__tests__/pendingJobKey.test.ts`
- `src/lib/jobs/__tests__/stateMachine.test.ts`
- `src/lib/jobs/__tests__/workerScenarios.test.ts`
- `e2e/rls-two-user.spec.ts`

## Final decision

1. **Final verdict:** **REJECT**.
2. **Critical findings:** the migration cannot execute; authenticated callers can bypass the ledger with NULL inputs; Storage policy reconciliation does not fail closed; an exported privileged Server Action bypasses queue/lease/cost authority.
3. **High findings:** under-scoped/caller-trusted hash; P0007 SQLSTATE logging and key-clearing UI retry; bypassable visual-manifest invariant; incomplete ledger constraints/lifecycle; cross-prefix signed-URL risk and raw path serialization; fake/stale database tests; missing fresh/upgrade reproducibility; incomplete worker/recovery/D13 enforcement; unconstrained public diagnostics; full-bypass production authority remains blocked by D3.
4. **Required corrections:** all twelve items in “Required corrections before any migration execution.”
5. **Commit `7a2029f` technically suitable as test candidate:** **No**.
6. **Corrective migration may be applied to disposable local Supabase:** **No**.
7. **Private Storage tests may run in that disposable environment:** **No, not for this candidate**.
8. **Phase 3 may begin:** **No dependent implementation**; planning only.
9. **D3:** blocks final production authority/provider deployment, not later corrected disposable testing.
10. **Tests still requiring execution:** all eleven suites listed above; no SQL-backed or environment-backed assertion was run here.
11. **Secret or unrelated file in commit:** **No real secret and no unrelated/generated/temporary file found**. SQLSTATE/private-path logging remains a code defect, not a committed credential.
12. **File created:** `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round4.md`.
13. **`git status --short`:** `?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round4.md`.
14. **Action confirmation:** no implementation file, migration, Supabase project, Storage bucket/object, environment, test fixture, Git index, commit, branch, remote, merge, or deployment was modified. Only this review file was created.
