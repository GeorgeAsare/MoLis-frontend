#!/usr/bin/env bash
# safe-commit.sh — build, lint, secret-check, commit, push
# Usage: ./scripts/safe-commit.sh "Your commit message"

set -euo pipefail

# ── 1. Require a commit message ───────────────────────────────────────────────

if [[ -z "${1:-}" ]]; then
  echo "ERROR: Commit message required."
  echo "Usage: ./scripts/safe-commit.sh \"Your commit message\""
  exit 1
fi

COMMIT_MSG="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo ""
echo "=== safe-commit.sh ==="
echo "Message: $COMMIT_MSG"
echo ""

# ── 2. Build ──────────────────────────────────────────────────────────────────

echo "--- npm run build ---"
if ! npm run build; then
  echo ""
  echo "BLOCKED: Build failed. Fix errors before committing."
  exit 1
fi
echo ""

# ── 3. Lint ───────────────────────────────────────────────────────────────────

echo "--- npm run lint ---"
if ! npm run lint; then
  echo ""
  echo "BLOCKED: Lint failed. Fix lint errors before committing."
  exit 1
fi
echo ""

# ── 4. Git status ─────────────────────────────────────────────────────────────

echo "--- git status ---"
git status
echo ""

# ── 5. Secret / forbidden file check ─────────────────────────────────────────
# Check all files that WOULD be staged by git add -A (tracked + untracked, minus ignored)

STAGED_PREVIEW="$(git add --dry-run -A 2>&1 || true)"

BLOCKED_FILES=()

# Block .env.local explicitly
if git ls-files --others --exclude-standard | grep -q '\.env\.local$' 2>/dev/null; then
  BLOCKED_FILES+=(".env.local (untracked env file)")
fi
if git diff --name-only HEAD 2>/dev/null | grep -q '\.env\.local$'; then
  BLOCKED_FILES+=(".env.local (modified)")
fi

# Block any .env* file that is NOT .env.example
while IFS= read -r f; do
  if [[ "$f" == .env* && "$f" != ".env.example" ]]; then
    BLOCKED_FILES+=("$f (env file with possible secrets)")
  fi
done < <(git ls-files --others --exclude-standard 2>/dev/null; git diff --name-only 2>/dev/null)

# Block .claude/ directory contents
if git ls-files --others --exclude-standard | grep -q '^\.claude/' 2>/dev/null; then
  BLOCKED_FILES+=(".claude/ (local Claude state — should be in .gitignore)")
fi

# Warn on files with secret-looking names
SUSPICIOUS=(
  "id_rsa" "id_dsa" "id_ed25519" "id_ecdsa"
  "*.pem" "*.p12" "*.pfx" "*.key" "credentials.json"
  "secrets.json" "service-account*.json"
)
for pattern in "${SUSPICIOUS[@]}"; do
  while IFS= read -r f; do
    BLOCKED_FILES+=("$f (suspicious filename: $pattern)")
  done < <(git ls-files --others --exclude-standard 2>/dev/null | grep -i "$pattern" || true)
done

if [[ ${#BLOCKED_FILES[@]} -gt 0 ]]; then
  echo "BLOCKED: The following files must not be committed:"
  for f in "${BLOCKED_FILES[@]}"; do
    echo "  • $f"
  done
  echo ""
  echo "Add them to .gitignore or remove them before committing."
  exit 1
fi

# ── 6. Stage safe changes ─────────────────────────────────────────────────────

echo "--- Staging changes ---"
# Stage tracked modified files and new untracked files (ignored files are excluded by -A)
git add -A

echo "--- Staged files ---"
git diff --cached --name-status
echo ""

# Double-check nothing secret slipped through after staging
STAGED_NAMES="$(git diff --cached --name-only)"
if echo "$STAGED_NAMES" | grep -qE '(^|/)\.env\.local$'; then
  echo "BLOCKED: .env.local is staged. Unstaging everything."
  git reset HEAD
  exit 1
fi
if echo "$STAGED_NAMES" | grep -qE '(^|/)\.env[^.]'; then
  echo "WARNING: An .env file (not .env.example) is staged — aborting."
  git reset HEAD
  exit 1
fi

# ── 7. Commit ─────────────────────────────────────────────────────────────────

echo "--- Committing ---"
git commit -m "$(cat <<EOF
$COMMIT_MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
echo ""

# ── 8. Push ───────────────────────────────────────────────────────────────────

echo "--- Pushing to origin main ---"
git push origin main
echo ""

# ── 9. Final status ───────────────────────────────────────────────────────────

echo "--- Final git status ---"
git status
echo ""
echo "=== Done ==="
echo "Commit: $(git log -1 --format='%H %s')"
