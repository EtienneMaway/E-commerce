#!/usr/bin/env bash
#
# Point the API at the mobile release that is now live on Play, so installed
# apps start seeing the update banner. Run it on the VPS, after `eas submit`.
#
# The version name is read straight from apps/mobile/app.json (`expo.version`),
# the one source of truth for it, so it can never drift out of step with the
# build you actually shipped. You only pass the build number, which EAS holds
# remotely (`appVersionSource: "remote"`) and is not in app.json.
#
#   ./scripts/set-mobile-version.sh 6
#   ./scripts/set-mobile-version.sh 6 "Faster sales screen" "Écran des ventes plus rapide"
#
# Arguments:
#   1  build number  — `eas build:version:get --platform android`
#   2  release notes EN (optional)
#   3  release notes FR (optional)
#
# Env overrides: ENV_FILE  (default /var/www/ecommerce/apps/api/.env),
#                APP_JSON  (default <repo>/apps/mobile/app.json),
#                APP_VERSION (skip reading app.json and use this version name),
#                PM2_APP   (default kmb-api; set to "" to skip the restart)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-/var/www/ecommerce/apps/api/.env}"
APP_JSON="${APP_JSON:-$SCRIPT_DIR/../../mobile/app.json}"
PM2_APP="${PM2_APP-kmb-api}"

BUILD="${1:-}"
NOTES_EN="${2:-}"
NOTES_FR="${3:-}"

# The version name comes from app.json unless the caller pinned one explicitly.
read_app_version() {
  if command -v node >/dev/null 2>&1; then
    node -e 'const v=require(process.argv[1])?.expo?.version; if(!v)process.exit(1); process.stdout.write(String(v));' "$APP_JSON" 2>/dev/null && return 0
  fi
  # Fallback for a box without node: pull the first "version": "x.y.z" out.
  grep -Eo '"version"[[:space:]]*:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' "$APP_JSON" 2>/dev/null \
    | head -1 | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+'
}

if [[ -n "${APP_VERSION:-}" ]]; then
  VERSION="$APP_VERSION"
else
  [[ -f "$APP_JSON" ]] || {
    echo "no app.json at $APP_JSON — set APP_JSON=/path/to/app.json or pass APP_VERSION=x.y.z" >&2
    exit 1
  }
  VERSION="$(read_app_version || true)"
  [[ -n "$VERSION" ]] || { echo "could not read expo.version from $APP_JSON" >&2; exit 1; }
fi

if [[ -z "$BUILD" ]]; then
  echo "usage: $0 <build-number> [notes-en] [notes-fr]   (version name is read from app.json)" >&2
  exit 1
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.0.1, got '$VERSION'" >&2; exit 1; }
[[ "$BUILD" =~ ^[0-9]+$ ]] || { echo "build must be a whole number, got '$BUILD'" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "no env file at $ENV_FILE" >&2; exit 1; }

echo "Mobile release: version $VERSION (from ${APP_VERSION:+the APP_VERSION override}${APP_VERSION:-$APP_JSON}), build $BUILD"

cp -p "$ENV_FILE" "$ENV_FILE.bak"

# Rebuild the file rather than sed-ing in place: release notes are free text and
# would need escaping otherwise. Every unrelated line is preserved verbatim.
TMP="$(mktemp)"
grep -v -E '^(MOBILE_ANDROID_LATEST_VERSION|MOBILE_ANDROID_LATEST_BUILD|MOBILE_RELEASE_NOTES_EN|MOBILE_RELEASE_NOTES_FR)=' \
  "$ENV_FILE" > "$TMP" || true

{
  echo "MOBILE_ANDROID_LATEST_VERSION=$VERSION"
  echo "MOBILE_ANDROID_LATEST_BUILD=$BUILD"
  [[ -n "$NOTES_EN" ]] && echo "MOBILE_RELEASE_NOTES_EN=$NOTES_EN"
  [[ -n "$NOTES_FR" ]] && echo "MOBILE_RELEASE_NOTES_FR=$NOTES_FR"
} >> "$TMP"

chmod 600 "$TMP"
mv "$TMP" "$ENV_FILE"

echo "$ENV_FILE updated (previous copy at $ENV_FILE.bak):"
grep -E '^MOBILE_' "$ENV_FILE" | sed 's/^/  /'

# MIN_* are deliberately untouched — raising those blocks older installs behind
# a full-screen wall, which is never a side effect of shipping a release.
if [[ -n "$PM2_APP" ]]; then
  echo
  echo "Restarting $PM2_APP (the API reads .env at boot)…"
  pm2 restart "$PM2_APP"
fi
