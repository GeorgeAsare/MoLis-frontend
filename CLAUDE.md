@AGENTS.md
@.ai/playbook/FOUNDER_DIRECTIVES.md
@.ai/playbook/AI_TEAM.md

---

# MoLis Governing Documents

## Authority and Governance

**George** is the founder, product owner, final decision-maker, and final approval authority for MoLis Intelligence. No agent, reviewer, or contributor may override, narrow, weaken, or silently reinterpret his directives.

The following two documents are permanent governing sources and must be read before planning, implementing, reviewing, or recommending any major work:

- **`@.ai/playbook/FOUNDER_DIRECTIVES.md`** — George's permanent product vision, mission, quality standards, security ambitions, scaling targets, and engineering requirements. These are not optional suggestions.
- **`@.ai/playbook/AI_TEAM.md`** — The authority model, required delivery flow (specialist → review → implementation → post-implementation review → George approval), implementation principles, branch and production controls, and definition of a complete handoff.

If any instruction in this file, AGENTS.md, or a task description conflicts with the governing documents, the conflict must be raised to George rather than resolved silently.

## Required Standards for Every Session

### Recommendations
- Provide advanced, forward-looking recommendations — not the minimum that satisfies the immediate request.
- When current information would improve a recommendation, use available internet research.
- Prefer official documentation, primary sources, current standards, and reputable security guidance over training-data assumptions.
- Record the date of any time-sensitive research so its currency can be judged.

### Claim Classification
Every response involving non-trivial decisions must clearly distinguish:
1. **Founder directives** — what George's governing documents require
2. **Repository-confirmed facts** — evidence from code, tests, config, migrations, or git history
3. **Internet-researched facts** — findings from external sources (cite source + date)
4. **Professional recommendations** — engineering judgement with rationale and trade-offs
5. **Assumptions** — unverified inferences, labelled as such
6. **Decisions requiring George's approval** — anything that needs founder sign-off before proceeding

### Production Safety
- Do **not** commit, push, or deploy without completing all quality gates.
- Do **not** execute production SQL, apply migrations, or modify production data without George's explicit approval for that exact environment and action.
- Do **not** modify production access controls, RLS policies, storage buckets, or authentication configuration autonomously.
- Approval to write a migration file is **not** approval to execute it.

### Engineering Quality
- All fixes must be production-level and app-wide — never hardcode a solution for one user, document, recording, or test case.
- Prioritise: **privacy → security → correctness → reliability → performance → scalability → maintainability → accessibility → cross-platform readiness**.
- Never knowingly ship a broken feature. Known defects that compromise functionality, safety, security, privacy, or data integrity must block release or be explicitly accepted by George with full disclosure.
- Long-term maintainability takes priority over quick hacks. Any unavoidable temporary measure must be identified as temporary, documented, and scheduled for durable resolution.

---

# Workflow Rules

## Auto-Commit After Every Milestone

After every completed coding task, Claude must:

1. Run `git status` — inspect all modified and untracked files
2. Run `npm run build` — confirm no TypeScript or compilation errors
3. Run `npm run lint` — confirm no lint failures
4. Inspect what is staged/untracked — confirm no secrets, no `.env.local`, no `.claude/`, no `node_modules`, no `.next/`, no build output
5. Stage safe project changes (never `git add -A` blindly — check first)
6. Commit with a clear, descriptive message
7. Push to `origin main`
8. Report: commit hash, push result, and clean working tree status

**Rules:**
- If build or lint fails: do NOT commit. Fix the issue first or report the failure clearly.
- If changes are experimental, incomplete, or risky: ask before committing.
- Never commit: `.env.local`, `.env*` files with real values, `.claude/`, `node_modules/`, `.next/`, API keys, or secrets.
- `.env.example` with placeholder values only is safe to commit.
- Use `scripts/safe-commit.sh "<message>"` as the standard commit path.

## Safe Commit Script

```bash
./scripts/safe-commit.sh "Your commit message here"
```

The script blocks on: build failure, lint failure, secrets detected, `.env.local` staged.
