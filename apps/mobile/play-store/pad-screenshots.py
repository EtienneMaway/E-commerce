#!/usr/bin/env python3
"""Pad 1080x2400 emulator captures to 1200x2400 for the Play Store.

A raw capture is 2.22:1, over Play's 2:1 maximum, and gets rejected. Padding
60px on each side brings it to exactly 2:1.

The padding replicates the outermost pixel column rather than filling with a
flat colour: the bottom tab bar is full-width and a shade lighter than the page,
so a flat fill leaves it visibly stopping 60px short of each edge. Replication
carries every full-width band — tab bar, status bar, page background — out to
the border, so the seam disappears.

Usage:  python3 pad-screenshots.py <capture-dir> [out-dir]
"""
import sys
from pathlib import Path

from PIL import Image

PAD = 60
NAMES = ["01-dashboard.png", "02-inventory.png", "03-sales-history.png"]


def main() -> int:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "screenshots")
    out.mkdir(parents=True, exist_ok=True)

    for name in NAMES:
        im = Image.open(src / name).convert("RGB")
        w, h = im.size
        canvas = Image.new("RGB", (w + 2 * PAD, h))
        canvas.paste(im, (PAD, 0))
        canvas.paste(im.crop((0, 0, 1, h)).resize((PAD, h)), (0, 0))
        canvas.paste(im.crop((w - 1, 0, w, h)).resize((PAD, h)), (w + PAD, 0))
        canvas.save(out / name)
        print(f"{name}: {im.size} -> {canvas.size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
