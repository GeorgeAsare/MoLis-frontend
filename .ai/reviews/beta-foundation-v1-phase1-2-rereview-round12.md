# Beta Foundation V1 Phases 1–2 — Database Architect Round 12 Final Static Review

**Date:** 2026-08-04  
**Role:** MoLis Database Architect  
**Review type:** final static working-tree gate; no SQL or environment access  
**Verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**

## Scope and evidence boundary

I independently read the Round 11 and Round 10 reviews, the final D11 reconciliation, the founder decisions, the complete current corrective migration, both migration manifests, the relevant application and test files, and the current working-tree diff. I did not rely on Claude's report.

This review did not execute SQL, access Supabase or Storage, run any Group B test, modify implementation/migration/test/manifest/package files, or stage, commit, push, merge or deploy. It created only this review file.

Allowed local verification produced:

- `npm test -- --run`: **262 passed, 49 skipped**, 0 failed across 12 files. The 49 skipped specifications are Group B PostgreSQL/RLS/Storage tests and are not database evidence.
- `npx tsc --noEmit`: **passed**.
- `npm run lint`: **0 errors and 4 warnings**. The warnings are the four known unused parameters in deliberately disabled compatibility functions.
- `git diff --check`: **passed**.
- `npm run build`: **not independently reproduced**. The restricted runner could not fetch Geist and Geist Mono from Google Fonts. This is not a demonstrated application defect, but Claude's build-pass statement is not corroborated by this review.
- Historical migration SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`.
- Corrective migration SHA-256: `26a9b57f56fd36d037d2cdd1b3445258739d8c63a9699b9a7314b39537020a17`.
- The historical migration has no tracked diff. The corrective checksum matches `migrations/manifest.json` and the derived Markdown companion.
- Independent Node SHA-256 over the literal `KAV-SRC-1`, `KAV-SRC-2`, and `KAV-REQ-1` expected texts reproduced their three recorded hashes. This verifies those literals only; it is not PostgreSQL execution evidence.

## Executive assessment

Round 12 fixes the deterministic DDL-order failure. `generation_job_usage` and its parent publication unique key now precede the `study_visuals` provenance FK, and `fn_complete_and_publish_job` is created after the complete publication graph. The intended six-column visual provenance is declaratively strong and publication remains one transaction.

The candidate nevertheless cannot pass the final static gate. The new recursive serializer still obtains authoritative number spelling from `p_value::TEXT`, sorts object keys with the database's ambient collation, and does not canonicalize numerically equivalent decimals. Its KAV block omits several specifically required fixed vectors and does not hard-code hashes for several vectors it does include. The hash contract therefore still violates the explicit Round 12 acceptance boundary.

The D11 preflight and ACL proof also remain incomplete. In particular, the migration fingerprints only the function default-ACL before-state, leaves the inspected broad non-DML authority on `documents` and `document_analysis`, and does not prove exact final default/schema/column/type/function authority. Worker URL-response bounds, production heartbeat exception handling, and several D13 behavioral assertions remain incomplete as well.

These are concrete defects in the current implementation. No new catalogue inspection or founder architecture decision is needed to correct them.

## Critical findings

### R12-C01 — The authoritative canonical hash contract still depends on JSONB rendering and ambient collation

`fn_canonical_jsonb_v1` is a material improvement: it recursively tags values, frames strings and object keys by UTF-8 byte length, preserves array order, distinguishes SQL null/JSON null/missing/empty string, and is used by both the source and request envelopes. Enqueue formats source timestamps in UTC and derives UUIDs, schema versions, operation/model configuration, source digest and request hash in the database.

The required deterministic contract is still not achieved:

1. The number branch assigns `v_text := p_value::TEXT`. This is the precise `jsonb::text` dependency Round 12 prohibited. Integer/decimal classification and spelling are therefore delegated to PostgreSQL JSONB output rather than an explicit numeric grammar.
2. `1.0` and `1.00` can retain distinct scales in JSONB output. The function emits `D1.0;` and `D1.00;`, so numerically equivalent decimal representations need not canonicalize equally. The required decimal-equivalence vector is absent.
3. Object keys use `ORDER BY key` without `COLLATE "C"` or an explicit UTF-8-byte sort. Ordering therefore depends on the database collation, while the comments claim ASCII ordering. The preflight asserts UTF-8 encoding but not a collation that makes the claim true.
4. The comments say callers must normalize CRLF/LF and NFC/NFD while the function intentionally performs no normalization. The actual byte-preserving policy can be valid, but it must be stated unambiguously as “distinct inputs remain distinct”; no caller normalization is enforced by the database.
5. The TypeScript comments claim hashing does not rely on JSONB rendering, while the production numeric branch does exactly that.

The top-level source/request functions otherwise use fixed field order and self-delimiting framing. `source_digest` and `request_hash` share `fn_sha256_hex` and the recursive JSONB helper, but sharing an incomplete helper does not make the contract deterministic across every required environment and representation.

**Required correction:** replace the JSONB-to-text numeric branch with an explicit bounded `numeric` grammar. Normalize scale first, canonicalize negative zero, classify normalized scale-zero values as integers and other values as decimals, emit no exponent, and reject values outside the reviewed precision/scale bounds. Sort object keys with an explicit deterministic byte/collation rule such as `COLLATE "C"`. State CRLF/LF and NFC/NFD as deliberately byte-distinct unless an actual database normalization step is introduced. Recompute every affected literal and checksum.

## High findings

### R12-H01 — Required canonical KAV coverage is still incomplete

The migration-time KAV block is real executable PL/pgSQL, not a comment. The three full-envelope expected strings are visible and their hard-coded SHA-256 values independently match those literal strings. The existing SQL-null/missing/JSON-null/value and LF/CRLF envelope hashes are also hard-coded.

Coverage remains short of the required contract:

- no timezone-equivalent timestamp-offset vector exercises the actual UTC conversion used by enqueue;
- no decimal textual-equivalence vector exists;
- no NFC-versus-NFD pair exists;
- no changed-model or changed-operation-configuration request vector exists;
- reordered-object, changed-array-order, Boolean, nested-object/array and Unicode vectors compare canonical text only and do not contain hard-coded expected hashes;
- the Unicode vector covers precomposed `café` only;
- the object-order vector does not expose collation differences because it uses only `a` and `b`.

Expected and actual values are not calculated by the same SHA helper for the three main literal fixtures, which is good. The implemented KAV statements appear syntactically capable of running and their current narrow fixtures are expected to pass on the intended PostgreSQL version. They do not prove the required canonical contract, and they cannot make R12-C01 safe.

**Required correction:** add literal canonical text and independently generated, hard-coded SHA-256 values for every required dimension. The timestamp vector must exercise two offset-equivalent `timestamptz` inputs through the same UTC formatting expression used by enqueue. Numeric vectors must prove textual equivalence after the new numeric normalization. Unicode vectors must explicitly freeze the chosen NFC/NFD policy. Changed model/config vectors must prove request-hash divergence.

### R12-H02 — The fail-before-mutation D11 fingerprint is expanded but not complete

The first mutation is still the first `ALTER DEFAULT PRIVILEGES`. Before it, Round 12 now verifies the exact four baseline PKs, nine FKs with delete actions/non-deferrability, the known source-type check, source-table index counts, selected index definitions, routine language/return/volatility/strictness, routine `proconfig`, exact routine ACL text, exact four-table ACL text, the function default ACL, the complete `study-visuals` bucket row, and all eleven Storage policy definitions. These are genuine improvements.

The following already-inspected D11 facts remain unasserted or only partially asserted:

- full column counts/properties for `documents` and every relevant column outside the selected source subset;
- exact index properties for every index, including uniqueness, primary/partial flags and predicates rather than count plus permissive `LIKE` fragments;
- exact bodies/definitions and dependency/dependent sets of all five existing public routines;
- the exact relevant trigger set and the document trigger's `tgtype`, enabled state, constraint state and full definition;
- exact public/storage schema ACL before-state;
- absence of column ACLs and relevant type ACLs;
- exact `postgres/public` **TABLE** and **SEQUENCE** default-ACL before-states; only FUNCTION is checked;
- normalized ACL grantor/grantee/grant-option facts where raw ACL ordering is not a safe logical contract.

There is no genuinely missing relevant catalogue fact in the existing D11 evidence. D11 S2/S8/S9/S9b and SA01–SA11 contain the omitted facts. The omission is local implementation work, not a reason for another inspection.

### R12-H03 — Final ACL proof is incomplete, and source-table non-DML authority remains broad

For the five closed internal/publication tables, the migration revokes all runtime table privileges. For every new function it performs full PUBLIC/named-role revocation and then grants authenticated or temporary service-role execution through a narrow allowlist. Exact owner, SECURITY DEFINER mode, and function-local `search_path` are checked for all listed functions.

The comma-list `has_table_privilege` call in the final table loop is being used only as a negative ANY test: if any prohibited privilege remains, the migration aborts. It is not being used to claim that a role holds all privileges, so its ANY semantics are logically valid for that one question. It nevertheless does not satisfy the requested individual and exact authority proof.

Concrete gaps remain:

1. Preflight confirms `documents` and `document_analysis` currently grant all eight table privileges to anon, authenticated and service role. The migration never reconciles those two tables. RLS does not govern `TRUNCATE`, `TRIGGER`, `REFERENCES` or `MAINTAIN`; leaving those privileges conflicts with the final D11 authority design. Authenticated owner CRUD may be preserved, but anon and unnecessary service authority and all runtime non-DML authority must be revoked.
2. Final function checks prove effective EXECUTE for anon/authenticated/service role, not exact normalized ACL rows, grantors, grant options, PUBLIC and unexpected grantees.
3. The approved owner is checked through ownership but its required table/function authority is not enumerated individually.
4. No final postcondition proves the changed TABLE/FUNCTION/SEQUENCE default ACLs.
5. No final postcondition proves schema, column or type authority stayed within the reviewed boundary.
6. Function language, return type, volatility, strictness and trigger linkage are not included in the final function postconditions.
7. Sequence proof is only an absence test for names matching `generation_job%`; it is not an exact proof for every relevant sequence/default privilege.

**Required correction:** reconcile `documents`/`document_analysis` privileges exactly as D11 specified while preserving active authenticated owner CRUD and existing owner policies. Compare normalized ACL rows for every relevant table/function/default privilege, including PUBLIC, anon, authenticated, service role, postgres/approved owner, grantor and grant option. Prove each required/prohibited privilege individually, and assert exact schema/column/type/default/function-attribute postconditions without altering unrelated Supabase-managed authority.

### R12-H04 — Worker Storage validation does not cover or safely bound the URL path

The production worker and semantic mocked tests prove several important properties:

- 5 MiB post-decode/post-buffer rejection before upload;
- early rejection when a valid `Content-Length` exceeds 5 MiB;
- eight-byte PNG signature rejection;
- `image/png`, `upsert:false`, exact private attempt path, and no raw path in logs;
- safe failed-item shapes for provider and upload errors;
- no upload for tested oversized base64 or invalid-signature base64 data.

The required boundary is still incomplete:

- base64 is decoded in full before size rejection;
- URL responses are consumed through `arrayBuffer()` without a streaming byte cap when length is absent, invalid or dishonest;
- response `Content-Type` is never checked;
- fetch follows redirects implicitly; no bounded/manual redirect or unexpected-destination policy exists;
- a PNG signature alone is not structural/decoder validation;
- all current semantic image-byte tests use `b64_json`; no test invokes the production URL-fetch branch, redirect handling, response MIME, absent/invalid length, streaming overflow or unexpected response handling.

The tests are mocked semantic tests of production `stageVisualsForJob`, not SQL string assertions, but their coverage is not complete. A failed image is intentionally published as a sanitized failed manifest item when another valid item exists; with the current one-image beta configuration, a non-empty all-failed manifest is rejected by the publication RPC and the route then attempts the safe job-failure transition.

### R12-H05 — Local recovery behavior is improved but still not fully proven against production control flow

Route-level mocked tests now invoke the captured production `after()` callback and prove provider/timeout/unexpected-stage failures, publication RPC failure, safe failure fields, and claim-not-won early return. Production code resets `heartbeatInFlight` in `finally`, resets retry count on successful renewal, aborts on authority loss, acknowledges cancellation, and bounds typed transient results.

Remaining defects/gaps are concrete:

- heartbeat stop/retry tests still execute a copied `simulateHeartbeatController`, not the production interval callback;
- an unexpected thrown exception from `heartbeatJob` is not caught by the interval callback. `finally` resets the guard, but no retry is counted, no abort occurs and the async interval rejection can be unhandled;
- no route-level timer test proves slow-heartbeat overlap prevention, guard reset after every branch, transient retry exhaustion, or a stale-lease refusal;
- invalid-image/upload behavior is tested at the worker item level, not through the route's final publication/failure outcome;
- no local semantic invocation of the stale-recovery RPC exists.

The durable scheduled recovery actor remains a **D3 production activation gate**, not a local migration-schema defect. Provider selection, proof of concept and separate George approval remain required before production worker/reconciler deployment.

### R12-H06 — D13 jsdom evidence is genuine but not complete

The 15 tests render the actual component under jsdom with fake timers. They behaviorally cover approximate 2/5 progression, progression through 10 to the 30-second cap, one request in flight, hidden/offline pauses, combined hidden-and-offline gating, resume, terminal stop, unmount stopping, and listener removal.

The explicit D13 acceptance list is not fully proven:

- the 2-second test allows a broad 2.6-second window, and the jitter test checks only the zero-jitter minimum;
- exact 5-second and 10-second “not before / at boundary” behavior is not isolated;
- the 30-second cap is shown to fire after 30.6 seconds but not proven not to exceed or fire before the defined jitter window;
- maximum jitter is not tested;
- independent pause states are tested online-while-hidden, but not visible-while-offline in the same combined-state sequence;
- no rerender changes document/job identity;
- no test asserts `AbortController.abort()` on unmount or identity change;
- the stale-response test only unmounts and contains no observable state assertion;
- listener removal is asserted, but timer cancellation is inferred only from the absence of another fetch rather than directly controlled across identity changes.

Static source-text tests do not substitute for these missing behavioral assertions.

## Medium findings

### R12-M01 — Canonicalization documentation describes the intended contract, not the current implementation

Both requested files now correctly state that PostgreSQL is authoritative, identify `fn_canonical_jsonb_v1`, and mark the TypeScript helpers non-authoritative. They also state that hashing does not rely on JSONB rendering or key order. That statement is false while the production number branch uses `p_value::TEXT`, and the claimed alphabetical order is not pinned to a deterministic collation. `idempotencyKey.ts` separately acknowledges “PostgreSQL numeric and string rendering,” which contradicts the no-rendering statement. Correct the implementation first, then make the comments describe the exact numeric/collation/normalization contract.

### R12-M02 — Manifest checksums/status are accurate; metadata pre-judges this review

`migrations/manifest.json` is clearly the sole authority, contains both correct checksums, marks the corrective migration not executed, and claims no database or Storage evidence. The Markdown companion is clearly derived/informational and carries the same correct checksum and “not executed” status. Neither claims PostgreSQL/disposable/staging/production execution.

The JSON note still says it is updated through Round 10 while its checksum note says Round 12. The derived companion says Rounds 5–12 were “reviewed and applied” before this final Round 12 verdict existed. This does not undermine checksum or execution-state integrity, but the evidence wording should be regenerated after the candidate passes review rather than pre-judging the gate.

### R12-M03 — Build evidence is environment-dependent

Claude reports a passing build. This review's build attempt reached Next.js/Turbopack but failed only because the restricted runner could not fetch Google Fonts. No code-level build failure was identified. Record the build as reported but not independently reproduced here; a supported connected CI run remains the appropriate evidence.

## Migration ordering and provenance determination

The migration is statically ordered for PostgreSQL object dependency resolution:

1. Parent source-table unique constraints precede snapshot composite FKs.
2. `generation_source_snapshots`, its columns, RLS and immutability guard precede all job/request/visual snapshot references.
3. `generation_jobs_verified_binding_unique` precedes `generation_job_usage`'s composite FK.
4. `generation_job_usage` and `generation_job_usage_publication_unique` precede `study_visuals_usage_provenance_fk`.
5. The snapshot immutability function precedes both snapshot and usage triggers.
6. Ledger binding functions precede their constraint triggers.
7. Canonical SHA/JSONB/source/request functions precede `fn_enqueue_job`.
8. `fn_complete_and_publish_job` is created only after `generation_jobs`, `generation_job_requests`, `generation_source_snapshots`, `generation_job_usage`, `study_visuals`, all provenance columns, parent unique keys and child FKs exist.

The `study_visuals` child FK binds `(source_job_id,user_id,document_id,source_snapshot_id,source_request_hash,publication_attempt)` to the exact usage tuple `(job_id,user_id,document_id,snapshot_id,request_payload_hash,attempt_count)`. The usage row is itself bound to the verified job tuple, and the verified job is deferred-bound to the exact ledger request. This prevents mixed user/document/snapshot/job/request/attempt provenance. The coherence check deliberately allows the all-NULL legacy state and requires a positive publication attempt for verified rows. Completion inserts usage first, then upserts every provenance field, inside the same transaction; any later failure rolls back the terminal job update, usage and visual publication.

## Evidence classification

| Evidence class | Current evidence | What it does not prove |
|---|---|---|
| Semantic unit tests | Pure state/idempotency models and production worker calls with mocked OpenAI/Supabase/Storage | PostgreSQL parsing, RLS, ACLs, transactions or real Storage behavior |
| Mocked route tests | Captured production `after()` callback for claim/stage/publish/fail paths | Durable invocation, production timers, database CAS or lease races |
| Local heartbeat simulation | Copied decision loop | Production callback wiring or thrown-callback handling |
| jsdom behavioral tests | 15 actual `VisualsPanel` render/timer/network-state tests | The missing identity/abort/stale/jitter boundary cases and real browser behavior |
| Static SQL/source checks | Ordering/presence/string assertions over the migration | PostgreSQL parser/catalog/runtime correctness |
| Group B | 49 skipped PostgreSQL/RLS/Storage specifications | No execution evidence exists; they remain unrun |

## Every Round 11 finding status

| Round 11 finding | Round 12 status | Determination |
|---|---|---|
| R11-C01 provenance FK ordering | **RESOLVED** | Usage table and parent unique now precede the child FK; completion function follows the graph. |
| R11-C02 complete canonical contract | **PARTIALLY RESOLVED** | Recursive typed framing added; JSONB numeric text and ambient key collation remain authoritative. |
| R11-H01 KAV coverage | **PARTIALLY RESOLVED** | More executable vectors added; required timezone/decimal/NFC/config and hard-coded hash coverage remains incomplete. |
| R11-H02 D11 preflight | **PARTIALLY RESOLVED** | PK/FK/index/routine/bucket checks expanded; complete columns/routine source/dependencies/triggers/schema-column-type/default ACLs remain incomplete. |
| R11-H03 ACL proof | **PARTIALLY RESOLVED** | All new functions are included in owner/path/role checks; normalized ACL/default/source-table/attribute proof remains incomplete. |
| R11-H04 worker Storage bounds | **PARTIALLY RESOLVED** | Production semantic tests added for base64 size/signature/path/upload; URL streaming/MIME/redirect/structural proof is absent. |
| R11-H05 local recovery | **PARTIALLY RESOLVED** | Route failure tests added; heartbeat remains a copied simulation and thrown callback/stale/recovery evidence remains open. |
| R11-H06 D13 behavior | **PARTIALLY RESOLVED** | Fifteen genuine jsdom tests exist; exact timing/jitter/identity/abort/stale/cleanup cases remain incomplete. |
| R11-M01 Node/jsdom engine mismatch | **RESOLVED** | Node 24 is pinned and the declared supported range matches every direct test dependency; Node 25 is not declared supported. |
| R11-M02 stale derived checksum | **RESOLVED** | JSON and Markdown checksums match the current migration; metadata wording remains a new medium evidence issue. |
| R11-M03 retired serializer comments | **PARTIALLY RESOLVED** | Authority/reference language corrected, but it overstates the current production serializer. |

## Exact required local correction set

1. Correct `fn_canonical_jsonb_v1` numeric canonicalization and deterministic object-key ordering; add the complete literal-text/hard-coded-hash KAV suite and align comments.
2. Finish the pre-first-mutation D11 fingerprint from existing evidence and complete normalized final ACL/default/function/schema/column/type postconditions. Reconcile `documents` and `document_analysis` runtime privileges without changing their existing owner policies.
3. Bound base64 before allocation where practical, stream URL responses through a 5 MiB cap, enforce response MIME, define bounded redirect/unexpected-response handling, add structural PNG validation, and test the actual URL branch.
4. Exercise production heartbeat control flow and catch/count unexpected callback errors; add route-level stale/invalid/upload/publication/retry evidence while keeping durable scheduling under D3.
5. Complete the exact D13 timing/jitter/identity/abort/stale/timer/listener cases against the rendered component.
6. Recompute the sole authoritative checksum after edits, regenerate derived wording, rerun local gates under Node 24, and request one narrow static re-review before any D12 disposable execution request.

The first and decisive migration-execution blocker is **R12-C01/R12-H01: the authoritative canonical serializer and KAV contract are not yet deterministic and complete**. The ACL/preflight corrections remain independent high-severity static gates and should be completed in the same local round.

## Required end-state determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** R12-C01 — authoritative numeric serialization still uses `jsonb::text`, object ordering uses ambient collation, and decimal equivalence is undefined.
3. **High findings:** incomplete canonical KAVs; incomplete D11 preflight; incomplete exact ACL proof and unreconciled source-table non-DML privileges; incomplete URL Storage boundary; incomplete production recovery proof; incomplete D13 behavior evidence.
4. **Medium findings:** canonical comments overstate implementation; manifest metadata pre-judges Round 12; build pass was not independently reproducible because Google Fonts were unreachable.
5. **Every Round 11 finding status:** recorded in the table above using RESOLVED or PARTIALLY RESOLVED; no resolved architecture was reopened without current-code evidence.
6. **New Round 12 issues:** R12-C01 numeric/collation defect; R12-H01 missing mandatory KAV/hash vectors; R12-H02 incomplete remaining D11 fingerprint; R12-H03 retained source-table non-DML privileges; R12-H04 unbounded/untested URL path; R12-H05 uncaught production heartbeat throws; R12-H06 incomplete exact D13 assertions; R12-M01/M02 evidence wording drift.
7. **Exact remaining blocker:** the first precise blocker is the canonical serializer/KAV contract in R12-C01/R12-H01. The six-item local correction set above is required before execution approval.
8. **Whether migration ordering is valid:** **Yes.** Tables, parent keys, columns, constraints, functions and triggers reviewed here precede their first dependent reference; `fn_complete_and_publish_job` follows the complete publication graph.
9. **Whether canonical hashing is deterministic:** **No for the required contract.** Fixed top-level framing and recursive type tokens are present, but number spelling still comes from JSONB text and object ordering is not explicitly collation-independent.
10. **Whether the KAVs are expected to execute successfully:** **The implemented narrow KAV statements are statically expected to run and pass, but the mandatory suite is incomplete.** This is not PostgreSQL execution evidence.
11. **Whether `study_visuals` composite provenance is complete:** **Yes.** Exact job/user/document/snapshot/request-hash/attempt binding, deliberate all-NULL legacy state and atomic usage-first publication are present.
12. **Whether preflight is sufficient for disposable validation:** **No.** It still omits available D11 column/routine-dependency/trigger/schema-column-type/default-ACL facts and exact index properties.
13. **Whether ACL proof is complete:** **No.** Exact normalized entries/defaults/attributes and `documents`/`document_analysis` authority reconciliation remain incomplete.
14. **Whether worker Storage validation is complete:** **No.** Base64 and URL pre-allocation bounds, URL MIME/redirect/unexpected response behavior, stronger PNG validation and URL-path semantic tests remain open.
15. **Whether local recovery behavior is complete:** **No.** Route failure paths are materially better tested, but production heartbeat exception/retry/stale behavior and local recovery invocation are not fully proven. The durable actor remains a D3 production gate.
16. **Whether D13 behavioral evidence is complete:** **No.** The tests are genuine jsdom behavior tests, but exact delay/jitter, identity change, abort and observable stale-response/timer cleanup cases remain missing.
17. **Whether Node/test dependency handling is acceptable:** **Yes for disposable validation tooling.** `.nvmrc` contains `24`; package engines are `^22.22.2 || ^24.15.0`; jsdom 30.0.1, Vitest 4.1.10 and Testing Library support that range; Node 25 is not declared; all added test packages are dev-only and imported only from tests.
18. **Whether the migration manifest is accurate:** **Yes for authority, checksums and execution state.** JSON is sole authority, both checksums match, the corrective migration is not executed, and no environment evidence is claimed. Round labels/evidence prose need post-review cleanup.
19. **Whether disposable migration validation is approved:** **No.** Correct the canonical, preflight and ACL gates and obtain another static approval plus George's exact D12 target/action authorization.
20. **Whether the 49 Group B tests are approved after successful migration execution:** **Not by this review.** After corrected static approval, successful application to an explicitly approved synthetic disposable target, and George's exact D12 authorization, the Group B suite may be separately authorized. It remains unrun now.
21. **Whether another catalogue inspection is required:** **No**, unless the target catalogue has changed since D11. Existing evidence contains every fact identified as missing from the migration preflight.
22. **Whether another local correction round is required:** **Yes**, narrowly limited to the six corrections above. No D3 provider deployment or production work is authorized.
23. **Confirmation no implementation or environment action occurred:** This review created only this Markdown file. It did not modify implementation, migrations, tests, manifests, packages or earlier reviews; execute SQL; access Supabase/Storage; run Group B; or stage, commit, push, merge or deploy. Only local Group A/static/jsdom/type/lint/build-attempt verification was performed; the build attempt may refresh ignored `.next` cache files and changed no target environment.
24. **`git diff --stat`:**

```text
 e2e/rls-two-user.spec.ts                           |   25 +-
 ...9120001_generation_job_state_machine_schema.sql | 4068 +++++++++++++++++---
 package-lock.json                                  |  779 ++++
 package.json                                       |    6 +
 src/app/actions/generationJobs.ts                  |  257 +-
 src/app/actions/visuals.ts                         |  329 +-
 src/app/api/jobs/status/[jobId]/route.ts           |    2 +-
 src/app/api/jobs/visuals/route.ts                  |  148 +-
 src/app/api/visuals/[documentId]/route.ts          |   94 +-
 src/app/dashboard/study/[id]/page.tsx              |   15 +-
 src/components/study/StudySetView.tsx              |    4 +-
 src/components/study/VisualsPanel.tsx              |  223 +-
 src/lib/jobs/__tests__/idempotencyKey.test.ts      |  170 +-
 src/lib/jobs/__tests__/workerScenarios.test.ts     |  989 ++++-
 src/lib/jobs/enqueueErrors.ts                      |   36 +-
 src/lib/jobs/idempotencyKey.ts                     |  110 +-
 src/lib/jobs/workerClient.ts                       |   58 +-
 src/types/generationJob.ts                         |   20 +-
 src/types/studyVisual.ts                           |   24 +
 19 files changed, 6131 insertions(+), 1226 deletions(-)
```

Standard `git diff --stat` excludes untracked files, including this review.

25. **`git status --short`:**

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
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round12.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round4.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round5.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round6.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round7.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round8.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round9.md
?? .nvmrc
?? migrations/manifest.json
?? src/components/study/__tests__/
?? src/lib/jobs/__tests__/visualsRoute.recovery.test.ts
?? src/lib/jobs/__tests__/visualsWorker.semantics.test.ts
?? src/lib/jobs/visualsWorker.ts
```

## Governance state

- Branch: `feature/remediate-beta-foundation-v1`.
- Rejected HEAD preserved: `7a2029fa2dfda82bd8727bbf1ec6069083391d16`.
- `main` and `origin/main`: `7f723138e0e7d522aa7ba2428ba07513ecf9ec62`.
- `migrations/beta_foundation_v1.sql` remains byte-for-byte unchanged.
- The implementation remains uncommitted.
- No SQL, Supabase, Storage, staging, production, commit, push, merge or deployment action occurred.
