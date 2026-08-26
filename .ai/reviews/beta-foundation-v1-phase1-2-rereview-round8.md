# Beta Foundation V1 Phases 1–2 — Round 8 Database Architect Re-review

**Date:** 2026-08-01  
**Reviewer:** MoLis Database Architect (Codex)  
**Review type:** Static working-tree review with local non-database verification  
**Controlling baseline:** Round 7 findings, D11 reconciliations and catalogue evidence, founder decisions D1–D13

## Verdict

**APPROVE WITH REQUIRED LOCAL CORRECTIONS**

Round 8 closes important defects: the nonexistent analysis-column access is gone; `pgcrypto` is resolved and called safely; enqueue now builds a database-owned snapshot, source digest, request identity, job and ledger; the worker consumes the snapshot and bound descriptor; manifest publication, usage evidence and the terminal transition share one transaction; owner visual reads are narrowed; and Storage policy reconciliation is much more exact.

The candidate is still not approved for parser or disposable-database execution. Two Critical correctness defects remain. First, the canonical hash is not a frozen byte contract: timestamp rendering is session-time-zone dependent, UTF-8 is assumed rather than asserted, the helper's NULL contract is implicit, and the claimed cross-language vectors do not represent PostgreSQL `jsonb::text`. Second, the separate duplicate-analysis count is raceable because no `(document_id,user_id)` uniqueness constraint exists and the joined source read locks only `documents`; a concurrent analysis insert can make the snapshot select choose an arbitrary row.

There are also release-blocking High gaps: incomplete fail-fast catalogue checks before mutation, no durable provenance columns on `study_visuals`, incomplete heartbeat/recovery outcomes and operation, direct Data API exposure of the internal P0007 exception, conflicting/inaccurate migration manifests, and no executable PostgreSQL/RLS/Storage/concurrency evidence. Another local correction round is authorised. Migration execution and database/Storage testing are not.

## Evidence boundary and independently verified claims

I read the controlling documents and both D11 CSVs, inspected the complete current diff and all requested implementation/test files, and traced every SQL function and constraint involved in enqueue, claim, heartbeat, cancellation, completion, publication, recovery, owner reads, ACLs and Storage.

Independent local evidence:

- `npm test -- --run`: **9 files passed; 178 tests passed; 49 skipped; 0 failed**. The 49 skipped Group B bodies contain comments, not executable database assertions.
- `npm run lint`: **passed**.
- `npm run build`: **not reproduced**. The build reached Next.js 16.2.6/Turbopack and failed because the restricted review environment could not fetch Geist/Geist Mono from Google Fonts. This is not evidence of an application-code failure, but Claude's build-pass claim is not independently confirmed here.
- No Group B, Playwright, SQL parser, SQL, migration, Supabase, Storage, staging or production test ran.
- Historical migration SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b` (unchanged).
- Corrective migration SHA-256: `b70e31d534cbfadedee1591085498a2d7bd7a480136b7704b4be09a395f5b336`.
- Branch: `feature/remediate-beta-foundation-v1`; `HEAD` remains rejected commit `7a2029fa2dfda82bd8727bbf1ec6069083391d16`; `main` and `origin/main` remain `7f723138e0e7d522aa7ba2428ba07513ecf9ec62`.
- `git diff --check` passed.

## Critical findings

### R8-C01 — The canonical digest is not yet a frozen, environment-independent byte contract

**Related Round 7 finding:** R7-C02 — **PARTIALLY RESOLVED**.

**Confirmed correction:** The preflight proves `pgcrypto.extnamespace = extensions` (`migrations/20260729120001_generation_job_state_machine_schema.sql:129-135`). `fn_sha256_hex` calls `extensions.digest` and `pg_catalog.encode`, excludes `public` from its path, is created by the preflight-enforced `postgres` owner, and receives no runtime EXECUTE grant (`:2670-2686`, `:3226-3259`). `encode(...,'hex')` returns lowercase hexadecimal output. Object shadowing through `public` is removed.

**Remaining defect:** The helper accepts `TEXT` and relies on the database encoding implicitly; the migration never asserts `server_encoding='UTF8'` or hashes an explicit `convert_to(...,'UTF8')` bytea (`:2670-2678`). Its NULL result is inherited implicitly from `digest`, rather than declared through `STRICT` and tested. More importantly, the source envelope includes `timestamptz` values and is cast from JSONB to text without freezing the session timezone (`:2909-2925`). The same stored instant can therefore serialize differently under different session `TimeZone` settings. JSONB's own deterministic internal output is being treated as an undocumented cross-version canonical format, and line endings/Unicode normalization are exact-byte distinctions without a declared contract.

The TypeScript vectors are not cross-language evidence. `SourceDigestEnvelope` omits `document_subject_id` (`src/lib/jobs/idempotencyKey.ts:43-56`), JavaScript uses compact `JSON.stringify` (`:66-75`), while SQL uses PostgreSQL `jsonb::text` (`migration:2909-2925`). The KAVs were generated only by Node and never evaluated by PostgreSQL (`src/lib/jobs/__tests__/workerScenarios.test.ts:1257-1304`).

**Impact:** A logically identical source can receive a different digest/request hash depending on session settings; active enqueue can then raise `DOCUMENT_REVISION_CHANGED` or an intent conflict incorrectly. The audit identity cannot be called permanent or cross-language.

**Required correction:** Freeze one database-authoritative v1 byte contract: assert UTF-8; render timestamps in a fixed UTC representation (or integer epoch microseconds); state exact handling for Unicode and line endings; ensure every key is present so NULL and missing remain distinct; cast UUIDs explicitly; make the helper `STRICT` (or explicitly document/test NULL); hash explicit UTF-8 bytes; and add known-answer vectors executed by PostgreSQL. Remove the misleading TypeScript “cross-language” helpers/tests or make them consume the exact same byte fixtures without becoming authoritative.

### R8-C02 — Concurrent analysis insertion can break coherent source selection

**Related Round 7 finding:** R7-C04 — **PARTIALLY RESOLVED**.

**Confirmed correction:** Document and analysis values now come from one joined statement, and the exact selected variables are used for both the source envelope and snapshot insert (`migration:2845-2925`, `:3028-3042`). There is no second mutable-source read. This is a coherent statement snapshot for the rows it selects.

**Remaining defect:** Duplicate detection is a separate statement (`:2830-2843`). The subsequent `LEFT JOIN` locks only the document row (`:2895-2899`). The migration adds only `UNIQUE(id,document_id,user_id)` to `document_analysis` (`:958-960`), which is redundant with the analysis primary key and does not enforce one analysis per `(document_id,user_id)`. A concurrent authenticated analysis insert after the count can create two joined rows. Non-`STRICT` PL/pgSQL `SELECT INTO` can then retain an arbitrary first row, defeating D10 fail-closed selection and deterministic hashing.

**Impact:** Accepted jobs can bind to an arbitrary analysis revision under normal product concurrency. This is exactly the source mismatch the immutable-snapshot design is meant to prevent.

**Required correction:** Under the approved maintenance gate, preflight duplicate `(document_id,user_id)` scopes before mutation and then add a database unique constraint on that exact scope. Keep quarantine/fail-closed handling for existing duplicates. The enqueue statement may then select zero or one analysis row atomically. Do not rely on the separate count as the concurrency control.

## High findings

### R8-H01 — R7-H09 fail-fast ordering remains incomplete

**Round 7 status:** **UNRESOLVED**.

The first mutation is the default-privilege change at `migration:556`. Before it, the migration now checks useful facts: executor, extension namespace, target table ownership/RLS, exact target columns, selected source-column types, selected constraints/indexes/policies, target runtime privileges, proposed-object absence, a subset of routine/trigger facts, duplicate rows and all eleven Storage policies (`:119-542`).

It still does not prove the complete D11 baseline before mutation:

- source-column nullability, defaults, generated/identity state and complete table shape are not checked (`:198-228`);
- generation-job/study-visual primary and foreign keys, delete actions and all relevant constraints are not fingerprinted (`:230-241`);
- `generation_jobs_pkey` is only implicit in an index count; index checks use partial `LIKE`, and the `study_visuals` index set is not asserted (`:243-250`);
- the five existing routines' exact signatures, definitions, search paths, dependencies and EXECUTE ACLs are not compared (`:312-330`);
- exact table/column ACL rows and default privileges are not compared. The comma-list form of `has_table_privilege` returns true when **any** listed privilege is held, so `:269-275` does not prove the comment's “all direct privileges” baseline;
- expected document/document-analysis triggers and policy/ACL facts are incomplete;
- data checks for key/hash XOR, cancel-requested duplicate active scopes and duplicate historical keys occur only after columns and other mutations (`:693-750`).

The new-column block at `:414-542` adds little because the main preflight already rejects any proposed column (`:282-287`), and it checks only two nullability properties. Transaction rollback is useful recovery, but does not meet Round 7's required fail-before-first-mutation design.

### R8-H02 — `study_visuals` publication has no durable job/request/snapshot provenance

**Related Round 7 finding:** R7-H03 — **PARTIALLY RESOLVED**.

The manifest is now closed and the winning job update, `study_visuals` upsert and one-row-per-job `generation_job_usage` insert are transactional (`migration:2061-2255`). CAS prevents duplicate/stale completion.

However, the persisted six-column `study_visuals` row still contains no `job_id`, `snapshot_id`, request hash or attempt number (`:2236-2241`; D11 baseline is preserved). `generation_job_usage` records those identities (`:1156-1179`), but there is no declarative link from the published manifest row to that usage/job tuple. A later intentional regeneration overwrites the singleton manifest and leaves its original `created_at` unchanged. The database can prove a job completed and a usage row exists, but cannot prove which exact job/snapshot/attempt produced the current manifest.

**Required correction:** Supplement `study_visuals` with current publication provenance (`source_job_id`, `snapshot_id`, request hash and attempt/version or an equivalent immutable publication-record table), backed by the existing composite job identity. Update it atomically with the manifest and usage row. Preserve the current unique owner/document latest-view contract while retaining immutable publication history according to D8–D10.

### R8-H03 — Internal enqueue SQLSTATE P0007 remains directly visible through the Data API

**Related Round 7 findings:** R7-C03/R7-M01 — **PARTIALLY RESOLVED / UNRESOLVED**.

The application route performs one same-key retry and returns safe HTTP 503 code `JOB_ENQUEUE_RETRY_REQUIRED` (`src/app/actions/generationJobs.ts:132-157`; `src/app/api/jobs/visuals/route.ts:35-48`). But `fn_enqueue_job` is granted directly to `authenticated` (`migration:3180`) and raises P0007 with internal messages (`:3002-3007`, `:3076-3081`, `:3106-3112`). An authenticated student can call the RPC through PostgREST directly and receive SQLSTATE/message details, bypassing the Next route. That contradicts the founder's explicit qualification that P0007 must not be exposed to students.

**Required correction:** Do not expose an internal concurrency exception through an authenticated Data API grant. Prefer a closed, safe structured enqueue outcome such as `retry_required` from the RPC, with no raw diagnostic, and let trusted server code perform the bounded re-read/retry. If an internal diagnostic is needed, write it only to restricted telemetry. Preserve same-key retry semantics.

### R8-H04 — Heartbeat and recovery are still incomplete

**Round 7 status for H07:** **PARTIALLY RESOLVED**.

SQL and TypeScript agree on accepted renewal, cancellation requested, terminal, generic authority lost, job not processing and transient failure (`migration:1801-1876`; `src/lib/jobs/workerClient.ts:23-35,141-170`). Raw SQLSTATE is not returned by the heartbeat function. Transport errors now reach the transient branch.

They do not expose the required **attempt superseded** outcome: state-version mismatch is folded into `authority_lost` (`migration:1864-1869`), and the TypeScript union has no such member (`workerClient.ts:32-35`). The route uses an async `setInterval` without a heartbeat-in-flight guard, so slow heartbeats can overlap (`src/app/api/jobs/visuals/route.ts:91-140`). Unexpected SQL exceptions are collapsed to `transient_failure`; this is safe from leakage but indistinguishable from transport trouble and can mask a deterministic database defect until retry exhaustion.

Most importantly, `recoverStaleJobs` has no production or local runner outside its wrapper (`workerClient.ts:325-344`). A failed `failJob` or failed cancellation acknowledgement can leave work processing until an external actor exists (`visuals/route.ts:189-210`). D3 properly blocks the final provider, but the current implementation cannot be called operationally complete.

### R8-H05 — ACL reconciliation is materially improved but postcondition proof is not exact

**Round 7 status for H05:** **PARTIALLY RESOLVED**.

Actual creation is owner-safe because execution requires `postgres`; runtime table privileges are explicitly revoked; functions use hardened paths; and final grants separate authenticated reads/enqueue/cancel from service-role worker functions (`migration:124-127`, `:3138-3180`). `fn_sha256_hex` and trigger helpers have no runtime grant. No related sequence is expected.

Remaining proof gaps are part of R8-H01: default ACLs are changed without an exact before/after assertion; final table privilege checks use effective privilege rather than exact ACL identity; function postconditions merely require some `search_path=` setting rather than the exact expected path (`:3226-3232`); grant options and unexpected grantees are not enumerated; and Storage's `has_table_privilege('service_role',...,'SELECT,INSERT,UPDATE,DELETE')` proves any one privilege, not all four (`:1342-1347`). D3 still limits this service-role client to temporary local/test authority.

### R8-H06 — Storage policy reconciliation is exact in scope, but the complete Storage contract is not finished

**Round 7 status for H06:** **PARTIALLY RESOLVED**.

The migration fingerprints all eleven D11 policies before mutation, drops exactly the four approved study-visual names, creates two restrictive bucket-neutral guards, proves the exact nine-policy post-state, leaves study-documents/recordings definitions untouched, and sets only `study-visuals` private (`migration:350-397`, `:793-804`, `:1264-1350`). Direct anon/authenticated access is denied. Server upload and five-minute signed retrieval remain possible (`src/lib/jobs/visualsWorker.ts:223-240`; `src/app/api/visuals/[documentId]/route.ts:65-124`). Lost-race objects remain private and unreferenced.

The bucket still has no database-enforced MIME/size ceiling, image download/upload size is unbounded in the worker, and the service-role postcondition uses “any privilege” semantics. Those D7/D11 production requirements and executable Storage proof remain open.

### R8-H07 — D13 polling is safer but still lacks generation isolation and real timer evidence

**Round 7 status for H08:** **PARTIALLY RESOLVED**.

The component has the required 2s/5s/10s/30s base schedule, up to 500ms jitter, one status fetch guard, initialized independent hidden/offline refs, `AbortController`, terminal stop and listener/unmount cleanup (`src/components/study/VisualsPanel.tsx:26-34`, `:53-95`, `:112-183`, `:228-261`).

It does not attach an immutable polling generation/document token to every response. An old request that resolves just before cleanup can still call `stopPolling`, update phase, await an unabortable `refreshVisuals`, and affect a newly mounted document/job (`:126-170`). `stopPolling` also resets the shared in-flight flag immediately (`:74-88`), so an old request's `finally` can race with the next generation. There is no component test at all: Vitest runs in `node`, and no test uses fake timers, renders `VisualsPanel`, controls visibility/offline state or verifies abort/obsolete-response behavior (`vitest.config.ts:9-16`; repository test search returned no `VisualsPanel`/`useFakeTimers` test).

### R8-H08 — Database tests remain specifications, not evidence

**Round 7 status for H10:** **UNRESOLVED**.

The 178 passing tests include genuine semantic unit tests, mocked service-client tests and new static source scans. The SQL scans read the migration but prove only strings/regexes, not PostgreSQL syntax or behavior (`src/lib/jobs/__tests__/workerScenarios.test.ts:1132-1255`). The alleged cross-language KAVs are Node-only and use a different envelope/serialization (`:1257-1361`). All 49 Group B tests are `skipIf` tests with commented pseudocode and no live assertion (`:477-1117`). The Playwright file has a few real authenticated assertions but remains environment-skipped and covers only a limited job-table/RPC subset (`e2e/rls-two-user.spec.ts:57-241`).

No evidence yet proves parser validity, preflight behavior, RLS/ACL exactness, snapshot/ledger immutability, same/different-key races, duplicate analysis concurrency, cancellation races, transaction rollback, Storage isolation or signed access.

### R8-H09 — The migration manifest is conflicting and overstates execution evidence

**New Round 8 finding.**

`.ai/inspection/migration-manifest.md` records the two requested filenames and the actual hashes/order, preserves baseline immutability, and correctly says the corrective migration has no parser/disposable/staging execution (`:14-18`, `:28-46`, `:51-68`). Its corrective checksum matches the file.

It is nevertheless inaccurate. It calls the baseline “applied in production” and says D11 confirms production execution (`:16-20`, `:66`), although D11 found no MoLis application migration ledger. Catalogue resemblance proves current shape, not that this exact file ran. It also claims to record every MoLis migration while omitting the still-unversioned active-product prerequisite baseline (`:6`). Fresh-project reproducibility is therefore not established.

There is also a second untracked `migrations/manifest.json` whose evidence wording is safer and acknowledges the missing prerequisite, but whose corrective hash is stale (`migrations/manifest.json:10-12,23-30`: `785399...`, not `b70e31...`). Two competing manifests with contradictory checksums/evidence cannot be authoritative.

## Medium findings

### R7-M01 — **UNRESOLVED**

Documentation and safe-error mapping still contradict implementation. `generationJobs.ts:35-38` says the ledger fast path has no payload check, while SQL compares document/type/input. The second enqueue call maps every error—not only repeated P0007—to `ENQUEUE_RETRY_REQUIRED` (`generationJobs.ts:143-147`). `classifyEnqueueError` omits P0002, P0010, P0017 and P0018 (`src/lib/jobs/enqueueErrors.ts:14-29`). SQLSTATEs remain reused for unrelated conditions: P0017 covers document revision and invalid failure-code pairs; P0019 covers support-reference validation and snapshot updates (`migration:2339-2352`, `:1070-1080`, `:2966-2979`).

### R7-M02 — **PARTIALLY RESOLVED**

The Next server action enforces a closed empty object for every v1 job type (`src/app/actions/generationJobs.ts:62-91`). The database RPC exposed to authenticated callers checks only non-NULL and 64 KB; it does not require a JSON object or apply the per-job closed schema (`migration:2783-2791`). Direct callers can therefore store arbitrary JSON types/keys in `input_data` and alter request identities. The database boundary must enforce the same closed versioned schema.

### R7-M03 — **RESOLVED**

Raw Storage paths were removed from worker logs. Staging records only `{stored:true}` and errors use closed codes (`src/lib/jobs/visualsWorker.ts:207-250`). Signed-route path failures also log only an error code (`src/app/api/visuals/[documentId]/route.ts:95-109`).

### R7-M04 — **RESOLVED**

The dead `expected_*_updated_at` columns are no longer created. The authoritative source identity is the snapshot digest (`migration:601-604`).

### R8-M01 — Application types and comments still drift from the database contract

`SourceDigestEnvelope` omits the subject ID included in SQL. `GenerationJobRequest` omits document, job type and snapshot binding fields (`src/types/generationJob.ts:48-62`). SQL snapshot comments still describe `analysis_data` as a live “data” column even though it is a constructed envelope (`migration:944-950`). These do not currently grant authority but will mislead future implementation and testing.

### R8-M02 — Deprecated direct-table server actions remain exported

`createGenerationJob` and `cancelGenerationJob` remain exported from a `'use server'` module and still attempt direct base-table mutation (`src/app/actions/generationJobs.ts:265-330`). ACL revocation makes them fail after migration, and no current caller was found, so this is containment rather than an access bypass. Remove them in the next local cleanup or replace them with explicit hard failures to avoid a broken app-wide path.

## Confirmed corrections

1. No executable reference to nonexistent `document_analysis.data` remains. Snapshot analysis JSON is built only from the 17 D11-confirmed content columns plus separately captured `id`, `created_at` and `model` (`migration:2858-2882`). All analysis fields currently consumed by visual prompt generation—subject area, difficulty, sections, key concepts and formulas—are captured (`src/lib/jobs/visualsWorker.ts:66-90`).
2. The source envelope additionally captures title, extracted text, file/source type, subject, recording provenance, document/analysis creation times and analysis model (`migration:2909-2923`).
3. `fn_sha256_hex` is schema-qualified, shadow-resistant and runtime-private; output is lowercase 64-hex when input is non-NULL (`:2670-2686`).
4. TypeScript does not supply authoritative hashes to enqueue. The production call passes only document, job type, scoped key and sanitized input (`generationJobs.ts:120-132`).
5. Enqueue performs authentication, owner-scoped source selection, digest/hash calculation and snapshot/job/ledger writes inside one function transaction (`migration:2753-3129`).
6. Same-key committed replay returns the original terminal or active binding without duplicate writes; mismatched document/type/input raises conflict (`:2795-2828`). Active exclusion and durable key uniqueness are independent constraints (`:776-783`, `:852-878`). The unique-violation branch rolls back its nested writes, validates the winner and binds a different accepted key (`:3018-3121`).
7. Snapshot, ledger and usage UPDATE/DELETE are blocked by owner-only ACLs plus trigger guards; parent deletion is RESTRICTed. Internal enqueue uses INSERT only. D8–D10 deletion/retention is not silently enabled (`:1005-1052`, `:1063-1102`, `:1156-1188`).
8. Composite unique/FK definitions declaratively bind job, owner, document, snapshot, hash, type and originating request. The circular ledger/job constraints are validly created after both tables and are deferred for the enqueue transaction (`:1110-1149`).
9. Claim/context require `client_verified` and an exact originating binding; the worker reads only snapshot context and validates/uses the descriptor's models and generation parameters (`:1359-1427`, `:1694-1782`; `visualsWorker.ts:19-60,256-320,335-421`).
10. Manifest validation fails closed on array/object shape, exact keys/types, UUID IDs, unique IDs/paths, exact attempt-scoped PNG path, length limits, null URL, generated/failed field contracts and pending status. Nonempty completion needs a generated item; only `NO_VISUAL_TOPICS` permits empty (`migration:2061-2212`).
11. The CAS job update precedes and shares a transaction with manifest upsert and usage insert. Any later failure rolls the whole function back. Stale, duplicate, expired, wrong-worker/token/version or cancelled attempts cannot publish (`:2214-2295`).
12. Owner browser reads are now allowlisted at the database boundary; the signing manifest is service-only; public DTOs omit path/prompt/user ID (`:1546-1653`; `src/types/studyVisual.ts:31-50`).
13. Storage reconciliation targets only the four inspected policies and proves preservation of the seven unrelated policies (`migration:1264-1350`).
14. P0007 is not shown by the reviewed Next UI/API path; the client preserves its request key on safe 503 (`generationJobs.ts:138-154`; `VisualsPanel.tsx:283-320`). Direct RPC exposure remains R8-H03.
15. The historical migration remains byte-for-byte unchanged, and governance remains on the feature branch with uncommitted changes.

## Every Round 7 finding status

| Finding | Round 8 status | Core reason |
|---|---|---|
| R7-C01 | **RESOLVED** | Explicit D11-column analysis JSON; no `document_analysis.data`. |
| R7-C02 | **PARTIALLY RESOLVED** | Safe helper resolution/ACL; canonical byte, UTC, UTF-8, NULL and true PostgreSQL KAV contract missing. |
| R7-C03 | **PARTIALLY RESOLVED** | Database race/binding structure is materially correct; it still depends on the unfrozen request hash and exposes P0007 directly. |
| R7-C04 | **PARTIALLY RESOLVED** | One source statement and immutable rows; duplicate-analysis race remains. |
| R7-H01 | **RESOLVED** | Exact composite job/request/snapshot binding and ledger immutability are declarative. |
| R7-H02 | **RESOLVED** | Verified binding gates claim/context; worker consumes snapshot and descriptor, not mutable sources/env model overrides. |
| R7-H03 | **PARTIALLY RESOLVED** | Closed manifest and usage row; current `study_visuals` lacks durable publication provenance. |
| R7-H04 | **RESOLVED** | Authenticated RPC returns a closed public visual DTO; signing data is service-only. |
| R7-H05 | **PARTIALLY RESOLVED** | Explicit least-privilege reconciliation exists; exact baseline/default/postcondition proof remains incomplete. |
| R7-H06 | **PARTIALLY RESOLVED** | Exact policy reconciliation/private signing works; MIME/size and exact service authority proof remain open. |
| R7-H07 | **PARTIALLY RESOLVED** | Transient heartbeat path and safe errors improved; attempt-superseded, overlap, recovery runner and failure-of-failure remain. |
| R7-H08 | **PARTIALLY RESOLVED** | Abort/pause/backoff improved; generation race and fake-timer component tests remain. |
| R7-H09 | **UNRESOLVED** | Complete discoverable drift checks still do not all precede the first mutation. |
| R7-H10 | **UNRESOLVED** | Passing/static/mocked tests do not execute PostgreSQL, RLS, ACL, concurrency or Storage. |
| R7-M01 | **UNRESOLVED** | Stale docs, second-retry mapping and duplicate SQLSTATEs remain. |
| R7-M02 | **PARTIALLY RESOLVED** | App schema closed; directly exposed RPC schema remains open. |
| R7-M03 | **RESOLVED** | No raw Storage path logging in reviewed worker/signing paths. |
| R7-M04 | **RESOLVED** | Dead timestamp-revision columns removed. |

## Canonicalisation disposition

Current handling is as follows:

| Value class | Current database behavior | Disposition |
|---|---|---|
| Top-level/source field order | Fixed `jsonb_build_object`; JSONB text has deterministic internal ordering | Stable within the current engine, but not a declared permanent format |
| Nested JSON keys | JSONB normalizes object order | Deterministic in PostgreSQL; Node byte output differs |
| Arrays | Order preserved | Deliberate and suitable |
| NULL vs missing | Source/request envelope keys are always present; nested/sanitized missing differs from explicit null | Suitable if documented |
| Empty strings | Preserved and distinct from NULL | Suitable |
| Unicode | Exact database-encoding bytes; no normalization | Not yet declared/asserted |
| Line endings | Preserved; LF and CRLF hash differently | Not yet declared/tested |
| Numbers | JSONB numeric text semantics | Not shared with JavaScript serialization; v1 direct RPC input remains open |
| Booleans | JSON `true`/`false` | Suitable |
| Timestamps | JSONB text under session timezone | **Unsafe; must freeze UTC** |
| UUIDs | JSON string representation | Suitable; should be explicit in byte contract |
| Schema versions | Present in source, request and descriptor | Correct |
| Models/config | Bound in descriptor and request hash | Correct for model/parameters |
| Operation identity | Prompt schema version is bound; code must bump it whenever prompt/truncation/response behavior changes | Requires governance/test enforcement |

## Exact ordered corrections still required

1. Keep enqueue disabled and do not parse/apply the migration. Preserve `beta_foundation_v1.sql` and D11 evidence.
2. Complete one mutation-free D11 preflight before line 556: exact source/target columns and properties; all PK/FK/check/index/delete definitions; relevant policies/triggers/routines/dependencies/owners/search paths; exact table/column/function/default ACLs; and all data compatibility checks, including `cancel_requested` active duplicates. Replace “any privilege” tests where “all” is intended.
3. Add fail-closed `(document_id,user_id)` uniqueness for `document_analysis` after D10 preflight. Remove the raceable count as the concurrency authority.
4. Freeze the database canonical v1 format: UTF-8 bytes, UTC timestamp representation, explicit NULL/empty/Unicode/line-ending/numeric/UUID rules, strict helper behavior and PostgreSQL-executed KAVs. Align or remove TypeScript hash fixtures.
5. Enforce the closed per-job sanitized-input schema inside `fn_enqueue_job`, not only in the server action.
6. Replace authenticated P0007 exception exposure with a closed safe RPC outcome; retry only that outcome once and classify a second non-race error normally. Assign unique internal SQLSTATEs and update stale comments/error mappings.
7. Add durable current-publication provenance to `study_visuals` (or an immutable publication table) and bind it by composite FK to job/snapshot/hash/attempt/usage in the same completion transaction.
8. Finish heartbeat/recovery: distinct attempt-superseded outcome, one heartbeat in flight, deterministic exception classification/alerting, and a durable local/test recovery runner. Production provider authority remains blocked by D3.
9. Add Storage MIME/size bounds or an equivalently closed server limit and exact all-privilege postconditions; retain the exact four-policy scope.
10. Make `VisualsPanel` polling generation-scoped, abort visual refreshes, and add deterministic fake-timer component tests for document/job changes, slow responses, hidden/offline transitions, terminal stop and cleanup.
11. Establish one canonical migration manifest. Record only “catalogue consistent; exact historical execution unproven,” include the missing fresh-project prerequisite gap, and update/remove the conflicting stale JSON checksum.
12. Remove or hard-disable deprecated direct job server actions and align public/internal types/comments with the SQL schema.
13. Replace Group B pseudocode with executable synthetic PostgreSQL/RLS/ACL/Storage/concurrency/rollback tests and obtain genuine parser evidence. Then perform another static Database Architect review before seeking George's disposable-environment approval.

## Required end-state determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** R8-C01 unfrozen/session-dependent canonical hash; R8-C02 raceable duplicate-analysis source selection.
3. **High findings:** incomplete fail-fast preflight; missing durable visual-publication provenance; direct P0007 exposure; incomplete heartbeat/recovery; incomplete exact ACL proof; incomplete MIME/size Storage contract; polling generation race/no timer tests; non-executable database evidence; conflicting/inaccurate manifests.
4. **Medium findings:** stale error/docs/SQLSTATE contract; database input schema still open; application type/comment drift; deprecated direct-table server actions.
5. **Confirmed corrections:** listed in “Confirmed corrections”; they are substantial but do not close the Critical/High release gates.
6. **Every Round 7 finding status:** listed in the status table above.
7. **New Round 8 issues:** direct authenticated P0007 visibility; missing persisted `study_visuals` provenance; duplicate-analysis insert race; session-dependent timestamp hashes; conflicting manifests; false cross-language KAV claims.
8. **Exact ordered corrections:** the thirteen-step sequence above.
9. **Whether atomic enqueue is correct:** **Partially.** The write graph is one function/transaction and loser subtransactions roll back, but source selection and canonical identity are not yet safe under all concurrency/session conditions.
10. **Whether concurrency-safe idempotency is correct:** **Structurally close, but not approved.** Key uniqueness, active exclusion, replay and winner binding are correctly separated; the identity and direct-race error boundary remain defective and unexecuted.
11. **Whether snapshots are coherent and immutable:** **Partially.** Selected values are hashed/stored once and UPDATE/DELETE are blocked; concurrent duplicate analysis can still make selection ambiguous.
12. **Whether scope binding is declaratively enforced:** **Yes for job/request/snapshot scope.** Composite unique/FKs and deferred origin binding are coherent. Current `study_visuals` provenance is not included.
13. **Whether worker input is snapshot-only:** **Yes.** No mutable document/analysis read remains in `visualsWorker.ts`; descriptor use is bound and fail-closed.
14. **Whether publication is atomic and idempotent:** **Yes for the transaction and retry CAS; incomplete for durable manifest provenance.** Stale/duplicate workers cannot win, and usage is one row per job.
15. **Whether ACL reconciliation is complete:** **No.** Runtime grants are substantially correct, but complete preflight/default/exact postcondition proof is missing.
16. **Whether Storage reconciliation is exact:** **Exact for the D11 policy set and bucket visibility; incomplete for MIME/size and all service privileges.**
17. **Whether heartbeat/recovery is complete:** **No.** Attempt-superseded, overlap control, durable runner and failure-of-failure recovery remain.
18. **Whether D13 is complete:** **No.** Timing/pause/abort mechanics exist; generation isolation, fake-timer evidence and release performance evidence do not.
19. **Whether fail-fast drift handling is complete:** **No.** R7-H09 remains unresolved.
20. **Whether the migration manifest is accurate:** **No.** The requested Markdown overclaims production application; the competing JSON has a stale checksum; fresh prerequisites remain unversioned.
21. **Whether all ten Round 5 corrections are fully implemented:** **No.** Exact preflight, canonical source identity, visual provenance, recovery, manifests and executable evidence remain incomplete.
22. **Whether Claude may perform another local correction round:** **Yes**, limited to the ordered local changes above. No database/provider/environment authority is implied.
23. **Whether disposable migration validation is approved:** **No.** Critical static defects must be corrected and re-reviewed first.
24. **Whether database or Storage tests are approved:** **No under this review.** Test implementation may continue locally; execution requires a corrected candidate and George's exact D12 approval.
25. **Whether another catalogue inspection is required:** **No at present.** D11 contains enough catalogue facts; the remaining issues are locally determinable. Reinspect only if the target catalogue changes.
26. **Confirmation no implementation or environment change occurred:** This review created only this Markdown review file. It did not edit implementation, migrations, tests or earlier reviews; execute SQL; access or modify Supabase/Storage; run Group B; stage, commit, push, merge or deploy. Local unit/lint/build verification was read-only with respect to tracked source; the build failed only on restricted Google Fonts access.
27. **`git diff --stat` (ordinary diff excludes untracked review/evidence files):**

```text
 e2e/rls-two-user.spec.ts                           |   25 +-
 ...9120001_generation_job_state_machine_schema.sql | 2943 ++++++++++++++++----
 src/app/actions/generationJobs.ts                  |  104 +-
 src/app/actions/visuals.ts                         |  329 +--
 src/app/api/jobs/status/[jobId]/route.ts           |    2 +-
 src/app/api/jobs/visuals/route.ts                  |  133 +-
 src/app/api/visuals/[documentId]/route.ts          |   94 +-
 src/app/dashboard/study/[id]/page.tsx              |   15 +-
 src/components/study/StudySetView.tsx              |    4 +-
 src/components/study/VisualsPanel.tsx              |  204 +-
 src/lib/jobs/__tests__/idempotencyKey.test.ts      |  169 +-
 src/lib/jobs/__tests__/workerScenarios.test.ts     |  431 ++-
 src/lib/jobs/enqueueErrors.ts                      |   24 +-
 src/lib/jobs/idempotencyKey.ts                     |   93 +-
 src/lib/jobs/workerClient.ts                       |   58 +-
 src/types/studyVisual.ts                           |   24 +
 16 files changed, 3495 insertions(+), 1157 deletions(-)
```

28. **`git status --short`:** recorded after file creation in the handoff response; the expected additional path is `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round8.md`, and no staging occurs.

## Final verdict

**APPROVE WITH REQUIRED LOCAL CORRECTIONS**
