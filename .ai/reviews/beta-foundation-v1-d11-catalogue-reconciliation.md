# Beta Foundation V1 — D11 Live-Catalogue Reconciliation

**Review date:** 2026-07-31  
**Role:** MoLis Database Architect  
**Scope:** read-only reconciliation of the approved D11 catalogue export against the current corrective migration  
**Catalogue evidence:** `.ai/inspection/d11-catalogue-results-2026-07-31.csv`  
**Reviewed migration:** `migrations/20260729120001_generation_job_state_machine_schema.sql`  
**Environment action by this review:** none

## Verdict

**D11 INCOMPLETE — ADDITIONAL READ-ONLY INSPECTION REQUIRED**

The approved inspection confirms the live shapes of the four target tables, the absence of the request ledger and source-revision fields, the existing generation-job policy and privileges, the public `study-visuals` bucket, all eleven currently returned Storage policies, and the required extensions. This is enough to specify the source-snapshot architecture, the exact four-policy Storage reconciliation, and most drift-safe table handling.

It is not enough to close D11. Sections S13, S14, and S25 searched only for proposed function names and returned no rows, while S26 proves that five other functions exist in `public`. The inspection therefore did not establish whether an existing function, function grant, owner, or dependency can read or mutate a target table. S12 also restricted grantees to five named roles and did not enumerate column privileges, default privileges, custom roles, memberships, or `BYPASSRLS` attributes. Those blind spots matter to the final authority boundary. They require one further catalogue-only, read-only inspection before the corrective migration can be made fail-closed and approved for execution.

This verdict does not invalidate the completed inspection. It identifies the exact residual metadata needed; it does not request student rows, Storage objects, SQL execution, or any mutation.

## Inspection integrity and limits

- S0 records PostgreSQL 17.6, `current_user=postgres`, `session_user=postgres`, and `transaction_read_only=on`.
- S27 re-records `transaction_read_only=on` immediately before the inspection script's final `ROLLBACK` note.
- The supplied evidence is catalogue metadata only. No student payload, Storage object, or application row content appears in the CSV.
- This review did not connect to Supabase, execute SQL, inspect Storage objects, or alter an environment.
- The CSV proves only what each query's filter could return. An empty filtered section is not automatically proof that no related object exists.

## 1. Exact live-schema facts

### 1.1 Target-table presence and RLS

`public.documents`, `public.document_analysis`, `public.generation_jobs`, and `public.study_visuals` exist as base tables. All are owned by `postgres`, have RLS enabled, and do not force RLS. `public.generation_job_requests` does not exist.

### 1.2 Source tables

`public.documents` has exactly ten returned columns:

| Column | Live definition relevant to this review |
|---|---|
| `id` | UUID, not null, default `gen_random_uuid()`, primary key |
| `user_id` | UUID, nullable, FK to `auth.users(id)` with `ON DELETE CASCADE` |
| `title` | text, not null |
| `file_path` | text, nullable |
| `file_type` | text, nullable |
| `extracted_text` | text, nullable |
| `created_at` | timestamptz, nullable, default `now()` |
| `subject_id` | UUID, nullable, FK to `subjects(id)` with `ON DELETE SET NULL` |
| `source_type` | text, nullable, checked to `upload`, `recording`, or null |
| `source_recording_id` | UUID, nullable, FK to `recordings(id)` with `ON DELETE SET NULL` |

It has no `updated_at`, `extracted_text_updated_at`, revision, version, hash, or checksum column. Its only returned trigger is `validate_document_subject_ownership`, a before-row trigger for INSERT and UPDATE. That trigger validates subject ownership; it does not maintain source identity.

`public.document_analysis` has 22 returned columns. Its generation-relevant content includes `subject_area`, `difficulty_level`, `estimated_study_minutes`, `sections`, `key_concepts`, `definitions`, `formulas`, `examples`, `keywords`, `likely_exam_topics`, `model`, `learning_objectives`, `misconceptions`, `relationships`, `prerequisites`, `tables`, `concept_graph`, and `learning_path`, in addition to `id`, `document_id`, `user_id`, and `created_at`. It has no `updated_at`, revision, version, hash, or checksum column and no returned trigger. It has a primary key, cascading document and user foreign keys, and non-unique indexes on `document_id` and `user_id`. It does **not** have a unique constraint on `(document_id, user_id)`.

### 1.3 `generation_jobs`

The live table is the historical 13-column baseline:

`id`, `user_id`, `document_id`, `job_type`, `status`, `input_data`, `result_data`, `error`, `correlation_id`, `created_at`, `updated_at`, `started_at`, and `completed_at`.

The exact relevant objects are:

- primary key `generation_jobs_pkey` on `id`;
- `generation_jobs_user_id_fkey` to `auth.users(id) ON DELETE CASCADE`;
- `generation_jobs_document_id_fkey` to `documents(id) ON DELETE CASCADE`;
- `generation_jobs_status_check`, allowing only `queued`, `processing`, `completed`, `failed`, and `cancelled`;
- `generation_jobs_type_check`, allowing `visuals`, `flashcards`, `quiz`, `revision_notes`, and `analysis`;
- non-unique partial index `generation_jobs_status` on `status` where status is `queued` or `processing`;
- non-unique full index `generation_jobs_user_doc_type` on `(user_id, document_id, job_type)`;
- one permissive policy, `Users see own jobs`, for `ALL` to `public`, with `auth.uid() = user_id` as its `USING` expression and no explicit `WITH CHECK`;
- all seven table privileges—SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER—granted directly to `anon`, `authenticated`, and `service_role`; `postgres` holds them grantably.

No corrective state-machine, lease, request-key, request-hash, classification, expected-source, or public-diagnostic column is present. No target job function or job view was returned. No relevant enum type is present; live job status and type are text constrained by checks.

Specifically, every column that the current migration attempts to add is absent: `state_version`, `worker_id`, `lease_token`, `lease_expires_at`, `heartbeat_at`, `attempt_count`, `max_attempts`, `request_idempotency_key`, `request_payload_hash`, `request_classification`, `expected_document_updated_at`, `expected_document_text_updated_at`, `expected_analysis_updated_at`, `public_error_code`, `public_message_key`, and `support_reference`. The proposed `generation_jobs_id_user_id_unique` constraint and the `generation_jobs_active_exclusion`, `generation_jobs_originating_key`, and `generation_jobs_active_status` indexes are also absent. Their absence permits additive creation; it does not justify name-only `IF NOT EXISTS` handling.

### 1.4 `study_visuals`

The live table has exactly:

| Column | Live definition |
|---|---|
| `id` | UUID, not null, default `gen_random_uuid()`, primary key |
| `document_id` | UUID, not null |
| `user_id` | UUID, not null |
| `visuals` | JSONB, not null, default `[]` |
| `model` | text, not null, default `gpt-4o-mini` |
| `created_at` | timestamptz, not null, default `now()` |

It has `study_visuals_document_id_user_id_key` as `UNIQUE(document_id, user_id)`, cascading foreign keys to `documents(id)` and `auth.users(id)`, and a permissive `ALL TO public` owner policy named `study_visuals_owner_all` with matching `USING` and `WITH CHECK` ownership predicates. `anon`, `authenticated`, and `service_role` have all seven direct table privileges.

### 1.5 Storage

The `study-visuals` bucket exists and is currently `public=true`. It has no returned file-size limit or MIME allowlist. `storage.objects` has RLS enabled, not forced, and is owned by `supabase_storage_admin`.

Exactly four returned authenticated permissive policies explicitly target `study-visuals`:

| Policy | Command | Ownership expression |
|---|---|---|
| `For full customization 137qt67_0` | SELECT | bucket match plus first path segment equals `auth.uid()` |
| `For full customization 137qt67_1` | INSERT | same condition in `WITH CHECK` |
| `For full customization 137qt67_2` | UPDATE | same condition in `USING`; no explicit `WITH CHECK` |
| `For full customization 137qt67_3` | DELETE | same condition in `USING` |

The same section returned three `study-documents` policies and four `recordings` policies. They are outside the requested `study-visuals` reconciliation and must not be changed by this corrective migration.

### 1.6 Extensions

`pgcrypto` 1.3 and `uuid-ossp` 1.1 are available. The catalogue also returned `plpgsql`, `pg_stat_statements`, and `supabase_vault`. `pgcrypto.digest` is therefore available for a database-computed source hash; UUID defaults already use `gen_random_uuid()`.

## 2. Every corrective-migration assumption confirmed

| Assumption | Result | Required treatment |
|---|---|---|
| The immutable baseline table `generation_jobs` exists | Confirmed | Assert its exact 13-column shape before additive work. |
| `study_visuals` exists | Confirmed | Assert its exact six-column, PK, FK, and uniqueness contract. |
| `study-visuals` bucket exists | Confirmed | Assert its exact identity and current visibility before cutover. |
| The historical job status check excludes `cancel_requested` | Confirmed | Replace the exact known check with the reviewed expanded check. |
| Job types are the five historical text values | Confirmed | Preserve and assert the exact existing type check unless product scope changes separately. |
| The historical owner job policy exists | Confirmed | Drop the exact policy and prove no client base-table policy remains. |
| Client roles have broad direct job-table privileges | Confirmed | Revoke all table privileges from PUBLIC, `anon`, and `authenticated`; verify postcondition. |
| No request ledger exists | Confirmed | Create it only after prerequisite job columns/keys and source snapshot scope exist. |
| No target job RPCs returned under the inspection's proposed-name list | Confirmed for those exact names only | Safe to create only after all public functions and grants are inventoried for conflicting authority. The filter omitted at least `fn_request_job_cancel`, which the migration drops/creates. |
| No job owner/safe view exists | Confirmed | S26 reports zero public views, so the absence is schema-wide, not merely name-filtered. |
| No relevant enum exists | Confirmed for the exact relevant names | Keep the reviewed text-plus-check approach unless a separate design changes it. |
| Active-job uniqueness does not exist | Confirmed | Add the partial unique exclusion only after duplicate preflight/quarantine. |
| `(document_id, user_id)` uniqueness exists on `study_visuals` | Confirmed | Preserve and assert it before any `ON CONFLICT` publication path. |
| Required cryptographic and UUID extensions are available | Confirmed | Assert compatible installed versions/availability; do not recreate blindly. |

## 3. Every corrective-migration assumption disproved or inadequately supported

| Assumption in the current migration | Catalogue result | Consequence |
|---|---|---|
| `documents.updated_at` can identify the source revision | Disproved | The column does not exist. The current application/migration timestamp design cannot be authoritative. |
| `documents.extracted_text_updated_at` can identify extracted-text revision | Disproved | The column and any maintaining trigger do not exist. |
| `document_analysis.updated_at` can identify analysis revision | Disproved | The column and any maintaining trigger do not exist. |
| Passing nullable expected timestamps to enqueue binds generated output to source | Disproved | All three expected values can be null and no live revision mechanism exists. |
| Name-pattern deletion will remove the live visual policies | Disproved | The four policy names contain neither `study_visuals` nor a study/visual pattern suitable for safe deterministic matching. |
| Broad name-pattern policy deletion is safe for other buckets | Disproved | Policies can express more than their names; only normalized definitions establish scope. |
| `CREATE ... IF NOT EXISTS` establishes exact compatible drift state | Disproved as a safety model | The catalogue confirms the starting state but `IF NOT EXISTS` still accepts a future same-named incompatible object. Exact assertions are required. |
| Existing `generation_jobs_status` already covers all active states | Disproved | It covers only queued/processing and would omit `cancel_requested`. |
| The existing `generation_jobs_user_doc_type` is the active-job exclusion | Disproved | It is non-unique and unqualified; it is useful history/query support, not an exclusion constraint. |
| `document_analysis` can be deterministically selected as one row per owner/document | Disproved | No `(document_id, user_id)` uniqueness exists. |
| A ledger can be backfilled from verified historical request columns | Disproved for this live baseline | Those columns do not exist. Historical rows have no catalogue-backed proof of reviewed request provenance. |
| Empty S13/S14/S25 means no relevant function authority exists | Not established | Five public functions exist outside the name filters; their definitions and grants were not returned. |
| The filtered privilege list proves all possible actors | Not established | Custom roles, membership, role attributes, column privileges, default privileges, and broader grants were not inventoried. |

## 4. Exact ordered corrections required

The following is the required design order for the next local implementation round after the residual read-only inspection. It is not execution authorization.

1. **Complete residual authority inspection.** Inventory every `public` function, overload, owner, language, `SECURITY DEFINER` flag, `search_path`/GUC configuration, source/dependencies, and EXECUTE grant; every table and column grant on the target tables; relevant default privileges; relevant custom roles, memberships, and `BYPASSRLS`/superuser attributes; and grants on `storage.objects` and the target schema. Compare normalized definitions.
2. **Freeze source identity.** Add the immutable source-snapshot table and its closed, database-computed SHA-256 contract described below. Add exact ownership/scope constraints and no browser authority. Resolve the missing analysis uniqueness with a preflight that aborts/quarantines ambiguous rows; do not delete or choose a winner silently.
3. **Assert the historical job baseline.** Fail closed unless all 13 columns, types, nullability, defaults, PK, FKs, checks, two named indexes, owner, RLS flag, policy, and direct grants equal the live catalogue recorded here. No name-only acceptance.
4. **Add job state and request-scope columns.** Add state version, lease identity/expiry/heartbeat, attempt fields, originating key/hash/classification, source snapshot ID/hash, operation/config version/hash, and constrained public diagnostics. Existing rows become `legacy_unverified`; no live row is promoted from absence of evidence.
5. **Replace only the exact status constraint.** Extend it with `cancel_requested`; preserve/assert the exact five-value job-type constraint. Add state/timestamp/lease/attempt/diagnostic/source-scope checks.
6. **Normalize job indexes and key constraints.** Preserve `generation_jobs_user_doc_type`; replace or retire the obsolete `generation_jobs_status` only after creating the reviewed active polling index; add a partial unique active-job exclusion covering queued, processing, and cancel-requested; add a unique composite job identity for ledger scope. Preflight duplicate active jobs and quarantine/abort under D10.
7. **Create `generation_job_requests`.** Create the ledger after job scope is structurally available. Bind `(job_id, user_id, document_id, job_type)` through a composite foreign key to the exact job, use `ON DELETE RESTRICT`, enforce unique `(user_id, request_idempotency_key)`, request-key/hash/operation/source checks, immutable accepted scope, timestamps, and useful job/retention indexes.
8. **Perform a zero-row verified backfill.** Because the live baseline has no reviewed request columns, assert that no `client_verified` historical row is eligible. Do not use `ON CONFLICT DO NOTHING` to hide disagreement. All baseline jobs remain `legacy_unverified`; any unexpected drift aborts or is quarantined.
9. **Install exact deferred invariants.** Require every client-verified job to have the originating ledger row matching user, key, payload/operation hash, document, job type, source snapshot/hash, and config version/hash. Prevent ledger mutation/deletion from invalidating a verified job. Keep deletion blocked by `RESTRICT` until D8–D10 gates are complete.
10. **Remove client job-table authority.** Drop the exact `Users see own jobs` policy, revoke direct table/column privileges from PUBLIC/anon/authenticated, and expose only narrow authenticated enqueue/cancel/safe-read RPCs. Reconcile any additional callable authority found by the residual inspection before grants are opened.
11. **Install worker functions and grants.** Create CAS/lease functions with explicit `search_path`, closed parameters, least authority, and exact postcondition checks. The temporary service/secret role remains local/test-only; D3 blocks its production acceptance.
12. **Lock down `study_visuals` publication.** Assert/preserve the six columns, PK, cascading FKs, and exact unique constraint. Drop `study_visuals_owner_all`, revoke direct browser-role table access, and make the manifest worker/server authoritative. A narrow owner-safe API may return only a closed DTO and signed access, never storage paths or raw manifest internals.
13. **Reconcile the `study-visuals` bucket and policies exactly.** Follow the ordered Storage plan below. Do not touch any `study-documents` or `recordings` policy.
14. **Grant authenticated enqueue last.** Keep application enqueueing disabled for the whole maintenance operation. Open the narrow enqueue grant only after source, ledger, jobs, publication, Storage, ACL, RLS, function, and normalized-catalogue postconditions all pass.
15. **Validate both paths.** After another static review and separate George approval, prove a representative live upgrade and a fresh project built from the D11 versioned manifest produce the same normalized final catalogue. `beta_foundation_v1.sql` remains byte-for-byte immutable.

## 5. Source revision architecture recommendation

### Options compared

| Option | Strength | Material weakness |
|---|---|---|
| Monotonically updated revision/version columns | Cheap equality checks; clear ordering if every write increments atomically | Misses writes that bypass the increment; identifies a change but does not preserve the original content; cannot stop a worker rereading changed rows during a provider call. |
| Database-triggered `updated_at` | Automatically covers ordinary database updates | Timestamp is not content identity; precision/order semantics are weaker than a revision; trigger coverage and future bypass remain correctness dependencies; original content is still unavailable. |
| Cryptographic content hashes | Exact identity for a defined canonical payload; useful for idempotency | A hash without retained content forces rereads and race checks; a source change during provider work can waste cost or couple output to the wrong read unless the input itself is frozen. |
| Immutable source snapshots | Preserves the exact generation input through claim, retries, and provider work | Adds storage and retention obligations; requires a canonical schema and deliberate legal/deletion treatment. |

### Required design

Use **an immutable, database-created canonical source snapshot with a database-computed SHA-256 digest**. Hashes are part of the snapshot design, not a substitute for it. Revision and `updated_at` fields may later support UX or optimistic editing, but they must not be the generation authority.

Create a supporting table such as `generation_source_snapshots` with this contract:

- UUID primary key, `user_id`, `document_id`, snapshot schema version, creation time, and immutable status;
- the exact document title and extracted text used for generation;
- a closed JSONB object for output-relevant document metadata: at minimum `file_type`, `source_type`, `subject_id`, and `source_recording_id` where those values affect selection, prompting, or provenance; exclude mutable access locators such as `file_path` unless their content is itself a defined generation input;
- the selected `document_analysis.id` and a closed canonical copy of every analysis field used by prompting/selection, including analysis model/provenance;
- a server-owned operation/config descriptor containing prompt/template version, actual text/image model identifiers, limits, truncation/selection rules, response schema version, and generation parameters;
- a SHA-256 digest computed in the database from a versioned canonical JSONB envelope containing all the above;
- no UPDATE/DELETE authority for browser roles and no permissive RLS policy; trusted functions create/read it;
- retention/deletion initially protected by `RESTRICT` and the D8–D10 legal/recovery gates.

The authenticated enqueue function must derive `auth.uid()`, reject a null/mismatched document owner, verify document ownership, choose exactly one compatible analysis row, create the snapshot, compute its digest, and bind snapshot ID/hash plus config identity into both the job and ledger in the same transaction. Snapshot construction must use one `INSERT ... SELECT`-style statement over the document and selected analysis, or an equivalently reviewed repeatable-read/locking design. A multi-statement function at ordinary read-committed isolation can observe different committed source versions between statements and is not sufficient. The client must not provide authoritative revision timestamps, source payload, user ID, or content hash.

The worker claim/context function must return the immutable snapshot payload. The worker must never reread current `documents` or `document_analysis` as generation input.

This yields the required race behavior:

- **Title, extracted text, metadata, or analysis changes before enqueue:** the new values are captured and produce a new source digest.
- **Changes after enqueue but before claim:** the job still uses its original snapshot; current rows do not alter the accepted request.
- **Changes during provider generation:** the provider input is already frozen; completion is still governed by job/lease/version CAS and the bound snapshot.
- **Retry of the same request key:** it resolves to the same ledger entry, job, snapshot, and operation hash; it does not silently adopt changed content.
- **Intentional regeneration:** after the earlier request is terminal, the client supplies a new request key; the server captures a new current snapshot and hash. Under D2, a new key while equivalent work is active binds to/returns the existing active job explicitly rather than replacing it.

Before enforcing one analysis per `(document_id, user_id)`, run an approved aggregate/identifier-only duplicate preflight. Ambiguous duplicates must be quarantined or abort the migration under D10. They must not be deleted, merged, or silently selected.

## 6. Storage reconciliation plan

The current migration's policy-name pattern is not acceptable. The live names are known and must be reconciled exactly.

1. Assert that the exact `study-visuals` bucket exists and currently has the inventoried definition. Abort on a duplicate identity, unexpected visibility, or unexpected policy that can apply to the bucket.
2. Record normalized fingerprints for all eleven returned `storage.objects` policies.
3. Set only the `study-visuals` bucket to `public=false`. Do not update any other bucket.
4. Drop exactly these four policies on `storage.objects`, after asserting their roles, commands, permissiveness, and expressions:
   - `For full customization 137qt67_0`
   - `For full customization 137qt67_1`
   - `For full customization 137qt67_2`
   - `For full customization 137qt67_3`
5. Do not drop, replace, rename, or alter the three `study-documents` policies or four `recordings` policies returned by S19.
6. Create explicit restrictive fail-closed policies for `authenticated` and `anon` that deny operations when `bucket_id='study-visuals'` while remaining neutral for other bucket rows. Their names and normalized definitions must be fixed in the schema contract. Do not rely on a permissive `false` policy or name matching.
7. Revoke or reconcile any direct grant/custom-role path revealed by the residual authority inspection. The final browser matrix for `study-visuals` is no direct SELECT/list/download, INSERT, UPDATE/upsert, or DELETE for anonymous, authenticated owner, or authenticated non-owner.
8. Preserve trusted server upload with immutable, owner-scoped versioned paths and `upsert=false`. A stale/lost worker may leave an unreferenced object, but it remains private and cannot become the published manifest without CAS.
9. Mint five-minute signed URLs only in trusted server code after owner authorization and exact bucket/path-prefix validation. Return a closed public DTO; never return the raw path, privileged key, public URL, or unrestricted manifest.
10. Prove postconditions in the same maintenance gate: bucket private; exact four legacy policies absent; exact new restrictive policies present; no permissive policy applies to `study-visuals`; `storage.objects` RLS remains enabled; the seven unrelated policy fingerprints are unchanged; browser roles are denied all direct operations; trusted upload/sign behavior works only through the approved server boundary.

The current bucket has no file-size or MIME allowlist. The final Storage contract must add reviewed bounds or enforce equivalent closed server validation before production. No legacy object deletion is authorized.

## 7. Drift-safe object handling plan

| Live object | Action | Drift-safe rule |
|---|---|---|
| `generation_jobs` 13 columns | Assert then supplement | Abort unless exact types, defaults, and nullability match; add columns only after confirming absence, never accept incompatible same names. |
| `generation_jobs_pkey` | Preserve | Assert exact PK on `id`. |
| User/document job FKs | Preserve initially | Assert exact targets and cascades; any deletion redesign remains gated by D8–D10. |
| `generation_jobs_status_check` | Replace | Assert exact current five-state form, then replace with reviewed six-state form including `cancel_requested`. |
| `generation_jobs_type_check` | Preserve | Assert the exact five job types. |
| `generation_jobs_status` | Replace/retire | It is not a unique guard and misses cancel-requested; create reviewed active polling support and remove redundancy deliberately. |
| `generation_jobs_user_doc_type` | Preserve | It supports full-history scope queries; add a separate partial unique active exclusion. |
| `Users see own jobs` | Remove | Assert exact definition, drop it, revoke direct browser ACLs, and prove no replacement base-table policy exposes jobs. |
| Broad job ACLs | Revoke/reconcile | Revoke browser roles; reconcile service/custom authority after full role/function inspection. |
| `generation_job_requests` | Create | Closed schema, composite job scope, `RESTRICT`, RLS, ACL denial, immutable ledger semantics, no hidden conflicts. |
| `study_visuals` six columns | Preserve and supplement | Assert exact shape/defaults; add only reviewed authority/publication metadata if required. |
| `study_visuals_pkey` | Preserve | Assert exact PK. |
| `study_visuals_document_id_user_id_key` | Preserve | Required by atomic publication; assert exact order and uniqueness before function creation. |
| `study_visuals` cascading FKs | Preserve for this phase | Any delete-policy change is a separate D8–D10 decision. |
| `study_visuals_owner_all` and broad ACLs | Remove/revoke | Manifests become trusted worker/server state; owner consumption goes through a closed authorized read/sign boundary. |
| `documents` duplicate owner policies | Leave untouched now | They are redundant drift and should be normalized in a separate forward migration after a full app-wide RLS review; changing them is unnecessary to establish the job/visual contract and increases blast radius. |
| `document_analysis.owner_all` | Leave direct product behavior unchanged for this phase | Snapshot creation performs its own exact owner/scope check. A broader analysis authority review is separate. |
| `document_analysis` missing uniqueness | Supplement only after preflight | Abort/quarantine ambiguous duplicates under D10; do not use destructive winner selection. |
| `study-visuals` bucket/policies | Exact reconciliation | Target the bucket and four exact policy definitions only; prove unrelated policy fingerprints unchanged. |

The duplicated document SELECT, INSERT, and DELETE policies are relevant evidence of schema drift, but their predicates are semantically equivalent and they are not the cause of the Phase 1–2 job/visual authority defect. They should be recorded for a separate forward RLS-normalization migration, not folded into this corrective migration. The single document UPDATE policy should likewise be left untouched here. No existing migration may be edited.

## 8. `generation_job_requests` creation and backfill assessment

The ledger must be created only after the job table has its authoritative request/source/config columns and an exact composite unique key usable by the ledger FK. Recommended ledger fields are:

- UUID `id` primary key;
- derived `user_id`, request key, request/operation hash, `document_id`, `job_type`, source snapshot ID/hash, config/schema version/hash, resolved `job_id`, accepted-resolution classification, and timestamps;
- unique `(user_id, request_idempotency_key)` so identical bare UUID keys remain independent across users;
- a composite FK from `(job_id, user_id, document_id, job_type)` to the same composite job identity, with `ON DELETE RESTRICT`;
- an FK to `auth.users` whose eventual deletion semantics remain gated by D8–D10; do not introduce an unreviewed cascade that defeats ledger/job retention;
- format, length, non-null, hash, scope, and classification checks;
- an index on `job_id` and later retention/age support when D8 is activated;
- RLS enabled, no permissive browser policy, and all direct PUBLIC/anon/authenticated privileges revoked.

The deferred binding invariant must match the **originating** ledger row, not merely any ledger row pointing to the job. It must compare user, key, request/operation hash, document, job type, snapshot ID/hash, and config identity. A complementary invariant must prevent mutation/deletion of that row from leaving a `client_verified` job falsely verified.

The actual baseline permits no trustworthy verified backfill: the ledger and request/source columns are absent. The migration must therefore classify every historical row as `legacy_unverified` and assert that the verified backfill inserts zero rows. `ON CONFLICT DO NOTHING` is prohibited for reconciliation because it can conceal conflicting historical scope. Any unexpected pre-existing object or drift column discovered at execution must abort or enter a separately reviewed quarantine path.

Durable idempotency and active-job exclusion remain independent:

- the ledger answers “what did this user's request key resolve to?” for all job states;
- the partial unique job index answers “is another active job allowed for this user/document/type?”;
- multiple accepted keys may durably bind to one active job under D2, but each row must preserve its submitted authoritative scope and explicit `already_in_progress` resolution;
- terminal jobs never remain in the active unique predicate; a new key can intentionally create a new snapshot/job;
- replaying the old key after terminal completion still returns its original bound job and cannot silently regenerate current content.

## 9. Empty catalogue sections

| Section | Why it returned no rows | Interpretation |
|---|---|---|
| S13 — function catalogue | Filtered only the thirteen proposed job-function names and omitted at least the migration's `fn_request_job_cancel` name | The returned list proves absence only for its exact names. It does **not** prove that every migration-conflicting function is absent or that no relevant function exists, because S26 reports five public routines. Additional read-only inspection is required. |
| S14 — function execute grants | Used the same proposed-name filter | No grant row exists for an absent proposed function. It does **not** inventory grants on the five live public functions. Additional read-only inspection is required. |
| S15 — views | Filtered three proposed job-view names | Those views do not exist. S26 reports `public_view_count=0`, so no additional inspection is required for public views. |
| S16 — enum types | Filtered the relevant job/request/visual enum names | Those enum types do not exist. The live columns/checks confirm text-based status/type. No additional inspection is required for this design. |
| S23 — sequences | Enumerated all public sequences without a name filter | No public sequence exists. UUID defaults explain why none is required. No additional inspection is required. |
| S25 — function source | Filtered twelve proposed job-function names | Those exact source bodies do not exist. It does **not** show the source/dependencies of the five live public functions. Additional read-only inspection is required. |

Related absence conclusions:

- S1/S21 conclusively establish that `generation_job_requests` does not exist.
- S3's broad revision-name filter plus the complete S2 column inventory establish that only `created_at` is present on each source table and that the named update/revision/hash fields do not exist.
- S9/S9b establish that no revision-maintenance trigger exists on either source table; only the document subject-ownership trigger was returned.

## 10. Residual read-only inspection required

One further separately approved catalogue-only inspection is required. It must not select student/application rows or Storage objects. It should return:

1. all five `public` functions, all overloads and identities, owners, languages, volatility/leakproof/security-definer settings, `proconfig`/effective search path, full catalogue source, object dependencies, and EXECUTE grants to every grantee;
2. all table and column privileges—not a five-role allowlist—on `documents`, `document_analysis`, `generation_jobs`, `study_visuals`, and `storage.objects`;
3. relevant schema privileges, default privileges, custom roles, role memberships, inheritance, login, superuser, and `BYPASSRLS` attributes that can reach those objects;
4. exact owner and ACL data for future supporting objects if any same-named drift is present at the time of implementation;
5. migration-history/manifest metadata and the immutable historical migration checksum/provenance needed to decide which steps are already applied, without marking anything applied.

Separately, a production cutover will later need approved aggregate preflights for active jobs, duplicate analyses, duplicate active-job scopes, orphan/mismatched ownership, and legacy visual manifests/objects. Those are not necessary to finish the catalogue architecture, but they are mandatory before live execution. They must follow D10's quarantine-first rule and any additional data-access approval.

## 11. Round 5 correction status and gates

The ten Round 5 corrections are **not fully specified as an executable migration contract**.

- Source identity and Storage reconciliation are now architecturally and object-specifically defined.
- The live generation-job, ledger, and `study_visuals` starting states are defined sufficiently to rewrite their drift checks.
- The five uninspected public functions and unbounded role/ACL surface prevent a complete final authority postcondition.
- SQL parser evidence, executable database/Storage tests, fresh-build evidence, populated-upgrade evidence, backup/restore rehearsal, lock timing, rollback injection, and normalized final-catalogue equality remain future evidence requirements; this read-only catalogue cannot satisfy them.

Claude may **not** perform the next full migration implementation round yet because that round would still have to guess how to reconcile existing function/role authority. Claude may continue isolated application/test design that does not claim the final database authority contract only under a separate instruction; it must not edit the migration on the strength of this incomplete D11 verdict.

Disposable migration execution is **not approved**. Database and Storage test execution is **not approved** by this review. After the residual inspection, the migration must be corrected, statically parsed/reviewed, and separately authorized for a disposable environment. D3 does not block static/local design, but it still blocks accepting the full-bypass service/secret role as the final production worker authority. D8–D10 continue to block irreversible deletion.

## Required closing statements

1. **Exact live-schema facts:** recorded in Sections 1 and 9, including the source tables, 13-column job baseline, six-column `study_visuals`, ACL/RLS state, public bucket, eleven Storage policies, and extensions.
2. **Every migration assumption confirmed:** recorded in Section 2.
3. **Every migration assumption disproved:** recorded in Section 3, including absent source revision columns and unsafe policy-name matching.
4. **Exact ordered corrections required:** recorded in Section 4.
5. **Source revision architecture recommendation:** immutable database-created source snapshots plus database-computed canonical SHA-256 digests, as specified in Section 5.
6. **Storage reconciliation plan:** exact four-policy removal, private bucket, browser denial, trusted signing/upload, unrelated-policy preservation, and postcondition proof, as specified in Section 6.
7. **Drift-safe object handling plan:** recorded in Section 7.
8. **Whether the ten Round 5 corrections are fully specified:** **No.** The residual function/role/ACL catalogue gap prevents final authority reconciliation; execution evidence also remains outstanding.
9. **Whether Claude may perform another local implementation round:** **No full database migration round yet.** Complete the residual read-only authority inspection first.
10. **Whether additional read-only inspection is required:** **Yes**, limited to the catalogue metadata in Section 10; no student rows or Storage objects are requested.
11. **Whether disposable migration execution is approved:** **No.**
12. **Whether database/Storage tests are approved:** **No.** Static test implementation may be reviewed later; execution requires a corrected candidate and separate approval.
13. **Confirmation that no implementation or environment change occurred:** This review created only this Markdown file. It did not modify implementation, migration, or test files; access Supabase or Storage; execute SQL; stage, commit, push, merge, or deploy.
14. **Git status:** to be reported from the repository after file creation; all pre-existing working-tree changes remain untouched.
