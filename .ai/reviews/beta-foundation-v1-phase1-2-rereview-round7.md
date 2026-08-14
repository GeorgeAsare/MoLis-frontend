# Beta Foundation V1 Phases 1–2 — Round 7 Database Architect Re-review

**Date:** 2026-08-01  
**Reviewer:** MoLis Database Architect (Codex)  
**Review type:** Static working-tree implementation review; no SQL or environment execution  
**Controlling baseline:** Founder decisions D1–D13, the remediation plan, Round 4–6 reviews, and final D11 catalogue reconciliation

## Verdict

**APPROVE WITH REQUIRED LOCAL CORRECTIONS**

Round 7 makes material progress: it moves source derivation into `fn_enqueue_job`, introduces a database-created snapshot, routes the visual worker through claimed snapshot context, consolidates the request ledger into the corrective migration, removes the broad Storage-policy name pattern, closes several direct table paths, and makes public application error handling safer.

The candidate is nevertheless not safe to parse or apply in a disposable Supabase project yet. There are four Critical findings and ten High findings. Most importantly, the enqueue function reads a non-existent live column, the SHA helper does not resolve the installed `pgcrypto` schema correctly, source capture is not a consistent point-in-time read, and the claimed durable-idempotency concurrency behaviour is not implemented. The manifest, binding, ACL, Storage, recovery, polling, and test contracts also remain incomplete.

This verdict authorises another local correction round only. It does not authorise migration execution, database or Storage testing, Supabase access, provider deployment, staging, or production work.

## Evidence and review boundary

I read all controlling documents requested in the Round 7 brief and inspected the complete current diff, including the consolidated SQL migration, server actions, API routes, worker modules, visual DTO/read paths, polling component, unit/static tests, and two-user E2E test. The requested path `src/lib/jobs/idempotencyKey.test.ts` does not exist; the current test is `src/lib/jobs/__tests__/idempotencyKey.test.ts`, which was inspected.

The live facts used here come only from the two approved D11 read-only catalogue CSVs and their completed reconciliations. This review did not connect to Supabase or Storage, execute SQL, or run database/Storage tests. The reported build, lint, and `161 passed / 49 skipped` result was assessed against the test source but was not treated as database evidence.

Repository governance evidence at review time:

- Branch: `feature/remediate-beta-foundation-v1`.
- `HEAD`: `7a2029fa2dfd`; `main` and `origin/main`: `7f723138e0e7`. The rejected implementation remains preserved as the working branch base and main was not rewritten.
- `migrations/beta_foundation_v1.sql` working-tree and `main` SHA-256 are identical: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`.
- The current implementation changes are uncommitted. `git diff --check` returned no whitespace errors.

## Critical findings

### R7-C01 — `fn_enqueue_job` cannot read the actual `document_analysis` schema

**Evidence:** `migrations/20260729120001_generation_job_state_machine_schema.sql:2253-2258` selects `id, data, created_at, model` from `public.document_analysis`. D11 proves there is no `data` column. The live table stores `subject_area`, `difficulty_level`, `estimated_study_minutes`, `sections`, `key_concepts`, `definitions`, `formulas`, `examples`, `keywords`, `likely_exam_topics`, `learning_objectives`, `misconceptions`, `relationships`, `prerequisites`, `tables`, `concept_graph`, and `learning_path` as separate fields.

**Assessment:** The SQL function may be created from a string body but will fail when this statement executes. No accepted job can reliably capture analysis or enqueue through this path. `ORDER BY created_at DESC LIMIT 1` also silently chooses a winner if duplicate analysis rows exist, contrary to the approved quarantine/fail-closed rule.

**Required correction:** Build the versioned analysis JSON explicitly from the catalogued columns, preserve JSON/array null and empty semantics deliberately, and fail closed on duplicate analysis rows. Add an exact preflight for the analysis table definition and duplicate `(user_id, document_id)` rows before any mutation.

### R7-C02 — SHA-256 resolution, function authority, and cross-language canonicalisation are not safe

**Evidence:** `fn_sha256_hex` uses `SET search_path = 'public,extensions,pg_catalog'` and unqualified `encode(digest(...))` at migration lines 2115-2123. Quoting the comma-separated value makes it one search-path entry, not three schema entries. The prerequisite at lines 171-180 checks only the extension name and never resolves `pg_extension.extnamespace`. The function revokes only `PUBLIC`, has no explicit owner assertion, and depends on the migration running as the expected owner. Application helpers at `src/lib/jobs/idempotencyKey.ts:66-75` hash compact `JSON.stringify` output, while PostgreSQL hashes `jsonb::text`; those byte serialisations are not equivalent. There is no shared known-answer vector executed by both implementations.

**Assessment:** The unqualified `digest` lookup is not valid for either possible extension location under the declared path. Even after a syntax correction, including writable `public` in a `SECURITY DEFINER` search path is unsafe. The TypeScript tests prove only TypeScript determinism, not equality with PostgreSQL. Runtime-role EXECUTE safety also depends on the unresolved owner/default-ACL defect in R7-H05.

**Required correction:** Resolve the installed extension schema from `pg_extension`/`pg_namespace` in migration logic and schema-qualify the `digest` routine; qualify `pg_catalog.encode`; use an empty or strictly trusted function search path; require `current_user = 'postgres'`; set/assert function owner; and explicitly revoke EXECUTE from `PUBLIC`, `anon`, `authenticated`, and `service_role` unless a role needs it. Either remove the unused TypeScript hash implementations or define one byte-level canonical format with shared PostgreSQL/TypeScript known-answer vectors covering null, empty text, timestamps, numeric values, nested key order, and array order.

### R7-C03 — Durable idempotency and concurrent active-job binding are not implemented as claimed

**Evidence:** The ledger fast path at migration lines 2221-2238 returns the stored job without validating document, job type, sanitized input, or any request-intent hash. Same key/different payload is therefore not rejected. The active-job path compares only source digest, then inserts any new request hash against the existing job at lines 2306-2340. It neither compares the full request hash with the active job nor prevents one job from accumulating conflicting request hashes. `ON CONFLICT DO NOTHING` can discard a conflicting key binding and still return the unrelated active job. Two different keys racing with no active job can both reach the new-job insert; the partial unique index makes one transaction fail with `23505`, but the function has no exception/re-read path to durably bind the losing key. The SQL never raises `P0007`, although the application retries only `P0007` at `src/app/actions/generationJobs.ts:101-118`.

**Assessment:** Founder D2 requires same key/same intent to return the original job, same key/different intent to be rejected and audited, and equivalent distinct active work to resolve durably to one job. None is complete under contention. The current comments and skipped tests describe behaviour the SQL does not have.

**Required correction:** Store a database-derived immutable request-intent identity that can be compared on replay without substituting current mutable source for the originally bound snapshot. Bind ledger scope explicitly (`user_id`, `document_id`, `job_type`, sanitized-input identity, operation/config identity, source snapshot, full request hash, and job). For an existing key, compare the immutable caller intent and reject mismatch. For a distinct key, bind only if the active request is equivalent. Handle the partial-unique race inside the database with a reviewed lock or unique-violation/re-read branch that waits for and validates the winner, inserts the losing accepted key durably, and returns a defined safe concurrency code only when resolution remains impossible. Never return a job unless the key-to-job row was inserted or verified.

### R7-C04 — The snapshot is not a consistent, complete, database-enforced immutable source revision

**Evidence:** Document and analysis are read by separate statements at lines 2241-2258 under the caller transaction's normal statement snapshots. Edits between those statements can produce a mixed revision. `document_subject_id` is stored in the snapshot but omitted from the source envelope at lines 2264-2277. The table has only single-column document and snapshot FKs; there is no composite database binding for snapshot user/document, analysis user/document, subject, or source recording. The `content_hash` constraint validates only 64-hex format. No trigger prevents the table owner or a future SECURITY DEFINER routine from updating/deleting a snapshot or replacing content without recomputing the hash. `operation_descriptor` is unconstrained JSONB.

**Assessment:** Inserting snapshot, job, and ledger in one function transaction is useful but does not satisfy the approved one-moment source capture or immutable audit contract. A syntactically valid hash can cease to describe the row. Current `DOCUMENT_REVISION_CHANGED` comparison is meaningful only insofar as the incomplete digest represents current source; it does not cure mixed reads or missing fields.

**Required correction:** Capture document and the unique analysis representation with one `INSERT ... SELECT`-equivalent statement or reviewed lock/isolation design. Include every generation-affecting document/analysis field, including subject metadata and all visual prompt inputs, in one versioned canonical source envelope. Add composite scope constraints/FKs, exact operation-descriptor checks, and database immutability enforcement that rejects UPDATE/DELETE outside a separately approved retention procedure. Enforce that the stored digest is generated by the database from the same values inserted.

## High findings

### R7-H01 — Request/job/snapshot binding remains existential rather than exact

The deferred trigger at migration lines 834-877 proves only that some ledger row has the same job, user, and snapshot and that the snapshot has the same user/document. It does not bind the originating key and hash on `generation_jobs` to the matching ledger row, constrain ledger document/job type, prevent conflicting ledger rows on one job, or make the ledger immutable. The snapshot FKs at lines 793-825 are name-only and single-column. Completion functions do not revalidate the verified job/request/snapshot binding. Add exact composite constraints plus immutable ledger/snapshot triggers, and require claim/context/completion to join the one authoritative binding.

### R7-H02 — The worker reads snapshot content but does not execute the bound operation descriptor

`fn_get_claimed_job_context` does return snapshot fields and the worker no longer queries mutable `documents` or `document_analysis`; that is a confirmed correction. However, the context function at lines 1014-1059 does not check `request_classification='client_verified'` or a matching ledger row. `fn_claim_job` can claim legacy/unbound queued jobs. `visualsWorker.ts:318-337` receives `operation_descriptor` but discards it; generation uses `PROMPT_MODEL='gpt-4o-mini'` and `OPENAI_IMAGE_MODEL ?? 'gpt-image-2'` at lines 17-20 and 226-267. An environment override can therefore execute a model different from the hash-bound descriptor. Claim, context, and completion must reject any unverified/binding-incoherent job, and the worker must validate and execute the descriptor exactly or fail safely.

### R7-H03 — Visual manifest enforcement is open and publication omits usage identity

`fn_complete_and_publish_job` validates array shape, maximum ten items, the empty-result code, and the current-attempt prefix. It does not require each item to be an object; SQL null semantics allow missing `status` and `topic` to bypass the current checks. It permits `pending` and `failed` in a terminal completed manifest without a defined partial-result contract. It lacks exact allowed keys, required field/type/length checks, unique visual IDs, unique paths, allowed extension/MIME, total JSON/string limits, generated/non-generated path consistency, model/config equality, and rejection of an `image_url` key whose JSON value is null. The worker currently includes `image_url: null` in every item. The function performs no usage-event accounting or idempotent usage identity. The job update and `study_visuals` upsert do roll back together, but the full requested publication contract is not atomic or closed.

### R7-H04 — Authenticated users can call the owner RPC and retrieve private manifest fields directly

`fn_get_owner_study_visuals` is granted to `authenticated` and returns the raw `visuals` JSONB at migration lines 1187-1220. That JSON contains `storage_path` and `image_prompt`. The API route constructs a closed response, but any authenticated owner can call the exposed RPC directly through the Data API and obtain those private fields. The SSR sanitizer at `src/app/dashboard/study/[id]/page.tsx:15-24` spreads unknown fields before replacing two known keys and continues to use the private `StudyVisualSet` browser type. Split public owner metadata from a service-only signing-manifest RPC, make the public return shape closed at the database boundary, use `PublicVisualSet` across the client boundary, and construct fields by allowlist rather than spreading raw JSON.

### R7-H05 — Existing-object function ACLs and default privileges are not fail-closed

The migration changes only `postgres` defaults but accepts `supabase_admin` as current user and merely warns for other owners at lines 159-168. D11 requires versioned objects to be created by/owned by `postgres`; `supabase_admin` defaults must remain untouched. Every function generally revokes only `PUBLIC`, relying on the corrected default ACL to avoid explicit grants to `anon`, `authenticated`, and `service_role`. If the owner is not `postgres`, those named-role grants can survive. `generation_job_requests` omits an explicit service-role table revoke. No function owner/security/search-path/ACL postcondition proves exact authority. Require `current_user='postgres'` before changes, explicit owner assignment/assertions, explicit named-role revokes followed by minimum grants, and exact table/function/sequence ACL postconditions.

### R7-H06 — Storage reconciliation is scoped better but its postcondition is not exact

The broad pattern deletion is gone, the four catalogued legacy policies are dropped by exact name, and `study-documents`/`recordings` policy names are not modified. The bucket is set private and restrictive policies target anon/authenticated. However, the postcondition at lines 935-989 checks only new names plus `permissive='RESTRICTIVE'`, not roles, command, `USING`, or `WITH CHECK`; it does not fail on an unexpected additional policy that permits `study-visuals`, and it does not fingerprint the seven unrelated policies to prove preservation. Add exact normalized preflight/postcondition equality for the four target policies, two replacement policies, bucket settings, and all unrelated policy definitions. Preserve shared `storage.objects` ACLs and managed Storage authority.

### R7-H07 — Failure and stale recovery can still leave processing jobs indefinitely

The SQL enforces exact public code/message pairs and support-reference format, and application logs no longer emit raw SQLSTATE in the reviewed paths. But `heartbeatJob` maps every RPC transport/error response to `refusalReason='not_processing'` (`workerClient.ts:150-160`), so the route's bounded transient retry branch is unreachable and aborts immediately. No production/local scheduler invokes `recoverStaleJobs`; only the wrapper exists. If `fn_fail_job` itself fails, the route throws after logging and the job remains processing until an external recovery runner exists. SQLSTATE `P0017` is also reused for both document revision and an invalid fail-code/message pair, while enqueue classification does not expose a dedicated safe document-revision result. Provide a distinct transient heartbeat outcome, a durable reviewed recovery invocation/alert contract, distinct SQLSTATE/application classifications, and proof that all retry-exhausted/cancelled rows terminate.

### R7-H08 — D13 polling is not race-safe and has no genuine timer tests

The component implements 2/5/10/30-second base steps, up to 500 ms jitter, separate hidden/offline refs, terminal stop logic, and listener cleanup. It does not initialize those refs from `document.visibilityState` and `navigator.onLine`, so a component mounted hidden/offline can poll. `stopPolling` sets the in-flight flag false without cancelling the fetch. A document/job change can start another request while an old response remains in flight; the old response can update phase, stop the new poll, or refresh the wrong document. The zero-delay resume callback dereferences the current job later and can call with null/obsolete state. There is no generation token or abort controller. No fake-timer component test exists; `workerScenarios.test.ts` merely asserts duplicated constants. Add an abortable, generation-scoped polling controller and real component tests for slow overlap, state changes, hidden/offline combinations, terminal cleanup, unmount, exact steps, and jitter bounds.

### R7-H09 — Migration drift handling still accepts incompatible definitions

The migration begins a transaction and has useful row-count preflights, but many checks are type-only or name-only. Defaults, nullability, identity/generated state, complete constraints/index predicates, trigger bodies, policy expressions, function signatures/bodies/owners/security modes/ACLs, and bucket policy fingerprints are not normalized. It drops existing functions/views/policies and changes columns/default ACLs before all incompatibilities are known. `CREATE TABLE` is unconditional for the new tables, while partial/manual states fail without an explicit recovery classification. `generation_job_requests`' zero-row assertion is safe for the inspected current baseline and a clean fresh build, but it cannot support a database containing legacy request rows or a partially applied/manual table. Because the migration is transactional, an ordinary SQL error rolls the transaction back; that is not a substitute for exact preflight. Move all discoverable compatibility checks before mutations and define fail-closed handling for absent, exact, and unexpected states.

### R7-H10 — The passing test count does not validate the database contracts

The TypeScript hash and state-machine tests are genuine unit evidence for their own helpers. The service-client tests are mocked configuration evidence. The section labelled “DB contract static assertions” mostly tests locally duplicated arrays, strings, regexes, and constants; it does not read or parse the migration. For example, the test that the DB derives four parameters constructs its own four-element array, and the authoritative-hash test compares a constant to itself. Group B consists of skipped empty bodies with commented pseudocode, so setting `RUN_DATABASE_TESTS=1` would run tests containing no live assertions. Several comments still refer to removed migration `20260729120003`, removed `p_payload_hash`, and a SQL concurrency handler that does not exist. The E2E file has real assertions for a limited generation-job access subset but remains environment-skipped and does not cover snapshots, ledger, manifest, function grants, Storage, or concurrency. Replace Group B with executable fixtures/assertions before authorisation; add a real SQL parser/linter stage and cross-language digest vectors.

## Medium findings

### R7-M01 — Enqueue documentation and safe error mapping contradict the implementation

`generationJobs.ts:19-63` still documents the old payload envelope, `P0004`, `P0007`, and hash parameters. `classifyEnqueueError` omits `P0002`, `P0010`, and the document-revision meaning of `P0017`; all become generic internal errors. The route catches only the currently unreachable `P0007` retry sentinel. Align comments and typed errors with the final SQL contract and return only approved HTTP statuses/codes.

### R7-M02 — Caller input is size-bounded but not a closed schema

`p_sanitized_input` defaults to `{}`, but explicit SQL null passes the current `octet_length` check and becomes part of the request envelope. Arbitrary JSON up to 64 KiB is accepted for every job type. Require non-null object input and a versioned, job-type-specific closed schema with depth/count/string/numeric limits.

### R7-M03 — Private object identifiers are still logged

`visualsWorker.ts:192` logs the full private Storage path, which contains user, document, job, and attempt identifiers. Keep raw paths only in restricted diagnostics if operationally necessary; otherwise log an opaque operation/support reference.

### R7-M04 — Retained timestamp-revision columns are dead contract surface

The migration adds three `expected_*_updated_at` fields even though D11 rejected timestamp revision identity and the new enqueue path never populates them. Retaining unused nullable columns increases drift and misinterpretation risk. Either omit them from this not-yet-applied candidate or explicitly quarantine documented pre-existing definitions; do not present them as a source-revision mechanism.

## Confirmed Round 7 corrections

- The historical baseline remains byte-for-byte unchanged.
- Source identity is no longer accepted directly from the authenticated caller; `auth.uid()`, document ownership, source fields, digest, request hash, and operation descriptor are intended to be database-derived.
- Null idempotency keys and syntactically empty keys cannot pass the scoped UUID regex. Empty-string keys cannot create verified requests.
- Snapshot, new job, and ledger inserts for the uncontended new-job branch occur within one PostgreSQL function call/transaction.
- The visual worker prompt path now consumes `fn_get_claimed_job_context` snapshot title/text/analysis and contains no later document/analysis query.
- Claim/heartbeat/completion/failure functions retain job ID, state, worker, lease-token, lease-expiry, and attempt CAS checks; visual jobs cannot use generic completion.
- Job completion and `study_visuals` upsert are in one database function transaction, so a failing upsert rolls back the job update.
- Current-attempt Storage prefixes include user/document/job/attempt, and losing objects remain in a private bucket rather than becoming publicly reachable.
- `study-visuals` is set private; pattern-based policy deletion was removed; the four catalogued policy names are targeted; unrelated bucket policy names are not deliberately dropped.
- Public API builders now avoid raw SQLSTATE/provider/database error text, and the signed-URL API constructs a closed output shape.
- `SUPABASE_SECRET_KEY` is preferred with the legacy service-role key as an explicit fallback, and the module is guarded by `server-only` with non-persistent auth. D3 correctly remains unresolved for production least privilege.
- D13 base delays, jitter, separate pause causes, and listener cleanup are present, although the concurrency lifecycle remains incomplete.

## Exact ordered corrections required

1. **Make the migration fail before mutation unless its catalogue prerequisites are exact.** Require `current_user='postgres'`; assert the live/fresh baseline definitions, duplicate-analysis state, target object absence/exactness, extension namespace, default ACL scope, relevant function/policy definitions, and migration ordering.
2. **Repair database hashing.** Resolve and qualify `pgcrypto.digest`, qualify `pg_catalog.encode`, harden owner/search path/EXECUTE ACLs, choose one byte-level canonical format, and add shared known-answer vectors.
3. **Implement the actual source snapshot.** Replace the non-existent analysis `data` read with an explicit versioned JSON representation of the catalogued fields; fail on duplicate analysis; use a single consistent source read; include every generation-affecting document and analysis field.
4. **Enforce snapshot and ledger immutability/scope.** Add composite parent keys/FKs or equivalent checks for user/document/analysis/subject/recording; validate the operation descriptor and hash invariant; reject unauthorized UPDATE/DELETE at the database layer.
5. **Redesign request identities and bindings.** Separate replayable caller intent from the full snapshot/config-bound request hash; add document/job type/config/input/source columns or hashes to the ledger; enforce exact one-scope binding and prevent conflicting rows per job/snapshot.
6. **Fix enqueue concurrency.** Validate same-key intent before return; bind only equivalent distinct active requests; replace blind `ON CONFLICT DO NOTHING`; resolve the partial-unique winner and durably bind every accepted key; emit one documented safe unresolved-race code.
7. **Gate all worker transitions on a verified binding.** Claim only client-verified jobs with exact ledger/snapshot coherence; repeat binding checks in claimed context and terminal publication; reject legacy or malformed jobs safely.
8. **Execute the bound operation descriptor.** Validate its closed schema and make the worker consume its models/parameters/prompt schema without environment drift. D3 still limits this service-role route to local/test use.
9. **Close visual publication.** Define the terminal item/result model; add exact manifest shape, IDs, uniqueness, sizes, field types, paths, extension/MIME, model/config, and `image_url`-key checks; introduce idempotent usage identity/accounting or explicitly keep the job non-terminal until the approved atomic evidence exists.
10. **Split public visual reads from privileged signing data.** An authenticated RPC must return only a closed public shape; a service-only narrow RPC may return owner-validated signing paths. Use public DTOs and allowlist construction through SSR and browser components.
11. **Make ACL and Storage postconditions exact.** Explicitly revoke named roles on every relevant table/function/sequence, grant only required EXECUTE, assert owner/security/search path, fingerprint all Storage policies, and prove the other bucket policies are unchanged.
12. **Complete failure and recovery.** Distinguish transient heartbeat RPC failure, use unique error codes, provide a durable stale-recovery scheduler/alert path after D3 approval, and guarantee terminal handling if fail/acknowledge RPCs fail.
13. **Make D13 polling generation-safe.** Initialise pause state, abort obsolete requests, use generation/document/job tokens, prevent old responses mutating new state, and add actual fake-timer/component tests.
14. **Replace claimed tests with executable evidence.** Remove obsolete migration/signature comments, parse/lint the SQL without applying it, add cross-language digest vectors, and implement real database/Storage/RLS/concurrency tests behind explicit environment gates.
15. **Add the D11 repository migration manifest/checksum contract and rerun static review.** Only after a clean Round 8 static verdict may George be asked to approve disposable migration validation.

## Required end-state determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.

2. **Critical findings:** R7-C01 invalid live `document_analysis.data` access; R7-C02 unsafe/unresolvable SHA function and inconsistent canonicalisation; R7-C03 broken replay/concurrency ledger semantics; R7-C04 mixed, incomplete, insufficiently immutable snapshots.

3. **High findings:** R7-H01 incomplete exact binding; R7-H02 descriptor and worker-binding drift; R7-H03 open manifest and absent usage identity; R7-H04 private manifest exposed by authenticated RPC; R7-H05 fail-open function/default ACL assumptions; R7-H06 non-exact Storage proof; R7-H07 incomplete failure/recovery; R7-H08 polling races/no real timer tests; R7-H09 inadequate drift checks; R7-H10 misleading/non-executable database test claims.

4. **Medium findings:** R7-M01 stale error/docs contract; R7-M02 open/null input schema; R7-M03 private path logging; R7-M04 dead timestamp-revision columns.

5. **Confirmed corrections:** Listed in “Confirmed Round 7 corrections”; they are meaningful static improvements but do not close the Critical/High findings.

6. **Remaining Round 6 findings:** Atomic trusted source capture, database canonical hashing, immutable scope bindings, ledger concurrency, exact ACL/Storage reconciliation, closed manifests, failure/recovery, D13 lifecycle, drift-safe migration evidence, and executable tests all remain wholly or partly open.

7. **New issues introduced in Round 7:** Non-existent `document_analysis.data`; malformed quoted SHA search path; database/TypeScript hash byte mismatch; operation-descriptor/environment divergence; raw private owner RPC; blind D2 `ON CONFLICT`; absent new-key race recovery; and polling overlap after `stopPolling` resets the in-flight guard.

8. **Exact ordered corrections required:** The fifteen-step sequence above is mandatory. Steps 1–6 are the first inseparable database design lane; later application/test lanes may proceed locally only after their database interfaces stabilise.

9. **Whether snapshot enqueue is fully atomic:** **No.** The uncontended writes share one transaction, but source reads can represent different moments, the analysis read is invalid, and concurrent winner/ledger binding is not resolved.

10. **Whether snapshot data is truly immutable:** **No.** Runtime table grants are restricted, but row content/hash/config integrity and owner/SECURITY DEFINER UPDATE/DELETE prevention are not database-enforced.

11. **Whether worker input is snapshot-only:** **Partially.** Prompt source content is now snapshot-only. The worker does not enforce the exact request binding and ignores the snapshot's operation descriptor in favour of code/environment defaults.

12. **Whether request/job/snapshot binding is database-enforced:** **No.** Existential same-user/snapshot checks exist, but exact key/hash/scope/config/document/job binding and ledger immutability do not.

13. **Whether visual publication is atomic and idempotent:** **Partially.** The job update and `study_visuals` upsert are transactional and CAS-protected. The manifest is not closed, usage accounting is absent, and the exact verified request/snapshot/config binding is not checked at publication.

14. **Whether ACL reconciliation is complete:** **No.** Table revocations improved, but owner execution, named-role function grants, service-role ledger access, sequences, and normalized postconditions are incomplete.

15. **Whether Storage reconciliation is exact:** **No.** Scope and policy targeting improved; exact definitions, unexpected-policy rejection, unrelated-policy fingerprints, MIME/size contract, and executable Storage proof remain missing.

16. **Whether failure/recovery is complete:** **No.** Safe public mapping improved, but transient heartbeat handling, failure-of-failure recovery, scheduled stale recovery, error-code uniqueness, and terminal evidence remain incomplete.

17. **Whether D13 polling is complete:** **No.** The timing schedule exists, but initial pause state, obsolete request cancellation, document/job race safety, and genuine fake-timer tests do not.

18. **Whether migration drift handling is adequate:** **No.** A transaction limits partial commits, but preflight/postcondition comparison is not definition-complete and accepts or destructively replaces incompatible objects by name.

19. **Whether all ten Round 5 corrections are fully implemented:** **No.** Snapshot/hash/binding, ledger races, ACL/Storage exactness, closed publication, recovery, polling, migration evidence, and executable tests remain open.

20. **Whether Claude may perform another local correction round:** **Yes.** Claude may make local, uncommitted corrections on the feature branch against this review. D3 continues to block final production worker authority, and no environment action is implied.

21. **Whether disposable migration validation is approved:** **No.** Critical runtime and database-contract defects must be corrected and statically re-reviewed first.

22. **Whether database or Storage tests are approved:** **No.** Test implementation may continue locally; execution against any database or Storage environment requires a corrected reviewed candidate and separate explicit approval.

23. **Whether another catalogue inspection is required:** **No at present.** D11 supplies enough live facts. The corrected migration can resolve the extension namespace and verify all target definitions at execution-time preflight. Request another read-only inspection only if the next design depends on a live object not covered by D11 or if the catalogue materially changes.

24. **Confirmation no implementation or environment change occurred:** This review created only `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round7.md`. It did not modify implementation, migration, test, or earlier review files; execute SQL; access Supabase or Storage; run database/Storage tests; stage, commit, push, merge, or deploy.

25. **`git diff --stat` before this review file was added:**

```text
 e2e/rls-two-user.spec.ts                           |   25 +-
 ...9120001_generation_job_state_machine_schema.sql | 1957 +++++++++++++++-----
 src/app/actions/generationJobs.ts                  |   45 +-
 src/app/actions/visuals.ts                         |  329 +---
 src/app/api/jobs/status/[jobId]/route.ts           |    2 +-
 src/app/api/jobs/visuals/route.ts                  |  133 +-
 src/app/api/visuals/[documentId]/route.ts          |   67 +-
 src/app/dashboard/study/[id]/page.tsx              |   25 +-
 src/components/study/VisualsPanel.tsx              |  167 +-
 src/lib/jobs/__tests__/idempotencyKey.test.ts      |  169 +-
 src/lib/jobs/__tests__/workerScenarios.test.ts     |  183 +-
 src/lib/jobs/enqueueErrors.ts                      |   24 +-
 src/lib/jobs/idempotencyKey.ts                     |   93 +-
 src/lib/jobs/workerClient.ts                       |   49 +-
 src/types/studyVisual.ts                           |   20 +
 15 files changed, 2215 insertions(+), 1073 deletions(-)
```

The new untracked review file is not included by ordinary `git diff --stat` until tracked/staged; staging is prohibited.

26. **`git status --short` after creating this review:**

```text
 M e2e/rls-two-user.spec.ts
 M migrations/20260729120001_generation_job_state_machine_schema.sql
 M src/app/actions/generationJobs.ts
 M src/app/actions/visuals.ts
 M src/app/api/jobs/status/[jobId]/route.ts
 M src/app/api/jobs/visuals/route.ts
 M src/app/api/visuals/[documentId]/route.ts
 M src/app/dashboard/study/[id]/page.tsx
 M src/components/study/VisualsPanel.tsx
 M src/lib/jobs/__tests__/idempotencyKey.test.ts
 M src/lib/jobs/__tests__/workerScenarios.test.ts
 M src/lib/jobs/enqueueErrors.ts
 M src/lib/jobs/idempotencyKey.ts
 M src/lib/jobs/workerClient.ts
 M src/types/studyVisual.ts
?? .ai/inspection/
?? .ai/reviews/beta-foundation-v1-d11-catalogue-reconciliation.md
?? .ai/reviews/beta-foundation-v1-d11-final-reconciliation.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round4.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round5.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round6.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round7.md
?? src/lib/jobs/visualsWorker.ts
```

The Round 7 review file is the only new path created by this review turn; all other listed changes pre-existed it.
