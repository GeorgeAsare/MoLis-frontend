@AGENTS.md

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
