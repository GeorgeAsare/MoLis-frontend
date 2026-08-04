# Beta Foundation V1 Phases 1–2 — Database Architect Round 5 Static Re-review

## Review identity and boundaries

- **Review date:** 2026-07-31
- **Branch inspected:** `feature/remediate-beta-foundation-v1`
- **Rejected parent snapshot:** `7a2029fa2dfda82bd8727bbf1ec6069083391d16`
- **Reviewed state:** the uncommitted working tree above that snapshot
- **Review method:** read-only static repository, SQL, application, test, and Git-diff inspection
- **SQL/migration execution:** none
- **Supabase or Storage access:** none
- **Database or E2E test execution:** none
- **Git mutation:** none
- **Authorised write:** this review file only

## Verdict

**APPROVE FOR D11 READ-ONLY CATALOGUE INSPECTION**

This is deliberately not approval of the current migration or application diff. The uncommitted corrections fix the two fatal Round 4 SQL defects, make authenticated enqueue key/hash mandatory, establish a private attempt-scoped visual path, add a narrow claimed-job-context RPC, type the heartbeat refusal, guard generic completion from visual jobs, bound stale recovery, and preserve the request key through the approved 503 UI retry.

The current diff is still not technically acceptable for migration execution. It accepts existing columns, constraints, and indexes by name without proving their definitions; the ledger does not store or enforce document/job-type scope; exact ledger/job key-and-hash binding is not enforced; historical drift rows can be classified as verified without authoritative provenance; visual manifests and public diagnostics are not database-constrained; source revision checking is not implemented; actual model/config values are not hashed; raw SQLSTATE values remain in server logs and thrown errors; and the database test bodies remain comments or empty functions.

D11 read-only catalogue inspection is the appropriate next evidence-gathering step because the repository does not contain the canonical prerequisite schema and cannot answer the live definitions of source revision columns, `study_visuals` uniqueness/RLS, pre-existing job objects, or Storage policy/grant state. Under D12 it may occur only after George approves the exact environment, catalogue-only query set, operator, and time. It must not read student rows or mutate any object.

## Current diff and historical checksum

`git diff --name-status` reports 13 modified tracked files. `git status --short` additionally reports the Round 4 review and `src/lib/jobs/visualsWorker.ts` as untracked. The tracked diff is **1,149 insertions and 886 deletions**. No unrelated tracked implementation file appears in the diff.

`migrations/beta_foundation_v1.sql` has no working-tree diff. Its SHA-256 is still:

`d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`

The working copy and `HEAD` bytes produce the same checksum. Requirement 27 therefore passes.

## Round 4 finding disposition

| Round 4 required correction | Round 5 disposition | Static assessment |
|---|---|---|
| 1. Preflight order and valid PostgreSQL constraint syntax | **Corrected, parser evidence missing** | Additive columns now precede checks that read them. Invalid `ADD CONSTRAINT IF NOT EXISTS` is gone. The replacement is syntactically plausible, but no genuine PostgreSQL parser/validator result is present. |
| 2. Mandatory key/hash plus authoritative scope/source/config | **Partly corrected** | Authenticated enqueue rejects null key/hash and recursively hashes JSON. Ledger scope, source enforcement, and real config/model identity remain incomplete. |
| 3. Exact private Storage reconciliation | **Partly corrected** | Restrictive bucket-specific policies close broad permissive allows for `study-visuals`; private paths and signing exist. Name-pattern policy deletion can remove unrelated-bucket authority and exact live policy/grant/RLS state is unknown. |
| 4. Remove privileged visual generation Server Action | **Corrected** | `visualsWorker.ts` imports `server-only`; `src/app/actions/visuals.ts` has no `'use server'` directive. The only executing call site found is the server route. |
| 5. Trusted path signing and public DTO | **Mostly corrected** | Five-minute server signing and owner/document prefix validation exist; the API DTO omits path/prompt. SSR sanitisation spreads unknown JSON properties and is not a closed DTO. |
| 6. Visual-only atomic completion and manifest | **Partly corrected** | Generic completion rejects visuals and publication is transactional. Manifest schema/result-code/current-attempt rules remain insufficient. |
| 7. Safe P0007 handling | **Partly corrected** | The UI retry preserves the key and invokes `handleGenerate`. Enqueue logs are classified, but a non-P0007 retry error is mislabeled as retry-required and other paths still log/throw raw SQLSTATE. |
| 8. Recursive canonical hash of output-affecting inputs | **Partly corrected** | Canonicalisation is recursive. Source values are null/unverified and the real image model, prompt model, templates, parameters, limits, and config version are not bound. |
| 9. Executable database tests | **Not corrected** | Credential gating improved, but the database operations/assertions remain comments or empty bodies. |
| 10. D11 baseline/fresh/upgrade evidence | **Not corrected; inspection now justified** | Historical checksum passes. Canonical prerequisites, live catalogue comparison, fresh build, populated upgrade, and normalized catalogue equality remain absent. |
| 11. Diagnostics, constraints, and bounded recovery | **Partly corrected** | Recovery is bounded with `SKIP LOCKED`; lease duration is bounded. Public diagnostics, attempt/state coherence, model, and manifest fields lack authoritative constraints. |
| 12. D3 temporary authority only | **Correctly preserved** | Secret key preference and legacy fallback are server-only and explicitly full-bypass. D3 still blocks final production worker authority/provider deployment. |

## Requirement-by-requirement result

| # | Requirement | Result | Confirmed assessment |
|---:|---|---|---|
| 1 | Valid PostgreSQL and correct order | **PARTIAL** | Known ordering and unsupported syntax defects are fixed. No PostgreSQL parser/static-validator evidence exists, and deterministic drift checks are incomplete. |
| 2 | No unsupported `ADD CONSTRAINT IF NOT EXISTS` | **PASS statically** | No such statement remains. The catalog-guarded valid `ALTER TABLE ... ADD CONSTRAINT` is at migration lines 303–314. |
| 3 | Preflights do not read absent new columns | **PASS for baseline order** | Columns are added at lines 133–161; dependent preflights begin at line 237. |
| 4 | New accepted jobs have valid key/hash, classification, ledger binding | **PARTIAL** | RPC validation, format checks, `client_verified`, and same-transaction inserts exist. The deferred trigger only proves any ledger row for job/user, not the exact key/hash/scope. |
| 5 | Historical rows are honestly legacy | **PARTIAL/D11 BLOCKED** | Baseline rows with null keys become `legacy_unverified`. Pre-existing drift rows with non-null key/hash inherit `client_verified` without provenance and are backfilled as trusted. |
| 6 | Ledger uniqueness, binding, scope, ownership, deletion, isolation | **FAIL** | User/key unique, composite job/user FK, `RESTRICT`, RLS, and ACL denial pass. Exact payload-to-job binding and document/job-type scope fail; D8–D10 lifecycle remains unresolved. |
| 7 | Bucket-specific private Storage | **PARTIAL** | `public=false`, restrictive anon/auth denial, immutable paths, and no public URLs pass. Policy deletion by name pattern is not exact or proven harmless to unrelated buckets. |
| 8 | Visual generation is not a Server Action | **PASS statically** | The worker is guarded by `server-only`; the compatibility re-export is not in a `'use server'` module. |
| 9 | Worker is server-only and context comes from narrow RPC | **PASS statically** | The worker derives user/document/attempt only from `fn_get_claimed_job_context`; no caller-supplied user/document is accepted. |
| 10 | Claimed context checks full authority | **PASS SQL predicate** | Job ID, processing state, expected version, worker ID, token, and unexpired lease are checked. `cancel_requested` is excluded by `status='processing'`. |
| 11 | Honest source revision protection | **FAIL, D11 inspection required** | Values are stored, but two are always null and none is revalidated by the worker. A changed document can be generated under an old key/hash. |
| 12 | Visual completion/publication atomic | **PASS transaction boundary; FAIL manifest contract** | Job update and `study_visuals` upsert are one RPC transaction and roll back together. Accepted JSON is not a fully valid manifest. |
| 13 | Generic completion cannot complete visuals | **PASS** | `fn_complete_job` checks `job_type` and raises before its CAS for visual jobs. |
| 14 | Completed visual has valid manifest or exact no-topic result | **FAIL** | Empty arrays accept arbitrary non-null result codes; non-empty arrays accept arbitrary codes/statuses/fields. Generated items may omit paths. |
| 15 | Cancelled/failed/lost/expired workers expose no manifest | **PASS publication CAS; private orphan evidence unexecuted** | SQL publishes only after winning processing CAS. Other outcomes do not upsert. Staged objects are unreferenced and intended private, but Storage behavior is not runtime-proven. |
| 16 | Five-minute trusted signed access and safe DTO | **PARTIAL** | Signing is server-side for 300 seconds and rejects other user/document prefixes. API projection omits path/prompt; SSR uses an open spread rather than a closed public projection. |
| 17 | D1 N/N+1 cancellation | **PASS core SQL** | Processing cancel increments once; worker cancel branches require claim version + 1; repeat request leaves version unchanged; no cancel-requested requeue/complete/fail path exists. |
| 18 | Heartbeat authority loss aborts work | **PARTIAL** | Further staging/publication is stopped and CAS still protects publication. AbortSignal is not passed to OpenAI SDK calls or Storage upload, so in-flight external work can finish privately; transient RPC errors are incorrectly typed as `not_processing`, making retry code unreachable. |
| 19 | Bounded safe stale recovery | **PASS statically** | Three `LIMIT 100`/`FOR UPDATE SKIP LOCKED` batches cancel, requeue, or fail the correct states; cancelled work is not requeued. Scheduling/evidence remain absent. |
| 20 | Hash covers actual output-affecting values | **FAIL** | Recursive canonicalisation passes, but fixed `'default'`/`'1'` placeholders do not bind actual models, prompts, parameters, limits, analysis/text identity, or code/config revision. |
| 21 | No raw SQLSTATE in logs/errors/API/UI | **FAIL** | Enqueue path is classified, but cancel/read/status/worker paths still log `pg_code` and worker/cancel wrappers throw strings containing `error.code`. |
| 22 | 503 preserves key and calls `handleGenerate` | **PASS** | `retry_required` is separate, keeps sessionStorage key, and its button calls `handleGenerate`, not regeneration. |
| 23 | Database-enforced diagnostic allowlists/formats/lengths | **FAIL** | Columns are unconstrained and `fn_fail_job` assigns caller strings verbatim. TypeScript classification is not a database authority boundary. |
| 24 | Real executable database assertions and honest skips | **FAIL** | Enabling Group B checks credentials, then runs comment-only/empty tests as passes. E2E has some real assertions but incomplete credentials still cause per-test skips and actor/Storage/ledger coverage is absent. |
| 25 | Genuine SQL parser/static-validator command | **MISSING EVIDENCE** | No command or durable output was found. Build and Vitest are not SQL syntax validation. No parser was run during this review. |
| 26 | No secret, privileged public env, unrelated diff, or client-bundled worker | **PASS statically with runtime bundle evidence outstanding** | `.env.example` contains placeholders; no privileged `NEXT_PUBLIC_` variable or real credential was found in tracked source/diff. Import search found no client import of the privileged modules. No bundle/secret-scan artifact exists. |
| 27 | Historical migration byte-for-byte unchanged | **PASS** | SHA-256 matches `HEAD`: `d2bc6e2c…2fdb60b`. |

## Critical finding

### BFV1-P12-R5-C01 — The migration can silently accept incompatible drift and still expose enqueue

**Confirmed evidence**

- New columns use `ADD COLUMN IF NOT EXISTS` without validating existing type, nullability, default, or ownership (`120001:133–161`).
- The composite unique constraint guard checks only `conname`, not its ordered columns, predicate, validation, or backing index (`120001:303–314`).
- Active exclusion and polling indexes use `CREATE ... IF NOT EXISTS`, which checks object name, not normalized definition (`120001:320–332`).
- The authenticated enqueue grant is the final action (`120001:1765–1767`), but no final normalized catalogue assertion rejects a wrong same-named index/column.
- Schema drift is the principal known MoLis database risk, and D11 requires catalog comparison rather than name-based assumptions.

**Impact:** On an upgraded project, a same-named non-unique or differently predicated active-job index can survive. The transaction can then reach the authenticated enqueue grant without enforcing one active job. An incompatible pre-existing column or constraint can also be silently accepted until a later runtime path fails. This defeats deterministic upgrade safety and can create duplicate active work, cost duplication, or a partial authority contract.

**Required correction:** Use the approved D11 catalogue inspection to obtain exact definitions. In the forward migration, compare normalized column, constraint, index, trigger, function, owner, ACL, RLS, policy, bucket, and Storage-policy definitions. Fail closed on every incompatible object. `IF NOT EXISTS` may only follow an exact compatible-definition assertion; it cannot be the assertion.

## High findings

### BFV1-P12-R5-H01 — Ledger scope and exact job binding are not authoritative

The ledger table stores only user, key, opaque caller-supplied hash, and job (`120001:391–415`). It has no `document_id`, `job_type`, operation/schema version, source revision, or config identity. Ledger Step 1 compares only the supplied hash then returns the bound job without comparing the current document or job type (`120001:1601–1620`). The deferred trigger accepts any ledger row for the job/user and does not require the originating key/hash to match (`120001:477–503`).

The unique key, composite ownership FK, `RESTRICT`, RLS, and ACL revocation are sound improvements. They do not meet the required document/job-type/payload binding. A direct authenticated RPC caller can present the same key and caller-chosen hash with a different owned document/type and receive the old job; a trusted direct write can satisfy the trigger with a mismatched ledger row.

**Required correction:** Store authoritative request scope in the ledger or enforce it through a composite relationship to immutable job scope. Compare user, key, hash, document, job type, schema/config version, and accepted-resolution semantics on replay. Make the deferred invariant require the exact originating key/hash/job/user/scope, and add a complementary invariant preventing deletion or mutation from orphaning a verified job.

### BFV1-P12-R5-H02 — Legacy classification can overstate unverified drift data

Rows with null originating keys become `legacy_unverified` (`120001:183–185`), which is correct for the immutable baseline. But `request_classification` is added with default `client_verified`; any pre-existing drift row already carrying non-null key/hash remains verified and is inserted into the ledger (`120001:438–468`) without evidence that the values came from the reviewed enqueue contract.

**Required correction:** D11 must count and inspect catalogue/provenance only—not student payloads—to determine whether these columns/objects already exist. Treat all pre-contract rows as `legacy_unverified` unless deterministic migration provenance proves otherwise. Quarantine ambiguous rows and stop; do not infer verified authority from non-null text.

### BFV1-P12-R5-H03 — Completed visual manifests are not valid by database construction

Atomicity itself is good: the job CAS and `study_visuals` upsert share one function transaction, so an upsert failure rolls back completion (`120001:1107–1141`). Generic completion is correctly blocked for visuals (`120001:951–957`). Cancellation/lost/expired branches do not publish.

The manifest validation remains inadequate:

- an empty array with any non-null code other than `NO_VISUAL_TOPICS` is accepted;
- a non-empty array may carry any result code;
- elements are not required to be objects with a closed set of fields and allowed statuses;
- `status='generated'` with null `storage_path` passes;
- pending/failed items may carry arbitrary paths or URL-bearing/internal fields;
- the prefix omits the authoritative current `attempt_count`, so it does not prove the winning attempt path;
- count, string sizes, model value/length, prompt/path extensions, and JSON byte size are not bounded;
- the migration does not preflight the exact `(document_id,user_id)` unique constraint required by `ON CONFLICT`.

**Required correction:** Define and enforce a closed bounded JSON contract. Require exact result-code semantics, exact status/path relationships, no URL fields, the trusted current-attempt prefix, maximum item/count/bytes/string lengths, and an approved model/config identifier. Assert the `study_visuals` target constraint and RLS/ACL definition before function creation.

### BFV1-P12-R5-H04 — Source revision protection is stored but not enforced

At enqueue, `documents.updated_at` is read if available and stored/hashed. `expected_document_text_updated_at` and `expected_analysis_updated_at` are always null (`generationJobs.ts:83–124`). The worker retrieves all three values through claimed context but never compares any of them with current rows (`visualsWorker.ts:329–345`). It then reads current title/text/analysis and calls the provider.

Therefore a document or analysis can change after enqueue and the worker will generate from the new source under the old request key/hash. The repository's text update writes `extracted_text` without proving that `documents.updated_at` changes, so even the one populated value is not a reliable text revision in static evidence.

This does **not** prevent a later disposable environment from testing grants, RLS, cancellation, ledger basics, and transaction rollback after all other static blockers are fixed. It **does** block complete source-race/idempotency verification and any claim that the visual output is bound to the enqueued source. D11 catalogue inspection is required to identify canonical source/analysis revision columns or the need for an explicit digest/version.

### BFV1-P12-R5-H05 — The hash still does not represent the executed generation operation

Recursive key sorting now correctly canonicalizes nested objects (`idempotencyKey.ts:50–62`). The envelope still uses `generation_config_version: '1'` and `image_model: 'default'` while execution uses `gpt-4o-mini` and `OPENAI_IMAGE_MODEL ?? 'gpt-image-2'`. It omits prompt templates/system prompt, response format, temperature, token limit, 10,000-character truncation rule, selection/validation code, image size/count, visual-count cap, and actual source/analysis identity.

**Required correction:** Build one server-owned versioned operation descriptor used both for hashing and execution. Bind stable source/analysis revisions or content digests, actual model identifiers, prompts/config versions, parameters, limits, and sanitized input. Do not accept an authenticated caller's opaque hash as proof of that descriptor.

### BFV1-P12-R5-H06 — Raw SQLSTATE and internal database codes still enter logs and thrown errors

The enqueue path now logs safe classifications and does not return P0007. However:

- `requestJobCancel`, both safe-read actions, and the status route log `pg_code: error.code`;
- cancel throws `CANCEL_FAILED:<SQLSTATE>`;
- worker claim/complete/fail/ack/recovery wrappers log `pg_code`;
- completion/fail/ack wrappers throw strings containing `error.code`.

These violate the explicit requirement that P0007 and every other raw SQLSTATE be absent from log event fields and thrown public errors. The visual route catches most worker failures, but wrapper contracts are reusable and logs are already a prohibited sink. The P0007 retry also maps **every** second error to retry-required rather than doing so only for a second P0007.

**Required correction:** Centralize a closed internal classification for every RPC. Never log or concatenate `error.code`, message, details, hint, SQL text, provider response, identifier, or secret. On retry, return 503 only if the second error is the same approved transient race; classify all other failures normally.

### BFV1-P12-R5-H07 — Public diagnostic values have no database authority boundary

The migration adds three nullable text columns but no allowlist, format, or length constraints (`120001:158–161`). `fn_fail_job` writes its service caller's values verbatim (`120001:1190–1250`). The safe DTO exposes those values. TypeScript currently supplies a closed enum and opaque support reference, but D3 has not approved the final worker identity and TypeScript is not database enforcement.

**Required correction:** Add a database allowlist for public codes and message keys, an exact support-reference pattern, bounded lengths, terminal-state coherence, and null/non-null rules. Prefer deriving the public message key inside the database from an allowed code rather than accepting both independently.

### BFV1-P12-R5-H08 — Database tests still create false-positive passes when enabled

`RUN_DATABASE_TESTS=1` now causes a hard `beforeAll` failure when URL, anon key, or privileged key is missing (`workerScenarios.test.ts:314–337`). That gate is a real improvement. Every Group B database operation/assertion remains commented out, and at least the rollback test has a completely empty body. When credentials are supplied, those tests unskip and pass without touching a database.

The Playwright file has real operations for authenticated SELECT/INSERT/DELETE and two safe-read cases. It still skips the entire suite when URL/key are absent; once partly configured, it hard-fails only user A credentials while user B credentials/job fixtures and user A job fixture can skip individual tests. It lacks UPDATE, TRUNCATE, anon, ledger DML, RPC grant matrix, Storage, cancellation, concurrency, rollback, fresh/upgrade, and deterministic setup/cleanup.

**Required correction:** Replace every comment/empty body with executable setup, operation, assertion, and cleanup. Use an explicit approved environment gate; when enabled, every required credential/fixture must hard-fail before tests begin. Record skips as skips when disabled and forbid skips in the release evidence job.

### BFV1-P12-R5-H09 — Storage reconciliation is secure in principle but not deterministic for the live catalogue

The new restrictive policies return false for `study-visuals` and true for unrelated bucket rows, so they defeat permissive allows for the protected bucket while not themselves blocking other buckets. The bucket is set private, uploads use `upsert:false`, paths include user/document/job/attempt/index, and the signed route checks user/document prefix.

The migration dynamically drops every policy whose **name** resembles study visuals (`120001:526–538`). A broad policy with such a name may also carry unrelated-bucket access, so deleting it can unintentionally break other buckets. Conversely, exact owners, table RLS enablement, grants, non-browser roles, and policy expressions are not asserted. The API read projection is closed, but the SSR `sanitizeVisualSet` spreads every unknown stored JSON property before replacing only `storage_path` and `image_prompt` (`page.tsx:13–24`), so an unexpected internal property can cross hydration.

**Required correction:** Inventory exact policies under D11, replace/reconcile by normalized semantics and approved names, and assert the final actor/operation matrix. Use a closed public DTO for SSR as well as the API. Add owner/non-owner/anon Storage tests and signed-expiry tests before any bucket change is approved.

## Worker CAS, cancellation, and recovery assessment

| Operation | Static authority result |
|---|---|
| Claim | Locks/claims only the requested queued row; checks attempts; assigns worker/token; increments version and attempt. Lease input is bounded 30–3600 seconds. |
| Claimed context | Requires exact job, processing state, claim version, worker, token, and live lease. Cancellation is excluded. |
| Heartbeat | Full processing CAS and typed refusal in SQL. Application treats RPC transport failure as authoritative `not_processing`, so its documented transient retry branch cannot run. This is fail-closed but operationally inconsistent. |
| Complete visual | Full processing CAS; cancel branch requires N+1; publication is transactional. Manifest validation is insufficient. |
| Complete non-visual | Full processing CAS; visual job type is rejected; cancel branch requires N+1. |
| Fail | Full processing CAS; cancel branch takes precedence at N+1. Public values are unconstrained. |
| Acknowledge cancel | Requires exact worker/token, unexpired lease, cancel state, and claim version + 1. |
| Request cancel | Owner is derived from `auth.uid()`; queued becomes terminal; processing increments once to cancel-requested; repeat cancellation leaves version unchanged. |
| Stale recovery | Three bounded, skip-locked batches. Cancel-requested only cancels; processing below max requeues; processing at max fails. No cancelled work is selected. |

A stale, duplicate, cancelled, failed, expired, wrong-worker, or wrong-token worker cannot win the reviewed `study_visuals` publication CAS. An in-flight external provider request or Storage upload may nevertheless finish after authority loss because its request is not abort-signal-aware in this implementation. The resulting object remains unreferenced and must remain private until approved D8–D10 orphan cleanup exists.

## P0007 and client retry assessment

The approved browser behavior is now present. The server repeats `fn_enqueue_job` once with the same argument object; the route returns only `{code:'JOB_ENQUEUE_RETRY_REQUIRED'}` with 503; the client enters `retry_required`; sessionStorage is not cleared; and the Retry button calls `handleGenerate`.

One correctness gap remains: any second RPC error is converted to retry-required. Only a repeated P0007-equivalent race may produce that 503. Authentication, permission, payload conflict, schema, or internal errors must take separate safe classified paths.

## SQL static validation evidence

No genuine PostgreSQL parser or static SQL validator command and no durable output were found in the repository evidence for this Round 4 correction. There is no recorded `psql` parse/check, `libpg_query`, `pgsanity`, `sqlfluff` PostgreSQL parse, disposable PostgreSQL transaction, or equivalent parser artifact tied to this diff/checksum.

The exact qualifying command that was run is therefore: **none evidenced**.

`npm run build`, TypeScript compilation, lint, and Vitest do not parse PL/pgSQL or validate PostgreSQL DDL. None is accepted as evidence. This review also did not run a parser because the request prohibited SQL/environment action and asked to verify existing evidence.

## Missing verification evidence

1. PostgreSQL static parser/validator command, version, exact migration checksum, output, and exit status.
2. D11 read-only normalized catalogue for prerequisites, existing migration objects, source revisions, `study_visuals`, grants/RLS, buckets, and every applicable Storage policy.
3. Complete versioned migration manifest and canonical prerequisite baseline.
4. Fresh-project build and populated representative upgrade with normalized final-catalogue equality.
5. Preflight/abort, lock timing, backup/restore, interruption, rollback, and forward-recovery transcripts.
6. Real database actor/grant/RLS/ledger/CAS/concurrency/rollback assertions with zero required skips.
7. Real Storage owner/non-owner/anon operation matrix, private orphan proof, and signed URL expiry evidence.
8. Build/action-manifest/import-boundary evidence proving privileged modules/keys are absent from client chunks.
9. Durable secret scan tied to the exact diff/commit. Static repository search found only placeholders, but no CI artifact exists.
10. D3 provider comparison, proof of concept, least-privilege worker authority, and separate George approval for production.

## Required corrections before disposable migration execution

1. Complete the separately approved D11 catalogue-only inspection and record normalized definitions/checksums without reading student rows.
2. Replace name-only `IF NOT EXISTS` assumptions with exact compatible-definition checks and fail-closed drift handling.
3. Add authoritative document/job-type/config/source scope to the request ledger and enforce exact job/key/hash/scope binding.
4. Classify ambiguous pre-contract rows as legacy/quarantined unless migration provenance proves verified creation.
5. Enforce the closed visual manifest, exact no-topic semantics, current-attempt path, bounds, and required `study_visuals` uniqueness/RLS/ACL contract.
6. Implement actual source revision/digest revalidation before provider work and bind the executed generation descriptor to the hash.
7. Remove every raw SQLSTATE from logs and thrown/public errors; correctly classify the second enqueue retry error.
8. Add database-enforced diagnostic allowlists, formats, length limits, and state coherence.
9. Replace all comment-only/empty database tests and make enabled-suite configuration fail closed with no required skips.
10. Produce genuine SQL parse evidence, then repeat this static review before requesting any disposable migration or Storage execution.

## D11 read-only catalogue inspection scope

Subject to George's exact D12 approval, the next operation may inspect catalogue metadata only for:

- migration history/manifest state and exact checksums;
- `documents`, `document_analysis`, `generation_jobs`, `generation_job_requests` if present, and `study_visuals` definitions;
- column types/defaults/nullability/generated/identity properties;
- constraints, indexes, triggers, functions, owners, ACLs, RLS enablement/forcing, and policies;
- `study-visuals` bucket visibility/configuration and `storage.objects` policies/grants applying to it or shared with other buckets;
- row **counts only where separately approved and necessary** for migration sizing/preflight, without selecting student content or identifiers.

The inspection must not execute DDL/DML, change a bucket/policy, read Storage objects, download files, select student payloads, mark migrations applied, or authorize later execution. Production catalogue access requires its own exact approval even though it is read-only.

## Gate decisions

- **Current uncommitted diff technically acceptable:** **No.** It is useful corrective work but still has one Critical deterministic-upgrade defect and multiple High contract/evidence defects.
- **D11 catalogue inspection as next step:** **Yes, conditionally.** It is the safest next evidence step after George's exact environment/scope/operator/time approval under D12.
- **Disposable migration execution:** **Not approved.** Static corrections and another review must precede any separate execution authorization.
- **Database tests:** **Not approved for execution in their current form.** They would create false-positive passes. They may be rewritten statically; later execution requires corrected tests, corrected migration, and George's disposable-environment approval.
- **Storage tests:** **Not approved for execution yet.** Exact catalogue/policy reconciliation and executable tests must be reviewed first, followed by separate environment approval.
- **Phase 3:** **May not begin as implementation depending on an approved Phase 1–2 database contract.** Independent analysis may continue. Do not build authoritative Phase 3 writes on this unapproved schema.
- **D3:** Does not block static correction or a later approved disposable test. It blocks approval of the current full-bypass service client as final production least-privilege authority and blocks provider-specific production deployment.

## Files reviewed

### Required governance and prior reviews

- `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round4.md`
- `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round3.md`
- `.ai/plans/beta-foundation-v1-remediation.md`
- `.ai/decisions/beta-foundation-v1-founder-decisions.md`

### Current changed implementation and tests

- `migrations/20260729120001_generation_job_state_machine_schema.sql`
- `src/app/actions/generationJobs.ts`
- `src/app/actions/visuals.ts`
- `src/app/api/jobs/visuals/route.ts`
- `src/app/api/visuals/[documentId]/route.ts`
- `src/app/dashboard/study/[id]/page.tsx`
- `src/components/study/VisualsPanel.tsx`
- `src/lib/jobs/__tests__/workerScenarios.test.ts`
- `src/lib/jobs/enqueueErrors.ts`
- `src/lib/jobs/idempotencyKey.ts`
- `src/lib/jobs/workerClient.ts`
- `src/lib/jobs/visualsWorker.ts`
- `src/types/studyVisual.ts`
- `e2e/rls-two-user.spec.ts`

### Required supporting evidence and call paths

- `migrations/beta_foundation_v1.sql`
- `src/app/api/jobs/status/[jobId]/route.ts`
- `src/lib/jobs/errorClassifier.ts`
- `src/lib/jobs/pendingJobKey.ts`
- `src/lib/jobs/stateMachine.ts`
- `src/lib/jobs/visualsStorage.ts`
- `src/lib/supabase/serviceClient.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/client.ts`
- `src/lib/logger.ts`
- `src/types/generationJob.ts`
- `vitest.config.ts`
- `.env.example`
- `package.json`
- current `git diff`, `git diff --stat`, `git diff --name-status`, `git status --short`, and historical-file hashes

## Final report

1. **Final verdict:** **APPROVE FOR D11 READ-ONLY CATALOGUE INSPECTION**—and for that narrowly scoped evidence step only.
2. **Critical findings:** one—name-only/`IF NOT EXISTS` drift handling can preserve incompatible authority objects and still reach authenticated enqueue.
3. **High findings:** ledger scope/exact binding; legacy provenance; incomplete manifest; absent source revalidation; under-scoped executed-operation hash; raw SQLSTATE leakage; unconstrained public diagnostics; false-positive database tests; non-deterministic Storage reconciliation/SSR projection.
4. **Missing verification evidence:** SQL parser output; D11 catalogue; manifest/prerequisite baseline; fresh/upgrade equality; recovery rehearsals; executable database/Storage tests; client-bundle and durable secret-scan artifacts; D3 production authority approval.
5. **Required corrections:** all ten corrections in the ordered section above before any migration execution request.
6. **Current diff technically acceptable:** **No.**
7. **Read-only D11 catalogue inspection next:** **Yes, only after George's exact D12 approval.**
8. **Disposable migration execution approved:** **No.**
9. **Database and Storage tests approved:** **No, not in their current form and not without separate environment approval.**
10. **Phase 3 may begin:** **No implementation dependent on this contract; analysis only.**
11. **Files reviewed:** all governance files, changed implementation/test files, migration baseline, supporting job/Storage/auth/error/types/config files, and the complete current diff inventory listed above.
12. **File created:** `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round5.md`.
13. **Git status:** recorded in the handoff response after this file creation.
14. **No implementation/environment action:** confirmed. No implementation or migration file was edited; no SQL, migration, database, Supabase, Storage, database/E2E test, staging, production, deployment, or Git mutation occurred.
