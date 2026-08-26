# Beta Foundation V1 — Independent Database Re-review

## Review status

- **Reviewer role:** MoLis Database Architect
- **Date:** 2026-07-29
- **Scope:** revised remediation plan, D1–D13 founder decisions and qualifications, original database review, active repository evidence, migration history, Supabase access paths, server actions, API routes, types, and tests
- **Environment access:** repository only; no Supabase access, SQL execution, production data, or external system access
- **Historical migration rule:** `migrations/beta_foundation_v1.sql` remains an immutable historical artifact
- **Final verdict:** **APPROVE FOR LIMITED IMPLEMENTATION**

## Executive conclusion

The revised plan has incorporated every material database and security correction required by the original Database Architect review. It now provides a sufficiently clear target contract for provider-neutral, reversible, repository-only implementation work once George separately authorizes implementation and the protected non-`main` branch exists.

This is deliberately a limited approval. It does not approve a worker provider, staging or production access, SQL execution, migration application, irreversible deletion, legacy deletion, production account deletion, merge, or deployment. Provider-specific work remains blocked by D3. Destructive lifecycle work remains blocked by D8–D10. Populated-live upgrade finalization remains blocked until an exact D12 catalog/backup/clone action is approved and performed. The plan itself correctly preserves these boundaries.

No unresolved Critical design defect remains in the revised target contract. Two plan wording inconsistencies and three missing operational parameter sets remain, but they are contained by explicit gates and do not require rejection of safe, reversible work.

Implementation may not start merely because this review approves the architecture. The Founder decision record explicitly says D1–D13 do not authorize implementation or branch creation. George must still record the keep/contain/forward disposition and separately authorize the implementation scope. After that authorization, Claude may begin only the “immediate” lane defined below.

## Verification against the 16 requested areas

| # | Area | Result | Re-review assessment |
|---:|---|---|---|
| 1 | Original required changes incorporated | **PASS** | The plan includes a traceability table and substantively freezes every original correction: actors/grants, narrow operations, CAS state machine, separate idempotency/exclusion, trusted usage, memory classes, sessions, private Storage, diagnostics, migration manifest, tests, recovery, retention, and scale thresholds. |
| 2 | Clear trusted job authority | **PASS** | Anonymous and non-owner access is denied; owners receive safe reads plus narrow enqueue/cancel functions; restricted workers receive lease-scoped functions; service role is migration/break-glass only. The plan correctly states that a server action using the caller's session is not a trusted worker boundary. |
| 3 | Atomic CAS, leases, cancellation | **PASS** | The explicit state table requires state/version CAS for every transition and worker ID/current lease for post-claim transitions. D1 freezes `queued → cancelled` and `processing → cancel_requested → cancelled`; post-cancel publication is prohibited and terminal rows are immutable. Database time, heartbeat, expiry, bounded recovery, retries and duplicate callbacks are covered. |
| 4 | Active uniqueness versus request idempotency | **PASS** | The plan separately defines request key/hash, active partial uniqueness across queued/processing/cancel-requested, worker attempt/lease identity, and side-effect identity. D2 returns existing work and prohibits automatic replacement. Terminal and recovered stale work do not permanently block a new explicit key. |
| 5 | Trusted `usage_events` | **PASS** | D4 and R02 create a distinct trusted immutable ledger, deny authenticated direct DML, use producer replay keys plus operation/event/attempt identity, append corrections, require a durable outbox before consequential use, and permanently classify existing events as `legacy_unverified`. |
| 6 | Memory provenance and atomic superseding | **PASS** | D5 and R04 separate user notes, verified system claims, evidence, and temporary/unverified behavioural signals. Only approved verification producers may create claims. Canonical-key uniqueness, transactional locking, supersession links, typed parent ownership, immutable history, replay keys, and legacy exclusion are specified. |
| 7 | Durable flashcard sessions | **PASS** | D6 and R05 require server-issued, card-set-version-bound sessions, 80%/minimum-card/60-second eligibility, active-time protection, terminal CAS, stable replay identity, distinct evidence IDs, cooldown, separate review-only classification, and non-authoritative mutable progress. Refreshes, tabs and retries cannot create multiple completions. |
| 8 | All Storage private | **PASS** | D7 and R06 require private `study-documents`, `recordings`, and `study-visuals`, bucket/path persistence rather than URL persistence, ownership-checked short-lived signed access, canonical owner prefixes, immutable versioned visual paths, worker winner publication, legacy containment, and a full actor/object test matrix. |
| 9 | Public-safe errors versus diagnostics | **PASS** | Owner projection contains only versioned safe result summary, public error code/message key and support reference. Restricted diagnostics are isolated in a worker/support-only table or approved sink; raw errors are excluded from database owner reads, APIs, UI and standard logs. |
| 10 | Safe live upgrade and deterministic fresh build | **PASS WITH ENVIRONMENT GATE** | D11 and R07 define a canonical prerequisite baseline, explicit manifest, historical-file position, forward reconciliation, checksum enforcement, populated catalog comparison, backup/clone rehearsal, normalized catalog equality, interruption/resume and old/new app compatibility. Final live reconciliation cannot be authored confidently until the exact D12 read-only catalog and rehearsal actions are separately approved. |
| 11 | Historical migration immutable | **PASS** | The plan repeatedly requires byte-for-byte immutability, checksum gating, no rename/edit, new forward migrations only, and an alternative consolidated fresh baseline if the tool cannot express historical ordering. Repository review did not modify the file. |
| 12 | Owner/non-owner RLS testing | **PASS** | R10 requires anonymous, User A, User B, trusted server, restricted worker and service-role separation across base tables, views, functions, sequences, evidence/diagnostic tables and Storage. It includes direct CRUD, authoritative columns, guessed IDs, cross-user parent references and unexpected permissive grant/policy detection on fresh and upgrade paths. |
| 13 | Rollback, recovery, concurrency and evidence | **PASS** | Each task includes staged compatibility, fail-closed rollback or forward recovery, real-connection race tests, partial failure/resume, backup/restore rehearsal, interruption and stale-worker recovery, permanent sanitized artifacts, checksums, environment labels and no hidden release-blocking skips. |
| 14 | Founder qualifications preserved | **PASS** | D3 provider neutrality, D5 verification qualification, D6 adjustable/versioned thresholds, D8/D9 legal and deletion gates, D10 deletion prohibition, D12 exact-action approvals and D13 evidence-linked revision are reproduced as binding effects and dependencies. |
| 15 | Provider-specific implementation blocked | **PASS** | R08 depends on a security/cost/capability/scale comparison, proof of concept and separate George provider approval. Provider-neutral interfaces and database contracts may proceed; provider adapter/integration and replacement of `after()` may not. |
| 16 | Irreversible deletion blocked | **PASS** | R11 keeps deletion disabled by default. D8 requires legal review, backup alignment and deletion-recovery testing; D9 requires legal review and end-to-end deletion testing; D10 prohibits legacy deletion without separate exact founder approval. Dry runs and reversible quarantine remain permitted in principle. |

## Original Database Architect required-change traceability

| Original review requirement | Updated-plan disposition |
|---|---|
| Freeze actor model and narrow job operations | Incorporated in “Final actor and authority model,” R01 and the RLS/grant matrix. |
| Define legal state transitions and CAS/lease semantics | Incorporated in the explicit state table and R03. |
| Separate request idempotency and active exclusion | Incorporated in “Separate identities,” D2 and R03. |
| Make usage server/worker authoritative and immutable | Incorporated in D4 and R02. |
| Separate memory trust classes and remove wildcard identity | Incorporated in D5 and R04. |
| Add durable card-set-bound sessions | Incorporated in D6 and R05. |
| Include grants, safe projections, worker scope and supporting-table RLS | Incorporated in the actor/RLS matrices and R01–R07/R10. |
| Resolve fresh/history/upgrade migration ordering | Incorporated in D11 and R07 with manifest, checksum, baseline and consolidated-baseline fallback. |
| Make all three buckets private with versioned visual paths | Incorporated in D7 and R06. |
| Bound polling and define scale/retention thresholds | Incorporated in D13 and R09/R11/R12. |
| Separate public errors from restricted diagnostics | Incorporated in R06 and the owner-safe projection. |
| Define exact migration files and serialization | Incorporated in R07's ten proposed logical filenames and single migration-owner rule. |

All material original corrections are incorporated.

## Remaining findings

### BFV1-DB-RR-01 — Two stale plan phrases contradict approved D7

- **Severity:** Medium documentation defect
- **Evidence:** Phase 2 still says “Storage implementation only after George's visibility decision,” although D7 is approved. Release criterion 7 still refers to “George-approved private/public policy,” although the binding decision is private for all three buckets.
- **Assessment:** The binding D7 section, qualification effects, R06 and decision record are unambiguous, so these phrases do not reopen public Storage. They could nevertheless confuse an implementer.
- **Required correction:** Before Claude handoff, annotate the implementation task or handoff that D7 is resolved and private is mandatory. Future plan maintenance should replace the stale phrases, but this rereview does not authorize editing the plan.
- **Acceptance:** No implementation branch introduces `getPublicUrl`, a public bucket, stored signed URLs, or public fallback; the final review treats public Storage as a failure.
- **Blocks:** Does not block provider-neutral safe-error or signed-access preparation; blocks any interpretation that public visibility remains an option.

### BFV1-DB-RR-02 — AI inference classification must follow the binding D5 qualification

- **Severity:** Medium implementation-clarity risk
- **Evidence:** The detailed D5 decision describes AI-inferred claims as a class, while the plan's binding qualification and R04 say a model output is not verified merely because it was generated and remains temporary/unverified until an approved verification rule qualifies it.
- **Assessment:** The updated plan resolves the apparent tension correctly: only verified claims enter `system_memory_claims`; raw AI inference is a temporary/unverified signal. Claude must not use the broader label from explanatory text to bypass verification.
- **Required correction:** The implementation handoff and schema names must preserve `verified` as an enforced producer/workflow property, not a caller-set enum. Promotion must be a separate trusted, versioned, evidence-linked operation.
- **Acceptance:** Direct client and generic AI producer attempts to create verified claims fail; tests prove an unverified signal cannot self-promote.
- **Blocks:** Blocks verified-claim producer implementation until its verification rule is specified; does not block user-note or temporary-signal scaffolding.

### BFV1-DB-RR-03 — Operational parameters remain intentionally unset

- **Severity:** High operational gate, not a target-contract rejection
- **Evidence:** The plan explicitly leaves maintenance/degraded-service tolerance, Storage MIME/size ceilings and managed-worker cost ceiling unresolved. D12 also requires exact approval for staging writes and every production action.
- **Assessment:** These parameters materially affect migration locks/rollout, upload constraints and provider selection. The plan correctly blocks affected implementation or rollout from finalizing without them.
- **Required correction:** George must record the parameters before the affected migrations, Storage contract or provider comparison can be finalized. Use measured recommendations, not arbitrary coding defaults.
- **Acceptance:** Parameter record is linked to migration/application tests; MIME coverage matches actual browser uploads; size ceilings have rejection UX; maintenance and abort criteria are in the runbook; provider comparison uses an approved cost envelope.
- **Blocks:** Storage migration finalization, populated migration rollout design and provider selection. Does not block reversible test scaffolding, safe DTO work or manifest/checksum tooling.

### BFV1-DB-RR-04 — Commit disposition and implementation authorization remain outstanding

- **Severity:** High governance gate
- **Evidence:** The plan says George must still record keep/contain/forward versus revert. The Founder approval record expressly does not authorize implementation, branch creation, migration creation/execution or environment access.
- **Assessment:** The recommended forward disposition is technically safer than rewriting or blindly reverting `main`, but this review cannot supply George's approval or broaden D1–D13.
- **Required correction:** George must record the keep/contain/remediate-forward disposition and separately authorize the exact repository-only implementation phase on `feature/remediate-beta-foundation-v1`.
- **Acceptance:** The disposition and scope are durable; branch/workflow gates exist; no work occurs on `main`; containment remains visible until PASS.
- **Blocks:** All Claude implementation until recorded. This is an authorization gate, not a flaw in the target database design.

## Recommended disposition of commit `7f72313`

**Approve keeping commit `7f72313` in published history, contain reliance on unsafe behavior, and remediate forward through new migrations and compatible application changes. Do not rewrite `main`.**

This is the safest option because a Git revert cannot undo SQL that may already have been applied, live schema state is unknown, and reverting application code could further separate application and database contracts. Preserving the commit keeps the audit trail honest. Containment must continue: jobs are not trusted orchestration, existing usage is not billing/audit authority, legacy memory is not consequential personalization, and broader beta release remains blocked until verification passes.

George must still record this disposition. This review recommends it but does not authorize it.

## Work Claude may begin immediately after explicit implementation authorization

The following repository-only, reversible work may begin once George records the forward disposition, explicitly authorizes implementation, and the protected feature branch exists:

1. R14 branch/checksum/governance enforcement, including the immutable historical-migration checksum gate.
2. R10 disposable-environment test harness scaffolding, actor-matrix fixtures, schema normalization, redaction and durable evidence format—without accessing or provisioning an environment until separately approved.
3. Provider-neutral job interfaces, state-machine types, transition tests, idempotency-key and payload-hash helpers, safe job DTOs and public error classifiers.
4. Provider-neutral database contract and new forward migration drafting for R01–R07, subject to one serialized migration owner and no execution. The live-upgrade branches must remain conditional until approved catalog evidence exists.
5. Trusted usage producer interface/outbox abstraction and tests, with existing usage permanently excluded from authority and no billing/entitlement activation.
6. User-note, temporary-signal, verified-claim boundary scaffolding and tests; no producer may mark claims verified until its rule is approved and enforced.
7. Durable flashcard session schema/application design and local tests using the approved versioned beta thresholds.
8. Safe error DTO/log redaction and private signed-access application support, without changing any bucket or deleting/migrating legacy objects.
9. Provider-neutral bounded polling/reload logic and tests against the frozen safe DTO/state contract.
10. Retention inventory, dry-run reporting, quarantine tooling design and reversible synthetic-data tests; destructive mode must remain impossible or disabled.

“May begin” here means architecturally approved after the separate authorization described above. It is not permission from this reviewer to create a branch, write migrations, access an environment, commit, or deploy.

## Work blocked by the D3 provider decision

- Selecting or committing to a managed workflow provider.
- Provider SDK/configuration, credentials, hosted queues/workflows and production adapter integration.
- Provider-specific webhook/callback authentication and network/data-transfer configuration.
- Replacing the `after()` path with provider delivery.
- Provider-specific retry, concurrency, dead-letter, region and observability configuration.
- Final restricted worker deployment and operational runbook.

Before this work, D3 requires a security, cost, capability and scalability comparison, a bounded proof of concept, review of the evidence, and separate George approval of the provider. Provider-neutral database leases, CAS functions, idempotent side-effect design and adapter interfaces may proceed.

## Work blocked by legal review

- Enabling irreversible automated retention deletion.
- Activating production account/content deletion.
- Finalizing legally required usage/audit retention and pseudonymization behavior where jurisdictional duties apply.
- Purging diagnostics, documents, recordings, visuals, sessions, memories or backups under production schedules.
- Final production FK/cascade behavior where it would irreversibly destroy data or conflict with legally required retention.
- Any legal-hold activation or deletion-key separation handling without approved legal/security controls.

Reversible lifecycle metadata, dry runs, tombstone/grace designs, quarantine, synthetic tests and backup/recovery rehearsal may proceed when their environments are separately authorized.

## Work blocked by missing operational parameters

- Final Storage constraints until MIME allowlists and per-bucket size ceilings are recorded.
- Final populated-upgrade execution plan until maintenance/degraded-service tolerance, abort thresholds and recovery timing are recorded.
- D3 provider selection until the managed-worker cost ceiling is recorded.
- Staging writes, load tests or migration rehearsals until exact D12 environment/action approvals are recorded.
- Production catalog reads, backups, migration, repairs, policy/bucket changes, load, deletion or deployment until each exact production action is approved.

## Irreversible and legacy-deletion blocks

- D8: irreversible automated deletion remains disabled until legal review, backup alignment and deletion-recovery testing pass.
- D9: production deletion remains disabled until legal review and end-to-end deletion tests pass.
- D10: legacy deletion is not approved. Only quarantine and deterministic non-destructive repair are permitted in principle. Any deletion requires a new exact George approval with targets, counts, backup and recovery evidence.
- No cleanup fallback may reopen public Storage, restore broad RLS writes, or silently promote legacy usage/memory to trusted status.

## RLS and security-test sufficiency

The proposed R10 plan is sufficient for implementation acceptance if executed exactly. It must produce machine-readable outcomes for:

- Anonymous, User A owner, User B non-owner, restricted server, restricted worker and service-role cases.
- SELECT, INSERT, UPDATE and DELETE against each foundation base table and every new note, claim, evidence, signal, session, diagnostic and side-effect/outbox table.
- Safe views and absence of restricted columns.
- Direct table DML, purpose-specific functions, sequence privileges, function `search_path`, ownership and `PUBLIC` EXECUTE revocation.
- User B parent IDs and nonexistent parent IDs for documents, flashcard sets, jobs, artifacts and memory evidence.
- Wrong user IDs, forged worker IDs, wrong/expired lease tokens, stale state versions, terminal callbacks and cancellation races.
- Storage list/read/sign/upload/update/upsert/delete/path traversal across all three buckets.
- Fresh and upgraded catalogs, including detection of any unexpected permissive policy or grant.

Service-role success must never be presented as proof that the restricted worker is correctly scoped. Missing credentials or skipped release tests must fail the gate.

## Migration and recovery sufficiency

The D11/R07 strategy is sufficient at the design level:

1. Canonical active-product prerequisites execute first on a fresh path.
2. The immutable historical file occupies its declared manifest position, or is retained as a never-executed audited artifact under the approved consolidated-baseline fallback.
3. All fixes are new forward migrations after the historical semantic point.
4. Existing environments skip only steps proven by approved catalog comparison and recorded history.
5. Fresh and upgraded normalized final catalogs must match.
6. Preflight aborts on unknown policies, incompatible objects, unresolved duplicates, missing backup or unverified history.
7. Additive compatibility, backup/restore rehearsal, partial-failure detection/resume and forward recovery protect populated upgrades.

The plan appropriately does not claim the current live upgrade is known safe without catalog evidence. That uncertainty is contained by D12 and is not permission to guess. Migration SQL may be drafted conditionally after implementation authorization, but the populated-upgrade migration cannot be finalized or executed until the exact approved preflight/clone evidence is reviewed.

## Remaining decisions and approvals required from George

1. Record **keep `7f72313`, contain and remediate forward; do not rewrite `main`**, or choose a separately planned operational revert.
2. Explicitly authorize the limited repository-only implementation phase and protected branch; D1–D13 alone do not authorize it.
3. After the D3 comparison and proof of concept, approve one worker provider or reject all candidates.
4. Record the managed-worker beta cost ceiling used by D3/D13.
5. Record Storage MIME allowlists and per-bucket size ceilings.
6. Record maintenance/degraded-service tolerance, migration abort thresholds and recovery expectations.
7. Give exact D12 approval for any disposable hosted environment, staging action, live read-only catalog comparison, backup/clone, rehearsal or production action.
8. After legal review and recovery evidence, decide whether to activate D8/D9 production deletion mechanisms.
9. Separately approve any exact legacy-data deletion under D10; none is currently allowed.
10. Later approve merge and, separately, production migration and deployment after all PASS evidence and reviews.

The adjustable D6 thresholds and D13 SLOs do not need a new decision now. Any future change must be versioned, evidence-linked, privacy-safe, reviewed and non-retroactive.

## Release-blocking acceptance criteria

The release remains FAIL until all criteria in the revised plan pass, including:

1. Historical migration checksum and manifest ordering are verified.
2. Fresh and populated-upgrade paths produce the same reviewed catalog.
3. Broad authenticated authoritative DML is absent.
4. Parent ownership and safe projections are enforced in the database.
5. Job enqueue, claim, cancel, lease, retry, recovery and terminal publication pass real concurrency tests.
6. Usage replay, correction and legacy exclusion pass.
7. Memory claim provenance, verification, supersession and evidence pass.
8. Flashcard session completion and third-session inference pass refresh/tab/retry races.
9. All buckets are private and Storage actor matrices pass.
10. Raw errors and restricted result/diagnostic data are inaccessible to users.
11. Backup, restore, interruption, resume and forward-recovery evidence passes.
12. D13 performance, polling, retention backlog and recovery goals pass at representative volume.
13. Durable evidence is sanitized and tied to the exact commit, manifest and migration checksums.
14. Database Architect, Security/QA, Senior Reviewer and George gates complete; production rollout receives separate approval.

## Final verdict

**APPROVE FOR LIMITED IMPLEMENTATION**

The revised database design is substantially complete and incorporates the original required corrections. Once George records the forward disposition, explicitly authorizes implementation and establishes the protected non-`main` branch, Claude may begin the reversible provider-neutral work listed in this review.

Provider-specific implementation remains blocked by D3. Irreversible deletion and production deletion remain blocked by D8–D10 and legal/recovery gates. Live/staging actions remain blocked by D12. Storage and populated-upgrade finalization remain blocked by missing operational parameters. No merge, migration execution or deployment is approved.
