# MoLis Intelligence AI Engineering Team

## Purpose

This playbook defines how AI-assisted engineering work is governed for MoLis Intelligence. It applies to product, application, database, authentication, storage, infrastructure, security, testing, and operational changes.

`molis-frontend` is the active MoLis product. Its current application behavior is the primary source for discovering product requirements. Supabase is the active database, authentication, Row Level Security (RLS), and Storage platform. A separate or older Express backend may provide historical context, but it is not automatically authoritative and must not override active frontend requirements without an explicit product decision.

## Decision authority

George is the product owner and final decision maker. George approves product behavior, security trade-offs, destructive operations, production access, rollout plans, and production deployment.

AI agents do not replace this authority:

- Codex agents analyse the repository, identify risks, decompose work, propose contracts and plans, and review proposed or completed changes.
- Claude Code will later implement work that George has approved and that has a sufficiently precise specialist handoff.
- Specialists and reviewers advise. They do not silently settle unresolved product decisions.

## Required delivery flow

Every major change follows this sequence:

1. **Specialist analysis** — the relevant specialist inspects the active product, states evidence and assumptions, defines the required production-level outcome, and proposes safely separated tasks.
2. **Independent review** — a reviewer challenges assumptions, omissions, security boundaries, destructive effects, upgrade safety, test coverage, rollback, and unresolved decisions.
3. **Implementation** — Claude Code implements only the approved scope on a non-`main` branch, preserving unrelated local work and following the specialist handoff.
4. **Post-implementation review** — a reviewer compares the implementation with the approved contract, verifies tests and migration safety, and reports deviations or residual risks.
5. **George approval** — George decides whether the result may be merged, rolled out, or returned for revision.

If implementation reveals a material new decision, the flow returns to specialist analysis or George rather than expanding scope automatically.

## Engineering principles

- Fixes must be production-level and app-wide. Never hardcode a fix for one user, one document, one row identifier, or one observed data sample.
- Security and tenant isolation are system properties, not UI conventions.
- Database and Storage contracts must be reproducible from version-controlled migrations.
- Schema drift is a current high-priority risk. Manual dashboard state is not a substitute for a migration.
- Never modify a migration that may already have been applied. Correct it with a new, forward-only migration.
- Preserve unrelated local edits. In particular, existing changes in `.gitignore` and `playwright.config.ts` must not be overwritten, reformatted, staged, or reverted unless George explicitly brings them into scope.
- Prefer evidence from active application reads, writes, conflict targets, authentication flows, Storage paths, and tests over legacy assumptions.
- Every change must include proportionate verification, negative security tests, and an explicit rollback or forward-recovery strategy.

## Branch, production, and access controls

- No direct work on `main`.
- Never commit directly to `main`; use a dedicated reviewable branch.
- No autonomous production deployment.
- No production SQL execution, production data access, schema inspection, bucket mutation, policy mutation, or migration application without George's explicit approval for the exact environment and action.
- No destructive database or Storage action without a reviewed target set, backup or recovery plan, and explicit approval.
- Approval to analyse or write migration files is not approval to execute them.

## Definition of a complete handoff

A handoff must identify the active-product evidence, desired contract, affected files and systems, ordered implementation tasks, dependencies, safe parallel work, validation commands, security tests, upgrade and rollback strategy, and every question that still requires George's decision. The implementer must not be expected to infer critical database behavior from informal conversation.
