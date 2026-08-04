# MoLis Migration Manifest
<!-- Round 8 item 15 — created 2026-08-01. Updated Round 15: 2026-08-04 -->
<!-- DERIVED / INFORMATIONAL ONLY. The sole authoritative source of truth is migrations/manifest.json. -->
<!-- This file is manually maintained for human readability. Any conflict with migrations/manifest.json -->
<!-- must be resolved in favour of migrations/manifest.json. Do not treat this file as canonical. -->

## Purpose

This file is a **derived, informational companion** to `migrations/manifest.json`, which is the sole
machine-readable authoritative source. Values in this file (checksums, status labels, evidence language)
are manually maintained summaries. If this file conflicts with `migrations/manifest.json`, the JSON file
is correct. Do not update this file in isolation — update `migrations/manifest.json` first.

**Evidence limitation (R8-H09):** Migration 1 execution is inferred from live catalogue shape —
no repository-owned application migration ledger proves when or how this file was executed.
"Catalogue consistent with file" is the correct evidence statement; "applied in production" is not.

---

## Migration 1 — Historical Baseline

| Field | Value |
|---|---|
| **File** | `migrations/beta_foundation_v1.sql` |
| **Status** | Immutable — never modify this file |
| **Classification** | Historical baseline |
| **SHA-256 checksum** | `d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b` |
| **Evidence source** | `sha256sum migrations/beta_foundation_v1.sql` (verified 2026-08-01) |
| **Execution status** | Catalogue consistent with this file; exact execution history unproven by a repository-owned application migration ledger. D11 read-only inspections confirmed the live schema shape matches what this file would produce. |
| **Security note** | This migration alone leaves authenticated users with FOR ALL table access on `generation_jobs` and `study_visuals`. MUST NOT be treated as independently secure. Migration 2 is the required security closure. |

---

## Migration 2 — Corrective Migration

| Field | Value |
|---|---|
| **File** | `migrations/20260729120001_generation_job_state_machine_schema.sql` |
| **Status** | Locally authored, not yet executed in any environment |
| **Classification** | Corrective migration — closes the authority gap left by Migration 1 |
| **SHA-256 checksum** | `8c917d8c5912e5742902d29c76b60bcabf9b816edfc8ba2720c6e5cee115e39f` (computed 2026-08-04 after Round 13 corrections) |
| **Evidence source** | Local static analysis only. No database parser, disposable-execution, or staging evidence exists. |
| **Execution status** | NOT executed. Requires George's explicit approval and a runbook before any execution. |
| **Database state dependency** | Requires Migration 1 to have been applied first. The migration's fail-closed preflight will reject execution unless the exact D11 baseline catalogue is present. |

---

## Fresh-Project Prerequisite Gap

The canonical prerequisite active-product schema predating `beta_foundation_v1.sql` is not yet
represented by a version-controlled MoLis migration. Fresh-project execution remains blocked
until that prerequisite baseline is captured and reviewed. This manifest therefore covers only
two of the migrations required for a deterministic fresh-project reproduction.

---

## Execution Order

```
? <prerequisite baseline — not yet version-controlled>

1. migrations/beta_foundation_v1.sql
   └── Immutable. SHA-256: d2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b
       Execution evidence: catalogue consistent; exact historical execution unproven.

2. migrations/20260729120001_generation_job_state_machine_schema.sql
   └── Corrective closure. NOT yet executed. Requires George's approval and a runbook.
       SHA-256: 8c917d8c5912e5742902d29c76b60bcabf9b816edfc8ba2720c6e5cee115e39f
```

---

## Immutability Rules

- **Migration 1** (`beta_foundation_v1.sql`): Permanently immutable.
- **Migration 2**: Immutable after first execution in any environment. Before execution it may be
  edited only through the approved local correction process with George's explicit approval.

---

## Evidence Classification

| Evidence type | Migration 1 | Migration 2 |
|---|---|---|
| Database parser executed | No | No |
| Disposable database execution | No | No |
| Staging environment execution | No | No |
| Production execution | Unproven by ledger; catalogue consistent | No |
| Live database inspection (D11) | Yes — schema shape consistent with file | Not applicable |
| Local static analysis | Yes | Yes — Rounds 5–13 corrections reviewed and applied; verified by local static test suite. No database parser or disposable execution has been performed. |

---

## Pending Requirements Before Migration 2 Execution

1. George's explicit approval for the exact environment and action
2. Approved maintenance window with enqueue disabled end-to-end
3. Runbook with backup and forward-recovery plan
4. Pre-execution verification that the live database matches the D11 baseline catalogue
5. Post-execution verification of all ACL postconditions in section 32 of the migration
6. Resolution of the fresh-project prerequisite gap

---

*Last updated: 2026-08-04 (Round 13 corrections applied). Authoritative source: migrations/manifest.json. Research/verification date: 2026-08-04.*
