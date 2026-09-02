# Play Store listing assets

Icons generated 27 August 2026; screenshots retaken **1 September 2026**. Sources
for the icon set live in `../assets/src/*.svg` — edit the SVG and re-render rather
than touching the PNGs by hand.

| File | Use | Spec |
|---|---|---|
| `icon-512.png` | Play listing icon | 512×512, RGB (no alpha — Play rejects transparency) |
| `feature-graphic-1024x500.png` | Play feature graphic | 1024×500, RGB |
| `screenshots/01-dashboard.png` | Phone screenshot | 1200×2400, RGB |
| `screenshots/02-inventory.png` | Phone screenshot | 1200×2400, RGB |
| `screenshots/03-sales-history.png` | Phone screenshot | 1200×2400, RGB |

## Why the screenshots are 1200×2400, not 1080×2400

The emulator captures at 1080×2400, which is 2.22:1 — over Play's **2:1 maximum**
aspect ratio, and it gets rejected. `pad-screenshots.py` adds 60px to each side.

It pads by **replicating the outermost pixel column**, not by filling with a flat
background colour. The bottom tab bar is full-width and a shade lighter than the
page, so a flat fill leaves it visibly stopping 60px short of each edge — which is
what the earlier 24 May set did. Replication carries every full-width band out to
the border and the seam disappears.

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

Screenshots — captured from the real app on the `Medium_Phone_API_36.1` emulator,
signed in as `@demo_kmb` against a **local** API, so no demo data reaches
production:

```bash
pnpm dev:api                                   # local trading_app database
DEMO_PASS='…' SET_RATE=1 apps/mobile/play-store/seed-demo.sh   # creates @demo_kmb + its data
# install the current release APK, sign in as demo@kmb-talk.com, switch to dark theme
adb exec-out screencap -p > 01-dashboard.png   # Home / Inventory / Sales tabs
python3 pad-screenshots.py <capture-dir>       # -> screenshots/, 1200×2400
```

`seed-demo.sh` is idempotent only in the sense that it fails cleanly if `demo_kmb`
already exists — drop the user first if you want to reseed from scratch.

`SET_RATE=1` sets the exchange rate to 2900 FC/USD, which is what makes the FC
figures in the shots look like real Goma prices. **Only pass it on a local
database.** The rate is global — `exchange_rates` is a single row that
`CurrencyService.setRate()` overwrites for every account — so on production it
would move the rate under every real merchant. Without it the script leaves the
rate untouched and just prints the live one.

**Retake these after any UI change that shows on the Home, Inventory or Sales
tab.** The set is only as current as the APK it came from.
