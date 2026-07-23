#!/usr/bin/env bash
#
# Wipe ALL DATA from every table while KEEPING the database, its schema, and the
# TypeORM migration history. Data only — no DROP. Destructive + irreversible.
#
#   pnpm db:reset                      # targets DATABASE_URL from apps/api/.env
#   pnpm db:reset "postgresql://..."   # targets the URL you pass
#
# It truncates every table in the `public` schema (RESTART IDENTITY CASCADE, so
# sequences reset and FK order doesn't matter) EXCEPT `migrations` /
# `typeorm_metadata` — those stay so the app boots without trying to re-run
# migrations against the existing schema.
#
# ALWAYS back up first:  pnpm db:dump
#
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$URL" && -f "$API_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$API_DIR/.env"
  set +a
  URL="${DATABASE_URL:-}"
fi

if [[ -z "$URL" ]]; then
  echo "error: no database URL." >&2
  echo "Pass one as an argument, or set DATABASE_URL in apps/api/.env" >&2
  exit 1
fi

command -v psql >/dev/null || { echo "error: psql not found on PATH" >&2; exit 1; }

HOST="$(printf '%s' "$URL" | sed -E 's#.*@([^:/]+).*#\1#')"
DB="$(printf '%s' "$URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"

echo "This will ERASE ALL DATA from every table in:"
echo "  host : $HOST"
echo "  db   : $DB"
echo
echo "Schema and migration history are KEPT. This CANNOT be undone."
echo "Back up first with:  pnpm db:dump"
echo
read -r -p "Type the database name ('$DB') to confirm: " ANSWER
if [[ "$ANSWER" != "$DB" ]]; then
  echo "Aborted — no changes made."
  exit 1
fi

psql "$URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE '
       || string_agg(format('%I.%I', schemaname, tablename), ', ')
       || ' RESTART IDENTITY CASCADE'
    INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('migrations', 'typeorm_metadata');

  IF stmt IS NULL THEN
    RAISE NOTICE 'No data tables found to truncate.';
  ELSE
    EXECUTE stmt;
    RAISE NOTICE 'Truncated all public tables (kept: migrations, typeorm_metadata).';
  END IF;
END $$;
SQL

echo
echo "Done. All table data cleared; schema + migration history intact."
