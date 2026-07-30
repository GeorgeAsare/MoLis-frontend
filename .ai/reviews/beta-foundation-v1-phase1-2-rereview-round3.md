# Beta Foundation V1 Phases 1–2 Database Implementation Re-review — Round 3

- **Reviewer:** MoLis Database Architect
- **Review date:** 2026-07-30
- **Scope:** current Phase 1–2 generation-job SQL, durable request ledger, application call paths, Storage publication, privileged client, types, and tests
- **Repository authority:** `molis-frontend` is the active product
- **Previous review:** `.ai/reviews/beta-foundation-v1-phase1-2-implementation-review.md`
- **Database execution:** none
- **Supabase access:** none
- **Verdict:** **REJECT**

## Executive conclusion

The implementation is materially safer than the version rejected in the previous review. The unsafe owner view is gone; direct `generation_jobs` privileges, including `TRUNCATE`, are revoked; owner reads use narrow `SECURITY DEFINER` functions; normal worker completion/failure uses job ID, state, version, worker ID, lease token, and database-time lease expiry in the mutation predicate; and `fn_complete_and_publish_job` makes the job transition and `study_visuals` publication one PostgreSQL transaction. The new `generation_job_requests` table also correctly separates durable request bindings from active-job exclusion in concept.

Those improvements do not make the current pair safe to execute. Three Critical defects remain:

1. `20260729120001` grants authenticated execution of a non-ledger enqueue function and commits. Until `20260729120003` commits, direct authenticated RPC traffic can accept secondary request keys without durably binding them. Application maintenance mode alone cannot stop a student who already has a JWT from calling the Data API RPC directly.
2. Processing cancellation increments `state_version`, but the worker keeps the pre-cancel version. Every cancel-finalisation branch requires the old version, so the worker cannot turn `cancel_requested` into `cancelled`; no scheduled reconciler is implemented. The worker also continues provider work and Storage upload after heartbeat renewal is refused.
3. D7 private Storage is not implemented. Visuals are uploaded with `upsert: true`, converted to public URLs, and lost-race/post-cancel objects can remain publicly retrievable if the bucket is public. If the bucket is private as approved, those stored public URLs do not provide working access.

The request ledger itself has additional High-severity integrity gaps: the payload hash excludes the document and job type; P0007 receives neither the approved bounded retry nor the approved 503 response; the ledger has no RLS, no cross-table owner constraint, and a silent `ON CONFLICT DO NOTHING` backfill; and `ON DELETE CASCADE` contradicts the documented permanent audit association unless retention/tombstone behavior is made explicit. Database tests are still commented specifications behind unconditional skips, and the current E2E file is obsolete and incomplete.

The two migrations therefore may not yet be applied, even to a disposable local Supabase environment. D3 does not cause that rejection: after these provider-neutral database and application defects are corrected, the current service/secret-key client may be used temporarily for approved disposable local testing. D3 continues to block production worker authority and provider-specific deployment.

## Founder decisions applied in this review

The following instructions are treated as binding:

- The approved order is `beta_foundation_v1.sql` (immutable), then `20260729120001_generation_job_state_machine_schema.sql`, then `20260729120003_generation_job_request_ledger.sql`.
- For the existing project, both corrective migrations must be applied in one approved maintenance operation, with enqueue disabled until both commit and verification passes. This review does not authorise that operation.
- P0007 is internal. The server must perform one bounded retry or deterministic re-read using the same request key and, if still unresolved, return HTTP 503 with public code `JOB_ENQUEUE_RETRY_REQUIRED`. P0007, its SQLSTATE, and raw database text must never reach the student.
- The service-role/secret-key worker client is assessable only as a temporary local/test mechanism. It is not approved as final least-privilege production authority while D3 is unresolved.

## Previous Critical and High findings disposition

| Previous finding | Round 3 status | Direct assessment |
|---|---|---|
| C01 unsafe cross-user owner view | **Corrected** | Both unsafe views are dropped (`120001:176-177`). Owner reads are narrow functions with `auth.uid()` filters, fixed empty `search_path`, `PUBLIC` revocation, and authenticated-only `EXECUTE` (`120001:219-319`). |
| C02 non-atomic worker CAS | **Partly corrected** | Normal processing transitions now use complete predicates. Cancellation cannot converge because the cancel mutation changes the version that the worker cancel branches require. Recovery is atomic at row-update level but unbounded and unscheduled. |
| C03 publication before CAS | **Partly corrected** | `study_visuals` publication is transactionally coupled to completion. Storage upload still precedes CAS, uses public URLs and mutable upsert, and continues after cancellation. |
| C04 incomplete base-table denial | **Corrected statically** | `REVOKE ALL PRIVILEGES` is applied to `PUBLIC`, `authenticated`, and `anon` (`120001:208-210`). Runtime catalog/direct-actor proof is still absent. |
| H01 unsafe/raw/updatable safe view | **Corrected** | No safe view remains. The read functions expose only a reduced JSON DTO and a `visual_count` summary. |
| H02 broken idempotency | **Partly corrected** | Per-action UUIDs and a durable ledger now exist, and active uniqueness is separate. Payload identity, P0007 handling, UI key lifecycle, backfill, retention, and database constraints remain defective. |
| H03 routine full service authority | **Open by explicit qualification** | Acceptable only for disposable local/test assessment. It remains a production blocker under D3. |
| H04 privileged client not fail-closed/current | **Corrected for temporary testing** | Both privileged modules import `server-only`; a plain stateless client prefers `SUPABASE_SECRET_KEY`, with the legacy key as fallback. Bundle/runtime evidence is still required. |
| H05 broad authenticated enqueue input | **Not corrected** | Authenticated callers can still send arbitrary 64 KB JSON, arbitrary key text, and arbitrary 64-character non-hex hashes directly to the definer RPC. |
| H06 cancellation non-convergence | **Not corrected** | The earlier heartbeat behavior is fixed, but the version mismatch now prevents worker acknowledgement/completion/failure from finalising cancellation. |
| H07 unsafe errors | **Partly corrected** | Raw provider/database messages are no longer returned or logged in the reviewed path. Database public fields remain free text; P0007 behavior is missing; the UI renders message keys literally. |
| H08 migration/fresh determinism | **Not corrected** | Order is now decided, but the between-migration authority gap, hidden drift, missing prerequisites, and absent fresh/upgrade evidence remain. |
| H09 non-executing/obsolete tests | **Not corrected** | The local suite reports 91 passed and 49 skipped; every database scenario remains a commented placeholder. The E2E test references removed migration `120002` and omits the ledger and most actor/operation cases. |

## Security state after each migration

| Committed boundary | Authenticated/anon authority | Assessment |
|---|---|---|
| `beta_foundation_v1.sql` alone | Historical broad owner `FOR ALL` policy remains; this boundary is not independently secure. | Known immutable baseline. It must never be exposed as a fresh live project and must be contained during an upgrade. |
| After `20260729120001` | No direct `generation_jobs` table privilege. Authenticated may execute safe reads, enqueue, and cancel; worker transitions are granted only to `service_role`. | Base-table authority is substantially corrected, but `fn_enqueue_job` is callable before the ledger exists. A second key returned through active-job exclusion is not durably stored. |
| After `20260729120003` | Ledger direct privileges are revoked from `PUBLIC`, `anon`, and `authenticated`; authenticated enqueue uses the ledger-aware function. | Intended final ACL is close, but ledger RLS/integrity, idempotency scope, cancellation, Storage, and tests remain incomplete. |

The approved maintenance operation is necessary but not sufficient in the current SQL. Both files have their own `BEGIN`/`COMMIT`. A failed second migration leaves the first committed. Moreover, `120001:473-474` explicitly grants authenticated enqueue, and `120003` does not replace that function until after table creation and backfill. Disabling the current UI or API route does not revoke direct Data API RPC access.

**Required rollout correction:** make the database fail closed. The first corrective migration must not leave `fn_enqueue_job` executable by `authenticated`, or it must enforce a database maintenance gate. Only the ledger migration may grant/re-enable enqueue, as its final step after strict backfill and catalog validation. Keep the whole application/gateway in maintenance mode, drain existing enqueue work, apply both files in order, validate with privileged catalog checks and user-level negative tests, and only then reopen. If the second file fails, remain in maintenance and recover forward; do not reopen on the non-ledger function.

## Critical findings

### BFV1-P12-R3-C01 — The committed boundary between migrations accepts non-durable request keys

**Evidence**

- `120001:338-474` creates and grants the pre-ledger `fn_enqueue_job` to `authenticated`.
- Its active-job path returns an existing job (`120001:410-430`) without storing the second request key.
- `120003:83-89` backfills only the originating key on `generation_jobs` and cannot recover secondary keys that were accepted only in a response.
- `120003:109` drops the old function only inside the second migration's later transaction.

**Impact:** traffic during the gap can reproduce the exact lost-response duplicate that the ledger was created to prevent. If the second migration fails, the inconsistent authority remains live. An app-only maintenance switch does not prevent a direct authenticated RPC.

**Required correction:** keep authenticated enqueue revoked at every committed boundary until the ledger table, strict backfill, function replacement, constraints, RLS, grants, and validation are complete. Add an interruption test after `120001` and a forced-failure test inside `120003`; both must prove enqueue is denied and no request is accepted without a durable binding.

### BFV1-P12-R3-C02 — Cancellation changes the version that every worker cancel path requires

**Evidence**

- Claim returns the post-claim `state_version`; the route stores it once as `currentStateVersion` (`route.ts:50-59`).
- Processing cancellation changes `status` to `cancel_requested` and increments `state_version` (`120001:500-507`).
- Completion, atomic visual publication, failure, and acknowledgement require `state_version = p_state_version` even on their `cancel_requested` branches (`120001:732-746`, `850-864`, `922-936`, `1014-1027`).
- The worker passes the unchanged claim version to completion/failure (`route.ts:87-94`, `117`) and never calls `acknowledgeCancel`.
- A refused heartbeat is only logged; it does not abort generation or fetch the cancellation version (`route.ts:58-63`). No caller/schedule for `recoverStaleJobs` exists in the inspected application.

**Impact:** once cancellation wins, the result cannot publish, which is good, but the legitimate worker also cannot acknowledge cancellation. The job remains `cancel_requested` until an unimplemented external recovery invocation runs after lease expiry. Meanwhile provider work and Storage upload continue, contrary to D1's stop-at-checkpoint behavior.

**Required correction:** define one coherent version protocol. Recommended: cancel remains a versioned CAS; a verified worker status/heartbeat RPC returns the current cancellation version, or the cancel-finalisation predicate explicitly proves the one allowed `claim_version + 1` cancellation version while checking job ID, `cancel_requested`, worker ID, lease token, and lease expiry. The worker must abort at the first failed heartbeat/cancellation checkpoint and call the narrow acknowledgement path. Queue cancellation must set `completed_at`. A real scheduled reconciler must guarantee expired `cancel_requested` jobs reach `cancelled` within D13's two-minute target.

### BFV1-P12-R3-C03 — Approved private Storage and inaccessible lost-race objects are not implemented

**Evidence**

- `study-visuals` has no version-controlled bucket or object policy in the repository migrations.
- Images are uploaded before completion CAS with `upsert: true` (`visuals.ts:174-181`).
- The application calls `getPublicUrl` and persists that URL in the visual item (`visuals.ts:185-191`).
- Attempt-scoped paths are a good start (`visuals.ts:274-307`), but the comments claim orphaned paths are inaccessible while executable code produces public URLs.
- The older exported direct action still writes fixed paths and directly upserts `study_visuals` outside the job state machine (`visuals.ts:340-394`).

**Impact:** with a public bucket, private student-derived visual output and lost-race/post-cancel objects can be retrieved without owner authorization. With the approved private bucket, the saved public URLs will not be a durable working read contract. `upsert: true` also makes a supposedly versioned attempt object mutable.

**Required correction:** implement D7 before this workflow is released: private bucket, owner/restricted-worker path policies, immutable attempt writes (`upsert: false`), database storage of object paths rather than public URLs, short-lived signed URLs issued only after current ownership checks, and bounded cleanup for unreferenced attempts. Stop provider/upload work after cancellation. Remove or strictly disable the direct generation/publish bypass. Test anonymous, owner, non-owner, stale worker, cancelled worker, overwrite, delete, list, and signed-URL expiry cases.

## High findings

### BFV1-P12-R3-H01 — The request hash does not identify the requested operation

`enqueueJob` hashes only `sanitizedInputData` (`generationJobs.ts:57-81`). The visuals route always passes `{}` (`route.ts:26`). Document ID, job type, operation/schema version, and other authoritative scope are excluded. Reusing one key against another owned document or job type with `{}` therefore has the same hash; ledger Step 1 returns the first job without checking its document/type (`120003:200-223`). This violates “same key and same payload” because the actual operation has changed.

Use a versioned canonical envelope such as `{schema_version, operation_kind, document_id, job_type, sanitized_input}` and hash it recursively/canonically on a trusted server. Store or constrain the same scope in the ledger and verify the ledger's job belongs to that user and operation. Same key with any scope/payload difference must return the safe conflict outcome. The current top-level-only key sort also does not canonicalise nested objects.

The client lifecycle compounds this defect. The response's returned key is ignored (`VisualsPanel.tsx:193`), so the non-persisted fallback used before `userId` resolves cannot be recovered. Failed/cancelled/stale “Try Again” and two completed-state regeneration controls call `handleGenerate`, not `handleRegenerate` (`VisualsPanel.tsx:262-273`), so a deliberate new attempt can remain bound to the old terminal job. Preserve keys for transport/503 retries, but clear them for an explicit post-terminal new intent.

### BFV1-P12-R3-H02 — The approved P0007 behavior exists only in comments

The SQL raises P0007 when a concurrent active-job winner becomes terminal before the losing key is bound (`120003:319-325`). `enqueueJob` performs one RPC only, logs the SQLSTATE, and throws `ENQUEUE_FAILED:P0007` (`generationJobs.ts:76-86`). The route catches every error and returns generic HTTP 500 (`route.ts:134-137`). There is no bounded retry, deterministic re-read, HTTP 503, or `JOB_ENQUEUE_RETRY_REQUIRED` response.

P0007 is not currently exposed to the UI because the route discards it, but the founder-approved recovery and public contract are absent. Catch P0007 server-side, retry exactly once with the identical scoped key and canonical hash, then return HTTP 503 `{code: 'JOB_ENQUEUE_RETRY_REQUIRED'}` if unresolved. The client must keep the key and show a safe retry message. Do not return or render P0007, SQLSTATE, raw exception text, function names, or database details.

### BFV1-P12-R3-H03 — The ledger lacks required integrity, RLS, and deterministic backfill checks

The ledger's basic unique key and `job_id` index are appropriate (`120003:48-66`), and ACL revocation statically denies direct anon/authenticated table access (`120003:72-74`). The following gaps remain:

- RLS is not enabled and no deny-by-default policies exist on an exposed `public` table. ACLs are the current denial, but this lacks the mandatory defense-in-depth contract.
- The FK checks `job_id` and `user_id` independently, not as a composite. It cannot prove `generation_job_requests.user_id = generation_jobs.user_id`.
- `request_idempotency_key` and `request_payload_hash` have no exact format checks; the enqueue function permits NULL keys/hashes and accepts any 64-character hash, despite ledger columns being `NOT NULL`.
- Direct authenticated RPC callers can supply a key whose textual user prefix is false. User-column scoping prevents immediate cross-user lookup, but audit data can lie about the documented key format.
- `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` can silently accept incompatible drift.
- Backfill excludes key/hash XOR rows and uses `ON CONFLICT DO NOTHING` (`120003:77-89`), which can hide a conflicting hash or job binding. No post-backfill equality/count check fails the migration.
- `job_id ... ON DELETE CASCADE` deletes the durable request association when a job is purged. That may be compatible with a defined 24-hour replay window and 90-day job retention, but it contradicts the file's “permanent” audit wording unless a tombstone/retained audit association is specified. Irreversible deletion remains blocked by D8–D10.

Require strict preflight failure on XORs, malformed keys/hashes, duplicate/conflicting bindings, owner mismatches, and incompatible existing objects. Backfill with conflict comparison, then assert every eligible originating key has exactly the intended ledger row. Add an owner-preserving composite FK or equivalent trigger/function invariant. Enable RLS with no client table policies, while retaining explicit ACL revocation. Define `request_expires_at`, audit/tombstone behavior, and legal-gated retention before choosing cascade behavior. Add a `created_at`/expiry index only for an approved bounded retention query; the current unique and job indexes are otherwise sufficient for beta lookup paths.

### BFV1-P12-R3-H04 — Worker SQL is much stronger, but some authoritative invariants remain unenforced

The normal CAS predicates now prevent a stale or duplicate worker from changing `generation_jobs` or publishing `study_visuals`: they check job ID, processing state, expected version, worker ID, lease token, and unexpired lease. The PostgreSQL job update and `study_visuals` upsert are one function call/transaction; an upsert failure rolls back completion. The route's subsequent `failJob` can then mark the still-processing job failed if the lease remains valid. A response loss after a successful commit cannot reverse the terminal job because the failure RPC returns a terminal outcome.

Remaining defects:

- `fn_complete_and_publish_job` does not require `job_type = 'visuals'`; `fn_complete_job` does not forbid visuals. A privileged caller can use the wrong completion path.
- `p_visuals`, `p_model`, worker ID, lease duration, attempt settings, and public error strings lack database shape/length/range checks. Negative or excessive lease durations are accepted.
- `fn_fail_job` accepts arbitrary client-visible code/message/reference text even though its output is returned by the safe DTO.
- Recovery is system-wide and unbounded (`120001:1080-1118`), with no batch size, ordering, `SKIP LOCKED`, scheduler, or retry backoff timestamps. Its predicates are atomic under PostgreSQL row-update recheck, but large sweeps will create lock/WAL spikes.
- The active unique index permits multiple NULL-document jobs because ordinary unique indexes treat NULLs as distinct. Either document-backed jobs must be `NOT NULL` for these types, or the exclusion key needs explicit NULL semantics.

Add job-type guards, closed public-error constraints, bounded input/range constraints, state/timestamp/lease consistency checks, and a bounded recovery interface. Do not add premature partitioning, but define ledger/job retention metrics and thresholds before high volume.

### BFV1-P12-R3-H05 — Full-bypass authority is correctly isolated in code but remains temporary only

`serviceClient.ts` and `workerClient.ts` both import `server-only`. The privileged client is a separate plain `supabase-js` instance, uses no cookies or user auth calls, and explicitly disables session persistence, token refresh, and URL-session detection (`serviceClient.ts:25-49`). Only narrow worker RPC wrappers use it in the inspected non-test call graph. `.env.example` contains placeholders, not committed credentials, and neither privileged variable has a `NEXT_PUBLIC_` prefix.

Current official Supabase guidance confirms that `sb_secret_...` keys are the preferred server-side replacement for legacy `service_role` keys, both map to elevated `service_role` authority and bypass RLS, secret keys must never be exposed in a browser, and a server client should disable persistence/refresh/URL detection. See [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), and [server-side secret-key client guidance](https://supabase.com/docs/guides/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa).

The current `SUPABASE_SECRET_KEY` preference and explicitly documented `SUPABASE_SERVICE_ROLE_KEY` fallback are therefore correct for temporary local/test use. They are not least privilege: either key can bypass the RPCs and access every project table. D3 still requires a restricted routine worker identity/credential with only the approved function executions before production worker deployment. Add a browser-bundle/import-boundary test and a repository/CI secret scan; unit tests that merely instantiate the client do not prove non-exposure.

### BFV1-P12-R3-H06 — Migration reproducibility and upgrade recovery remain unproven

`beta_foundation_v1.sql` remains byte-for-byte unchanged: working-tree and `HEAD` Git object hashes are both `dd4ce15979df7dd572a87fe8c7760f7849e7efa1`. The new files are forward-only candidates and the founder-approved order is documented correctly in `120003`. However, `120001` still calls itself the “single corrective migration” and describes only a two-file fresh path (`120001:1-22`), which is now false.

The repository migration chain still does not create prerequisites such as `documents` or `study_visuals`, nor any Storage buckets/policies. It cannot deterministically construct a fresh Supabase project from these three files. `IF NOT EXISTS` masks incompatible column/table/index drift, and no normalized catalog assertions establish owners, grants, RLS, constraints, function signatures, or bucket state. No backup/restore, lock-duration, partial-failure, forward-recovery, or populated-upgrade evidence exists.

Correct the unapplied candidates before first authorised execution. If evidence shows either file was applied to any authoritative environment, freeze it and remediate with a new forward-only file. Supply the D11 prerequisite manifest, strict preflight/catalog assertions, a maintenance runbook, backup/restore proof, and separate fresh and representative-upgrade rehearsals. A failed `120003` must leave enqueue closed while operators repair forward.

### BFV1-P12-R3-H07 — Database tests remain specifications, not executable evidence

The pure local job suite was run during this review and reported **5 files passed, 91 tests passed, 49 skipped**. This validates TypeScript helpers only. Every database scenario in `workerScenarios.test.ts` is guarded by `const NOT_EXECUTED = true`; its RPCs and assertions are comments. Several passing “structural” tests assert hard-coded constants or `expect(true).toBe(true)` instead of inspecting executable SQL/application behavior. Vitest exits successfully despite all database security/race cases being skipped.

`e2e/rls-two-user.spec.ts` has real calls for a small subset, but it:

- says migrations `120001` and removed `120002` are prerequisites;
- silently skips when URL, credentials, or fixture IDs are absent;
- tests authenticated SELECT/INSERT/DELETE only, not UPDATE/TRUNCATE, anon, or ledger DML;
- does not prove only intended RPCs are executable by each actor;
- conditionally skips forbidden-field assertions when the supposed owner fixture returns null;
- has no deterministic fixture creation/cleanup, ledger conflicts, concurrency barriers, cancellation-version race, rollback injection, Storage isolation, GraphQL/Data API reflection, or fresh/upgrade run.

Replace the placeholders with an approved disposable-database integration suite. In the release job, missing configuration or any skip must fail rather than produce green evidence. Keep pure tests separate from database evidence.

## Durable request ledger scenario assessment

| Scenario | Static result | Required proof/correction |
|---|---|---|
| Same key + same complete/failed/cancelled job | **Designed correctly, not executed** | Ledger Step 1 returns the bound terminal job. Add real tests for every terminal status and retention boundary. |
| Same key + conflicting hash | **Designed correctly for the supplied hash, but hash is under-scoped** | Include operation/document/type/version in the hash; test safe P0004 mapping without SQL leakage. |
| Multiple keys while one job is active | **Designed correctly in ordinary flow** | Each accepted key is inserted into the ledger before return. Test K1/K2/K3, response loss, and terminal replay. |
| Concurrent new keys with no active job | **Mostly designed correctly; P0007 gap remains** | Partial unique index selects one job and loser binds to it while active. If it becomes terminal first, loser is unbound and P0007 is raised. Implement the approved same-key retry/503 behavior and execute a barrier test. |
| Identical bare UUID for two users | **Isolated by `(user_id, key)` lookup/unique key** | Current server prefixes the user ID and SQL also scopes by `user_id`. Add real User A/User B tests and reject false textual prefixes at the function boundary. |
| Direct anon/authenticated ledger access | **Statically denied by ACL, not runtime-proven** | Test SELECT/INSERT/UPDATE/DELETE/TRUNCATE plus Data API and GraphQL metadata. Enable deny-by-default RLS as defense in depth. |
| Job deletion | **Cascades ledger rows** | Decide replay/audit/tombstone retention explicitly under D8–D10 before enabling any deletion. Do not call the binding permanent while it cascades with the 90-day job row. |
| Backfill | **Unsafe to trust** | `ON CONFLICT DO NOTHING` can conceal divergent historical state. Add strict preflight, conflict comparison, and postcondition counts/mapping checks. |
| Growth | **Lookup indexes adequate initially; retention absent** | Unique `(user_id,key)` and `job_id` support the main paths. Define 24-hour replay/90-day job handling, cleanup index/query, backlog alert, and partition-review threshold before large scale. |

## Worker transition predicate audit

| Function | Job/state/version/worker/token/expiry | Cancellation | Attempt rule | Round 3 result |
|---|---|---|---|---|
| `fn_claim_job` | Row-locks job; final claim checks job, queued state, selected version; assigns worker/token/lease | Cannot claim cancelled/cancel-requested | Checks attempts before claim | **Pass with input/range hardening required** |
| `fn_heartbeat_job` | Final update checks job, processing, version, worker, token, unexpired lease | Correctly refuses `cancel_requested` | N/A | **Pass SQL CAS; worker must react to refusal** |
| `fn_complete_job` | Complete branch has the full predicate | Cancel branch expects obsolete claim version | No explicit job-type/attempt guard | **Fail cancellation; harden type** |
| `fn_complete_and_publish_job` | Complete branch has the full predicate and transactional manifest publication | Cancel branch expects obsolete claim version | No explicit visuals-type/attempt guard | **Fail cancellation; normal publication CAS passes** |
| `fn_fail_job` | Failure branch has the full predicate | Cancel branch expects obsolete claim version | Error fields unconstrained | **Fail cancellation; normal failure CAS passes** |
| `fn_acknowledge_cancel` | Checks job, worker, token, version, state, expiry | Expects obsolete claim version and is unused by route | N/A | **Fail** |
| `fn_recover_stale_jobs` | Conditional updates include exact state and expired lease and increment version | Stale cancellation goes only to cancelled | Requeues below max, fails at max | **Race-safe at row level; operationally unbounded/unscheduled** |
| `fn_request_job_cancel` | Single owner-scoped conditional update and version increment | Correct state choice; queue terminal timestamp missing | N/A | **Atomic, but incompatible with worker version protocol** |

A stale/duplicate worker cannot publish `study_visuals` through the reviewed SQL completion function. It can still upload or overwrite a Storage object before the SQL CAS, and that object is not guaranteed private. That distinction is release-critical.

## Required corrections before any migration execution

1. Close the between-migration RPC window at the database layer. Do not grant authenticated enqueue until the ledger migration, strict backfill, and verification complete.
2. Repair the cancellation version protocol; abort work after cancellation/heartbeat refusal; use the acknowledgement path; implement and schedule bounded stale recovery.
3. Implement the D7 private `study-visuals` path contract: immutable attempt objects, path storage, signed owner reads, restrictive policies, and orphan cleanup. Remove the direct generation/publish bypass.
4. Hash a versioned canonical operation envelope including document ID and job type. Validate the exact key/prefix/hash formats in SQL and prohibit NULL key/hash for the canonical authenticated enqueue path.
5. Implement the approved single P0007 retry/re-read with the same key and safe HTTP 503 `JOB_ENQUEUE_RETRY_REQUIRED`; preserve the key in the client and never expose P0007.
6. Harden the ledger with RLS, owner-preserving job FK/invariant, strict preflight/backfill postconditions, drift failure, and explicit replay/audit/deletion retention behavior.
7. Add job-type guards, public-error allowlists/format limits, JSON/model/worker/lease/attempt constraints, and state/timestamp consistency constraints.
8. Replace all skipped/comment-only database tests and obsolete E2E assumptions with executable actor, grant, ledger, concurrency, rollback, cancellation, Storage, fresh-build, and populated-upgrade tests.
9. Supply the canonical prerequisite manifest and maintenance/backup/forward-recovery runbook. Correct stale migration comments without changing the approved order.
10. Keep full-bypass service/secret authority explicitly local/test-only. Production worker deployment remains blocked until D3 approves a provider and a least-privilege worker authority.

## Tests still requiring execution

No SQL-backed assertion was executed in this review. After all Critical and High corrections pass another static review and George authorises a disposable environment, execute:

1. Fresh build from the approved complete manifest, including all prerequisites and private Storage contracts; compare normalized schema, constraints, owners, ACLs, RLS, functions, and policies.
2. Representative populated upgrade with strict preflight, backup/restore, lock timing, backfill equality, forced `120003` failure, forward recovery, and proof that enqueue remains denied until final verification.
3. Direct actor matrix for anon, User A, User B, temporary test worker/service actor: base and ledger `SELECT/INSERT/UPDATE/DELETE/TRUNCATE`, every user read/write RPC, and every worker/recovery RPC.
4. PostgREST and GraphQL metadata/query/mutation tests proving no base internal fields, ledger columns, result/error payloads, worker fields, leases, hashes, or keys are exposed.
5. Ledger tests for same key/same complete-failed-cancelled result; same key/different document/type/input; multiple keys/one active job; at least 20 concurrent keys; P0007 barrier and safe retry; identical bare UUID across users; deletion/retention boundary; malformed/NULL key/hash.
6. Worker race tests for claim/claim, cancel/claim, cancel/heartbeat, cancel/complete, cancel/fail, cancel/ack, heartbeat/recovery, expired lease, stale version, wrong worker, wrong token, duplicate callback, max attempts, and terminal immutability.
7. Atomic publication failure injection proving `study_visuals` failure rolls back completion, response loss cannot reverse completion, and only a winning visuals job can publish.
8. Private Storage tests for owner/non-owner/anon read/list/upload/update/delete, signed URL expiry, immutable attempt collision, stale/cancelled worker objects, and bounded orphan cleanup.
9. API/UI tests for one P0007 retry, safe 503 code, key preservation, explicit post-terminal new intent, no raw SQL/provider/secret/PII leakage, and localized safe messages.
10. Bundle and secret tests proving neither privileged key/value nor privileged module reaches client chunks, `NEXT_PUBLIC_` variables, logs, responses, source maps, committed fixtures, or URLs.
11. Query-plan/load tests for owner polling, active-job lookup, ledger lookup, bounded recovery, and retention cleanup at representative volume. D13's polling target also requires reducing the current fixed three-second rate.

The local pure suite result was **91 passed, 49 skipped**. It is not evidence for SQL, grants, RLS, races, Data API/GraphQL reflection, Supabase Storage, or migration behavior. The Playwright/Supabase suite was not run because Supabase access and migration execution were expressly prohibited.

## Phase 3 and D3 disposition

- **Phase 3:** may not begin on the assumption that this Phase 1–2 database contract is approved. Corrections, executable database tests, and a passing re-review come first. Independent analysis can continue, but implementation must not build authoritative usage or other foundation behavior on this rejected job contract.
- **D3:** does **not** block static work or later disposable local database testing. It blocks approval of this service-role client as the final worker authority, provider-specific production integration, and production worker deployment.
- **No migration execution is authorised.** Even after corrections, disposable testing requires George's explicit environment approval; staging and production require their own separate approvals.

## Files reviewed

### Review and governing context

- `.ai/reviews/beta-foundation-v1-phase1-2-implementation-review.md`
- `.ai/decisions/beta-foundation-v1-founder-decisions.md` and `.ai/plans/beta-foundation-v1-remediation.md` where needed to verify D1, D2, D3, D7, D8, D11, and D13 qualifications

### Requested implementation

- `migrations/beta_foundation_v1.sql`
- `migrations/20260729120001_generation_job_state_machine_schema.sql`
- `migrations/20260729120003_generation_job_request_ledger.sql`
- `src/app/actions/generationJobs.ts`
- `src/app/actions/visuals.ts`
- `src/app/api/jobs/visuals/route.ts`
- `src/app/api/jobs/status/[jobId]/route.ts`
- `src/components/study/VisualsPanel.tsx`
- `src/lib/jobs/errorClassifier.ts`
- `src/lib/jobs/idempotencyKey.ts`
- `src/lib/jobs/pendingJobKey.ts`
- `src/lib/jobs/stateMachine.ts`
- `src/lib/jobs/workerClient.ts`
- `src/lib/jobs/__tests__/errorClassifier.test.ts`
- `src/lib/jobs/__tests__/idempotencyKey.test.ts`
- `src/lib/jobs/__tests__/pendingJobKey.test.ts`
- `src/lib/jobs/__tests__/stateMachine.test.ts`
- `src/lib/jobs/__tests__/workerScenarios.test.ts`
- `src/lib/supabase/serviceClient.ts`
- `src/types/generationJob.ts`
- `e2e/rls-two-user.spec.ts`
- `vitest.config.ts`
- `.env.example`

### Supporting call-path evidence

- `src/lib/logger.ts`
- `migrations/` manifest and Storage-reference search

## Final decision

1. **Final verdict:** **REJECT**.
2. **Critical findings:** unsafe authenticated enqueue window between the two commits; cancellation version protocol prevents terminal acknowledgement; private/immutable Storage isolation is not implemented.
3. **High findings:** under-scoped request hash and broken terminal-intent UI lifecycle; absent P0007 retry/503 behavior; ledger RLS/owner/backfill/deletion/retention gaps; incomplete DB invariants and unbounded recovery; service authority suitable only temporarily; missing fresh/upgrade determinism; skipped/obsolete database tests.
4. **Required corrections:** all ten corrections listed above must be completed and statically re-reviewed before any SQL execution.
5. **Disposable local Supabase:** the two new migrations may **not** yet be tested there. After corrections and separate approval, they must be tested together in the approved order under enforced maintenance, never individually as an exposed application state.
6. **Phase 3:** **No**, not as implementation depending on an approved Phase 1–2 contract.
7. **D3:** blocks final production least-privilege/provider deployment, not provider-neutral static review or later approved disposable testing.
8. **Implementation/environment actions:** no implementation file, migration, Supabase project, Storage bucket, deployment, staging state, production state, Git index, commit, branch, or remote was changed. Only read-only repository inspection, official-documentation review, and the pure local Vitest command were performed.
