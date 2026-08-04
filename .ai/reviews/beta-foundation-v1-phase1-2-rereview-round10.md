# Beta Foundation V1 Phases 1–2 — Database Architect Round 10 Static Re-review

**Date:** 2026-08-02  
**Role:** MoLis Database Architect  
**Review type:** Static working-tree review only  
**Verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**

## Scope and evidence boundary

I read the Round 9 and Round 8 reviews, the final D11 reconciliation, founder decisions, the complete corrective migration, both migration manifests, and the complete current working-tree diff. I inspected the application job, worker, visual publication, private-Storage, DTO, type and test paths rather than relying on Claude's report.

No SQL was executed and no Supabase or Storage environment was accessed. Group B, Playwright, browser, RLS and Storage tests were not run.

Local verification produced:

- `npm test -- --run`: **209 passed, 49 skipped** across 9 files. The 49 skipped tests are Group B specifications/pseudocode and are not database evidence.
- `npx tsc --noEmit`: **passed**.
- `npm run lint`: **passed with 0 errors and 4 warnings**, all unused parameters in the deliberately disabled compatibility functions in `src/app/actions/generationJobs.ts`.
- `npm run build`: **not reproduced**. Next.js 16.2.6/Turbopack failed only because this restricted environment could not fetch Geist and Geist Mono from Google Fonts. This does not identify an application-code failure, but Claude's build-pass claim is not independently corroborated here.
- `git diff --check`: **passed**.
- `migrations/beta_foundation_v1.sql` SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b` — unchanged.
- Corrective migration SHA-256: `46f46bf3c443c3740418f2d5cc909e9390a99756f43ef74f7e352f0b08a65bef` — matches the JSON manifest and Claude's report.

The 209 local passes comprise unit/model tests, mocked client tests and static source-string assertions. They contain no PostgreSQL parser, transactional, RLS, ACL, concurrency or Storage execution.

## Executive assessment

Round 10 fixes the fatal table/FK ordering error and closes analysis ownership correctly. It also fixes the successful-heartbeat control-flow regression, makes the Storage bucket configuration materially safer, and resolves the two-manifest authority conflict.

The candidate is still not safe to execute. The new full-envelope KAV block is based on a false PostgreSQL JSONB ordering rule and is therefore expected to abort the migration deterministically. PostgreSQL 17 does not serialize JSONB object keys alphabetically; the official PostgreSQL 17 documentation states that JSONB does not preserve input key order and demonstrates output ordering that places shorter keys first. The repository's first expected hash is exactly reproducible from the stated alphabetic simulation, not PostgreSQL's storage/output order. See [PostgreSQL 17 JSON types](https://www.postgresql.org/docs/17/datatype-json.html).

Separately, `study_visuals` still has no single declarative provenance link to the exact immutable publication attempt, and the mutation-free preflight and ACL postconditions still use only part of the already available D11 catalogue facts. These are local design defects, not reasons for more catalogue access.

## Critical findings

### R10-C01 — The new canonical-envelope KAVs encode the wrong PostgreSQL JSONB key order

**Round 9 predecessor:** R9-C02 — **REGRESSED**.

The migration states that PostgreSQL JSONB keys are serialized alphabetically (`migration:2963-2973`, `:3323-3326`). KAV-SRC-1's displayed expected text is alphabetically ordered and its fixed hash, `4a2779…`, exactly matches an external SHA-256 calculation over that alphabetically sorted, PostgreSQL-spaced string (`:2999-3029`). PostgreSQL 17 JSONB does not use that ordering rule. Its documented output example renders `bar`, then `active`, then `balance`, demonstrating the storage ordering rather than alphabetic ordering.

Consequences:

- the first full-envelope KAV is expected to fail before `fn_enqueue_job` is created and before the final grants;
- because the migration is transactional, it should roll back, but it cannot be approved for execution;
- the three fixtures do not prove the complete contract even if their hashes are corrected;
- the claimed independent production is only independent of `fn_sha256_hex`, not independently validated against PostgreSQL 17 serialization.

The KAV set covers one all-null analysis source, one timestamp source and one empty-input visuals request. It does not execute exact fixtures for populated nested analysis objects/arrays, array order, empty string versus null, missing nested key versus explicit null, booleans, integer versus fractional/trailing-zero numeric output, CRLF versus LF, Unicode NFC versus NFD, or changed session settings. It does not compare the constructed canonical text with a literal expected text before hashing. PostgreSQL itself documents that JSONB numeric output follows `numeric` and can preserve trailing fractional zeroes, contradicting the migration's generic “shortest unambiguous representation” claim.

**Required correction:** define the v1 serialization contract against PostgreSQL 17's actual output or replace `jsonb::text` with an explicit versioned serializer. Compare exact constructed text to literal expected text and then compare the hash to a separately calculated literal. Add fixtures for every listed dimension and run them under deliberately varied `TimeZone`, `DateStyle`, `extra_float_digits` and relevant locale settings. Record that PostgreSQL major upgrades require contract revalidation, an active-job drain and a schema-version bump if bytes change. Storing the exact source/request canonical text alongside its digest is the safest audit design.

## High findings

### R10-H01 — `study_visuals` provenance remains a set of independent claims

**Round 9 predecessor:** R9-H02 — **PARTIALLY RESOLVED**.

The ordering defect is fixed and `study_visuals_provenance_coherence` now requires all four provenance fields to be null or all present (`migration:1262-1310`). The publication function fills the four fields atomically with the winning CAS, manifest and usage row (`:2434-2484`). Legacy rows remain honestly unverified.

The database still does not prove that those four values describe the same publication:

- `source_job_id` and `source_snapshot_id` are separate single-column FKs;
- `source_request_hash` is format-checked but not equal-bound to the job/ledger/usage row;
- `publication_attempt` need only be non-null and can be zero, negative or unrelated to `generation_job_usage.attempt_count`;
- a privileged defect could combine one user's visual row with individually valid job/snapshot/hash/attempt values from different tuples.

No new catalogue fact is required. The migration creates all target columns and keys. Locally add a unique referenced publication tuple on `generation_job_usage(job_id,user_id,document_id,snapshot_id,request_payload_hash,attempt_count)` and one composite FK from `study_visuals(source_job_id,user_id,document_id,source_snapshot_id,source_request_hash,publication_attempt)` to it, `ON DELETE RESTRICT`. The usage row already binds job/user/document/snapshot/hash/job type to `generation_jobs`; that verified job is deferred-bound to its originating request-ledger row. Thus the composite FK transitively proves the request ledger without duplicating `originating_request_id` in `study_visuals`.

Create `generation_job_usage` and its referenced unique key before adding this FK. In `fn_complete_and_publish_job`, insert the usage row before the `study_visuals` upsert, or make the composite FK explicitly deferred; inserting usage first is simpler and remains atomic because a later upsert failure rolls back the whole transaction. Retain the all-null/all-present legacy check and require `publication_attempt > 0` for verified rows. Add exact constraint postconditions and tests.

### R10-H02 — The fail-before-first-mutation preflight is still incomplete despite sufficient D11 evidence

**Round 9 predecessor:** R9-H04 — **PARTIALLY RESOLVED**.

Round 10 improves source-column checks to include type, nullability, identity/generated state and defaults, and adds the two analysis-ownership data checks before mutation (`migration:255-309`, `:431-453`). It still fingerprints only selected constraints, indexes, routines, triggers and authority.

Missing pre-mutation checks include:

- exact PK, FK, unique and CHECK definitions for every referenced/altered object, including update/delete actions and validation/deferrability state;
- exact relevant index definitions for `documents`, `document_analysis` and `study_visuals`, plus the generation-jobs primary index rather than only a total count and two secondary indexes;
- all five existing routine signatures, return/language/volatility/strict/security/owner/proconfig/source definitions, dependencies and EXECUTE ACLs;
- the complete relevant trigger set and definitions, rather than five routine names plus one document-trigger existence check;
- normalized table, schema, column, function and type ACL entries, grantors and grant options;
- the exact `postgres/public` default-ACL before-state before changing it and the intended after-state;
- the complete inspected `study-visuals` bucket fingerprint, including initially null MIME/size settings and preserved fields;
- exact post-mutation definitions for the new constraints, triggers, RLS state and policies before the last authority grants.

The D11 files already contain the needed catalogue facts: S4–S9/S9b cover keys, constraints, indexes and triggers; SA01–SA06 cover routines and dependencies; SA07, SA10 and SA11 cover table/schema/default authority; S18–S20 cover the bucket, policies and Storage RLS. Dynamic row-compatibility checks properly belong in the migration's runtime preflight. **No additional read-only catalogue inspection is presently required.**

### R10-H03 — ACL intent is narrow, but exact postconditions remain incomplete

**Round 9 predecessor:** R9-H05 — **PARTIALLY RESOLVED**.

The four required `service_role` privileges on `storage.objects` are now checked individually (`migration:1549-1557`). Runtime table privileges are revoked; function grants separate authenticated owner operations from temporary service-role worker operations; all new functions are declared `postgres`-owned `SECURITY DEFINER` with explicit search paths.

The final table test still passes a comma-list to `has_table_privilege` (`:3642-3648`). Its ANY semantics are logically valid for this negative question (“does any prohibited privilege remain?”), but it is not an exact ACL fingerprint. More importantly:

- function `proconfig` checks require the expected `search_path` entry but allow additional GUC entries; exactness requires equality with the expected array;
- effective checks cover only anon/authenticated/service_role, not unexpected grantees, grantors or grant options;
- default ACLs are changed but not asserted afterward;
- schema, column and type authority and the exact absence of policies on closed public tables are not fully postconditioned;
- helper function language, volatility, strictness, return type and trigger linkage are not exact-fingerprinted.

Use normalized `aclexplode`/catalog comparisons and exact `proconfig` equality. Preserve every unrelated Supabase-managed role, schema and default ACL.

### R10-H04 — Heartbeat code is fixed, but its tests and recovery path are not durable evidence

**Round 9 predecessor:** R9-H03 — **PARTIALLY RESOLVED**.

`heartbeatInFlight` is now assigned before the RPC and reset in `finally`; success, cancellation, authority loss and transient paths all pass through that `finally` (`src/app/api/jobs/visuals/route.ts:94-153`). A second callback can therefore run after a successful renewal. The original control-flow regression is resolved.

The seven new tests call `runFakeHeartbeat`, a copied local simulation in the test file (`workerScenarios.test.ts:152-188`), not the route callback or an imported production controller. They prove JavaScript `finally` on the copy, not that future production changes preserve the route wiring, timer scheduling, abort behavior or retry count. `attempt_superseded` remains folded into `authority_lost`. The SQL heartbeat catches every database exception and converts it to `transient_failure`, so persistent code/permission defects lack a distinct alert signal.

`fn_recover_stale_jobs` is concurrency-bounded and cancel-safe, and its wrapper exists, but nothing invokes it durably. D13's two-minute reconciliation target therefore cannot be met in production today.

Durable scheduling is a Phase 2 release requirement, but not a prerequisite for parsing or applying the schema in a disposable environment. D3 blocks selection/deployment of the final managed provider and least-privilege production actor. It does not block retaining the recovery RPC, writing an approved local synthetic invocation test, or validating the migration. No new founder runner choice is required now: D3 already requires provider comparison, proof of concept and George's later provider approval. Keep production enablement explicitly gated.

### R10-H05 — Storage database limits are present; the worker-side bound is only partial

**Round 9 predecessor:** R9-H06 — **PARTIALLY RESOLVED**.

The migration now sets only `study-visuals` to `public=false`, `allowed_mime_types=['image/png']` and `file_size_limit=5242880`, and checks those values (`migration:904-922`, `:1513-1525`). It still removes only the four D11-named visual policies, preserves the seven study-document/recording policies, denies anon/authenticated direct access restrictively and preserves trusted signing/upload authority.

The worker checks `imageBuffer.byteLength <= 5 MiB` before upload (`src/lib/jobs/visualsWorker.ts:225-252`), but only after decoding the complete base64 value or buffering the complete URL response with `arrayBuffer()`. An unbounded provider response can therefore consume memory before rejection. It also hardcodes `contentType: image/png` without validating the downloaded bytes/PNG signature.

There is a contract mismatch: the worker emits failed manifest code `IMAGE_OVERSIZED`, while `fn_complete_and_publish_job` permits only `IMAGE_GENERATION_FAILED` and `STORAGE_UPLOAD_FAILED` (`visualsWorker.ts:227-240`; `migration:2411-2421`). An oversized response therefore causes the entire completion RPC to reject instead of recording the intended failed visual item.

Add a content-length early reject where available, a streaming byte cap for URL responses, a bounded base64-input check before allocation where practical, PNG signature/decoder validation, and one shared closed failure-code contract. Real anon/authenticated denial, trusted upload and owner-only signed-URL evidence remains absent.

### R10-H06 — D13 component behavior and all database/Storage behavior remain unexecuted

**Round 9 predecessors:** R9-H07 — **UNRESOLVED**; R9-H08 — **UNRESOLVED**.

No test renders `VisualsPanel`, uses its actual polling callbacks or fake timers, or changes visibility, online state, document/job identity and unmount state. Vitest remains a Node environment. The existing static and model tests cannot prove the 2/5/10/30-second schedule, jitter, no overlap, combined hidden/offline pause, resume, stale-response rejection, terminal stop or cleanup.

`jsdom`, `@testing-library/react` and `@testing-library/jest-dom` are not direct dependencies (`npm ls --depth=0` returned empty). Adding them as pinned development dependencies is ordinary local test tooling, not a product or architecture decision. George should approve that scoped installation now, including the package/lockfile diff and dependency review. It does not authorize a browser, database or external-environment run.

The 49 Group B tests are still skipped and largely commented specifications. `e2e/rls-two-user.spec.ts` contains executable assertions when configured, but no database was provisioned or contacted and it does not yet cover the whole snapshot/ledger/usage/provenance/Storage/concurrency contract.

## Medium findings

### R10-M01 — SQLSTATE, retry classification, comments and raw types remain inconsistent

**Round 9 predecessor:** R7-M01 — **UNRESOLVED**; R8-M01 — **PARTIALLY RESOLVED**.

P0017 is used for both document revision conflict and invalid worker error/message pairs; P0019 is used for snapshot immutability and invalid support references (`migration:1231`, `:2575-2587`, `:3395-3402`, `:3524-3529`). Retry RPC errors are still all converted to `ENQUEUE_RETRY_REQUIRED` rather than classifying non-race errors normally (`generationJobs.ts:153-171`). P0007 remains in defensive maps and UI/comments even though SQL cannot raise it (`enqueueErrors.ts:9-12,26`; `VisualsPanel.tsx:302`).

`GenerationJob` omits worker/lease/attempt/classification/snapshot/originating-request fields and incorrectly makes `state_version` nullable after migration. `GenerationJobRequest` omits `document_id`, `job_type` and `snapshot_id` (`src/types/generationJob.ts:15-62`).

These do not independently block disposable parsing once the Critical/High migration defects are corrected, but they should be completed in the same narrow local round to prevent diagnostic and maintenance errors.

### R10-M02 — The derived manifest overstates review evidence

**Round 9 predecessor:** R9-H09 — **RESOLVED** for authority.

`migrations/manifest.json` is now unambiguously the sole authority; the Markdown companion is prominently derived/informational only. Both carry the correct checksums and correctly state that no corrective execution evidence exists.

The derived Markdown nevertheless says Rounds 5–10 were “reviewed, applied, and verified” by 209 tests (`migration-manifest.md:89`) before this review, even though this review finds a deterministic KAV defect and no migration was applied. Replace that sentence with precise local-source/test evidence. The JSON's “Updated through Round 10 corrections (R10-H09)” label also pre-judges finding numbering and should use a neutral candidate date/revision. This is evidence-language cleanup, not an authority conflict.

## Migration dependency-order verification

R9-C01 is **RESOLVED**. `generation_source_snapshots` is created at `migration:1119` before the `study_visuals` snapshot FK (`:1290`), job/request snapshot FKs (`:1325-1335`), claimed-context/publication/enqueue functions and final grants. Its RLS and immutability trigger are established before downstream publication references.

Parent keys exist in the required order:

1. `documents_id_user_id_unique` and both analysis unique keys are added before the snapshot table and its composite FKs.
2. `generation_source_snapshots_scope_unique` exists in the snapshot `CREATE TABLE` before job/request snapshot FKs.
3. `generation_jobs_verified_binding_unique` is added before request/usage FKs target it.
4. request binding unique keys exist before the deferred job-originating-request FK.

The missing publication composite FK will require a new local reorder: create `generation_job_usage` and its composite unique target before adding the final `study_visuals` provenance FK.

## Analysis ownership and concurrency assessment

R9-H01 is **RESOLVED**. The preflight rejects owner mismatch and duplicate `document_id` rows before mutation (`migration:431-453`). `document_analysis_document_owner_fk(document_id,user_id) -> documents(id,user_id)` is present and `ON DELETE RESTRICT` (`:1090-1100`). Combined with `documents(id)` being globally unique and `UNIQUE(document_id,user_id)`, it prevents a second same-owner row and a cross-owner row; a separate `UNIQUE(document_id)` is no longer necessary for correctness.

`fn_enqueue_job` reads document and analysis in one MVCC statement, has no `LIMIT 1`, locks the document and uses the same selected variables to hash and insert the snapshot (`:3257-3354`, `:3463-3477`). A concurrent analysis insert that is not visible to that statement is a later source revision, not an ambiguous selected row. Existing-row update/delete yields a transactionally consistent visible version. The new uniqueness/ownership constraints close concurrent duplicate capture.

## Every Round 9 finding status

| Round 9 finding | Round 10 status | Disposition |
|---|---|---|
| R9-C01 invalid snapshot dependency order | **RESOLVED** | Snapshot table and parent keys now precede every downstream FK/function dependency. |
| R9-C02 canonical byte contract | **REGRESSED** | Full KAVs were added, but their alphabetic JSONB-order premise is false and makes migration failure likely; coverage remains incomplete. |
| R9-H01 analysis ownership/global uniqueness | **RESOLVED** | Fail-closed data checks plus composite owner FK and scope uniqueness close the model. |
| R9-H02 visual publication provenance | **PARTIALLY RESOLVED** | Ordering and null coherence fixed; no composite job/ledger/snapshot/user/document/hash/attempt binding. |
| R9-H03 heartbeat/recovery | **PARTIALLY RESOLVED** | Production `finally` fixes renewal; copied tests and absent durable recovery actor/alerting remain. |
| R9-H04 mutation-free D11 preflight | **PARTIALLY RESOLVED** | Source-column and ownership checks improved; available constraint/routine/ACL/default-ACL facts remain unused. |
| R9-H05 ACL proof | **PARTIALLY RESOLVED** | Storage positives and named grants improved; exact ACL/grant-option/proconfig/default/schema/type proof remains open. |
| R9-H06 Storage contract | **PARTIALLY RESOLVED** | Private PNG/5 MiB database limits exist; pre-buffer bound, byte validation, error compatibility and real evidence remain open. |
| R9-H07 D13 behavior tests | **UNRESOLVED** | No production component/timer behavior is exercised. |
| R9-H08 PostgreSQL/RLS/Storage evidence | **UNRESOLVED** | No database or Storage execution occurred; Group B remains skipped. |
| R9-H09 manifest authority | **RESOLVED** | JSON is sole authority and Markdown is derived; evidence wording needs medium cleanup. |
| R7-M01 stale comments/error codes | **UNRESOLVED** | Reused SQLSTATEs, stale P0007 wording and retry misclassification remain. |
| R7-M02 closed database input schema | **RESOLVED** | Empty-object v1 schema remains enforced in app and RPC. |
| R7-M03 raw Storage path logging | **RESOLVED** | Reviewed logging/API paths do not expose raw object paths. |
| R7-M04 dead revision columns | **RESOLVED** | Immutable snapshots remain the source identity; no dead timestamp-revision fields were reintroduced. |
| R8-M01 type/comment drift | **PARTIALLY RESOLVED** | Envelope types improved; job and ledger row interfaces remain incomplete. |
| R8-M02 deprecated direct actions | **RESOLVED** | Deprecated actions remain hard-disabled and perform no base-table DML. |

## New Round 10 issues

1. **R10-C01:** PostgreSQL JSONB output is not alphabetically ordered; the new KAV hashes encode the wrong serializer and are expected to abort migration execution.
2. **R10-H05a:** oversized-image failure code is rejected by the database's closed manifest schema.
3. **R10-H05b:** the 5 MiB check runs only after full base64 decode/URL buffering and MIME is declared rather than byte-validated.
4. **R10-H03a:** heartbeat tests duplicate production control flow instead of exercising it.
5. **R10-M02:** derived manifest text prematurely says Round 10 was reviewed/applied/verified.

## Exact ordered local corrections still required

1. Keep enqueue disabled and do not execute the current candidate. Preserve `beta_foundation_v1.sql` and D11 evidence unchanged.
2. Correct and version the canonical source/request serializer and literal KAVs. Remove every alphabetic-JSONB claim; compare exact literal text and hashes; add the missing semantic/session vectors.
3. Reorder provenance construction: create `generation_job_usage` and its composite publication key before `study_visuals` provenance constraints; replace independent trust with the exact composite FK and positive-attempt coherence rule.
4. Expand the single mutation-free preflight using the existing D11 S4–S9/S9b, S18–S20 and SA01–SA11 evidence. Do not request more catalogue access.
5. Make ACL/default-ACL postconditions exact: normalized entries/grant options, exact `proconfig`, function attributes, schema/column/type authority, policies/RLS and preserved Supabase-managed authority.
6. Complete the Storage worker contract: bounded streaming/decoding, PNG byte validation and one SQL/TypeScript failure-code allowlist. Preserve private staged lost-race objects and signed-owner retrieval.
7. Extract the actual heartbeat controller/timer behavior into testable production code or test the route callback through mocks; add actual D13 component fake-timer/visibility/online/unmount tests after approved dev-dependency installation.
8. Add an approved local synthetic stale-recovery invocation/test and explicit production release gate; do not choose or deploy a D3 provider.
9. Assign distinct SQLSTATEs, classify non-race retry errors normally, remove stale P0007 wording and align raw job/ledger types.
10. Correct manifest evidence wording and recompute/update the sole JSON checksum only after the migration stabilizes; regenerate the derived companion from it.
11. Re-run unit/type/lint/build/static gates, request another static database review, then seek George's exact D12 approval for a named disposable target and synthetic-data test run.

## Required end-state determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** R10-C01 — the full-envelope KAVs use false alphabetic JSONB ordering and are expected to abort the migration; the complete canonical contract remains unproven.
3. **High findings:** incomplete composite visual provenance; incomplete mutation-free preflight; incomplete exact ACL/default-ACL proof; heartbeat/recovery evidence gap; partial worker byte/MIME bound and manifest-code mismatch; absent D13 and database/Storage behavior evidence.
4. **Medium findings:** reused SQLSTATEs, stale P0007/retry wording and classification, incomplete job/ledger types, and overstated derived-manifest evidence.
5. **Every Round 9 finding status:** recorded above with exactly one of RESOLVED, PARTIALLY RESOLVED, UNRESOLVED or REGRESSED.
6. **New Round 10 issues:** five issues are listed above; the canonical KAV defect is Critical.
7. **Exact ordered local corrections still required:** the eleven-step sequence above is required before any migration execution.
8. **Exact founder decisions genuinely required:** no new database product decision is needed for canonicalization, preflight, provenance, ACL or Storage corrections. George should approve the scoped dev-only `jsdom`/Testing Library installation. D3 provider selection and production recovery/worker deployment remain blocked pending comparison, proof of concept and separate George approval. After a clean static review, D12 requires George's exact approval of the disposable environment, credentials, scope and actions.
9. **Whether `study_visuals` composite provenance can be implemented locally now:** **Yes.** The exact target shape is known from migration-created tables and D11; no environment or catalogue access is required.
10. **Whether complete preflight can be implemented using existing catalogue evidence:** **Yes for every listed baseline catalogue category.** Dynamic row compatibility must still be tested at execution time. No additional catalogue fact is presently missing.
11. **Whether jsdom/testing-library installation should be approved:** **Yes**, as pinned development-only dependencies with package/lockfile review. This is ordinary test tooling, not an architecture decision.
12. **Whether a durable recovery actor blocks disposable migration validation:** **No.** It blocks Phase 2 production readiness and D13 release acceptance, not parser/disposable schema validation. D3 blocks provider-specific production implementation, not local testing of the recovery RPC.
13. **Whether disposable migration validation is approved:** **No.** The current KAV is expected to fail deterministically, and provenance/preflight/ACL corrections require another static review first.
14. **Whether database or Storage tests are approved:** **No execution is approved by this review.** Local test implementation may continue. After correction/static approval, George must grant exact D12 disposable-target authority before Group B, RLS, concurrency or Storage tests run.
15. **Whether another catalogue inspection is required:** **No**, unless the target catalogue changes after D11 or a later local design introduces a genuinely new live-object assumption.
16. **Whether Claude may perform another narrowly scoped local correction round:** **Yes**, limited to the ordered corrections and approved dev-test dependency change. No SQL, environment, provider, commit or deployment authority is implied.
17. **Confirmation of actions/state:** This review created only this Markdown file and did not modify implementation, migrations, tests, manifests or earlier reviews; execute SQL; access Supabase/Storage; run Group B/Playwright/browser tests; or stage, commit, push, merge or deploy. Local unit/type/lint/build verification was run. The failed build may refresh ignored `.next` cache state, so this is a confirmation of no implementation or target-environment action, not a claim that no local cache changed.
18. **`git diff --stat`:** captured below after creation of this review.
19. **`git status --short`:** captured below after creation of this review.

### Git diff --stat

```text
 e2e/rls-two-user.spec.ts                           |   25 +-
 ...9120001_generation_job_state_machine_schema.sql | 3349 +++++++++++++++++---
 src/app/actions/generationJobs.ts                  |  253 +-
 src/app/actions/visuals.ts                         |  329 +-
 src/app/api/jobs/status/[jobId]/route.ts           |    2 +-
 src/app/api/jobs/visuals/route.ts                  |  148 +-
 src/app/api/visuals/[documentId]/route.ts          |   94 +-
 src/app/dashboard/study/[id]/page.tsx              |   15 +-
 src/components/study/StudySetView.tsx              |    4 +-
 src/components/study/VisualsPanel.tsx              |  222 +-
 src/lib/jobs/__tests__/idempotencyKey.test.ts      |  170 +-
 src/lib/jobs/__tests__/workerScenarios.test.ts     |  827 ++++-
 src/lib/jobs/enqueueErrors.ts                      |   43 +-
 src/lib/jobs/idempotencyKey.ts                     |  103 +-
 src/lib/jobs/workerClient.ts                       |   58 +-
 src/types/studyVisual.ts                           |   24 +
 16 files changed, 4458 insertions(+), 1208 deletions(-)
```

Standard `git diff --stat` does not include untracked files, including this new review and the pre-existing untracked files listed below.

### Git status --short

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
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round10.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round4.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round5.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round6.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round7.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round8.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round9.md
?? migrations/manifest.json
?? src/lib/jobs/visualsWorker.ts
```
