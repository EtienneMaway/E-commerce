#!/usr/bin/env bash
#
# Dump a Postgres database to a gzipped plain-SQL file.
#
#   pnpm db:dump                      # dumps DATABASE_URL from apps/api/.env
#   pnpm db:dump "postgresql://..."   # dumps the URL you pass (e.g. Railway)
#
# Output: apps/api/backups/kmb_<host>_<timestamp>.sql.gz
#
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$API_DIR/backups"

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

command -v pg_dump >/dev/null || { echo "error: pg_dump not found on PATH" >&2; exit 1; }

# Label the file by host so Railway dumps and local dumps don't get confused.
HOST="$(printf '%s' "$URL" | sed -E 's#.*@([^:/]+).*#\1#' | tr -c 'a-zA-Z0-9' '-' | sed -E 's/-+$//')"
STAMP="$(date +%F_%H-%M-%S)"
OUT="$OUT_DIR/kmb_${HOST}_${STAMP}.sql.gz"

mkdir -p "$OUT_DIR"

echo "Dumping from : ${URL%%:*}://…@${HOST}"
echo "Writing to   : $OUT"

# --no-owner / --no-privileges: the source roles (e.g. Railway's) do not exist
#   on the target server. Without these, restore fails on every GRANT/OWNER TO.
# --clean --if-exists: the dump drops existing objects first, so restoring over
#   a non-empty database replaces it rather than colliding.
pg_dump \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=plain \
  --dbname="$URL" \
  | gzip > "$OUT"

echo
echo "Done: $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Restore it with:"
echo "  pnpm db:restore \"$OUT\" \"postgresql://user:pass@host:5432/db\""
