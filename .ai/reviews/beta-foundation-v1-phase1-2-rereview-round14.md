# Beta Foundation V1 Phases 1–2 — Round 14 Final Narrow Static Database Review

**Review date:** 2026-08-04  
**Role:** MoLis Database Architect  
**Scope:** Only the unresolved Round 12 static blockers: canonical hashing/KAVs, D11 preflight and ACL proof, worker image boundary, recovery evidence, D13 evidence, and migration-manifest accuracy.  
**Verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**

## Scope and evidence boundary

I read the Round 12 review first, inspected every requested current file, and inspected the complete tracked working-tree diff and untracked-file inventory. I did not treat Claude's report as evidence.

Static/local verification performed:

- `shasum -a 256 migrations/beta_foundation_v1.sql migrations/20260729120001_generation_job_state_machine_schema.sql` reproduced:
  - historical baseline: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`;
  - corrective migration: `8c917d8c5912e5742902d29c76b60bcabf9b816edfc8ba2720c6e5cee115e39f`.
- `migrations/beta_foundation_v1.sql` has no working-tree diff and remains byte-for-byte unchanged at the recorded checksum.
- Independent Node SHA-256 calculations reproduced the hard-coded numeric, collation, nested and NFC/NFD hashes. For reference, the missing hard-coded timezone text hash would be `f46a75be78d92927fa330974ed449c45abd83afff88112ce7a050624d3e51a8a`, and the currently used changed-model request fixture (`gpt-image-3`) would hash to `1369b1bb7a8b55b2d20056e16ef9456561c4f638f3b4c4a686ecf364ebebda49` under the implemented contract. These are local independent calculations, not PostgreSQL evidence.
- Targeted Group A execution only:
  - `visualsWorker.semantics.test.ts` and `visualsRoute.recovery.test.ts` passed;
  - `VisualsPanel.test.tsx` failed 2 of 19 tests;
  - aggregate: **51 passed, 2 failed, 53 tests**.
- `npx tsc --noEmit` passed.
- `npm run lint` completed with 0 errors and the reported 4 warnings.
- `git diff --check` passed.
- `npm run build` reached the Next.js build but failed because this restricted environment could not fetch the Geist fonts from Google. This does not disprove Claude's successful build in a network-capable environment, but it is not a local successful-build result.
- No Group B test was run. No PostgreSQL parser, migration, RLS, Storage, Supabase, staging, or production action was run.

## Round 12 blocker disposition

| Round 12 blocker | Round 14 disposition | Static assessment |
|---|---|---|
| R12-C01 numeric/collation canonicalisation | **Resolved** | The number branch parses the JSON scalar into `NUMERIC`, applies `trim_scale`, canonicalizes negative zero, classifies with `scale`, and emits normalized `NUMERIC` text. It does not use `p_value::TEXT` or `jsonb::text` as the authoritative spelling. Object iteration explicitly uses `ORDER BY key COLLATE "C"`. |
| R12-H01 mandatory KAV suite | **Partially resolved** | Numeric equivalence, negative zero, exponent form, locale-sensitive keys, NFC/NFD, nested structures and model change are exercised. The timezone fixture and changed-model fixture still lack their own independently hard-coded hashes. |
| R12-H02 D11 preflight completeness | **Partially resolved** | New source-column counts, trigger attributes, source-column ACL absence, and table/sequence default-ACL before-states are before the first mutation. Several already-inspected D11 facts remain unasserted or permissively asserted. |
| R12-H03 exact ACL proof | **Partially resolved** | Source-table privileges are actively reconciled and CRUD is individually checked. Exact normalized authority, `MAINTAIN`, changed default ACLs, and schema/column/type boundaries are not fully proved. |
| R12-H04 worker URL/PNG boundary | **Partially resolved** | Redirects, streaming cap, size header and URL-branch tests were added. MIME matching and structural PNG validation remain too permissive. |
| R12-H05 production recovery evidence | **Partially resolved** | Production now catches thrown heartbeats and bounds retries. The critical heartbeat tests still exercise a copied simulator rather than the production callback; partial/stale assertions do not prove their descriptions. |
| R12-H06 D13 behavior | **Not resolved** | The suite is broader, but two new exact-boundary tests fail and several assertions remain approximate or incorrectly timed. |
| R12-M02 manifest evidence wording | **Mostly resolved** | The authoritative JSON is accurate and current. Its derived Markdown companion retains one stale `Updated Round 10` header comment. |

## Critical findings

None. The Round 12 critical numeric/collation defect is corrected in the current function body.

## High findings

### R14-H01 — The mandatory KAV proof remains incomplete

**Evidence:** migration lines 4040–4083.

The timezone fixture sends two offset-equivalent `timestamptz` inputs through the production UTC formatting expression and asserts equal exact text. It does not assert an independently hard-coded hash. The model-change fixture proves two locally produced hashes differ and hard-codes only the baseline hash; it does not hard-code the expected changed-model hash. This is precisely the same-helper comparison weakness Round 12 required the KAVs to avoid.

The other newly added literal hashes independently reproduce. Numeric equivalence (`1`, `1.0`, `1.50`), negative zero, exponent input, C-collation key order, nested structures and NFC/NFD are substantively covered.

**Required local correction:** add literal, independently computed hashes for the exact timezone output and changed-model/configuration fixture. Prefer also asserting the changed request's full expected canonical text. Align the stale serializer comments at lines 3248–3271 with the implemented NUMERIC/C-collation/byte-preserving policy.

### R14-H02 — D11 fail-before-mutation coverage is still incomplete

**Evidence:** the first mutation is line 909. All implemented D11/preflight `DO` blocks end before it. However, index checks at lines 321–327 and 572–595 still use count plus permissive `LIKE` fragments and do not prove complete uniqueness/primary/partial/predicate properties. The five existing public routines are checked for selected attributes and raw ACL text, but their exact definitions/bodies and inspected dependency/dependent sets are not fingerprinted. Exact `public`/`storage` schema ACLs and relevant type ACL absence are also not asserted. Column-ACL absence is limited to `documents` and `document_analysis` rather than the complete inspected target set.

These facts are not missing from D11. The prior reconciliation and Round 12 review identify them in the existing D11 catalogue/authority evidence. They are locally implementable omissions; no new read-only inspection is justified on the current evidence set.

**Required local correction:** before line 909, fingerprint the complete already-inspected index properties, routine definitions and relevant dependency sets, exact schema ACLs, all relevant column ACL absence, and relevant type ACL absence. Use normalized catalogue comparisons where raw ACL array order is not a logical contract.

### R14-H03 — Final ACL postconditions do not prove the complete intended authority

**Evidence:** migration lines 4640–4802.

The migration now revokes source-table anon access, retains authenticated/service-role CRUD, and revokes non-DML privileges. That is a real correction. The proof remains incomplete:

- closed-table privileges are tested through comma-list negative-ANY calls rather than individually as required;
- source-table prohibited checks omit `MAINTAIN`, despite explicitly revoking it;
- function checks prove effective EXECUTE for three runtime roles, not exact normalized grantor/grantee/grant-option/PUBLIC/unexpected-grantee rows;
- no final postcondition proves the new TABLE/FUNCTION/SEQUENCE default ACLs created by the first mutations;
- no final postcondition proves schema, column and type authority remained within the reviewed boundary;
- approved-owner authority and every relevant function attribute/dependency are not fully enumerated.

**Required local correction:** prove every required and prohibited table privilege individually, including `MAINTAIN`; compare normalized ACL rows for tables, functions and default ACLs; prove owner, PUBLIC and unexpected-grantee/grant-option absence; and assert the unchanged schema/column/type boundary without altering unrelated Supabase-managed authority.

### R14-H04 — Worker URL handling is bounded but PNG/MIME validation is not complete

**Evidence:** `visualsWorker.ts` lines 205–266 and 302–316.

The worker correctly uses `redirect: 'error'`, checks `Content-Length`, streams through a 5 MiB byte cap, uploads with `image/png`, avoids logging the private URL/path/body, and has real tests through the URL branch. Lost-race objects remain private through the already-reviewed Storage design.

Two defects remain:

1. `contentType.startsWith('image/png')` accepts invalid media types such as `image/png-malicious`. Parse the media type and require case-insensitive exact `image/png`, allowing only normal parameters after `;`.
2. A 16-byte sequence containing the PNG signature, IHDR length and `IHDR` label is accepted as “structurally valid.” It need not contain the 13-byte IHDR payload, valid dimensions, chunk CRC, image data or IEND. The test helper deliberately constructs such non-PNG byte sequences and calls them valid. This is a header-prefix check, not structural/decoder validation.

**Required local correction:** use a bounded format-aware PNG parser/decoder or implement a reviewed bounded chunk validator that at minimum validates the complete IHDR, legal non-zero dimensions/bit-depth/color fields, chunk boundaries/order, CRCs and terminal IEND. Add malformed/truncated/IHDR-dimension/chunk-boundary tests and exact MIME tests. Continue to keep the 5 MiB cap before decoding and never log URL, path, body, provider detail or user content.

### R14-H05 — Recovery tests do not yet exercise the production heartbeat control flow

**Evidence:** `visualsRoute.recovery.test.ts` lines 252–465 and 482–527; production route lines 96–163.

Production now catches thrown `heartbeatJob` calls, counts them as transient, resets the in-flight guard in `finally`, aborts after three failures, aborts on authority loss, and acknowledges cancellation. This source correction is sound statically.

The tests for thrown heartbeats, retries, authority loss and cancellation still run a copied `simulateHeartbeatController`; they cannot detect drift in the actual interval callback. The “partial stage” test claims only generated items are passed but asserts only the job ID; production intentionally passes the complete generated/failed manifest, which the SQL validates and records. The “stale heartbeat authority-loss” test explicitly proves that no heartbeat occurred. Neither assertion proves its stated recovery case.

**Required local correction:** drive the captured production `after()` callback with fake timers and controlled promises. Prove actual thrown-heartbeat exhaustion, successful-renewal reset, overlap prevention, authority-loss abort/no publish, cancellation acknowledgment/no publish, partial-manifest publication contract, publication failure fallback, and stale authority. Rename the partial test to the real full-manifest contract and assert the complete RPC arguments.

### R14-H06 — D13 local behavioral evidence currently fails

**Evidence:** independent targeted run; `VisualsPanel.test.tsx` lines 496–623.

Two tests fail:

- “maximum jitter ... 2,599 ms” assumes 600 ms/floored jitter, while production uses `Math.random() * 500`; the poll has already fired at the test's supposed pre-boundary.
- “second poll ... 5 s” advances fake time before allowing the first async poll to finish and schedule the next timeout, so its absolute 7,000 ms assumption is not the production scheduling boundary.

The suite otherwise covers one-in-flight behavior, hidden/offline pauses and resumption, terminal stop, stale response after unmount, identity change, and listener cleanup. Exact 10-second and capped 30-second not-before/at-boundary behavior is still not isolated, and cleanup should directly assert abort/timer behavior rather than infer all of it from call counts.

**Required local correction:** choose and document the production jitter bound, make tests share/export or observably derive that contract, settle each async poll before advancing the next relative delay, add exact 2/5/10/30 boundary tests, and directly assert abort/timer cleanup across unmount and identity change. All targeted Group A tests must pass before another static gate.

## Medium findings

### R14-M01 — Canonical serializer comments contradict the corrected implementation

Migration lines 3252–3271 still describe JSONB text-representation integer/decimal classification, caller-required newline/Unicode normalization, and rejected scientific notation. The implementation below uses NUMERIC normalization, deliberately preserves CRLF/NFC/NFD distinctions, and accepts exponent-form JSON input through NUMERIC. Correct these comments with the KAV update so future migrations do not implement the obsolete contract.

### R14-M02 — The derived migration-manifest header is stale

`migrations/manifest.json` is accurate: order, checksums, mutability, no-execution evidence, maintenance requirement and fresh-project prerequisite gap all match current facts, and it no longer contains stale Round 10 metadata. `.ai/inspection/migration-manifest.md` carries the same current checksum/status and correctly labels itself derived, but line 2 still says `Updated Round 10: 2026-08-02` while the footer and content say Round 13/2026-08-04. Update that informational header in the correction round.

### R14-M03 — Claude's local-test claim is not reproducible in this checkout

The exact three requested suites do not all pass: 51/53 tests pass. TypeScript and lint match the report. The build could not be independently reproduced only because the sandbox could not fetch Google Fonts; that is an evidence-environment limitation rather than a demonstrated code defect.

## Exact ordered local corrections

1. Complete the two missing independent KAV hashes and correct the canonical-contract comments.
2. Complete the already-evidenced D11 pre-first-mutation fingerprint.
3. Complete exact normalized/individual final ACL and default-ACL postconditions.
4. Replace MIME prefix matching and the 16-byte PNG prefix check with strict bounded validation and tests.
5. Replace copied heartbeat simulations and misleading partial/stale tests with production-route timer/control-flow assertions.
6. Correct and complete D13 exact-boundary tests until the targeted Group A suite is green.
7. Refresh the derived manifest header and the authoritative checksum after the migration changes.
8. Request another narrow static Database Architect review. Do not execute the migration or Group B tests before it approves the exact corrected checksum.

## Files reviewed

- `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round12.md`
- `migrations/20260729120001_generation_job_state_machine_schema.sql`
- `migrations/beta_foundation_v1.sql` for checksum/diff immutability only
- `migrations/manifest.json`
- `.ai/inspection/migration-manifest.md`
- `src/lib/jobs/visualsWorker.ts`
- `src/lib/jobs/__tests__/visualsWorker.semantics.test.ts`
- `src/app/api/jobs/visuals/route.ts`
- `src/lib/jobs/__tests__/visualsRoute.recovery.test.ts`
- `src/components/study/VisualsPanel.tsx` as the implementation exercised by the required D13 tests
- `src/components/study/__tests__/VisualsPanel.test.tsx`
- the complete tracked working-tree diff, diff stat, and untracked-file inventory

## Final determinations

1. **Executive verdict:** **APPROVE WITH REQUIRED LOCAL CORRECTIONS**.
2. **Critical findings:** None; Round 12's numeric/collation critical is resolved.
3. **High findings:** incomplete independent KAV proof; incomplete D11 preflight; incomplete exact ACL proof; insufficient PNG/MIME validation; recovery tests not exercising production heartbeat flow; and two failing/incomplete D13 tests.
4. **Medium findings:** stale canonical comments; stale Round 10 header in the derived Markdown manifest; and Claude's all-tests/build evidence is not fully reproducible in this restricted checkout.
5. **Exact unresolved blocker, limited to one where possible:** the first migration-execution blocker is the incomplete fail-closed database proof boundary—D11 preflight plus exact final ACL/default/schema/column/type postconditions. The worker/recovery/D13 corrections are additional required local release-review gates.
6. **Whether canonical hashing is deterministic:** **Yes, the current NUMERIC/C-collation function is statically deterministic for its declared byte-preserving contract and no longer uses authoritative `jsonb::text`; the proof suite and comments are not yet complete.**
7. **Whether KAVs are expected to execute:** **Yes on PostgreSQL 17 by static inspection, including `trim_scale(NUMERIC)`, `scale(NUMERIC)`, `COLLATE "C"`, and the PL/pgSQL fixtures. This is not execution evidence, and two required independent hashes remain absent.**
8. **Whether preflight is sufficient for disposable validation:** **No.** All implemented checks precede the first mutation, but already-available D11 index/routine-dependency/schema/column/type authority facts remain locally unimplemented.
9. **Whether ACL proof is sufficient:** **No.** Reconciliation improved, but individual `MAINTAIN`, normalized ACL/default ACL, owner/PUBLIC/unexpected-grantee, schema/column/type and function-attribute proof remains incomplete.
10. **Whether worker Storage handling is complete:** **No.** Redirect/size/stream/private-data handling is present; exact MIME and real PNG structural validation are not.
11. **Whether local recovery evidence is sufficient:** **No.** Production throw handling exists, but key tests execute a copied simulator and the partial/stale tests do not prove their descriptions.
12. **Whether D13 behavioral evidence is sufficient:** **No.** Two of the 19 D13 tests fail in the current checkout, and exact boundary/cleanup proof remains incomplete.
13. **Whether the migration manifest is accurate:** **The authoritative `migrations/manifest.json` is accurate at the reviewed checksum and distinguishes local from execution evidence; the derived Markdown companion has one stale Round 10 header comment.**
14. **Whether disposable migration validation is approved:** **No.** Apply the ordered local corrections, update the checksum/manifest, and obtain another static approval first.
15. **Whether the 49 Group B tests are approved after successful disposable migration execution:** **Not on this candidate.** They may be reconsidered only after the required local corrections, a successful disposable migration/postcondition validation, another static approval, and George's exact test-environment authorization. They were not run in this review.
16. **Whether another local correction round is required:** **Yes.**
17. **Confirmation no implementation or environment action occurred:** This review created only this review file. No implementation, migration, manifest, test or prior-review file was modified; no SQL, Supabase, Storage, Group B, staging, production, commit, push, merge or deployment action occurred. Local read-only/static commands and Group A/build/lint/type verification only were performed.
18. **`git diff --stat`:** captured after creating this review and reported in the handoff; the pre-review tracked stat was 19 files changed, 6,634 insertions and 1,315 deletions. Untracked files, including this review, are not included by plain `git diff --stat`.
19. **`git status --short`:** captured after creating this review and reported verbatim in the handoff. The working tree remains intentionally dirty with the pre-existing Beta Foundation implementation/review artifacts plus this one new review file.
