# Beta Foundation V1 — Round 17 Surgical Verification

**Review date:** 2026-08-05  
**Role:** MoLis Database Architect  
**Baseline:** pushed commit `1c56aa350111f1aeb9e1e93ca047f0f9e34fec26`  
**Branch:** `feature/remediate-beta-foundation-v1`  
**Verdict:** **REJECT**

## Executive assessment

The six-file surgical diff resolves the deterministic TABLE default-ACL contradiction and materially improves the worker, KAV, PNG fixture, static index test, and manifests. It is not yet approved for disposable migration validation.

One database-authority defect remains concrete: the FUNCTION default-ACL postcondition permits the entire postgres/public FUNCTION default-ACL row to be absent. That is not the declared exact owner-only normalized allowlist and does not require the expected retained `(postgres, postgres, EXECUTE, false)` row. TABLE and SEQUENCE defaults require owner rows; FUNCTION defaults do not.

The timeout correction also remains incomplete at the requested evidence boundary. The worker checks composed signals after provider calls, after download streaming, after PNG validation, and immediately before upload, but it does not check the image deadline after upload/before returning a staged result. The route checks its heartbeat `aborted` flag before publication, not the worker-local timeout signal. A timeout expiring while upload is pending can therefore be followed by publication. The new timeout tests inject preconstructed `TimeoutError` failures; they do not exercise an actual composed deadline expiring or prove the post-upload/pre-publication boundary.

Additional non-authority discrepancies remain in the static index assertion, PNG success fixtures, and authoritative manifest metadata. These are local, directly correctable facts rather than PostgreSQL uncertainties to defer to disposable execution.

## Independent local evidence

I read the Round 17 review first and inspected the complete tracked diff from `1c56aa3` to the current working tree. I did not treat Claude's report as evidence.

Independent results:

- `npm test`: **303 passed, 49 skipped, 0 failed** across 12 files. `RUN_DATABASE_TESTS` was absent, so the 49 Group B cases were discovered but not executed. Claude's reported **233** passing count does not reproduce against the current tree; the current passing aggregate is 303.
- `npx tsc --noEmit`: passed with zero errors.
- `npm run lint`: passed with zero errors and the same four unused-parameter warnings in `src/app/actions/generationJobs.ts`.
- `git diff --check 1c56aa3`: clean.
- Historical migration SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`.
- Corrective migration SHA-256: `4501db45c6de9327a0a7516fbe8b4c632f148d4b4aa93bdf94ad6a1c4f52da26`.
- No build was run during this surgical verification. Claude's reported build remains separately reported local evidence.
- No SQL, PostgreSQL, Supabase, Storage, Group B test body, browser, staging, or production action occurred.

## 1. Default ACL reconciliation

### TABLE defaults

The former deterministic contradiction is corrected. Section 1b revokes all TABLE defaults from `anon`, `authenticated`, `service_role`, and `PUBLIC`; the final postcondition now expects only the postgres self-grant. It checks:

- no grantee other than `postgres`;
- grantor exactly `postgres`;
- no `is_grantable=true` row;
- eight allowed TABLE privileges and an eight-row owner count;
- presence of the postgres owner entry.

On the exact D11 before-state, the mutation and TABLE postcondition now describe the same owner-only result. The old guaranteed rollback is removed.

The count-plus-allowlist form is less direct than bidirectional relational equality and would not detect a contrived duplicate/missing privilege multiset with the same count. A normalized `EXCEPT ALL` comparison against an eight-row `VALUES` relation would prove the contract more literally. This is secondary to the FUNCTION defect below.

### FUNCTION defaults — blocking defect

The FUNCTION check at migration lines 5516–5535 rejects every decomposed row that is not exactly:

```text
grantor=postgres, grantee=postgres, privilege_type=EXECUTE, is_grantable=false
```

It does **not** require that row to exist. The comment and exception explicitly accept either no `pg_default_acl` row or a postgres EXECUTE self-grant. If the row is absent, the outer `IF EXISTS` returns false and the postcondition passes without proving any normalized ACL entry.

That is not an exact allowlist for the intended owner-only state. The exact D11 before-state includes the postgres self-grant, and revoking only runtime/PUBLIC grants should retain it. TABLE and SEQUENCE postconditions correctly require their retained owner rows; FUNCTION must do the same.

**Required correction:** require exactly one decomposed row `(grantor=postgres, grantee=postgres, privilege_type='EXECUTE', is_grantable=false)` for the postgres/public FUNCTION default ACL and reject every extra or missing row. Prefer one bidirectional `EXCEPT ALL` equality check.

### SEQUENCE defaults

The SEQUENCE check rejects non-postgres grantees (including `PUBLIC` OID zero), wrong grantors, and grant options; it requires three postgres self-grant rows and allows only SELECT, UPDATE, and USAGE. It now describes the same owner-only state as the revocation.

As with TABLE, a bidirectional `EXCEPT ALL` comparison would eliminate the theoretical duplicate/missing same-count gap, but the direct deterministic contradiction is gone.

### Determination

There is no longer a deterministic TABLE rollback, but exact normalized default-ACL proof is still incomplete because the FUNCTION owner row may be absent. The surgical ACL correction is therefore not complete.

## 2. Timeout and cancellation

Confirmed production improvements in `visualsWorker.ts`:

- `providerSignal.throwIfAborted()` runs after image-provider generation;
- `downloadSignal` is passed to `fetch`, cancels the reader on abort, removes the listener in `finally`, and is checked after the streaming loop;
- `textSignal.throwIfAborted()` runs after text-provider generation;
- `providerSignal.throwIfAborted()` runs after PNG validation and immediately before Storage upload;
- both `AbortError` and `TimeoutError` are rethrown rather than converted to an ordinary failed visual;
- redirect rejection, exact PNG MIME checking, Content-Length rejection, streaming 5 MiB cap, and sanitised logging remain intact;
- no raw provider body, provider URL, or private Storage path is logged or returned.

Remaining concrete gaps:

1. Storage upload is not passed a cancellation/deadline signal and no caller/provider signal is checked after the upload resolves. If the worker-local image deadline expires while upload is in flight, the worker can return a generated staged item. The route cannot see that worker-local timeout and checks only its own `aborted` flag before `completeAndPublishJob`. Publication can therefore occur after the composed image deadline has expired.
2. The URL path does not check `downloadSignal` immediately after `fetch` resolves and before early HTTP/MIME/Content-Length returns. Streaming completion is checked, but not every post-fetch branch.
3. The new timeout tests make the mocked provider reject with a manually constructed `TimeoutError`. They prove rethrow/sanitised route classification and zero upload for that injected failure; they do not prove `AbortSignal.timeout()` actually aborts the signal supplied to the mocked dependency, nor the after-return/pre-upload and during-upload boundaries.
4. Native `AbortSignal.timeout()` timers are not represented by an explicit cleanup assertion. Reader listener cleanup is present. The current tests do not independently prove timer lifecycle behavior.

Errors that reach the route are reduced through `classifyError`, public message keys, and opaque support references; raw error/provider text is not persisted or returned. Caller authority loss still sets the route `aborted` flag and suppresses publication. The missing worker-local timeout handoff/check remains blocking for the requested “before publication” proof.

**Required correction:** enforce timeout/caller state after upload and before returning staged success, and make the route publication boundary consume an explicit successful/non-aborted staging authority result. Where in-flight upload cannot be cancelled, treat a post-upload abort/timeout as a private unreferenced lost-race object and prohibit publication. Add tests that capture the actual composed signals, trigger their abort state, resolve the dependency afterward, and prove zero publication (and zero upload when the deadline precedes upload).

## 3. NFC/NFD KAV

The KAV now has:

- explicit NFC input (`é`, U+00E9) and NFD input (`e` + U+0301);
- actual calls to `public.fn_canonical_jsonb_v1`;
- fixed NFC output `S2:é`;
- an exact NFD output assembled from the hard-coded UTF-8 bytes `65 CC 81` as `S3:` plus those bytes;
- literal independent SHA-256 values `52669a…e171` and `dee650…7f6` checked through `public.fn_sha256_hex`;
- an explicit assertion that canonical results differ.

This is sufficient static proof of the declared byte-preserving NFC/NFD contract. PostgreSQL execution remains unproved.

## 4. PNG fixture and validation

The base `makePngBuffer(0)` fixture is now a genuine minimal 1×1 RGBA PNG by construction:

- standard eight-byte PNG signature;
- 13-byte IHDR with valid 1×1, 8-bit RGBA fields and computed CRC;
- IDAT containing `zlib.deflateSync` output for one filter byte and one RGBA pixel, with computed CRC;
- standard zero-length IEND with the correct fixed CRC.

The production parser now excludes indexed colour type 3, resolving its former contradiction with rejection of the required PLTE critical chunk. It continues to enforce bounded chunks, CRCs, IHDR/IDAT/IEND rules, size and zero-upload-before-validation.

Negative cases cover corrupt IHDR and IDAT CRCs, missing IDAT, missing IEND, trailing bytes, short/truncated input, malformed IHDR and fields, declared/streamed/decoded oversize, abort/timeout injection, and zero upload on invalid content.

One fixture claim remains inaccurate: `makePngBuffer(extraBodyBytes)` appends zero bytes **after** a complete zlib stream inside IDAT and calls that padding “structurally inert.” Positive upload and near-5-MiB tests use `makePngBuffer(100)` or much larger padding. Those are not the genuine minimal fixture, and the production parser does not validate the IDAT zlib datastream. The suite therefore proves that the chunk parser accepts a CRC-valid IDAT payload, not that every accepted positive fixture is a decodable PNG. The base fixture is valid; the padded positive fixtures are not adequate content-valid success evidence.

**Required correction:** use `makePngBuffer(0)` for normal positive cases. For size-boundary fixtures, create valid image data at the target size or clearly scope the test to byte-boundary enforcement without calling the padded payload a valid PNG. If the product contract requires content-valid PNG rather than only chunk-valid PNG, add bounded zlib/image validation in production.

## 5. Static migration test correction

The old assertion was stale: it searched for `indexname='idx_document_analysis_document_id'`, while the migration's per-index checks join `pg_index` to index relation `pg_class ci` and use `ci.relname`.

The replacement is directionally valid and does not simply delete coverage. It adds exact names and per-index exception strings for all document_analysis, documents, and study_visuals indexes.

It does not, however, itself assert the claimed complete property contract. The test checks names and messages but has no expectations for the scoped `i.indisunique`, `i.indisprimary`, `i.indispartial`, `i.indpred IS NULL`, or exact partial predicate expressions. A future edit could weaken those clauses while leaving every new static assertion green. The production migration currently contains the required property clauses, but the replacement test does not lock them down as reported.

**Required correction:** slice or match each complete per-index predicate and assert its exact unique/primary/partial/predicate properties, including the `documents_source_recording_unique` predicate. The stale `pg_indexes.indexname` assertion was correctly removed; its property contract was not fully replaced with executable assertions.

## 6. Manifest

Confirmed:

- `migrations/manifest.json` declares itself the sole authority;
- its corrective checksum exactly matches `4501db45c6de9327a0a7516fbe8b4c632f148d4b4aa93bdf94ad6a1c4f52da26`;
- the historical checksum remains `d2bc6e…60b` and matches the immutable file;
- the corrective migration remains `locally_authored_not_executed` with `execution_evidence: none`;
- the Markdown companion is explicitly derived and now carries the current checksums/status.

The authoritative JSON metadata is not fully current: `generated_at` remains `2026-08-04`, and its top-level note still says “Updated through Round 16 corrections” while the per-migration note and derived Markdown describe Round 17. The per-migration note also calls FUNCTION/SEQUENCE ACL proof complete although the FUNCTION row-presence defect remains.

**Required correction:** update the JSON date/top-level Round 17 summary only after the remaining surgical corrections produce the final checksum, then regenerate the derived Markdown.

## 7. Working-tree scope

The six modified tracked files are:

1. `.ai/inspection/migration-manifest.md`
2. `migrations/20260729120001_generation_job_state_machine_schema.sql`
3. `migrations/manifest.json`
4. `src/lib/jobs/__tests__/visualsWorker.semantics.test.ts`
5. `src/lib/jobs/__tests__/workerScenarios.test.ts`
6. `src/lib/jobs/visualsWorker.ts`

All six changes relate to the Round 17 surgical findings. No unrelated source file, generated output, secret, environment file, credential value, build artifact, or historical migration change appears in the diff. The earlier Round 17 review is the one pre-existing untracked file; this surgical verification is the only new file created by this review.

The diff is scope-clean by subject matter, but the corrections are incomplete as described above.

## 8. Evidence boundary

The following remain expressly unproved until separately approved disposable execution:

- PostgreSQL 17 parsing and actual migration application;
- exact upgrade/rollback behavior on the D11 baseline;
- concurrent request-ledger/idempotency behavior;
- authenticated User A versus User B RLS isolation;
- actual table/function/default ACL catalogue state and effective privileges;
- Storage denial, trusted upload, object isolation, and signed-URL behavior.

Passing unit/static/jsdom tests cannot substitute for those 49 Group B PostgreSQL/RLS/Storage cases. The 49 tests remain skipped and were not executed.

## Final decision

1. **Executive verdict:** **REJECT**.
2. **Any concrete blocking defect:** **Yes.** FUNCTION default ACL proof permits the required postgres EXECUTE owner row to be absent; worker-local image timeout is not checked after upload/before publication; actual deadline expiry is not tested; positive padded PNG fixtures are not genuine decodable PNGs; the replacement index test does not assert the reported index properties; and authoritative JSON top-level metadata remains Round 16/stale.
3. **Whether the stale-test correction is valid:** **Partially.** Replacing `pg_indexes.indexname` with `pg_index`/`pg_class ci.relname` is correct and expands name coverage, but executable assertions do not lock down uniqueness, primary, partial and predicate state as reported.
4. **Whether the Round 17 surgical diff is scope-clean:** **Yes by file and subject scope.** Exactly six tracked files are modified, all relate to Round 17, with no unrelated/generated/secret/environment/build artifact. It is not completion-clean because concrete gaps remain.
5. **Whether the migration is statically ready for disposable execution:** **No.** The FUNCTION default-ACL allowlist is not exact, and the authoritative metadata/evidence still overstates completion.
6. **Whether disposable migration validation is approved:** **No.** Correct the remaining local facts first; do not defer them to PostgreSQL execution.
7. **Whether the 49 Group B tests are approved after successful migration application:** **Not for the current diff.** They remain the correct next evidence only after the corrected migration is statically ready and successfully applies in the separately approved disposable environment.
8. **Whether George may commit and push the current surgical corrections:** **No as the final approved candidate.** The diff should remain uncommitted until the listed surgical gaps are corrected and checksums/manifests are regenerated. This does not authorize another broad review cycle.
9. **Confirmation no implementation or environment action occurred:** This review created only `.ai/reviews/beta-foundation-v1-round17-surgical-verification.md`. No implementation, migration, test, manifest, or earlier review was modified. No SQL, Supabase, Storage, Group B test body, stage, commit, push, merge, deploy, or production action occurred. Read-only inspection and local unit/type/lint/diff checks only were performed.
10. **`git diff --stat`:** Six tracked files changed, **226 insertions and 72 deletions**. Plain diff stat excludes the two untracked review files.
11. **`git status --short`:**

```text
 M .ai/inspection/migration-manifest.md
 M migrations/20260729120001_generation_job_state_machine_schema.sql
 M migrations/manifest.json
 M src/lib/jobs/__tests__/visualsWorker.semantics.test.ts
 M src/lib/jobs/__tests__/workerScenarios.test.ts
 M src/lib/jobs/visualsWorker.ts
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round17.md
?? .ai/reviews/beta-foundation-v1-round17-surgical-verification.md
```
