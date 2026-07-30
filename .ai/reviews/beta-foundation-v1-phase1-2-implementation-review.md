# Beta Foundation V1 Phases 1–2 Implementation Review

- **Reviewer:** MoLis Database Architect
- **Review date:** 2026-07-29
- **Scope:** focused post-implementation review of the Generation Jobs work in Beta Foundation V1 Phases 1 and 2
- **Repository authority:** `molis-frontend` is the active product; repository SQL and application call paths were inspected directly
- **Database execution:** none
- **Supabase access:** none
- **Verdict:** **REJECT**

## Executive conclusion

The three proposed migrations must not be executed, including against a disposable local Supabase environment, in their current form. They do not implement the approved job-state contract and they are not safe as an “inseparable set.” Migration `20260729120002` temporarily creates a privileged, unfiltered owner-executed view that can expose every user's job rows. Each file commits independently, so a runner interruption or failure before `20260729120003` leaves that exposure in place.

The final state is also not acceptable. Worker transitions read lease/state data and then mutate it in a separate statement without putting lease expiry, worker identity, or `state_version` in the final compare-and-set predicate. A lease can expire or recovery/cancellation can win between the read and update, allowing a stale worker to complete or fail a job. Recovery has the inverse race and can requeue a job after a concurrent heartbeat. The application publishes the real visual side effect even earlier: it overwrites a fixed Storage object and upserts `study_visuals` before the lease-guarded completion RPC. A stale or cancelled worker can therefore publish or replace user-visible output even when `fn_complete_job` refuses the job-row transition.

The final safe view exposes raw `result_data` through the Supabase Data API and GraphQL-visible view schema, contradicting `JobSafeDto`. Its DML grants, owner, and prior ACLs are not reconciled explicitly. Direct base-table `TRUNCATE` and privileges inherited from `PUBLIC` are not revoked. Request idempotency is a daily user/document/type hash rather than an immutable request identity, is queried without `user_id`, is not race-safe, and is incorrectly coupled to terminal state. The database integration tests are unconditional placeholders; the Playwright RLS test targets the interim view that Phase 2 drops and expects base-table SELECT to succeed even though the final migration revokes it.

Phase 3 must not begin on top of this contract. Correct the SQL and server boundaries first, review the replacement artifacts, and only then seek approval to run them in a disposable local environment.

## Review basis

This review compared the implementation with:

- `CLAUDE.md`
- `.ai/playbook/FOUNDER_DIRECTIVES.md`
- `.ai/playbook/AI_TEAM.md`
- `.ai/plans/beta-foundation-v1-remediation.md`
- `.ai/decisions/beta-foundation-v1-founder-decisions.md`
- `.ai/reviews/beta-foundation-v1-review.md`
- `.ai/reviews/beta-foundation-v1-database-review.md`
- `.ai/reviews/beta-foundation-v1-database-rereview.md`

The review was static except for the repository's pure job unit suite. No SQL, migration, Supabase request, browser E2E test, deployment, or production operation was run. `npm test -- src/lib/jobs` completed with **57 passed and 31 skipped** across four test files. Every database-dependent test in `workerScenarios.test.ts` remains skipped and contains only `expect('not executed').toBe('not executed')`.

## Verification summary

| Requirement | Result | Assessment |
|---|---|---|
| Three deterministic, forward-only migrations safe as one set | **FAIL** | New files are forward additions, but each commits independently; the intermediate state is unsafe, drift is hidden by `IF NOT EXISTS`, and the fresh prerequisite chain is absent. |
| Historical migration immutable | **PASS** | Working-tree and `HEAD` Git object hashes both equal `dd4ce15979df7dd572a87fe8c7760f7849e7efa1`. |
| Authenticated cannot SELECT/INSERT/UPDATE/DELETE/TRUNCATE base table | **FAIL** | Four privileges are revoked, but `TRUNCATE` and any inherited `PUBLIC` privileges are not. Deterministic denial is not established. |
| Authenticated executes only enqueue and cancel job RPCs | **FAIL / unproven** | Intended grants are present, but worker functions do not explicitly revoke prior direct `anon`/`authenticated` ACLs, and the full public-schema function catalog is not asserted. |
| Worker/recovery functions unavailable to anon/authenticated | **FAIL / unproven on upgrades** | `PUBLIC` is revoked, which is sufficient for newly created functions in a clean database, but `CREATE OR REPLACE FUNCTION` preserves pre-existing ACLs; direct role grants are not reconciled. |
| Privileged client cannot inherit user session or expose key | **PARTIAL** | A new stateless `supabase-js` client avoids cookie inheritance today, but neither privileged module imports `server-only`, the current key is legacy-only, and routine `service_role` use violates the least-privilege worker plan. |
| Safe view is a secure public boundary | **FAIL** | It exposes raw `result_data`; is automatically updatable; lacks explicit all-role DML revocation and stable ownership; `CREATE OR REPLACE` can preserve unsafe ACLs. |
| No internal columns through Data API/GraphQL/metadata/responses | **FAIL** | Raw `result_data` is directly selectable on the granted view and appears in its reflected metadata. Base-table invisibility is not catalog-tested. |
| Every worker transition uses complete CAS/lease checks | **FAIL** | No transition accepts/checks expected `state_version`; post-claim functions do not check `worker_id`; expiry is checked before, but not in, the mutation predicate. |
| Stale/duplicate worker cannot publish | **FAIL** | SQL has lease TOCTOU races; application Storage/`study_visuals` publication occurs before completion CAS. |
| Cancellation always wins and becomes/remains cancelled | **FAIL** | Completion/failure races remain; heartbeat can extend `cancel_requested` indefinitely; cancel RPC can lose a race and still return success. |
| Request idempotency separate from active uniqueness | **FAIL** | Two indexes exist, but request identity semantics, scope, conflict behavior, and atomic enqueue are incorrect. |
| Caller-controlled IDs cannot cross users/confuse authority | **FAIL** | User RPC derives `auth.uid()`, but arbitrary `p_sanitized_input` is client-controlled; worker RPCs accept arbitrary `p_user_id` under a full-access key. |
| Public errors/support references cannot leak internals/PII | **FAIL** | Database accepts arbitrary public strings; route/logger and visual generation log raw errors; visual JSON stores raw provider/storage errors. |
| Database-dependent tests genuinely validate the contract | **FAIL** | Database scenarios are skipped placeholders and the E2E file tests obsolete/intermediate behavior. |
| Claude's implementation claims match actual code | **FAIL** | Multiple comments/report claims described below are contradicted by executable SQL and application flow. |

## Critical findings

### BFV1-P12-C01 — Migration 2 creates a cross-user read exposure

**Evidence:** `20260729120002_generation_job_restrict_client_authority.sql:56-77` creates `generation_jobs_owner_view` without `WHERE user_id = auth.uid()` and grants it to `authenticated`. The comment says underlying RLS still applies, but ordinary PostgreSQL views execute with their owner's permissions by default. Supabase explicitly documents that views created by a privileged owner bypass underlying RLS unless `security_invoker = true` is used. Migration 3 later drops the view, but migration 2 commits first.

**Impact:** If migration 2 commits and migration 3 fails, is delayed, or is not applied, any authenticated user may read all rows projected by that view, including `result_data`. Calling the files “inseparable” does not make three independent transactions atomic.

**Required correction before any execution:** Do not create an unsafe intermediate object. Either consolidate unapplied SQL into one atomic reviewed migration, or make every migration boundary independently fail-closed. If an intermediate read boundary is necessary, use an owner-filtered, tightly granted function/view whose security semantics are correct at that boundary. Test interruption after each migration.

### BFV1-P12-C02 — Worker transitions are not atomic lease/version compare-and-set operations

**Evidence:** `fn_complete_job`, `fn_fail_job`, and `fn_acknowledge_cancel` first select status/token/expiry and then update with only job ID, user ID, token, and status. Their final `UPDATE` predicates omit `state_version`, `worker_id`, and `lease_expires_at >= transaction/database time`. `fn_heartbeat_job` has the same select/update split. `fn_claim_job` does not accept expected `state_version`; its max-attempt update does not include `user_id`, expected version, or a result check. `fn_recover_stale_jobs` selects stale IDs in a CTE and updates only by ID, so a concurrent valid heartbeat or state change between selection and mutation can be overwritten.

**Impact:** A stale worker can publish after lease expiry in the read/update gap. Recovery can requeue or fail a live worker after its lease was renewed. Duplicate callbacks and cancellation races can produce incorrect outcomes. Incrementing `state_version` without comparing the expected value is not compare-and-set.

**Required correction before any execution:** Every mutation must be a single conditional write, or a row-locking transaction with equivalent proof. The winning predicate must include job ID, exact expected state, expected `state_version`, current `worker_id`, current `lease_token`, and lease validity/expiry as applicable. Recovery must compare the selected version/state/expired lease in the update and process bounded batches with locking such as `FOR UPDATE SKIP LOCKED` where appropriate. Return the new version and explicit outcome from the actual affected row.

### BFV1-P12-C03 — Stale and cancelled workers can publish real visual output outside job CAS

**Evidence:** `src/app/api/jobs/visuals/route.ts` calls `generateVisualsForJob` before `completeJob`. In `src/app/actions/visuals.ts`, image generation writes `${userId}/${documentId}/${index}.png` using `upsert: true`, obtains a public URL, and upserts `study_visuals` before the worker attempts the completion RPC. No lease token, worker ID, attempt identity, or `state_version` protects these Storage/database side effects.

**Impact:** A stale worker, a duplicate delivery, or a worker finishing after cancellation can overwrite the current visual and user-visible database row. Rejecting its later job completion does not undo publication. This directly violates D1 and the approved at-least-once/idempotent-side-effect design.

**Required correction before any execution:** Workers must write immutable attempt/version-scoped objects and staged result rows. Only the current lease holder may atomically publish the winning result reference during completion CAS. A stale/cancelled attempt may leave a quarantined object for later safe cleanup but cannot overwrite or become the current version. Public URLs and fixed-path upsert must be removed under the approved private Storage contract.

### BFV1-P12-C04 — The authenticated base-table denial is incomplete

**Evidence:** Migration 3 revokes `SELECT, INSERT, UPDATE, DELETE` from `authenticated` and `anon`, but never revokes `TRUNCATE`. It also does not revoke table privileges from `PUBLIC`. RLS does not protect `TRUNCATE`. The historical migration does not establish a canonical grant baseline, so an upgrade cannot assume those privileges are absent.

**Impact:** The required “no TRUNCATE” property is not enforced deterministically. Existing/default/public grants could also keep a supposedly revoked operation reachable.

**Required correction before any execution:** Reconcile the complete table ACL explicitly, including `TRUNCATE`, `REFERENCES`, and `TRIGGER` as appropriate, from `PUBLIC`, `anon`, and `authenticated`, then grant only the exact intended capabilities. Add catalog assertions and direct actor tests for every operation. Do not rely on RLS to block table-wide operations it does not govern.

## High findings

### BFV1-P12-H01 — `generation_jobs_safe_view` is not a sufficiently hardened safe boundary

The final view's `security_invoker = false` is understandable because callers have no base-table `SELECT`: the view must run with a trusted owner's base-table privilege. In this exact definition, `WHERE user_id = auth.uid()` can securely bind the row to the request JWT because `auth.uid()` reads request claims rather than the view owner. `security_barrier = true` helps prevent unsafe predicate pushdown. Those facts do not resolve the remaining defects:

- The view exposes raw `result_data`, contrary to `JobSafeDto` and application comments. Any authenticated client can query it directly, even though the API route later reduces it to `visual_count`.
- It is a simple one-table view and is automatically updatable under PostgreSQL's view rules. `security_barrier` does not make it read-only.
- The migration grants `SELECT` but never first runs `REVOKE ALL`/explicit DML revocations on the view for `PUBLIC`, `anon`, and `authenticated`. `CREATE OR REPLACE VIEW` preserves existing privileges, so drift can retain mutation authority.
- The owner is whatever role executes the migration, despite comments asserting it is `postgres`. Ownership is not explicitly normalized to a stable, non-login, controlled role.
- The migration does not assert who has `CREATE` in `public`, who can replace/alter the view, or the resulting ACL/owner/options.
- `security_barrier` is not a substitute for grants, ownership, a narrow projection, or direct tests.

**Recommendation:** Prefer a narrow `SECURITY DEFINER` read function with fixed empty `search_path`, explicit `auth.uid()` ownership, a typed safe return shape, stable owner, and `REVOKE ALL ... FROM PUBLIC, anon, authenticated` followed by only the intended `EXECUTE` grant. A hardened view can work, but must omit raw `result_data`, be made explicitly read-only by ACL, have deterministic ownership/options, and be tested through PostgREST and GraphQL. The function is safer here because it reduces the risk of accidentally creating an updatable Data API relation.

### BFV1-P12-H02 — Request idempotency is incorrectly designed and non-atomic

`buildRequestIdempotencyKey` hashes `(user, document, job type, UTC day)`. It does not represent one immutable user action/request. Every explicit generate/regenerate action on the same day receives the same key; a completed job is returned all day, so the Regenerate button can enqueue nothing. Failed/cancelled retries create new rows reusing the same key because the final unique index covers only active rows. The SQL idempotency lookup is not scoped by `user_id`; a colliding or replayed key from another user can cause cross-user conflict/ID disclosure inside the definer function. The select-then-insert flow is race-prone: simultaneous calls can raise a unique violation rather than reliably return one job. Top-level-only JSON key sorting is not canonical for nested payloads.

Active-work exclusion and request replay are conceptually represented by separate indexes, but their database semantics are not correct. The approved design requires an immutable caller/server request identity scoped to `(user_id, operation_kind)`, a versioned canonical payload hash, and a separate active partial uniqueness constraint on `(user_id, document_id, job_type)`. Same request/key and same payload must always return the same job, including terminal outcomes during the retention window; a genuinely new retry/regenerate action must have a new request key. Enqueue must resolve concurrent uniqueness using one atomic insert/upsert/exception-retry transaction, not check then insert.

### BFV1-P12-H03 — Routine full-access service authority violates the approved worker model

`workerClient.ts` calls every worker RPC with a full Supabase `service_role` client. The remediation plan says service role is for migration/break-glass and the routine worker must be least privilege. Every RPC also accepts caller-chosen `p_user_id`; because the credential bypasses RLS and has full project access, that parameter does not authenticate ownership. A misrouted or compromised server call can target any user's job, and the key can bypass the functions entirely.

Provider-specific durable worker implementation remains blocked by D3, but the provider-neutral database contract still needs a restricted worker identity/authority design. Remove caller-authoritative `p_user_id` where possible; derive owner from the job row, authenticate a specific worker/producer, and authorize only lease-scoped functions. Do not describe a full-access key plus user ID as worker ownership enforcement.

### BFV1-P12-H04 — Current privileged client is not sufficiently fail-closed or current

The helper uses a fresh `@supabase/supabase-js` client with persistence and refresh disabled. It does not use the SSR cookie client and performs no auth operation, so it does not inherit a user session in the current call graph. That part is sound. However:

- Neither `serviceClient.ts` nor `workerClient.ts` imports `server-only`; comments do not prevent a future client-component import or bundler regression.
- `detectSessionInUrl: false` is not set. It is less material in a server runtime but should be explicit in a privileged stateless client.
- The helper reads only `SUPABASE_SERVICE_ROLE_KEY`; `.env.example` documents only that legacy key.
- The client has full RLS-bypass authority rather than the planned restricted worker authority.

As of 2026-07-29, Supabase says legacy `anon`/`service_role` keys are being replaced and are scheduled for deprecation by the end of 2026. Backend code should prefer an `sb_secret_...` key; secret keys add browser rejection and per-service rotation, while still mapping to `service_role` and bypassing RLS. See [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) and [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys). Supabase also recommends a separate plain `supabase-js` privileged client rather than an SSR client because a user session can replace its Authorization header; see [service-role client troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z).

**Required application contract:** use `SUPABASE_SECRET_KEY` as the preferred server-only variable, with `SUPABASE_SERVICE_ROLE_KEY` only as a clearly documented temporary legacy fallback. Add runtime `server-only` guards, stateless auth options, no auth-session methods, and a browser-bundle/import-boundary test. Never prefix either variable with `NEXT_PUBLIC_`; never log, return, commit, or put it in URLs. No actual privileged value was found in the requested source files or `.env.example`; only a placeholder is committed there. A repository-wide pattern scan also found JWT-like strings inside tracked downloaded Supabase dashboard assets. This review did not inspect or decode those artifacts because doing so could expose environment data; a separately approved secret-history scan is required before asserting that the entire repository has never contained a credential.

### BFV1-P12-H05 — Client enqueue authority remains broader than approved

`fn_enqueue_job` derives `user_id`, status, timestamps, attempts, and worker fields, which is correct. It nevertheless accepts arbitrary `p_sanitized_input`, `p_idempotency_key`, and `p_payload_hash` directly from `authenticated`. The database cannot infer that a JSON parameter named “sanitized” was validated. `enqueueJob` is exported from a `'use server'` module and itself accepts caller-supplied JSON. There are no SQL shape/size/schema-version constraints and the key/hash formats are unconstrained.

The direct authenticated RPC must accept only narrowly validated safe inputs or sit behind a trusted server operation that derives and validates the versioned payload. Add length/format/check constraints for hashes/keys and a schema/versioned payload validator. The job type and document ownership checks are positive but not sufficient.

### BFV1-P12-H06 — Cancellation can silently lose races and remain non-terminal indefinitely

`fn_request_job_cancel` reads status, then updates without expected `state_version`, does not use `RETURNING`, and returns `VOID` even if the conditional update affected no row. A queued job can be claimed after the read; the cancellation update then affects zero rows but the caller receives success. Direct queued cancellation does not increment `state_version` or set the terminal timestamp. Processing cancellation also omits version and cancellation timestamp.

`fn_heartbeat_job` permits heartbeats while `cancel_requested`, allowing a worker to extend the lease indefinitely. Stale recovery only cancels rows whose non-null lease expires, so a buggy worker can prevent terminal cancellation forever. Completion/failure/acknowledgement have the lease TOCTOU described above. Cancellation must be a single CAS returning the actual final state/version; heartbeats should stop extending publication authority after cancellation, and a bounded database-time reconciliation rule must guarantee eventual `cancelled`.

### BFV1-P12-H07 — Public error confidentiality is not enforced end to end

The TypeScript classifier returns a closed safe code and the status API returns a reduced DTO, which are good local controls. The database `fn_fail_job` accepts arbitrary `p_error_code`, `p_message_key`, and `p_support_reference` with no allowlist, length, format, or restricted-diagnostics separation. SQL-generated max-attempt/stale support references are shared day-level labels, not unique opaque incident references.

More importantly, `src/app/actions/visuals.ts` logs raw OpenAI and Storage messages, stores truncated raw messages in each visual item's `error` field, and returns/upserts that JSON. `src/app/api/jobs/visuals/route.ts` logs `String(err)` under the key `error`; the shared logger does not redact an `error` key. Provider messages, SQL/storage details, document-derived content, identifiers, or secrets can therefore reach logs or user-readable visual data even though the job DTO is safe.

Use a strict database allowlist/enum or server-derived safe code mapping; generate opaque unique support references internally; store restricted redacted diagnostics separately with short retention and access controls. Never persist or return raw provider/storage/SQL errors in `study_visuals`. Redact `error`, stack/cause, headers, URLs, and known provider/database fields in structured logs and test adversarial messages containing secrets and personal data.

### BFV1-P12-H08 — Migration upgrade/fresh determinism is not established

The files depend on `beta_foundation_v1.sql`, which itself depends on missing active-product prerequisites such as `documents`; no explicit manifest or prerequisite baseline exists here. `IF NOT EXISTS` for columns/indexes accepts same-name objects with incompatible definitions. `CREATE OR REPLACE FUNCTION/VIEW` can preserve prior owner/ACL state. Migration 1 creates a global idempotency index that migration 3 immediately drops; migration 2 creates a view migration 3 immediately drops. The intermediate application compatibility and partial-failure recovery are not validated.

The active unique index also treats nullable `document_id` values as distinct, permitting multiple active rows when a job has no document. Either the supported job contract must require a non-null document, or the active key must define null semantics explicitly. State/attempt/lease/public-field consistency checks are missing. The implemented defaults—600-second lease and 300-second heartbeat extension—also differ from the approved D3 recommendation of a 90-second lease and 30-second heartbeat, and the current visual worker sends no heartbeat at all.

Create the approved migration manifest/prerequisite baseline, normalized catalog assertions, explicit drift failures, per-boundary compatibility plan, and separate fresh/upgrade rehearsals. Because these files are currently unapplied candidates, repair or replace them before first execution rather than applying known-bad SQL and adding another correction migration. Once any file has been applied anywhere authoritative, it becomes immutable and every correction must be forward-only.

### BFV1-P12-H09 — Tests do not validate database authority, races, RLS, or view safety

`workerScenarios.test.ts` labels database scenarios as tests but unconditionally skips all 31 and contains no setup, RPC call, concurrent connection, or assertion against Postgres. Its “safe view column” unit test hard-codes a set that includes `result_data`; it does not inspect the migration or database. Its cancellation and state tests assert TypeScript set membership, not database behavior.

`e2e/rls-two-user.spec.ts` is inconsistent with the final migration: it queries the base `generation_jobs` table expecting owner SELECT to succeed, and queries `generation_jobs_owner_view`, which migration 3 drops. It does not test UPDATE, TRUNCATE, cancel ownership, enqueue parent attacks, the final safe view, worker RPC denial, DML on the view, GraphQL reflection, or real race barriers. It can pass vacuously when User B has no job. Credentials are runtime environment values, but setup does not create deterministic owned fixtures.

These are test plans/placeholders, not durable evidence. They must be replaced with executable disposable-environment tests that fail when configuration/fixtures are absent in the approved job, and report every skip as release-blocking.

## Worker transition predicate audit

| Function | Job ID | Expected state | Expected `state_version` | Worker ID | Lease token | Lease validity in mutation | Attempt bound | Cancellation rule | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `fn_claim_job` | Yes | `queued` in update | **No** | Only assigned | New token assigned | N/A | Read first; max branch is racy | Cannot claim non-queued | **FAIL** |
| `fn_heartbeat_job` | Yes | processing/cancel requested | **No** | **No** | Yes | **No; pre-read only** | No | Incorrectly extends cancel-requested lease | **FAIL** |
| `fn_complete_job` | Yes | processing/cancel requested | **No** | **No** | Yes | **No; pre-read only** | No | Branch intends cancel wins | **FAIL** |
| `fn_fail_job` | Yes | processing/cancel requested | **No** | **No** | Yes | **No; pre-read only** | No retry classification/backoff | Branch intends cancel wins | **FAIL** |
| `fn_acknowledge_cancel` | Yes | cancel requested | **No** | **No** | Yes | **No; pre-read only** | No | Correct target, racy mutation | **FAIL** |
| `fn_recover_stale_jobs` | IDs from CTE | State tested only in CTE | **No** | Not compared | Not compared | Expiry tested only in CTE | Yes only in CTE | Cancel branch exists, but races/NULL expiry remain | **FAIL** |
| `fn_request_job_cancel` | Yes + derived owner | State in update | **No** | N/A | N/A | N/A | N/A | Lost race returns apparent success | **FAIL** |

No worker mutation satisfies the approved predicate set. `state_version` is only incremented, never used to decide whether a caller is current.

## View and API exposure assessment

1. **Is `security_invoker=false` justified?** It is technically motivated by revoked base-table SELECT, but only acceptable with a tightly controlled owner, projection, ACL, and tests. Those controls are incomplete.
2. **Is `WHERE user_id = auth.uid()` secure in this exact definition?** The predicate itself is a valid owner filter because `auth.uid()` reflects the request claims even in an owner-executed view. It does not make the whole view secure when raw columns/ACL/ownership are wrong.
3. **Is `security_barrier` sufficient?** No. It controls planner pushdown, not ownership, grants, updatability, column safety, or function/view replacement.
4. **Are all DML privileges explicitly revoked?** No.
5. **Is the view automatically updatable?** Yes, it is a simple single-base-table view and no trigger/rule makes it explicitly read-only.
6. **Can authenticated modify or bypass it?** In a clean database with exactly the shown SELECT-only ACL, direct view DML should be denied and user predicates should not bypass the owner filter. The migration does not reconcile inherited/prior ACLs, so that property is not deterministic on upgrade.
7. **Are ownership and replacement authority safe?** Not proven. The owner is assumed in comments, not set/asserted; schema CREATE and alter/replace authorities are not audited.
8. **Would a narrow read function be safer?** Yes, provided it has a stable non-login owner, fixed search path, explicit owner check, fixed return columns, no generic JSON result, and minimal EXECUTE grants.
9. **Data API/GraphQL impact:** Supabase documents that GraphQL table/column visibility follows PostgreSQL privileges and that views are reflected. Revoking base-table CRUD can hide the base relation, but the granted view exposes `result_data` by design. See [Supabase GraphQL security](https://supabase.com/docs/guides/graphql/security) and [Supabase RLS view guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). PostgREST/GraphQL catalog tests remain mandatory.

## Discrepancies between Claude's report/comments and actual code

1. **“Inseparable remediation set” versus independent commits:** each migration has its own `BEGIN/COMMIT`; migration 2 can remain applied without migration 3.
2. **“RLS still applies” on the Phase 1 owner view:** false for the privileged default view definition. Supabase's own guidance says privileged views bypass RLS by default.
3. **“Security-corrected” worker functions / CAS guarantee:** only status is conditionally updated in places; expected `state_version`, worker identity, and atomic lease expiry are absent.
4. **“A worker cannot transition another user's job” because of `p_user_id`:** the caller is a full-access credential and chooses `p_user_id`; this is routing input, not authentication or least privilege.
5. **“Raw result_data omitted; use result_summary”:** the SQL view and both safe-read queries select raw `result_data` directly.
6. **“Raw error text is never persisted or returned”:** visual items persist raw truncated provider/storage errors; raw error strings are logged.
7. **“Tests added/verified”:** 31 database scenarios are unconditional no-op skips, and the E2E test targets an object removed by the final migration.
8. **“Service role is break-glass/migrations only”:** the current visual route uses it for every claim/complete/fail operation.
9. **“Safe fresh or upgraded database”:** missing prerequisite/manifest work, hidden drift through `IF NOT EXISTS`, preserved ACLs, and unsafe intermediate states make that claim unsupported.
10. **“Cancel wins”:** the intended branches exist, but cancel can silently lose to claim, heartbeat can prolong cancel-requested indefinitely, SQL publication has TOCTOU races, and real visual publication precedes CAS.

## Required corrections before any migration execution

1. Replace the unsafe three-boundary sequence with SQL whose every committed boundary is independently fail-closed; do not expose the interim owner view.
2. Rebuild every transition as true CAS using expected state and `state_version`; require worker ID, lease token, and valid lease in the actual post-claim mutation statement. Make recovery race-safe and bounded.
3. Redesign publication so immutable attempt-scoped Storage/database results are promoted only by the winning completion transaction; no fixed-path overwrite, public URL, or pre-CAS current-row upsert.
4. Revoke the full non-owner base-table ACL, including `TRUNCATE`, from `PUBLIC`, `anon`, and `authenticated`; explicitly revoke direct role execution on every worker/recovery function before granting the restricted actor.
5. Replace or harden the safe view: remove raw `result_data`, reconcile all ACLs, set/assert owner and options, ensure read-only behavior, and prove PostgREST/GraphQL exposure. A narrow safe read RPC is preferred.
6. Replace daily-key idempotency with immutable per-action request IDs scoped to user and operation; store a versioned canonical payload hash; make enqueue atomic under concurrency; keep active uniqueness separate.
7. Remove arbitrary user-controlled “sanitized” JSON or enforce a narrow versioned schema/size contract at the trusted boundary and database.
8. Replace caller-authoritative worker `p_user_id` and routine full service authority with the approved restricted worker design. D3 provider integration remains separately blocked, but least-privilege database authority cannot be deferred.
9. Prefer `SUPABASE_SECRET_KEY`, document `SUPABASE_SERVICE_ROLE_KEY` only as a temporary legacy fallback, add `server-only` guards and full stateless options, and add secret/import-boundary tests.
10. Enforce a closed public-error schema and separate restricted diagnostics; remove raw visual error persistence/logging and unsafe support references.
11. Add explicit state, attempt, lease, timestamp, result/error, hash/key, null-document, and field-length constraints after an approved legacy preflight.
12. Supply the D11 manifest/prerequisite baseline and deterministic drift/catalog assertions for both fresh creation and populated upgrade.
13. Replace skipped/stale tests with executable local integration, two-user, GraphQL/Data API, concurrency, interruption, cancellation, side-effect publication, and recovery suites.

Corrections to these unapplied candidate files may be made before their first approved application. If evidence later shows any file has already been applied to an authoritative environment, it must remain immutable and all corrections must use new forward-only migrations.

## Tests still requiring execution

No database test is accepted as executed. After corrected artifacts pass a new static review and George authorizes a disposable environment, the following remain mandatory:

1. Fresh project from zero using only the approved manifest and versioned migrations; normalized schema/grant/policy/function/view/bucket assertions.
2. Upgrade from a representative populated pre-remediation clone; preflight, backup/restore, lock timing, row invariants, partial-failure resume, and old/new application compatibility.
3. Direct anonymous, User A, User B, restricted worker, and administrative actor matrix for base table `SELECT/INSERT/UPDATE/DELETE/TRUNCATE`, final read boundary, all user RPCs, and every worker/recovery RPC.
4. View/RPC catalog checks: owner, options, ACLs, updatability, schema CREATE authority, function owners/search paths, explicit direct/inherited grants, PostgREST OpenAPI metadata, and GraphQL query/mutation/introspection behavior.
5. Deterministic two-user fixtures proving own positive paths, non-owner zero disclosure, parent-document attacks, arbitrary payload attacks, key collisions, cancel ownership, and job-ID enumeration behavior.
6. Real concurrent-connection barriers for at least 20 simultaneous enqueue and claim calls; same-key/same-hash, same-key/different-hash, different-key/same-active-scope, cancel/claim, cancel/complete, heartbeat/recovery, expired/live lease, duplicate callback, retry exhaustion, and terminal immutability.
7. Crash/redeploy/recovery tests with current and stale workers, clock-boundary lease expiry, worker ID mismatch, token mismatch, `state_version` mismatch, cancelled NULL/expired lease cases, and bounded recovery batches.
8. End-to-end result publication tests proving stale/cancelled attempts cannot overwrite Storage, `study_visuals`, or current result references and cannot expose public objects/URLs.
9. Adversarial error tests containing SQL text, provider messages, API-key-like strings, URLs, database IDs, document content, emails, and stack traces across database, API, UI, and logs.
10. Server-only/bundle tests proving neither preferred nor legacy privileged key can enter client chunks, `NEXT_PUBLIC_` variables, logs, responses, committed fixtures, or URLs.
11. Polling query-plan/latency checks at representative volumes after the corrected access path and indexes stabilize.

The pure TypeScript job suite passed locally with 57 tests; that result does not validate SQL, grants, RLS, races, Storage side effects, or Supabase reflection. The Playwright RLS suite was not run because it would access Supabase and its current contract is obsolete.

## Files reviewed

### Requested governance and review files

- `CLAUDE.md`
- `.ai/playbook/FOUNDER_DIRECTIVES.md`
- `.ai/playbook/AI_TEAM.md`
- `.ai/plans/beta-foundation-v1-remediation.md`
- `.ai/decisions/beta-foundation-v1-founder-decisions.md`
- `.ai/reviews/beta-foundation-v1-review.md`
- `.ai/reviews/beta-foundation-v1-database-review.md`
- `.ai/reviews/beta-foundation-v1-database-rereview.md`

### Requested implementation files

- `migrations/20260729120001_generation_job_state_machine_schema.sql`
- `migrations/20260729120002_generation_job_restrict_client_authority.sql`
- `migrations/20260729120003_generation_job_worker_functions.sql`
- `migrations/beta_foundation_v1.sql`
- `src/lib/supabase/serviceClient.ts`
- `src/lib/jobs/stateMachine.ts`
- `src/lib/jobs/errorClassifier.ts`
- `src/lib/jobs/idempotencyKey.ts`
- `src/lib/jobs/workerClient.ts`
- `src/app/actions/generationJobs.ts`
- `src/app/api/jobs/visuals/route.ts`
- `src/app/api/jobs/status/[jobId]/route.ts`
- `src/components/study/VisualsPanel.tsx`
- `src/lib/jobs/__tests__/stateMachine.test.ts`
- `src/lib/jobs/__tests__/errorClassifier.test.ts`
- `src/lib/jobs/__tests__/idempotencyKey.test.ts`
- `src/lib/jobs/__tests__/workerScenarios.test.ts`
- `e2e/rls-two-user.spec.ts`

### Supporting call-path files inspected

- `src/app/actions/visuals.ts`
- `src/lib/logger.ts`
- `src/types/generationJob.ts`
- `.env.example`
- `package.json`

## Final decision

1. **Final verdict:** **REJECT**.
2. **Critical findings:** unsafe intermediate cross-user view; non-atomic worker lease/version transitions; result publication outside CAS; incomplete base-table privilege revocation including `TRUNCATE`.
3. **High findings:** unsafe raw-result/updatable view; broken idempotency; routine full-access service authority and caller-chosen worker user ID; legacy-only/non-guarded privileged client; client-controlled payload; cancellation non-convergence; raw error leakage; non-deterministic migration/fresh chain; non-executing and obsolete tests.
4. **Migration execution:** the three migrations may **not** be applied even to a disposable local Supabase environment until corrected and re-reviewed.
5. **Phase 3:** may **not** begin on this job/database contract. Provider-specific work remains blocked by D3 independently.
6. **Production/Supabase/deployment action:** none occurred during this review.

