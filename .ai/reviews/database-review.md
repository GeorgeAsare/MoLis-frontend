# MoLis Database Architecture Review

Use this template for an independent challenge of a database audit, migration plan, migration implementation, or completed Supabase change. The reviewer should seek evidence, not merely confirm that the proposal looks plausible.

## Review metadata

- Change or report reviewed:
- Branch and commit, if applicable:
- Specialist:
- Reviewer:
- Date:
- Review stage: analysis / pre-implementation / post-implementation / rollout
- Approved scope:
- Explicit exclusions:
- Production access performed: none / approved details

## Verdict

- Verdict: approve / approve with conditions / changes required / blocked on George
- Highest severity finding:
- Is the change safe to hand to Claude Code?
- Is the implementation safe to present to George for rollout approval?
- Conditions or blockers:

## 1. Product authority and inferred assumptions

- Does the work treat `molis-frontend` as the active product?
- Was the separate Express backend incorrectly treated as authoritative?
- Which requirements were observed directly and which were inferred?
- Are frontend types being mistaken for stronger evidence than actual queries and writes?
- Are any manual Supabase objects assumed to exist without migration coverage?
- Could a product behavior decision be hiding inside a technical recommendation?

Findings:

## 2. Missing or incorrect schema constraints

- Is every referenced table and column present with the correct type, nullability, and default?
- Do all application upsert conflict targets have exact unique constraints?
- Are case-insensitive or partial uniqueness rules missing?
- Are numeric, enum-like, JSON-shape, and timestamp invariants constrained appropriately?
- Could invalid state enter through a future client, script, or service even if the current UI prevents it?
- Are constraint names, validation timing, and compatibility with existing rows addressed?

Findings:

## 3. Cross-user data and relationship risks

- Can a row with User A's `user_id` reference User B's document, subject, recording, quiz, or other parent?
- Are independent `user_id` and entity foreign keys being mistaken for ownership consistency?
- Are composite ownership keys or parent-existence policy checks needed?
- Can client-supplied IDs escape tenant boundaries?
- Do cascades, `SET NULL`, and account deletion preserve the intended ownership and retention model?

Findings:

## 4. RLS review

- Is RLS enabled on every exposed application table?
- Are SELECT, INSERT, UPDATE, and DELETE considered independently?
- Does every INSERT/UPDATE policy have an explicit, correct `WITH CHECK`?
- Are parent ownership and child ownership both verified?
- Can anonymous users read or mutate anything unintentionally?
- Can authenticated users change `user_id` or parent identifiers to cross tenants?
- Is service-role behavior documented and kept server-only?
- Are immutable or append-only tables actually protected from update/delete?
- Could a permissive policy from an earlier migration combine with the new policy?

Findings:

## 5. Migration and upgrade risks

- Has any already-applied migration been modified?
- Does the proposed order respect all table, unique-key, foreign-key, function, bucket, and policy dependencies?
- Does `IF NOT EXISTS` conceal incompatible existing definitions?
- Are duplicate, null, orphaned, or invalid existing rows detected before constraints are enforced?
- Are data repair and DDL separated with appropriate approval gates?
- Could table rewrites, index builds, validation, or locks interrupt the beta product?
- Can a partially applied migration be identified and safely resumed?
- Does the complete migration chain reproduce a fresh database without manual dashboard setup?

Findings:

## 6. Destructive operations and lifecycle behavior

- Does any cascade delete more user work than the UI communicates?
- Do delete-then-insert replacement flows risk losing the last valid artifact?
- Does cleanup delete, merge, or rewrite existing user data?
- Are Storage objects orphaned by database deletes or vice versa?
- Are backups, target counts, recovery, and George's explicit approval required?
- Are retention and audit-history consequences of auth-user deletion understood?

Findings:

## 7. Performance and operational behavior

- Are indexes derived from actual filters, joins, ordering, range scans, and conflict targets?
- Are tenant keys first where query shapes require them?
- Are partial predicates aligned with application predicates?
- Are there redundant indexes or excessive write amplification?
- Could unbounded JSON, messages, memories, generated artifacts, or usage logs grow without an approved retention strategy?
- Are hot-path queries, polling, counts, and dashboard fan-out addressed?
- Do migration operations have acceptable lock and execution characteristics?

Findings:

## 8. Supabase Storage security

- Is each bucket's public/private status explicit and product-approved?
- Do signed URL versus public URL calls match bucket configuration?
- Are object names rooted in the authenticated user's ID?
- Are SELECT, INSERT, UPDATE/upsert, and DELETE policies minimally sufficient?
- Can User A enumerate, read, overwrite, or delete User B's objects?
- Are MIME allowlists and file-size limits compatible with real browser uploads?
- Is object replacement, orphan cleanup, retention, and recovery defined?
- Could public generated assets expose personal study content?

Findings:

## 9. Rollback and recovery gaps

- Is rollback genuinely possible after data transformation or constraint enforcement?
- Where rollback is unsafe, is forward recovery defined instead?
- Can old and new application versions coexist during rollout if needed?
- Can RLS or bucket policy rollback restore service without exposing data?
- Are backup, restore, validation, and abort criteria concrete?
- Is recovery tested in a non-production environment?

Findings:

## 10. Verification quality

- Is there a fresh-database migration test?
- Is there a populated upgrade-path test?
- Do tests use two authenticated users and anonymous access?
- Do tests attempt cross-user parent references, not just cross-user SELECT?
- Do Storage tests cover upload, signed/public read, overwrite/upsert, enumeration, and delete isolation?
- Are cascade, `SET NULL`, uniqueness, checks, and idempotent retry behavior tested?
- Are best-effort writes verified in the database instead of trusting a successful UI response?

Findings:

## 11. Unresolved product decisions for George

List every decision that cannot safely be inferred, including:

- Public versus private generated visuals.
- Account-deletion retention and audit requirements.
- Subject, recording, document, and derived-content deletion behavior.
- Duplicate-data cleanup or archival rules.
- Upload formats and size limits.
- Downtime or degraded-service tolerance.
- Rollback versus forward-recovery preference.
- Production inspection, migration execution, and deployment authorization.

Decisions required:

## Required changes before approval

1.

## Evidence required at the next review

- [ ] Version-controlled migration diff, with no applied migration edited.
- [ ] Schema and policy contract comparison.
- [ ] Fresh-database result.
- [ ] Populated upgrade result.
- [ ] Two-user and anonymous RLS result.
- [ ] Storage isolation result.
- [ ] Rollback or forward-recovery rehearsal.
- [ ] Confirmation that unrelated local edits remain untouched.
- [ ] George's decisions for all blocking product and production questions.
