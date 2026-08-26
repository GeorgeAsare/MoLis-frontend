# Beta Foundation V1 Phases 1–2 — Database Architect Round 6 Static Re-review

Date: 2026-08-01  
Role: MoLis Database Architect  
Review type: static review of the current uncommitted working tree  
Verdict: **APPROVE WITH REQUIRED LOCAL CORRECTIONS**

## Review boundary

This review inspected the controlling D11 reconciliation, Round 4 and Round 5 reviews, remediation plan, founder decisions, the complete tracked working-tree diff, the untracked `src/lib/jobs/visualsWorker.ts`, the historical migration checksum, branch/commit state, and the application paths named in the review request.

No SQL was executed. No migration, database test, Storage test, Supabase or Storage access, environment mutation, staging, commit, push, merge, or deployment occurred. Claude's reported TypeScript, lint, build, and mocked-test results were treated as unverified reports, not database evidence.

## Executive assessment

The implementation has materially improved the job state machine, request-key handling, cancellation precedence, private visual delivery, and application-side polling. Those improvements do not complete the approved D11 contract.

The `generation_source_snapshots` object is presently a disconnected table declaration. `fn_enqueue_job` does not create a snapshot or compute a source digest; neither `generation_jobs` nor `generation_job_requests` references a snapshot; `fn_get_claimed_job_context` does not return snapshot content; and `visualsWorker.ts` still reads `documents` and `document_analysis` after claim. A retry can therefore generate different content under the same accepted request and job. This is the precise failure D11 required the immutable snapshot design to prevent.

Authenticated callers can also invoke `fn_enqueue_job` directly and supply the purported request hash, sanitized input, and source timestamps. The database validates their formats, not their truth. When a different key is bound to an existing active job, the ledger accepts that key's arbitrary hash without proving it describes the active job's source snapshot and execution configuration. Source capture, canonical source hashing, request binding, and job insertion are therefore neither authoritative nor atomic as a single contract.

The migration must not be applied anywhere yet, including a disposable environment. Another local correction round is appropriate because D11 catalogue evidence is complete and the defects are implementation defects rather than unanswered catalogue questions.

## Critical findings

### DBR6-C01 — The worker input is mutable and the snapshot contract is not wired

**Evidence**

- `migrations/20260729120001_generation_job_state_machine_schema.sql:624-677` creates `generation_source_snapshots`, but no function inserts into or reads from it.
- No `snapshot_id` exists on `generation_jobs` or `generation_job_requests`.
- `fn_get_claimed_job_context` at migration lines 816-855 returns job ownership, attempt, and three timestamp fields, not immutable source content, a snapshot identity, or a database digest.
- `src/lib/jobs/visualsWorker.ts:219-236` rereads `documents` and `document_analysis` after claim. The two reads are separate and can observe different source moments.
- `src/lib/jobs/visualsWorker.ts:340-347` explicitly says snapshot revalidation is to be wired later, then calls the mutable read path.
- `DOCUMENT_REVISION_CHANGED` appears only in migration comments. It has no database or application implementation.

**Impact**

A document or analysis change between enqueue and claim changes the provider input without changing the accepted job. Stale recovery can requeue the same job and a later attempt can read newer content. A change between the document and analysis reads can produce a mixed revision. The job, ledger, provider call, Storage paths, and published manifest cannot prove which source was used.

**Required correction**

Implement the D11 snapshot chain in the database. The authenticated enqueue RPC must atomically capture one consistent, closed source snapshot, compute its digest in PostgreSQL, bind it to the request and job, and return only after all invariants exist. The claim-context RPC must return only the bound immutable snapshot and execution descriptor after all lease/CAS checks. The worker must remove all post-enqueue reads of mutable source tables.

**Acceptance**

Edits before claim, during provider generation, during retry, or after terminal completion cannot alter the source consumed by an existing request/job. A fresh intentional regeneration produces a new request key, new snapshot, new database digest, and new job.

### DBR6-C02 — Enqueue trusts caller assertions and does not atomically bind source, request, and job

**Evidence**

- `fn_enqueue_job` accepts caller-supplied `p_payload_hash`, `p_sanitized_input`, and `p_expected_*` values at migration lines 1769-1777.
- It checks ownership and formats at lines 1795-1845 but never recomputes either the source digest or authoritative request hash.
- `generationJobs.ts:83-130` reads only `documents.created_at`, sets the other two timestamps to null, computes an application hash, then submits all values to the authenticated RPC.
- The live catalogue proves `documents.created_at` is nullable and is not a content revision; the table has no update/revision/hash column.
- The active-job path at migration lines 1870-1911 binds a new request key and its supplied hash to the active job without comparing that hash to the job's originating hash or a bound snapshot/configuration.
- The deferred trigger at lines 686-712 proves only that some ledger row shares `job_id` and `user_id`. It does not prove the originating key, request hash, scope, snapshot, configuration, document, and job type agree.

**Impact**

Any authenticated Data API caller can bypass the application hash builder and submit a fabricated hash or timestamps. Multiple request keys with conflicting source/configuration assertions can be durably bound to one active job. The ledger is durable but not authoritative about the accepted operation.

**Required correction**

The browser may supply only the bare request UUID and explicitly allowed user input. The database must derive `auth.uid()`, source ownership, source snapshot, canonical source digest, document/job scope, and the server-owned execution descriptor. If an application-generated operation descriptor must cross the RPC boundary temporarily, it must come through a trusted server-only RPC not granted to `authenticated`, with a closed database allowlist/version contract. Every accepted ledger row must bind `(user, request key, canonical request hash, document, job type, snapshot, source digest, execution/config identity, job)` through immutable columns and composite constraints. A new key may bind to an existing active job only when that authoritative scope is identical.

**Acceptance**

One database transaction performs source capture, database SHA-256, snapshot insert, canonical request identity, ledger insert/bind, active-job exclusion, and job insert/resolve. A forced error at any point leaves none of those objects committed.

## High findings

### DBR6-H01 — The snapshot table definition is incomplete and is not database-immutable

- It omits `documents.source_recording_id`, which D11 identified as relevant metadata where used.
- `analysis_data` is an unconstrained generic JSONB payload rather than a versioned closed construction of the fields the worker consumes, including analysis model/provenance.
- `operation_descriptor` has no closed schema or database creator.
- `content_hash` has only a format check. There is no canonical JSON construction and no `digest(..., 'sha256')` computation in the migration.
- Separate user and document FKs do not prove `snapshot.user_id = documents.user_id`. `analysis_id` has no FK or composite owner/document constraint.
- There is no immutable classification, no link to a request/job, and no invariant preventing the database owner or a future function from updating/deleting a bound row.
- `document_created_at` is declared `NOT NULL`, while the live catalogue reports `documents.created_at` as nullable. A wired snapshot insert would fail for a valid legacy document with a null creation time unless a fail-closed preflight/quarantine or nullable canonical representation is defined.
- `RESTRICT` on snapshot-to-user/document is appropriate under the D8-D10 deletion gates, but the eventual deletion/lifecycle migration remains separately blocked.

Required design: use a closed versioned source envelope, database-generated UUID, database-computed digest, composite ownership/scope keys, immutable request/job bindings, no runtime update/delete RPC, and a trigger/invariant that rejects mutation of bound content even if an overly privileged application function is added later.

### DBR6-H02 — Existing table and function authority is not reconciled to the final D11 model

- The migration revokes `generation_jobs` from PUBLIC, `anon`, and `authenticated` at lines 526-528, but leaves the live explicit full `service_role` ACL intact. RLS cannot restrict that BYPASSRLS role.
- It never drops `study_visuals_owner_all` and never revokes the live full table ACLs on `study_visuals` from PUBLIC/anon/authenticated/service role. Authenticated owners therefore retain direct INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN authority subject only to the operations RLS can govern.
- `src/app/api/visuals/[documentId]/route.ts:38-44` and `src/app/dashboard/study/[id]/page.tsx:116-121` still depend on authenticated direct reads of `study_visuals`. They must move to a narrow owner-read contract before base-table authority is removed.
- New functions generally revoke only PUBLIC and then grant the intended role. The default-ACL change may make that semantically safe when the migration runs exactly as `postgres`, but the final reconciliation requires explicit revocation from PUBLIC, anon, authenticated, and service role followed by the one intended grant.
- The migration does not assert `current_user`, new object owners, normalized ACL postconditions, or that `supabase_admin` did not create a versioned MoLis object.

Required design: base tables `generation_jobs`, `generation_job_requests`, `generation_source_snapshots`, and `study_visuals` are owner-only; service role receives only the temporary named worker RPCs approved for local/test use; authenticated receives only enqueue, cancel, safe job reads, and a closed owner visual read; trigger/invariant functions receive no runtime EXECUTE. D3 still blocks accepting service role as the final production worker identity.

### DBR6-H03 — Drift checks are name/type checks, not normalized object-contract checks

- New column preflight checks only broad `data_type`, not exact UDT, nullability, default, identity/generated state, collation, or length.
- The known historical status constraint is dropped without asserting its exact definition. The known job-type constraint and existing indexes are not asserted.
- The composite unique constraint is accepted by name alone. `CREATE INDEX IF NOT EXISTS` accepts a same-named index with wrong columns, order, uniqueness, predicate, or method.
- Proposed functions/views/policies are dropped with `IF EXISTS` instead of failing on unexpected post-D11 drift and comparing signature, owner, security mode, `search_path`, body, roles, command, permissiveness, `USING`, and `WITH CHECK`.
- New ledger and snapshot tables are created unconditionally, producing a generic collision failure rather than an early normalized drift report.
- Several important failures occur after columns, data updates, default ACLs, and bucket changes. The outer `BEGIN` makes those changes roll back on a PostgreSQL error, so no committed partial schema should remain; however, this is not the required early fail-closed preflight and can hold locks/do expensive work before discovering drift.

The correction must put a read-only normalized preflight first, based on the completed D11 catalogue, and add exact final postconditions before granting enqueue.

### DBR6-H04 — Storage is made private, but reconciliation is not exact or fully proved

Confirmed: the migration sets `study-visuals.public=false`, drops the four inspected legacy policies by exact name, adds restrictive authenticated/anon policies that are true for other buckets and false for `study-visuals`, and preserves service-role upload/signed URL capability. The signed-URL endpoint authenticates, checks owner/document scope, validates a prefix, emits a five-minute URL, and returns a closed item shape without `storage_path` or `image_prompt`.

Still incorrect:

- Lines 743-758 pattern-drop any Storage policy whose name resembles study visuals. This exceeds the authority to reconcile only the four catalogued policies and could delete an unrelated or newly introduced policy instead of failing on drift.
- Postconditions check only two names and `RESTRICTIVE`. They do not assert bucket privacy, exact roles, command, `USING`, `WITH CHECK`, absence of all four legacy policies, absence of any other policy applicable to the bucket, or preservation of all seven `study-documents`/`recordings` policies.
- `study_visuals` table authority remains client-mutable, so the signed-URL endpoint is not reading a worker-authoritative manifest.
- Prefix validation in the read route is only `{user}/{document}/`; database publication validation is only `{user}/{document}/{job}/`. Neither proves the manifest belongs to the current attempt.

Remove the pattern drop, fingerprint all eleven inspected policies before mutation, change only the exact four, and prove the complete final policy/bucket set. Do not globally alter Supabase-managed `storage.objects` ACLs.

### DBR6-H05 — Visual publication is transactionally coupled but the manifest contract is open

Confirmed: visual jobs are blocked from generic completion; the job update and `study_visuals` upsert occur inside one function transaction; cancellation wins; a lost completion CAS does not publish; a failed upsert rolls back the job completion; staged paths include user/document/job/attempt; and a lost-race object remains in a private bucket.

Missing database enforcement:

- `p_visuals` is not first required to be a JSON array of a bounded size containing only closed object shapes.
- Empty arrays are accepted with any non-null result code other than `NO_VISUAL_TOPICS`; only null is rejected. Result codes are not allowlisted.
- A `generated` item with a null `storage_path` passes because the prefix check runs only when the path is non-null.
- Item status, topic/description/prompt lengths, allowed/forbidden fields, failure code/stage, URL absence, model, item count, and image count are not constrained.
- The database prefix omits `attempt_count`, allowing a privileged or stale worker to publish another attempt's path.
- Storage object existence cannot be made atomic with PostgreSQL, but publication must at least validate the exact current attempt manifest and rely on a successful private staged upload. A reconciliation/garbage-collection design for unreachable staged objects remains required and is gated by D8-D10 for deletion.

### DBR6-H06 — Legacy classification and migration-baseline governance remain incomplete

- The actual live D11 baseline has none of the new request columns, so its historical rows would become `legacy_unverified`, which is correct.
- The generic upgrade path nevertheless treats any pre-existing key/hash pair as `client_verified` and backfills it into the authoritative ledger with `ON CONFLICT DO NOTHING`. That can upgrade unproven pre-contract data and conceal a conflicting row. D11 requires zero verified historical backfill: all pre-contract rows remain legacy/quarantined unless separately proven by an approved deterministic process.
- No repository migration manifest/checksum contract was found. The migration comments describe ordering, and `beta_foundation_v1.sql` remains unchanged, but comments are not the D11 explicit manifest and checksum lock needed for both live upgrade and deterministic fresh creation.
- The known prerequisite active-product schema is still absent from the versioned migration chain identified by this review. A fresh project therefore is not yet reproducible solely from the declared files.

### DBR6-H07 — Error classification and stale recovery have release-blocking gaps

- The first enqueue failure is classified before logging, and P0007 is not exposed to the UI. The same request key and hash are used for one bounded retry.
- If the second call fails for P0004, authorization, invalid input, or another deterministic reason, `generationJobs.ts:145-147` converts every error to `ENQUEUE_RETRY_REQUIRED`. Round 5 required classifying the second result, not treating every error as persistent P0007.
- `src/app/api/jobs/status/[jobId]/route.ts:26` logs raw `error.code` as `pg_code`, contrary to the no-raw-SQLSTATE logging contract.
- `fn_fail_job` allowlists match the nine TypeScript codes and nine message keys individually, but it does not enforce the valid code-to-message pair. Its support check is only `LIKE 'SR-%'` plus length, despite claiming safe printable characters; a privileged caller could place arbitrary text after the prefix.
- The TypeScript classifier always maps an unknown error to the allowed `JOB_INTERNAL_ERROR`, so normal unknown errors are not rejected. If `fn_fail_job` itself rejects or is unavailable, the worker throws and the job remains processing until stale recovery.
- `fn_recover_stale_jobs` exists, is bounded, and preserves cancellation, but no production or local scheduler/caller invokes it. D3 blocks the final production worker/queue deployment, yet the current local route still needs an explicit approved recovery runner for meaningful failure testing.
- `heartbeatJob` maps an RPC error to the typed terminal-looking refusal `not_processing`; the route therefore aborts immediately. Its documented transient-retry `default` branch is unreachable for that error path. This is safe against stale publication but does not implement the claimed bounded heartbeat retry.

### DBR6-H08 — Database/security tests are still specifications, not executable evidence

- The Playwright two-user file has real assertions for a small generation-job subset, but it skips when environment variables are absent and depends on manually seeded job IDs. It does not cover snapshot, ledger, Storage, `study_visuals`, worker RPC denial, or most commands/roles.
- Forty-nine database tests in `workerScenarios.test.ts` are guarded by `test.skipIf(NOT_EXECUTED)` and their bodies are comments. They cannot fail against PostgreSQL and still contain obsolete references to a separate `20260729120003` ledger migration.
- Mocked tests duplicate constants and describe SQL behavior; they do not parse SQL, inspect ACLs, run RLS, create races, or prove transaction rollback.
- There is no executable evidence for snapshot immutability, source-change behavior, atomic snapshot/request/job creation, cross-user snapshot isolation, current-attempt manifests, exact ACL/policy postconditions, stale lease/cancel races, P0007 retry behavior, or rollback after publication failure.
- No genuine PostgreSQL parser evidence was produced or run in this review. TypeScript/lint/build success cannot establish SQL validity.

## Medium findings

### DBR6-M01 — Application request hashing is deterministic but not an authoritative execution identity

Recursive key sorting in `idempotencyKey.ts` is deterministic, the output is SHA-256 hex, and the application includes document/job scope and several runtime values. It still hashes `created_at` rather than content; excludes the exact prompt/template text or immutable template identity, truncation/selection behavior, response schema details, and the database snapshot identity/digest; and can be bypassed by calling the authenticated RPC directly. The database snapshot digest and request-operation hash currently have no enforced distinction because only the latter is used.

The correction should define two named, versioned identities: (1) a database-computed source digest over the immutable snapshot; and (2) a canonical request/execution hash over source digest plus closed job type, allowed input, and server-owned execution descriptor. The hash algorithm and canonical JSON contract must be test vectors shared by SQL and application code or computed authoritatively in one layer.

### DBR6-M02 — Default privilege hardening is correct deny-by-default policy but lacks operational guardrails

The three `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` revokes are exactly required by the final D11 authority reconciliation. They are transactional and do not change existing objects or Supabase-managed schemas. They intentionally mean future postgres-owned public tables/functions/sequences receive no automatic browser or service-role authority.

That is the secure default, but it is application-wide and can break a future unrelated migration that assumes Supabase's broad defaults. The migration must assert it is running under the approved owner, document that every future public object needs explicit least-privilege grants, add owner/default-ACL postconditions, and provide a forward recovery procedure. It must not harden `supabase_admin` managed defaults; instead, versioned MoLis objects must be prohibited from being owned by that role. Restoring broad defaults is not an acceptable security rollback.

### DBR6-M03 — D13 polling is mostly implemented but hidden/offline pause state is not compositional

The component implements 2/5/10/30-second steps, jitter, and one status request in flight. It avoids issuing a request while `pollPaused` is true. However one boolean represents two independent causes. Becoming visible while still offline sets it false; coming online while still hidden also sets it false. Polling can therefore resume in a state that should remain paused. The test suite does not exercise the component behavior and duplicates timing constants rather than importing/testing the implementation.

Use independent hidden/offline state or recompute `document.visibilityState === 'hidden' || !navigator.onLine` on every schedule/event, resume promptly without overlap, and add fake-timer/component tests for every transition combination.

### DBR6-M04 — Some safe response shapes remain looser than necessary

The signed visual API returns a closed per-item shape and no internal Storage path or prompt. It still returns `user_id`, which the authenticated owner does not need, and the SSR sanitizer spreads every runtime JSON property before replacing only `storage_path` and `image_prompt`. Once `study_visuals` becomes worker-authoritative and closed in the database, use one shared public DTO constructor rather than spreading untrusted JSON. The job status route should resolve the message key to approved copy rather than displaying the raw i18n key as the message.

## Confirmed corrections

The following are real improvements in the current files, although database execution remains unapproved:

1. `beta_foundation_v1.sql` is byte-for-byte unchanged at SHA-256 `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`.
2. The candidate corrective migration is a single `BEGIN`/`COMMIT` transaction, documents maintenance mode, and grants authenticated enqueue last.
3. Authenticated enqueue rejects null/invalid request keys and hashes. Key ownership is checked against `auth.uid()`.
4. Constraint-backed partial active-job exclusion and ledger key uniqueness separate active exclusion from durable request-key idempotency at a structural level.
5. The ledger composite FK proves ledger user equals job user, and ledger deletion is `RESTRICT` under the current deletion gates.
6. Core claim/heartbeat/complete/fail/acknowledge functions check job ID, status, state version, worker identity, lease token, and lease expiry in mutation predicates. Claim enforces attempt limits; stale recovery is bounded with `SKIP LOCKED`; cancellation is never requeued.
7. Generic completion refuses visual jobs. Successful visual job completion and manifest upsert are one PostgreSQL transaction.
8. Visual staging paths include user, document, job, and attempt; uploads are non-upsert; the bucket is set private; signed access is short-lived and ownership-checked.
9. The service client prefers `SUPABASE_SECRET_KEY`, uses the legacy service-role environment variable only as fallback, disables session persistence/refresh/URL detection, and is guarded by `server-only`. No committed privileged value or `NEXT_PUBLIC_` privileged key was found in the reviewed files.
10. Public job reads use narrow SECURITY DEFINER DTO functions rather than an updatable view. Public API shapes omit raw job result, lease, worker, and request fields.
11. The first P0007 handling path preserves the request key and performs one bounded same-key retry; the client preserves the key on the approved safe 503 response.
12. D13 status polling backoff, jitter, and one-request-in-flight behavior are implemented, subject to DBR6-M03.

## D11 requirements still missing

1. Repository-owned migration manifest, checksum lock, and canonical fresh-project prerequisite baseline.
2. Complete normalized preflight and owner/ACL/policy/index/function postconditions.
3. Database-created immutable source snapshot with all consumed source and provenance fields.
4. Database SHA-256 over a versioned canonical source envelope.
5. Composite owner/document/analysis/snapshot/request/job constraints.
6. Atomic source capture, snapshot creation, request identity, ledger binding, and job resolution.
7. Snapshot ID/digest/execution identity on both job and request ledger.
8. Snapshot-only claimed context and worker execution.
9. Explicit owner-only authority on all internal tables, including `study_visuals`, plus narrow owner read RPCs.
10. Exact Storage fingerprinting and postconditions without pattern deletion.
11. Closed current-attempt visual manifest contract.
12. Zero-trust legacy backfill/quarantine and the D10 duplicate-analysis preflight.
13. Executable PostgreSQL/RLS/Storage/concurrency/rollback evidence.

## Exact ordered corrections required

1. Keep enqueue disabled and keep the candidate unexecutable. Preserve the historical migration and current D11 inspection evidence.
2. Add the explicit migration manifest/checksum/fresh-prerequisite contract without editing `beta_foundation_v1.sql`.
3. Move every D11 known-baseline assertion to an initial normalized, read-only preflight: owner, columns and properties, constraints, indexes, RLS, ACLs, five existing routines, default ACLs, bucket, and all eleven Storage policies. Assert proposed objects are absent and the executor/owner is approved.
4. Harden only the approved `postgres/public` defaults, then assert them. Establish an explicit-grant convention and forward recovery notes.
5. Add D10 fail-closed preflights for duplicate/ambiguous `document_analysis` and active jobs. Do not delete or silently pick a winner.
6. Implement the closed immutable snapshot schema, including nullable-live-field handling, `source_recording_id`, selected analysis provenance, execution descriptor schema, composite ownership constraints, and database SHA-256 canonicalization.
7. Add immutable snapshot identity/digest/config/scope columns and exact composite constraints to `generation_jobs` and `generation_job_requests`. Classify every pre-contract row as legacy unverified; do not backfill a verified ledger from historical keys.
8. Rewrite `fn_enqueue_job` so authenticated users provide no authoritative user, source, timestamp, digest, model, cost, or config fields. In one transaction capture source, compute identities, enforce same-operation D2 binding, insert/bind ledger, and create/resolve the job.
9. Rewrite the deferred invariants to verify the exact originating request row and immutable `(user, document, job type, snapshot, source digest, execution identity, job)` relationship in both directions.
10. Rewrite claimed context to return the bound snapshot and execution descriptor only after the full lease/CAS checks. Remove mutable `documents`/`document_analysis` reads from `visualsWorker.ts`.
11. Close every state/diagnostic invariant: exact error-code/message pairs, support-reference regex, attempt/state/lease checks and postconditions; fix second P0007 classification, raw SQLSTATE logging, heartbeat retry typing, and establish a local/test stale recovery runner. Production worker authority remains blocked by D3.
12. Close visual publication: JSON array/type/size, exact item fields/statuses, nullability, lengths, allowed result codes, model/execution identity, exact current attempt path, no stored URL, and atomic job/manifest current-winner invariants.
13. Add a narrow owner visual-read function and update SSR/signed-URL application reads. Then drop `study_visuals_owner_all` and revoke all direct internal-table privileges from PUBLIC/anon/authenticated/service role. Revoke every new function from all named roles before granting only its intended actor.
14. Remove the Storage name-pattern safety net. Assert all eleven known policies, set only `study-visuals` private, drop only the four exact policies, add the exact restrictive policy pair, and prove bucket/policy definitions and unrelated-policy preservation.
15. Correct D13 hidden/offline composition and add application tests using the real constants/behavior.
16. Replace comment-only database tests with executable, fail-closed synthetic-environment suites covering schema, ACL, RLS, Storage, two users, snapshot/source changes, concurrent enqueue, lease/cancel/stale races, exact publication, and rollback. Add genuine PostgreSQL parser evidence.
17. Run a new static Database Architect review. Only after it approves may George be asked for an exact disposable-environment migration/test authorization under D12.

## Round 5 ten-correction disposition

| Round 5 correction | Round 6 status |
|---|---|
| 1. Complete D11 catalogue/authority evidence | **Complete as evidence; implementation does not yet conform** |
| 2. Exact drift checks | **Partial / insufficient** |
| 3. Authoritative ledger scope binding | **Not complete** |
| 4. Legacy unverified/quarantine | **Partial; generic path can trust pre-contract keys** |
| 5. Closed visual manifest/current attempt/ACL | **Not complete** |
| 6. Source revision, digest, execution descriptor | **Not complete; table only** |
| 7. Remove SQLSTATE leakage and classify second retry | **Partial / not complete** |
| 8. Database diagnostic allowlists | **Partial; pair/reference constraints incomplete** |
| 9. Real executable database tests | **Not complete** |
| 10. Genuine SQL parser evidence and re-review | **Re-review complete; parser evidence absent** |

The ten Round 5 corrections are **not fully implemented**.

## Required closing report

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** DBR6-C01 mutable worker input/disconnected snapshot; DBR6-C02 caller-authoritative, non-atomic source/request/job binding.
3. **High findings:** incomplete snapshot schema/invariants; incomplete existing-object ACL reconciliation; non-normalized drift handling; inexact Storage reconciliation; open visual manifest; unsafe generic legacy verification and missing migration manifest; retry/diagnostic/recovery gaps; non-executable database/security tests.
4. **Medium findings:** non-authoritative application request hash; default-ACL operational guardrails; D13 hidden/offline composition; unnecessarily loose response shaping.
5. **Confirmed corrections:** listed above; they include core CAS/cancellation improvements, constraint-backed active exclusion, durable ledger structure, transactional visual publication, private signed visual delivery, secret-key guardrails, safe job DTOs, P0007 key preservation, and most D13 polling mechanics.
6. **D11 requirements still missing:** database-created immutable source/digest, full atomic binding, snapshot-only worker input, exact internal authority, normalized drift/postconditions, manifest/fresh baseline, and executable evidence.
7. **Exact ordered corrections required:** the 17-step sequence above.
8. **Snapshot design complete:** **No**. It is a disconnected table-only draft and lacks required fields, canonical database hashing, ownership/binding, and runtime use.
9. **Enqueue fully atomic:** **No**. Ledger/job writes are transactional, but source capture, snapshot, authoritative hashes, and exact operation binding are absent.
10. **Worker input immutable:** **No**. The worker rereads mutable `documents` and `document_analysis` after claim and on retry.
11. **ACL reconciliation complete:** **No**. `service_role` retains direct `generation_jobs` authority; all live `study_visuals` application-role ACLs and `study_visuals_owner_all` remain; exact named function revokes/postconditions are missing.
12. **Storage reconciliation complete:** **No**. Privacy/signed access is substantially improved, but the pattern drop and weak postconditions violate the exact D11 plan, and the database manifest remains client-mutable.
13. **D13 complete:** **No**. Backoff, jitter, and one-in-flight exist; hidden/offline composition and executable behavioral evidence remain defective. D13 performance qualification also remains a beta release gate.
14. **Ten Round 5 corrections fully implemented:** **No**.
15. **May Claude perform another local correction round:** **Yes**, limited to local implementation/test-file corrections under this ordered review. No migration execution or environment access is implied. D3 continues to block final provider-specific production worker authority.
16. **Disposable migration execution approved:** **No**.
17. **Database or Storage tests approved:** **No** under this task. After another passing static review, George must approve the exact disposable target, credentials, migration, and synthetic test scope under D12.
18. **Another catalogue inspection required:** **No**. D11 catalogue and authority inspection are complete; the remaining defects are locally determinable implementation gaps. Re-inspect only if the target catalogue changes before an eventual maintenance operation.
19. **No implementation or environment action:** Confirmed for this review. Only this review file was created. No SQL, Supabase/Storage access, implementation edit, test execution, Git mutation, or deployment occurred.
20. **`git diff --stat` before this review file (Git does not include untracked files):**

    ```text
     e2e/rls-two-user.spec.ts                           |   25 +-
     migrations/20260729120001_generation_job_state_machine_schema.sql | 1385 ++++++++++++++------
     src/app/actions/generationJobs.ts                  |   75 +-
     src/app/actions/visuals.ts                         |  329 +----
     src/app/api/jobs/visuals/route.ts                  |  133 +-
     src/app/api/visuals/[documentId]/route.ts          |   41 +-
     src/app/dashboard/study/[id]/page.tsx              |   18 +-
     src/components/study/VisualsPanel.tsx              |  151 ++-
     src/lib/jobs/__tests__/workerScenarios.test.ts     |   21 +-
     src/lib/jobs/enqueueErrors.ts                      |   24 +-
     src/lib/jobs/idempotencyKey.ts                     |   58 +-
     src/lib/jobs/workerClient.ts                       |   49 +-
     src/types/studyVisual.ts                           |   21 +
     13 files changed, 1427 insertions(+), 903 deletions(-)
    ```

    The untracked `src/lib/jobs/visualsWorker.ts` was inspected separately and is not represented by this stat.
21. **`git status --short` after creating this review:** recorded in the handoff response. Governance state at review time is branch `feature/remediate-beta-foundation-v1`; HEAD remains `7a2029f` (`7a2029fa…`), preserving the rejected commit; `main`/`origin/main` remain `7f72313`; and no new commit exists.

## Final verdict

**APPROVE WITH REQUIRED LOCAL CORRECTIONS**
