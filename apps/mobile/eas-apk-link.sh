#!/usr/bin/env bash
#
# eas-apk-link.sh — build the app on EAS Build (cloud) and print the DIRECT
# artifact download link, e.g.
#
#     https://expo.dev/artifacts/eas/IsDNZCqaRBZEPxzNTKh3-eEJsILwtNcPBCOFAzaZMJU.apk
#
# ...NOT the build-details page URL
# (https://expo.dev/accounts/.../projects/.../builds/<id>), which can't be
# tapped-to-install on a phone.
#
# Why `preview` is the default profile:
#   - `preview`    → buildType=apk  → an INSTALLABLE .apk  (bakes the Railway prod API URL)
#   - `production` → buildType=app-bundle → an .aab (Play Store upload format) that
#                    CANNOT be sideloaded. Its artifact link is a dead-on-arrival .aab.
# So for a shareable link you hand to POS devices, use `preview` (the default).
#
# Usage:
#   cd apps/mobile && ./eas-apk-link.sh                # profile: preview  (installable .apk)
#   cd apps/mobile && ./eas-apk-link.sh production     # profile: production (.aab — link printed but NOT installable)
#
# Requires: eas-cli (logged in — `eas whoami`) and jq.
#
set -euo pipefail

PROFILE="${1:-preview}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

command -v jq  >/dev/null 2>&1 || { echo "!! jq is required (brew install jq)" >&2; exit 1; }
command -v eas >/dev/null 2>&1 || { echo "!! eas-cli is required (npm i -g eas-cli)" >&2; exit 1; }

echo "==> Building on EAS  (platform: android, profile: $PROFILE)"
echo "    Runs in the cloud — usually 10–20 min. Live progress below:"
echo

# --json            → final build result printed as JSON on stdout (progress → stderr, still visible)
# --non-interactive → never prompt; safe to run unattended
BUILD_JSON="$(eas build --platform android --profile "$PROFILE" --non-interactive --json)"

# Direct artifact URL. The field name has changed across eas-cli versions, so try both.
APK_URL="$(printf '%s' "$BUILD_JSON" \
  | jq -r '.[0].artifacts.applicationArchiveUrl // .[0].artifacts.buildUrl // empty')"

if [ -z "$APK_URL" ]; then
  echo "!! Build finished but no artifact URL was found. Raw result:" >&2
  printf '%s\n' "$BUILD_JSON" >&2
  exit 1
fi

echo
echo "=============================================================="
echo "  Direct download link:"
echo "  $APK_URL"
echo "=============================================================="
case "$APK_URL" in
  *.apk) echo "  ✅ Installable APK — share this link, or 'adb install' it on POS devices." ;;
  *.aab) echo "  ⚠️  This is an .aab (Play Store bundle) — it CANNOT be sideloaded."
         echo "     Re-run with no argument to build an installable .apk (preview profile)." ;;
esac
