#!/usr/bin/env bash
#
# Restore a dump produced by db-dump.sh into a Postgres database.
#
#   pnpm db:restore backups/kmb_x_2026-07-17.sql.gz                      # into DATABASE_URL
#   pnpm db:restore backups/kmb_x_2026-07-17.sql.gz "postgresql://..."   # into the URL you pass
#
# DESTRUCTIVE: the dump drops existing objects before recreating them.
#
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "error: no dump file given." >&2
  echo "usage: pnpm db:restore <file.sql.gz> [target-database-url]" >&2
  exit 1
fi
[[ -f "$FILE" ]] || { echo "error: no such file: $FILE" >&2; exit 1; }

URL="${2:-${DATABASE_URL:-}}"
if [[ -z "$URL" && -f "$API_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$API_DIR/.env"
  set +a
  URL="${DATABASE_URL:-}"
fi

if [[ -z "$URL" ]]; then
  echo "error: no target database URL." >&2
  echo "Pass one as the second argument, or set DATABASE_URL in apps/api/.env" >&2
  exit 1
fi

command -v psql >/dev/null || { echo "error: psql not found on PATH" >&2; exit 1; }

HOST="$(printf '%s' "$URL" | sed -E 's#.*@([^:/]+).*#\1#')"
DB="$(printf '%s' "$URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"

echo "Restoring : $FILE"
echo "Into      : ${DB} on ${HOST}"
echo
echo "This DROPS and recreates every table in that database."
read -r -p "Type 'yes' to continue: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }

# ON_ERROR_STOP=1 makes psql fail loudly on the first error instead of plowing
# through and leaving a half-restored database that looks fine.
gunzip -c "$FILE" | psql -v ON_ERROR_STOP=1 --dbname="$URL"

echo
echo "Restore complete."
echo "Verify with:  psql \"$URL\" -c '\\dt'"
