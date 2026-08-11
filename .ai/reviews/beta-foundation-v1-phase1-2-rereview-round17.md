# Beta Foundation V1 Phases 1–2 — Round 17 Final Static Go/No-Go Review

**Review date:** 2026-08-05  
**Role:** MoLis Database Architect  
**Commit reviewed:** `1c56aa350111f1aeb9e1e93ca047f0f9e34fec26` on local branch `feature/remediate-beta-foundation-v1`  
**Verdict:** **REJECT**

## Executive assessment

Commit `1c56aa3` is not approved for disposable migration validation. The decisive defect is fully static and deterministic: section 1b revokes all TABLE default privileges from `authenticated` and `service_role`, no later statement restores them, but the final postcondition requires both roles to retain exactly CRUD TABLE defaults. On the exact D11 before-state, the migration must therefore raise at its own postcondition and roll back. This is not uncertainty that should be deferred to a disposable environment.

The Round 16 public-schema-owner correction is correct, the production recovery and D13 suites now provide the requested mocked/local behavior evidence, and the authoritative JSON manifest contains the correct checksums and execution status. Further concrete defects remain in deadline enforcement, PNG fixture/parser claims, complete KAV proof, exact default-ACL proof, and the stale derived Markdown manifest.

No Critical finding establishes an unsafe committed database mutation because no migration has run and the default-ACL contradiction fails closed. The High findings nevertheless block all migration execution.

## Review method and evidence boundary

I read the Round 15 review first, inspected the requested files, inspected the complete `1c56aa3` parent diff and file inventory, and independently checked the working tree, migration hashes, historical migration immutability, ACL/KAV SQL, worker implementation, and test assertions. I did not treat the Round 16 report as evidence.

Independent local evidence:

- Group A: **71/71 passed** across the three requested files: 23 jsdom `VisualsPanel` tests, 26 mocked worker semantic tests, and 22 mocked production-route recovery tests.
- `npx tsc --noEmit`: passed with zero errors.
- `npm run lint`: passed with zero errors and four existing unused-parameter warnings in `src/app/actions/generationJobs.ts`.
- Historical migration SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`.
- Corrective migration SHA-256: `319099b1a60928bf3993cffbc9c5df5666700e9f6997fac683c8e2d5ce86f7b0`.
- `migrations/beta_foundation_v1.sql` has no diff from either the parent of `1c56aa3` or `7f72313`.
- No build was run in this review. The reported build remains Claude's local evidence, not independently reproduced evidence here.
- No SQL parser, PostgreSQL, RLS, Storage, Supabase, Group B, browser, staging, or production evidence was produced.

Evidence classification:

- **Unit/mocked worker evidence:** 26 tests execute production worker code with mocked OpenAI, fetch, Storage, and RPC collaborators.
- **Mocked route-controller evidence:** 22 tests execute the captured production `after()` callback with fake timers and mocked database/worker boundaries.
- **jsdom behavior evidence:** 23 tests execute React polling behavior under jsdom and fake timers; this is not real-browser/network evidence.
- **Static SQL evidence:** catalogue predicates, mutation order, canonical functions/KAVs, ACL proof, and checksums were inspected as text only.
- **Real PostgreSQL/RLS/Storage evidence:** absent. Static rejection is not production approval.

## Commit scope and immutability

The checked-out branch points at the exact requested commit. The commit is not a narrow Round 16-only commit relative to its parent: it contains 44 files, 18,120 insertions and 1,835 deletions, including the accumulated Phase 1–2 implementation, D11 inspection artifacts, prior governance reviews, package changes, `.nvmrc`, tests, and migration work. Those files substantially match the dirty reviewed candidate described in Round 15, so no unrelated generated build directory or obvious secret was introduced when that accumulated work was committed. Nevertheless, the proposition that the Git commit itself contains **only** Round 16 corrections is false.

No `.env` file, committed credential, private-key file, `.next`, coverage, Playwright output, or other build output appears in the commit inventory. References to environment variables are code/example/test references rather than committed values. The local repository does not expose an upstream tracking reference that independently proves the push claim; the exact local commit and branch are verified.

The historical `migrations/beta_foundation_v1.sql` is unchanged and retains the expected checksum.

## Finding disposition

### R17-H01 — The migration's TABLE default-ACL mutation and postcondition are contradictory

**Severity:** High — deterministic migration execution blocker.

At migration lines 1033–1040, section 1b executes:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role, PUBLIC;
```

The only `ALTER DEFAULT PRIVILEGES` statements in the migration are the three revocations for tables, functions, and sequences. There is no subsequent TABLE default-privilege grant. This is consistent with the section's stated owner-only/explicit-grant design.

The final postcondition at lines 5452–5510 instead requires `authenticated` and `service_role` each to have exactly four TABLE default privileges: INSERT, SELECT, UPDATE, and DELETE. Beginning with the exact D11 default ACL asserted at lines 848–859, section 1b removes those entries. The postcondition must then raise `R15-H02` and abort the transaction.

**Required correction:** retain the least-privilege design and change the postcondition to prove the exact intended owner-only TABLE default ACL after the revocation. Do not restore broad future-table defaults to runtime roles merely to satisfy the stale assertion. The function and sequence default-ACL checks must likewise prove their complete exact allowlists.

### R17-H02 — Composed deadlines do not independently prevent work or upload after timeout

**Severity:** High — worker authority/cost and stale-publication boundary.

The worker correctly creates bounded `AbortSignal.any()` signals for text generation (60 seconds), image generation (120 seconds), and URL download (30 seconds), passes them to the supported SDK/fetch request options, retains caller cancellation, rejects redirects, and removes the download reader listener in `finally`.

The post-await enforcement is incomplete:

- after `openai.images.generate`, line 310 checks only the original caller `signal`, not the composed `providerSignal`;
- after the download read loop, the code does not call `downloadSignal.throwIfAborted()`;
- immediately before Storage upload, line 441 again checks only the caller `signal`;
- after text completion, line 530 checks only the caller `signal`;
- the catch blocks rethrow only errors named `AbortError`, while `AbortSignal.timeout()` uses a timeout reason that may be named `TimeoutError`.

If an SDK/fetch mock, adapter, or race resolves after its deadline signal aborts, the code can continue to parse or upload because the authoritative composed signal is not rechecked. The current semantic suite contains no deadline-expiry assertion proving that timeout prevents upload.

**Required correction:** check each composed signal immediately after every externally awaited operation, after body completion, and immediately before upload/publication-sensitive work; handle both caller cancellation and timeout reasons without converting them into an ordinary generated-item result that can continue; and add deterministic timeout tests proving zero upload after text, image, or download deadline expiry.

### R17-H03 — Default ACL proof is not exact even apart from the deterministic contradiction

**Severity:** High — incomplete authority postcondition.

Use of `aclexplode` is a material improvement. Table and function object ACL checks generally inspect grantee, grantor, privilege type, and `is_grantable`; runtime `EXECUTE WITH GRANT OPTION` is rejected; effective required/prohibited privileges are tested individually; and no ACL string-prefix/`LIKE` parsing remains.

The default-ACL proof is not a complete exact allowlist:

- the FUNCTION default check only rejects `anon`, `authenticated`, `service_role`, and any grant option; it does not reject an unexpected grantee, wrong grantor, unexpected privilege type, or missing/incorrect approved-owner row;
- the SEQUENCE default check rejects only `anon`, grant options, and wrong grantors; it does not reject `authenticated`, `service_role`, `PUBLIC`, or another unexpected grantee and does not prove the approved owner's exact privilege set;
- the TABLE proof contains the contradiction in R17-H01 and does not independently reject every unexpected grantee/privilege row.

PostgreSQL ownership inherently confers owner authority independently of explicit ACL text. The migration should still prove the intended explicit catalogue representation exactly. `PUBLIC` is represented by grantee OID zero in `aclexplode` and must be included explicitly in the prohibited set.

**Required correction:** for each postgres/public TABLE, FUNCTION, and SEQUENCE default ACL, compare the decomposed rows to one complete expected relation over `(grantor, grantee, privilege_type, is_grantable)`, require every expected row, and reject every extra or missing row. Preserve unrelated Supabase-managed default privileges outside this exact role/schema/object-type scope.

## Medium findings

### R17-M01 — The Unicode NFC/NFD KAV lacks hard-coded expected canonical outputs

The canonical implementation is statically deterministic for its declared byte-preserving contract: numeric grammar is NUMERIC-based, object keys are ordered with explicit `COLLATE "C"`, and no authoritative numeric output depends on `jsonb::text` rendering.

Round 16 completed full text/hash fixtures for LF/CRLF, NULL/empty, missing variants, timezone source envelope, changed model/configuration, and trailing-zero numbers. Numeric equivalence, negative zero, exponent form, object ordering, arrays, and nested values also exercise the actual canonical function with fixed outputs and hashes.

The required NFC/NFD vector at lines 4420–4435 calls the actual function and asserts independently fixed SHA-256 values, but only asserts that the two canonical texts differ. It never compares the outputs to hard-coded expected canonical text (`S2:é` and `S3:é` under the declared byte-length grammar). Therefore the statement that **all** required vectors contain a fixed expected canonical output is false.

The SQL constructs used by the canonical functions and KAV block are expected to parse on PostgreSQL 17 by static inspection. That is not execution evidence.

### R17-M02 — Successful PNG fixtures are not valid PNG image datastreams, and indexed-colour handling is internally inconsistent

The production parser satisfies most requested structural guards: signature; bounded chunk arithmetic; IHDR first/once and length 13; dimension, bit-depth/colour-type, compression, filter and interlace checks; per-chunk CRC; IDAT presence; IEND once/last; no trailing bytes; unknown critical-chunk rejection; 5 MiB enforcement; and no upload before this parser returns true.

The supposedly valid test helper builds IDAT data from zero-filled arbitrary bytes, including a zero-length IDAT in many success cases. It explicitly notes that decompression is not checked. This is chunk-well-formed but not a valid zlib/deflate PNG image datastream, so the semantic suite does not meet the requirement to use a structurally valid minimal PNG fixture.

The parser also advertises indexed colour type 3 as valid but treats `PLTE`—a defined critical PNG chunk required for indexed colour—as an unknown critical chunk and rejects it. Either constrain the accepted production profile to non-indexed output or implement the known PLTE rule and relevant ordering. A genuine minimal decodable PNG fixture should prove the accepted path; malformed fixtures should be derived from it with CRCs recomputed where the test targets a rule other than CRC.

### R17-M03 — The derived Markdown manifest is stale

`migrations/manifest.json` is the declared sole authority and is internally accurate: it records the exact historical and corrective hashes, Round 16 metadata, `locally_authored_not_executed`, no database/Storage execution evidence, the maintenance contract, and the fresh-project prerequisite gap.

`.ai/inspection/migration-manifest.md` is correctly labelled derived, but still records corrective checksum `8c917d…`, Round 13 evidence/footer text, and older execution-order metadata. The JSON wins, but the human companion conflicts with it and should not be presented as current.

### R17-M04 — The Git commit is accumulated Phase work, not a Round 16-only changeset

The complete parent diff includes implementation and governance artifacts from many prior rounds. This is understandable because Round 15 reviewed an uncommitted accumulated working tree, but it means the commit message's narrow Round 16 framing is not an accurate description of its Git scope. This is a reviewability/provenance issue, not evidence of a generated file or secret.

## Confirmed corrected areas

### Public schema ownership

The migration now matches D11 exactly: `public.nspowner = pg_database_owner` and the full inspected `nspacl` string are required before the first mutation. It does not expect `postgres` as the schema owner and contains no `ALTER OWNER`. Application-owned table/function checks remain separate and require the intended `postgres` ownership where applicable. Unexpected schema ownership or ACL drift fails closed.

### Non-default object ACL checks

Relevant function/table checks use `aclexplode` rather than ACL-text `LIKE` matching, validate explicit grantor/grantee/privilege/grant-option properties, and combine them with individual effective-privilege tests. `PUBLIC`, `anon`, non-owner `authenticated`, `service_role`, and approved-owner cases are addressed for the MoLis objects. `EXECUTE WITH GRANT OPTION` is not approved for a runtime role and is rejected. The remaining defect is the incomplete/contradictory default-ACL proof described above.

### Recovery evidence

The 22 recovery tests invoke the captured real production route callback. Together with worker semantics, they cover thrown and typed transient failures with bounded retry/delay, successful renewal resetting the failure count, terminal refusal, authority loss, explicit attempt supersession, cancellation, wrong-token/stale CAS refusal, provider failures, validation/upload item failures, publication failure, `failJob` throwing, and no stale publish. The `failJob`-throws path is explicitly documented as remaining `processing` until lease expiry and durable recovery; the durable scheduled actor remains a D3 activation gate and is not claimed as present.

This is sufficient local mocked recovery evidence for the reviewed controller. Real CAS, leases, RLS, Storage cleanup, and scheduled recovery remain Group B/activation evidence.

### D13 evidence

The 23 jsdom tests prove exact 2-second, 5-second, 10-second, and capped 30-second not-before/at-boundary behavior; portable 0–499 ms integer jitter bounds; no overlap; hidden/offline pause independence and safe resume; completed/failed/cancelled terminal stop; stale-response rejection; document/job identity replacement; direct AbortSignal abortion on unmount and document change; timer cleanup; and visibility/online listener cleanup. Assertions are expressed as product timing/abort outcomes rather than depending on the earlier fractional fake-timer quirk.

## Manifest and migration status

- Authoritative manifest: `migrations/manifest.json`.
- Historical migration checksum: correct and unchanged.
- Corrective migration checksum: `319099b1a60928bf3993cffbc9c5df5666700e9f6997fac683c8e2d5ce86f7b0`, matching the file.
- Round 16 metadata: accurate as a record of claimed corrections and current hash, although some claimed corrections are incomplete as findings above show.
- Execution status: correctly `locally_authored_not_executed` with no database or Storage evidence.
- Derived Markdown: informational only and stale.

## Required corrections before any execution

1. Resolve R17-H01 by making TABLE default-ACL mutation and postcondition express the same owner-only least-privilege contract.
2. Make all three default-ACL postconditions complete exact `aclexplode` allowlists, including OID-zero `PUBLIC`, every approved owner row, grantor, privilege type, and `is_grantable`.
3. Enforce composed deadline state after every external await/read and before upload; add no-upload-after-timeout tests.
4. Add hard-coded NFC and NFD canonical output assertions against the actual PostgreSQL function.
5. Replace the success PNG fixture with a genuine minimal decodable PNG and reconcile indexed-colour/PLTE handling or explicitly exclude indexed colour.
6. Regenerate the derived Markdown manifest from the authoritative JSON after the corrective migration reaches its final checksum.
7. Re-run the same local gates. Do not run the migration or Group B until these deterministic defects are corrected and the authoritative checksum is updated.

These corrections are targeted; they do not reopen the approved architecture or require another broad design cycle.

## Files reviewed

- `.ai/reviews/beta-foundation-v1-phase1-2-rereview-round15.md`
- `migrations/20260729120001_generation_job_state_machine_schema.sql`
- `migrations/beta_foundation_v1.sql`
- `migrations/manifest.json`
- `.ai/inspection/migration-manifest.md`
- `src/lib/jobs/visualsWorker.ts`
- `src/lib/jobs/__tests__/visualsWorker.semantics.test.ts`
- `src/app/api/jobs/visuals/route.ts`
- `src/lib/jobs/__tests__/visualsRoute.recovery.test.ts`
- `src/components/study/VisualsPanel.tsx` as the production behavior under the requested tests
- `src/components/study/__tests__/VisualsPanel.test.tsx`
- supporting worker types/client code reached by the reviewed route and tests
- complete commit `1c56aa3` parent diff, file inventory, and repository status

## Final determinations

1. **Executive verdict:** **REJECT**.
2. **Critical findings:** None. No migration was run; the primary SQL defect fails closed by rolling back.
3. **High findings:** R17-H01, the migration deterministically contradicts its own TABLE default-ACL mutation; R17-H02, timeout signals are not authoritatively rechecked before upload; R17-H03, default-ACL proof is not an exact complete allowlist.
4. **Medium findings:** the NFC/NFD KAV lacks fixed expected canonical outputs; successful PNG fixtures do not contain a valid image datastream and indexed-colour handling is inconsistent; the derived Markdown manifest is stale; the commit is accumulated Phase work rather than Round 16-only scope.
5. **Whether commit `1c56aa3` is scope-clean:** **No as a parent-relative Round 16-only commit.** It contains 44 accumulated Phase 1–2 implementation/governance files. Relative to the Round 15 reviewed dirty candidate, no accidental generated output, environment file, or obvious secret was found. The historical migration is unchanged.
6. **Whether public schema ownership handling is correct:** **Yes.** It requires the exact D11 `pg_database_owner`/`nspacl` baseline, does not expect `postgres`, does not alter ownership, separates application-object ownership, and fails closed.
7. **Whether ACL proof is exact:** **No.** Non-default object checks materially improved, but the TABLE default proof is contradictory and FUNCTION/SEQUENCE default proofs do not reject every unexpected row or prove every required row.
8. **Whether KAV evidence is complete:** **No.** Canonical hashing is statically deterministic and most vectors are complete, but NFC/NFD lacks hard-coded expected canonical output assertions.
9. **Whether PNG validation is complete:** **No.** The production chunk checks cover the requested envelope, but accepted IDAT data is not validated as a PNG image stream, the success fixture is not a genuine valid PNG, and indexed-colour/PLTE handling is contradictory.
10. **Whether deadline handling is complete:** **No.** Deadlines are composed and passed downstream, but the composed timeout state is not rechecked after awaits/reads or before upload, and no deadline test proves zero upload.
11. **Whether recovery evidence is sufficient:** **Yes for local mocked controller evidence.** All requested branches are represented; the durable scheduled recovery actor remains a D3 activation gate and real database behavior is unproved.
12. **Whether D13 evidence is sufficient:** **Yes for jsdom behavioral evidence.** The requested delay, jitter, overlap, pause/resume, terminal, stale-response, identity, abort, timer, and listener behaviors are directly asserted.
13. **Whether the migration manifest is accurate:** **The authoritative JSON is accurate and matches both file hashes; the explicitly derived Markdown companion is stale.** Execution remains correctly marked absent.
14. **Whether disposable migration validation is approved:** **No.** The deterministic default-ACL contradiction alone guarantees rollback; the other High findings must also be corrected first.
15. **Whether the 49 Group B PostgreSQL/RLS/Storage tests are approved after successful disposable migration application:** **No for this commit.** They remain the correct tests after a corrected migration successfully applies in the separately approved disposable environment, but this candidate is not approved for that application.
16. **Whether any remaining issue should be tested directly in the disposable environment instead of creating another static round:** **Not the identified blockers.** They are concrete local contradictions/gaps and must be corrected directly. After targeted correction and local gate verification, genuinely engine-dependent SQL/RLS/Storage behavior belongs in disposable validation rather than another broad architecture review.
17. **Confirmation no implementation or environment action occurred:** This review created only this Round 17 review file. No implementation, migration, manifest, test, or prior review was modified. No SQL, Supabase, Storage, Group B, merge, deploy, staging, commit, push, or production action occurred. Read-only repository inspection and local Group A/type/lint checks only were performed.
18. **`git diff --stat`:** Plain `git diff --stat` is empty because the only review output is a new untracked file; Git does not include untracked files in diff stat until staged. No tracked file differs from `1c56aa3`.
19. **`git status --short`:** `?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round17.md`
