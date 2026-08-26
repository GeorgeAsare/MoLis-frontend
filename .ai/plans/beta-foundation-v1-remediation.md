# Beta Foundation V1 Remediation Plan

## Status, scope, and non-authorisation notice

- **Plan status:** revised after Database Architect review and George's qualified approval of D1–D13. **Implementation and migration generation remain blocked pending Database Architect re-review and approval of the resulting contract.** Provider-specific worker integration remains blocked until the D3 comparison/proof of concept receives separate George approval. Irreversible deletion and all production deletion remain disabled under D8–D10. Staging writes and every production action remain separately gated under D12.
- **Reviewed repository state:** commit `7f72313` on `main`, 2026-07-29.
- **Senior Reviewer verdict:** FAIL.
- **Scope:** forward remediation of Beta Foundation V1 security, data-integrity, migration, reliability, verification, performance, Storage, and governance failures.
- **Not authorised by this plan:** SQL generation or execution, Supabase access, production inspection, migration application, application changes, branch creation, commit, push, merge, rollback, or deployment.
- **Historical migration rule:** `migrations/beta_foundation_v1.sql` is an already-applied historical artifact. It must never be edited again. Every correction must be delivered later as a newly named, ordered, forward-only migration.
- **Implementation branch:** Claude Code must work only on `feature/remediate-beta-foundation-v1`. Direct implementation on `main` is prohibited.
- **Enforcement rule:** trusted job, usage, system-memory, session, and diagnostic mutation cannot rely on unrestricted authenticated-client writes, and no security or integrity invariant may depend only on frontend or application checks.
- **Containment until PASS:** do not rely on `generation_jobs` as trusted orchestration state, `usage_events` for billing/limits/audit, or `user_memories` for consequential personalization. Do not broaden beta release while Critical/High findings remain.

## Founder decision disposition

George approved D1–D13 with the following wording, recorded exactly:

> D1: Approve recommended cancel-request/acknowledge behaviour; do not publish partial or post-cancel results.
>
> D2: Approve returning the existing job for duplicate or active work; never automatically replace it.
>
> D3: Approve the durable managed-workflow direction for beta. Do not commit MoLis to a specific provider until a security, cost, capability and scalability comparison and proof of concept have been reviewed and approved by George.
>
> D4: Approve trusted-server/worker-only authoritative usage; classify existing events as legacy unverified.
>
> D5: Approve separate user notes, verified system claims and temporary behavioural signals with the recommended permissions and provenance.
>
> D6: Approve the recommended durable flashcard-session eligibility rule as an adjustable beta default. Review the thresholds later using privacy-safe evidence.
>
> D7: Approve private study-documents, recordings and study-visuals with short-lived signed access and versioned visual paths.
>
> D8: Approve the proposed beta retention schedule as a provisional policy. Do not enable irreversible automated deletion until legal review, backup alignment and deletion-recovery testing are complete.
>
> D9: Approve the 30-day student-content deletion objective and legally required pseudonymised retention. Do not activate production deletion until legal review and end-to-end deletion testing are complete.
>
> D10: Approve quarantine-first legacy handling. Permit only deterministic, non-destructive repair and require separate founder approval before deleting legacy data.
>
> D11: Approve the explicit migration manifest and canonical prerequisite baseline. Keep beta_foundation_v1.sql byte-for-byte immutable.
>
> D12: Approve the tiered environment-access model. Require exact, separate approval for all staging writes and every production action.
>
> D13: Approve the proposed initial beta performance and reliability targets as measurable release goals, subject to evidence-based revision.

George approves these decisions with the qualifications stated above.

### Binding qualification effects

1. **D3:** architecture and provider-neutral interfaces may be specified, and a separately approved comparison/proof of concept may be prepared; no provider commitment or production integration is approved.
2. **D5:** trusted memory classes are user notes, verified system claims, and temporary behavioural signals. An AI inference is not a verified claim merely because a model produced it; it remains a temporary/unverified signal until an approved verification/provenance rule qualifies it.
3. **D6:** the recorded 80%/minimum-card/60-second/cooldown thresholds are beta defaults, not permanent product law. Revisions require privacy-safe evidence, versioning, review, and no retroactive silent reinterpretation of historical sessions.
4. **D8:** retention mechanisms may be designed and tested in reversible/dry-run form, but irreversible automated deletion cannot be enabled before legal review, backup alignment, and deletion-recovery testing complete.
5. **D9:** the 30-day objective may shape contracts and tests, but production deletion cannot activate before legal review and end-to-end deletion testing complete.
6. **D10:** quarantine and deterministic non-destructive repair are the only approved legacy dispositions. Any deletion requires a new exact founder approval.
7. **D12:** plan, code, or migration approval never authorizes staging writes or production action; each requires exact separate approval.
8. **D13:** targets are measurable release goals and may change only through evidence-linked review and recorded approval.

## Evidence basis

This plan is based on the Founder Directives, AI Team playbook, database checklist and review template; the independent review; Git history for `aa14f4b`, `3418b66`, `208a1d7`, and `7f72313`; the complete migration directory; job, usage, memory, visual, flashcard, logging, entitlement, API, UI, and test code; and the reviewer's durable-evidence inventory. No Supabase environment was accessed.

Key repository facts:

- The repository contains only `migrations/beta_foundation_v1.sql`; it references `documents`, which the repository migration chain does not create.
- Commit `208a1d7` edited the category CHECK inside the migration introduced by `aa14f4b`.
- `generation_jobs` and `user_memories` use broad `FOR ALL` owner policies; `usage_events` permits authenticated owner inserts with caller-controlled authoritative fields.
- Active-job uniqueness, job transitions, usage idempotency, memory identity/superseding, and flashcard session identity are not atomically enforced.
- Visual work runs in Next.js `after()`, with no durable lease, heartbeat, retry worker, recovery scanner, or interruption contract.
- Raw exception text is stored, returned, rendered, and separately logged; generated visuals use public URLs without a versioned Storage contract.
- Existing tests do not provide authenticated two-user isolation, fresh-project migration, populated-upgrade, concurrency, interruption recovery, rollback, performance, polling-load, or Storage-isolation evidence.
- Commit `7f72313` is already on `main`; the required branch/review/George-approval workflow was not used for the completed milestone.

## Final actor and authority model

This actor model is mandatory for every task and supporting table. A server action using the caller's Supabase session remains an authenticated-user action; it is not a trusted worker boundary.

| Actor | Database identity | Final authority |
|---|---|---|
| Anonymous | `anon`, no authenticated UID | No foundation-row or private-object access. |
| Authenticated owner | `authenticated`; `auth.uid()` is derived, never trusted from payload | Safe projection reads of own rows; narrow enqueue/cancel/session/user-note functions only. No base-table authoritative DML. |
| Authenticated non-owner | `authenticated`, different UID | No visibility, mutation, function success, parent reference, or existence disclosure. |
| Trusted application server | Dedicated restricted credential or reviewed purpose-specific security-definer function | Validate user intent and parent ownership, derive identity/defaults, and invoke only approved operations. Credential never reaches browser. |
| Worker | Dedicated least-privilege worker identity | Purpose-specific claim, heartbeat, cancel acknowledgement, complete/fail/retry, trusted usage, system-claim, and versioned-object operations guarded by lease and producer identity. |
| Service role | Supabase administrative bypass | Migration and break-glass operations only; never routine application or worker execution. |

Security-definer functions must have a fixed safe `search_path`, explicit owner, `PUBLIC` execution revoked, minimal role-specific `EXECUTE`, validated inputs, parent ownership checks, database-derived identity/time/defaults, and durable audit/support references. Base tables default to no `anon` access and no authenticated authoritative DML. Owners read safe views or base tables only when every exposed column is safe. Worker authority is narrow even when its credential is protected.

## Final job state and idempotency contract (subject only to D1–D3 parameter approval)

### State transitions

| From | Operation and required actor | To | Mandatory compare-and-set conditions |
|---|---|---|---|
| none | owner/server narrow enqueue | `queued` | Parent ownership, payload schema/hash, request idempotency, and active-work exclusion succeed atomically. |
| `queued` | worker claim | `processing` | Expected `state_version`; due `next_attempt_at`; issue unique lease token using database time. |
| `queued` | owner/server cancel | `cancelled` | Expected state/version; terminal timestamp set by database. |
| `processing` | owner/server cancel request | `cancel_requested` | Expected state/version; worker lease remains identifiable but cannot publish a result. |
| `processing` | current worker heartbeat | `processing` | Expected version, worker ID, unexpired lease token; extend lease using database time. |
| `processing` | current worker complete | `completed` | Expected version, current unexpired lease, no cancellation, idempotent result commit succeeds. |
| `processing` | current worker fail | `queued` or `failed` | Expected version/current lease; retry only when retryable and attempts remain; otherwise terminal fail. |
| `cancel_requested` | current worker acknowledge or reconciler timeout | `cancelled` | Expected version and lease/reconciliation rule; partial result remains unpublished. |
| expired `processing` | reconciler | `queued` or `failed` | Expected version and expired lease; bounded attempts. |
| terminal | duplicate callback/read | unchanged | Terminal states are immutable; return existing safe outcome, never rewrite. |

Every mutation uses a purpose-specific function and predicate containing expected current state plus `state_version`; post-claim operations also require `worker_id`, `lease_token`, and a valid lease. Database time controls timestamps and expiry. A generic transition/update function is prohibited.

### Separate identities

- **Request idempotency:** immutable client request ID/idempotency key scoped to `(user_id, operation_kind)`, with canonical versioned payload hash. Same key and hash returns the same job; same key with different hash is rejected and audited.
- **Active-work exclusion:** separate partial uniqueness on `(user_id, document_id, job_type)` for `queued`, `processing`, and `cancel_requested`. A different key while work is active follows D2; recommended behavior is return/conflict, never automatic cancellation.
- **Worker attempt identity:** job ID + attempt number + lease token. Duplicate or stale delivery cannot win a transition.
- **Side-effect identity:** versioned artifact/result/usage keys derived from job and attempt semantics. At-least-once delivery must not duplicate winning artifacts, usage, or claims.

## Required RLS, grant, and safe-projection contract

| Object | Owner/client | Trusted server | Worker | Anonymous/non-owner |
|---|---|---|---|---|
| Jobs | Safe own DTO read; enqueue/cancel function only | Scoped enqueue/cancel/read functions | Lease-scoped mutation functions | Denied |
| Authoritative usage | Optional safe own aggregate/read; no DML | Trusted idempotent append | Trusted idempotent append | Denied |
| User memory notes | Safe own read; narrow create/edit/soft-delete functions | Scoped note functions | Denied | Denied |
| System memory claims/evidence | Safe own claim projection if approved; no DML | Trusted producer function | Producer/version-scoped functions | Denied |
| Flashcard sessions | Safe own read; narrow start/complete/abandon functions | Scoped functions | Only if orchestration requires | Denied |
| Restricted diagnostics | No access | Support-reference creation only | Restricted append/reference | Denied |
| Private Storage | Authorized signed access and owner-scoped approved upload/delete | Signed access/scoped workflow | Versioned output write/cleanup only | Denied |

All base-table, column, sequence, view, and function privileges; permissive-policy interactions; function search paths; RLS owner/bypass behavior; and every supporting table must be catalog-asserted and tested. Service-role success never substitutes for restricted worker tests.

## Finding classification

### Confirmed implementation defects

1. Authenticated clients have excessive authority over authoritative `generation_jobs` fields.
2. Authenticated clients can fabricate and duplicate `usage_events`; the correlation index is not unique.
3. The repository cannot reproduce a fresh Supabase project from migrations.
4. Duplicate active-job prevention is a non-atomic cancel-then-insert sequence.
5. Job state transitions are unconditional and allow cancellation to be overwritten.
6. Memory superseding and identity resolution span multiple statements and use wildcard content matching.
7. Flashcard completion threshold state is page-local and has no durable, idempotent session identity.
8. Raw internal errors can flow into rows, the status API, UI, and logs.
9. An already-applied historical migration was edited in place.
10. Polling uses a fixed overlapping interval and incomplete reload restoration.

### Risks strongly supported by repository evidence

1. Broad memory mutation authority can corrupt trusted system-derived intelligence unless user-editable and system-derived records are separated.
2. Free-text memory source IDs can reference entities without enforced ownership.
3. `after()` jobs can be stranded by timeout, crash, redeploy, stale invocation, or duplicate callback.
4. Public visual URLs can expose personal study content; bucket creation, path isolation, overwrite/delete rules, and retention are not versioned.
5. Unbounded job, usage, memory, JSON, error, and object retention threatens privacy, cost, and performance.
6. Three-second polling creates roughly 20 authenticated API/database reads per active tab per minute before retries or multiple tabs.

### Claims that remain unverified

1. Authenticated cross-user SELECT, INSERT with another user's parent ID, UPDATE, and DELETE isolation for all three tables.
2. Actual live schema, constraint version, grants, policies, bucket configuration, and whether each historical SQL form was applied.
3. Safe upgrade from a populated database matching current live state.
4. Fresh-project reproducibility, including all pre-existing application tables and Storage contracts.
5. Concurrent enqueue, claim, transition, cancellation, memory superseding, and session completion behavior.
6. Crash recovery, stale-worker takeover, retry exhaustion, rollback/forward recovery, and old/new application coexistence.
7. Performance at representative and projected scale, polling load, index suitability, and retention-job cost.
8. Storage enumeration, read, signed/public URL, upload, overwrite, and delete isolation.
9. Durable build, integration, API, security, and E2E evidence in a representative environment.

### Governance failures

1. Beta Foundation V1 was delivered directly to `main` without the now-required specialist review, independent review, George approval, and protected merge workflow.
2. A historical migration was changed instead of corrected forward.
3. Verification results were reported without a permanent evidence bundle proving the milestone's principal security and integrity claims.
4. Repository truth was allowed to depend on manually existing Supabase objects.

The timing of the governance documentation means earlier contributors must not be accused of deliberate noncompliance. The result is nevertheless noncompliant and must be remediated prospectively without rewriting published history.

### Decisions requiring George's approval

The decision record is `.ai/decisions/beta-foundation-v1-founder-decisions.md`:

1. **D1:** queued/processing cancellation and partial-result/retry behavior.
2. **D2:** duplicate/active request behavior and idempotency window.
3. **D3:** durable worker infrastructure, lease/retry/timeout parameters, and evolution.
4. **D4:** usage authority and whether/when metering becomes consequential.
5. **D5:** memory trust classes and user/producer capabilities.
6. **D6:** exact durable flashcard-session eligibility.
7. **D7:** private-by-default Storage, signed URL lifetime, versioned output, and legacy containment.
8. **D8:** data-class retention.
9. **D9:** account deletion, anonymisation, and legally required retention.
10. **D10:** quarantine/repair/deletion of legacy invalid, duplicate, orphaned, or cross-linked data.
11. **D11:** canonical baseline plus explicit manifest for fresh/live convergence.
12. **D12:** local/test/staging/production access and exact approval boundaries.
13. **D13:** measurable beta reliability/performance targets and queue/partition triggers.

D1–D13 are approved with qualifications. Remaining gates are recorded under “Unresolved implementation and activation gates” near the end of this plan. Commit disposition, maintenance/degraded-service tolerance, MIME/size ceilings, provider selection, and separate merge/production approvals still require explicit resolution at their applicable gate.

## Priority model and task register

- **P0:** security, privacy, authorisation, data-integrity, or user-data corruption.
- **P1:** reliability, concurrency, migration, recovery, reproducibility, or correctness.
- **P2:** evidence depth, performance validation, observability, and governance.
- **Total tasks:** 14 — P0: 7, P1: 4, P2: 3. Migration baseline/manifest work (R07) is a P0 prerequisite because an ordering error can reintroduce broad policies or make fresh creation impossible.

### Database Architect required-change coverage

| Required change | Frozen plan location | Founder decision |
|---|---|---|
| Authenticated job authority | Actor matrix, R01 | D1–D2 |
| Atomic compare-and-set transitions | State table, R03 | D1–D3 |
| Worker lease enforcement | State table, R03/R08 | D3 |
| Active-job uniqueness | Separate identities, R03 | D2 |
| Request idempotency/payload conflicts | Separate identities, R03 | D2 |
| Trusted usage authority | R02 | D4 |
| Usage replay prevention/corrections | R02 | D4 |
| RLS grants and safe projections | RLS/grant matrix, R01–R07/R10 | D1, D4–D7 |
| Restricted worker authority | Actor matrix, R03/R08 | D3 |
| Fresh migration ordering | R07 manifest/prerequisite/historical/remediation order | D11–D12 |
| Existing-database upgrade ordering | R07 preflight/verified history/forward sequence | D10–D12 |
| Memory provenance/superseding | R04 separate notes/claims | D5, D8–D10 |
| Durable flashcard sessions | R05 | D6, D8–D9 |
| Private Storage/versioned objects | R06 | D7–D10 |
| Polling, indexes, retention, scale thresholds | R09/R11/R12 | D8, D13 |
| Public error versus restricted diagnostics | R06 | D8–D9 |

## P0 remediation tasks

### BFV1-R01 — Least-privilege job authority and parent ownership

- **Priority / severity:** P0 / Critical.
- **Exact problem:** authenticated clients can insert, update, or delete their own job rows and set authoritative operational/result fields; document ownership consistency is not database-enforced.
- **Final database design:** revoke authenticated base-table INSERT/UPDATE/DELETE; expose purpose-specific `enqueue` and `request_cancel` operations and an owner-safe job projection. Enqueue accepts only owned `document_id`, allowlisted `job_type`, versioned sanitized payload, and request idempotency key; database derives all identity, status, timestamps, attempts, correlation, lease, and worker fields. Use composite parent ownership or a transactionally locked equivalent.
- **Trusted actor:** restricted trusted application server for validated enqueue/cancel; lease-scoped worker for operational transitions; service role only for break-glass/migrations.
- **Permitted client actions:** read safe own DTO; request enqueue; request cancellation under D1. No direct base-table DML, deletion, result/diagnostic access, or authoritative field control.
- **Permitted worker actions:** none through owner credentials; restricted worker may invoke only R03 claim/heartbeat/acknowledge/complete/fail/retry functions.
- **Database enforcement:** derived fields, typed payload validation, parent ownership, safe view, denied DELETE, immutable terminal data, and purpose-specific functions; application checks are supplemental only.
- **RLS and grant requirements:** `anon`/non-owner denied; owner safe-view SELECT and minimal function `EXECUTE`; base-table write grants revoked; worker gets only operation-function execution; `PUBLIC` function execution revoked and fixed search paths asserted.
- **Idempotency design:** R03 request key/payload hash applies to enqueue; cancellation request is idempotent by job/state version.
- **Concurrency behaviour:** enqueue/cancel participate in one database transaction and compare-and-set state/version; no check-then-write ownership or cancellation flow.
- **Failure and retry behaviour:** validation/ownership failures reveal no parent existence; ambiguous mutation fails closed; safe repeat returns existing state; no broad-write fallback.
- **Migration sequence:** after R07 prerequisites/history reconciliation, add safe view/functions/grants compatibly, cut callers over, verify, then revoke broad historical policies/grants before stricter checks.
- **Acceptance tests:** direct PostgREST actor matrix, mass assignment, safe projection columns, parent-ID attacks, enqueue/cancel API, function ownership/search-path/grants, and concurrent enqueue/cancel.
- **Durable review evidence:** migration/grant/policy/function diff, catalog snapshot, safe-view schema, two-user transcript, API/concurrency artifacts, and rollback rehearsal tied to commit/checksums.
- **Repository evidence:** broad `FOR ALL` policy in `migrations/beta_foundation_v1.sql`; caller-shaped mutations in `src/app/actions/generationJobs.ts` and `src/app/api/jobs/visuals/route.ts`.
- **Affected files and systems:** a new forward migration; job server boundary; generation job types/actions/routes; Supabase grants/RLS; `documents` ownership relationship.
- **Security impact:** forged results/status, audit corruption, parent-ID probing, privilege expansion, and cross-tenant relationship risk.
- **Database or migration impact:** replace broad policies/grants forward; establish composite ownership or an equivalent parent-existence invariant; restrict clients to approved reads and narrowly justified user actions. Do not edit the historical migration.
- **Production-level implementation approach:** define actors (`authenticated user`, trusted worker/service, administrative recovery); revoke direct authenticated INSERT/UPDATE/DELETE unless explicitly required; expose minimal security-definer RPCs or server-only trusted operations with fixed search path, input validation, ownership checks, least grants, and audit identifiers; keep owner SELECT limited to safe columns/rows; split user cancellation from worker operational mutation.
- **Alternatives considered:** API-only enforcement without DB restrictions (rejected: bypassable); retaining `FOR ALL` with UI conventions (rejected); allowing client enqueue through a constrained insert policy (possible only if immutable/default fields and parent ownership are DB-enforced).
- **Trade-offs:** trusted server credentials/RPCs increase operational responsibility; strict DB authority reduces flexibility but creates a defensible trust boundary.
- **Acceptance criteria:** browser-authenticated users cannot forge completion/failure/result/error/timestamps/correlation/user/document/type, delete jobs, or reference another user's document; intended owner reads and cancellation still work; trusted worker operations are explicit and audited.
- **Required unit tests:** authorization decision matrix; allowed-field validation; safe DTO mapping; ownership-validation helpers.
- **Required integration tests:** owner enqueue/read/cancel through approved boundary; trusted worker mutation; parent ownership enforcement; catalog assertions for grants/policies/functions.
- **Required API tests:** anonymous denial; owner success; non-owner 404/403 without existence leakage; malformed IDs/payloads; no mass assignment.
- **Required authenticated two-user RLS tests:** User A/B SELECT, INSERT, UPDATE, DELETE matrix; User B attempts every authoritative column and User A document reference; direct PostgREST/browser client attempts must fail.
- **Required concurrency tests:** simultaneous owner enqueue/cancel and worker transition must preserve authority and ownership.
- **Required performance or load tests:** enqueue/read/cancel latency and policy/RPC query plans at representative tenant/job volume.
- **Rollback and recovery:** deploy additive trusted operations first, move application callers, verify, then revoke old policies; if application regression occurs, roll back application while retaining secure denials and use reviewed forward policy recovery—never restore broad write authority as an emergency shortcut.
- **Dependencies:** George D1–D3; BFV1-R07 migration preflight; coordinates with R03.
- **Safe parallelism:** may design in parallel with R02–R06; migration object names and shared policies require one Database Architect integrator.
- **Recommended specialist owner:** Database Security Architect with backend/job-platform engineer.
- **Claude Code implementation handoff:** implement only after Database Architect supplies approved policy/RPC contract and George approves; use a new migration, narrow server DTOs, and no client-authoritative fields.
- **Evidence required for Senior Reviewer re-review:** migration diff; grant/policy/function dump; direct-client denial transcript; two-user matrix; API results; query plans; application call-site diff; rollback rehearsal.

### BFV1-R02 — Server-authoritative, validated, idempotent usage ledger

- **Priority / severity:** P0 / Critical.
- **Exact problem:** clients can fabricate counts, models, duration, success, timestamps, document IDs, and correlation IDs, and can duplicate events.
- **Final database design:** separate authoritative immutable metering ledger from any future lower-trust product analytics. Ledger fields include event ID, operation ID, event kind, attempt, schema version, trusted producer, immutable idempotency key, provider request reference where available, quantities, public error code, occurred/recorded database timestamps, and append-only correction reference. Existing rows are permanently `legacy_unverified` and excluded from authority.
- **Trusted actor:** restricted application server/worker deriving facts from protected execution/provider context; never a caller-authenticated session alone.
- **Permitted client actions:** no direct authoritative INSERT/UPDATE/DELETE; optional approved own safe aggregate/read only. Browser analytics, if later approved, goes to a separate non-authoritative stream.
- **Permitted worker actions:** idempotent append and correction append through narrow producer-scoped function; no update/delete.
- **Database enforcement:** unique `(producer,idempotency_key)` plus constrained `(operation_id,event_kind,attempt)` where singular; ranges/enums/ownership; immutable rows; corrections append.
- **RLS and grant requirements:** direct authenticated/anonymous DML denied; safe owner read only if D4/D8/D9 approve; worker/server get function execution only; support/admin retention access separately controlled.
- **Idempotency design:** producer replay key is primary guard; operation/event/attempt uniqueness prevents semantic duplicates; same key/different payload is rejected and audited.
- **Concurrency behaviour:** concurrent identical appends converge to one event; different legitimate event kinds coexist; correction never races by overwriting history.
- **Failure and retry behaviour:** use durable outbox when events become consequential; retries use same key; failed recording is observable/recoverable and not silently swallowed; billing/limits remain disabled if ledger integrity is uncertain.
- **Migration sequence:** R07 baseline → additive trusted ledger/fields → mark old rows unverified → cut producers over and verify dedupe → revoke authenticated inserts → only later enable authoritative consumers.
- **Acceptance tests:** direct CRUD denial, 20-way replay, conflicting payload, multiple event kinds, correction, provider retry, parent ownership, document/account deletion, and entitlement query plans.
- **Durable review evidence:** ledger contract, catalog/grant snapshot, legacy classification counts, concurrency traces, consumer exclusion proof, retention decision, and seeded-volume plan.
- **Repository evidence:** authenticated INSERT policy and non-unique correlation index in the historical migration; caller-controlled `RecordUsageInput` in `src/app/actions/recordUsage.ts`; future entitlement TODO in `src/lib/entitlements/index.ts`.
- **Affected files and systems:** new migration; usage action/call sites/types; trusted service boundary; entitlements; audit/analytics contracts.
- **Security impact:** billing/limit fraud, audit falsification, abuse-control bypass, cross-parent reference risk, and corrupted analytics.
- **Database or migration impact:** revoke authenticated direct insert; add approved enum/range/JSON/ownership constraints; define immutable rows; introduce a stable unique event/idempotency key tied to operation and event kind; decide account-deletion/retention semantics.
- **Production-level implementation approach:** trusted server/worker derives user, document, model, counts, duration, outcome, and timestamps; insert through a least-privilege operation; use unique idempotency key with insert-on-conflict semantics returning the existing event; record public error code, not provider text; distinguish metering ledger from product analytics if their trust/retention needs differ.
- **Alternatives considered:** unique correlation ID alone (insufficient for multiple event kinds); client-signed payloads (unnecessary complexity and still weaker); best-effort duplicate query (race-prone).
- **Trade-offs:** reliable metering may require provider usage capture and retry-aware design; strict immutability makes corrections append-only rather than edits.
- **Acceptance criteria:** direct authenticated inserts/updates/deletes fail; trusted duplicate retries create exactly one logical event; values and parent ownership are constrained; usage is not enabled for billing/limits until verified.
- **Required unit tests:** idempotency-key construction; ranges/enums; trusted input derivation; correction-event rules.
- **Required integration tests:** first insert, duplicate retry, conflicting payload with same key, immutable-row denials, document deletion behavior.
- **Required API tests:** client cannot supply authoritative values; anonymous and direct authenticated mutation denied; service errors do not leak.
- **Required authenticated two-user RLS tests:** owner may read only approved own usage; non-owner cannot select or reference User A's document; neither user can directly insert/update/delete.
- **Required concurrency tests:** 20+ simultaneous identical events persist once; distinct event kinds remain distinct; worker retry and callback duplication do not double count.
- **Required performance or load tests:** sustained event ingestion, period/type counts, index size/write amplification, entitlement query latency at projected volume.
- **Rollback and recovery:** keep old rows, label pre-remediation records non-authoritative, deploy additive key/constraints where compatible, cut callers over, then revoke; correction is append-only; quarantine conflicts rather than delete without George approval.
- **Dependencies:** George D4, D8, D9, and D10; R07 preflight; R03 worker authority design.
- **Safe parallelism:** can run parallel with R01 and R04 if one migration integrator owns shared SQL ordering.
- **Recommended specialist owner:** Database Security Architect plus entitlements/billing engineer.
- **Claude Code implementation handoff:** replace generic caller-controlled recording with internal trusted event creation; do not make billing decisions from legacy rows.
- **Evidence required for Senior Reviewer re-review:** policy/grant dump; constraints and unique-key contract; concurrency transcript; immutable/direct-client denial tests; reconciliation count of legacy/duplicate candidates; load result.

### BFV1-R03 — Atomic job uniqueness, transitions, leases, and cancellation

- **Priority / severity:** P0 / Critical.
- **Exact problem:** duplicate prevention and transitions are non-atomic; cancelled/terminal jobs can be overwritten by stale callbacks; there is no claim ownership or timestamp invariant.
- **Final database design:** implement the explicit state table and separate identities above using `state_version`, attempts/max attempts, worker ID, lease token/expiry, heartbeat, retry schedule, cancellation request, public error fields, and purpose-specific enqueue/claim/heartbeat/cancel-ack/complete/fail-retry/recover functions. Active partial uniqueness covers `(user_id,document_id,job_type)` in queued/processing/cancel-requested states.
- **Trusted actor:** owner/server can enqueue and request cancel; restricted worker can mutate only a job it currently leases; reconciler uses a separate recovery function; service role is not routine worker identity.
- **Permitted client actions:** narrow enqueue and cancellation request plus safe read; D1/D2 determine user-visible outcomes. No transition or operational-field write.
- **Permitted worker actions:** claim, heartbeat, acknowledge cancel, complete, fail/requeue, and recovery only with expected state/version and current lease token.
- **Database enforcement:** compare-and-set on every transition, database time, terminal immutability, state/timestamp/result invariants, lease validation, retry bounds, active unique index, request uniqueness, parent ownership.
- **RLS and grant requirements:** base mutations denied; purpose-specific execution grants per actor; worker functions cannot access arbitrary user rows; safe projection omits leases/private input/diagnostics.
- **Idempotency design:** request key/hash distinct from active-work key; job attempt/lease distinct from side-effect keys; same request returns existing, mismatch rejects, terminal callback returns existing outcome.
- **Concurrency behaviour:** one winner for enqueue, claim, cancellation, completion, retry, and recovery; stale/wrong-token actors affect zero rows; D2 controls distinct active request behavior.
- **Failure and retry behaviour:** retry only classified transient failures, bounded by D3 parameters; lease expiry drives recovery; cancellation prevents publication; partial side effects remain non-winning and are cleaned safely.
- **Migration sequence:** R07 preflight/duplicate disposition → additive fields/backfill → functions/indexes → compatible callers/worker → verify → revoke old updates → validate strict checks.
- **Acceptance tests:** full transition table, illegal/terminal transitions, 20-way enqueue/claim, wrong/expired lease, cancel/complete barrier, duplicate callback, retry exhaustion, crash/reclaim, payload mismatch, and plans under contention.
- **Durable review evidence:** approved state diagram/parameters, schema/functions/checksums, real-connection race traces, terminal invariants, stale-worker proof, and recovery runbook.
- **Repository evidence:** cancel-then-insert in job action/visual route; unconditional `.update(...).eq('id', job.id)`; no partial unique active-job constraint; `updateJobStatus` accepts arbitrary state.
- **Affected files and systems:** new migration; job RPC/repository; job route/actions/types; worker and status API.
- **Security impact:** authoritative state corruption and user-visible results attributed to the wrong execution; cancellation integrity failure.
- **Database or migration impact:** atomic active-job uniqueness; conditional transition operations; lease owner/token, attempt, heartbeat/lease expiry, retry schedule; terminal and timestamp/result/error invariants; legacy duplicate preflight.
- **Production-level implementation approach:** database-enforced one active logical job per approved idempotency scope; atomic enqueue-or-return; compare-and-set transitions with expected state plus lease token; terminal immutability; cancellation request that prevents stale completion; bounded retry and stale-lease recovery; at-least-once execution with idempotent side effects rather than claiming exactly-once.
- **Alternatives considered:** advisory locks (possible but harder across failures); application mutex (not distributed); partial unique index plus RPC (recommended baseline); serializable transaction (possible with retry cost).
- **Trade-offs:** lease/attempt metadata adds complexity; exactly-once is unrealistic across provider/Storage boundaries, so idempotent effects are required.
- **Acceptance criteria:** concurrent enqueue produces one active logical job; only legal expected-state transitions succeed; stale lease/callback cannot mutate; cancellation wins according to approved contract; timestamps/results match state.
- **Required unit tests:** transition table; lease expiry; retry/backoff calculation; terminal invariants; cancellation precedence.
- **Required integration tests:** atomic enqueue/claim/heartbeat/complete/fail/cancel/reclaim; duplicate existing-row preflight; side-effect idempotency.
- **Required API tests:** duplicate requests return stable job identity/semantics; cancellation/status DTOs; forbidden transitions are not exposed.
- **Required authenticated two-user RLS tests:** neither user can claim/transition/cancel another user's job; parent reference attacks fail.
- **Required concurrency tests:** simultaneous enqueues, claims, completes, cancels, retry callbacks, stale/live workers, and terminal races using real concurrent connections.
- **Required performance or load tests:** hot-document contention, claim throughput, index query plan, polling read interaction, deadlock/serialization retry rate.
- **Rollback and recovery:** preflight/quarantine legacy duplicate active rows with George-approved disposition; add metadata compatibly; dual-read before cutover; disable new claims if invariant fails; recover forward without dropping evidence.
- **Dependencies:** R01 authority contract; R07 migration preflight; George D1–D3 and D10.
- **Safe parallelism:** state-machine design can parallel R01/R02; implementation must be sequential with shared job migration and worker cutover.
- **Recommended specialist owner:** Job Platform Architect plus Database Architect.
- **Claude Code implementation handoff:** implement the approved state machine exactly; remove generic `updateJobStatus`; all mutations must be conditional and lease-aware.
- **Evidence required for Senior Reviewer re-review:** state diagram; migration diff; invariant/catalog dump; concurrent test transcript; recovery test; API contract; proof stale callbacks cannot overwrite cancel/terminal rows.

### BFV1-R04 — Trusted memory provenance and atomic superseding

- **Priority / severity:** P0 / High.
- **Exact problem:** broad client mutation and caller-shaped server actions undermine trusted intelligence; memory identity is non-unique; wildcard/multi-call superseding can deactivate unrelated truth or create duplicates; source ownership is not enforced.
- **Final database design:** under approved D5, use distinct `user_memory_notes` and `system_memory_claims` plus claim-evidence linkage, with temporary behavioural signals in a separate short-lived path. Only verified claims enter `system_memory_claims`; unverified AI inference remains a temporary/unverified signal. Verified claims carry producer/version, claim type, typed canonical subject/entity key, evidence IDs, verification/inference version, confidence, validity, and `superseded_by`; enforce one active claim per `(user_id,claim_type,subject_type,subject_id,producer_version)`. Historical rows are `legacy_unverified`. Content wildcard is never identity.
- **Trusted actor:** owners manage notes through narrow functions; an approved verification workflow and trusted server/producer or restricted worker creates/supersedes verified system claims; temporary behavioural signals use a separate short-lived event path.
- **Permitted client actions:** own safe note read/create/edit/soft-delete; safe system-claim visibility/correction request if D5 approves; no claim creation, provenance selection, confidence/producer change, or direct base DML.
- **Permitted worker actions:** producer/version-scoped atomic claim create/supersede with evidence; no user-note mutation or arbitrary claim rewrite/delete.
- **Database enforcement:** typed parent ownership, canonical keys, partial unique active claim, transaction/row-key lock, immutable history, explicit supersession link, schema/version checks.
- **RLS and grant requirements:** separate safe projections/policies/functions for notes and claims/evidence; authenticated generic writes revoked; worker limited by producer operations; non-owner/anonymous denied.
- **Idempotency design:** immutable inference/claim key built from producer version, canonical subject, claim type, and evidence set/version; replay returns existing claim/history outcome.
- **Concurrency behaviour:** same-key supersedes serialize and leave exactly one active claim plus complete history; different keys proceed independently; foreign entity references fail atomically.
- **Failure and retry behaviour:** failed inference leaves prior active claim intact; retries reuse inference key; personalization ignores unverified/partial data and can be feature-disabled.
- **Migration sequence:** R07 baseline/preflight → create separate trust tables/functions/projections → classify legacy rows → cut producers/readers → verify → revoke generic historical writes → enable trusted personalization.
- **Acceptance tests:** actor CRUD matrix, same-key races, supersede failure, null/canonical identity, wildcard isolation, typed parent ownership, evidence retention/deletion, retrieval plans, and legacy exclusion.
- **Durable review evidence:** approved D5 contract, schema/grants/policies, legacy/duplicate report, race traces, two-user parent tests, producer diffs, and recomputation/rollback proof.
- **Repository evidence:** `FOR ALL` memory policy; `saveMemory` wildcard `.like`, separate deactivate/query/update/insert, optional lookup omissions; free-text source IDs.
- **Affected files and systems:** new migration; memory actions/types/dashboard; quiz/flashcard memory producers; personalization consumers.
- **Security impact:** cross-entity association, personalization poisoning, loss of correct student memory, and indistinguishable user/system provenance.
- **Database or migration impact:** operation-specific policies; stable canonical memory key; partial uniqueness; parent ownership strategy; transactional upsert/supersede operation; provenance/producer/version fields; retention/deletion rules.
- **Production-level implementation approach:** implement distinct user-note, verified-system-claim, and temporary-signal storage under approved D5; trusted verification producers write claims through validated operations, while unverified inference cannot promote itself; canonical identity uses explicit normalized fields, never content wildcard; supersede and create/update in one transaction under a uniqueness constraint; entity types use enforceable typed references or a reviewed entity registry.
- **Alternatives considered:** retain one table with provenance discriminator and column grants (viable); separate tables (stronger boundary, more migration); content hashing alone (not sufficient identity).
- **Trade-offs:** strict typed sources reduce flexibility; a generic entity registry adds indirection; separate tables simplify trust but increase query composition.
- **Acceptance criteria:** direct clients cannot forge trusted memories; intended user edits are explicit; one active memory exists per canonical key; concurrent superseding cannot lose all truth or duplicate it; other-user entities cannot be referenced.
- **Required unit tests:** canonical key normalization/null handling; provenance rules; supersession decisions; metadata schema validation.
- **Required integration tests:** transactional upsert/supersede; null identities; wildcard-like content does not affect unrelated rows; typed source ownership; legacy duplicate handling.
- **Required API tests:** trusted and user-editable endpoints/actions accept only allowed fields; non-owner/non-producer denial; safe validation errors.
- **Required authenticated two-user RLS tests:** complete CRUD matrix for both memory classes plus cross-user document/recording/source reference attempts.
- **Required concurrency tests:** simultaneous same-key writes, different-key writes, supersede/update, and retry replay.
- **Required performance or load tests:** retrieval/index plans by user/category/agent/entity and high-cardinality memory volume; supersede contention.
- **Rollback and recovery:** preserve legacy records with provenance `legacy_unverified`; backfill canonical keys only after duplicate report/George approval; quarantine conflicts; application can temporarily ignore system-memory adaptation without deleting rows.
- **Dependencies:** George D5, D8–D10; R07 migration preflight.
- **Safe parallelism:** can design alongside job/usage work; memory migration and producer cutover form one sequential lane.
- **Recommended specialist owner:** Intelligence Database Architect plus Security Engineer.
- **Claude Code implementation handoff:** remove wildcard superseding and generic trusted writes; implement only the approved provenance model and atomic operation.
- **Evidence required for Senior Reviewer re-review:** schema/policy contract; duplicate preflight; concurrency transcript; two-user/source-ownership matrix; producer call-site diff; retrieval performance results.

### BFV1-R05 — Durable, idempotent flashcard session evidence

- **Priority / severity:** P0 / High.
- **Exact problem:** the “three sessions” threshold uses a page-local ref, resets on reload, and can count repeated final-card actions/tabs/retries as separate sessions.
- **Final database design:** create `flashcard_study_sessions` tied to owned document and immutable flashcard-set/version, with server ID, mode, status, start/complete/abandon times, eligible activity/outcomes, schema version, and owner-scoped idempotency key; optional inference-evidence join links three distinct sessions to one system claim. Mutable progress remains UI resume state only.
- **Trusted actor:** server validates start/resume/complete; owner invokes narrow functions; trusted inference producer creates the D5 system claim.
- **Permitted client actions:** start/resume/complete/abandon own session with allowlisted activity evidence and stable request key; read own safe session summary. No direct counter/status/timestamp/result writes.
- **Permitted worker actions:** none by default; inference producer may read eligible session IDs and append one idempotent system claim/evidence link.
- **Database enforcement:** parent/card-set ownership, one active session for approved scope, compare-and-set terminal completion, unique `(user_id,idempotency_key)`, terminal timestamp checks, immutable completion evidence.
- **RLS and grant requirements:** safe owner SELECT and narrow functions; direct INSERT/arbitrary UPDATE/DELETE denied; inference role receives only approved aggregation/claim execution.
- **Idempotency design:** reload/tab/offline retries reuse server session and request key; completion is one-way; preference inference has a unique evidence-set/inference-version key.
- **Concurrency behaviour:** duplicate tabs join/resume the same active session; only one completion wins; simultaneous third eligible completion produces one inference.
- **Failure and retry behaviour:** offline completion replays same key; abandoned/expired sessions never count; failed claim creation can recompute from immutable completions without recounting.
- **Migration sequence:** R04 system-claim contract → R07 ordered session/evidence migration → server session functions → UI cutover → verify → enable inference; never backfill page-local counts.
- **Acceptance tests:** D6 eligibility boundaries, refresh/retry/double-click/two-tab/offline replay, abandoned/review-only, regenerated set, third-session race, foreign parent/set, recomputation and rollback.
- **Durable review evidence:** D6 approval, schema/function/grant snapshot, real concurrency traces, cross-user matrix, three-session journey across reload/offline, and inference evidence chain.
- **Repository evidence:** `sessionCountRef` and `>= 3` memory write in `src/components/study/FlashcardsPanel.tsx`; no session/event migration.
- **Affected files and systems:** new migration; flashcard progress/session actions; panel; memory inference producer; analytics.
- **Security impact:** corrupted adaptive preference claims and manipulable student profile.
- **Database or migration impact:** immutable session/completion event with server-issued stable ID/idempotency key; ownership/parent constraints; unique completion; approved retention.
- **Production-level implementation approach:** create a durable session at actual study start; record one completion transition atomically; retries return the same completion; derive preference from distinct eligible completed sessions through a transaction/materialized rule, with inference version and evidence IDs; define review-learning sessions and abandoned sessions explicitly.
- **Alternatives considered:** increment counter on progress row (simple but weak audit/concurrency); event ledger (recommended); client-generated UUID alone (acceptable only with server ownership and uniqueness checks).
- **Trade-offs:** event history costs storage but supports audit and recomputation; explicit session semantics require product decisions.
- **Acceptance criteria:** reloads, repeated clicks, concurrent tabs, and retries cannot double count; three genuinely distinct approved sessions trigger exactly one versioned inference; fewer than three never do.
- **Required unit tests:** eligibility and threshold rules; session lifecycle; idempotency key; inference versioning.
- **Required integration tests:** create/resume/complete/abandon/review sessions; threshold aggregation; inference linkage; deletion/retention behavior.
- **Required API tests:** start/complete retry semantics; malformed/foreign document; duplicate completion; safe responses.
- **Required authenticated two-user RLS tests:** User B cannot view/create/complete User A sessions or reference User A flashcard/document IDs.
- **Required concurrency tests:** double click, two tabs, refresh retry, offline replay, and concurrent third-session completion create one completion/inference.
- **Required performance or load tests:** threshold query/aggregation at long user history; write throughput and index growth.
- **Rollback and recovery:** disable preference inference feature flag while retaining events; legacy page-local counts are not backfilled as trusted sessions; repair via recomputation from immutable evidence.
- **Dependencies:** R04 provenance model; George D5, D6, D8, D9; R07 migration sequencing.
- **Safe parallelism:** event contract can parallel R04; inference integration follows R04.
- **Recommended specialist owner:** Student Intelligence Engineer plus Database Architect.
- **Claude Code implementation handoff:** replace `sessionCountRef` as authority; do not infer historical sessions from page state.
- **Evidence required for Senior Reviewer re-review:** event schema/contract; retry/concurrency transcript; three-session acceptance run across reloads; two-user denial evidence; recomputation/rollback exercise.

### BFV1-R06 — Error confidentiality and private visual Storage boundary

- **Priority / severity:** P0 / High (privacy decision includes Medium reviewer finding).
- **Exact problem:** raw errors are stored/returned/rendered/logged; visual objects use public URLs without a reproducible bucket/policy/path contract.
- **Final database design:** owner-readable job projection stores only versioned safe result summary, `public_error_code`, `public_message_key`, and `support_reference`. Restricted diagnostics live in a separate worker/support-only table or approved observability sink. `study-documents`, `recordings`, and `study-visuals` are private by default under D7, storing bucket/path—not signed/public URLs. Visual paths are immutable/versioned by user/document/job/generation so stale workers cannot overwrite a winner.
- **Trusted actor:** server mints signed access after ownership check; restricted worker writes versioned visuals/diagnostic references; support/admin access to diagnostics follows D8/D9.
- **Permitted client actions:** authenticated owner may request short-lived signed access and perform only approved owner-prefix upload/delete workflows; read safe error/result DTO. No raw diagnostic or public bucket access.
- **Permitted worker actions:** upload new versioned object, atomically publish winning path under current lease, append restricted diagnostic reference, and approved cleanup; no fixed-path overwrite.
- **Database enforcement:** safe view/projection, separate restricted diagnostics, allowlisted result schema/version, canonical owner paths, private bucket policies, MIME/size controls, parent ownership, winning-generation pointer.
- **RLS and grant requirements:** diagnostics denied to owner/anon; safe projection only; Storage list/read/sign/upload/update/delete matrix by owner/server/worker; service role break-glass only.
- **Idempotency design:** public failure maps deterministically by classified code; support reference stable per failure; object and publish keys use job/generation; duplicate/stale uploads cannot replace winner.
- **Concurrency behaviour:** simultaneous workers create isolated versions; only current lease publishes; cleanup never removes current version; signed URL refresh does not mutate authority.
- **Failure and retry behaviour:** fallback is generic safe message/reference; upload/publish partial failures remain unpublished and recoverable; signed URLs refresh; private access is never rolled back by reopening public buckets.
- **Migration sequence:** R07 manifest → safe error/result fields/view and diagnostic boundary → signed-read/versioned-write application support → private bucket/object policies → legacy public-object containment/copy/reference verification → approved cleanup.
- **Acceptance tests:** secret/provider/SQL/Storage-shaped errors, direct diagnostic SELECT denial, safe DTO/log scans, anonymous/A/B/worker Storage matrix, signed expiry/refresh, stale-worker output, MIME/size/path traversal, legacy containment.
- **Durable review evidence:** D7–D9 approvals, safe projection/catalog, redaction artifacts, bucket/policy snapshot, signed URL traces, cross-user Storage matrix, versioned-output race and cleanup rehearsal.
- **Repository evidence:** raw exception assignment in visual job route; status route selects `error`; `VisualsPanel` renders it; raw `console.error` in visuals action; `getPublicUrl`; no Storage migration.
- **Affected files and systems:** new migration for safe job error fields and Storage contract; visual action/route/status/UI/logger; bucket/object policies; retention cleanup.
- **Security impact:** provider, SQL, configuration, path, secret, personal-data, and student-content disclosure.
- **Database or migration impact:** public error code/reference separated from restricted diagnostic data; length/shape constraints; versioned bucket and `storage.objects` policies after George decision; canonical `user_id/...` paths; MIME/size/retention rules.
- **Production-level implementation approach:** map internal failures to stable public codes/messages; status API returns only public DTO and support reference; structured logs use allowlisted metadata and redaction, never raw provider body/public URL/student content; default visual bucket private with short-lived signed URLs; isolate SELECT/INSERT/UPDATE/DELETE by canonical owner prefix; define cleanup.
- **Alternatives considered:** public bucket with unguessable names (rejected as privacy control); storing encrypted diagnostics in job row (possible but unnecessary initially); external restricted observability sink (recommended for diagnostics).
- **Trade-offs:** signed URLs require refresh/caching behavior; less user-visible detail increases support reliance on correlation references.
- **Acceptance criteria:** no raw internal text reaches database public fields, API, UI, browser console, or standard logs; User A cannot enumerate/read/overwrite/delete User B objects; visual recovery works with private access.
- **Required unit tests:** error classifier/redactor; public DTO serializer; log metadata allowlist; storage path builder.
- **Required integration tests:** provider/SQL/storage-shaped failure sanitization; signed URL expiry/refresh; object lifecycle and cleanup.
- **Required API tests:** status failures expose stable code/message/reference only; authorization does not leak existence; headers/cache behavior reviewed.
- **Required authenticated two-user RLS tests:** database error-field visibility plus Storage list/read/signed-url/upload/upsert/delete cross-user matrix and anonymous denial.
- **Required concurrency tests:** simultaneous object replacement/generation cannot overwrite another job/user; duplicate callback is idempotent.
- **Required performance or load tests:** signed URL/API latency, object policy query plans, URL refresh rate, storage/list pressure.
- **Rollback and recovery:** private-first rollout; retain old public objects only under a time-bounded, approved migration/containment plan; revoke public access only after application signed access works; keep an emergency server proxy rather than reopening the bucket.
- **Dependencies:** George D7–D12; R07/R09.
- **Safe parallelism:** error-contract implementation and Storage design can run in parallel with separate owners; one integration gate controls rollout.
- **Recommended specialist owner:** Security Engineer plus Supabase Storage Architect.
- **Claude Code implementation handoff:** implement safe error DTO/logging independently of Storage decision; do not expose raw errors or make a bucket public.
- **Evidence required for Senior Reviewer re-review:** code search/negative fixtures; sanitized API/UI/log transcript; bucket/policy catalog; two-user/anonymous Storage matrix; signed URL/reload evidence; retention test.

## Additional P0 prerequisite

### BFV1-R07 — Forward-only migration reconciliation and complete fresh chain

- **Priority / severity:** P0 / Critical.
- **Exact problem:** the migration chain is incomplete, an applied migration was edited, and live schema/grant/policy state is unknown; fresh and populated upgrade paths are absent.
- **Final database design:** use a versioned explicit migration manifest/checksum contract. Recommended D11 model: a canonical active-product prerequisite baseline; then the byte-for-byte immutable historical `beta_foundation_v1.sql` at its declared manifest position for fresh builds; then forward reconciliation/domain migrations. Existing beta environments mark verified historical steps only after approved catalog comparison. Fresh and upgraded normalized catalogs must match exactly.
- **Trusted actor:** Database Architect owns manifest/order and migration SQL; release operator applies only after George's exact environment/action approval; service role is migration-only.
- **Permitted client actions:** none. Migration ordering/history/catalog marking cannot be invoked by application users.
- **Permitted worker actions:** none. Workers do not own schema, grants, policies, or migration history.
- **Database enforcement:** immutable checksum gate, explicit manifest version/order, prerequisites before historical file, remediation after it, schema/policy assertion migration, and no manual dashboard dependencies.
- **RLS and grant requirements:** every baseline/remediation object includes explicit grants, RLS, safe projections, function execution, worker scope, and policy-combination assertions; no temporarily exposed table.
- **Idempotency design:** migration runner records manifest step/checksum once; compatible resume detects completed/partial steps; `IF NOT EXISTS` never substitutes for definition comparison.
- **Concurrency behaviour:** one serialized migration owner/executor; preflight lock/rewrite estimates; application compatibility stages and controlled traffic; no concurrent tasks mutate shared DB objects.
- **Failure and retry behaviour:** abort on checksum/schema drift or failed preflight; detect partial application and resume only by runbook; prefer forward recovery after authoritative writes; never silently mark unknown live state applied.
- **Migration sequence:** `active_product_schema_prerequisites` → immutable historical file via manifest → `beta_foundation_migration_history_reconciliation` → job authority → job state/idempotency → trusted usage → memory provenance → sessions → private Storage → indexes/retention support → policy/schema assertions. Existing live path begins with approved read-only catalog/backup/clone and skips only manifest steps proven already applied.
- **Acceptance tests:** checksum/order/tool behavior, zero-to-final fresh build, populated-beta clone upgrade, compatible/incompatible existing objects, interruption/resume, old/new app coexistence, normalized catalog equality, full actor/RLS/Storage matrices.
- **Durable review evidence:** manifest and checksum, proposed filenames/order, preflight/catalog diff, backup/restore proof, fresh/upgrade transcripts, normalized schema equality, lock timings, partial-failure recovery, and George D10–D12 approvals.
- **Repository evidence:** only one migration exists and references unversioned `documents`; Git diff shows in-place CHECK edit; no schema/policy dumps or upgrade transcript.
- **Affected files and systems:** new ordered migrations only; all application tables/functions/extensions/buckets/policies required by active product; migration tooling and test fixtures.
- **Security impact:** schema drift can silently retain permissive policies or inconsistent constraints and break tenant isolation.
- **Database or migration impact:** establish immutable migration baseline strategy; create separate forward reconciliation migrations for existing beta and a complete ordered chain for fresh projects without altering `beta_foundation_v1.sql`.
- **Production-level implementation approach:** Database Architect inventories every active-product query/write/conflict/storage dependency; under separately approved read-only environment access, compare catalogs with repository; design additive/forward corrections; include explicit roles/policies/grants and dependencies; use staged `NOT VALID`/validation or concurrent indexes where justified; record checksums and schema contract.
- **Alternatives considered:** revert/edit/squash old migration (rejected for applied history); snapshot baseline plus subsequent migrations (viable if provenance and fresh reproducibility are preserved); full historic reconstruction (more auditable, higher effort).
- **Trade-offs:** baseline snapshots are practical but obscure evolution; complete reconstruction costs time but provides stronger long-term truth.
- **Acceptance criteria:** historical file checksum remains unchanged; a fresh approved test project builds solely from version control; an existing-beta clone upgrades without loss; final schema/grants/policies match one reviewed contract.
- **Required unit tests:** migration manifest ordering/checksum validation; schema-contract normalization helpers.
- **Required integration tests:** empty project apply; current-beta populated clone apply; partial-failure/resume; application smoke/persistence.
- **Required API tests:** critical reads/writes operate on both fresh and upgraded schemas.
- **Required authenticated two-user RLS tests:** full anonymous/owner/non-owner CRUD and parent-reference matrix on both paths.
- **Required concurrency tests:** application traffic during compatible migration stages; lock/contention behavior; unique constraint introduction with competing writes.
- **Required performance or load tests:** migration duration/locks/table scans/index build and post-migration query plans on representative volumes.
- **Rollback and recovery:** preflight and abort before incompatible state; backup/snapshot plus restore rehearsal; prefer forward recovery once writes use new schema; each stage has detection query, resume rule, and old/new app compatibility statement.
- **Dependencies:** George D10–D12 and maintenance tolerance; R01–R06 contracts define target objects.
- **Safe parallelism:** inventory, target contracts, and test harness design may parallel; a single Database Architect owns migration ordering and shared objects.
- **Recommended specialist owner:** Database Architect and Release Database Engineer.
- **Claude Code implementation handoff:** not until the target schema contract is independently reviewed; create new files only and preserve historical checksum.
- **Evidence required for Senior Reviewer re-review:** old-file checksum; migration manifest; schema diff; fresh/upgrade transcripts; preflight outputs; lock timings; backup/restore and partial-failure rehearsal; two-user matrices.

#### Required upgrade-path runbook content (no SQL in this plan)

1. **Preflight:** identify exact target environment; confirm approvals; record application/commit and migration checksums; inventory tables, columns, constraints, indexes, functions, triggers, grants, RLS policies, roles, buckets, object policies, row counts, invalid/duplicate/orphan candidates, active jobs, and estimated lock/rewrite cost. Abort on unknown permissive policies, incompatible types, unresolved duplicates, missing backup, or unexpected historical constraint form.
2. **Backup guidance:** take provider-supported database backup/snapshot and separately inventory/export required Storage metadata/objects; record restore point, owner, encryption/access, retention, and tested restore procedure. A backup without a restore rehearsal is insufficient evidence.
3. **Execution:** use reviewed forward migrations in a transaction where safe; separate long-running index/constraint validation when necessary; preserve old/new app compatibility; use maintenance controls only with George approval.
4. **Validation queries:** verify schema/constraint/index/function definitions, policy/grant exactness, RLS enabled/forced decision, duplicate active jobs, illegal states/timestamps, usage key uniqueness/ranges, active memory uniqueness/provenance, session uniqueness, orphan ownership, bucket visibility/path policies, and before/after counts/checksums. Actual SQL belongs to the later approved migration/verification implementation.
5. **Rollback/forward recovery:** before application cutover, restore or revert compatible additive objects if rehearsed; after authoritative writes begin, prefer reviewed forward repair to avoid losing new data. Define abort point, service containment, reconciliation, and communication for every stage.

#### Required fresh-project path

Provision a disposable Supabase-compatible test project from zero; apply only version-controlled migrations in order; create no manual dashboard objects; seed two authenticated users and representative owned parents through approved fixtures; run schema-contract, application smoke, RLS, Storage, concurrency, and migration-idempotence checks; destroy the environment after retaining sanitized evidence.

### Proposed migration filenames only

No SQL is authorized. Timestamp prefixes are assigned only after D11 approves the manifest:

1. `YYYYMMDDHHMMSS_active_product_schema_prerequisites.sql`
2. `YYYYMMDDHHMMSS_beta_foundation_migration_history_reconciliation.sql`
3. `YYYYMMDDHHMMSS_generation_job_authority_and_parent_integrity.sql`
4. `YYYYMMDDHHMMSS_generation_job_state_machine_and_idempotency.sql`
5. `YYYYMMDDHHMMSS_trusted_usage_ledger.sql`
6. `YYYYMMDDHHMMSS_memory_provenance_and_atomic_superseding.sql`
7. `YYYYMMDDHHMMSS_flashcard_study_sessions.sql`
8. `YYYYMMDDHHMMSS_private_storage_contract.sql`
9. `YYYYMMDDHHMMSS_foundation_query_indexes_and_retention_support.sql`
10. `YYYYMMDDHHMMSS_foundation_policy_and_schema_assertions.sql`

Filename order alone is prohibited. If tooling cannot explicitly position the immutable historical file after prerequisites and before remediation, use the D11-approved consolidated-baseline alternative while preserving the historical file as an audited, never-executed-on-fresh artifact.

## P1 remediation tasks

### BFV1-R08 — Durable job execution, recovery, and idempotent side effects

- **Priority / severity:** P1 / High.
- **Exact problem:** Next.js `after()` is invocation-bound and cannot provide durable retries/recovery; interrupted rows strand and duplicate callbacks can repeat visuals/usage.
- **Final database design:** R03 database state machine remains source of truth; the D3-approved provider-neutral managed-workflow direction uses at-least-once delivery and a restricted worker that claims leases and commits versioned/idempotent side effects. Queue receipt never itself authorizes completion. No provider-specific design is final until George approves the comparison and proof of concept.
- **Trusted actor:** dedicated restricted worker identity; trusted server schedules after atomic enqueue; service role prohibited for routine work.
- **Permitted client actions:** enqueue/cancel/status only through R01; no worker trigger payload can grant identity or job authority.
- **Permitted worker actions:** claim due work, heartbeat, inspect scoped protected input, write versioned output, append usage/system claims, complete/fail/retry/ack-cancel under current lease.
- **Database enforcement:** lease/CAS functions, worker grants, side-effect keys, winning-generation publish, bounded attempts, recovery index, and outbox where consequence requires.
- **RLS and grant requirements:** worker executes only scoped functions/projections; no arbitrary user table/bucket access; queue credential and DB credential are separate protected secrets.
- **Idempotency design:** at-least-once delivery keyed by job/attempt; provider request, object version, result publish, usage event, and system claim have replay guards.
- **Concurrency behaviour:** duplicate deliveries/two workers may execute but only current lease and one side-effect identity can win; stale output cannot publish.
- **Failure and retry behaviour:** D3 bounded retry/backoff; classify transient/permanent; heartbeat/reclaim; cancel checkpoints; dead-letter/manual recovery; partial effects quarantined/reconciled.
- **Migration sequence:** R03 schema/functions → provider-neutral worker contract → security/cost/capability/scalability comparison → separately approved proof of concept → George provider approval → restricted worker role/projection and chosen adapter → idempotent visual effects → dual-run-disabled verification → stop `after()` path → enable durable delivery.
- **Acceptance tests:** duplicate delivery, two workers, wrong/expired lease, crash/redeploy, provider timeout, DB/Storage partial failure, cancel during work/commit, retry exhaustion, dead-letter recovery, result/usage dedupe.
- **Durable review evidence:** D3 approval/ADR, role/grant snapshot, interruption and duplicate-delivery traces, queue metrics, side-effect reconciliation, cancel/recovery runbook.
- **Repository evidence:** `after()` with `maxDuration = 300`; no worker, queue, lease, heartbeat, recovery scanner, or provider-side idempotency.
- **Affected files and systems:** job worker/queue adapter; deployment/runtime configuration; visual generation/persistence/usage; monitoring; job API.
- **Security impact:** duplicated/cross-attributed artifacts and usage, stale unauthorized callback mutation, and raw failure persistence if boundaries are weak.
- **Database or migration impact:** uses R03 lease/attempt/idempotency fields and operations; may require outbox/side-effect ledger.
- **Production-level implementation approach:** choose approved durable queue/worker; claim with lease token; heartbeat; bounded exponential retry with jitter; dead-letter/manual recovery; idempotent provider result persistence, Storage object naming, database write, and usage event; cancellation checks before expensive work and before commit; recovery scanner for expired leases; correlation/trace without PII.
- **Alternatives considered:** retain `after()` for controlled beta with explicit non-durability (temporary only); managed queue/serverless workflow (recommended operational simplicity); self-hosted workers (control, higher operations).
- **Trade-offs:** durable infrastructure adds cost/operations; at-least-once requires idempotency throughout.
- **Acceptance criteria:** process termination/redeploy recovers or safely fails jobs; retry does not duplicate visuals/usage; stale workers cannot commit; users retain reload restoration and clear recovery state.
- **Required unit tests:** retry classifier/backoff; lease handling; cancellation checkpoints; idempotent effect keys.
- **Required integration tests:** queue delivery, duplicate delivery, provider timeout, Storage/database partial failure, lease expiry/reclaim, dead-letter recovery.
- **Required API tests:** enqueue/status/cancel across retries and recovery; stable user-safe states.
- **Required authenticated two-user RLS tests:** worker cannot misattribute results; users see only their own recovered jobs/artifacts.
- **Required concurrency tests:** duplicate delivery, two workers, stale heartbeat, cancellation during provider call/commit, callback replay.
- **Required performance or load tests:** worker throughput, queue lag, provider concurrency/backpressure, database pool, recovery-scan cost.
- **Rollback and recovery:** feature flag new enqueues; drain/stop workers; preserve job rows; resume with compatible worker; reconcile side-effect ledger; never replay unknown side effects blindly.
- **Dependencies:** R01/R03/R06; approved D1–D3 and D13; successful provider comparison/proof of concept and separate George provider approval; R07 schema.
- **Safe parallelism:** queue adapter and visual idempotency can parallel after interfaces freeze; rollout is sequential.
- **Recommended specialist owner:** Platform/Job Architect with AI Generation Engineer.
- **Claude Code implementation handoff:** replace `after()` only after infrastructure decision; preserve user recovery and implement at-least-once-safe effects.
- **Evidence required for Senior Reviewer re-review:** architecture decision record; interruption/duplicate-delivery transcripts; queue/worker metrics; side-effect reconciliation; cancel/stale-worker proof; recovery runbook.

### BFV1-R09 — Correct, bounded polling and reload restoration

- **Priority / severity:** P1 / Medium.
- **Exact problem:** fixed `setInterval` can overlap, polls indefinitely on network errors, scales per tab, uses an unsafe client stale threshold, and skips active regeneration restoration when old visuals exist.
- **Final database design:** owner-safe job projection queried by job PK; active restoration uses R03 partial active index/safe operation; no browser-derived stale mutation. Query-matched indexes are added only after measured plans.
- **Trusted actor:** authenticated owner reads safe DTO through status boundary; server performs scoped read; worker/reconciler alone determines lease staleness.
- **Permitted client actions:** bounded status reads, cancel request, signed-result refresh; no operational state/error/result base-table access.
- **Permitted worker actions:** none through polling surface; normal R03 operations only.
- **Database enforcement:** safe projection, ownership/non-disclosure, active lookup predicate, rate protection where chosen, lease-derived state.
- **RLS and grant requirements:** owner safe read only; guessed non-owner job IDs return no existence detail; transport subscriptions, if chosen, filter/authorize per user.
- **Idempotency design:** status reads are side-effect free; cancel and signed URL refresh use stable request semantics; client ignores stale/out-of-order versions.
- **Concurrency behaviour:** one in-flight poll per panel, version-monotonic responses, abort on unmount, multi-tab coordination where practical; active regeneration restores despite older visuals.
- **Failure and retry behaviour:** D13 backoff/jitter/visibility/offline limits; bounded consecutive errors and user recovery; server—not browser clock—marks stale; completed-without-artifact is recoverable, not false success.
- **Migration sequence:** R03 safe projection/index → status API cutover → scheduler/state UI → load verification → optional realtime only if thresholds justify.
- **Acceptance tests:** no overlap, out-of-order version, hidden/offline, network recovery, multiple tabs, reload with old visuals+active job, missing result, cancellation, safe error, signed URL refresh, load thresholds.
- **Durable review evidence:** DTO/schema, browser/network traces, component/API results, cross-user guessed-ID test, multi-tab QPS/p95 report, reload screenshots and failure recovery.
- **Repository evidence:** three-second interval and stale logic in `VisualsPanel`; restoration conditional on absence of SSR visuals; completion UI can succeed without retrieved visuals.
- **Affected files and systems:** `VisualsPanel`, status API/cache semantics, job DTO, optional realtime transport.
- **Security impact:** error/status exposure must remain sanitized; excessive polling can become abuse/availability pressure.
- **Database or migration impact:** primarily query/index/load implications; uses lease-derived server status, not client clock truth.
- **Production-level implementation approach:** non-overlapping recursive polling with abort controller; exponential backoff/jitter, maximum interval, visibility/offline pause, terminal cleanup, bounded network-error behavior, optional shared-tab coordination; always reconcile latest job even with existing visuals; completed state requires durable artifact retrieval or explicit recoverable inconsistency; evaluate realtime against cost/security.
- **Alternatives considered:** Supabase Realtime (lower reads, connection/authorization complexity); SSE (server runtime cost); improved polling (recommended initial baseline with measured thresholds).
- **Trade-offs:** slower backoff delays updates; realtime reduces reads but adds connection infrastructure.
- **Acceptance criteria:** no overlapping status requests; active regeneration restores across reload; old visuals remain usable; network/offline and missing-result cases recover clearly; no client-created stale transition.
- **Required unit tests:** polling scheduler/backoff/visibility; state reducer; completed-without-artifact; cleanup/abort.
- **Required integration tests:** reload with old visuals plus active job; transient/long network failure; recovered worker; signed URL refresh.
- **Required API tests:** cache-control/ETag if used, sanitized DTO, rate behavior, missing/terminal jobs.
- **Required authenticated two-user RLS tests:** guessed job IDs never reveal status or timing; transport subscriptions isolate tenants.
- **Required concurrency tests:** multiple tabs, slow/out-of-order responses, regenerate during poll, unmount/remount.
- **Required performance or load tests:** active tabs × polling interval × job duration; API/DB QPS, auth cost, connection cost, p95 latency, and realtime comparison.
- **Rollback and recovery:** transport abstraction/feature flag; fall back to bounded polling, never the original unbounded interval; preserve last durable visuals.
- **Dependencies:** R03 server lease/status semantics; R06 safe DTO; R08 worker behavior; George D13.
- **Safe parallelism:** UI scheduler tests can parallel R08; final state integration follows job contract.
- **Recommended specialist owner:** Frontend Platform Engineer.
- **Claude Code implementation handoff:** implement only against frozen public job DTO; do not infer staleness from browser time.
- **Evidence required for Senior Reviewer re-review:** component/integration results; network traces proving no overlap; reload matrix; multi-tab load report; sanitized UI screenshots/transcript.

### BFV1-R10 — Permanent database/security verification harness

- **Priority / severity:** P1 / High.
- **Exact problem:** authenticated cross-user isolation, grants/policies, fresh migration, populated upgrade, concurrency, rollback, recovery, and Storage isolation are unverified.
- **Final database design:** no production schema objects; harness asserts the approved normalized catalog, manifest, actor/grant/RLS matrix, function boundaries, constraints, Storage policies, and fresh/upgrade equivalence in disposable environments.
- **Trusted actor:** Security QA controls test credentials; Database QA provisions disposable projects/clones; no test role is mistaken for routine worker/service authority.
- **Permitted client actions:** actual anon/User A/User B clients exercise only their production-permitted surface and deliberate denied attacks.
- **Permitted worker actions:** restricted test worker exercises only production worker functions; service role used solely for fixture/provisioning assertions and never as proof of isolation.
- **Database enforcement:** tests verify database constraints/policies/grants/functions directly; frontend/API results alone cannot pass a database invariant.
- **RLS and grant requirements:** snapshot every base table, safe view, function, sequence, supporting evidence/diagnostic table, and bucket; unexpected permissive policy/grant fails.
- **Idempotency design:** deterministic run IDs/fixtures; reruns do not collide; production idempotency behaviors are explicitly stress-tested.
- **Concurrency behaviour:** real connections and deterministic barriers, not sequential mocks, exercise every job/usage/memory/session/storage race.
- **Failure and retry behaviour:** missing identities/credentials or skipped blocker fails release CI; ephemeral failed environments may be retained briefly for sanitized diagnosis, then destroyed.
- **Migration sequence:** harness scaffolding → fresh manifest runner → populated-clone runner → actor/catalog assertions → concurrency/recovery/Storage/API suites → required CI gate.
- **Acceptance tests:** one-command fresh/upgrade runs; no hidden skips; full actor matrices, parent attacks, constraints, migration interruption, worker crashes, Storage, API, UI and load hooks.
- **Durable review evidence:** immutable CI artifact with commit, manifest/migration checksums, environment class, counts/pass/fail/skip, sanitized logs, matrices, teardown, and reviewer signature.
- **Repository evidence:** current Vitest/Playwright suites do not exercise foundation tables/flows; credential-dependent tests skip; no durable transcripts.
- **Affected files and systems:** dedicated integration/security test harness; disposable Supabase environments; fixtures; CI; evidence artifacts.
- **Security impact:** untested tenant isolation can conceal cross-user disclosure or mutation.
- **Database or migration impact:** validates both fresh and upgrade chains, catalogs, constraints, RLS, functions, and Storage; does not test production directly.
- **Production-level implementation approach:** provision isolated disposable environments; seed anonymous context plus User A/User B with distinct parent rows/objects; use actual authenticated clients; run an explicit operation/role matrix and concurrent database connections; separate simulated/mocked, local-emulator, disposable-hosted, staging, and approved live verification labels.
- **Alternatives considered:** mocks only (rejected); manual SQL screenshots (insufficient); reusable staging (useful but drift-prone unless rebuilt).
- **Trade-offs:** disposable hosted tests cost time/money and require secret management; they provide the strongest reproducibility evidence.
- **Acceptance criteria:** one command/CI workflow reproduces fresh and upgrade verification; every matrix result is machine-readable; failures block merge; no test silently skips release-blocking cases.
- **Required unit tests:** fixture builders, assertion/report serializer, secret redaction, schema-diff normalization.
- **Required integration tests:** full fresh/upgrade schemas, constraints, policies/grants/functions, cascades, persistence, Storage lifecycle.
- **Required API tests:** auth, job, usage, memory, flashcard session, errors, rate/idempotency contracts.
- **Required authenticated two-user RLS tests:** anonymous/owner/non-owner SELECT/INSERT/UPDATE/DELETE; cross-user parent IDs; protected authoritative columns; Storage list/read/sign/upload/upsert/delete.
- **Required concurrency tests:** all R03/R04/R05/R08 races with real connections and deterministic barriers.
- **Required performance or load tests:** harness supports representative seeded volumes and captures latency/query plans/resource counters.
- **Rollback and recovery:** disposable environments only; teardown after sanitized evidence; failed migration retains ephemeral environment long enough for diagnosis; test secrets rotated if exposed.
- **Dependencies:** R07 migration strategy; George D12; two test identities; CI/platform approval; all target contracts.
- **Safe parallelism:** harness scaffolding may parallel implementation; final assertions follow migrations/APIs.
- **Recommended specialist owner:** Security QA Lead plus Database QA Engineer.
- **Claude Code implementation handoff:** tests must use real auth identities and fail closed when credentials/environment are absent in release CI.
- **Evidence required for Senior Reviewer re-review:** immutable CI run links/artifacts, environment classification, commit SHA, migration checksums, complete matrices, no-skip report, sanitized logs, teardown proof.

### BFV1-R11 — Retention, lifecycle, and populated-data recovery contract

- **Priority / severity:** P1 / High.
- **Exact problem:** retention and account-deletion behavior are undefined; existing invalid/duplicate/orphaned data may block constraints; rollback/recovery has not been rehearsed.
- **Final database design:** provisionally approved D8/D9 lifecycle metadata and bounded cleanup for each data class; restricted diagnostics separate from public errors; authoritative ledger uses approved pseudonymised retention where legally necessary; quarantine mapping records legacy disposition reversibly. Start unpartitioned, with measured triggers in D13. Irreversible automated deletion is disabled by default.
- **Trusted actor:** scheduled restricted retention worker and explicitly approved administrative/legal process; ordinary app worker cannot purge arbitrary data.
- **Permitted client actions:** own delete/export/request controls defined by D8/D9; no direct retention timestamp, legal hold, quarantine, diagnostic, or purge control.
- **Permitted worker actions:** retention worker selects bounded eligible batches, records audit/support IDs, deletes/archives only approved classes and object paths, and resumes by cursor.
- **Database enforcement:** retention eligibility/hold checks, size limits, parent/account lifecycle rules, quarantine references, batch bounds, and foreign-key behavior matching approved deletion matrix.
- **RLS and grant requirements:** lifecycle internals restricted; owner safe visibility only where product requires; purge functions denied to authenticated users/routine workers; support/legal roles scoped/audited.
- **Idempotency design:** cleanup batch/item keys prevent repeat side effects; object/database deletion is reconciled; audit corrections append.
- **Concurrency behaviour:** cleanup uses skip-locked/claim semantics or equivalent; active leases/writes protected; account/document deletion races with jobs/sessions resolve by approved state rules.
- **Failure and retry behaviour:** resumable batches, retry-safe object cleanup, dead-letter reconciliation, no irreversible purge without backup/grace/legal checks; partial failure is observable.
- **Migration sequence:** approved D8–D10 contract → R07 preflight/quarantine → additive lifecycle/size/index support → dry-run reporting → legal review, backup alignment, deletion-recovery and end-to-end deletion tests → separate activation/legacy-deletion approvals where required → bounded cleanup.
- **Acceptance tests:** deletion/retention matrix, hold, dry-run/target counts, interruption/resume, active-job race, orphan reconciliation, account/document deletion, restore sample, large-batch plans.
- **Durable review evidence:** signed lifecycle matrix, preflight/quarantine counts, dry-run, backup/restore, concurrency/performance results, deletion audit, and proof no unapproved record/object was destroyed.
- **Repository evidence:** unbounded rows/JSON/errors/objects; cascading and SET NULL choices in historical migration; no cleanup/archive jobs or recovery documentation.
- **Affected files and systems:** jobs, usage, memories, sessions, visuals, logs, auth-user/document deletion, backups/archive/cleanup monitoring.
- **Security impact:** excessive student-data retention, privacy/legal risk, accidental data loss, and unsafe cleanup.
- **Database or migration impact:** later forward migrations/jobs may add size constraints, retention markers/partitions/archive, deletion functions, and cleanup indexes; all destructive work gated separately.
- **Production-level implementation approach:** data-class inventory and purpose; retention schedule; account/document deletion matrix; audit/legal-hold separation; size limits; archive/purge process with dry run, target counts, rate limits, observability, and restore policy; quarantine invalid legacy rows before constraint validation.
- **Alternatives considered:** indefinite retention (rejected); hard-delete everything on parent deletion (may violate audit/recovery); tiered retention (recommended subject to legal/product approval).
- **Trade-offs:** longer retention improves support/audit but increases privacy/cost; anonymization may reduce utility and is not always irreversible privacy protection.
- **Acceptance criteria:** George-approved lifecycle matrix; deletion is predictable and tested; no cleanup runs without preview/backup; invalid legacy data has approved disposition; recovery objectives are explicit.
- **Required unit tests:** retention eligibility, legal hold, size validation, deletion matrix.
- **Required integration tests:** account/document deletion, archive/purge, restore, orphan cleanup, object/database coordination.
- **Required API tests:** deletion/export/status behavior and safe errors.
- **Required authenticated two-user RLS tests:** lifecycle jobs cannot expose or delete another user's data; deleted user's access is revoked.
- **Required concurrency tests:** cleanup versus active worker/read/update; account deletion versus job completion/session write.
- **Required performance or load tests:** batched purge/archive duration, locks, vacuum/index effects, object cleanup throughput.
- **Rollback and recovery:** dry-run first; backup and restore sample; tombstone/grace period where approved; stop/resume cursor; never hard-delete ambiguous records without George approval.
- **Dependencies:** qualified D8–D10 and D13 approvals; legal review; backup alignment; deletion-recovery and end-to-end deletion evidence; separate founder approval for any legacy deletion and every production activation; R06 Storage; R07 data preflight; R08 worker lifecycle.
- **Safe parallelism:** policy design can parallel engineering; destructive implementation/testing remains sequential and separately approved.
- **Recommended specialist owner:** Data Governance Architect plus Privacy/Security and SRE.
- **Claude Code implementation handoff:** no destructive cleanup until George approves exact classes, targets, and recovery; implement dry-run/evidence first.
- **Evidence required for Senior Reviewer re-review:** approved lifecycle matrix; dry-run counts; restore exercise; deletion/retention tests; performance results; proof no unapproved data was destroyed.

## P2 remediation tasks

### BFV1-R12 — Performance, scale, and polling-load qualification

- **Priority / severity:** P2 / Medium.
- **Exact problem:** polling, job claims, usage writes, memory reads, retention, and Storage access have no representative performance/load/stress evidence.
- **Final database design:** remain unpartitioned for beta; use query-matched indexes for active job uniqueness/discovery, due claims, expired leases, tenant/period/type usage, active canonical claims, sessions, and retention. Instrument table/index size, write rate, vacuum lag, lock waits, query latency, queue lag, and retention backlog; adopt queue/partition changes only at D13 thresholds.
- **Trusted actor:** performance/SRE harness in approved isolated environment; observability agents use read-only metrics access.
- **Permitted client actions:** realistic bounded owner API/polling traffic only; no direct load against base-table authoritative writes.
- **Permitted worker actions:** realistic lease-scoped claim/heartbeat/complete and bounded retention operations under test workload.
- **Database enforcement:** rate/backpressure, query-matched indexes, bounded claim/recovery/retention batches, tenant keys, and explain-plan acceptance.
- **RLS and grant requirements:** load uses actual restricted roles/RLS; service role benchmarks do not qualify owner/worker latency or security.
- **Idempotency design:** load generators use controlled unique/replay keys so duplication results are measurable rather than corrupting counts.
- **Concurrency behaviour:** hot keys, multi-tab polling, worker claims, lease recovery, sessions, and cleanup overlap are explicitly modeled.
- **Failure and retry behaviour:** D13 retry/backoff/circuit and abort thresholds; stress verifies graceful degradation, queueing, recovery, and no retry storm.
- **Migration sequence:** stable correctness schema → observed plans → separate forward index/support migration after preflight → baseline/load/stress/soak → only then queue/partition proposal if trigger crossed.
- **Acceptance tests:** D13 SLOs, representative cardinality plans, sustained/spike/stress/soak, vacuum/index growth, retention backlog, cost, backpressure, and recovery.
- **Durable review evidence:** workload/environment/seed manifest, raw immutable results, dashboards/plans, thresholds, cost model, recovery timeline, and decision record for deferred/adopted scaling changes.
- **Repository evidence:** fixed three-second polling; no load suite, SLOs, seeded-volume plans, or query-plan artifacts.
- **Affected files and systems:** API, Supabase database/auth/Storage, worker/queue, frontend transport, observability and capacity plans.
- **Security impact:** overload can cause availability failure, uncontrolled cost, and denial-of-service amplification.
- **Database or migration impact:** may justify revised indexes/partitioning/retention only through later reviewed forward migrations.
- **Production-level implementation approach:** define SLOs and workload model; test small beta, expected growth, and stress/recovery; seed realistic row/object cardinality; capture QPS, p50/p95/p99, errors, locks, pool use, queue lag, auth cost, Storage latency, and cost estimates; set backpressure/rate limits.
- **Alternatives considered:** extrapolation only (insufficient); production load test (unsafe without explicit approval); isolated representative environment (recommended).
- **Trade-offs:** billion-user ambition informs architecture but tests must use staged measurable projections, not premature overengineering.
- **Acceptance criteria:** approved SLOs and capacity envelope; no uncontrolled degradation at beta target; safe overload/backpressure/recovery; polling/realtime choice is evidence-based.
- **Required unit tests:** load-shape/config validation and metric thresholds.
- **Required integration tests:** observability propagation and rate/backpressure behavior.
- **Required API tests:** latency/error/rate behavior under load.
- **Required authenticated two-user RLS tests:** load identities remain isolated and test data cannot cross tenants.
- **Required concurrency tests:** hot-key enqueue, worker claims, polling tabs, session completion, cleanup overlap.
- **Required performance or load tests:** this task owns baseline, sustained load, spike, stress, soak, and recovery tests with query plans.
- **Rollback and recovery:** test only isolated environments; abort thresholds; feature flags/rate limits; restore configuration and verify recovery after stress.
- **Dependencies:** R03/R08/R09/R11 stable implementation; George D3, D8, and D13.
- **Safe parallelism:** workload modeling can begin early; meaningful execution follows integrated system.
- **Recommended specialist owner:** Performance/SRE Engineer.
- **Claude Code implementation handoff:** add reproducible load assets and thresholds; never run against production without exact approval.
- **Evidence required for Senior Reviewer re-review:** workload definition, environment class, commit/schema checksums, raw result artifacts, dashboards, query plans, bottleneck decisions, recovery timeline.

#### D13 target contract, if approved

- Non-AI API p95: reads ≤300 ms; mutations ≤500 ms; p99 ≤1 second.
- Queue p95 ≤5 seconds; alert when p95 exceeds 15 seconds for 10 minutes.
- Visual completion p95 ≤3 minutes, p99 ≤10 minutes, hard overall timeout 15 minutes.
- Authenticated core availability ≥99.9% monthly; crash-free web sessions ≥99.8%.
- Non-user API errors <1%; critical auth/data APIs <0.5%; AI terminal failures <5% excluding cancellation.
- Polling: one in flight; 2/5/10/30-second backoff with jitter; hidden/offline pause; average ≤6 requests/minute after minute one.
- Maximum 3 attempts for classified transient failure; 30-second heartbeat, 90-second lease, expired-lease reconciliation within 2 minutes.
- Retention backlog alert at >24 hours.
- Evaluate partitioning at ≥100 million rows, ≥50 GB table/index footprint, maintenance/vacuum SLO breach, or indexed-query p95 breach.
- Reassess queue architecture when queue SLO is repeatedly breached, database claim contention exceeds 5% of attempts, tested throughput is exceeded, regional/compliance requirements arise, or managed cost exceeds George's ceiling for three months.

### BFV1-R13 — Durable verification report and observability evidence

- **Priority / severity:** P2 / Medium.
- **Exact problem:** milestone verification claims are not backed by a permanent, reproducible, sanitized evidence bundle; logging is not yet proven useful and privacy-safe.
- **Final database design:** no production tables required by default; report records normalized schema/manifest/policy/grant hashes and invariant aggregates, never row content or secrets. Any evidence index uses approved retention/access only.
- **Trusted actor:** QA Evidence Lead generates; independent reviewers validate; release/governance owner signs; support diagnostics remain separately restricted.
- **Permitted client actions:** none beyond viewing an approved sanitized release summary.
- **Permitted worker actions:** none; CI collectors read only approved test artifacts/metrics.
- **Database enforcement:** evidence asserts database contract and redaction; it does not replace it. Artifact access/retention follows D8/D9.
- **RLS and grant requirements:** no credentials, raw catalog secrets, student identifiers, provider payloads, signed URLs, or diagnostics in report; access to restricted artifacts is role-scoped.
- **Idempotency design:** report identity is change/commit/manifest/environment/run ID; corrections append a superseding report and preserve prior evidence.
- **Concurrency behaviour:** race artifacts include barrier definitions, connection IDs as opaque labels, winners/counts, and invariant outcome.
- **Failure and retry behaviour:** failed/skipped/partial runs remain visible; rerun produces a new linked run; release blockers cannot be overwritten by a later summary.
- **Migration sequence:** format/schema validator → CI artifact generator → full R10/R12 ingestion → reviewer validation → final immutable report.
- **Acceptance tests:** report schema/link/checksum/redaction, exact suite coverage, environment labeling, no-hidden-skip, immutable correction, reviewer/sign-off flow.
- **Durable review evidence:** the completed manifest/report is itself the evidence, with immutable artifact URIs/checksums and approval chain.
- **Repository evidence:** no milestone report, schema/grant dump, fresh/upgrade/two-user/concurrency/rollback transcript; local tests do not validate foundation claims.
- **Affected files and systems:** `.ai/reports/` format, CI artifacts, test manifests, logging/monitoring runbooks, release checklist.
- **Security impact:** evidence must not leak tokens, emails, student content, URLs, SQL data, or provider messages.
- **Database or migration impact:** reports record migration checksums, schema-contract hash, environment class, validation outcomes, not secrets/data dumps.
- **Production-level implementation approach:** permanent Markdown summary plus machine-readable manifest linking immutable CI artifacts; include commit/branch, reviewer, date, environment classification, commands, versions, migration checksums, pass/fail/skip, redaction statement, test identities as opaque labels, performance results, rollback exercise, unresolved risk, and approvals.
- **Alternatives considered:** screenshots only (not reproducible); raw logs in Git (privacy risk); CI artifacts plus sanitized summary (recommended).
- **Trade-offs:** artifacts require retention/storage governance; sanitized summaries must remain sufficiently diagnostic.
- **Acceptance criteria:** every release-blocking claim maps to evidence; simulated versus real environment is explicit; skips are visible and blocking where required; logs support correlation without PII/secrets.
- **Required unit tests:** report schema validator, link/checksum validation, redaction fixtures.
- **Required integration tests:** CI creates and retains report/manifest from full verification run.
- **Required API tests:** report includes API suite versions/results and sanitized failure samples.
- **Required authenticated two-user RLS tests:** report references full matrix without retaining credentials or personal identifiers.
- **Required concurrency tests:** report includes barrier/count/result artifacts for each race.
- **Required performance or load tests:** report links raw load results and threshold evaluation.
- **Rollback and recovery:** artifacts are immutable/versioned; corrections append a superseding report; revoke/rotate and purge exposed secrets under incident procedure.
- **Dependencies:** R10 harness; George D8, D9, D12, D13; all task outputs.
- **Safe parallelism:** format can be defined early; final report is sequential after verification.
- **Recommended specialist owner:** QA Evidence Lead plus Observability/Security Engineer.
- **Claude Code implementation handoff:** generate the approved report format automatically; never commit raw secrets, user data, or environment dumps.
- **Evidence required for Senior Reviewer re-review:** completed report and manifest; immutable CI references; checksum verification; redaction tests; explicit simulated/real labels and residual-risk register.

#### Permanent verification report format

Every remediation/release report must contain:

1. Change ID, approved scope, branch, commit SHA, migration checksums, application/runtime versions.
2. Date, specialist owners, independent reviewers, George approval references.
3. Environment classification: mocked, local emulator, disposable hosted, staging, or separately approved live read-only/rollout verification.
4. Exact commands/workflows and configuration names, with secrets redacted.
5. Fresh migration, populated upgrade, schema contract, policy/grant, API, two-user/anonymous RLS, concurrency, recovery/rollback, Storage, performance/load, build/lint/unit/integration/E2E results.
6. For every suite: test count, pass/fail/skip, duration, artifact URI/checksum, and failure disposition.
7. Before/after row/object counts and invariant summaries using anonymized aggregates only.
8. Observability proof: correlation trace, safe error code, alert/recovery exercise, and redaction scan.
9. Known limitations, simulated-versus-real distinction, residual risks, rollback readiness, and release recommendation.
10. Sign-off sequence and explicit statement that production execution/deployment requires separate George approval.

### BFV1-R14 — Governance correction and protected remediation workflow

- **Priority / severity:** P2 / High governance failure.
- **Exact problem:** implementation reached `main` without the required specialist/reviewer/George gate; historical migration immutability and durable-evidence rules were not enforced.
- **Final database design:** no database object; governance requires manifest/checksum and Database Architect gates before any migration generation/application.
- **Trusted actor:** George approves decisions/merge/production actions; release lead administers branch gates; specialists/reviewers retain independent roles.
- **Permitted client actions:** N/A; contributors work only through protected branch/PR workflow.
- **Permitted worker actions:** CI may verify checksums/tests but cannot merge/deploy autonomously.
- **Database enforcement:** schema/policy/manifest assertions are required checks; production execution needs separate approval and operator identity.
- **RLS and grant requirements:** full R10 actor matrix is a mandatory non-skippable gate; governance cannot waive least privilege silently.
- **Idempotency design:** approval/evidence records bind to exact commit and migration checksums; reruns do not transfer approval to changed artifacts.
- **Concurrency behaviour:** one serialized migration owner; parallel application lanes may not edit shared migration files; merge queue must revalidate latest commit.
- **Failure and retry behaviour:** failed/missing gate blocks merge; rerun after correction and fresh review; break-glass is explicit, time-bounded, audited, and cannot authorize broad writes.
- **Migration sequence:** D1–D13 record → protected branch → approved contracts → implementation/new migrations → automated tests → Database Architect → Security/QA → Senior Reviewer → George → merge; production migration/deploy separately approved.
- **Acceptance tests:** branch protection dry run, checksum mutation rejection, required reviewer/check failure, stale-approval invalidation, no-skip security suites, break-glass audit.
- **Durable review evidence:** repository policy snapshot, PR/branch history, check results, approvals, checksum record, PASS report, and separate rollout authorization.
- **Repository evidence:** `main`/`origin/main` at `7f72313`; foundation commits already merged; AI_TEAM now requires non-main implementation and review flow.
- **Affected files and systems:** repository/branch protection, CODEOWNERS/review policy, CI required checks, release records; no history rewrite.
- **Security impact:** bypassed review permits security/privacy defects into the release line.
- **Database or migration impact:** Database Architect approval and immutable-migration checksum check become mandatory for migration changes.
- **Production-level implementation approach:** George records FAIL disposition and containment; create `feature/remediate-beta-foundation-v1`; require approved plan, specialist contracts, automated gates, Database Architect review, Security/QA verification, Senior Reviewer re-review, George approval, then protected merge; deployment remains separate.
- **Alternatives considered:** rewrite/rebase published `main` to simulate compliance (rejected); immediate revert (requires separate risk decision); forward remediation with containment (recommended).
- **Trade-offs:** stronger gates slow unsafe changes but reduce rework and risk; forward remediation leaves defective history visible but auditable.
- **Acceptance criteria:** no remediation commit lands directly on `main`; required checks/reviews cannot be bypassed silently; historical migration checksum gate passes; George's decisions and final approval are recorded.
- **Required unit tests:** N/A for product logic; test policy/config validators where implemented.
- **Required integration tests:** protected-branch dry run showing failing checks block merge and required approvals are enforced.
- **Required API tests:** N/A except repository-host API policy verification, if available.
- **Required authenticated two-user RLS tests:** must be a required merge check from R10, not skipped.
- **Required concurrency tests:** must be a required merge check from R10.
- **Required performance or load tests:** required before wider-beta approval according to R12 thresholds.
- **Rollback and recovery:** do not rewrite published history; revert governance configuration through reviewed change only if it blocks emergency response, with documented break-glass approval/audit.
- **Dependencies:** George D1–D13 and commit disposition; repository administration capability.
- **Safe parallelism:** protection setup can run alongside implementation branch after approval; final merge remains sequential.
- **Recommended specialist owner:** Release/Governance Lead with George as final authority.
- **Claude Code implementation handoff:** Claude implements only approved tasks on `feature/remediate-beta-foundation-v1`; it does not merge, deploy, access production, or settle founder decisions.
- **Evidence required for Senior Reviewer re-review:** branch/PR history, required-check configuration, reviewer approvals, migration checksum result, full evidence report, George's signed disposition and merge approval.

## Keep-versus-revert recommendation

**Recommendation: keep commit `7f72313` in published history, immediately contain reliance on the unsafe foundation, and remediate forward on `feature/remediate-beta-foundation-v1`. Do not rewrite `main`.**

Reasons:

- Forward remediation preserves audit history and avoids pretending the original workflow occurred.
- The commit contains useful implementation and governance material that can be corrected incrementally.
- A blind Git revert does not undo any SQL already manually applied to Supabase, does not restore an unknown live schema, and may break application/database compatibility.
- New forward migrations are required regardless of Git disposition if any historical SQL reached an environment.

Risks of keeping and remediating:

- Unsafe paths remain present until containment and remediation are complete.
- Engineers may accidentally build on untrusted tables unless the FAIL status is prominently enforced.
- Forward reconciliation is more complex than greenfield replacement.

Risks of reverting:

- Git/application rollback may diverge further from already-applied database objects and stored rows.
- Revert may remove useful reload/job UX while leaving database exposure intact.
- User-generated artifacts or jobs created since introduction may become orphaned or unreadable.
- Reverting production behavior is itself a deployment/destructive-risk decision requiring schema evidence, backup, compatibility analysis, and George approval.

George must approve keep/contain/remediate versus an operational revert. Neither action is authorised by this plan.

## Recommended remediation sequence

### Gate 0 — Founder decisions and containment (sequential)

1. D1–D13 are approved with the exact qualifications in the Founder decision disposition. George must still record keep/contain/forward disposition.
2. Database Architect re-reviews the revised contract and qualified approvals. No migration generation or application implementation begins before approval.
3. Establish the required protected branch/workflow under R14. Do not begin implementation on `main`.
4. D3 provider comparison/proof of concept and later provider-specific integration remain separately gated; D8–D10 irreversible/production deletion remains disabled.

### Phase 1 — Contracts and preflight (partly parallel)

1. R07 inventories repository dependencies and designs fresh/upgrade strategy without changing historical migration.
2. In parallel, specialists freeze R01 job authority, R02 usage ledger, R03 job state machine, R04 memory provenance, R05 session semantics, and R06 safe error/Storage contracts.
3. Database Architect reconciles those contracts into one ordered forward-migration design; independent Database Architect review is required.

### Phase 2 — Security/data-integrity implementation (controlled parallel lanes)

1. Database lane: R07 forward migrations, preflight tools, constraints, functions, grants, and policies.
2. Job lane: R01/R03 server boundaries followed by R08 worker integration.
3. Usage lane: R02 trusted ledger/call-site cutover.
4. Intelligence lane: R04 atomic memories followed by R05 durable sessions/inference.
5. Privacy lane: R06 error boundary; Storage implementation only after George's visibility decision.

One Database Architect owns all shared migration files and ordering to avoid merge conflicts.

### Phase 3 — UX, lifecycle, and verification

1. R09 polling/reload integration after public job DTO/state semantics stabilize.
2. R11 lifecycle/recovery implementation after retention decisions and schema stabilization.
3. R10 runs fresh, upgrade, RLS, API, concurrency, recovery, rollback, and Storage suites.

### Phase 4 — qualification and review

1. R12 performance/load/stress/soak and recovery qualification.
2. R13 produces durable verification report.
3. Database Architect review → Security/QA verification → Senior Reviewer re-review.
4. George decides merge; production migration/deployment requires a separate exact approval.

## Tasks that may run in parallel

- R01, R02, R04, R05, and the error half of R06 may be designed in parallel once shared actor/provenance conventions are frozen.
- R07 dependency inventory, R10 harness scaffolding, R12 workload modeling, R13 report-format definition, and R14 protection setup may proceed in parallel after George approves planning/workflow scope.
- R08 queue adapter and R09 frontend scheduler may be developed in parallel after R03 public contracts freeze.
- Storage design in R06 and lifecycle policy design in R11 may proceed together after George's privacy/retention decisions.

Parallel tasks must own separate application files. All SQL/migration integration belongs to one Database Architect or a serialized migration lane.

## Tasks that must remain sequential

1. Qualified George decisions → Database Architect re-review → branch/workflow gate → implementation.
2. Target database/security contract → independent Database Architect approval → migration generation.
3. R01 authority → R03 transitions/leases → R08 durable worker → R09 final UI integration.
4. R04 provenance/identity → R05 preference inference.
5. R07 preflight/fresh-chain strategy → new forward migrations → populated-upgrade rehearsal → any rollout proposal.
6. R06 private Storage application support → policy cutover → public-access removal/legacy-object handling.
7. Integrated implementation → R10 verification → R12 qualification → R13 final report → Senior Reviewer → George merge approval.
8. Merge approval → separate production migration/deployment approval. Merge never implies deployment.

## Release-blocking acceptance criteria

Beta Foundation V1 remains FAIL unless all of the following are true:

1. Direct authenticated clients cannot forge authoritative jobs, usage, trusted memories, sessions, errors, timestamps, relationships, or results.
2. Owner/parent consistency and operation-specific least privilege are database-enforced and proven with anonymous/User A/User B tests.
3. One active job, legal transitions, cancellation, leases, retries, stale workers, duplicate callbacks, and side effects are atomic/idempotent under concurrency.
4. Usage events are trusted, immutable, validated, uniquely idempotent, and legacy rows are explicitly non-authoritative or reconciled.
5. Memory identity/superseding and flashcard session/inference are durable, atomic, provenance-aware, and retry-safe.
6. Raw errors, provider messages, SQL/storage details, secrets, public URLs, and personal student data do not leak through DB public fields, APIs, UI, or logs.
7. Generated visuals follow George-approved private/public policy with complete versioned Storage isolation and lifecycle controls.
8. `beta_foundation_v1.sql` is unchanged; every fix is forward-only.
9. A completely fresh project builds solely from migrations and passes application/RLS/Storage smoke tests.
10. A populated clone matching the known beta/live schema passes preflight, upgrade, validation, compatibility, and recovery rehearsal without unapproved loss.
11. Two-user and anonymous RLS matrices cover SELECT/INSERT/UPDATE/DELETE, authoritative columns, and cross-user parent references for every relevant table.
12. Concurrency, interruption, retry, rollback/forward recovery, retention, performance/load/stress, polling, and Storage isolation tests pass at approved thresholds.
13. Evidence is durable, sanitized, tied to the exact commit/migration checksums/environment, and distinguishes simulated from real verification.
14. Database Architect, Security/QA, Senior Reviewer, and George gates complete in the required order; no direct-to-main or autonomous deploy occurs.

## Exact evidence required to change FAIL to PASS

1. Approved plan and decision record for all George blockers.
2. Reviewable branch/PR history for `feature/remediate-beta-foundation-v1` and proof of required gates.
3. Proof the historical migration checksum did not change, plus all new forward migration diffs/checksums.
4. Target schema contract and before/after catalog comparison for tables, columns, constraints, indexes, functions, triggers, grants, policies, roles, buckets, and object policies.
5. Sanitized preflight and backup/restore evidence for a representative populated upgrade clone.
6. Fresh-project transcript from zero with no manual objects and application smoke result.
7. Populated-upgrade transcript, before/after counts/invariants, lock timings, partial-failure/resume, old/new app compatibility, and recovery rehearsal.
8. Complete anonymous/User A/User B direct-client RLS matrix for SELECT/INSERT/UPDATE/DELETE and cross-user parent references.
9. Complete Storage matrix: list, read/public-or-signed access, upload, overwrite/upsert, delete, path traversal/cross-prefix, anonymous denial, retention cleanup.
10. Concurrency transcripts with real barriers/connections for enqueue, claim, transition, cancel, stale worker, callback replay, usage deduplication, memory superseding, and session threshold.
11. Worker crash/redeploy/timeout/duplicate-delivery and side-effect reconciliation evidence.
12. API contract tests for auth, validation, idempotency, safe errors, rate behavior, and non-owner non-disclosure.
13. UI evidence for reload with existing visuals plus active regeneration, network/offline recovery, no overlapping polling, missing result, cancellation, and sanitized errors.
14. Performance/load/stress/soak results with workload, environment, seeded volume, thresholds, latency, QPS, locks, pool/queue metrics, cost estimate, and recovery.
15. Retention/account-deletion/cleanup dry run and restore evidence.
16. Build, lint, unit, integration, API, E2E, migration, security, and compatibility results with no hidden release-blocking skips.
17. Permanent verification report/manifest with immutable artifact references, checksums, redaction proof, environment labels, residual risks, and reviewer signatures.
18. Database Architect approval, Security/QA verification, Senior Reviewer PASS, and George's explicit merge decision. Production rollout requires another approval.

## Unresolved implementation and activation gates

No D1–D13 founder decision remains unanswered. The following gates remain unresolved or intentionally require later approval:

1. **All remediation implementation:** blocked until the Database Architect re-reviews and approves this revised contract with George's qualifications.
2. **Provider-specific worker implementation:** blocked until the security, cost, capability, and scalability comparison and proof of concept are reviewed and a specific provider is separately approved by George under D3.
3. **Irreversible automated deletion:** blocked until legal review, backup alignment, and deletion-recovery testing complete under D8.
4. **Production account/content deletion activation:** blocked until legal review and end-to-end deletion testing complete under D9.
5. **Legacy-data deletion:** prohibited unless George gives separate exact approval under D10. Quarantine and deterministic non-destructive repair are the approved path.
6. **Staging writes and every production action:** each requires exact separate approval under D12.
7. **Keep/contain/forward versus operational revert:** still requires a recorded disposition; current recommendation remains keep/contain/remediate forward.
8. **Final implementation parameters:** maintenance/degraded-service tolerance, Storage MIME/size ceilings, and managed-worker cost ceiling must be recorded before their affected implementation/rollout finalizes.
9. **Merge, production migration, and deployment:** require separate approval after PASS; none is implied by D1–D13.

## Recommended next prompt for Chat 4 — Database Architect re-review

> You are Chat 4, the MoLis Database Architect. Re-review the revised `.ai/plans/beta-foundation-v1-remediation.md` and George's completed `.ai/decisions/beta-foundation-v1-founder-decisions.md` against your `.ai/reviews/beta-foundation-v1-database-review.md`, the Senior Reviewer evidence, repository code, and immutable migration history. Do not access Supabase, write SQL, modify files, or implement. Verify that every required correction is now frozen: actor/grant/RLS matrix; safe projections; narrow enqueue/cancel/worker operations; purpose-specific lease-token compare-and-set state machine; request idempotency versus active-work exclusion; trusted immutable usage; separate memory trust classes; durable card-set-bound sessions; private all-bucket Storage with versioned visual paths; public/private diagnostics; explicit manifest/baseline ordering for fresh and existing paths; retention/performance thresholds; rollback and durable evidence. Identify any conflict in George's answers, then return APPROVE / CHANGES REQUIRED / BLOCKED ON GEORGE for migration-generation and Claude handoff readiness.

## Recommended Claude Code implementation handoff prompt

**NOT TO BE USED UNTIL the Database Architect re-approves the target contract. Provider-specific worker implementation and deletion activation remain subject to the additional approved qualifications and gates above.**

> Work only on branch `feature/remediate-beta-foundation-v1`; stop if on `main`. Read all governing, review, plan, and approved Database Architect documents in full. Implement only the approved Beta Foundation V1 remediation tasks and preserve unrelated edits. Never modify `migrations/beta_foundation_v1.sql`; verify its checksum and create only newly named, ordered, forward-only migrations. Do not access or mutate production Supabase, execute migrations, deploy, merge, or settle unresolved product decisions. Implement least-privilege job/usage/memory/session authority; parent ownership; atomic job uniqueness/transitions/leases/cancellation; trusted idempotent usage; atomic provenance-aware memories; durable flashcard sessions; safe public error DTOs/logs; approved private Storage; durable retry/recovery worker; bounded polling/reload recovery; retention controls; and the permanent verification harness/report. Use additive compatibility stages and documented forward recovery. Run and retain all approved unit, integration, API, anonymous/two-user RLS, concurrency, fresh-migration, populated-upgrade, Storage, interruption, rollback/recovery, performance/load, build, lint, and E2E evidence. Fail closed on missing release-test credentials; do not silently skip blockers. After implementation, report exact files, migrations, commands, evidence artifacts, deviations, unresolved risks, and git status. Do not commit, push, merge, or deploy unless George separately instructs the exact action after review.

## Required delivery workflow

`feature/remediate-beta-foundation-v1`
→ Claude implementation
→ automated tests
→ Database Architect review
→ Security/QA verification
→ Senior Reviewer re-review
→ George approval
→ merge

Production migration and deployment remain separate, explicitly approved actions after merge readiness.
