# Beta Foundation V1 — Final D11 Live-Catalogue Reconciliation

**Review date:** 2026-07-31  
**Role:** MoLis Database Architect  
**Scope:** final reconciliation of the two approved read-only catalogue inspections against the uncommitted Phase 1–2 corrective design  
**Primary evidence:** `.ai/inspection/d11-catalogue-results-2026-07-31.csv` and `.ai/inspection/d11-additional-authority-results-2026-07-31.csv`  
**Environment action by this review:** none

## Verdict

**D11 COMPLETE — APPROVE LOCAL CORRECTION IMPLEMENTATION**

The additional authority catalogue closes the exact gaps that produced the earlier `D11 INCOMPLETE` verdict. It inventories every live `public` routine without a name filter, their complete definitions and authority, all explicit ACL entries on the four public target tables and `storage.objects`, column ACLs, schema ACLs, default privileges, non-system role attributes, memberships, proposed-object drift, and migration-history metadata.

The result is sufficient to implement the next correction locally and statically. It is **not** permission to apply a migration, access an environment, run database or Storage tests, mark migration history, or deploy. The corrected candidate must still pass static review and genuine parser/test evidence before George is asked for any disposable-environment authorization.

## Inspection integrity

- Both supplied inspections began inside `BEGIN TRANSACTION READ ONLY` and ended with `ROLLBACK`.
- The first inspection recorded PostgreSQL 17.6, `current_user=postgres`, and `transaction_read_only=on`; its S27 final row reconfirmed read-only mode.
- The additional inspection's SA00 and SA18 rows recorded the same PostgreSQL version/user context and reconfirmed `transaction_read_only=on` immediately before rollback.
- Neither CSV contains student row content or Storage objects. The evidence is catalogue and bucket/policy metadata only.
- This review did not connect to Supabase, execute SQL, inspect Storage objects, or mutate any environment.

## Resolution of the previous incomplete verdict

| Previous unresolved item | Final result |
|---|---|
| Five uninspected public routines | Closed: all five identities, bodies, owners, security modes, arguments, settings, dependencies, dependents, and ACLs are present in SA01–SA06. |
| Unknown function path into target objects | Closed for the application schema: SA14 returned no public routine whose definition references `generation_jobs`, `study_visuals`, `documents`, `document_analysis`, or Storage. The one document-related function is known through its trigger dependency and has been manually assessed. |
| Unbounded table grantees | Closed: SA07 and SA08 use no grantee allowlist and expose every explicit ACL entry on the target public tables and `storage.objects`. |
| Unknown column grants | Closed: SA09 returned no rows, proving there are no explicit column ACLs on the inspected tables; table ACLs govern. |
| Unknown schema/default privilege effects | Closed: SA10 and SA11 provide exact schema ACLs and all default ACLs. Broad future-object grants in `public` are now a required correction. |
| Unknown roles, inheritance, and RLS bypass | Closed for the actors relevant to this design: SA12 and SA13 provide role attributes and memberships; managed roles are separated from application actors. |
| Possible same-named Round 5 objects | Closed: SA15 confirms that `generation_source_snapshots`, `generation_job_ledger`, and `generation_job_requests` are absent. The first inspection plus the unfiltered routine list confirms the proposed job functions, views, columns, constraints, and indexes are absent. |
| Unknown application migration ledger | Closed as a fact: no `supabase_migrations` schema/table exists. The discovered auth, realtime, and Storage migration tables are service-owned and are not a MoLis ledger. |

## 1. Final exact live-schema and authority facts

The earlier reconciliation's table, constraint, index, RLS, and Storage facts remain authoritative. The additional facts are as follows.

### 1.1 The five live public routines

All five are zero-argument, volatile, parallel-unsafe PL/pgSQL functions returning `trigger`. All are owned by `postgres`, are **SECURITY INVOKER** (`security_definer=false`), are not leakproof or strict, and have explicit EXECUTE ACLs for PUBLIC, `postgres`, `anon`, `authenticated`, and `service_role`. In SA04, `unknown (OID=0)` is the ACL pseudo-role PUBLIC; the raw `=X/postgres` entry confirms it. None of these grants is grantable.

| Routine | Exact behavior | Search path | Dependents | Target-authority assessment |
|---|---|---|---|---|
| `set_subjects_updated_at()` | Assigns `NEW.updated_at=now()` and returns NEW | no function-local setting | `set_subjects_updated_at` trigger on `subjects` | Does not reference or mutate a review target. |
| `set_user_profiles_updated_at()` | Assigns `NEW.updated_at=now()` and returns NEW | no function-local setting | trigger on `user_profiles` | Does not reference or mutate a review target. |
| `sync_user_profiles_identity()` | Copies `user_id` to `id`, or `id` to missing `user_id`, then returns NEW | no function-local setting | trigger on `user_profiles` | Does not reference or mutate a review target. |
| `update_updated_at()` | Assigns `NEW.updated_at=now()` and returns NEW | no function-local setting | triggers on `agent_memories` and `user_profiles` | Does not maintain either source table and cannot provide source revision identity. |
| `validate_resource_subject_ownership()` | Rejects a non-null subject unless `public.subjects.id` belongs to `NEW.user_id`, then returns NEW | fixed `search_path=public`; relation is also schema-qualified | triggers on `documents` and `recordings` | Reads `subjects` and can reject document INSERT/UPDATE. It performs no INSERT/UPDATE/DELETE and creates no route to job, analysis, visual, or Storage mutation. |

The four routines without a local `search_path` resolve no application relation or user-controlled function name: their bodies use only NEW values and `now()`. The validator fixes its search path and schema-qualifies `subjects`. The catalogue dependencies returned for the functions themselves are the `public` namespace and PL/pgSQL language; the trigger dependents listed above establish their live attachment. Because they return the trigger pseudo-type, their broad EXECUTE ACL is not an ordinary business RPC mutation path. They must be preserved, not dropped or replaced, by the Phase 1–2 migration.

SA14 returned no rows. Therefore no current `public` routine definition contains a reference to any named target table or Storage. This unfiltered result also proves that every proposed Round 5 job RPC name—including `fn_request_job_cancel`—is absent.

### 1.2 Public target-table ACLs

Each of `documents`, `document_analysis`, `generation_jobs`, and `study_visuals` is owned by `postgres` and has the same raw ACL:

`postgres=arwdDxtm`, `anon=arwdDxtm`, `authenticated=arwdDxtm`, and `service_role=arwdDxtm`.

On PostgreSQL 17 this means explicit SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN privileges for all four named roles. There is no separate PUBLIC table ACL entry. SA09 returned no column privilege rows, so no narrower column-level exception exists.

RLS is enabled but not forced on all four tables. RLS can constrain row DML; it does not make broad TRUNCATE, trigger-management, reference, maintenance, or owner/BYPASSRLS authority acceptable. The exact RLS policies remain those recorded in the first catalogue, including `Users see own jobs`, `study_visuals_owner_all`, `document_analysis.owner_all`, and duplicated document owner policies.

### 1.3 Storage ACL and policy authority

`storage.objects` is owned by `supabase_storage_admin`, has RLS enabled and not forced, and grants all eight table privileges to `supabase_storage_admin` and `postgres` grantably and to `anon`, `authenticated`, and `service_role` non-grantably. These are Supabase Storage's shared table privileges; bucket isolation is provided by RLS policies. They must not be globally revoked merely to secure one bucket, because doing so would alter `study-documents`, `recordings`, and Supabase-managed operation.

The `study-visuals` bucket is `public=true`. Four authenticated permissive policies grant owner-prefix SELECT, INSERT, UPDATE, and DELETE. Seven other policies govern `study-documents` and `recordings`. The exact policy names and expressions are recorded in the earlier review and remain the reconciliation source.

No public routine references Storage. Schema-level USAGE for browser roles does not itself grant table access or permit bucket DDL. Supabase-managed Storage owners/functions and the migration owner remain trusted/control-plane authorities and are outside the objects the MoLis migration should rewrite. The local correction changes only the one bucket row and the four exact application policies, then proves the resulting bucket/policy postcondition.

### 1.4 Schema ACLs

- `public`: `pg_database_owner` has CREATE and USAGE; PUBLIC, `postgres`, `anon`, `authenticated`, and `service_role` have USAGE. Browser roles do not have CREATE in `public` through this ACL.
- `storage`: `supabase_admin`, `supabase_storage_admin`, and `dashboard_user` have CREATE/USAGE; `postgres`, PUBLIC application roles, and service role have USAGE. This is Supabase-managed and must not be normalized by the MoLis correction.
- `auth`: managed admin/dashboard roles have CREATE/USAGE; application roles and `postgres` have USAGE. This is also provider-managed and outside the correction.

### 1.5 Default privileges

The critical new fact is that objects created by **both `postgres` and `supabase_admin` in `public`** inherit broad explicit defaults:

- functions: EXECUTE to `postgres`, `anon`, `authenticated`, and `service_role`;
- sequences: SELECT, UPDATE, and USAGE to all four roles;
- tables: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN to all four roles.

No type default-ACL entry was returned. The first catalogue found no public sequences and no relevant custom enums. The corrective design should continue to use UUIDs and text-plus-check constraints rather than introducing an unnecessary sequence or enum.

This default explains the broad existing table/function ACLs and creates a concrete defect in the current migration: revoking only PUBLIC from a newly created function does **not** remove the explicit `anon` and `authenticated` grants supplied by the default ACL.

### 1.6 Roles, inheritance, bypass, and memberships

- `anon` and `authenticated` are NOLOGIN, INHERIT roles without BYPASSRLS.
- `authenticator` can log in, is NOINHERIT, has no BYPASSRLS, and is a member of the application roles so the platform can select the JWT role.
- `service_role` is NOLOGIN, INHERIT, and has BYPASSRLS. RLS is never a sufficient service-role restriction; table/function ACLs must be narrow.
- `postgres` can log in, owns the public target tables/functions, has BYPASSRLS, CREATEDB, and CREATEROLE. The membership rows mean `postgres` is a member of the anon/authenticated/service roles—not that browser roles inherit `postgres`.
- `supabase_admin` is a Supabase-managed superuser with BYPASSRLS.
- `supabase_storage_admin` owns `storage.objects`; because RLS is not forced, ownership is an authority path even though its role attribute does not itself have BYPASSRLS.
- `supabase_etl_admin` and `supabase_read_only_user` have BYPASSRLS and membership in `pg_read_all_data`; these are managed operational/read roles, not application actors.
- The other dashboard, auth, realtime, replication, and privileged roles are provider-managed. The MoLis migration must not revoke their role attributes, memberships, managed-schema ACLs, or service-table ownership.

### 1.7 Objects capable of changing the targets

| Target | Existing mutation authority before correction |
|---|---|
| `generation_jobs` | `postgres` as owner/BYPASSRLS; `service_role` through direct ACL and BYPASSRLS; anon/authenticated through broad direct ACL subject to the permissive owner RLS policy. No existing routine or trigger mutates it. |
| `study_visuals` | Same owner/service/browser table authority, with `study_visuals_owner_all`. No existing routine or trigger mutates it. |
| `documents` | Same direct table authority subject to document policies; the subject-ownership trigger invokes `validate_resource_subject_ownership()` and may reject a write. It does not write another target. |
| `document_analysis` | Same direct table authority subject to `owner_all`. No existing routine or trigger mutates it. |
| `storage.objects` | Managed owner `supabase_storage_admin`, `postgres`, service role, and browser roles through shared ACL; browser row access is constrained by Storage RLS. No public routine bridges into it. |
| `storage.buckets` | The bucket row is managed in the `storage` subsystem. No public routine bridges to it. The approved migration owner may set the exact `study-visuals` row private; all provider-owned schema/function/role authority remains untouched. |

### 1.8 Migration history

- The `supabase_migrations` schema does not exist, and `supabase_migrations.schema_migrations` resolves to null.
- `auth.schema_migrations` exists, is owned by `supabase_auth_admin`, and tracks Auth service versioning.
- `realtime.schema_migrations` exists, is owned by `supabase_admin`, and tracks Realtime service versioning.
- `storage.migrations` exists, is owned by `supabase_storage_admin`, and belongs to the Storage service.

None is the MoLis application migration ledger. The corrective implementation must not read, write, mark, rename, grant on, or repurpose these tables. D11 therefore still requires a repository-owned explicit manifest/checksum contract; a live step may be considered applied only from reviewed MoLis evidence, never from a similarly named service table.

## 2. Every remaining migration assumption confirmed

1. The exact historical `generation_jobs` baseline, constraints, indexes, policy, ACL, and RLS state are known.
2. All state-machine, request, source, diagnostic, proposed-index, composite-constraint, ledger, snapshot, and proposed function/view names are absent.
3. `generation_job_requests`, `generation_job_ledger`, and `generation_source_snapshots` do not exist.
4. No existing public routine conflicts by name or provides an alternate target mutation path.
5. The five existing public routines are app trigger utilities, not worker/job/storage authority.
6. `study_visuals` has the exact six-column shape, PK, cascading FKs, and `UNIQUE(document_id,user_id)` required by atomic publication.
7. `document_analysis` lacks owner/document uniqueness and requires a D10 preflight before enforcing deterministic current-analysis selection.
8. Neither source table has an update/revision/hash mechanism; immutable snapshots are required.
9. `pgcrypto` and `uuid-ossp` are available; SHA-256 and UUID source-snapshot design is feasible.
10. The bucket and all eleven Storage policies are known exactly; only four apply to `study-visuals`.
11. Broad public-schema default privileges explain why explicit named-role revocation is mandatory after object creation.
12. No public column ACL, sequence, relevant enum, or public view creates a hidden authority path.
13. No application migration-history table exists; service migration tables are unrelated.

## 3. Every remaining migration assumption disproved

1. **`REVOKE ... FROM PUBLIC` is enough to narrow new functions:** disproved. `anon`, `authenticated`, and `service_role` receive explicit EXECUTE through `postgres/public/FUNCTION` defaults and must be revoked by name.
2. **New tables begin owner-only:** disproved. `postgres/public/TABLE` defaults grant all eight table privileges explicitly to the three application roles.
3. **RLS alone protects internal tables from every operation:** disproved. Broad TRUNCATE/TRIGGER/REFERENCES/MAINTAIN privileges exist, and service/owner roles bypass RLS.
4. **A source timestamp can bind the request:** disproved. The required columns/triggers do not exist, and a timestamp would not retain the accepted content.
5. **The existing job status index is the active exclusion:** disproved. It is non-unique and covers only queued/processing.
6. **The existing user/document/type index prevents concurrent active duplicates:** disproved. It is non-unique and unqualified.
7. **The current Storage policy name pattern identifies the four live policies:** disproved. Their names are `For full customization 137qt67_0` through `_3`.
8. **A live Supabase application migration ledger can be updated:** disproved. No `supabase_migrations` schema exists; the discovered service tables are not interchangeable.
9. **Existing source trigger helpers can supply source revision:** disproved. `update_updated_at()` is attached only to `agent_memories` and `user_profiles`; the document trigger validates subject ownership only.

## 4. Exact ordered local implementation corrections

This is authorization to edit locally only. The correction order must be:

1. Preserve `beta_foundation_v1.sql` byte-for-byte and add/update the repository manifest/checksum contract; never touch Auth, Realtime, or Storage service migration tables.
2. Add normalized fail-closed preflight for every inventoried column, default, constraint, index, trigger, function, owner, ACL, RLS policy, bucket, and Storage policy. Replace name-only `IF NOT EXISTS` acceptance.
3. Assert that the migration runs as the approved `postgres` application migration owner. Do not create MoLis objects manually as `supabase_admin`.
4. Harden `postgres` default privileges in `public` before creating MoLis objects: remove table, sequence, and function defaults from PUBLIC, anon, authenticated, and service role. Preserve owner authority. Do not alter `supabase_admin` or other provider-managed default ACLs; instead prohibit those roles from owning versioned MoLis objects and assert every new MoLis owner.
5. Preflight `document_analysis` duplicates and active-job duplicates through the later approved D10 data preflight. Abort/quarantine ambiguity; perform no deletion or silent winner selection.
6. Create the immutable source-snapshot contract defined in Section 5 with owner-only table authority, RLS enabled, and no browser/service direct access.
7. Assert the exact 13-column job baseline, then add state, lease, attempt, request, snapshot/config, classification, and constrained public-diagnostic fields. Classify all existing rows `legacy_unverified`.
8. Replace the exact historical status check with the six-state check including `cancel_requested`; preserve the exact five-value job-type check.
9. Preserve `generation_jobs_user_doc_type`; replace/retire the obsolete status index deliberately; add exact active polling, partial unique active exclusion, originating-key integrity, and composite ledger/snapshot binding support.
10. Create `generation_job_requests` with exact owner/request/scope/snapshot/config/job binding, composite `RESTRICT` FKs, immutable ledger semantics, RLS, owner-only base ACL, and zero verified historical backfill.
11. Add deferred invariants that match the exact originating ledger row and prevent mutation/deletion from making a client-verified job unverifiable.
12. Implement the reviewed CAS/lease/cancel/recovery and atomic visual publication functions. Use explicit fixed search paths and schema-qualified relations.
13. For every new function, first revoke from PUBLIC, anon, authenticated, and service role; then grant only the exact authenticated or temporary service actor. Trigger/invariant functions receive no client/worker EXECUTE grant.
14. Remove `Users see own jobs`, revoke all direct job access from PUBLIC/anon/authenticated/service role, and expose only narrow authenticated enqueue/cancel/safe-read functions and temporary service worker functions.
15. Assert `study_visuals` exactly, remove `study_visuals_owner_all`, revoke direct base-table access from PUBLIC/anon/authenticated/service role, and make its manifest worker-authoritative through atomic publication only.
16. Preserve document and analysis owner DML required by the active application while revoking unnecessary anon and non-DML TRUNCATE/TRIGGER/REFERENCES/MAINTAIN authority. Reconcile duplicated document policies separately; do not mix that policy cleanup into this migration.
17. Apply the exact Storage reconciliation in Section 7. Do not globally revoke `storage.objects` ACLs or alter managed Storage roles/functions.
18. Install database allowlists and length/state checks for public diagnostics; keep restricted internal diagnostics outside owner-readable fields.
19. Grant authenticated enqueue last, only after every normalized ACL/RLS/function/Storage postcondition passes. Keep enqueue traffic disabled throughout the eventual maintenance operation.
20. Correct application error handling, operation hashing/execution, closed visual manifests/DTOs, and executable tests; produce real PostgreSQL parser evidence. Request a new static implementation review before any environment request.

## 5. Exact source-snapshot architecture

Use an immutable `public.generation_source_snapshots` table created and read only through reviewed SECURITY DEFINER functions.

Required fields and invariants:

- UUID primary key generated by `gen_random_uuid()`;
- non-null `user_id` and `document_id`, snapshot schema version, creation time, and immutable classification;
- exact document title and extracted text accepted for generation;
- closed canonical document metadata containing every output-affecting field, including `file_type`, `source_type`, `subject_id`, and `source_recording_id` where used; exclude `file_path` unless the path value itself is deliberately part of the generation operation;
- selected analysis ID and a closed copy of every analysis field actually consumed, including analysis model/provenance;
- server-owned operation descriptor containing prompt/template versions, actual text/image model identifiers, response schema, limits, truncation/selection behavior, size/count, and other generation parameters;
- database-computed SHA-256 over one versioned canonical JSONB envelope; store the digest in a constrained representation and bind it to the job and request ledger;
- `RESTRICT` retention/deletion behavior until D8–D10 legal and recovery gates approve a lifecycle;
- no UPDATE or DELETE path for runtime actors and no direct PUBLIC/anon/authenticated/service-role privileges.

The enqueue function must derive `auth.uid()`, reject null/mismatched ownership, and use one `INSERT ... SELECT`-equivalent statement—or a reviewed repeatable-read/locking equivalent—to read document and unique analysis content consistently, create the snapshot, compute the digest, create/bind the ledger row, and resolve/create the job atomically. The client supplies a request key, not authoritative source content, user ID, revision, or digest.

The worker reads only the bound snapshot through its claimed-context function; it never rereads mutable `documents` or `document_analysis` as generation input. Edits after enqueue therefore do not change accepted work, including edits during provider generation. Same-key replay returns the same ledger/job/snapshot. Intentional regeneration after terminal work uses a new key and captures a new snapshot. A new key while equivalent work is active follows D2 and durably binds to/returns the existing active job without replacing its snapshot.

## 6. Exact ACL and function-authority reconciliation

### Existing routines

- Assert and preserve all five exact routine definitions, owners, security-invoker mode, settings, and trigger dependents.
- Do not reuse `update_updated_at()` as source authority and do not drop/replace any of these functions in this phase.
- Their current broad EXECUTE ACL is not a target mutation path because they are trigger functions, but it is a separate hardening candidate. Changing it is not required for the Phase 1–2 contract and must not be bundled without trigger regression evidence.

### Default privileges and ownership

- Canonical MoLis migrations execute as `postgres`; every MoLis table/function owner must be asserted as `postgres` unless a future approved least-privilege owner role replaces it.
- Remove `postgres/public` default grants for tables, sequences, and functions from PUBLIC/anon/authenticated/service role before creating new objects.
- Leave `supabase_admin/public` and all managed-schema defaults unchanged. Version-controlled MoLis objects must not be created as `supabase_admin`; a wrong owner is a preflight/postcondition failure.

### Internal tables

`generation_jobs`, `generation_job_requests`, `generation_source_snapshots`, and `study_visuals` have no direct PUBLIC, anon, authenticated, or service-role table/column privileges. RLS is enabled, but no permissive browser policy exists. Owner writes happen inside narrow SECURITY DEFINER functions. Temporary service-role worker use is EXECUTE-only; D3 still blocks it as final production authority.

### RPCs

- authenticated only: enqueue, cancellation request, and closed safe-read operations;
- temporary service role only: claim, context, heartbeat, completion/publication, failure, cancel acknowledgement, and stale recovery;
- owner only: constraint/deferred-trigger helper functions;
- anon: no target function EXECUTE;
- every function receives an explicit full revoke from PUBLIC **and each named default grantee** before its exact grant;
- final postconditions compare `prosecdef`, owner, signature, return type, fixed search path, source/definition hash, and exploded EXECUTE ACL.

### Source tables

The active app may retain only authenticated owner CRUD that it actually uses on `documents` and `document_analysis`. Anon access and non-DML privileges such as TRUNCATE, TRIGGER, REFERENCES, and MAINTAIN must be removed. The duplicate document policies remain a separately reviewed normalization task; snapshot creation performs its own authoritative ownership check.

### Managed roles

Do not alter role attributes/memberships, managed schema ACLs, `storage.objects` ownership, or Supabase service tables. Actor tests must nevertheless include anon, owner, non-owner, temporary service role, and migration-owner cases because BYPASSRLS/ownership is proven in the catalogue.

## 7. Exact Storage reconciliation

1. Assert the exact `study-visuals` bucket row, `public=true`, `storage.objects` RLS state, all eleven policy definitions, and their fingerprints.
2. Set only `study-visuals` to `public=false`.
3. Drop only these four policies after matching role, command, permissiveness, `USING`, and `WITH CHECK`: `For full customization 137qt67_0`, `_1`, `_2`, and `_3`.
4. Preserve byte/normalized-definition fingerprints for the three `study-documents` and four `recordings` policies; do not alter them.
5. Create exact restrictive authenticated and anon policies that evaluate false for `bucket_id='study-visuals'` and true for other buckets, so shared permissive policies cannot grant direct visual access and unrelated buckets are not blocked.
6. Leave shared `storage.objects` table ACLs and all managed Storage owner/function/schema authority unchanged.
7. Trusted worker upload uses immutable owner/document/job/attempt/index paths and `upsert=false`. A stale or losing upload remains private and unpublished.
8. Signed visual URLs are minted server-side for five minutes only after owner authorization and exact bucket/prefix/manifest validation. Public DTOs contain neither raw paths nor privileged/internal manifest fields.
9. Enforce reviewed MIME, object-size, manifest-count/string/JSON-size, extension, status/path, model/config, and current-attempt constraints before production.
10. Postconditions prove: bucket private; exact four policies absent; exact restrictive policies present; no permissive policy can apply to `study-visuals`; RLS remains enabled; seven unrelated policy fingerprints unchanged; browser direct CRUD/list/read denied; trusted upload/signing works only through the approved boundary.

No legacy object deletion is authorized. D7 private access is mandatory; D8–D10 continue to gate cleanup and irreversible deletion.

## 8. Exact drift-safe handling requirements

- Assert exact definitions, never names alone. `IF NOT EXISTS` is permitted only after a normalized compatible-definition assertion.
- Preserve the job PK, two cascading FKs, and exact type check; replace only the exact known status check.
- Preserve `generation_jobs_user_doc_type`; separately add the active exclusion and polling structures. Replace/retire `generation_jobs_status` deliberately.
- Classify every existing baseline job as `legacy_unverified`; no row can become verified merely because a drift column contains non-null text.
- Backfill zero verified request-ledger rows from this baseline. Any unexpected drift aborts/quarantines; `ON CONFLICT DO NOTHING` cannot hide a mismatch.
- Preserve the `study_visuals` PK, cascades, six columns/defaults, and exact owner/document unique constraint before atomic publication.
- Preflight missing `document_analysis(document_id,user_id)` uniqueness with D10 quarantine-first behavior; no destructive canonicalization.
- Leave duplicated document policies untouched in this migration and record them for a separate forward policy normalization.
- Preserve all five existing trigger routines and their seven trigger dependents.
- Harden only `postgres/public` application-object defaults and exact MoLis object ACLs. Do not alter `supabase_admin`, auth, realtime, Storage, dashboard, ETL, replication, read-only, or other provider-managed authority.
- Never modify `beta_foundation_v1.sql`; never use service-owned migration tables as proof of MoLis migration state.
- Require normalized final-catalogue equality between a fresh manifest build and a representative upgraded database before rollout consideration.

## 9. Round 5 correction completeness

All ten Round 5 corrections are now **fully specified as local implementation requirements**, not completed or execution-verified:

1. D11 catalogue reconciliation is complete through both read-only inspections.
2. Exact drift checks and fail-closed handling are defined, including default ACL effects.
3. Authoritative ledger scope and exact job/key/hash/snapshot/config binding are defined.
4. Historical rows are unverified; ambiguity is quarantine/abort, never silent trust.
5. Closed visual manifest, current-attempt path, publication, uniqueness, RLS, and ACL requirements are defined.
6. Immutable source snapshot plus database SHA-256 and operation descriptor replaces timestamp revalidation.
7. Raw SQLSTATE/public/log correction remains required exactly as stated in Round 5.
8. Database-enforced public diagnostic allowlists, bounds, formats, and state coherence remain required.
9. Comment-only/empty tests must become executable, fail-closed, no-skip evidence suites.
10. Genuine PostgreSQL parser evidence and another static implementation review are required before any disposable execution request.

## Required closing statements

1. **Final exact live-schema and authority facts:** recorded in Section 1 and the earlier reconciliation incorporated by reference.
2. **Every remaining migration assumption confirmed:** recorded in Section 2.
3. **Every remaining migration assumption disproved:** recorded in Section 3.
4. **Exact ordered local implementation corrections:** recorded in Section 4.
5. **Exact source-snapshot architecture:** recorded in Section 5.
6. **Exact ACL and function-authority reconciliation:** recorded in Section 6, including the explicit named-role default-grant defect.
7. **Exact Storage reconciliation:** recorded in Section 7.
8. **Exact drift-safe handling requirements:** recorded in Section 8.
9. **Whether all ten Round 5 corrections are fully specified:** **Yes, as implementation requirements.** They are not yet implemented or verified.
10. **Whether D11 is complete:** **Yes.** The live catalogue and authority starting contract is sufficiently exact for local correction implementation.
11. **Whether Claude may begin another local correction implementation round:** **Yes.** Local edits only, following this order and the governance handoff; no migration/test/environment execution is implied.
12. **Whether any additional read-only inspection is required:** **No additional D11 catalogue inspection.** Separately approved row-count/duplicate/orphan/active-job and legacy-object preflights remain mandatory before any live upgrade, but they are execution-stage D10/D12 gates rather than a blocker to local implementation.
13. **Whether disposable migration execution is approved:** **No.** A corrected candidate, parser evidence, static re-review, and George's separate exact environment authorization are required first.
14. **Whether database or Storage tests are approved:** **No execution is approved.** Test code may be implemented locally; later database/Storage execution requires a corrected reviewed candidate and separate authorization.
15. **Confirmation no implementation or environment change occurred:** This review created only this Markdown file. It did not modify an earlier review, implementation, migration, or test; access Supabase or Storage; execute SQL; stage, commit, push, merge, or deploy.
16. **Git status:** reported after file creation; every pre-existing working-tree change remains untouched.

