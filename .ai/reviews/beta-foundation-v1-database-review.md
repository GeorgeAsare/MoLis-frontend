# Beta Foundation V1 — Independent Database and Security Review

## Review status

- **Reviewer role:** MoLis Database Architect
- **Date:** 2026-07-29
- **Scope:** independent pre-implementation review of `.ai/plans/beta-foundation-v1-remediation.md` against the active `molis-frontend` repository
- **Environment access:** repository only; no Supabase, SQL execution, production data, or external system access
- **Historical migration rule:** `migrations/beta_foundation_v1.sql` must remain byte-for-byte unchanged
- **Verdict:** **APPROVE WITH REQUIRED CHANGES**
- **Implementation readiness:** **No.** Contract design may continue, but Claude Code must not generate migrations or implement the remediation until the release-blocking design corrections and blocking George decisions in this review are resolved.

## Executive assessment

The Chief Architect correctly identifies the principal security, integrity, concurrency, privacy, and reproducibility failures. The proposed direction—least privilege, trusted mutation paths, atomic job operations, immutable usage, provenance-aware memories, durable flashcard sessions, private Storage, forward-only reconciliation, two-user tests, and staged verification—is sound.

The plan is not yet a safe database implementation specification. It leaves important choices open inside implementation tasks: who may enqueue or cancel jobs; the exact state transition and cancellation contract; the logical active-job key; whether correlation IDs identify an operation or an event; whether memories are one table or separate trust classes; session eligibility; audit retention; account deletion; and how the nonstandard historical migration can participate in a deterministic fresh-project chain. These cannot be delegated to Claude Code as coding details.

The repository confirms:

- `generation_jobs` and `user_memories` have owner-wide `FOR ALL` policies.
- Authenticated users may insert caller-shaped `usage_events`.
- Job enqueue is cancel-then-insert and job updates are unconditional by ID.
- The visual worker reuses a user-scoped Supabase client in `after()` and has no durable worker identity, lease, heartbeat, or compare-and-set token.
- `recordUsage` accepts model, duration, counts, outcome, error type, document, and correlation values from callers and ignores persistence errors.
- Memory superseding uses content wildcard matching and multiple non-transactional statements.
- Flashcard session counting is held in a page-local `useRef`, while the progress row is mutable and unique only by user/document expectation.
- `study-documents` and `recordings` already expect private signed reads, while `study-visuals` stores public URLs.
- The repository has one migration, which depends on an unversioned `documents` table and contains no Storage contract.
- Existing tests do not establish direct PostgREST two-user isolation, concurrency safety, fresh migration reproducibility, populated upgrade safety, or Storage isolation.

## Required actor model

The database contract must distinguish these actors before implementation:

| Actor | Database identity | Intended authority |
|---|---|---|
| Anonymous | `anon`, no authenticated UID | No access to foundation rows or private objects |
| Authenticated owner | `authenticated`, `auth.uid() = row.user_id` | Read safe own projections; request narrowly defined enqueue/cancel/user-memory actions through validated operations |
| Authenticated non-owner | `authenticated`, different UID | No row visibility or mutation; no cross-owner parent references |
| Trusted application server | Dedicated server credential or narrowly granted security-definer functions | Validate user intent, derive identity, enqueue, create user-editable data, and call trusted operations; must not expose credentials to browsers |
| Worker | Dedicated least-privilege worker identity | Claim/heartbeat/complete/fail jobs with lease token; emit trusted usage and system memories; no arbitrary user-data access |
| Service role | Supabase administrative bypass | Break-glass/migration/operations only; never the routine worker contract and never exposed to the browser |

“Server action” is not itself a trust boundary when it uses the caller's authenticated Supabase session. Trusted authority must come from a separately protected server/worker credential or from carefully reviewed security-definer functions that derive `auth.uid()`, enforce ownership, set a fixed `search_path`, revoke `PUBLIC` execution, and expose only narrow inputs.

---

## Findings

### BFV1-DB-01 — Job authority remains underspecified

- **Severity:** Critical
- **Related remediation task:** BFV1-R01, BFV1-R03, BFV1-R08
- **Confirmed repository evidence:** `migrations/beta_foundation_v1.sql` grants owner `FOR ALL` through one RLS policy. `createGenerationJob` and the visual POST route insert `user_id`, `document_id`, `job_type`, `status`, `correlation_id`, and optional `input_data` using the user's session. `cancelGenerationJob` updates status directly. `updateJobStatus` accepts arbitrary status/result/error/timestamps and updates solely by `id`. The visual `after()` callback also uses the request's user-scoped Supabase client.
- **Design assessment:** The plan correctly requires least privilege but does not freeze the allowed enqueue payload or decide whether direct authenticated insertion remains possible. Allowing browser clients to insert the current row shape is unsafe even with `WITH CHECK (user_id = auth.uid())`, because operational fields and parent consistency remain forgeable.
- **Required correction:** Define a narrow enqueue operation. Authenticated users may supply only `document_id`, an allowlisted `job_type`, a versioned/sanitized request payload, and an idempotency key or client-request ID. The database must derive `user_id`, `queued` status, timestamps, attempt values, and internal correlation/lease fields. Users must not directly set `status`, `result_data`, diagnostic fields, `started_at`, `completed_at`, lease/worker fields, attempt count, retry schedule, or worker-controlled correlation fields. Cancellation must be a dedicated operation, not generic UPDATE. DELETE must be denied.
- **Recommended database design:** Revoke authenticated INSERT/UPDATE/DELETE on the base table. Expose `enqueue_generation_job(...)` and `request_generation_job_cancel(...)` as narrow functions, or use a trusted application server repository with a dedicated restricted role. Return a safe job DTO/view that omits private input and diagnostics. Use composite parent ownership `(document_id,user_id)` or an equivalent locked parent-ownership check inside the enqueue transaction.
- **Alternatives and trade-offs:** A constrained direct INSERT can work only with column privileges, immutable defaults/triggers, a parent-ownership policy, and no writable worker fields; it is harder to evolve safely than a narrow operation. Service role is simple but excessively powerful. Security-definer functions centralize invariants but require careful grants, fixed search path, owner control, and audit.
- **Migration impact:** New forward migration must revoke broad table privileges/policies, add actor-specific policies/grants, add safe operation functions, and potentially expose a safe view. Application cutover must precede revocation or be deployed compatibly.
- **Security impact:** Prevents job forgery, cross-parent association, result injection, cancellation abuse, row deletion, and accidental service-role exposure.
- **Acceptance criteria:** Direct authenticated PostgREST INSERT/UPDATE/DELETE fails; owner enqueue and cancel work only through approved operations; derived fields cannot be supplied or overridden; cross-owner documents fail without existence disclosure; worker fields are inaccessible to owner reads.
- **Test requirements:** Anonymous/owner/non-owner direct CRUD matrix; allowed-field and mass-assignment tests; foreign-document enqueue; safe-view column tests; trusted-server and worker role tests; function grant and search-path assertions.
- **Rollback requirements:** Add operations and dual-compatible application code first. Revoke broad writes only after verified cutover. Rollback may restore the prior application path only through a reviewed narrow compatibility function; broad `FOR ALL` must not be reinstated.
- **George must decide:** Yes—whether owners may cancel processing jobs and whether cancellation means immediate terminal cancellation or a non-terminal cancellation request. This blocks job implementation.

### BFV1-DB-02 — Job state transitions require a precise database state machine

- **Severity:** Critical
- **Related remediation task:** BFV1-R03, BFV1-R08, BFV1-R09
- **Confirmed repository evidence:** The visual route performs unconditional transitions to `processing`, `completed`, or `failed` using `.eq('id', job.id)`. A concurrent cancellation can therefore be overwritten. There is no worker identity, lease token, lease expiry, heartbeat, attempt, state version, or transition function. Client staleness after ten minutes is presentation logic only.
- **Design assessment:** “Compare-and-set, RPC, transaction, or equivalent” must be resolved to one contract. Plain RLS cannot safely express transition history, lease ownership, timestamp invariants, and terminal immutability across competing workers.
- **Required correction:** Approve and document legal transitions: `queued → processing`; `processing → completed|failed|queued` for bounded retry; `queued → cancelled`; `processing → cancel_requested` and then `cancelled`, or a clearly approved direct cancellation rule; expired `processing → queued|failed`; terminal states immutable. No transition may succeed without expected current state, expected row version, and—after claim—the current lease token. Completion/failure must reject expired or cancelled leases and duplicate callbacks.
- **Recommended database design:** Add `state_version bigint`, `attempt_count`, `max_attempts`, `worker_id`, `lease_token uuid`, `lease_expires_at`, `heartbeat_at`, `next_attempt_at`, `cancel_requested_at`, public error code/reference, and restricted diagnostics reference as approved. Implement atomic functions for enqueue, claim, heartbeat, request-cancel, acknowledge-cancel, complete, fail/retry, and stale recovery. Each function updates with a compare-and-set predicate and returns whether it won. Add state/timestamp checks and use database time.
- **Alternatives and trade-offs:** A single generic transition RPC is compact but easier to misuse; purpose-specific functions are safer. Serializable transactions still need retry logic and lease identity. Optimistic row versions without leases do not solve crashed workers. A managed queue may later own delivery, but database-side result idempotency remains necessary.
- **Migration impact:** Additive metadata and checks first; backfill safe defaults; deploy new functions and workers; cease old mutation paths; then enforce terminal invariants and revoke generic updates.
- **Security impact:** Prevents stale or unauthorized workers from rewriting authoritative state and protects cancellation and user-visible results.
- **Acceptance criteria:** Every illegal transition affects zero rows; terminal states never change; only the current unexpired lease completes/fails; duplicate callbacks return the existing terminal outcome; cancellation wins according to the approved rule; all timestamps agree with state.
- **Test requirements:** Transition-table unit tests; real concurrent claim/cancel/complete/fail barriers; stale lease and wrong-token tests; duplicate callback; retry exhaustion; database-time boundary; crash/reclaim; idempotent result side effects.
- **Rollback requirements:** Feature-disable new claims, preserve all job rows and transition evidence, and recover forward. Do not drop lease/state columns or reopen generic writes. A compatibility reader may ignore new fields while secure mutation functions remain.
- **George must decide:** Yes—cancellation precedence, retry count, lease duration, timeout, user retry semantics, and durable worker provider. These block the final state-machine implementation.

### BFV1-DB-03 — Active-job uniqueness and idempotency need separate keys

- **Severity:** Critical
- **Related remediation task:** BFV1-R03
- **Confirmed repository evidence:** Both enqueue paths first cancel all queued/processing rows and then insert. `generation_jobs_user_doc_type` is non-unique. Two simultaneous requests can both insert active jobs. `getActiveJobForDocument` does not filter active status and merely orders all jobs by `created_at DESC`.
- **Design assessment:** A partial unique index is necessary but not sufficient. It prevents multiple active rows but does not define retry identity, payload conflicts, stale-job recovery, or what a duplicate caller receives.
- **Required correction:** Separate (a) logical request idempotency from (b) active-work exclusion. Define the active scope and request key before SQL. Do not cancel a live job merely because an identical request is retried.
- **Recommended database design:** Use a unique immutable `idempotency_key` scoped to `(user_id, operation_kind)` or a server-derived `request_fingerprint`, with request-payload hash and a uniqueness constraint. Also use a partial unique index on the approved active scope, recommended `(user_id, document_id, job_type) WHERE status IN ('queued','processing','cancel_requested')`. Enqueue runs in one transaction: validate ownership; insert-on-conflict by idempotency key and return the existing job; if a different key conflicts with active scope, return the active job or an explicit conflict. Stale jobs remain active until lease recovery atomically requeues/fails them; terminal rows never block new keys.
- **Alternatives and trade-offs:** Advisory locks can serialize a logical key but do not persist idempotency across crashes and require strict connection/transaction handling. Partial unique index alone gives contention safety but poor retry semantics. `ON CONFLICT` cannot target a partial index through every client API cleanly, favoring a database function. Reusing one permanent key per document/type would incorrectly block later regeneration.
- **Migration impact:** Preflight duplicate active rows; add idempotency and payload hash columns; resolve duplicates only under approved quarantine rules; create uniqueness after cleanup; replace cancel-then-insert callers.
- **Security impact:** Prevents resource-amplification races, duplicate provider spend, and inconsistent authoritative results.
- **Acceptance criteria:** Twenty concurrent identical enqueues return one logical job; a distinct request while active follows the approved conflict behavior; terminal/stale-resolved jobs permit a new request; same key with a different payload is rejected and audited.
- **Test requirements:** Concurrent identical and distinct-key enqueues; payload mismatch; active partial-index conflict; stale lease recovery; terminal retry; query-plan validation.
- **Rollback requirements:** Preserve duplicate candidates and choose a canonical row without deletion unless approved. If cutover fails, stop enqueue while keeping existing jobs readable; do not drop the new unique constraints to restore racing behavior.
- **George must decide:** Yes—whether a new request supersedes, joins, or conflicts with existing active work, and the intended idempotency window. This blocks enqueue behavior.

### BFV1-DB-04 — Usage ledger lacks a trusted authority and complete event identity

- **Severity:** Critical
- **Related remediation task:** BFV1-R02
- **Confirmed repository evidence:** Authenticated users may insert own `usage_events`. `RecordUsageInput` accepts generation type, document, correlation ID, tokens, image count, success, error type, duration, and model. Call sites submit best-effort success/failure events and errors are swallowed. The correlation index is non-unique despite a comment claiming it prevents double counting. Entitlements currently allow all and explicitly plan to count this table later.
- **Design assessment:** The current rows are analytics hints, not billing, quota, or audit evidence. A unique correlation ID alone is ambiguous because one operation can have multiple lifecycle or correction events.
- **Required correction:** Revoke authenticated direct INSERT/UPDATE/DELETE. Define whether this is a metering ledger, product analytics stream, audit log, or separate tables. Trusted server/worker code must derive identity, provider/model, usage counts, duration, outcome, timestamps, and parent ownership from protected execution context/provider responses. Legacy rows must be marked or treated as unverified.
- **Recommended database design:** For authoritative metering, use immutable events with `event_id`, `operation_id/correlation_id`, `event_kind`, `idempotency_key`, `schema_version`, trusted producer, provider request ID where available, resource quantities, public error code, occurred/recorded timestamps, and optional correction reference. Unique `(producer, idempotency_key)` is the primary replay guard; also constrain `(operation_id,event_kind,attempt)` if exactly one event of that kind is expected. Corrections append, never update. Separate lower-trust product analytics if browser-origin events are later needed.
- **Alternatives and trade-offs:** One combined table with `trust_level` is cheaper but risks accidental billing use. Separate metering and analytics tables provide a clearer boundary. Provider IDs improve dedupe but cannot be the only key for pre-provider failures. Synchronous strict recording improves billing integrity but can affect UX; a durable outbox is preferable when metering becomes consequential.
- **Migration impact:** Add trusted ledger fields/table and constraints, preserve old rows as `legacy_unverified`, cut over producers, then revoke old insertion. Account-deletion FK behavior may need to change from cascade to retained pseudonymous subject or separate identity mapping.
- **Security impact:** Prevents quota/billing fraud, audit falsification, cross-parent association, and model/cost manipulation.
- **Acceptance criteria:** Direct users cannot author authoritative events; duplicate trusted retries create one event; conflicting payload under one key is rejected; events are immutable; legacy rows cannot affect billing/limits; parent ownership is enforced.
- **Test requirements:** Direct CRUD denial matrix; twenty-way duplicate insert; multiple legitimate event kinds for one operation; correction event; conflicting payload; provider retry; document deletion; retention/account deletion; entitlement query plan at seeded volume.
- **Rollback requirements:** Never delete legacy or authoritative audit evidence as rollback. Disable metering consumers, preserve append-only rows, and recover forward. Quarantine duplicates with a reversible mapping.
- **George must decide:** Yes—whether/when usage becomes billing, entitlement, analytics, or audit authority and the required retention/account-deletion model. This blocks authoritative usage implementation but not immediate revocation of unsafe direct writes if a compatible trusted path is ready.

### BFV1-DB-05 — Memory provenance and superseding contract is not implementation-ready

- **Severity:** High
- **Related remediation task:** BFV1-R04
- **Confirmed repository evidence:** Owner `FOR ALL` permits arbitrary memory writes. `SaveMemoryInput` lets callers set source agent/entity, category, content, metadata, importance, confidence, expiry, and wildcard supersedes key. `saveMemory` separately deactivates content matches, selects a maybe-single row using optional identity fields, then updates or inserts. Concurrent calls can deactivate or duplicate records, and a broad lookup may encounter multiple rows. Source entity IDs are free text with no ownership FK.
- **Design assessment:** The plan's “logically or physically separate” choice is material. One table can work, but trusting a caller-selected provenance discriminator or relying only on RLS would reproduce the defect.
- **Required correction:** Define user-authored versus system-derived memory capabilities, canonical identity, producer identity, evidence linkage, versioning, and retention before migration work. Remove wildcard content superseding.
- **Recommended database design:** Safest initial design is separate `user_memory_notes` and `system_memory_claims`, or one table with database-enforced provenance and distinct narrow functions/column grants. System claims should include `producer`, `producer_version`, `claim_type`, canonical subject/entity key, evidence IDs, inference version, confidence, validity interval, superseded-by ID, and creation authority. Enforce at most one active system claim per `(user_id, claim_type, subject_type, subject_id, producer_version)` with a partial unique index. Execute supersede/upsert in one function/transaction, locking the active key. Validate typed entity ownership through real FKs or a reviewed entity registry.
- **Alternatives and trade-offs:** Separate tables make trust unmistakable but require composed reads. One table reduces query changes but needs robust grants/triggers/functions. Exclusion constraints on validity ranges support temporal history but add complexity. Content hashes detect duplicates but are not semantic identity.
- **Migration impact:** Add provenance/version/evidence fields or new tables; preflight duplicates; classify old rows as `legacy_unverified`; backfill only safe canonical keys; implement transactional operation; revoke generic trusted writes.
- **Security impact:** Prevents personalization poisoning, false authoritative claims, unrelated-memory deactivation, and cross-user entity references.
- **Acceptance criteria:** Direct clients cannot create system-derived claims; user-editable data cannot masquerade as system provenance; one active claim exists per canonical key; concurrent supersede/upsert produces a complete history and one active row; foreign entity references fail.
- **Test requirements:** Full actor CRUD matrix for both classes; same-key concurrent writes; supersede/update races; null-key normalization; wildcard-like content isolation; typed document/recording ownership; evidence deletion/retention; retrieval plans.
- **Rollback requirements:** Preserve old rows and disable system personalization consumption if needed. Never relabel unverified rows as trusted during rollback. New history must remain recoverable and recomputable.
- **George must decide:** Yes—separate trust classes, whether users may edit/delete personal memories, and retention/account-deletion behavior. Trust-class choice blocks migration design.

### BFV1-DB-06 — Flashcard completion must become a durable event, not a mutable progress side effect

- **Severity:** High
- **Related remediation task:** BFV1-R05, BFV1-R04
- **Confirmed repository evidence:** `FlashcardsPanel` documents that `sessionCountRef` resets on reload. It increments on last-card handling and emits a system-like preference after three increments. `flashcard_progress` is a single mutable user/document row updated from client-shaped state; flashcard regeneration deletes it. No session or completion table exists in migrations.
- **Design assessment:** Counting mutable progress transitions or incrementing a counter cannot prove distinct sessions under retry, refresh, concurrent tabs, offline replay, or regenerated card sets.
- **Required correction:** Define a session identity and lifecycle, card-set version/reference, eligibility, completion rule, and inference evidence. Session creation and completion must be server-validated and idempotent.
- **Recommended database design:** Add `flashcard_study_sessions` with server-issued `id`, `user_id`, `document_id`, `flashcard_set_id`, status, mode, started/completed/abandoned timestamps, card totals/outcomes, idempotency key, schema version, and optional client installation/session reference. Unique `(user_id,idempotency_key)` and a check enforcing terminal timestamp semantics. Complete through a compare-and-set function from active to completed. Derive preference from three distinct eligible completed session IDs and create one versioned system claim with a unique inference key/evidence join table. Keep mutable progress as resumable UI state, not counting authority.
- **Alternatives and trade-offs:** An immutable generic learning-event ledger is extensible but more abstract. A session table is clearer for the beta and can later feed an event platform. A monotonic counter is cheaper but loses audit, correction, and recomputation.
- **Migration impact:** Add session and optional inference-evidence tables; update system-memory provenance dependency; do not backfill page-local counts; establish FK to the actual flashcard set/version and document ownership.
- **Security impact:** Prevents preference manipulation and corrupted personalization evidence.
- **Acceptance criteria:** Refresh, retry, double-click, offline replay, and concurrent tabs complete one session once; three distinct eligible completions produce exactly one inference; regenerated flashcards do not corrupt historical session evidence.
- **Test requirements:** Session start/resume/complete/abandon; duplicate completion; two-tab and offline replay races; third-session threshold race; foreign document/set reference; regeneration; inference recomputation and rollback.
- **Rollback requirements:** Feature-disable preference inference while retaining session evidence. Continue using existing progress for UI only. Do not infer or fabricate historical sessions.
- **George must decide:** Yes—what constitutes a distinct eligible session, whether “study again” counts, minimum cards/duration, abandoned/review-only behavior, and session retention. This blocks the inference contract.

### BFV1-DB-07 — RLS design must include grants, safe projections, and supporting-table matrices

- **Severity:** Critical
- **Related remediation task:** BFV1-R01, R02, R04, R05, R06, R07, R10
- **Confirmed repository evidence:** The migration enables RLS but uses broad `FOR ALL` owner policies for jobs/memories and an owner INSERT for usage. The status API selects `error` and `result_data`. No migration defines safe views, function execution grants, worker roles, supporting tables, or Storage policies.
- **Design assessment:** Operation-specific policies alone do not prevent exposure of sensitive columns through owner SELECT or prevent powerful table grants. Service role bypasses RLS and is not a least-privilege worker design.
- **Required correction:** The plan must specify both SQL grants and RLS per actor, safe projections for owner reads, explicit function execution grants, and parent-ownership enforcement for every supporting table. Worker authority must be constrained by role/functions even if a protected credential is used.
- **Recommended database design:** Base tables deny `anon`; authenticated users receive safe-view SELECT and only approved function EXECUTE. Base-table owner SELECT is acceptable only if every column is safe. Authenticated direct DML is denied for jobs/usage/system claims/sessions except narrowly approved user-memory operations. Worker role receives only function EXECUTE or narrow table privileges. Service role remains break-glass. Force RLS where operationally compatible and test owner/bypass assumptions.
- **Alternatives and trade-offs:** Views simplify column confidentiality but require security-invoker behavior and careful grants. Separate public/private diagnostic tables create a stronger boundary. RLS-only designs are simpler but cannot hide columns selected from an allowed row.
- **Migration impact:** Revoke default/public privileges, drop/replace policies forward, create views/functions/roles as supported, and add policies for new memory/session/evidence tables. Audit all existing policies because permissive policies combine with OR semantics.
- **Security impact:** Closes row, column, function, cross-parent, and worker privilege gaps.
- **Acceptance criteria:** Catalog assertions match the matrix below; no unexpected permissive policy or grant remains; owner APIs return only safe fields; cross-user and anonymous tests reveal neither data nor existence.
- **Test requirements:** Direct PostgREST and function tests for every matrix cell; grant/policy catalog snapshot; safe-view columns; function search path and EXECUTE grants; service/worker negative scope tests.
- **Rollback requirements:** Deploy safe views/functions before revocations. Recovery must preserve fail-closed policies; never restore public or broad authenticated grants as an emergency shortcut.
- **George must decide:** No for least privilege itself. Yes only for the owner cancellation and user-memory edit semantics already identified.

#### Required two-user RLS and authority matrix

Legend: `R` safe read, `F` approved narrow function only, `W` trusted worker function only, `A` administrative/break-glass, `D` denied.

| Object / operation | Anonymous | Auth owner | Auth non-owner | Trusted server | Worker | Service role |
|---|---:|---:|---:|---:|---:|---:|
| `generation_jobs` SELECT safe DTO | D | R own | D | R/F scoped | W scoped | A |
| `generation_jobs` INSERT | D | D; enqueue F | D | F | D unless scheduler role approved | A |
| `generation_jobs` UPDATE | D | D; cancel F | D | F cancel/admin-scoped | W lease-scoped | A |
| `generation_jobs` DELETE | D | D | D | D | D | A only under approved retention |
| `usage_events` SELECT | D | R own if approved | D | R scoped | W scoped | A |
| `usage_events` INSERT | D | D | D | F trusted | W trusted/idempotent | A |
| `usage_events` UPDATE/DELETE | D | D | D | D; correction F appends | D | A only under approved retention/legal process |
| User-editable memories SELECT | D | R own | D | F scoped | D | A |
| User-editable memories INSERT/UPDATE/soft-delete | D | F own allowed fields | D | F scoped | D | A |
| System memory claims SELECT | D | R own safe claim if product-approved | D | F scoped | W producer-scoped | A |
| System memory claims INSERT/supersede | D | D | D | F trusted | W producer-scoped | A |
| System memory claims UPDATE/DELETE | D | D | D | F supersede only | W producer/version-scoped | A under retention process |
| Flashcard sessions SELECT | D | R own | D | F scoped | W scoped | A |
| Flashcard sessions INSERT/complete | D | F validated own parent | D | F | W if orchestrated | A |
| Flashcard sessions arbitrary UPDATE/DELETE | D | D | D | D | D | A under retention process |

Every owner and trusted operation must also test User B's parent ID, a nonexistent parent ID, a changed `user_id`, and direct base-table access. Service-role success does not substitute for testing the worker's restricted authority.

### BFV1-DB-08 — Fresh-project and populated-upgrade migration strategy is unresolved

- **Severity:** Critical
- **Related remediation task:** BFV1-R07, R10, R13
- **Confirmed repository evidence:** The only migration is `migrations/beta_foundation_v1.sql`; it references `documents` before the repository creates it. Fourteen other active tables and all buckets/policies are absent from version-controlled migrations. The file name is not a standard timestamped Supabase migration. Git history shows the historical file was edited after introduction. No manifest, checksums, schema baseline, fresh-project test, or populated clone test exists.
- **Design assessment:** Adding ordinary timestamped migrations is not enough. A lexical or tool-dependent runner may execute all numeric filenames before the historical `beta_...` file, causing reconciliation objects to be overwritten later by its broad policies, or may reject/ignore the historical name. Conversely, running the historical file first fails without `documents`. The plan must choose a deterministic migration-history model.
- **Required correction:** Define an explicit immutable baseline/manifest strategy before naming or generating SQL. Record the historical migration checksum and environment provenance. The fresh path and live upgrade path may share migrations only where ordering and object preconditions are deterministic.
- **Recommended database design:** Adopt a versioned migration manifest/tooling contract. Recommended: (1) create an approved canonical prerequisite baseline migration containing all active-product prerequisite tables and ownership keys; (2) explicitly place the immutable historical migration after prerequisites in the manifest; (3) apply forward remediation files after it; (4) on an existing beta database, mark only verified already-applied steps in migration history after approved catalog comparison; (5) prove the final catalog is identical for fresh and upgraded paths. Do not rely on filename lexical order alone.
- **Alternatives and trade-offs:** A new consolidated canonical baseline that excludes execution of the historical file is clean for fresh projects but must preserve the old file as an audited historical artifact and requires explicit baseline semantics. Reconstructing every historical dependency gives the strongest audit trail but costs more. Renaming the historical file would violate immutability and is rejected.
- **Migration impact:** Requires migration manifest/checksum enforcement and a prerequisite schema migration before all remediation. Current live state needs approved read-only preflight before any “already applied” marker or reconciliation.
- **Security impact:** Prevents broad policies from being reintroduced by order mistakes and prevents deployments against unknown object definitions.
- **Acceptance criteria:** Historical checksum unchanged; migration order is deterministic and tool-tested; fresh project reaches the reviewed final catalog without manual objects; populated representative clone upgrades without loss; both catalogs normalize identically; partial failure/resume succeeds.
- **Test requirements:** Empty project; current-beta clone; object-present compatible/incompatible cases; interrupted step resume; policy/grant diff; old/new app compatibility; historical checksum gate.
- **Rollback requirements:** Snapshot/backup before populated rehearsal and production; stage additive changes; record every applied version; use forward recovery for security policies and data transformations. Abort criteria and restore time must be demonstrated.
- **George must decide:** Yes—approve exact read-only catalog inspection, backup/rehearsal environment, baseline strategy, maintenance tolerance, and disposition of invalid/duplicate/orphan rows. These block migration implementation.

### BFV1-DB-09 — Storage recommendation must be private for all three buckets

- **Severity:** High
- **Related remediation task:** BFV1-R06, R07, R10, R11
- **Confirmed repository evidence:** `study-documents` uses signed URLs and client upload/delete under `user_id/...`. `recordings` uploads client-side under `user_id/recordingId.ext`, then server-side processing requests a short signed URL and deletion removes the object. `study-visuals` writes `user_id/document_id/index.png` with upsert and stores `getPublicUrl()` in JSON. No bucket or object policy migration exists.
- **Design assessment:** Student documents, audio, transcripts-derived assets, and generated study visuals can contain personal or sensitive educational content. Unguessable public URLs are not authorization. Public visuals contradict the founder privacy directive.
- **Required correction:** Make `study-documents`, `recordings`, and `study-visuals` private. Enforce canonical owner prefixes, parent ownership where practical, MIME/size limits, and operation-specific object policies. Do not store durable signed URLs; store bucket/path and mint short-lived URLs on authorized server reads.
- **Recommended database design:** Private buckets. Authenticated users may upload/delete only within their own canonical prefix and only where the associated owned database entity exists or is being created through a validated workflow. Reads use signed URLs created after row ownership checks. Visual worker uploads via restricted worker operation; owner reads receive expiring signed URLs or an authenticated media proxy. Use non-overwriting/versioned visual paths per job or generation version, then atomically point the database result to the winning version; cleanup superseded objects asynchronously.
- **Alternatives and trade-offs:** Public visuals are cheaper to serve but expose anyone holding/leaking the URL and complicate revocation. Signed URLs add refresh and caching work. Authenticated proxying offers stronger controls/auditing but adds bandwidth/latency. Fixed-path upsert is simple but stale workers can overwrite newer output; versioned paths are safer.
- **Migration impact:** Version bucket definitions and `storage.objects` policies; add bucket/path fields or evolve visual JSON; application must replace `getPublicUrl`, refresh expired URLs, avoid caching signed URLs persistently, and migrate/contain legacy public objects.
- **Security impact:** Prevents anonymous access, cross-user enumeration/overwrite/delete, and stale-worker visual replacement.
- **Acceptance criteria:** Anonymous access denied; User A cannot list/read/sign/upload/overwrite/delete User B objects; signed URLs expire and refresh correctly; stale job output cannot replace current visuals; legacy public exposure has an approved closure plan.
- **Test requirements:** Full anonymous/A/B/worker Storage matrix for list/read/sign/upload/upsert/delete/path traversal; MIME/size limits; URL expiry/refresh; object/database deletion ordering; duplicate worker and stale output; legacy object migration.
- **Rollback requirements:** Application signed-read support must ship before public access is revoked. Keep an authenticated proxy as emergency recovery; never reopen public access. Preserve legacy objects until verified copy/reference migration and approved cleanup.
- **George must decide:** Yes—approve private visuals, retention, legacy public-object handling, MIME types, size ceilings, URL lifetime, and cleanup rules. Private-by-default is the safest recommendation; visibility decision blocks Storage cutover.

### BFV1-DB-10 — Polling and retention design needs near-term limits and future thresholds

- **Severity:** High
- **Related remediation task:** BFV1-R09, R11, R12
- **Confirmed repository evidence:** `VisualsPanel` polls every three seconds with `setInterval`, allowing overlapping requests when a response exceeds the interval. Status lookup is by job primary key plus user. Active-job discovery queries `(user_id,document_id,job_type)` ordered by newest without an active predicate. Existing indexes are `(user_id,document_id,job_type)` and a partial status-only index. Jobs, usage, memories, JSON results/errors, sessions, and objects have no versioned retention policy.
- **Design assessment:** Primary-key status polling itself is indexable, but fixed per-tab polling creates avoidable API/auth/database load. The current status-only partial index is poor for tenant or worker claim patterns. Designing for more than one billion users means choosing scalable keys, retention, and observability now while postponing partitioning/queue infrastructure until measured thresholds.
- **Required correction:** Freeze query shapes and add matching indexes; bound/back off polling with no overlap and visibility/offline awareness; establish retention tiers and archive/delete mechanisms before any table becomes authoritative. Define measured thresholds for partitioning and external queue adoption.
- **Recommended database design:** Job status by PK remains sufficient. Active discovery uses the partial unique active index. Worker claim index should match `status='queued'`, `next_attempt_at`, priority, and creation order; lease recovery index should match `status='processing'` and `lease_expires_at`. Usage indexes should support tenant/period/type and idempotency. Memory/session indexes should support active canonical keys and tenant/time retrieval. Start unpartitioned for beta, instrument table/index size, write rate, vacuum lag, query latency, lock waits, and retention backlog. Evaluate time partitioning for append-only usage/session/transition events when single-table size, maintenance time, or measured query/vacuum SLOs cross approved thresholds. Move durable execution to a managed queue when claim throughput, scheduling, retries, regional delivery, or database contention exceed the measured database-queue envelope.
- **Alternatives and trade-offs:** Realtime subscriptions reduce polling but require reconnect/backfill correctness and still need durable state. Exponential backoff is simple and adequate for beta. Premature partitioning and bespoke queueing increase operational complexity. A managed queue provides mature delivery but adds provider cost and another trust boundary.
- **Migration impact:** Add query-matched indexes in a separate performance migration after preflight; retention fields/transition history may be added with domain migrations. Partitioning is explicitly deferred pending metrics.
- **Security impact:** Retention limits privacy exposure; efficient indexes and bounded polling reduce denial-of-service and resource-exhaustion risk.
- **Acceptance criteria:** No overlapping polls; status and active/claim/recovery queries meet approved plans and latency at seeded volume; retention jobs are bounded/resumable/audited; table growth and queue thresholds are documented and monitored.
- **Test requirements:** Query plans with representative cardinality; concurrent polling/claim load; vacuum/index growth; retention dry run and interruption; realtime or polling reconnect correctness; stress and soak tests with cost reporting.
- **Rollback requirements:** Index additions must have a safe drop-forward plan; polling can feature-switch to slower backoff; retention actions require backup and must never be rolled back by resurrecting already purged data without a restore plan.
- **George must decide:** Yes—retention periods, performance SLOs, beta capacity target, cost ceiling, and durable queue provider timing. These block final retention/qualification, but not beta-safe index design.

### BFV1-DB-11 — Error and result data need public/private separation

- **Severity:** High
- **Related remediation task:** BFV1-R06, R01, R03
- **Confirmed repository evidence:** Worker exceptions are stored verbatim in `generation_jobs.error`, returned by the status route, rendered by `VisualsPanel`, and logged. `result_data` is returned directly. Visual item JSON also stores truncated raw failure messages.
- **Design assessment:** RLS owner-read does not make provider, SQL, Storage, path, or configuration errors safe. Safe DTO mapping in application code alone can regress.
- **Required correction:** Separate public state/result summary from restricted diagnostics. Owners must not SELECT restricted diagnostics from the base row/view. Result schemas must be allowlisted and versioned.
- **Recommended database design:** Store `public_error_code`, `public_message_key`, and `support_reference` in the owner-readable job projection. Keep restricted diagnostic references in a separate worker/admin-only table or external observability system with shorter retention and redaction. Use typed/versioned result summaries rather than arbitrary client-readable JSON where feasible.
- **Alternatives and trade-offs:** Keeping diagnostics only in an external sink simplifies row security but depends on observability availability. Encrypted diagnostics in the same row do not solve key/access discipline. Application-only redaction is insufficient defence in depth.
- **Migration impact:** Add safe fields/view and optional restricted diagnostics table; migrate callers; stop returning base-table `error/result_data`; do not attempt to classify old raw errors as safe.
- **Security impact:** Prevents internal detail, personal data, and provider information disclosure.
- **Acceptance criteria:** Owners cannot query raw diagnostics directly; every failure maps to an approved public code; safe result DTO contains no arbitrary internal payload; logs and stored visual items pass redaction tests.
- **Test requirements:** SQL/Storage/provider/secret-shaped fixtures; direct owner SELECT; status DTO snapshot; log scans; retention/access tests for diagnostics.
- **Rollback requirements:** Fall back to generic public failure messages and support references, not raw errors. Preserve restricted evidence under approved retention.
- **George must decide:** Yes—diagnostic retention and support access; no decision is needed to prohibit raw user-visible errors.

---

## Required changes to the Chief Architect's plan

1. Replace optional job-authority approaches with the required actor matrix and narrow enqueue/cancel/worker operations in this review.
2. Add an explicit state transition table, `cancel_requested` decision, lease-token compare-and-set requirements, terminal immutability, database-time use, and purpose-specific mutation functions.
3. Separate job request idempotency from active-job exclusion; define payload conflict behavior and stale-job recovery before selecting constraints.
4. State that existing `usage_events` are non-authoritative and cannot become billing/entitlement input without a trusted immutable ledger cutover.
5. Resolve one-table versus separate-table memory provenance before migration generation; safest recommendation is distinct user notes and system claims.
6. Require a durable flashcard session table with card-set identity and immutable completion evidence; mutable progress cannot be used for counting.
7. Expand RLS tasks to include table/column/function grants, safe owner views, restricted worker authority, and every new supporting table.
8. Add the migration-manifest/baseline decision as a P0 prerequisite. Filename order alone cannot safely reconcile the historical nonstandard migration.
9. Change Storage recommendation from undecided to private-by-default for all student content, with George able to explicitly override only after accepting the privacy consequences.
10. Require versioned visual object paths so stale workers cannot overwrite the winning generation.
11. Add public/private job error separation to the database contract, not only API redaction.
12. Add explicit measured thresholds for retention, partitioning, and managed-queue adoption while deferring premature partitioning.

## Database tasks that may run in parallel

After George approves the actor, privacy, provenance, retention-direction, and baseline strategy:

- Job state-machine specification and usage-ledger specification may be designed in parallel.
- Memory provenance specification and flashcard session semantics may be designed in parallel, but session-to-system-claim integration waits for memory provenance.
- Storage private-access application design and database migration-manifest tooling may proceed in parallel.
- Two-user test harness, concurrency harness, schema-contract normalization, and performance workload modeling may be prepared in parallel without writing production SQL.
- Preflight query design, backup/recovery runbook design, and acceptance-test design may proceed in parallel.

All migration SQL integration must have one serialized owner.

## Database tasks that must remain sequential

1. George decisions → approved actor/data-lifecycle contracts → Database Architect sign-off.
2. Migration baseline/manifest strategy → historical checksum lock → prerequisite schema contract.
3. Approved read-only catalog preflight → backup/clone → duplicate/orphan/invalid-row disposition.
4. Prerequisite schema migration → immutable historical migration in declared manifest position → forward remediation migrations.
5. Add job fields/functions → deploy compatible job callers/worker → verify → revoke broad job writes → enforce stricter checks.
6. Add trusted usage path → cut over producers → verify dedupe → revoke authenticated inserts → enable any authoritative consumers later.
7. Add memory provenance/atomic operations → cut over producers/readers → revoke generic writes → enable trusted personalization.
8. Add session records → cut over progress/completion → verify durable evidence → enable preference inference.
9. Add private visual read/versioned write support → verify signed access → cut bucket policies/private flag → contain/migrate legacy public objects.
10. Fresh build and populated upgrade rehearsal → two-user/concurrency/Storage verification → load/retention qualification → independent reviews → George rollout approval.

## Proposed migration filenames only

These names describe required logical files; the final timestamp prefixes and their execution order must be generated only after the migration-manifest decision. No SQL is authorized by this list.

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

Important: `active_product_schema_prerequisites` must execute before the immutable historical migration on the fresh path, while every remediation file must execute after it. If the chosen migration tool cannot express that without renaming the historical file, use an explicit manifest or approved consolidated-baseline model; do not silently rely on the proposed filename timestamps.

## Release-blocking database acceptance criteria

1. `migrations/beta_foundation_v1.sql` checksum is unchanged and continuously enforced.
2. A reviewed migration manifest produces a deterministic order and never reapplies broad historical policies after remediation.
3. Fresh Supabase creation from version control succeeds with no manual tables, grants, policies, buckets, or dashboard steps.
4. A representative populated beta clone upgrades with approved backup, preflight, compatibility, validation, interruption/resume, and recovery evidence.
5. Direct authenticated clients cannot insert/update/delete authoritative jobs, usage, system memories, session evidence, worker fields, diagnostic fields, or results.
6. Cross-user parent references fail at the database boundary.
7. Job enqueue is atomic and idempotent; one active logical job exists per approved scope.
8. Only legal lease-aware compare-and-set transitions succeed; terminal/cancelled state cannot be overwritten by stale workers or duplicate callbacks.
9. Usage is trusted, immutable, replay-safe, correction-capable, and legacy rows cannot affect billing or limits.
10. Memory superseding is atomic, provenance-aware, versioned, parent-safe, and produces one active claim per canonical key.
11. Flashcard completions are durable and idempotent; retries/reloads/tabs do not double count; inference links to distinct evidence.
12. Anonymous/User A/User B/trusted server/worker/service-role matrices pass for every foundation and supporting table, view, function, and bucket operation.
13. All three Storage buckets are private unless George explicitly approves otherwise; signed access, expiry/refresh, path isolation, versioned visual output, and legacy containment pass.
14. Raw errors and arbitrary result payloads are inaccessible to owners and absent from APIs/UI/standard logs.
15. Query plans, concurrency, polling, retention, vacuum/index growth, recovery, and seeded load meet George-approved thresholds.
16. No destructive cleanup, production access, migration execution, or deployment occurs without separate exact approval.

## Decisions required from George

### G-DB-01 — Job cancellation semantics

- **Plain English:** When a student cancels work that a worker has already started, does cancellation immediately win, or does it request cancellation while the worker safely stops?
- **Safest recommendation:** Use `cancel_requested` for processing jobs; prevent completion publication after the request; let the worker acknowledge `cancelled`; use a timeout/reconciler if it disappears.
- **Consequences:** Immediate terminal cancellation is simpler but external provider work may continue and later callbacks must be discarded. A request/acknowledge model is more accurate and auditable but adds a state and recovery rule. Disallowing processing cancellation wastes less engineering effort but harms user control.
- **Blocks implementation:** Yes, for state transitions and UI semantics.

### G-DB-02 — Duplicate request behavior and worker model

- **Plain English:** If the same student requests the same generation while one is active, should MoLis return the existing job, reject the new request, or replace it? Which durable queue/worker will own retries?
- **Safest recommendation:** Identical idempotency key returns the existing job; a different request conflicts while active unless an explicit supersede action is used. Use at-least-once durable delivery with lease-aware, idempotent database operations; choose the provider after a focused operational comparison.
- **Consequences:** Joining is cheap and stable; rejecting is explicit but less friendly; automatic replacement can waste provider spend and create stale-output races. Database-only `after()` is not durable; a managed queue adds cost/operations but supplies delivery and retry controls.
- **Blocks implementation:** Yes, for final enqueue and worker cutover.

### G-DB-03 — Usage authority and retention

- **Plain English:** Will usage rows control billing/limits or remain approximate analytics, and how long must evidence survive account deletion?
- **Safest recommendation:** Separate trusted metering from low-trust analytics; keep current rows `legacy_unverified`; do not enforce billing until trusted ingestion and legal retention are approved. Use pseudonymization rather than automatic cascade deletion for legally required audit evidence.
- **Consequences:** Authoritative metering requires stronger durability, provider reconciliation, corrections, retention, and support. Analytics-only data can be best effort and shorter-lived. Retaining after deletion creates privacy/legal obligations; cascade deletion loses audit evidence.
- **Blocks implementation:** Yes for authoritative ledger and retention; immediate containment can proceed after trusted compatibility is designed.

### G-DB-04 — Memory trust classes and user control

- **Plain English:** Are personal notes written by a student different from claims MoLis derives about that student, and may the student edit or delete each class?
- **Safest recommendation:** Separate user-editable notes from versioned system-derived claims. Let users manage their notes and provide visibility/correction controls for claims; trusted producers alone create/supersede system claims.
- **Consequences:** Separate classes are clearer and safer but require composed queries and migration work. One table is simpler but easier to poison or misuse. Immutable claims aid audit but need correction/supersession and privacy controls.
- **Blocks implementation:** Yes, for memory migration and producer cutover.

### G-DB-05 — Flashcard session eligibility

- **Plain English:** What real student activity counts as one completed flashcard session toward a preference inference?
- **Safest recommendation:** A distinct server-issued session tied to one flashcard-set version, with a meaningful minimum completion rule; reload/resume remains the same session, review-only is separately classified, and repeated completion is idempotent.
- **Consequences:** Strict eligibility improves truth but may infer preferences more slowly. Loose rules react quickly but are manipulable and retry-sensitive. Long retention supports recomputation but increases privacy/storage cost.
- **Blocks implementation:** Yes, for inference; session recording can begin only after minimum semantics are approved.

### G-DB-06 — Storage privacy and retention

- **Plain English:** Should generated visuals be accessible to anyone with their URL, or only to the authenticated student for a short time?
- **Safest recommendation:** Private `study-documents`, `recordings`, and `study-visuals`; authorized short-lived signed URLs; versioned object paths; approved expiry and cleanup.
- **Consequences:** Public visuals are easier to render/cache but can leak educational content and are difficult to revoke. Private URLs require refresh/proxy work but preserve ownership and revocation. Legacy public objects need a contained migration period.
- **Blocks implementation:** Yes, for Storage cutover. Private-first application work can be prepared after approval.

### G-DB-07 — Retention, account deletion, and destructive repair

- **Plain English:** How long should jobs, usage, memories, sessions, diagnostics, and objects remain, and what happens to duplicates/orphans or when a student deletes an account?
- **Safest recommendation:** Approve data-class-specific retention, minimize raw diagnostics, pseudonymize only evidence legally required, delete student content on an auditable schedule, and quarantine uncertain legacy rows before any deletion.
- **Consequences:** Longer retention improves audit/recovery but raises privacy, legal, cost, and breach impact. Immediate cascade deletion respects minimization but may destroy billing/audit evidence. Quarantine is reversible but temporarily increases storage and complexity.
- **Blocks implementation:** Yes for destructive cleanup, FK delete semantics, and retention jobs.

### G-DB-08 — Migration baseline and environment access

- **Plain English:** May the team inspect the actual schema read-only, create a backup/clone, and adopt an explicit migration baseline/manifest so fresh and existing databases converge safely?
- **Safest recommendation:** Approve narrowly scoped read-only catalog inspection, encrypted backup, disposable populated clone rehearsal, immutable checksum record, and explicit manifest/baseline. Approve production execution separately only after all evidence passes.
- **Consequences:** Without inspection, the team cannot know which manual objects/policies exist and cannot safely upgrade. Inspection and backups require tightly controlled access and handling. A manifest adds process but resolves the broken historical ordering.
- **Blocks implementation:** Yes, for populated-upgrade migration generation and rollout.

### G-DB-09 — Performance targets and future queue/partition thresholds

- **Plain English:** What beta latency, throughput, retention backlog, and cost limits should trigger queue or partitioning investment?
- **Safest recommendation:** Approve measurable beta SLOs and instrument growth; remain unpartitioned initially; adopt managed queue and time partitioning only when measured thresholds or regional requirements justify them.
- **Consequences:** Premature infrastructure slows delivery and raises operational risk. Waiting without metrics permits sudden degradation. Explicit thresholds preserve the billion-user direction without pretending the beta architecture already serves that scale.
- **Blocks implementation:** Does not block correctness/security work; blocks final performance qualification and release approval.

## Final verdict and handoff decision

**APPROVE WITH REQUIRED CHANGES**

The Chief Architect's remediation direction is credible and substantially correct, but its database contract must be amended by this review and George must resolve G-DB-01 through G-DB-08 before migration generation or implementation begins. G-DB-09 must be resolved before qualification and release.

The plan is **not currently safe to hand to Claude Code for implementation**. It is safe to hand back to the Chief Architect for plan revision and to George for the decisions listed above. Once the revised plan freezes actors, state transitions, idempotency scopes, provenance, session semantics, Storage privacy, retention, and migration-baseline strategy—and receives Database Architect approval—Claude Code may begin approved work on a protected non-`main` branch. Production access, SQL execution, migration application, merge, and deployment remain separately prohibited until explicitly approved.
