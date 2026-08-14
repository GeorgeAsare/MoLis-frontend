# Beta Foundation V1 — Final Round 17 Surgical Verification

**Review date:** 2026-08-05  
**Role:** MoLis Database Architect  
**Baseline:** `1c56aa350111f1aeb9e1e93ca047f0f9e34fec26`  
**Branch:** `feature/remediate-beta-foundation-v1`  
**Verdict:** **REJECT**

## Executive assessment

Four of the six previously identified surgical blockers are closed: FUNCTION default ACL equality is now bidirectional and requires the owner row; worker deadlines are explicitly controlled and cleared with post-upload rejection; real composed deadlines are exercised with fake timers and controlled promises; and manifest hashes, status and Round 17 metadata are current.

Two literal verification requirements remain incomplete:

1. The static index test asserts each index name and property suffix but does not bind those assertions to the exact `ct.relname` table clause. The migration itself currently contains the correct table clauses; the executable test does not lock down the claimed exact-table contract.
2. The positive near-5-MiB PNG fixture uses a `tEXt` chunk filled entirely with spaces. A PNG `tEXt` data field requires a 1–79 byte keyword followed by a NUL separator and then text. With no NUL separator, the ancillary chunk is not a valid `tEXt` payload. The self-validation checks its CRC and IDAT inflation but does not validate `tEXt` structure, IEND-last/no-trailing state for that fixture, or every requested chunk boundary invariant.

These are narrow local defects, not architecture questions and not PostgreSQL behavior to defer to the disposable environment. The binary verdict remains rejection.

## Independent evidence

I read the prior surgical verification first, inspected only the six authorized tracked files and their diff from `1c56aa3`, and did not rely on Claude's report.

Independent local results:

- `npm test`: **310 passed, 49 skipped, 0 failed** across 12 files. `RUN_DATABASE_TESTS` was absent, so Group B test bodies did not execute.
- `npx tsc --noEmit`: passed with zero errors.
- `npm run lint`: passed with zero errors and four pre-existing unused-parameter warnings in `src/app/actions/generationJobs.ts`.
- `git diff --check 1c56aa3`: clean.
- Historical migration SHA-256: `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b`.
- Corrective migration SHA-256: `94efcc157788d12ca0ece0802717f82f259b91587d7b49822aca9f4ed7a0ce4d`.
- No build was run in this verification; Claude's reported build remains separately reported local evidence.
- No SQL, PostgreSQL, Supabase, Storage, Group B test body, staging, or production action occurred.

## 1. FUNCTION, TABLE and SEQUENCE default ACLs

### FUNCTION — closed

The FUNCTION postcondition now performs both directions of `EXCEPT ALL` between actual `aclexplode` rows and exactly one expected row:

```text
grantor=postgres
grantee=postgres
privilege_type=EXECUTE
is_grantable=false
```

`Expected EXCEPT ALL Actual` rejects a missing owner row. `Actual EXCEPT ALL Expected` rejects every extra row. Consequently, `PUBLIC` (OID zero), `anon`, `authenticated`, `service_role`, an unexpected grantee or grantor, another privilege, a grant option, a duplicate, or a missing row cannot pass. This closes the prior FUNCTION default-ACL blocker.

### TABLE and SEQUENCE — remain internally consistent

TABLE continues to require the postgres self-grant with all eight TABLE privileges, reject non-postgres grantees, reject wrong grantors and grant options, and reject privileges outside the exact allowlist. This matches section 1b's owner-only mutation and no deterministic rollback remains.

SEQUENCE continues to require the postgres self-grant with SELECT, UPDATE and USAGE, reject non-postgres grantees—including `PUBLIC`—and reject wrong grantors, grant options and privileges outside the allowlist. It remains consistent with the mutation.

Within the normal PostgreSQL-generated ACL representation established by the exact D11 preflight, these checks prove the intended owner-only state. FUNCTION now uses the stronger literal bidirectional equality required by the previous blocker.

## 2. Timeout during upload and before publication

This blocker is closed by static inspection:

- explicit deadline controllers and timers are created for text provider, image provider and download;
- caller and deadline signals are composed with `AbortSignal.any`;
- signals are checked after provider generation;
- download uses the composed signal, cancels its reader during abort, removes its listener, and checks the signal after streaming;
- the image signal is checked after PNG validation and immediately before upload;
- it is checked again immediately after upload;
- `stageVisualsForJob` checks the caller signal before returning to publication orchestration;
- every deadline timer is cleared in `finally`;
- `AbortError` and `TimeoutError` are rethrown by provider and upload catch paths instead of becoming generated success;
- an upload that resolves after the deadline becomes a private, unreferenced lost-race object because the worker rejects before returning a generated item;
- logs and result objects contain no raw provider response body, provider URL or private Storage path.

Storage upload itself cannot be cancelled through the current Storage client, so a timeout during an already-started upload can still leave a private orphan object. The required security property is preserved: it cannot be returned to publication orchestration.

## 3. Real deadline tests

The new tests use the actual production controllers rather than accepting manually injected `TimeoutError` as their only proof:

- the provider test captures the actual composed signal, holds a controlled provider promise, advances to 120 seconds, verifies `TimeoutError`, zero upload and zero timers;
- the text test captures its actual composed signal, advances to 60 seconds, verifies `TimeoutError`, no image generation, zero upload and zero timers;
- the caller-abort test verifies propagation through the composed signal, `AbortError`, zero upload and zero timers;
- the upload-time tests hold upload pending, fire the real provider timer, resolve upload afterward, and prove the worker rejects rather than returning `status: generated`;
- because the production route publishes only after successful staging, a rejected staging promise cannot reach publication;
- all tested deadline paths assert `vi.getTimerCount() === 0`.

The older manually injected error cases remain useful catch-path tests but are no longer the sole deadline evidence. This blocker is closed.

## 4. Static index tests — not fully closed

The stale `pg_indexes.indexname='idx_document_analysis_document_id'` expectation was correctly removed. The replacement covers all eight inspected indexes and now asserts exact name plus `indisunique`, `indisprimary`, `indispartial`, `indpred IS NULL`, or the exact partial predicate.

However, each `toContain` assertion begins at `ci.relname=...`; it omits the preceding `ct.relname='<table>'` clause and the `pg_index`/`pg_class` joins. Separate index-count assertions mention each table, but they do not bind an individual index/property assertion to that exact table. A future regression changing an individual query's `ct.relname` could leave the test green.

The migration text itself currently uses `pg_index`, both table/index `pg_class` aliases, the correct `ct.relname`, exact `ci.relname`, and the correct property/predicate state for every index. The test correction is stronger than before but does not meet the requested executable exact-table proof.

**Blocking correction:** include each exact `ct.relname='<table>' AND ci.relname='<index>'` fragment, together with its property/predicate clauses, in the corresponding assertion. Also assert the `pg_index` and table/index `pg_class` joins within the scoped preflight block.

## 5. Migration manifests

This blocker is closed:

- `migrations/manifest.json` is explicitly the sole authority;
- its corrective checksum exactly matches `94efcc157788d12ca0ece0802717f82f259b91587d7b49822aca9f4ed7a0ce4d`;
- the historical checksum is unchanged and matches the immutable file;
- `generated_at` is 2026-08-05 and the top-level/per-migration notes describe the current Round 17 surgical corrections;
- the corrective migration remains `locally_authored_not_executed` with no execution evidence;
- the Markdown companion is explicitly derived/informational and matches the current hashes/status.

No database or Storage execution is claimed.

## 6. PNG positive fixtures — not fully closed

Normal positive tests now use `makePngBuffer(0)`, whose construction and self-validation prove:

- PNG signature by construction;
- valid 13-byte 1×1, 8-bit RGBA IHDR and CRC;
- valid zlib-compressed IDAT and CRC;
- successful inflation to exactly one five-byte scanline;
- filter byte zero and exact RGBA channel layout;
- zero-length IEND with the standard CRC;
- parser traversal ends at the buffer boundary.

Invalid fixtures continue to prove zero upload for malformed signatures/chunks, CRCs, missing IDAT/IEND, trailing bytes, truncation, size breaches, aborts and timeouts.

The positive near-limit fixture is still not content-valid as claimed. `makePngBufferWithAncillaryChunk` names its ancillary chunk `tEXt` but fills its entire data field with spaces. A valid `tEXt` payload requires a keyword followed by a NUL separator; none exists. Its self-test checks total size, chunk CRC, presence and IDAT inflation only. It does not validate `tEXt` syntax, explicitly require IEND last, or explicitly reject trailing bytes for that builder.

**Blocking correction:** either construct valid `tEXt` data—valid keyword, NUL separator, then text—or use a valid unknown ancillary chunk type whose payload has no `tEXt` grammar. Extend the ancillary fixture self-validation to assert safe chunk bounds, IEND exactly once and last, final offset equal to buffer length, and no trailing data. The near-limit positive test must use that validated fixture.

## Working-tree scope

Exactly the authorized six tracked files are modified:

1. `.ai/inspection/migration-manifest.md`
2. `migrations/20260729120001_generation_job_state_machine_schema.sql`
3. `migrations/manifest.json`
4. `src/lib/jobs/__tests__/visualsWorker.semantics.test.ts`
5. `src/lib/jobs/__tests__/workerScenarios.test.ts`
6. `src/lib/jobs/visualsWorker.ts`

All changes relate to the Round 17 surgical patch. No unrelated source, generated file, secret, environment file, credential, build artifact or historical migration change appears in the tracked diff. The three review files are untracked and excluded from plain diff stat.

## Evidence boundary

The following remain unproved and must be established only through separately approved disposable execution:

- PostgreSQL parsing and migration application;
- live-baseline upgrade and recovery behavior;
- concurrent idempotency and ledger races;
- authenticated User A versus User B RLS isolation;
- actual ACL/default-ACL catalogue and effective privilege results;
- Storage denial, trusted upload, private object isolation and signed-URL behavior.

Static and mocked approval would not be production approval. The 49 Group B test bodies remain unexecuted.

## Final decision

1. **Executive verdict:** **REJECT**.
2. **Any concrete blocking defect:** **Yes.** Individual static index assertions do not bind each index to its exact table/join contract, and the positive near-limit PNG's `tEXt` chunk lacks the required keyword/NUL structure; its self-validation does not prove IEND-last/no-trailing invariants.
3. **Whether the six surgical blockers are closed:** **No.** FUNCTION ACL, timeout/publication, real deadlines and manifests are closed. Static index-test and PNG-positive-fixture blockers remain partially open.
4. **Whether the working-tree diff is scope-clean:** **Yes.** Exactly the six authorized tracked files changed and no unrelated/generated/secret/environment/build artifact was found.
5. **Whether the migration is statically ready for disposable execution:** **No as the complete reviewed patch.** The migration SQL's previously blocking ACL defect is closed, but required local executable evidence still overstates exact index and PNG contracts.
6. **Whether disposable migration validation is approved:** **No.** Correct the two narrow local evidence defects first; do not defer them to the disposable environment.
7. **Whether the 49 Group B tests are approved after successful disposable migration application:** **Not for the current patch.** They remain the correct next evidence after all six blockers close and the corrected migration applies successfully in the separately approved disposable environment.
8. **Whether George may commit and push the current six-file patch:** **No as the final approved patch.** Keep it uncommitted until the two narrow corrections are made and hashes/manifests are regenerated if the migration changes. This is not authorization for another broad review cycle.
9. **Confirmation no implementation or environment action occurred:** This verification created only `.ai/reviews/beta-foundation-v1-final-surgical-verification.md`. No implementation, migration, manifest, test or earlier review was modified. No SQL, Supabase, Storage, Group B test body, stage, commit, push, merge, deploy or production action occurred. Only read-only inspection and local unit/type/lint/diff/checksum checks ran.
10. **`git diff --stat`:** Six tracked files changed, **798 insertions and 211 deletions**. Plain diff stat excludes the three untracked review files.
11. **`git status --short`:**

```text
 M .ai/inspection/migration-manifest.md
 M migrations/20260729120001_generation_job_state_machine_schema.sql
 M migrations/manifest.json
 M src/lib/jobs/__tests__/visualsWorker.semantics.test.ts
 M src/lib/jobs/__tests__/workerScenarios.test.ts
 M src/lib/jobs/visualsWorker.ts
?? .ai/reviews/beta-foundation-v1-final-surgical-verification.md
?? .ai/reviews/beta-foundation-v1-phase1-2-rereview-round17.md
?? .ai/reviews/beta-foundation-v1-round17-surgical-verification.md
```
