# Beta Foundation V1 — Founder Decisions

## Founder approval record

- **Decision-maker:** George, Founder.
- **Status:** D1–D13 approved with the qualifications stated below.
- **Effect:** these approvals resolve the founder-level contract choices for remediation planning. They do not authorize code implementation, migration creation or execution, Supabase access, staging writes, production access, irreversible deletion, commit, merge, or deployment. Existing specialist and review gates remain mandatory.

George's approved wording, recorded exactly:

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

## For George

Beta Foundation V1 remains **FAIL**. The engineering direction is sound, but implementation must not begin until you decide the product and operational rules below. These choices determine what the database is allowed to do; Claude Code must not make them while coding.

The recommendations prioritize student privacy, predictable behavior, data integrity, and a realistic beta operating model. You remain the final decision-maker. Approving this document authorizes contract design and later implementation on `feature/remediate-beta-foundation-v1`; it does **not** authorize Supabase access, SQL execution, production migration, merge, deployment, deletion, or cleanup. Those need separate exact approvals.

**Implementation blockers:** D1–D12 block at least one remediation implementation lane. D13 does not block initial security/correctness engineering, but blocks performance qualification and release.

## D1 — Job cancellation behaviour

- **Founder status:** **Approved** with the exact D1 wording in the Founder approval record.
- **Decision ID:** D1.
- **What the decision means:** what MoLis promises when a student cancels AI work that is waiting or already running.
- **Why it matters:** an external AI provider may keep working after a click. Calling a processing job immediately cancelled while later publishing its result would be misleading and unsafe.
- **Recommended choice:** queued jobs cancel immediately. Processing jobs move to `cancel_requested`; the worker must stop at the next safe checkpoint and acknowledge `cancelled`. Once cancellation is requested, no result may be published. Any partial result stays private/unpublished and is deleted by bounded cleanup unless it is required briefly for diagnosis. If the worker disappears, a reconciler marks the job cancelled after its lease expires. The student may retry after terminal cancellation, creating a new request/job identity.
- **Technical detail:** legal paths are `queued → cancelled` and `processing → cancel_requested → cancelled`. Completion must compare expected state/version and current lease, and fail after cancellation. Provider work that cannot be interrupted may finish externally, but its callback/output is discarded as non-winning. Cancellation is idempotent.
- **Alternative choices:** (A) immediately mark processing work cancelled and discard any later result; (B) disallow cancellation after processing begins; (C) save and show partial results.
- **Benefits of the recommendation:** truthful state, strong user control, auditable handling, no stale result publication, and safe retry.
- **Risks and trade-offs:** adds a state and reconciler; provider cost may still be incurred; students will not receive partial output.
- **Whether it blocks implementation:** **Yes**—job state machine, worker, cancellation API, and UI.
- **Exact short approval wording George can use:** `D1: Approve recommended cancel-request/acknowledge behaviour; do not publish partial or post-cancel results.`

## D2 — Duplicate request behaviour

- **Founder status:** **Approved** with the exact D2 wording in the Founder approval record.
- **Decision ID:** D2.
- **What the decision means:** what students see and what MoLis pays for when the same generation request is submitted twice.
- **Why it matters:** duplicate tabs, retries, double-clicks, and network replay can otherwise start duplicate AI work and produce competing results.
- **Recommended choice:** the same idempotency key and payload returns the existing job. A different request for the same document/job type while one is active returns the existing active job plus an explicit “already in progress” outcome; it does not cancel or replace it. A future explicit “cancel and regenerate” action must first complete D1 cancellation, then enqueue a new key.
- **Technical detail:** request idempotency is separate from active-work exclusion. Same key/different payload is rejected and audited. One active job is enforced for `(user, document, job type)` across queued, processing, and cancel-requested states. Recommend a 24-hour request-key replay window while retaining the permanent job/key association needed for audit; a new explicit user action receives a new key.
- **Alternative choices:** reject all duplicates; automatically cancel/replace the active job; allow parallel jobs.
- **Benefits of the recommendation:** friendly retry behavior, lower provider cost, no stale-output race, and predictable recovery.
- **Risks and trade-offs:** a student wanting changed output must explicitly cancel/regenerate; returning an existing job requires clear UI copy.
- **Whether it blocks implementation:** **Yes**—enqueue operation, uniqueness, API responses, and UI.
- **Exact short approval wording George can use:** `D2: Approve returning the existing job for duplicate/active work; never auto-replace it.`

## D3 — Worker infrastructure

- **Founder status:** **Direction approved with qualification.** MoLis must remain provider-neutral until George approves the required comparison and proof of concept; no specific provider is approved.
- **Decision ID:** D3.
- **What the decision means:** which system reliably continues AI jobs after the web request ends.
- **Why it matters:** the current Next.js `after()` work can stop on timeout, crash, or deployment and is not a durable queue.
- **Recommended choice:** for beta, use an external managed job/workflow system that supports durable at-least-once delivery, retries, scheduling, concurrency controls, and observability, paired with MoLis database leases and idempotent side effects. Keep the worker behind a provider-neutral adapter. As usage and team capacity grow, reassess a dedicated queue/worker when cost, regional control, throughput, or compliance justifies operating it.
- **Technical detail:** the managed system delivers work but never owns MoLis authorization. A restricted worker claims the database job with lease token, heartbeats every 30 seconds, uses a 90-second lease, and can complete only with current state/version/lease. Recommend maximum 3 attempts with jittered backoff near 15 seconds, 60 seconds, and 5 minutes, subject to provider rate-limit guidance. Overall job timeout recommendation is 15 minutes, with per-provider call limits below that.
- **Alternative choices:**
  - **A — Current Next.js/Vercel route execution:** simplest, but request/invocation-bound and unsuitable for durable recovery.
  - **B — Supabase Edge Functions:** close to the data and useful for short work, but execution alone is not a durable queue and still needs scheduling/retry/lease design.
  - **C — Dedicated worker and queue:** strongest control and future scale, but highest operational burden for the current team.
  - **D — External managed job system:** safest realistic beta choice; adds provider cost and another trust boundary.
- **Benefits of the recommendation:** fastest path to durable delivery, mature retry/monitoring, fewer stranded jobs, and provider-neutral evolution.
- **Risks and trade-offs:** vendor dependency/cost, secret and data-transfer review, at-least-once duplication that MoLis must handle safely.
- **Whether it blocks implementation:** **Yes**—durable worker cutover, retry/lease parameters, and deployment architecture.
- **Exact short approval wording George can use:** `D3: Choose option D for beta with database leases and idempotency; reassess a dedicated queue at measured thresholds.`

## D4 — Usage-event authority

- **Founder status:** **Approved** with the exact D4 wording in the Founder approval record.
- **Decision ID:** D4.
- **What the decision means:** who is trusted to record AI usage that may later affect limits, cost, billing, analytics, or audit.
- **Why it matters:** current authenticated users can submit arbitrary values, so existing rows are not trustworthy.
- **Recommended choice:** authoritative usage is written only by trusted server/worker code using protected provider/execution facts. Browser-origin analytics, if later needed, goes to a separate explicitly non-authoritative stream. Existing rows remain `legacy_unverified` and must never drive billing or entitlements.
- **Technical detail:** immutable ledger; unique producer/idempotency key; operation/event/attempt identity; provider reference where available; append-only corrections; durable outbox before usage becomes consequential. Do not enable billing/limit enforcement until reconciliation and evidence pass.
- **Alternative choices:** clients submit claims that the server verifies; authenticated users insert directly; keep usage analytics-only and never authoritative.
- **Benefits of the recommendation:** prevents fraud and double counting, supports audit/corrections, and creates a reliable future billing foundation.
- **Risks and trade-offs:** stronger ingestion/reconciliation work and retention obligations; strict recording may need an outbox so UX is not blocked.
- **Whether it blocks implementation:** **Yes**—final ledger schema/cutover. Unsafe direct writes may be contained only once a compatible trusted path exists.
- **Exact short approval wording George can use:** `D4: Approve trusted-server/worker-only authoritative usage; classify all existing events as legacy unverified.`

## D5 — Memory trust classes

- **Founder status:** **Approved** with the exact D5 wording in the Founder approval record. The approved system class is described as verified system claims.
- **Decision ID:** D5.
- **What the decision means:** whether a student's own note is treated differently from something AI infers or MoLis verifies.
- **Why it matters:** mixing them allows user edits or weak signals to masquerade as trusted personalization facts.
- **Recommended choice:** separate four classes and their permissions:
  1. **User-created notes:** user can create, read, edit, and soft-delete; trusted server validates fields.
  2. **AI-inferred claims:** only an approved versioned AI producer can create/supersede; user can view and request correction/deactivation, not rewrite provenance/evidence.
  3. **Verified system claims:** only a trusted verified producer/workflow can create/supersede; user can view and dispute; correction is new history, not silent edit.
  4. **Temporary behavioural signals:** trusted collection only, short-lived, not presented as facts and not used for high-impact adaptation alone.
- **Technical detail:** recommend distinct `user_memory_notes` and `system_memory_claims`, with trust level inside system claims for inferred/verified, plus a separate short-lived signal/event path. One active versioned claim per canonical key; evidence and supersession history retained under D8/D9.
- **Alternative choices:** one table with strong database-enforced provenance and narrow functions; one user-editable table for everything.
- **Benefits of the recommendation:** clear trust boundary, safer personalization, auditable correction, and better student control.
- **Risks and trade-offs:** composed reads and more schema/application work; verified claims require a real verification workflow.
- **Whether it blocks implementation:** **Yes**—memory migration, producer cutover, flashcard inference, and permissions.
- **Exact short approval wording George can use:** `D5: Approve separate user notes, system claims, and temporary signals with the recommended permissions.`

## D6 — Flashcard session eligibility

- **Founder status:** **Approved as an adjustable beta default.** Later threshold changes require privacy-safe evidence and review.
- **Decision ID:** D6.
- **What the decision means:** exactly what student activity counts as one real completed session toward a preference inference.
- **Why it matters:** refreshes, retries, rapid double-clicks, offline replay, and duplicate tabs must not fabricate “three sessions.”
- **Recommended choice:** one session is a server-issued session tied to one flashcard-set version. It counts only when the student rates at least 80% of that set, including at least `min(5, total cards)` distinct cards, and records at least 60 seconds of active study time. Completion is one-way and idempotent. Refresh, reconnect, and duplicate tabs resume the same active session. Abandoned sessions do not count. Review-only sessions are recorded separately and do not count toward the initial three-session format preference. “Study again” may count as a new full session only after the previous one is terminal and the full eligibility rule is met; recommend a 10-minute server-enforced start cooldown for the same set.
- **Technical detail:** mutable progress remains resumable UI state only. Completion uses compare-and-set. Offline replay uses the same session/completion key. Regenerated card sets create a new set version while historical evidence remains linked. Three distinct eligible session IDs create one versioned inference.
- **Alternative choices:** require every card with no duration; lower activity threshold; count review-only sessions; use a simple progress counter.
- **Benefits of the recommendation:** meaningful evidence, retry safety, understandable audit trail, and recomputation.
- **Risks and trade-offs:** slower preference inference; active-time measurement must respect privacy and browser suspension; short sets require all cards.
- **Whether it blocks implementation:** **Yes**—session schema, completion API, and preference inference.
- **Exact short approval wording George can use:** `D6: Approve the recommended 80%/minimum-card/60-second durable session rule; exclude abandoned and review-only sessions.`

## D7 — Storage privacy

- **Founder status:** **Approved** with the exact D7 wording in the Founder approval record.
- **Decision ID:** D7.
- **What the decision means:** whether uploaded documents, recordings, and generated study visuals can be opened by anyone who obtains their URL.
- **Why it matters:** these assets can contain personal or sensitive educational information. An unguessable public URL is not authorization.
- **Recommended choice:** accept the Database Architect recommendation: make `study-documents`, `recordings`, and `study-visuals` private. Store bucket/path, not public or signed URLs. Mint signed URLs only after ownership checks; recommend 5-minute access for documents/visuals and 10 minutes for server-side audio processing, refreshed when needed. Use canonical owner prefixes and immutable versioned visual paths. Never reopen public access as rollback.
- **Technical detail:** owner/server/worker policies separately cover list/read/sign/upload/update/delete; MIME and size allowlists are required; stale workers upload separate versions and cannot publish/overwrite the current winner. Legacy public visuals need inventory, private-copy/reference validation, access revocation, and later approved cleanup.
- **Alternative choices:** keep visuals public; make only uploads private; authenticated media proxy instead of signed URLs.
- **Benefits of the recommendation:** confidentiality, revocation, cross-user isolation, safer stale-worker behavior, and alignment across all three buckets.
- **Risks and trade-offs:** signed URL refresh/caching work, possible rendering latency, migration of legacy public objects.
- **Whether it blocks implementation:** **Yes**—Storage migration/cutover and visual retrieval design.
- **Exact short approval wording George can use:** `D7: Approve private study-documents, recordings, and study-visuals with short-lived signed access and versioned visual paths.`

## D8 — Data retention

- **Founder status:** **Provisionally approved.** Irreversible automated deletion remains disabled until legal review, backup alignment, and deletion-recovery testing are complete.
- **Decision ID:** D8.
- **What the decision means:** how long MoLis keeps each data class before deletion or anonymisation.
- **Why it matters:** keeping data forever increases privacy, legal, security, cost, and performance risk; deleting too quickly harms students and audit/recovery.
- **Recommended choice:** adopt the following beta defaults, subject to legal review and user-facing policy:

| Data class | Recommended policy |
|---|---|
| Uploaded documents | Keep while the student keeps the document; purge active and backup-accessible copies within 30 days of user/document deletion unless legal hold applies. |
| Audio recordings | Default purge raw audio 30 days after successful processing; allow an explicit student “keep recording” choice; purge within 30 days of deletion. Derived content follows its own parent policy. |
| Generated visuals | Keep while the parent document exists; purge superseded/unreferenced versions after 30 days and all versions within 30 days of parent/account deletion. |
| Job records | Keep safe terminal metadata for 90 days; remove/private-purge input/result payloads sooner when no longer required; retain only aggregate operational metrics afterward. |
| Public-safe errors | Keep code/message key/support reference with the job for 90 days. |
| Internal diagnostic errors | Keep redacted restricted diagnostics for 14 days by default; extend only for an active incident/legal requirement. |
| Usage events | Keep authoritative pseudonymized metering for 24 months by default, or longer only where billing/tax law requires; keep low-trust analytics no more than 13 months. |
| Inactive memories | Keep inactive/superseded system claims for 90 days for correction/recovery, then purge or retain a minimal non-content audit link; user notes remain until user deletion. |

- **Technical detail:** retention jobs are bounded, resumable, audited, dry-run first, legal-hold aware, and reconcile database rows with Storage. Start unpartitioned and trigger partition evaluation under D13 metrics.
- **Alternative choices:** shorter privacy-first periods; longer support/audit periods; indefinite retention; student-configurable retention for more classes.
- **Benefits of the recommendation:** concrete minimization, manageable beta operations, bounded diagnostics, and enough recovery time.
- **Risks and trade-offs:** legal requirements vary by country; 24-month usage retention may be too long for analytics and too short for some financial records; backups need compatible deletion schedules.
- **Whether it blocks implementation:** **Yes**—retention fields/jobs, deletion FKs, diagnostic storage, Storage cleanup, and usage design.
- **Exact short approval wording George can use:** `D8: Approve the recommended beta retention schedule, subject to legal review before production rollout.`

## D9 — Account deletion

- **Founder status:** **Objective approved with activation gate.** Production deletion remains disabled until legal review and end-to-end deletion testing are complete.
- **Decision ID:** D9.
- **What the decision means:** what is erased, anonymized, or retained when a student deletes an account.
- **Why it matters:** MoLis must respect deletion while preserving only evidence it is legally required to keep.
- **Recommended choice:** immediately revoke access and queue deletion. Delete student content, user notes, AI claims, temporary signals, documents, recordings, generated materials, sessions, and identifiable operational job payloads within 30 days, including coordinated Storage cleanup. Redacted operational logs expire under D8. Pseudonymize—not merely hide—authoritative usage/audit records only when retention is legally or contractually required; remove direct identifiers and maintain a tightly controlled deletion-key separation. Legal holds override only documented classes for documented periods.
- **Technical detail:** deletion workflow is auditable, resumable, owner-isolated, and produces aggregate completion evidence without retaining content. Backups expire on their normal protected schedule and prevent routine restoration of deleted accounts. Cascade behavior cannot silently retain objects or destroy required pseudonymous audit evidence.
- **Alternative choices:** immediate hard cascade of everything; retain all usage/audit with user ID; anonymize most content; manual-only deletion.
- **Benefits of the recommendation:** strong privacy, user trust, controlled legal compliance, and fewer orphaned objects.
- **Risks and trade-offs:** legal analysis and coordinated deletion complexity; pseudonymization can still be personal data if reidentification is possible; 30-day window must be disclosed.
- **Whether it blocks implementation:** **Yes**—FK behavior, retention, cleanup, ledger identity, and recovery.
- **Exact short approval wording George can use:** `D9: Approve 30-day student-content deletion and retain only legally required pseudonymized usage/audit evidence.`

## D10 — Legacy-data repair

- **Founder status:** **Approved with deletion prohibition.** Legacy deletion requires a separate founder approval; only deterministic, non-destructive repair is currently authorized in principle.
- **Decision ID:** D10.
- **What the decision means:** how to handle invalid, duplicate, orphaned, or potentially cross-user-linked rows already present.
- **Why it matters:** automatic cleanup can destroy student work; leaving ambiguous rows active can preserve a security or integrity defect.
- **Recommended choice:** quarantine first. Automatically repair only deterministic, non-destructive cases proven from authoritative parent ownership and recorded in a reversible mapping. Quarantine ambiguous duplicates/orphans/cross-user links from trusted consumption and user exposure. Use manual review for high-value/ambiguous records. Delete only after backup, counts, evidence, and George's exact approval.
- **Technical detail:** preflight classifies candidates; canonical duplicate selection never erases alternatives initially; cross-user links fail closed; no legacy memory/usage row is upgraded to trusted without valid provenance/evidence; dry-run and restoration are mandatory.
- **Alternative choices:** automatic repair all candidates; delete all invalid rows; leave everything active; manual review every row.
- **Benefits of the recommendation:** reversible, privacy-safe, preserves evidence, and allows constraints to be introduced safely.
- **Risks and trade-offs:** temporary complexity/storage, manual workload, and delayed cleanup.
- **Whether it blocks implementation:** **Yes**—unique constraints, parent FKs, migration upgrade, and destructive reconciliation.
- **Exact short approval wording George can use:** `D10: Approve quarantine-first legacy handling; allow only deterministic non-destructive repair and require separate approval for deletion.`

## D11 — Migration baseline

- **Founder status:** **Approved.** `beta_foundation_v1.sql` remains byte-for-byte immutable.
- **Decision ID:** D11.
- **What the decision means:** how one repository safely supports both today's unknown/manual live schema and a completely empty new project.
- **Why it matters:** the historical migration depends on tables not in the repository and was edited after introduction; filename order could reapply broad policies after fixes.
- **Recommended choice:** adopt both a canonical prerequisite baseline and an explicit versioned migration manifest. For fresh projects: apply prerequisite active-product schema, then place the byte-for-byte immutable historical `beta_foundation_v1.sql` at its declared manifest position, then all forward remediation migrations. For the existing database: perform approved read-only catalog comparison, backup/clone rehearsal, and mark only proven already-applied steps before forward remediation. Compare normalized final catalogs and require equality. If the chosen tool cannot place the historical file safely, use an approved consolidated fresh baseline that preserves the old file solely as an audited artifact and never renames/edits it.
- **Technical detail:** checksum lock; no lexical filename assumption; no manual dashboard objects; schema/policy/grant/bucket assertions; partial-failure resume and old/new application compatibility. `beta_foundation_v1.sql` must never be edited again.
- **Alternative choices:** reconstruct every historical migration; consolidated fresh baseline only; keep manual live schema and add ad hoc corrections; rename/edit the old migration.
- **Benefits of the recommendation:** deterministic fresh builds, safe live upgrades, auditability, and protection against policy reintroduction.
- **Risks and trade-offs:** manifest/tooling work and careful catalog inspection; baseline may obscure early evolution if poorly documented.
- **Whether it blocks implementation:** **Yes**—all migration naming/generation and upgrade design.
- **Exact short approval wording George can use:** `D11: Approve the explicit manifest plus canonical prerequisite baseline; keep beta_foundation_v1.sql byte-for-byte immutable.`

## D12 — Environment access

- **Founder status:** **Approved with exact-action gates.** All staging writes and every production action require separate approval.
- **Decision ID:** D12.
- **What the decision means:** which systems AI agents may inspect or change and when they must ask you first.
- **Why it matters:** schema truth is needed for safe upgrades, but uncontrolled access can expose or alter student data and production services.
- **Recommended choice:**
  - **Local workspace/emulator:** read/write and disposable test-data operations within an approved task; no real credentials/data.
  - **Disposable test environment:** access allowed only after you approve provisioning/credentials/scope; synthetic data only; migration and destructive tests allowed within that exact disposable target.
  - **Staging:** read-only catalog access requires your explicit environment/scope approval; migration/write/destructive/load actions each require separate approval, backup, and recovery plan; no copied production student data unless lawfully sanitized and separately approved.
  - **Production:** every catalog read, data read, backup, migration, policy/bucket change, repair, deletion, load test, or deployment requires your explicit approval for the exact environment, action, operator, and time. Production student-row access is prohibited unless essential, narrowly scoped, audited, and separately approved.
- **Technical detail:** least-lived credentials, secret manager, audit logs, no service-role exposure, sanitized evidence, and immediate rotation on exposure. Approval to write migration files never authorizes execution.
- **Alternative choices:** broad standing staging/production access; no environment inspection at all; human-only production operator executing approved runbooks.
- **Benefits of the recommendation:** safe local progress, controlled evidence gathering, least privilege, and clear founder authority.
- **Risks and trade-offs:** approval latency; without approved live catalog inspection, final live upgrade design remains uncertain.
- **Whether it blocks implementation:** **Yes**—populated-upgrade generation/rehearsal and any environment verification; local design work can continue.
- **Exact short approval wording George can use:** `D12: Approve the recommended tiered access model; require exact separate approval for all staging writes and every production action.`

## D13 — Performance and reliability targets

- **Founder status:** **Approved as initial measurable release goals**, subject to evidence-based revision.
- **Decision ID:** D13.
- **What the decision means:** measurable beta standards for “fast, reliable, and scalable,” including when to invest in queues or partitioning.
- **Why it matters:** without thresholds, MoLis cannot prove quality or detect when the beta architecture is failing.
- **Recommended choice:** approve these initial beta SLOs and triggers, measured in a representative environment and excluding planned provider outages where contracts permit:

| Measure | Recommended beta target |
|---|---|
| Non-AI API response time | p95 ≤ 300 ms for reads and ≤ 500 ms for mutations; p99 ≤ 1 s. |
| AI job queue time | p95 ≤ 5 s normally; alert at p95 > 15 s for 10 minutes. |
| AI job completion time | p95 ≤ 3 minutes and p99 ≤ 10 minutes for visuals; product-specific targets required before adding job types. Hard overall timeout 15 minutes. |
| Application availability | ≥ 99.9% monthly for authenticated core journeys during beta. |
| Non-user-caused API error rate | < 1% over 15 minutes; critical auth/data APIs < 0.5%. |
| AI terminal failure rate | < 5% excluding explicit cancellation; alert on doubling of baseline or >5%. |
| Crash-free sessions | ≥ 99.8% web sessions. |
| Polling load | One in-flight request; start around 2 s, then 5/10/30 s backoff with jitter; pause hidden/offline; average ≤ 6 status requests/minute after the first minute; no overlap. |
| Retry limits | Maximum 3 attempts for classified transient failures; no retry for authorization, validation, cancellation, or known permanent failures. |
| Lease/stale thresholds | 30 s heartbeat, 90 s lease; reconcile expired lease within 2 minutes; browser never decides authoritative staleness. |
| Retention backlog | Alert at >24 hours behind; pause destructive cleanup on invariant/reconciliation failure. |
| Partition evaluation | Evaluate append-only table partitioning at ≥100 million rows, ≥50 GB table/index footprint, vacuum/maintenance breach, or p95 query SLO breach despite correct indexes. |
| Managed/dedicated queue evolution | Reassess provider/architecture when sustained queue lag breaches SLO, claim DB contention exceeds 5% of attempts, throughput exceeds tested envelope, regional/compliance needs arise, or managed cost exceeds the approved ceiling for 3 months. |

- **Technical detail:** test baseline, sustained load, spike, stress, soak, and recovery with actual RLS roles; seed representative cardinality; capture p50/p95/p99, QPS, errors, locks, pool/vacuum, queue lag, backlog, object latency, and cost.
- **Alternative choices:** looser beta targets; stricter production-like targets now; no numerical SLOs until more users exist.
- **Benefits of the recommendation:** measurable release gate, early warning, controlled investment, and scalable direction without premature partitioning.
- **Risks and trade-offs:** provider latency may challenge AI targets; availability measurement needs precise exclusions; thresholds require observability cost and may evolve from evidence.
- **Whether it blocks implementation:** **No** for initial P0 security/correctness work; **yes** for performance qualification and beta release PASS.
- **Exact short approval wording George can use:** `D13: Approve the recommended initial beta SLOs and queue/partition review thresholds, subject to evidence-based revision.`

## Decision checklist — completed

```text
D1: Approved
D2: Approved
D3: Managed-workflow direction approved; provider selection not approved
D4: Approved
D5: Approved
D6: Approved as adjustable beta default
D7: Approved
D8: Provisionally approved; irreversible automated deletion gated
D9: Objective approved; production deletion activation gated
D10: Approved; legacy deletion requires separate founder approval
D11: Approved
D12: Approved; staging writes and production actions require separate approval
D13: Approved as evidence-revisable release goals
```
