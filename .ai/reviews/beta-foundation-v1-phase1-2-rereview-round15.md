# Beta Foundation V1 Phases 1–2 — Round 15 Final Static Database Architect Review

**Review date:** 2026-08-04  
**Role:** MoLis Database Architect  
**Scope:** Round 14 High findings, the current corrective migration and manifests, D13 behavior, worker image handling, recovery behavior, and the complete working-tree change inventory.  
**Verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**

## Executive assessment

The candidate is materially stronger than Round 14: all 62 requested Group A tests pass; both previously failing D13 tests now pass; the missing timezone and changed-model hashes are hard-coded; the worker performs stricter MIME and IHDR checks; and recovery tests now drive the captured production `after()` callback rather than a copied controller.

It is not ready for disposable migration validation. The first blocking defect is deterministic: the preflight requires `public.nspowner = postgres`, while the approved D11 authority catalogue records the exact owner as `pg_database_owner`. The migration would therefore reject the actual inspected baseline before its first mutation. The same preflight still omits other available D11 facts, and the final ACL proof admits grant-option and grantor drift. Separate local gaps remain in KAV proof completeness, PNG parsing/deadlines, recovery scenarios, D13 behavioral assertions, and the derived manifest.

This is a local correction verdict, not an architecture rejection. No resolved architecture is reopened.

## Evidence boundary and independent verification

I read the Round 14 review first, inspected every requested current file, inspected the complete tracked diff inventory and relevant implementation hunks, and inspected all untracked files in the requested scope. I did not treat Claude's report as evidence.

Independent local results:

- The exact two previously failing D13 cases were reproduced by name filter and passed: **3 matching assertions passed, 16 skipped**. The name filter selects the maximum-jitter case and two second-poll cases.
- The three requested Group A files passed: **62/62 tests**.
- The actual per-file split is **19 VisualsPanel + 26 worker semantics + 17 recovery**, not Claude's reported 19 + 23 + 20. The aggregate 62 is correct.
- `npx tsc --noEmit` passed with zero errors.
- `npm run lint` passed with zero errors and four warnings in `generationJobs.ts`.
- `git diff --check` passed.
- The build could not be independently reproduced in this restricted environment because Next.js could not fetch Geist and Geist Mono from Google Fonts. This is an environment limitation, not evidence of a code defect and not confirmation of Claude's successful build.
- SHA-256 was independently reproduced:
  - immutable historical migration: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`;
  - corrective migration: `5b554ee52d67e9df664515bca5ec187008e59753d44b6baf0d8260757f1061bd`.
- `migrations/beta_foundation_v1.sql` has no working-tree diff.
- No Group B, SQL, PostgreSQL, RLS, Storage, Supabase, staging, production, commit, push, merge, or deployment action was performed.

## Round 14 finding disposition

| Round 14 finding | Round 15 status | Assessment |
|---|---|---|
| R14-H01 — mandatory KAV proof | **PARTIALLY RESOLVED** | The two missing hashes are present and reproduce independently, but not every mandatory vector asserts a complete independently generated canonical output through the actual canonical function. |
| R14-H02 — D11 preflight completeness | **REGRESSED** | Coverage increased, but the new schema-owner assertion contradicts D11 (`postgres` versus `pg_database_owner`) and would reject the approved baseline. Available index, routine-definition/dependency, and exact schema facts remain incomplete. |
| R14-H03 — exact ACL proof | **PARTIALLY RESOLVED** | Privileges and `MAINTAIN` are now checked individually, but prefix comparisons accept unexpected privilege sets, grantors, and grant options. Default ACL proof is also permissive. |
| R14-H04 — worker URL/PNG boundary | **PARTIALLY RESOLVED** | Exact MIME, IHDR fields/CRC, IEND, redirect rejection, and size caps are present. There is no complete chunk parser, required IDAT proof, all-chunk CRC validation, or bounded provider/download deadline. |
| R14-H05 — production recovery evidence | **PARTIALLY RESOLVED** | The production callback is now exercised. Typed transient refusal, terminal refusal, actual stale authority, validation/upload route behavior, and failure-of-failure behavior remain unproved. |
| R14-H06 — D13 behavior | **PARTIALLY RESOLVED** | All 19 tests pass, including the two former failures, but the suite does not completely prove the stated 2→5→10→30, jitter, abort, cleanup, and identity contract. |
| R14-M01 — stale canonical comments | **RESOLVED** | The canonical comments now describe NUMERIC normalization, `COLLATE "C"`, exponent acceptance, and byte preservation. |
| R14-M02 — derived manifest header | **RESOLVED AS ORIGINALLY STATED; NEW DRIFT FOUND** | The Round 10 header was changed, but the derived file now contains the previous corrective checksum and older Round 13 metadata. See R15-M01. |
| R14-M03 — reported local evidence | **PARTIALLY RESOLVED** | The 62-test aggregate, TypeScript, and lint claims reproduce. The per-file counts are wrong, and the build cannot be confirmed in this restricted environment. |

## High findings

### R15-H01 — D11 preflight contradicts the inspected schema owner and remains incomplete

**Related Round 14 finding:** R14-H02 — **REGRESSED**.

The first mutation remains the `ALTER DEFAULT PRIVILEGES` at migration line 1031. All implemented preflight checks occur before it. However, the new check at lines 833–844 requires the `public` schema owner to be `postgres`. D11 SA10 records:

- owner: `pg_database_owner`;
- exact ACL: `{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}`.

The current preflight will fail on that approved baseline. Its comment incorrectly calls `postgres` the Supabase-managed owner.

Other available D11 facts remain incompletely asserted:

- Index checks prove names, counts, uniqueness/primary/partial flags and selected predicates, but not indexed columns, column order, access method, expressions/opclasses, or complete index definition. D11 S8 supplies columns and `btree` method.
- The five public routines are checked for selected attributes, `proconfig`, and raw `proacl`; their available `prosrc`/full definitions and SA05 dependency/dependent sets are not fingerprinted.
- Exact `public` and relevant `storage` schema ACLs and grant-option states are available in SA10 but not asserted. A non-null `public.nspacl` is not an exact fingerprint.
- Baseline column/type ACL absence is partially checked, but the final proof does not confirm that schema, column, and type authority remained unchanged.

**Required correction:** change the preflight to the D11 exact owner and normalized ACL fact; assert D11 index key/method facts; fingerprint the five routine definitions and relevant dependency/dependent sets using stable comparisons; and assert the exact relevant schema/column/type authority boundary before the first mutation. Do not alter unrelated Supabase-managed authority.

### R15-H02 — Exact ACL proof still admits grant options and wrong grantors

**Related Round 14 finding:** R14-H03 — **PARTIALLY RESOLVED**.

Closed-table and source-table effective privileges, including `MAINTAIN`, are now tested individually. That corrects the prior comma-list/ANY defect. The normalized catalogue proof remains insufficient:

- Function ACL checks use prefixes such as `postgres=X%`, `authenticated=%`, and `service_role=%`. They accept extra privilege characters, a different grantor, and `*` grant-option markers.
- In particular, `postgres=X*/postgres` passes `LIKE 'postgres=X%'`. The current proof therefore does not reject that explicit ACL state.
- `authenticated=X*/postgres`, `service_role=X*/postgres`, or entries granted by an unexpected grantor also satisfy the presence checks and allowed-grantee filter.
- Table `relacl` checks only constrain grantee prefixes. They do not prove exact privilege letters, grantor, or absence of grant options for allowed grantees.
- The default-ACL postcondition rejects some bad entries only when those entries happen to exist. It does not require exact owner-only rows after the migration's three `REVOKE ALL` statements. For example, absent or unexpected authenticated/service-role TABLE defaults can pass; FUNCTION owner/grantor state is not exact; SEQUENCE checks only anon absence.
- No exact final schema, column, or type ACL comparison is made.

`postgres`, as object owner, inherently retains authority to grant even if its explicit ACL item lacks `*`; ownership semantics cannot be removed while retaining that owner. Nevertheless, the approved explicit ACL contract can and should reject an `X*` item. Every non-owner runtime grant option must be prohibited. The postcondition should compare normalized ACL rows for exact grantee, privilege, grantor, and `is_grantable`, with an exact owner entry matching the intended PostgreSQL representation.

**Required correction:** replace string-prefix ACL checks with normalized `aclexplode`/catalogue comparisons (or exact stable ACL arrays where justified) for tables, functions, sequences, and all three default ACLs. Require the precise allowlist and exact privilege set; reject every unexpected grantor and every explicit non-owner grant option; reject unexpected explicit owner grant-option markers if the chosen exact contract is no marker; and repeat the unchanged schema/column/type boundary as a final postcondition.

### R15-H03 — Mandatory KAV evidence is still not complete for every vector

**Related Round 14 finding:** R14-H01 — **PARTIALLY RESOLVED**.

The canonical function itself is statically deterministic for the declared contract:

- numbers are extracted as text and parsed to PostgreSQL `NUMERIC`, normalized with `trim_scale`, classified with `scale`, and negative zero is coerced to zero;
- object keys use explicit `ORDER BY key COLLATE "C"`;
- no authoritative `jsonb::text` rendering is used for numeric spelling.

The new hard-coded hashes for timezone text (`f46a75…`) and the changed-model request (`1369b1…`) reproduce independently. Numeric, collation, Unicode, nested, null/missing, null/empty, CRLF/LF, and model-change hashes are literal rather than self-derived.

The stronger Round 15 criterion is not met uniformly:

- The timezone vector executes the enqueue formatting expression directly, not `fn_canonical_source_v1`; it therefore does not assert the corresponding actual canonical source envelope.
- NULL-versus-missing vectors assert a literal hash but only partial `LIKE` fragments of the canonical output, not a complete independently generated output.
- NULL-versus-empty and CRLF-versus-LF assert exact inputs, differences, and literal hashes, but do not freeze complete expected canonical output strings.
- The trailing-zero case asserts the actual function output `D1.5;` but relies on the preceding decimal vector for its hash rather than carrying an explicit vector-level hash assertion.
- Model change hard-codes both hashes but does not freeze the full expected changed-request canonical text.

The KAV block is expected to parse and execute on PostgreSQL 17 by static inspection: the used `NUMERIC`, `trim_scale`, `scale`, JSONB, `COLLATE "C"`, `to_char`, and PL/pgSQL constructs are available. That is not execution evidence, and the full migration will not reach the block on the D11 baseline until R15-H01 is corrected.

**Required correction:** for each mandatory vector, freeze the exact input, complete expected canonical output, and literal independently computed SHA-256, and compare the actual relevant canonical function output to both. Make timezone equivalence flow through the canonical source envelope, and give trailing-zero and changed-model cases explicit complete vector assertions.

### R15-H04 — Worker image validation and cancellation are still incomplete

**Related Round 14 finding:** R14-H04 — **PARTIALLY RESOLVED**.

The production worker correctly:

- requests `redirect: 'error'`;
- parses the media type and requires case-insensitive exact `image/png`;
- rejects an oversized declared `Content-Length` early;
- streams and enforces a 5 MiB cap;
- validates the PNG signature, complete IHDR fields, allowed bit-depth/color-type combinations, IHDR CRC, and terminal IEND bytes;
- uploads only after those checks;
- returns sanitized failure codes and does not log response bodies, private URLs, storage paths, or provider details.

It still accepts arbitrary bytes between IHDR and IEND. It does not iterate PNG chunks, require at least one IDAT, enforce critical-chunk ordering, validate chunk length boundaries, reject unknown critical chunks, or verify CRCs for chunks other than IHDR. The semantic suite's `makePngBuffer()` constructs signature + IHDR + zero padding + IEND with no IDAT; this is not a structurally adequate PNG, yet it is the fixture used for successful uploads and the near-5-MiB boundary.

There is also no bounded provider or download deadline. The external heartbeat `AbortSignal` is passed to `fetch`, but not into the OpenAI chat/image SDK calls, and no timeout signal is composed. A provider call or a body `reader.read()` can remain pending indefinitely while heartbeats continue. Cancellation may be noticed only after an SDK call returns.

**Required correction:** use a bounded, reviewed PNG parser/decoder or implement complete bounded chunk iteration with safe length arithmetic, IHDR first/once, required IDAT, legal critical ordering, per-chunk CRC, IEND once/last, and rejection of unknown critical chunks. Replace successful fixtures with a real minimal PNG containing valid IDAT data and CRCs. Compose the lease/cancellation signal with explicit provider and download deadlines, pass it to supported SDK request options, cancel the reader on abort, and test timeout/abort behavior without exposing private data.

### R15-H05 — Production recovery tests are real but do not prove all required stop/failure cases

**Related Round 14 finding:** R14-H05 — **PARTIALLY RESOLVED**.

The copied heartbeat simulator is gone. The fake-timer tests invoke the captured production `after()` callback and therefore genuinely exercise the production interval, in-flight guard, thrown-heartbeat counter, successful-renewal reset, authority-loss branch, `job_not_processing`, cancellation acknowledgement, and full-manifest publication arguments.

Remaining gaps:

- No test returns the typed `transient_failure` refusal and proves its bounded delay/retry path. Only thrown failures are bounded in tests.
- No test returns `terminal`.
- `job_not_processing` is a useful authority-loss case, but no explicit attempt-supersession scenario proves an old attempt stops while a newer attempt owns the job.
- The test named “stale authority” resolves before the first heartbeat and proves that no heartbeat fires. It does not create stale authority and does not prove that stale authority cannot publish.
- Provider rate/timeout/internal exceptions and publication throws are covered. Validation/upload failures are only worker semantic results; there is no route-level assertion for how failed staged items are completed/recorded without unsafe publication.
- If `failJob` itself throws, the callback rejects and the row remains processing until lease expiry and a durable stale-recovery actor runs. That actor remains a D3 activation gate and must not be represented as active local evidence.

**Required correction:** add production-callback cases for typed transient refusal, terminal refusal, explicit attempt supersession, stale completion CAS refusal/no publication, validation and upload outcomes, and `failJob` failure followed by the documented lease-recovery expectation. Keep the durable scheduled recovery actor blocked by D3.

### R15-H06 — Passing D13 tests do not yet prove the complete browser behavior contract

**Related Round 14 finding:** R14-H06 — **PARTIALLY RESOLVED**.

Both previously failing cases now pass. The 5-second case correctly lets the first async poll settle before measuring the next relative delay. The maximum-jitter case, however, explicitly relies on Sinon's `parseInt(2499.5) = 2499` scheduling detail. That proves Vitest's implementation, not a portable browser contract. The production contract is better expressed as a delay in `[base, base + 500)` and tested at safe integer boundaries.

Across all 19 tests:

- 2-second and 5-second minimum boundaries are directly asserted.
- 10-second and 30-second steps are reached only through broad `10.6s`/`30.6s` advances, not exact not-before/at-boundary assertions.
- The older jitter test still describes a 600 ms, floored implementation and uses weak `<= 1`/`>= 1` assertions, contradicting the production 500 ms formula.
- No-overlap, terminal completed/failed/cancelled stops, basic hidden/offline pauses, safe combined resume, stale call suppression, document identity change, and listener removal are covered.
- Abort behavior is not directly asserted: the hanging fetch mocks do not prove that the old `AbortSignal` becomes aborted on unmount, terminal stop, or document/job identity change.
- Identity tests prove old job URLs do not reappear after a document change, but do not prove abortion/rejection of an already in-flight old response.

**Required correction:** replace the Sinon-specific fractional boundary with portable interval assertions; directly assert exact 10-second and capped 30-second not-before/at behavior after each settled poll; fix the stale 600 ms comments/assertions; and directly inspect captured `AbortSignal` state plus stale-response suppression for unmount and identity change.

## Medium findings

### R15-M01 — The derived Markdown manifest is stale

`migrations/manifest.json` is correctly marked the sole authority. It contains the current corrective checksum `5b554e…`, the unchanged historical checksum, `locally_authored_not_executed`, no database/Storage evidence, the maintenance contract, and the fresh-project prerequisite gap.

`.ai/inspection/migration-manifest.md` correctly labels itself derived, but its Migration 2 table and execution-order block still record `8c917d…`, its evidence table says corrections only through Rounds 5–13, and its footer says Round 13. The two manifests therefore conflict. The JSON wins by contract, but the human companion is not accurate.

**Required correction:** update the derived checksum, round/evidence language, and footer from the authoritative JSON after all migration edits are final.

### R15-M02 — Claude's per-file test counts are inaccurate

The aggregate 62 is reproducible, but the actual distribution is 19/26/17, not 19/23/20. This does not invalidate the passing aggregate; it does weaken the supplied evidence report.

### R15-M03 — Build evidence remains environment-qualified

TypeScript and lint reproduce. The local build failed only because this restricted environment could not reach Google Fonts. Record Claude's build as separately reported evidence, not as independently reproduced evidence in this review.

## Group B classification

The following are **required during disposable PostgreSQL validation**, not unresolved TypeScript/local-unit blockers:

1. Authenticated User A versus User B RLS isolation across the foundation tables and supporting tables.
2. The concurrent duplicate-job/idempotency race under real PostgreSQL locking, constraints, RPCs, and transaction behavior.

Neither is completed. They require a successfully applied corrective migration in a disposable Supabase/PostgreSQL environment and the separately approved 49 Group B tests. They must not run against the present migration because the local static blockers must be corrected first.

## Evidence classification

- **Semantic unit evidence:** worker boundary functions are exercised with mocked OpenAI, Storage, RPC, and fetch collaborators; 26 tests pass.
- **Mocked production-controller evidence:** the real route callback and timer code execute, but database, provider, Storage, and recovery actors are mocks; 17 tests pass.
- **jsdom behavioral evidence:** React polling behavior executes under jsdom and fake timers; 19 tests pass. This is not a real-browser timer or network proof.
- **Static SQL evidence:** SQL text, catalogue predicates, KAV structure, ACL logic, checksums, and migration ordering were inspected only.
- **PostgreSQL/RLS/Storage evidence:** absent for this candidate. No parser, migration, postcondition, RLS, Storage, race, or rollback execution occurred.

## Ordered required local corrections

1. Correct the false `public` schema-owner preflight and complete all available D11 fingerprints before the first mutation.
2. Replace ACL prefix/effective checks with exact normalized ACL and default-ACL postconditions, including grantor and grant-option state.
3. Complete each mandatory KAV's full expected canonical output and independent hash assertion through the actual canonical function.
4. Implement complete bounded PNG chunk validation and provider/download timeout/abort propagation; replace the invalid success fixture.
5. Complete production-route recovery scenarios, especially typed transient, terminal, attempt supersession, stale publication, validation/upload, and failure-of-failure.
6. Make D13 timing assertions portable and complete exact 2→5→10→30 plus direct abort/identity cleanup proof.
7. Update `migrations/manifest.json` only if the migration checksum changes, then regenerate the derived Markdown values from it.
8. Re-run Group A, TypeScript, lint, diff checks, and a network-capable build; request another narrow static Database Architect review before any migration or Group B execution.

## Files reviewed

- `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round14.md`
- `migrations/20260729120001_generation_job_state_machine_schema.sql`
- `migrations/beta_foundation_v1.sql` for immutability/checksum verification
- `migrations/manifest.json`
- `.ai/inspection/migration-manifest.md`
- D11 catalogue and additional-authority CSVs where needed to validate preflight claims
- `src/components/study/VisualsPanel.tsx`
- `src/components/study/__tests__/VisualsPanel.test.tsx`
- `src/lib/jobs/visualsWorker.ts`
- `src/lib/jobs/__tests__/visualsWorker.semantics.test.ts`
- `src/app/api/jobs/visuals/route.ts`
- `src/lib/jobs/__tests__/visualsRoute.recovery.test.ts`
- `src/lib/jobs/workerClient.ts` for typed heartbeat outcomes
- the complete tracked working-tree file inventory, diff stat/numstat, relevant diff hunks, and requested untracked artifacts

## Final determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** None. The wrong schema-owner assertion is fail-closed rather than unsafe, but it is a High execution blocker.
3. **High findings:** D11 preflight contradicts the inspected owner and omits available facts; ACL proof admits grantor/grant-option drift; mandatory KAV proof is not uniform; PNG/deadline handling is incomplete; production recovery scenarios are incomplete; D13 assertions do not fully prove the contract.
4. **Medium findings:** derived manifest checksum/metadata drift; inaccurate per-file test counts; build evidence remains environment-qualified.
5. **Every Round 14 finding status:** R14-H01 **PARTIALLY RESOLVED**; R14-H02 **REGRESSED**; R14-H03 **PARTIALLY RESOLVED**; R14-H04 **PARTIALLY RESOLVED**; R14-H05 **PARTIALLY RESOLVED**; R14-H06 **PARTIALLY RESOLVED**; R14-M01 **RESOLVED**; R14-M02 **RESOLVED AS ORIGINALLY STATED, WITH NEW MANIFEST DRIFT**; R14-M03 **PARTIALLY RESOLVED**.
6. **New Round 15 issues:** the D11 `pg_database_owner` contradiction; exact function/table/default ACL grant-option and grantor holes, including acceptance of `postgres=X*/postgres`; invalid no-IDAT “valid PNG” fixtures and missing deadlines; incomplete production recovery/D13 assertions; and stale derived-manifest checksum/round metadata.
7. **Exact remaining blocker, limited to one where possible:** correct the pre-first-mutation `public` schema owner/ACL fingerprint to the exact D11 fact. Until then, the migration deterministically rejects the inspected baseline. The other High corrections remain required before approval.
8. **Whether D13 evidence is complete:** **No.** All 19 tests pass, but exact 10/30 boundaries, portable jitter, direct abort, and in-flight identity-change proof remain incomplete.
9. **Whether canonical KAV evidence is complete:** **No.** The function is statically deterministic and the new hashes are correct, but every mandatory vector does not yet freeze complete expected output through the relevant actual canonical function.
10. **Whether preflight is sufficient:** **No.** It contains a D11-disproved schema-owner assertion and omits other available exact facts.
11. **Whether ACL proof—including grant options—is sufficient:** **No.** `postgres=X*/postgres` and runtime-role `X*`/wrong-grantor entries can pass current prefix checks; table/default/schema/column/type proof is not exact.
12. **Whether worker PNG/URL validation is complete:** **No.** Redirect, MIME, size, IHDR and IEND handling improved, but full PNG chunk/IDAT/CRC validation and bounded provider/download timeout/abort are absent.
13. **Whether recovery tests exercise production code:** **Yes, the current tests invoke the real captured production controller; no, their scenario coverage is not yet complete.**
14. **Whether migration manifest is accurate:** **The authoritative JSON is accurate at the reviewed checksum and still says not executed; the derived Markdown companion is inaccurate and stale.**
15. **Whether disposable migration validation is approved:** **No.** Another local correction round and static approval are required first.
16. **Whether the 49 Group B tests are approved after successful disposable migration application:** **Not for this candidate.** They are the correct next PostgreSQL/RLS/race evidence after the local blockers are fixed, a corrected migration successfully applies and validates in a disposable environment, and George authorizes that environment/test run.
17. **Whether another local correction round is required:** **Yes.**
18. **Confirmation no implementation or environment action occurred:** This review created only this review file. No implementation, migration, manifest, test, or earlier review was modified. No SQL, PostgreSQL, Supabase, Storage, Group B, staging, production, commit, push, merge, or deployment action occurred. Only read-only inspection and local Group A/type/lint/build-attempt checks were performed.
19. **`git diff --stat`:** 19 tracked files changed, 6,909 insertions and 1,300 deletions. Plain `git diff --stat` excludes untracked artifacts, including this review.
20. **`git status --short`:** captured after this file was created and reported verbatim in the handoff. The pre-existing dirty implementation/review tree remains, plus this new untracked review file.
