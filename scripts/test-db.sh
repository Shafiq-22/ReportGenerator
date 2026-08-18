#!/usr/bin/env bash
#
# Applies every migration to a throwaway database and runs the RLS assertions.
#
# Catches bad SQL and, more importantly, security regressions: a policy change
# that quietly lets a viewer write, or one author edit another's report.
#
# Usage:
#   ./scripts/test-db.sh                 # uses a local postgres via `sudo -u postgres`
#   PSQL="psql postgres://..." ./scripts/test-db.sh   # or point at any database
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-rg_test}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  # CI path: a postgres service container is already running. Everything after
  # this must talk to the freshly created test database, not the maintenance one.
  ADMIN_URL="$DATABASE_URL"
  TARGET_URL="${DATABASE_URL%/*}/$DB_NAME"
  run() { psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q "$@"; }
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q \
    -c "DROP DATABASE IF EXISTS $DB_NAME;" -c "CREATE DATABASE $DB_NAME;"
else
  # Local path: use the system postgres superuser.
  run() { sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -q "$@"; }
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q \
    -c "DROP DATABASE IF EXISTS $DB_NAME;" -c "CREATE DATABASE $DB_NAME;"
fi

echo "→ bootstrapping Supabase-shaped stubs"
run < "$ROOT/supabase/tests/bootstrap.sql" > /dev/null

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ applying $(basename "$migration")"
  run < "$migration" > /dev/null
done

echo "→ running RLS assertions"
run < "$ROOT/supabase/tests/rls.test.sql"

echo "✓ database tests passed"
