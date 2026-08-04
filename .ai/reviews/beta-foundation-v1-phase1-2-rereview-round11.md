# Beta Foundation V1 Phases 1–2 — Database Architect Round 11 Final Static Review

**Date:** 2026-08-03  
**Role:** MoLis Database Architect  
**Review type:** Final static working-tree review; no SQL or environment access  
**Verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**

## Scope and evidence boundary

I independently read the Round 10 and Round 9 reviews, the final D11 reconciliation, founder decisions, both migration manifests, the complete corrective migration, the current application/worker/test changes and the complete tracked working-tree diff. I also inspected the untracked `visualsWorker.ts` and `VisualsPanel.test.tsx` implementation evidence. I did not rely on Claude's summary.

No SQL was executed. No Supabase or Storage environment was accessed. No Group B, Playwright, browser, RLS or Storage test was run. No file other than this review was created or modified by this review.

Independent local verification produced:

- `npm test -- --run`: **221 passed, 49 skipped** across 10 files. The 49 skipped specifications are Group B and are not database evidence.
- `npx tsc --noEmit`: **passed**.
- `npm run lint`: **0 errors, 4 warnings**, all unused parameters in deliberately disabled compatibility functions.
- `npm run build`: **not independently reproduced**. The restricted environment could not fetch Geist/Geist Mono from Google Fonts. This is not an identified application defect, but Claude's clean-build claim is not corroborated here.
- `git diff --check`: **passed**.
- Historical migration SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`; no tracked diff exists for that file.
- Corrective migration SHA-256: `be4043f67f929f2e8ffeef5c7bf1d5f4ff07b1c999df7810487cec9a02595dac`; this matches `migrations/manifest.json`.

The local passes are semantic unit/model tests, mocked client tests, jsdom tests and static source-text assertions. They are not PostgreSQL parser, transaction, RLS, ACL, concurrency or Storage evidence.

## Executive assessment

Round 11 replaces the false alphabetical-JSONB KAV premise with fixed top-level field order and length framing, adds an intended composite visual-provenance relationship, improves worker error-code compatibility and PNG signature checks, adds jsdom component tests, pins test dependencies, and records the correct corrective checksum in the sole authoritative JSON manifest.

The candidate still cannot be applied to a disposable database. A new deterministic dependency-order defect adds `study_visuals_usage_provenance_fk` before `public.generation_job_usage` or its referenced composite unique key exists. PostgreSQL must resolve both at `ALTER TABLE ... ADD CONSTRAINT`, so the migration must fail at that statement and roll back.

The canonical contract also remains incomplete: structured analysis arrays/objects are serialized through `jsonb ->>`, the request input uses `jsonb::text`, missing and JSON null collapse to the same marker, and numeric grammar remains PostgreSQL JSONB output. The KAVs do not exercise the dimensions required by Round 11. Preflight and ACL exactness also remain materially below the already available D11 evidence. These are concrete current-code defects; no architecture decision or additional catalogue inspection is needed.

## Critical findings

### R11-C01 — Composite provenance foreign key precedes its parent table and key

At migration lines 1323–1329, `study_visuals_usage_provenance_fk` references:

`public.generation_job_usage(job_id,user_id,document_id,snapshot_id,request_payload_hash,attempt_count)`.

The referenced table is not created until lines 1383–1406, and `generation_job_usage_publication_unique` is not added until lines 1411–1413. The line-1322 comment incorrectly says the unique constraint was “added above.” PostgreSQL cannot add a foreign key to a relation that does not yet exist, nor can it reference a column set that is not yet primary/unique. The KAV block and final grants are therefore unreachable in a real execution.

The publication function itself has the correct transaction-local write order: it inserts `generation_job_usage` at lines 2488–2494 before upserting `study_visuals` at lines 2496–2513. Once the DDL is reordered, the six-column composite FK will bind job, user, document, snapshot, request hash and attempt, and the usage row's own composite FK will transitively bind those values to the verified job/request graph.

**Required correction:** create `generation_job_usage`, its primary/composite unique/FK/check constraints, RLS, revokes and immutability trigger before adding `study_visuals_usage_provenance_fk`. Add a static dependency-order assertion for the parent table and parent unique key. Retain usage-first publication and `ON DELETE RESTRICT`.

### R11-C02 — Canonical hashing is explicitly framed but not yet a complete canonical data contract

`fn_canonical_source_v1` and `fn_canonical_request_v1` fix top-level field sequence and use an unambiguous `field=v:<UTF-8-byte-length>:<value>\n` frame. SQL NULL and empty string are distinct; timestamps are formatted explicitly in UTC before being passed to the source serializer; UUIDs, schema versions, model identifiers and named operation settings occupy fixed fields. CRLF/LF and NFC/NFD are intentionally not normalized, so byte-distinct source values remain distinct.

However, the implementation still violates Round 11's required boundary:

- every structured analysis array/object is converted with `p_analysis_data ->> '<field>'`, which delegates object key ordering, numeric spelling, Boolean spelling and nested formatting to PostgreSQL JSONB output;
- `p_sanitized_input::TEXT` is an explicit incidental JSONB text cast. V1 currently permits only `{}`, but the serializer claims a general contract and will become unsafe as soon as a version accepts structured input;
- absent analysis keys, JSON `null`, and a null analysis object all become the same `field=NULL` text (`->>` returns SQL null for each), despite Round 11 requiring a defined missing/null distinction;
- integers and operation decimals are extracted from JSONB text rather than checked and serialized with explicit type-specific grammar;
- there is no explicit recursive contract for strings, Booleans, arrays or structured objects.

The source digest hashes the source serializer and the request hash includes that digest, but the request serializer is not the same complete reviewed type contract. The current design is deterministic only for its fixed scalar subset and PostgreSQL-version-specific JSONB rendering, not for the full requested envelope.

**Required correction:** define one versioned recursive canonical-value serializer with distinct tokens for missing, null, Boolean, integer, decimal, UTF-8 string, ordered array and key-sorted object; reject unsupported numeric forms; use it for every analysis field, sanitized input and operation field. Preserve explicit UTC timestamp and UUID validation. Bump the envelope version if the byte contract changes after execution; this candidate remains unexecuted and may be corrected in place under the approved local process.

## High findings

### R11-H01 — The KAV block validates its scalar fixtures, but does not validate the required contract

The KAVs compare literal expected canonical strings and hard-coded SHA-256 values against the serializer output. Expected hashes are not computed through the production SQL helper. Independent local Node SHA-256 over the literal KAV-SRC-1, KAV-SRC-2 and KAV-REQ-1 strings reproduces all three expected hashes; independent reconstruction also reproduces the null/empty and LF/CRLF hashes.

Those current scalar fixtures are expected to pass on PostgreSQL 17 after the DDL-order defect is fixed. They cannot execute in the current migration because R11-C01 occurs first. The repository contains comments claiming independent Node generation, but no committed generator/transcript that independently constructs the complete expected byte contract.

Coverage is incomplete. It has null analysis, one UTC timestamp string, one empty request envelope, SQL null versus empty string, and CRLF versus LF. It lacks hard-coded exact-string/hash vectors for Unicode, populated nested arrays/objects, reordered object keys, changed array order, missing versus JSON null, timezone-equivalent input timestamps, explicit integer/decimal/Boolean grammar, decimal edge cases, and NFC versus NFD. No session-variation KAV is present. Thus the existing KAVs are valid for the narrow literal fixtures but not a valid complete PostgreSQL 17 contract suite.

### R11-H02 — Mutation-free preflight still uses only part of the D11 catalogue

The first mutation remains the `ALTER DEFAULT PRIVILEGES` at line 668. Before it, the migration verifies owners/RLS for four tables, exact transformed-table column sets, source-column properties, two checks and one unique constraint, the generation-jobs index count/two secondary definitions, two public policies, selected target-table effective privileges, absence of proposed objects, routine names/basic owner/security, one document trigger, row compatibility, target-trigger absence, bucket identity/public state and eleven Storage policies.

It still does not fail closed on the complete available D11 contract:

- exact PKs, unique constraints, FKs, update/delete actions, deferrability/validation and all checks for every referenced/altered table;
- exact relevant index definitions for `documents`, `document_analysis`, `study_visuals` and the generation-jobs primary index;
- exact signatures, language, return type, volatility, strictness, security mode, owner, `proconfig`, source definition, dependencies and EXECUTE ACLs of all five existing routines;
- the full relevant trigger set and definitions;
- normalized schema/table/column/function/sequence/type ACLs, grantors and grant options;
- exact `postgres/public` default-ACL before-state;
- the full `study-visuals` bucket row, including the D11-null size/MIME fields and preserved fields.

D11 S4–S9/S9b, S18–S20 and SA01–SA11 already contain those facts. **No relevant catalogue fact is genuinely unavailable.** Another read-only inspection is unnecessary unless the target catalogue has changed since D11.

### R11-H03 — Final ACL intent is narrow, but exact proof is incomplete

Required Storage service privileges are checked individually. The table comma-list at lines 3964–3966 is used for a negative “does any prohibited privilege remain?” question, so `has_table_privilege` ANY semantics is logically suitable there; it is not evidence that all required privileges exist.

The final proof remains incomplete because:

- the owner/security/search-path loop omits both canonical serializer functions;
- `proconfig` checks use `EXISTS` and permit additional unexpected GUC settings rather than exact array equality;
- effective privilege checks cover anon/authenticated/service_role but do not compare normalized ACL entries for PUBLIC, postgres/approved owner, unexpected grantees, grantors and grant options;
- changed default ACLs are not asserted after mutation;
- schema, column and type authority is not postconditioned;
- sequences are handled only by asserting no matching sequence name;
- exact function language, volatility, strictness and return types are not postconditioned.

Use normalized catalogue/`aclexplode` comparisons and exact function-attribute/proconfig arrays while leaving unrelated Supabase-managed authority untouched.

### R11-H04 — Worker Storage bounds and their tests remain incomplete

The worker now has a 5 MiB post-buffer check, an early `Content-Length` check for URL responses, an eight-byte PNG signature check, the exact `{user}/{document}/{job}/{attempt}/{uuid}.png` path, private staged paths, `image/png`, `upsert:false`, and the database-compatible `STORAGE_UPLOAD_FAILED` code. Application DTOs omit raw Storage paths and image prompts; owner-checked server signing remains the display path.

It still fully decodes `b64_json` before checking size and fully buffers URL responses through `arrayBuffer()` when `Content-Length` is absent, invalid or dishonest. Fetch follows redirects implicitly; there is no bounded/manual redirect policy, destination allowlist or private-network protection. The response `Content-Type` is not checked. An eight-byte magic check is not full PNG structural/decoder validation. No semantic worker test invokes the production download/decode/upload logic for oversized bodies, invalid lengths, redirects, MIME/signature failures, exact path, safe failure shape or path non-disclosure. Existing assertions are static SQL/source checks, not worker behavior.

### R11-H05 — Local recovery behavior is improved but not completely proven

Production route code resets the heartbeat guard in `finally`, resets retry count after success, aborts on authority loss, acknowledges cancellation, bounds typed transient heartbeat results, routes provider/upload/publication failures through `failJob`, and relies on CAS/lease checks plus private unreferenced staged objects after lost publication races. The SQL recovery RPC is batch-bounded, `SKIP LOCKED`, cancel-safe and attempt-limited.

The heartbeat tests execute a copied `runFakeHeartbeat`, not an imported production controller. Unexpected throws inside the async interval callback reset the guard but are not caught/classified or counted toward bounded retry; they become unhandled callback rejections. No semantic route test proves provider, upload or publication failure transitions, retry exhaustion, stale lease rejection or unexpected internal failure wiring. No local synthetic call proves the recovery RPC. Durable scheduled recovery remains a production activation gate under D3 and is correctly not claimed as executable evidence.

### R11-H06 — The 12 jsdom tests are behavioral, but D13 proof is incomplete

All 12 tests render the actual component under jsdom and use Vitest fake timers; two use controlled pending promises. They behaviorally cover an approximate 2-second first poll/5-second next poll, advancement through 10 seconds to the 30-second cap, one in-flight request, hidden pause/resume, offline pause/resume, terminal completed/failed/cancelled stop and no later poll after unmount.

They do not make jitter deterministic (`Math.random` is not stubbed) or assert jitter bounds; do not isolate the exact 10-second step; do not test hidden and offline as independent simultaneous blockers; do not prove that visible-but-offline or online-but-hidden remains paused; do not assert `AbortController.abort()` on unmount or document/job change; never rerender with a changed document/job; do not spy on timer/listener removal; and the stale-response test has no behavioral assertion beyond “does not crash.” Therefore the suite is genuine jsdom evidence, but not complete D13 acceptance evidence.

## Medium findings

### R11-M01 — Pinned jsdom is outside the current Node engine range

The three direct packages are exact-pinned and dev-only: `@testing-library/jest-dom@7.0.0`, `@testing-library/react@16.3.2`, and `jsdom@30.0.1`. They appear only in the test file, are not imported by product code, and are not production dependencies. Testing Library peers support React 19; Vitest and TypeScript checks pass.

The current runtime is Node `v25.9.0`. `jsdom@30.0.1` declares `node: ^22.22.2 || ^24.15.0 || >=26.0.0`, so Node 25 is outside its supported engine range even though the 12 tests happen to pass. The test toolchain is therefore not formally compatible with the current Node runtime. Use a project-supported Node 24.15+ or 26+ runtime, or select an exact jsdom version whose declared engine includes the project's chosen Node version.

### R11-M02 — JSON manifest is accurate; derived Markdown checksum is stale

`migrations/manifest.json` is explicitly and solely authoritative. Its full corrective SHA-256 matches the actual file, the historical checksum is unchanged, and the corrective migration is marked `locally_authored_not_executed` with no database/Storage evidence. It does not claim parser, disposable, staging or production execution.

The derived `.ai/inspection/migration-manifest.md` is clearly labeled informational, but still records the old corrective checksum `46f46b...` while the actual/JSON checksum is `be4043...`. It also describes the local suite as “verified” through Round 11 before this review. Regenerate it from the JSON authority after the migration stabilizes; this mismatch does not change which manifest is authoritative.

### R11-M03 — Error/type cleanup is materially improved but comments still describe the retired serializer

Safe enqueue classifications and job/ledger TypeScript fields are improved, and P0007 is no longer exposed. `src/app/actions/generationJobs.ts` still says the request is serialized as PostgreSQL `jsonb::TEXT`, while `src/lib/jobs/idempotencyKey.ts` describes an obsolete JSONB alphabetical-order contract. Those comments now contradict the migration's intended serializer and could mislead the next correction. SQLSTATE reuse noted in Round 10 also remains. This does not independently block disposable parsing, but should be corrected with R11-C02.

## Every Round 10 finding status

| Round 10 finding | Round 11 status | Disposition |
|---|---|---|
| R10-C01 canonical serializer/KAV | **PARTIALLY RESOLVED** | Fixed top-level ordering/framing and corrected narrow hashes; structured JSON, missing/null and required KAV coverage remain incomplete. |
| R10-H01 visual provenance | **REGRESSED** | Exact composite shape and usage-first publication were added, but its FK appears before the parent table/key and deterministically aborts migration execution. |
| R10-H02 mutation-free preflight | **PARTIALLY RESOLVED** | Existing checks remain useful; the available D11 constraint/routine/trigger/ACL/default-ACL/bucket facts are still not fully fingerprinted. |
| R10-H03 ACL proof | **PARTIALLY RESOLVED** | Narrow grants and individual Storage positives remain; exact normalized ACL/function/default/schema/column/type proof is incomplete. |
| R10-H04 heartbeat/recovery | **PARTIALLY RESOLVED** | Production guard reset and bounded typed outcomes exist; copied tests, thrown-callback handling, semantic transition evidence and durable D3 runner remain open. |
| R10-H05 worker Storage bound | **PARTIALLY RESOLVED** | Failure code and PNG signature improved; pre-allocation/streaming bounds, redirects, content type, decoder validation and semantic tests remain open. |
| R10-H06 D13/database/Storage evidence | **PARTIALLY RESOLVED** | Twelve real jsdom tests were added; required interaction/cleanup cases and all Group B evidence remain absent. |
| R10-M01 SQLSTATE/comments/types | **PARTIALLY RESOLVED** | Public classification and raw types improved; SQLSTATE reuse and obsolete canonicalization comments remain. |
| R10-M02 manifest evidence | **PARTIALLY RESOLVED** | JSON authority/checksum/status are correct; the derived Markdown checksum/evidence wording is stale. |

## New Round 11 issues

1. **R11-C01:** `study_visuals_usage_provenance_fk` precedes the `generation_job_usage` table and parent unique key.
2. **R11-C02:** explicit framing still delegates structured values to JSONB text and collapses missing with null.
3. **R11-H01:** the added KAV set is narrow and cannot execute in the current migration order.
4. **R11-H04:** no production worker semantic tests exist, and URL/base64 bodies remain unbounded before allocation.
5. **R11-H06:** the 12 jsdom tests do not cover several explicitly required D13 cases.
6. **R11-M01:** `jsdom@30.0.1` excludes the current Node 25 runtime in its declared engines.
7. **R11-M02:** the informational Markdown manifest has the previous corrective checksum.

## Exact remaining local corrections

The narrow blocking correction set is:

1. Reorder `generation_job_usage` and its parent composite unique key before `study_visuals_usage_provenance_fk`; add an order assertion.
2. Replace remaining structured `->>`/`jsonb::text` hashing with a versioned typed canonical-value grammar and add literal KAV text/hash fixtures for every Round 11 dimension.
3. Complete the pre-first-mutation D11 fingerprint and final normalized ACL/function/default-ACL postconditions using existing catalogue evidence.
4. Add bounded decoding/streaming, explicit redirect/content-type/full-PNG validation and semantic worker tests.
5. Complete the missing D13/recovery behavioral cases against production code; align the supported Node/jsdom version.
6. Recompute the JSON checksum after those edits and regenerate the informational Markdown manifest. Then request another static review before any D12 disposable execution approval.

No new founder product decision is required for these corrections. D3 continues to block the final production worker/recovery actor, not local source correction. D12 still requires George's explicit approval for a named disposable environment and exact actions.

## Required end-state determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** R11-C01 deterministic parent-table/key ordering failure; R11-C02 incomplete canonical structured-value contract.
3. **High findings:** incomplete KAV coverage; incomplete fail-before-mutation fingerprint; incomplete ACL proof; incomplete worker Storage bounds/semantic tests; incomplete local recovery proof; incomplete D13 behavior proof.
4. **Medium findings:** unsupported Node 25/jsdom 30.0.1 pairing; stale derived-manifest checksum/evidence wording; remaining SQLSTATE/comment drift.
5. **Every Round 10 finding status:** recorded in the table above using exactly RESOLVED, PARTIALLY RESOLVED, UNRESOLVED or REGRESSED.
6. **New Round 11 issues:** seven concrete issues are listed above; R11-C01 is a newly introduced deterministic execution failure.
7. **Exact remaining corrections:** the six-step narrow local correction set above is required; the first non-negotiable blocker is moving the usage table/unique key before the child FK.
8. **Whether canonical hashing is deterministic:** **No, not for the complete required contract.** Scalar framing is deterministic, but structured arrays/objects, sanitized JSON, missing/null and numeric grammar still rely on PostgreSQL JSONB rendering.
9. **Whether KAVs are valid for PostgreSQL 17:** **Partially.** Their literal narrow hashes are correct and are expected to pass after DDL reorder, but the suite is incomplete and cannot execute in the current migration.
10. **Whether `study_visuals` provenance is declaratively complete:** **No in executable DDL.** The intended six-column relationship is sufficient in shape, but its parent table/key do not exist when the FK is added.
11. **Whether preflight handling is sufficient for disposable execution:** **No.** It omits D11-derived constraint, routine, trigger, ACL/default-ACL and complete bucket fingerprints.
12. **Whether ACL proof is complete:** **No.** Exact normalized ACLs, grant options/grantors, complete function attributes/proconfig, defaults, schema/column/type and owner coverage remain missing.
13. **Whether worker Storage bounds are complete:** **No.** URL/base64 allocation, redirects, response MIME, full PNG validity and semantic production-path tests remain incomplete.
14. **Whether local recovery behavior is complete:** **No.** Core production paths are present, but copied heartbeat tests and missing unexpected-callback/route/recovery semantic evidence remain; durable scheduling stays gated by D3.
15. **Whether D13 behavioral proof is complete:** **No.** The 12 tests are genuine jsdom tests, but jitter, combined pause states, abort-on-unmount/change, document/job change, stale-state assertion and listener/timer cleanup are not fully proven.
16. **Whether dependencies are acceptable:** **Not yet as a supported toolchain.** They are exact, dev-only and test-limited, but jsdom 30.0.1 does not support the current Node 25 engine range.
17. **Whether the migration manifest is accurate:** **The sole authoritative JSON is accurate; the derived Markdown is stale.** Actual JSON checksum match: `be4043f67f929f2e8ffeef5c7bf1d5f4ff07b1c999df7810487cec9a02595dac`.
18. **Whether disposable migration validation is approved:** **No.** The current migration has a deterministic DDL-order failure and unresolved static safety gates.
19. **Whether Group B database and Storage tests are approved after successful disposable migration:** **Not by this review.** After correction, another static approval, successful disposable migration, and George's exact D12 environment/action approval, those tests may be authorized. They remain unrun and unapproved now.
20. **Whether another catalogue inspection is required:** **No**, unless the target catalogue has changed since D11. Existing D11 evidence covers the missing static facts.
21. **Whether another local correction round is required:** **Yes**, narrowly limited to the six corrections above. No production-provider implementation is authorized.
22. **Confirmation no implementation or environment action occurred:** This review created only this Markdown file. It did not modify implementation, migrations, tests, manifests or earlier reviews; execute SQL; access Supabase/Storage; run Group B/Playwright/browser tests; or stage, commit, push, merge or deploy. Local unit/type/lint/build checks were run; the failed build may refresh ignored `.next` cache files but changed no target environment.
23. **`git diff --stat`:**

```text
 e2e/rls-two-user.spec.ts                           |   25 +-
 ...9120001_generation_job_state_machine_schema.sql | 3669 +++++++++++++++++---
 package-lock.json                                  |  779 +++++
 package.json                                       |    3 +
 src/app/actions/generationJobs.ts                  |  253 +-
 src/app/actions/visuals.ts                         |  329 +-
 src/app/api/jobs/status/[jobId]/route.ts           |    2 +-
 src/app/api/jobs/visuals/route.ts                  |  148 +-
 src/app/api/visuals/[documentId]/route.ts          |   94 +-
 src/app/dashboard/study/[id]/page.tsx              |   15 +-
 src/components/study/StudySetView.tsx              |    4 +-
 src/components/study/VisualsPanel.tsx              |  223 +-
 src/lib/jobs/__tests__/idempotencyKey.test.ts      |  170 +-
 src/lib/jobs/__tests__/workerScenarios.test.ts     |  830 ++++-
 src/lib/jobs/enqueueErrors.ts                      |   36 +-
 src/lib/jobs/idempotencyKey.ts                     |  103 +-
 src/lib/jobs/workerClient.ts                       |   58 +-
 src/types/generationJob.ts                         |   20 +-
 src/types/studyVisual.ts                           |   24 +
 19 files changed, 5576 insertions(+), 1209 deletions(-)
```

Standard `git diff --stat` excludes untracked files, including this review.

24. **`git status --short`:**

```text
 M e2e/rls-two-user.spec.ts
 M migrations/20260729120001_generation_job_state_machine_schema.sql
 M package-lock.json
 M package.json
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
 M src/types/generationJob.ts
 M src/types/studyVisual.ts
?? .ai/inspection/
?? .ai/reviews/beta-foundation-v1-d11-catalogue-reconciliation.md
?? .ai/reviews/beta-foundation-v1-d11-final-reconciliation.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round10.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round11.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round4.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round5.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round6.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round7.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round8.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round9.md
?? migrations/manifest.json
?? src/components/study/__tests__/
?? src/lib/jobs/visualsWorker.ts
```

## Governance state

- Branch: `feature/remediate-beta-foundation-v1`.
- HEAD/rejected commit preserved: `7a2029fa2dfda82bd8727bbf1ec6069083391d16`.
- `main` and `origin/main`: `7f723138e0e7d522aa7ba2428ba07513ecf9ec62`.
- Historical migration remains byte-for-byte unchanged.
- The implementation remains uncommitted.
- No SQL, Supabase, Storage, staging, production, commit, push, merge or deployment action occurred.
