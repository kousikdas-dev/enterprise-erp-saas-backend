#!/usr/bin/env bash
#
# Regression test for the inventory-service `opening_stock` migration fix
# (apps/inventory-service/prisma/migrations/20260921134320_opening_stock).
#
# Background: that migration's sequence-seeding `setval()` call used to
# fail on a completely empty `stock_movements` table (Postgres rejects
# `setval(seq, 0)` as out of bounds), which broke both a fresh
# `prisma migrate deploy` and every `prisma migrate dev` invocation's
# shadow-database replay. The fix uses the 3-argument `setval()` form. This
# script proves both the empty-table and populated-table cases behave
# correctly against real, throwaway Postgres databases — never the shared
# `inventory_db`/`production_db`.
#
# Prerequisites:
#   - Run from anywhere inside the repository (the script locates the repo
#     root itself).
#   - The local docker-compose Postgres container must already be running
#     and reachable — i.e. `docker compose up -d postgres` (or the full
#     stack) has been done, exposing erp/erp_local_only on localhost:15432.
#     This script does not start, stop, or rebuild any container.
#   - `npx prisma` must resolve (run `npm install` once if needed).
#
# Usage (from the repo root or anywhere else):
#   ./scripts/verify-inventory-fresh-migration.sh
#
# Optional environment overrides (defaults match docker-compose.yml):
#   PG_CONTAINER      (default: erp-postgres)
#   POSTGRES_USER     (default: erp)
#   POSTGRES_PASSWORD (default: erp_local_only)
#   POSTGRES_PORT     (default: 15432)
#
# What it does:
#   1. Creates a brand-new, uniquely-named, throwaway database and runs
#      `prisma migrate deploy` for inventory-service against it from
#      absolute zero (the real schema + the full, real migration history —
#      no manual intervention, no resolve, no reset).
#   2. Asserts the deploy succeeded and `prisma migrate status` reports
#      "Database schema is up to date!".
#   3. Asserts `nextval()` on the freshly-created sequence returns 1 — the
#      empty-table case the original bug could not handle.
#   4. Creates a SECOND throwaway database, applies only the migrations
#      that precede `opening_stock`, seeds one pre-existing stock_movements
#      row (simulating a database that already had activity before this
#      migration first ran — the condition the shared inventory_db was
#      already in), then applies `opening_stock` and asserts `nextval()`
#      returns 2 (MAX + 1) — proving the fix is behavior-preserving for the
#      populated-table case.
#   5. Drops only the two databases this run created, even on failure, and
#      refuses to drop anything whose name doesn't match this run's own
#      generated identifier.
#
# This script never runs `prisma migrate reset` or `prisma migrate
# resolve`, never writes to `_prisma_migrations` directly, never connects
# to `inventory_db`/`production_db`, and never touches any container.

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_CONTAINER="${PG_CONTAINER:-erp-postgres}"
PG_USER="${POSTGRES_USER:-erp}"
PG_PASSWORD="${POSTGRES_PASSWORD:-erp_local_only}"
PG_HOST_PORT="${POSTGRES_PORT:-15432}"
SCHEMA_PATH="apps/inventory-service/prisma/schema.prisma"
MIGRATIONS_DIR="apps/inventory-service/prisma/migrations"

RUN_ID="$(date +%s)_$$_${RANDOM}"
EMPTY_DB="inv_mig_regress_empty_${RUN_ID}"
POPULATED_DB="inv_mig_regress_populated_${RUN_ID}"
CREATED_DBS=()

log()  { echo "[verify-inventory-fresh-migration] $*"; }
fail() { echo "[verify-inventory-fresh-migration] FAIL: $*" >&2; exit 1; }

# Refuses to drop anything that isn't a name THIS invocation generated
# (inv_mig_regress_<empty|populated>_<this run's RUN_ID>), never a
# caller-supplied or pre-existing name — in particular, never
# inventory_db/production_db.
safe_drop_db() {
  local db="$1"
  case "$db" in
    inv_mig_regress_*"_${RUN_ID}")
      log "cleanup: dropping throwaway database $db"
      docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
        -c "DROP DATABASE IF EXISTS \"$db\";" >/dev/null
      ;;
    *)
      echo "[verify-inventory-fresh-migration] REFUSING to drop '$db' — does not match this run's generated identifier ($RUN_ID)" >&2
      return 1
      ;;
  esac
}

cleanup() {
  local status=$?
  for db in ${CREATED_DBS[@]+"${CREATED_DBS[@]}"}; do
    safe_drop_db "$db" || true
  done
  if [ "$status" -eq 0 ]; then
    log "cleanup complete, all checks passed."
  else
    log "cleanup complete after a failure (exit $status)."
  fi
  exit "$status"
}
trap cleanup EXIT

db_url() {
  echo "postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_HOST_PORT}/$1?schema=public"
}

apply_sql_file() {
  local db="$1" file="$2"
  cat "$file" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 >/dev/null
}

apply_sql_stdin() {
  local db="$1"
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 >/dev/null
}

query_value() {
  local db="$1" sql="$2"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -At -v ON_ERROR_STOP=1 -c "$sql"
}

echo
log "=== [1/2] Fresh/empty database: full 'prisma migrate deploy' from zero ==="
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$EMPTY_DB\";" >/dev/null
CREATED_DBS+=("$EMPTY_DB")

DATABASE_URL="$(db_url "$EMPTY_DB")" npx prisma migrate deploy --schema="$SCHEMA_PATH"

STATUS_OUTPUT="$(DATABASE_URL="$(db_url "$EMPTY_DB")" npx prisma migrate status --schema="$SCHEMA_PATH" 2>&1)" || true
echo "$STATUS_OUTPUT"
case "$STATUS_OUTPUT" in
  *"Database schema is up to date!"*) ;;
  *) fail "migrate status did not report 'up to date' for $EMPTY_DB" ;;
esac

NEXT_EMPTY="$(query_value "$EMPTY_DB" "SELECT nextval('\"stock_movements_sequenceNumber_seq\"');")"
log "nextval() on the empty-table sequence: $NEXT_EMPTY"
[ "$NEXT_EMPTY" = "1" ] || fail "expected nextval()=1 on an empty table, got '$NEXT_EMPTY'"
log "PASS: fresh empty-database deploy succeeded and the sequence seeded correctly (1)."
echo

log "=== [2/2] Populated-table fixture: behavior-preserving check ==="
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$POPULATED_DB\";" >/dev/null
CREATED_DBS+=("$POPULATED_DB")

PRE_MIGRATIONS=(
  "20260818180000_inventory_domain_v1"
  "20260819130000_stock_receipt_applications"
  "20260821120538_product_units"
  "20260821122554_product_master_fields"
)
for m in "${PRE_MIGRATIONS[@]}"; do
  log "applying pre-existing migration $m"
  apply_sql_file "$POPULATED_DB" "$MIGRATIONS_DIR/$m/migration.sql"
done

log "seeding one pre-existing stock_movements row (simulates an already-active database)"
apply_sql_stdin "$POPULATED_DB" <<'EOF'
INSERT INTO categories (id, "tenantId", name, "updatedAt") VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Cat', now());
INSERT INTO units_of_measure (id, "tenantId", code, name, "updatedAt") VALUES
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'EA', 'Each', now());
INSERT INTO warehouses (id, "tenantId", code, name, "updatedAt") VALUES
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'WH1', 'Main', now());
INSERT INTO products (id, "tenantId", sku, name, "categoryId", "unitOfMeasureId", "sellingPrice", "costPrice", "updatedAt") VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'SKU1', 'Prod', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '10', '5', now());
INSERT INTO stock_movements (id, "tenantId", "productId", "warehouseId", type, quantity, "createdBy") VALUES
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'OPENING', '10', '77777777-7777-7777-7777-777777777777');
EOF

log "applying the (fixed) opening_stock migration against the populated table"
apply_sql_file "$POPULATED_DB" "$MIGRATIONS_DIR/20260921134320_opening_stock/migration.sql"

NEXT_POPULATED="$(query_value "$POPULATED_DB" "SELECT nextval('\"stock_movements_sequenceNumber_seq\"');")"
log "nextval() on the populated-table sequence (1 pre-existing row): $NEXT_POPULATED"
[ "$NEXT_POPULATED" = "2" ] || fail "expected nextval()=2 (MAX+1) with one pre-existing row, got '$NEXT_POPULATED'"
log "PASS: populated-table behavior is unchanged — sequence correctly seeded past the real backfilled maximum (2)."
echo

log "ALL CHECKS PASSED."
