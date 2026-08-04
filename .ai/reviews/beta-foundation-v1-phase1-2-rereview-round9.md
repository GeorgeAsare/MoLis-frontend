# Beta Foundation V1 Phases 1–2 — Round 9 Database Architect Re-review

**Date:** 2026-08-02  
**Reviewer:** MoLis Database Architect (Codex)  
**Review type:** Static working-tree implementation re-review with local non-database verification  
**Controlling source:** Round 8 review, with Round 6–7, final D11 reconciliation, D11 catalogue evidence, founder decisions D1–D13 and the two migration manifests as supporting evidence

## Executive verdict

**APPROVE WITH REQUIRED LOCAL CORRECTIONS**

Round 9 makes useful progress. The SHA helper is now strict, runtime-private and explicit about UTF-8; timestamps are rendered in UTC; analysis scope uniqueness has been introduced; the database RPC now enforces the closed v1 input object; P0007 has been replaced by a structured `retry_required` result; a polling generation token was added; deprecated direct-table job actions are hard-disabled; and the machine-readable manifest now has the correct checksums and evidence wording.

The candidate is not eligible for disposable migration validation. The current SQL has a deterministic dependency-order failure: it creates `study_visuals_source_snapshot_fk` before `generation_source_snapshots` exists. The migration therefore cannot complete as written. The canonical source/request byte contract is also still not frozen or proven by database canonical-envelope known-answer vectors. Analysis uniqueness remains weaker than the document ownership model, publication provenance is not declaratively bound as one scope tuple, fail-fast/ACL/Storage proof remains incomplete, and the heartbeat guard contains a new reliability defect that stops all later heartbeats after the first successful renewal.

This verdict authorises another local correction round only. It does not authorise SQL parsing/execution, migration application, Supabase or Storage access, Group B execution, disposable-environment validation, staging, production, commit, push, merge or deployment.

## Evidence boundary and independently verified facts

I inspected the complete current working-tree diff and all files named in the Round 9 brief. I did not execute SQL, access Supabase or Storage, run Group B, Playwright or browser tests, or perform any Git mutation.

Independent local evidence:

- `npm test -- --run`: **9 files passed; 189 tests passed; 49 skipped; 0 failed**.
- `npx tsc --noEmit`: **passed**.
- `npm run lint`: **passed with 0 errors and 4 warnings**, all unused parameters in hard-disabled compatibility stubs at `src/app/actions/generationJobs.ts:294-305`.
- `npm run build`: **not reproduced**. Next.js 16.2.6/Turbopack stopped because this restricted environment could not fetch Geist and Geist Mono from Google Fonts. This is not evidence of an application-code defect, but Claude's build-pass report remains uncorroborated by this review.
- `git diff --check`: **passed**.
- Historical migration SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`.
- Corrective migration SHA-256: `a14897600ffb765b54441b396d3f34639d867f298d7bcba83268f8ca5b9ca095`.
- Branch: `feature/remediate-beta-foundation-v1`.
- `HEAD` remains rejected commit `7a2029fa2dfda82bd8727bbf1ec6069083391d16`; `main` and `origin/main` remain `7f723138e0e7d522aa7ba2428ba07513ecf9ec62`.
- The implementation remains uncommitted.

## Critical findings

### R9-C01 — The corrective migration references the snapshot table before creating it

**Evidence:** The migration adds `study_visuals_source_snapshot_fk` referencing `public.generation_source_snapshots (id)` at `migrations/20260729120001_generation_job_state_machine_schema.sql:1033-1037`. The referenced table is not created until `:1043`. PostgreSQL requires the referenced relation to exist when `ALTER TABLE ... ADD CONSTRAINT ... REFERENCES` executes.

**Assessment:** This is a deterministic migration-order defect, not an untested edge case. Transaction rollback would restore the pre-migration state, but the candidate cannot successfully apply. The passing static tests only search for provenance names and never validate object dependency order (`src/lib/jobs/__tests__/workerScenarios.test.ts:1320-1330`).

**Required correction:** Create `generation_source_snapshots` and its referenced keys before adding any FK to it. Add dependency-order static checks and, after all static gates pass, obtain separately approved parser/disposable execution evidence. Keep all changes in this still-unapplied migration; do not modify `beta_foundation_v1.sql`.

### R9-C02 — The canonical source/request byte contract remains only partially specified and tested

**Round 8 predecessor:** R8-C01 — **PARTIALLY RESOLVED**.

**Confirmed corrections:** The preflight requires UTF-8 (`migration:153-160`). `fn_sha256_hex` is `STRICT`, hashes `pg_catalog.convert_to(p_input,'UTF8')`, calls `extensions.digest` and `pg_catalog.encode` by exact schema, and has a trusted search path (`:2766-2792`). Document and analysis timestamps are explicitly formatted in UTC rather than implicitly cast (`:3048-3072`). Fixed SHA-256 results for empty text and `hello` are embedded rather than recomputed by the helper (`:2794-2819`).

**Remaining defect:** Those KAVs prove the SHA primitive only. They do not freeze or test the exact source-envelope or request-envelope bytes. Both authoritative envelopes still rely on `jsonb_build_object(...)::text` (`:3056-3074`, `:3090-3099`), while the Node fixtures explicitly use a different serialization and state that their bytes differ from PostgreSQL (`src/lib/jobs/idempotencyKey.ts:71-85`; `src/lib/jobs/__tests__/workerScenarios.test.ts:1341-1356`). No PostgreSQL-executed fixture asserts an exact full canonical source string, exact request string and fixed expected hashes.

The current implementation is independent of session `TimeZone`, `DateStyle` and implicit timestamp casts because it uses `AT TIME ZONE 'UTC'` plus a numeric `to_char` mask. Its current value set is not affected by `extra_float_digits`; `jsonb` object order is independent of caller insertion order; UUIDs are explicit text; arrays retain order; top-level keys are always present; and JSONB distinguishes null from a missing nested key. `lc_numeric`, `lc_collate` and `lc_ctype` are not used explicitly, but their non-effect is claimed rather than proven by KAVs under changed settings. The contract also does not declare/test that:

- CRLF and LF remain different byte sequences;
- Unicode is preserved exactly and NFC/NFD-equivalent text hashes differently unless normalized before storage;
- empty text is distinct from null;
- booleans, integers and decimals use the exact PostgreSQL JSONB textual representation;
- nested missing keys and explicit null are intentionally distinct;
- a PostgreSQL major-version serialization change requires a new schema version and drained active jobs.

`pg_catalog.convert_to(p_input,'UTF8')` and explicit UTC formatting are sufficient for their narrow purposes, but they are not sufficient for the complete canonicalisation contract. The source/request schema versions and model/generation configuration are bound (`:3057`, `:3078-3088`, `:3091-3097`), but the exact serialized bytes are not frozen by fixtures.

**Required correction:** Define the database-authoritative v1 canonical text/byte grammar, store or expose the exact canonical text used, document the exact newline/Unicode/numeric/null/missing rules, and execute fixed full-envelope KAVs in PostgreSQL under deliberately varied session settings. Expected byte strings and hashes must be literal fixtures, not produced by the implementation under test. Node-only hashes must remain explicitly non-authoritative or be removed.

## High findings

### R9-H01 — Analysis ambiguity is reduced, but ownership and global one-analysis-per-document are not declaratively closed

**Round 8 predecessor:** R8-C02 — **PARTIALLY RESOLVED**.

The migration preflights duplicate `(user_id,document_id)` groups before mutation and fails without deleting or selecting a winner (`migration:366-375`). It adds `UNIQUE(document_id,user_id)` before enqueue is granted (`:996-1004`). The enqueue source read is one statement, has no `LIMIT 1`, has no separate count/select authority, locks the owned document row, and uses the selected variables for both hash and snapshot (`:2977-3074`, `:3183-3198`). A concurrent insert cannot create two rows in the same declared scope once that constraint exists.

However, the actual ownership contract is one globally unique document ID with one owner. `UNIQUE(document_id,user_id)` still permits two analysis rows for one document under different `user_id` values, and `document_analysis` receives no composite FK `(document_id,user_id) -> documents(id,user_id)`. The snapshot's separate document and analysis composite FKs prevent an accepted snapshot from combining different scopes (`:1114-1122`), but they do not prevent the source table itself from containing a cross-owner analysis row. The current D10 duplicate preflight also groups by both columns and would not flag this divergence.

**Required correction:** Before mutation, fail closed on duplicate `document_id` values and on any analysis row whose `(document_id,user_id)` does not match `documents(id,user_id)`. Add the composite ownership FK. Given the current one-analysis-row application contract (`maybeSingle()`), `UNIQUE(document_id)` is the clearer declarative rule; if product policy later permits analysis versions, introduce an explicit immutable version/current-row model rather than encoding versions as owner divergence.

### R9-H02 — `study_visuals` provenance is neither executable nor a single declaratively enforced scope tuple

**Round 8 predecessor:** R8-H02 — **PARTIALLY RESOLVED**.

The four nullable provenance columns are added and `fn_complete_and_publish_job` populates/updates all four in the same transaction as the job CAS, manifest and usage row (`migration:1007-1041`, `:2295-2345`). Public DTOs omit them (`src/types/studyVisual.ts:31-50`; `migration:1627-1691`). Nullable columns preserve pre-contract rows without pretending that they are verified.

The implementation remains incomplete even after correcting R9-C01:

- the job and snapshot FKs are independent single-column references (`migration:1027-1037`), so they do not prove matching `user_id`, `document_id`, snapshot, request hash and attempt;
- there is no all-null-or-all-present check separating legacy rows from verified publications;
- `publication_attempt` has no positive/range constraint and no FK to the matching `generation_job_usage.attempt_count`;
- `source_request_hash` has only a format check, not an equality binding to the job/usage tuple;
- retry overwrite correctness relies on the function and ACLs rather than a composite provenance constraint.

`generation_request_id` need not be duplicated if `source_job_id` is bound by one composite FK to the exact verified job tuple and that job's deferred `originating_request_id` remains bound to the ledger. The current simple `source_job_id` FK does not provide that proof.

**Required correction:** After the snapshot/job/usage referenced keys exist, add a legacy-or-verified coherence check and a composite FK from `study_visuals(source_job_id,user_id,document_id,source_snapshot_id,source_request_hash,publication_attempt)` to an exact immutable job/publication-usage tuple. Keep legacy rows all-null; make new publications all-non-null. Preserve public DTO omission.

### R9-H03 — Heartbeat renewal regressed and recovery remains operationally incomplete

**Round 8 predecessor:** R8-H04 — **REGRESSED**.

The new `heartbeatInFlight` guard prevents overlap only until the first successful heartbeat. At `src/app/api/jobs/visuals/route.ts:98`, the flag becomes true; the renewed branch returns at `:102-105`; the reset at `:146` is therefore skipped. Every later interval exits at `:97`, so a long provider operation stops renewing after one success and eventually loses its lease.

SQL and TypeScript agree on `cancel_requested`, `terminal`, generic `authority_lost`, `job_not_processing` and `transient_failure` (`migration:1928-1957`; `src/lib/jobs/workerClient.ts:23-35,157-169`). They still do not expose a distinct `attempt_superseded` result: version mismatch is folded into `authority_lost` (`migration:1945-1950`). Retry exhaustion aborts the worker without making the row terminal (`visuals/route.ts:135-145`); it relies on stale recovery. `recoverStaleJobs` remains only a callable wrapper with no durable runner (`workerClient.ts:325-344`). A failed `failJob` or cancellation acknowledgement can likewise wait indefinitely without that actor.

**Required correction:** Reset the in-flight flag in `finally`; add real timer tests for success, slow calls, transient retry and cancellation; distinguish attempt supersession from other authority loss; define deterministic alerting for database exceptions; and provide an approved local/test recovery invocation that meets the two-minute D13 reconciliation target. D3 still blocks final provider-specific production worker/recovery deployment.

### R9-H04 — Mutation-free D11 preflight remains incomplete

**Round 8 predecessor:** R8-H01 — **UNRESOLVED**.

The first mutation is still `ALTER DEFAULT PRIVILEGES` at `migration:590`. Before it, Round 9 now checks exact target-table column signatures, per-privilege starting table authority, selected constraints/indexes/policies, proposed-object absence, duplicate active/analysis scopes and the exact eleven Storage policies (`:135-432`). This is meaningful improvement.

It still does not reject every reasonably knowable incompatibility before the first mutation:

- `documents` and `document_analysis` source columns are checked only for name/type, not nullability, defaults, identity/generated state or full relevant shape (`:223-253`);
- all PK/FK/check constraints, delete actions and index definitions on documents, analysis, generation jobs and study visuals are not fingerprinted (`:255-276`);
- existing routine checks do not compare exact signatures, `pg_get_functiondef`, `proconfig`, dependencies or EXECUTE ACLs (`:346-364`);
- exact table/column/schema/function/type ACL rows and grant options are not compared;
- default ACLs are mutated without an exact before-state assertion or after-state postcondition;
- analysis ownership divergence and duplicate `document_id` are not checked;
- key/hash/classification data checks remain after columns and earlier mutations (`:727-785`), even though equivalent baseline facts can be checked before adding columns;
- new functions, triggers and post-mutation constraint definitions are not all exact-fingerprinted before later authority grants.

Transaction rollback remains a recovery boundary, not compliance with the required fail-before-first-mutation design.

### R9-H05 — ACL intent is substantially right, but exact reconciliation proof is incomplete

**Round 8 predecessor:** R8-H05 — **PARTIALLY RESOLVED**.

The positive baseline table-privilege check now tests privileges individually (`migration:291-305`). Runtime table ACLs are revoked, worker/authenticated function allowlists are separated, `fn_sha256_hex` is unavailable to PUBLIC/anon/authenticated/service_role, and function owner/security mode is checked (`:3296-3425`). The comma-list helper at `:3364-3366` is used as a negative “does any prohibited privilege remain?” check, for which ANY semantics are appropriate.

The Storage positive check still uses `has_table_privilege('service_role', ..., 'SELECT,INSERT,UPDATE,DELETE')` as though it proves all four privileges (`:1423-1429`); it proves only at least one. Function postconditions accept any `search_path=` value rather than the expected exact path (`:3390-3396`). Effective-privilege checks do not enumerate unexpected grantees, ACL grant options or exact owner ACL identity. Default ACL postconditions are absent. Sequence absence is checked, but schema/column/type privileges relevant to Data API visibility are not fully reconciled.

**Required correction:** Test every required positive privilege individually, compare exact normalized ACL entries and grant options, assert exact search paths by function signature, and assert default ACLs after mutation. Preserve unrelated Supabase-managed authority and D3's temporary service-role limitation.

### R9-H06 — Storage policy scope is exact, but the complete private-object contract is still open

**Round 8 predecessor:** R8-H06 — **PARTIALLY RESOLVED**.

The migration requires the exact D11 policy baseline, changes only the `study-visuals` bucket to private, drops only the four exact approved policy names, creates two role-specific restrictive policies, fingerprints the nine-policy post-state, and leaves study-documents/recordings policies untouched (`migration:384-430`, `:827-838`, `:1328-1421`). Authenticated and anon direct object access is denied; service-side upload and signed URL generation remain (`src/lib/jobs/visualsWorker.ts:223-240`; `src/app/api/visuals/[documentId]/route.ts:65-124`). Lost-race paths remain private and unreferenced.

The bucket still has no `allowed_mime_types` or `file_size_limit` reconciliation, and the worker buffers provider/download output without a byte ceiling before upload (`visualsWorker.ts:186-230`). The service authority assertion has the ANY-semantics defect described in R9-H05. Executable proof of anon/authenticated denial, service upload and owner-only signed retrieval does not exist.

### R9-H07 — D13 polling gained generation isolation but still lacks behavioural proof

**Round 8 predecessor:** R8-H07 — **PARTIALLY RESOLVED**.

`VisualsPanel` now captures a monotonically increasing generation and checks it after each await (`src/components/study/VisualsPanel.tsx:64-68,126-176`). It retains the 2/5/10/30-second base sequence, jitter, one-in-flight guard, abort controller, independent hidden/offline state, terminal stop, document reset and cleanup (`:26-34,53-100,117-202,214-279`).

No test renders `VisualsPanel` or uses fake timers. Vitest remains `environment: 'node'` (`vitest.config.ts:11-18`), and repository search found no `useFakeTimers`, visibility/offline or stale-response component test. The 189-pass suite therefore does not prove timing, pause/resume, unmount or cross-document race behaviour. `stopPolling` also does not itself increment the generation (`VisualsPanel.tsx:79-93`); current `startPolling` increments immediately after it, but a future stop without a new start relies only on abort semantics.

### R9-H08 — Database, RLS, ACL, concurrency and Storage tests remain specifications, not evidence

**Round 8 predecessor:** R8-H08 — **UNRESOLVED**.

The 189 passing tests classify as:

| Category | Count | What they prove |
|---|---:|---|
| Semantic unit tests | 144 | Pure TypeScript/application helpers and locally modelled invariants; no PostgreSQL execution. |
| Mocked/configuration tests | 5 | Service-client key selection and failure behaviour under mocked/local environment variables. |
| Static SQL/design string assertions | 36 | Presence/absence of constants, regexes and SQL source text; no parser or database semantics. |
| Node canonical/KAV-labelled tests | 4 | Fixed Node serialization behaviour; explicitly not PostgreSQL canonical-envelope equivalence. |

The 49 Group B tests are separate, skipped, and contain commented pseudocode rather than executable database assertions (`src/lib/jobs/__tests__/workerScenarios.test.ts:477-1117`). Several are now obsolete: they propose non-empty sanitized input despite the closed v1 schema, expect P0004 for that route, and do not cover the new provenance graph. `e2e/rls-two-user.spec.ts:57-241` contains real assertions when configured, but covers only a subset of generation-job base access and safe DTO isolation; it has not run and does not test snapshots, ledger, study visuals, ACL exactness, Storage or races.

Static scans did not detect R9-C01 or the successful-heartbeat bug. They are not proof of PostgreSQL syntax, dependency order, migration rollback, RLS, ACL, Storage, concurrency, upgrade safety or fresh-project reproducibility.

### R9-H09 — The manifest evidence is safer, but two files still make contradictory authority claims

**Round 8 predecessor:** R8-H09 — **PARTIALLY RESOLVED**.

`migrations/manifest.json` now identifies itself as machine-readable canonical, contains both actual hashes, classifies the corrective migration as locally authored/not executed, says there is no database/Storage execution evidence, and records the missing fresh-project prerequisite (`migrations/manifest.json:2-32`). It does not treat `auth.schema_migrations`, `realtime.schema_migrations` or `storage.migrations` as the MoLis ledger.

The Markdown companion says both “Authoritative human-readable manifest” and “Machine-readable canonical” on the same line (`.ai/inspection/migration-manifest.md:3`). It duplicates checksums/status manually and labels Round 9 “complete” (`:85,100`) despite this re-review finding a non-executable FK order. It is therefore not unambiguously derived/informational and can conflict again.

**Required correction:** Keep `migrations/manifest.json` as the sole source of truth. Mark the Markdown file explicitly generated/derived/non-authoritative, ideally generate its values from JSON, and remove premature review-complete claims. Neither file may claim parser, disposable, staging or production evidence.

## Medium findings

### R7-M01 — **UNRESOLVED**

Comments still say the ledger fast path has no payload check although SQL checks document/type/input (`src/app/actions/generationJobs.ts:35-38`; `migration:2942-2966`). Multiple application comments still describe a live P0007 exception after the RPC was converted to a structured outcome (`generationJobs.ts:52-60,94-98`; `src/app/api/jobs/visuals/route.ts:30-34`; `src/components/study/VisualsPanel.tsx:301-304`). On retry, every RPC error is converted to `ENQUEUE_RETRY_REQUIRED`, rather than classifying a non-race error normally (`generationJobs.ts:153-169`). SQLSTATE P0017 is still reused for document-revision conflict and invalid worker error-code/message pairs (`migration:2435-2440,3115-3128`); P0019 is reused for snapshot immutability and support-reference validation (`:1151-1161,2442-2448`).

### R7-M02 — **RESOLVED**

The database RPC now requires a JSON object and an empty object for every v1 job type (`migration:2915-2937`), matching the server action's closed schemas (`src/app/actions/generationJobs.ts:62-91`). Direct authenticated RPC callers cannot inject arbitrary v1 fields.

### R7-M03 — **RESOLVED**

Raw Storage paths remain absent from reviewed logs. Staging and signing failures emit only closed codes/booleans (`src/lib/jobs/visualsWorker.ts:207-250`; `src/app/api/visuals/[documentId]/route.ts:95-109`).

### R7-M04 — **RESOLVED**

No dead `expected_*_updated_at` columns are added. Immutable snapshots remain the intended revision evidence (`migration:645-649,962-985`).

### R8-M01 — **PARTIALLY RESOLVED**

`SourceDigestEnvelope` now includes `document_subject_id` and describes UTC/UUID forms (`src/lib/jobs/idempotencyKey.ts:43-61`). However, `GenerationJobRequest` still omits `document_id`, `job_type` and `snapshot_id` from the actual ledger contract (`src/types/generationJob.ts:48-62`), and the raw `GenerationJob` interface omits several state-machine/binding columns while describing itself as the raw row (`:15-46`). Node hash helpers remain exported despite being intentionally non-authoritative (`idempotencyKey.ts:71-85`).

### R8-M02 — **RESOLVED**

The deprecated exports remain for compatibility but are hard-disabled and perform no table operation (`src/app/actions/generationJobs.ts:283-319`). No direct generation-job table mutation remains in executable application code.

## Public P0007 and diagnostic boundary

R8-H03 is **RESOLVED**. No `ERRCODE='P0007'` remains in executable SQL. All three unresolved enqueue races return the stable internal object `{outcome:'retry_required', ...}` (`migration:3151-3163,3232-3241,3266-3276`). The server action retries exactly once with the same arguments and key, then throws `ENQUEUE_RETRY_REQUIRED`; the route returns only HTTP 503 with `JOB_ENQUEUE_RETRY_REQUIRED` (`src/app/actions/generationJobs.ts:148-178`; `src/app/api/jobs/visuals/route.ts:35-48`). Logs classify RPC errors and do not print `error.code`, `error.message`, constraint text or SQLSTATE (`generationJobs.ts:132-137,153-156`). The UI preserves the request key and shows a public sentence (`VisualsPanel.tsx:301-309,387-403`).

P0007 strings remain in comments and a defensive private classifier (`src/lib/jobs/enqueueErrors.ts:9-27`); these are not student exposure but should be removed to eliminate contract drift. Other expected enqueue validation exceptions remain directly observable to authenticated RPC callers, so their messages must stay reviewed and non-sensitive. Unexpected deferred-constraint failures have no dedicated public structured outcome and must be covered by executable negative tests before release.

## Atomic enqueue, snapshots, ledger and scope assessment

Within one `SECURITY DEFINER` function transaction, enqueue authenticates with `auth.uid`, validates key ownership/job/input, replays the ledger, reads the owned document and at-most-one declared analysis scope, constructs source/request identities, creates the snapshot, job and ledger, and returns only after the deferred graph can be satisfied (`migration:2885-3294`). The new-job nested exception block rolls back its tentative snapshot/job/ledger writes on `unique_violation`, rereads the active winner, validates digest/hash and binds the losing accepted key (`:3174-3285`).

Same-key outcomes are structurally correct:

- same key and same document/type/closed input returns the committed original binding in any status without creating a snapshot, job, ledger row or usage row (`:2942-2975`);
- same key and different document/type/input returns P0004 before writes (`:2959-2966`);
- concurrent same-key calls cannot commit two ledger bindings because `(user_id,request_idempotency_key)` is unique (`:883-908`); a loser returns `retry_required` and the bounded same-key retry can read the committed winner;
- different accepted keys may bind one active equivalent job; active exclusion and ledger idempotency remain independent (`:809-817`, `:3131-3171`, `:3216-3284`).

No incomplete ledger row can commit: request/job/snapshot FKs and the originating-request FK are deferred but exact over user, document, snapshot, hash, type and key (`:1191-1230`), and the deferred trigger rechecks the originating tuple (`:1271-1325`). The circular creation order is otherwise coherent because both tables exist before those back-reference constraints are added.

Snapshot source values are read once and the same variables feed both the digest envelope and snapshot insert (`:2983-3074`, `:3183-3198`). There is no second mutable read of title, text, metadata, subject, source recording or analysis fields. Operation configuration is server-created once and used in request hashing and the stored snapshot (`:3076-3099,3189-3197`). Snapshot/ledger/usage runtime roles have no DML ACL, and UPDATE/DELETE guards enforce append-only behaviour (`:1128-1183,1262-1269`). D8–D10 retention/deletion remains intentionally unimplemented; RESTRICT FKs preserve the evidence until a separately approved lifecycle design.

These properties remain unapproved because the migration cannot execute, canonical identity is not frozen, analysis ownership is incomplete, and no concurrency/database evidence exists.

## Visual publication assessment

`fn_complete_and_publish_job` checks the verified job/snapshot/originating ledger binding before publication (`migration:2113-2133`). It enforces job type, descriptor-bound model, array and size bounds, closed item keys/types, UUID IDs, unique IDs and paths, exact current-attempt `{user}/{document}/{job}/{attempt}/{id}.png`, PNG MIME/extension, no pending item, generated/failed consistency, at least one generated item for nonempty output, and `NO_VISUAL_TOPICS` as the only empty-result path (`:2136-2293`).

The processing-to-completed CAS requires job ID, worker ID, lease token, claim `state_version`, processing status and unexpired lease (`:2295-2314`). Only its winner writes the manifest, provenance and one-row-per-job usage evidence, all in the same transaction (`:2316-2351`). A later failure rolls back the job transition and publication. Cancel-requested can only become cancelled and performs no publication (`:2354-2373`). Stale/duplicate/wrong-token/expired workers cannot publish (`:2375-2391`). A retry cannot double-count usage because the CAS can win once and `generation_job_usage(job_id)` is unique.

The transaction is atomic and retry-idempotent in design, but the provenance tuple is not complete until R9-C01/R9-H02 are corrected and executed in a disposable database.

## Build and local-runtime assessment

Claude reported a successful 15-route build. This review could not reproduce it solely because outbound Google Fonts fetches failed; TypeScript, lint and tests did reproduce as stated.

The reported brief `next dev` start/stop is a local runtime action. It did not add or modify a tracked repository file according to the current Git status. Next build/dev maintains the ignored `.next/` cache, so it is not accurate to claim that absolutely no local environment/cache state changed. There is no repository evidence that the dev server called a page/API route, accessed live Supabase or Storage, or ran browser/integration tests; such access must not be inferred merely from starting Next. A listener check after review found no Node/Next TCP listener. No live access is claimed or approved.

## Every Round 8 finding status

| Round 8 finding | Round 9 status | Exact disposition |
|---|---|---|
| R8-C01 canonical byte contract | **PARTIALLY RESOLVED** | UTF-8, strict helper and UTC timestamp corrections exist (`migration:153-160,2766-2819,3048-3072`); full source/request bytes and PostgreSQL envelope KAVs remain absent. |
| R8-C02 analysis insertion race | **PARTIALLY RESOLVED** | Scope uniqueness removes same-owner ambiguity (`:366-375,996-1004,2977-3037`), but no global `UNIQUE(document_id)` or composite analysis-to-document ownership FK exists. |
| R8-H01 fail-fast ordering | **UNRESOLVED** | First mutation is `:590`; complete D11 definitions/ACL/default/data checks are not all before it. |
| R8-H02 durable visual provenance | **PARTIALLY RESOLVED** | Columns and atomic population exist (`:1007-1041,2316-2345`), but FK order is invalid and no composite publication tuple is enforced. |
| R8-H03 P0007 exposure | **RESOLVED** | Structured outcome in SQL and one bounded server retry (`:3151-3163,3232-3241,3266-3276`; `generationJobs.ts:148-178`). |
| R8-H04 heartbeat/recovery | **REGRESSED** | Guard was added but never clears on successful renewal (`visuals/route.ts:96-105,146`); attempt-superseded and durable recovery remain absent. |
| R8-H05 ACL proof | **PARTIALLY RESOLVED** | Positive baseline privileges are individual (`migration:291-305`); Storage positive proof, exact ACL/grant-option/search-path/default postconditions remain incomplete (`:1423-1429,3346-3432`). |
| R8-H06 Storage contract | **PARTIALLY RESOLVED** | Exact policy/private/signed-access design remains (`:1328-1429`), but MIME/size controls and executable proof remain absent. |
| R8-H07 D13 polling | **PARTIALLY RESOLVED** | Generation token added (`VisualsPanel.tsx:64-68,126-176`); behavioural fake-timer tests remain absent. |
| R8-H08 database evidence | **UNRESOLVED** | 189 local passes contain no PostgreSQL execution; 49 Group B tests remain skipped pseudocode. |
| R8-H09 manifests | **PARTIALLY RESOLVED** | JSON hash/evidence corrected (`migrations/manifest.json:2-32`); Markdown still claims both human authority and machine canonicality (`migration-manifest.md:3`). |
| R7-M01 stale docs/error codes | **UNRESOLVED** | Stale P0007/fast-path comments, retry misclassification and reused SQLSTATEs remain. |
| R7-M02 database input schema | **RESOLVED** | Database enforces an empty object for all v1 types (`migration:2915-2937`). |
| R7-M03 raw path logs | **RESOLVED** | No raw path is logged in worker/signing paths. |
| R7-M04 dead revision columns | **RESOLVED** | No dead timestamp revision columns are added. |
| R8-M01 type/comment drift | **PARTIALLY RESOLVED** | Source envelope improved; ledger/raw job types remain incomplete (`src/types/generationJob.ts:15-62`). |
| R8-M02 deprecated direct actions | **RESOLVED** | Exports hard-fail and perform no base-table DML (`generationJobs.ts:283-319`). |

## New Round 9 issues

1. **R9-C01:** foreign key to `generation_source_snapshots` precedes creation of the referenced table.
2. **R9-H03 regression:** first successful heartbeat leaves `heartbeatInFlight=true`, disabling all later renewal.
3. `study_visuals` provenance fields can be partially null or mutually inconsistent because no composite/coherence FK exists.
4. `document_analysis` can still contain the same document under a different `user_id`; the current preflight/unique rule does not detect that ownership divergence.
5. The sole-machine-authority manifest intent is contradicted by the Markdown “Authoritative human-readable” label.
6. The new passing static tests assert object names, not dependency order, composite provenance, heartbeat control flow or canonical full-envelope bytes.

## Exact ordered corrections still required

1. Keep enqueue disabled and do not parse or execute this candidate. Preserve the historical migration and both D11 evidence files.
2. Reorder SQL so every referenced table/key exists before each FK. Add a static dependency-order assertion for the snapshot provenance FK.
3. Before mutation, add D10 fail-closed checks for duplicate analysis `document_id` and `(document_id,user_id)` ownership mismatch. Add `UNIQUE(document_id)` and `(document_id,user_id) -> documents(id,user_id)` unless George explicitly changes the one-analysis-per-document product model.
4. Complete one mutation-free preflight before `ALTER DEFAULT PRIVILEGES`: exact relevant column properties; PK/FK/check/index/delete definitions; routine signatures/definitions/config/dependencies; trigger and policy fingerprints; ACL/default-ACL/grant-option facts; and all compatible-data checks.
5. Freeze and version the full database canonical byte grammar. Add literal PostgreSQL full source/request byte fixtures and fixed expected hashes under varied session settings, including null/empty, boolean/integer/decimal, UUID, arrays/objects, CRLF/LF and Unicode NFC/NFD cases.
6. Replace simple `study_visuals` provenance FKs with an all-null legacy/all-present verified constraint and one composite binding through job/snapshot/hash/attempt/usage. Keep provenance out of public DTOs.
7. Put heartbeat guard reset in `finally`, add `attempt_superseded`, test success/slow/transient/cancel paths with fake timers, and define a local/test stale-recovery actor plus alert/failure-of-failure behaviour.
8. Finish exact ACL/default-ACL postconditions. Test each required Storage service privilege individually and enumerate prohibited grants/grant options/unexpected grantees.
9. Add approved `study-visuals` MIME/size limits and a bounded provider-download/upload byte check while preserving exact policy scope and private signed access.
10. Add real `VisualsPanel` behavioural tests with a DOM environment and fake timers for exact delays/jitter, one-in-flight, hidden/offline combinations, resume, job/document change, stale response, terminal stop and unmount.
11. Make `migrations/manifest.json` the only authority; mark the Markdown companion derived/non-authoritative and remove premature completion claims.
12. Remove stale P0007/fast-path comments, classify non-race retry errors normally, assign distinct internal SQLSTATEs, and align raw/ledger types with the actual schema.
13. Replace Group B pseudocode with executable synthetic fixtures/assertions, but do not run them until the corrected static candidate is re-reviewed and George grants exact D12 disposable-environment authority.

## Required end-state determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** R9-C01 invalid FK dependency order; R9-C02 canonical source/request bytes remain unfrozen and unproven.
3. **High findings:** incomplete analysis ownership rule; incomplete/non-executable visual provenance; heartbeat regression and absent recovery actor; incomplete fail-fast preflight; incomplete exact ACL proof; incomplete MIME/size Storage contract; no D13 behavioural tests; no database evidence; manifest authority contradiction.
4. **Medium findings:** stale comments/error classification/reused SQLSTATEs; type drift. Database v1 input closure, raw path logging, dead revision columns and deprecated direct actions are resolved.
5. **Confirmed corrections:** strict/private UTF-8 SHA helper; UTC timestamps; same-scope analysis uniqueness; structured P0007 replacement; database closed input; polling generation token; atomic manifest/usage transaction; hard-disabled direct actions; corrected machine manifest hashes/evidence.
6. **Every Round 8 finding status:** recorded in the table above with exactly one status each.
7. **New Round 9 issues:** listed in “New Round 9 issues.”
8. **Exact ordered corrections still required:** the thirteen-step sequence above.
9. **Whether canonical hashing is fully deterministic:** **No.** Helper bytes and UTC timestamps are fixed, but complete source/request canonical bytes and environment-variation KAVs are not.
10. **Whether analysis selection is concurrency-safe:** **Partially.** Same `(document,user)` duplication is blocked; global document uniqueness and analysis/document ownership are not.
11. **Whether atomic enqueue is correct:** **Structurally yes within one function transaction, but not approvable** until migration order, canonical identity and analysis ownership are corrected and executed.
12. **Whether idempotency is concurrency-safe:** **Structurally yes for key uniqueness, active exclusion, replay and winner binding; unproven in PostgreSQL.** The canonical identity dependency remains open.
13. **Whether snapshots are coherent and immutable:** **Coherent for the selected row values and protected against ordinary UPDATE/DELETE; not fully approved** because canonical and analysis ownership gates remain.
14. **Whether scope binding is declaratively enforced:** **Yes for job/request/snapshot origin; no for document-analysis ownership and current `study_visuals` publication provenance.**
15. **Whether `study_visuals` provenance is complete:** **No.** It is nullable, independently referenced, not attempt/usage-bound and currently ordered before its referenced table.
16. **Whether visual publication is atomic and idempotent:** **Yes in function transaction/CAS design; not executable or fully provenance-bound in the current migration.**
17. **Whether P0007 exposure is closed:** **Yes for executable SQL/API/UI paths.** Stale comments/classifier labels remain cleanup only.
18. **Whether ACL reconciliation is complete:** **No.** Intended grants are narrow, but exact default/ACL/grant-option/search-path/Storage proof is incomplete.
19. **Whether preflight drift handling is complete:** **No.** R8-H01 remains unresolved.
20. **Whether Storage reconciliation is exact:** **Exact for the D11 policy set and bucket privacy; incomplete for MIME/size, exact service privilege proof and execution evidence.**
21. **Whether heartbeat/recovery is complete:** **No; heartbeat has regressed.**
22. **Whether D13 polling is complete:** **No.** Generation isolation exists; behavioural fake-timer evidence does not.
23. **Whether the migration manifest has one authoritative source:** **Not yet.** JSON intends to be canonical, but Markdown still calls itself authoritative.
24. **Whether all ten Round 5 corrections are fully implemented:** **No.** Migration order, canonicalisation, exact preflight/ACLs, provenance, Storage bounds, recovery and executable evidence remain open.
25. **Whether Claude may perform another local correction round:** **Yes**, limited to the ordered local corrections. No environment or provider authority is implied.
26. **Whether disposable migration validation is approved:** **No.** The deterministic FK-order failure and remaining Critical canonical defect must be corrected and statically re-reviewed first.
27. **Whether database or Storage tests are approved:** **No under this review.** Test implementation may continue locally; execution requires a corrected candidate and George's exact D12 approval.
28. **Whether another catalogue inspection is required:** **No at present.** Existing D11 evidence is sufficient for the local corrections; the migration can fail closed on incompatible row data. Reinspect only if the target catalogue changes or a new assumption cannot be derived from existing evidence.
29. **Confirmation of actions/state:** This review created only this Markdown review file. It did not edit implementation, migrations, tests, manifests or earlier reviews; execute SQL; access Supabase/Storage; run Group B/Playwright/browser tests; or stage, commit, push, merge or deploy. Local unit/type/lint/build commands were run. The build/dev tooling uses the ignored `.next/` cache, so an absolute claim of no local cache/environment change would be false; no tracked implementation file changed. The earlier reported dev server is stopped, no Node/Next listener was observed, and there is no evidence of live Supabase/Storage access.
30. **`git diff --stat`:**

```text
 e2e/rls-two-user.spec.ts                           |   25 +-
 ...9120001_generation_job_state_machine_schema.sql | 3069 ++++++++++++++++----
 src/app/actions/generationJobs.ts                  |  247 +-
 src/app/actions/visuals.ts                         |  329 +--
 src/app/api/jobs/status/[jobId]/route.ts           |    2 +-
 src/app/api/jobs/visuals/route.ts                  |  140 +-
 src/app/api/visuals/[documentId]/route.ts          |   94 +-
 src/app/dashboard/study/[id]/page.tsx              |   15 +-
 src/components/study/StudySetView.tsx              |    4 +-
 src/components/study/VisualsPanel.tsx              |  222 +-
 src/lib/jobs/__tests__/idempotencyKey.test.ts      |  170 +-
 src/lib/jobs/__tests__/workerScenarios.test.ts     |  529 +++-
 src/lib/jobs/enqueueErrors.ts                      |   43 +-
 src/lib/jobs/idempotencyKey.ts                     |  103 +-
 src/lib/jobs/workerClient.ts                       |   58 +-
 src/types/studyVisual.ts                           |   24 +
 16 files changed, 3850 insertions(+), 1224 deletions(-)
```

31. **`git status --short`:**

```text
 M e2e/rls-two-user.spec.ts
 M migrations/20260729120001_generation_job_state_machine_schema.sql
 M src/app/actions/generationJobs.ts
 M src/app/actions/visuals.ts
 M src/app/api/jobs/status/[jobId]/route.ts
 M src/app/api/jobs/visuals/route.ts
 M src/app/api/visuals/[documentId]/route.ts
 M src/app/dashboard/study/[id]/page.tsx
 M src/components/study/StudySetView.tsx
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
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round8.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round9.md
?? migrations/manifest.json
?? src/lib/jobs/visualsWorker.ts
```

No path was staged.

## Final verdict

**APPROVE WITH REQUIRED LOCAL CORRECTIONS**
