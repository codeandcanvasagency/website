#!/usr/bin/env python3
"""
Prepare a partner PNG for the home marquee CSS:

  .logo-track img { filter: brightness(0) invert(1); opacity: 0.7; }

Common failure: the file has a *solid white* rectangle (alpha=255 everywhere) instead of a
transparent background. The filter then turns the whole bitmap into a flat white block.

This script keys out near-white pixels (plate/padding) to true transparency and keeps darker
ink (glyphs, colour). Re-run after replacing an asset.

  python3 scripts/normalize-partner-logo.py images/claude-ai.png

Optional threshold (sum of RGB, default 720):

  python3 scripts/normalize-partner-logo.py --threshold 700 images/foo.png
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    raise SystemExit("Install Pillow: pip install Pillow") from e


def normalize_path(path: Path, rgb_sum_threshold: int) -> None:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12:
                continue
            if r + g + b >= rgb_sum_threshold:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)
    im.save(path, optimize=True)
    print("OK", path)


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--threshold",
        type=int,
        default=720,
        help="Pixels with R+G+B >= this become transparent (default 720 ≈ avg 240).",
    )
    p.add_argument("paths", nargs="+", help="PNG paths under the repo, e.g. images/foo.png")
    args = p.parse_args(argv)
    for raw in args.paths:
        path = Path(raw)
        if not path.is_file():
            print("skip (not a file):", path, file=sys.stderr)
            continue
        normalize_path(path, args.threshold)


if __name__ == "__main__":
    main(sys.argv[1:])
