#!/usr/bin/env bash
#
# rebuild-local.sh — rebuild the mobile app locally with your latest changes and
# relaunch it on the running emulator (or a connected phone).
#
# Builds a SELF-CONTAINED release APK (JS embedded), so it needs NO Metro server
# and survives this machine's low-memory situation.
#
# Usage:
#   cd apps/mobile && ./rebuild-local.sh              # build against your .env (local API on :3000)
#   cd apps/mobile && ./rebuild-local.sh --railway    # build against the Railway backend (for real phones)
#
# --railway temporarily rewrites .env to the Railway URL for the build, then
# restores your original .env automatically (even if the build fails). Use it to
# make an APK you can sideload on any Android phone, anywhere — it talks to the
# public HTTPS backend instead of your machine's localhost.
#
set -euo pipefail

AVD="Medium_Phone_API_36.1"
PKG="com.kmb.mobile"
ACTIVITY="$PKG/.MainActivity"
RAILWAY_URL="https://api-production-05dd.up.railway.app/api"

HERE="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$HERE/android"
APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
ENV_FILE="$HERE/.env"
ENV_BAK="$HERE/.env.rebuild-bak"

# ---- parse args -------------------------------------------------------------
MODE="local"
if [ "${1:-}" = "--railway" ]; then
  MODE="railway"
elif [ -n "${1:-}" ]; then
  echo "Unknown option: $1  (use --railway or no argument)" >&2
  exit 2
fi

# ---- point the build at the right backend -----------------------------------
restore_env() { [ -f "$ENV_BAK" ] && mv -f "$ENV_BAK" "$ENV_FILE"; }
if [ "$MODE" = "railway" ]; then
  cp "$ENV_FILE" "$ENV_BAK"
  trap restore_env EXIT              # always put the original .env back
  printf 'EXPO_PUBLIC_API_URL=%s\n' "$RAILWAY_URL" > "$ENV_FILE"
fi

echo "==> Mode: $MODE"
echo "==> API target baked into this build:"
grep EXPO_PUBLIC_API_URL "$ENV_FILE" || true

# ---- 0. ensure a device is available; boot the emulator if none -------------
if ! adb get-state >/dev/null 2>&1; then
  echo "==> No device — cold-booting emulator $AVD ..."
  emulator "@$AVD" -no-snapshot-load -no-boot-anim >/dev/null 2>&1 &
  echo "    waiting for boot..."
  adb wait-for-device
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
fi

# ---- 1. force a fresh JS bundle so the latest edits are included -------------
echo "==> Clearing cached bundle + old APK ..."
rm -rf "$ANDROID_DIR/app/build/generated/assets/react/release" \
       "$ANDROID_DIR/app/build/generated/sourcemaps/react/release"
rm -f  "$APK"

# ---- 2. build the self-contained release APK --------------------------------
echo "==> Building release APK (JS embedded) ..."
( cd "$ANDROID_DIR" && ./gradlew assembleRelease )

# ---- 3. reinstall in place (same signing key keeps login/data) --------------
echo "==> Installing ..."
adb install -r "$APK"

# ---- 4. launch --------------------------------------------------------------
echo "==> Launching ..."
adb shell am start -n "$ACTIVITY" >/dev/null

echo "==> Done. App restarted with your latest changes."
if [ "$MODE" = "railway" ]; then
  echo "==> This APK talks to Railway and can be shared/sideloaded on any phone:"
  echo "    $APK"
fi
