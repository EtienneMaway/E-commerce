#!/usr/bin/env bash
# Regenerate every native launcher/splash resource from assets/src/*.svg.
#
# Why this exists: `assets/icon.png` + app.json only feed `expo prebuild`. The
# files Android and iOS actually ship are the generated ones under
# android/app/src/main/res and ios/**/AppIcon.appiconset. Both native projects
# are committed here, so prebuild does not run on a normal build and those
# generated files go stale — which is how the stock Expo icon survived an icon
# change. This script rewrites them in place, no prebuild required.
#
# Requires: rsvg-convert, python3 + Pillow.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets/src
RES=android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

png ()  { rsvg-convert -w "$2" -h "$2" "$SRC/$1" -o "$TMP/$3"; }
webp () { python3 -c "
from PIL import Image; import sys
Image.open(sys.argv[1]).convert('RGBA').save(sys.argv[2], 'WEBP', lossless=True)
" "$TMP/$1" "$2"; }

# Expo-facing assets (assets/*.png). These feed `expo prebuild`, the JS bundle
# (components/ui/KmbLogo.tsx renders assets/logo-mark.png) and the web
# favicon. They used to be hand-exported, so they could drift from assets/src
# while the native resources below stayed current — regenerate them here too.
rsvg-convert -w 1024 -h 1024 "$SRC/icon.svg"                -o assets/icon.png
rsvg-convert -w  512 -h  512 "$SRC/logo-mark.svg"           -o assets/logo-mark.png
rsvg-convert -w 1024 -h 1024 "$SRC/splash-icon.svg"         -o assets/splash-icon.png
rsvg-convert -w   48 -h   48 "$SRC/icon.svg"                -o assets/favicon.png
rsvg-convert -w  512 -h  512 "$SRC/adaptive-background.svg" -o assets/android-icon-background.png
rsvg-convert -w  512 -h  512 "$SRC/adaptive-foreground.svg" -o assets/android-icon-foreground.png
rsvg-convert -w  512 -h  512 "$SRC/adaptive-monochrome.svg" -o assets/android-icon-monochrome.png

# Adaptive icon (API 26+): foreground / background / monochrome
for d in "mdpi 108" "hdpi 162" "xhdpi 216" "xxhdpi 324" "xxxhdpi 432"; do
  set -- $d; dpi=$1; size=$2
  png adaptive-foreground.svg "$size" fg.png; webp fg.png "$RES/mipmap-$dpi/ic_launcher_foreground.webp"
  png adaptive-background.svg "$size" bg.png; webp bg.png "$RES/mipmap-$dpi/ic_launcher_background.webp"
  png adaptive-monochrome.svg "$size" mo.png; webp mo.png "$RES/mipmap-$dpi/ic_launcher_monochrome.webp"
done

# Legacy launcher icons (pre-API 26): square + round
for d in "mdpi 48" "hdpi 72" "xhdpi 96" "xxhdpi 144" "xxxhdpi 192"; do
  set -- $d; dpi=$1; size=$2
  png legacy-launcher.svg "$size" sq.png;       webp sq.png "$RES/mipmap-$dpi/ic_launcher.webp"
  png legacy-launcher-round.svg "$size" rd.png; webp rd.png "$RES/mipmap-$dpi/ic_launcher_round.webp"
done

# Splash logo
for d in "mdpi 288" "hdpi 432" "xhdpi 576" "xxhdpi 864" "xxxhdpi 1152"; do
  set -- $d; dpi=$1; size=$2
  rsvg-convert -w "$size" -h "$size" "$SRC/splash-icon.svg" -o "$RES/drawable-$dpi/splashscreen_logo.png"
done

# iOS app icon (single 1024 asset; Xcode derives the rest)
IOS_ICON=$(find ios -path "*AppIcon.appiconset/*1024*.png" | head -1)
if [ -n "$IOS_ICON" ]; then
  rsvg-convert -w 1024 -h 1024 "$SRC/icon.svg" -o "$TMP/ios.png"
  # iOS rejects alpha in app icons; flatten onto the brand indigo.
  python3 -c "
from PIL import Image; import sys
im = Image.open(sys.argv[1]).convert('RGBA')
flat = Image.new('RGB', im.size, '#4F46E5'); flat.paste(im, (0, 0), im)
flat.save(sys.argv[2])" "$TMP/ios.png" "$IOS_ICON"
fi

echo "native icon resources regenerated"
