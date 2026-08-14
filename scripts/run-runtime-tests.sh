#!/usr/bin/env bash
# run-runtime-tests.sh
#
# Runs the Group B runtime integration tests (workerScenarios.test.ts)
# against the local disposable Supabase instance in Stage 3 state.
#
# Pipeline:
#   1. Reset local disposable DB to D11 baseline
#   2. Apply beta_foundation_v1.sql (historical migration)
#   3. Apply corrective migration (20260729120001_...)
#   4. Run workerScenarios.test.ts with RUN_DATABASE_TESTS=1
#
# SAFETY: Only touches the local disposable Supabase Docker instance.
# Never contacts the hosted production project.
# JWT keys are discovered at runtime from the running Kong container —
# no secrets are hardcoded in this file.
#
# Prerequisites:
#   - Local Supabase stack running (supabase start or docker compose)
#   - psql shim at /tmp/psql-shim/psql routing to Docker container
#   - python3 available (for JWT extraction from Kong config)
#
# Usage:
#   ./scripts/run-runtime-tests.sh

set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PSQL_SHIM="/tmp/psql-shim"
FIXTURE="$ROOT_DIR/validation/beta-foundation-v1/fixtures/d11-baseline.sql"
HISTORICAL="$ROOT_DIR/migrations/beta_foundation_v1.sql"
CORRECTIVE="$ROOT_DIR/migrations/20260729120001_generation_job_state_machine_schema.sql"
RUNTIME_TEST="src/lib/jobs/__tests__/workerScenarios.test.ts"

# ── Local disposable Supabase endpoints (NOT production) ───────────────────────
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
E2E_SUPABASE_URL="http://127.0.0.1:54321"
# JWT keys discovered at runtime — not hardcoded.
ANON_KEY=""
SERVICE_KEY=""

# ── Utilities ──────────────────────────────────────────────────────────────────
log()  { echo "[$(date -u +%H:%M:%S)] $*"; }
pass() { echo "[$(date -u +%H:%M:%S)] PASS: $*"; }
die()  { echo "[$(date -u +%H:%M:%S)] FAIL: $*" >&2; exit 1; }
sep()  { echo; echo "────────────────────────────────────────────────────────"; }

psql_exec() {
  PATH="$PSQL_SHIM:$PATH" psql "$DIRECT_URL" -v ON_ERROR_STOP=0 "$@"
}

psql_strict() {
  PATH="$PSQL_SHIM:$PATH" psql "$DIRECT_URL" -v ON_ERROR_STOP=1 "$@"
}

# ── JWT key discovery from running Kong container ──────────────────────────────
# Uses the Kong key_map as the canonical source for this local instance.
# sb_secret_* maps to service_role JWT; sb_publishable_* maps to anon JWT.
discover_local_jwt_keys() {
  sep
  log "Discovering JWT keys from local Supabase Kong container..."

  local kong_container
  kong_container=$(docker ps --format "{{.Names}}" | grep "supabase_kong" | head -1)
  if [[ -z "$kong_container" ]]; then
    die "No running Supabase Kong container found. Run: supabase start (or docker compose up)"
  fi

  local kong_config
  kong_config=$(docker exec "$kong_container" cat /home/kong/kong.yml 2>/dev/null)
  if [[ -z "$kong_config" ]]; then
    die "Failed to read Kong config from container: $kong_container"
  fi

  SERVICE_KEY=$(echo "$kong_config" | python3 -c "
import sys, re
config = sys.stdin.read()
m = re.search(r\"sb_secret_[A-Za-z0-9_-]+' and 'Bearer ([A-Za-z0-9._-]+)'\", config)
print(m.group(1) if m else '')
" 2>/dev/null)

  ANON_KEY=$(echo "$kong_config" | python3 -c "
import sys, re
config = sys.stdin.read()
m = re.search(r\"sb_publishable_[A-Za-z0-9_-]+' and 'Bearer ([A-Za-z0-9._-]+)'\", config)
print(m.group(1) if m else '')
" 2>/dev/null)

  if [[ -z "$SERVICE_KEY" ]]; then
    die "Could not extract service_role JWT from Kong config in $kong_container"
  fi
  if [[ -z "$ANON_KEY" ]]; then
    die "Could not extract anon JWT from Kong config in $kong_container"
  fi

  pass "JWT keys discovered from: $kong_container"
}

# ── Safety checks ──────────────────────────────────────────────────────────────
safety_checks() {
  sep
  log "Running safety checks..."

  if [[ "${SUPABASE_ACCESS_TOKEN:-}" != "" ]]; then
    die "SUPABASE_ACCESS_TOKEN is set — refusing to run (production risk)"
  fi
  if [[ "${RUN_DATABASE_TESTS:-}" == "1" ]]; then
    die "RUN_DATABASE_TESTS is already set in the calling environment. Unset it and let this script control it."
  fi
  if [[ "$DIRECT_URL" == *"ujwfkhvmpdmgjausnbre"* ]]; then
    die "Production Supabase project ref detected in DIRECT_URL"
  fi
  if [[ "$DIRECT_URL" == *".supabase.co"* ]]; then
    die "Hosted Supabase URL detected in DIRECT_URL"
  fi
  if ! command -v docker >/dev/null 2>&1; then
    die "docker not found — local Supabase stack not available"
  fi
  if ! docker ps --filter name=supabase_db 2>/dev/null | grep -q "supabase_db"; then
    die "supabase_db container not found. Run: supabase start"
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    die "python3 not found — required for JWT key extraction"
  fi
  if [[ ! -x "$PSQL_SHIM/psql" ]]; then
    die "psql shim not found at $PSQL_SHIM/psql"
  fi
  if [[ ! -f "$FIXTURE" ]]; then
    die "D11 fixture not found: $FIXTURE"
  fi
  if [[ ! -f "$HISTORICAL" ]]; then
    die "Historical migration not found: $HISTORICAL"
  fi
  if [[ ! -f "$CORRECTIVE" ]]; then
    die "Corrective migration not found: $CORRECTIVE"
  fi
  if [[ ! -f "$ROOT_DIR/$RUNTIME_TEST" ]]; then
    die "Runtime test not found: $ROOT_DIR/$RUNTIME_TEST"
  fi

  pass "Safety checks passed."
}

# ── DB reset to D11 baseline ───────────────────────────────────────────────────
reset_to_d11() {
  sep
  log "Resetting local DB to D11 baseline..."

  psql_exec -c "
    DROP POLICY IF EXISTS study_visuals_block_authenticated ON storage.objects;
    DROP POLICY IF EXISTS study_visuals_block_anon         ON storage.objects;
  " 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL" || true

  psql_exec -c "
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    ALTER SCHEMA public OWNER TO pg_database_owner;
    GRANT USAGE ON SCHEMA public TO PUBLIC;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;
  " 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL\|^drop cascades" || true

  log "Applying D11 fixture: $FIXTURE"
  psql_exec -f "$FIXTURE" 2>&1 \
    | grep -v "^NOTICE\|^HINT\|^DETAIL" \
    | grep -v "already exists\|does not exist" \
    || true

  psql_exec -c "
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT ALL ON TABLES TO postgres;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO postgres;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO postgres;
    REVOKE CREATE ON SCHEMA public FROM postgres;
  " 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL" || true

  psql_exec -c "
    UPDATE storage.buckets
    SET public = true, file_size_limit = null, allowed_mime_types = null
    WHERE id = 'study-visuals';
  " 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL" || true

  pass "DB reset to D11 baseline complete."
}

# ── Apply a migration (strict — fails on SQL error) ────────────────────────────
apply_migration() {
  local label="$1"
  local path="$2"
  sep
  log "Applying migration [$label]: $(basename "$path")"
  psql_strict -f "$path" 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL" || {
    die "Migration [$label] failed. See output above."
  }
  pass "Migration [$label] applied."
}

# ── Run the runtime integration test suite ─────────────────────────────────────
run_runtime_tests() {
  sep
  log "Running runtime integration tests: $RUNTIME_TEST"
  log "Group A (unit): always run"
  log "Group B (DB integration): RUN_DATABASE_TESTS=1"
  log "Group C (static): always run"

  RUN_DATABASE_TESTS=1 \
  DIRECT_URL="$DIRECT_URL" \
  DATABASE_URL="$DIRECT_URL" \
  E2E_SUPABASE_URL="$E2E_SUPABASE_URL" \
  E2E_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SECRET_KEY="$SERVICE_KEY" \
    npx vitest run \
      "$RUNTIME_TEST" \
      --reporter=verbose \
      2>&1
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
  echo
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║     MoLis Beta Foundation V1 — Runtime Integration Tests        ║"
  echo "║     workerScenarios.test.ts — Group B (49 DB tests)             ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo

  safety_checks
  discover_local_jwt_keys

  # Build Stage 3: D11 baseline → historical migration → corrective migration
  reset_to_d11
  apply_migration "#1 (historical)" "$HISTORICAL"
  apply_migration "corrective" "$CORRECTIVE"

  sep
  log "DB is in Stage 3 (post-corrective) state. Running tests..."

  run_runtime_tests
}

main
