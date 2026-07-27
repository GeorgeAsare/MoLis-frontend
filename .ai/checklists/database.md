# MoLis Database Change Checklist

Use this checklist for every MoLis Supabase audit, migration design, implementation review, and rollout proposal. Mark an item `N/A` only with a written reason.

## Product authority and evidence

- [ ] Confirm `molis-frontend` is being treated as the active product.
- [ ] Record every relevant frontend query, mutation, upsert conflict target, auth dependency, and Storage operation.
- [ ] Treat the separate Express backend only as historical context unless George explicitly approves it as authoritative for the change.
- [ ] Identify differences between application expectations, version-controlled migrations, and any approved environment evidence.
- [ ] State all inferred assumptions and unresolved product decisions.

## Tables and columns

- [ ] Every required table is represented in a version-controlled migration.
- [ ] Every application-referenced column is present.
- [ ] Column names and PostgreSQL types match all reads and writes.
- [ ] Nullability reflects actual lifecycle states, not convenient defaults.
- [ ] Defaults are explicit and safe for both new and upgraded rows.
- [ ] Primary keys and generated identifiers are defined.
- [ ] Timestamp semantics and time zones are consistent.
- [ ] JSONB columns have appropriate object or array defaults and structural checks where stable.
- [ ] Enumerated text fields have approved check constraints.
- [ ] Numeric ranges, counters, scores, durations, and ordering positions have check constraints.

## Relationships and lifecycle

- [ ] Every foreign key target exists before the dependent constraint is added.
- [ ] User-owned tables reference `auth.users` with approved account-deletion behavior.
- [ ] Document, subject, recording, quiz, and derived-content ownership cannot be mismatched across users.
- [ ] Composite ownership foreign keys are used where separate IDs and `user_id` could diverge.
- [ ] `ON DELETE` behavior is specified for every foreign key.
- [ ] `ON UPDATE` behavior is specified or deliberately left at the safe default.
- [ ] Cascades cannot unexpectedly destroy derived student work.
- [ ] `SET NULL` columns are nullable and do not leave misleading application state.
- [ ] Retention and audit requirements are documented for user deletion.

## Indexes, uniqueness, and constraints

- [ ] Every primary key and unique business key is defined.
- [ ] Every frontend `onConflict` target exactly matches a unique or exclusion constraint.
- [ ] Case-insensitive uniqueness is handled where product behavior requires it.
- [ ] Partial uniqueness is used for conditional identities such as non-null source entities.
- [ ] Foreign-key columns have supporting indexes when needed.
- [ ] Indexes support actual user, document, subject, status, date-range, and ordering query shapes.
- [ ] Partial indexes match their query predicates.
- [ ] Redundant or write-amplifying indexes have been removed from the proposal.
- [ ] Check constraints are named, testable, and compatible with existing data.

## RLS and authentication

- [ ] RLS is enabled on every application table.
- [ ] RLS is forced where appropriate and owner/service bypass assumptions are documented.
- [ ] SELECT, INSERT, UPDATE, and DELETE permissions are considered separately.
- [ ] Every allowed INSERT and UPDATE has an explicit `WITH CHECK` condition.
- [ ] Policies use `auth.uid()` and enforce row ownership.
- [ ] Derived rows also validate ownership of the referenced parent entity.
- [ ] Anonymous access is denied unless explicitly approved.
- [ ] The application does not rely solely on client-supplied `user_id` values.
- [ ] Service-role access is limited, documented, and never exposed to the browser.
- [ ] Immutable tables deny UPDATE and DELETE to normal users.

## Supabase Storage

- [ ] Every required bucket is created or reconciled through version-controlled migration logic.
- [ ] Public versus private visibility is an explicit approved decision.
- [ ] Object paths use a canonical authenticated user prefix.
- [ ] SELECT, INSERT, UPDATE, and DELETE object policies are separately evaluated.
- [ ] Policies verify the first path segment against `auth.uid()`.
- [ ] Upsert workflows have the required UPDATE permission.
- [ ] Signed URL and public URL expectations match bucket visibility.
- [ ] MIME allowlists match active browser behavior.
- [ ] File-size limits and supported formats are approved.
- [ ] Object deletion, orphan cleanup, replacement, and retention behavior are defined.
- [ ] One user cannot enumerate, read, overwrite, or delete another user's objects.

## Migration order and upgrade safety

- [ ] The change is a new forward-only migration; no already-applied migration is edited.
- [ ] Extensions and shared functions precede dependent objects.
- [ ] Parent tables and unique targets precede foreign keys.
- [ ] Tables and RLS policies are delivered without an avoidable unprotected interval.
- [ ] Buckets precede their object policies.
- [ ] Data backfill or cleanup is separated from destructive constraint enforcement.
- [ ] Existing duplicates, nulls, invalid enum values, and orphaned references have preflight detection plans.
- [ ] `IF NOT EXISTS` is not being used to conceal incompatible existing definitions.
- [ ] Large-table locks, rewrites, index build duration, and downtime risk are assessed.
- [ ] Constraints can be added and validated safely on populated tables.
- [ ] Concurrent tasks do not alter the same objects or depend on uncommitted prerequisites.
- [ ] The exact execution order and genuine parallel tasks are documented.

## Recovery and reproducibility

- [ ] A rollback or forward-recovery strategy exists for every migration stage.
- [ ] Irreversible operations have backup, restore, or archival plans and explicit human approval.
- [ ] Failed partial application can be detected and safely resumed.
- [ ] Storage changes include recovery behavior where object access could be interrupted.
- [ ] A fresh Supabase database can be built entirely from version-controlled migrations.
- [ ] The upgrade path from the known existing beta state is tested separately from a fresh install.
- [ ] Generated schema or type artifacts, if used, are regenerated and reviewed.

## Isolation and application verification

- [ ] Two authenticated users are created in a non-production test environment.
- [ ] User A can perform every intended operation on User A's rows and objects.
- [ ] User A cannot select, insert against, update, or delete User B's rows.
- [ ] User A cannot reference User B's document, subject, recording, quiz, or Storage path from an otherwise User A-owned row.
- [ ] User A cannot obtain a signed URL for or overwrite User B's object.
- [ ] Anonymous access is tested and denied where required.
- [ ] Upserts, replacements, cascades, `SET NULL`, and account deletion behave as designed.
- [ ] Fresh-database application smoke tests pass.
- [ ] Upgrade-database application persistence tests pass.
- [ ] Silent best-effort writes are checked for actual persistence.

## Human approval gates

- [ ] George has approved unresolved public/private Storage decisions.
- [ ] George has approved deletion, cascade, retention, and audit-history behavior.
- [ ] George has approved any destructive cleanup or transformation of existing data.
- [ ] George has approved any production catalog or data access.
- [ ] George has approved downtime or degraded-service risk.
- [ ] George has approved production migration execution and deployment separately from code review.
- [ ] Work is on a non-`main` branch and no autonomous deployment is planned.
- [ ] Existing unrelated edits, including `.gitignore` and `playwright.config.ts`, remain untouched.
