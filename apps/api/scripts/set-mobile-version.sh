#!/usr/bin/env bash
#
# Point the API at the mobile release that is now live on Play, so installed
# apps start seeing the update banner. Run it on the VPS, after `eas submit`.
#
#   ./scripts/set-mobile-version.sh 1.0.1 6
#   ./scripts/set-mobile-version.sh 1.0.1 6 "Faster sales screen" "Écran des ventes plus rapide"
#
# Arguments:
#   1  version name  — expo.version of the build you shipped (app.json)
#   2  build number  — `eas build:version:get --platform android`
#   3  release notes EN (optional)
#   4  release notes FR (optional)
#
# Env overrides: ENV_FILE (default /var/www/ecommerce/apps/api/.env),
#                PM2_APP  (default kmb-api; set to "" to skip the restart)
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-/var/www/ecommerce/apps/api/.env}"
PM2_APP="${PM2_APP-kmb-api}"

VERSION="${1:-}"
BUILD="${2:-}"
NOTES_EN="${3:-}"
NOTES_FR="${4:-}"

if [[ -z "$VERSION" || -z "$BUILD" ]]; then
  echo "usage: $0 <version-name> <build-number> [notes-en] [notes-fr]" >&2
  exit 1
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.0.1, got '$VERSION'" >&2; exit 1; }
[[ "$BUILD" =~ ^[0-9]+$ ]] || { echo "build must be a whole number, got '$BUILD'" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "no env file at $ENV_FILE" >&2; exit 1; }

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
