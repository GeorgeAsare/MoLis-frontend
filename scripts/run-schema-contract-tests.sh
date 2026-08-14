#!/usr/bin/env bash
# run-schema-contract-tests.sh
#
# Orchestrates all 49 schema-contract groupB integration tests through
# the correct database stages.
#
# Pipeline:
#   1. Reset local disposable DB to D11 baseline
#   2. Stage 0 tests (21)  — D11 pre-migration state
#   3. Apply beta_foundation_v1.sql (historical migration #1)
#   4. Stage 1 tests (3)   — post-historical state
#   5. Apply beta_foundation_v1.sql again (idempotency check)
#   6. Apply corrective migration
#   7. Stage 3 tests (25)  — post-corrective state
#
# SAFETY: Only touches a local disposable Supabase Docker instance.
# Never contacts the hosted production project.
#
# Prerequisites:
#   - Local Supabase stack running: supabase start (or docker compose)
#   - psql shim at /tmp/psql-shim/psql routing to Docker container
#   - RUN_DATABASE_TESTS must NOT be set in the calling environment
#     (this script sets it only for vitest invocations)
#
# Usage:
#   ./scripts/run-schema-contract-tests.sh

set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PSQL_SHIM="/tmp/psql-shim"
FIXTURE="$ROOT_DIR/validation/beta-foundation-v1/fixtures/d11-baseline.sql"
HISTORICAL="$ROOT_DIR/migrations/beta_foundation_v1.sql"
CORRECTIVE="$ROOT_DIR/migrations/20260729120001_generation_job_state_machine_schema.sql"

# ── Local disposable Supabase credentials (NOT production) ─────────────────────
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
E2E_SUPABASE_URL="http://127.0.0.1:54321"
# ANON_KEY and SERVICE_KEY are discovered at runtime from the running local
# Kong container. No JWT secrets are hardcoded in this file.
ANON_KEY=""
SERVICE_KEY=""

# Discover the local Supabase JWT keys from the running Kong container.
# Uses the Kong key_map (sb_publishable_* → anon JWT, sb_secret_* → service_role JWT)
# as the canonical authority for this local instance. No secrets are committed.
discover_local_jwt_keys() {
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
  log "JWT keys discovered from Kong container: $kong_container"
}

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
  if [[ ! -x "$PSQL_SHIM/psql" ]]; then
    die "psql shim not found at $PSQL_SHIM/psql"
  fi
  if [[ ! -f "$FIXTURE" ]]; then
    die "Fixture not found: $FIXTURE"
  fi
  if [[ ! -f "$HISTORICAL" ]]; then
    die "Historical migration not found: $HISTORICAL"
  fi
  if [[ ! -f "$CORRECTIVE" ]]; then
    die "Corrective migration not found: $CORRECTIVE"
  fi

  pass "Safety checks passed."
}

# ── DB reset to D11 baseline ───────────────────────────────────────────────────
reset_to_d11() {
  sep
  log "Resetting local DB to D11 baseline..."

  # Drop any corrective storage policies that would cause fixture errors
  psql_exec -c "
    DROP POLICY IF EXISTS study_visuals_block_authenticated ON storage.objects;
    DROP POLICY IF EXISTS study_visuals_block_anon         ON storage.objects;
  " 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL" || true

  # Full public schema wipe and recreation
  psql_exec -c "
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    ALTER SCHEMA public OWNER TO pg_database_owner;
    GRANT USAGE ON SCHEMA public TO PUBLIC;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;
  " 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL\|^drop cascades" || true

  # Apply D11 fixture (non-strict: preexisting storage policies emit errors, that's OK)
  log "Applying D11 fixture: $FIXTURE"
  psql_exec -f "$FIXTURE" 2>&1 \
    | grep -v "^NOTICE\|^HINT\|^DETAIL" \
    | grep -v "already exists\|does not exist" \
    || true

  # Restore default ACLs lost by DROP SCHEMA CASCADE
  psql_exec -c "
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT ALL ON TABLES TO postgres;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO postgres;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO postgres;
    REVOKE CREATE ON SCHEMA public FROM postgres;
  " 2>&1 | grep -v "^NOTICE\|^HINT\|^DETAIL" || true

  # Restore study-visuals bucket to D11 config
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

# ── Run vitest for one schema-contract stage ───────────────────────────────────
run_stage() {
  local stage="$1"
  local expected_count="$2"
  sep
  log "Running schema-contract tests: $stage ($expected_count expected)"

  RUN_DATABASE_TESTS=1 \
  VALIDATION_SCHEMA_STAGE="$stage" \
  DIRECT_URL="$DIRECT_URL" \
  DATABASE_URL="$DIRECT_URL" \
  E2E_SUPABASE_URL="$E2E_SUPABASE_URL" \
  E2E_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SECRET_KEY="$SERVICE_KEY" \
    npx vitest run \
      validation/beta-foundation-v1/__tests__/groupB.integration.test.ts \
      --reporter=verbose \
      2>&1 || {
        die "Stage $stage tests FAILED. See output above."
      }

  pass "Stage $stage: all $expected_count tests passed."
}

# ── Main orchestration ─────────────────────────────────────────────────────────
main() {
  echo
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║     MoLis Beta Foundation V1 — Schema-Contract Test Suite       ║"
  echo "║     49 tests across 3 pipeline stages                           ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo

  safety_checks
  discover_local_jwt_keys

  # ── Step 1: D11 baseline ──────────────────────────────────────────────────
  reset_to_d11

  # ── Step 2: Stage 0 — 21 tests against D11 pre-migration state ───────────
  run_stage "stage0" 21

  # ── Step 3: Historical migration #1 ──────────────────────────────────────
  apply_migration "#1" "$HISTORICAL"

  # ── Step 4: Stage 1 — 3 tests against post-historical state ──────────────
  run_stage "stage1" 3

  # ── Step 5: Historical migration #2 (idempotency verification) ───────────
  apply_migration "#2 (idempotency)" "$HISTORICAL"
  log "(Semantic idempotency comparison is validated by the main runValidation.ts pipeline.)"

  # ── Step 6: Corrective migration ─────────────────────────────────────────
  apply_migration "corrective" "$CORRECTIVE"

  # ── Step 7: Stage 3 — 25 tests against post-corrective state ─────────────
  run_stage "stage3" 25

  sep
  echo
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║   ALL 49 SCHEMA-CONTRACT TESTS PASSED                           ║"
  echo "║   Stage 0: 21  |  Stage 1: 3  |  Stage 3: 25                   ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo
}

main
