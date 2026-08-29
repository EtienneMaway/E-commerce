# Play Store listing assets

Generated 27 August 2026. Sources for the icon set live in `../assets/src/*.svg` —
edit the SVG and re-render rather than touching the PNGs by hand.

| File | Use | Spec |
|---|---|---|
| `icon-512.png` | Play listing icon | 512×512, RGB (no alpha — Play rejects transparency) |
| `feature-graphic-1024x500.png` | Play feature graphic | 1024×500, RGB |
| `screenshots/01-dashboard.png` | Phone screenshot | 1200×2400, RGB |
| `screenshots/02-inventory.png` | Phone screenshot | 1200×2400, RGB |
| `screenshots/03-sales-history.png` | Phone screenshot | 1200×2400, RGB |

## Why the screenshots are 1200×2400, not 1080×2400

The emulator captures at 1080×2400, which is 2.22:1 — over Play's **2:1 maximum**
aspect ratio, and it gets rejected. Each capture is padded horizontally to
1200×2400 with the app's own background (`#0F172A`), so the padding is invisible
and no content is cropped.

## Regenerating

Icons (from the SVG sources):

```bash
cd apps/mobile/assets
rsvg-convert -w 1024 -h 1024 src/icon.svg               -o icon.png
rsvg-convert -w 512  -h 512  src/adaptive-foreground.svg -o android-icon-foreground.png
rsvg-convert -w 512  -h 512  src/adaptive-background.svg -o android-icon-background.png
rsvg-convert -w 432  -h 432  src/adaptive-monochrome.svg -o android-icon-monochrome.png
rsvg-convert -w 1024 -h 1024 src/splash-icon.svg         -o splash-icon.png
rsvg-convert -w 48   -h 48   src/splash-icon.svg         -o favicon.png
rsvg-convert -w 512  -h 512  src/icon.svg                -o ../play-store/icon-512.png
rsvg-convert -w 1024 -h 500  src/feature-graphic.svg     -o ../play-store/feature-graphic-1024x500.png
# then flatten the two listing files to RGB — Play rejects alpha
```

Screenshots: captured from the real app on an Android emulator
(`Medium_Phone_API_36.1`) signed in as a demo account against a **local** API, so
no demo data is created on production. Retake them after any UI change with
`adb exec-out screencap -p`, then pad to 2:1 as above.

**These screenshots were taken from the APK built on 24 May 2026.** Two cosmetic
issues visible in them are already fixed in source and will disappear on the next
build — the bottom-tab labels wrapping ("Invent / ory") and doubled colons in the
sales rows ("Qty:: 48"). Worth retaking the shots after the next release build.
