#!/usr/bin/env python3
"""400 KB を超える PNG だけ 256 色パレットに落とす / Palette-reduce PNGs larger than 400 KB.

README が重くならないように 1 枚 400 KB 以下に収める。UI のスクリーンショットは色数が
少ないので、256 色 PNG-8 にしても見た目はほぼ変わらない(JPEG は文字の輪郭が滲むうえに
このページでは PNG より大きくなる。実測: 全体像 1596x2591 で JPEG q88 = 715 KB、
256 色 PNG = 233 KB)。

    python3 pic/screenshots/capture/shrink.py

Pillow が要る: `python3 -m pip install pillow`
"""

import os
import sys

from PIL import Image

LIMIT = 400 * 1024
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.dirname(HERE)

changed = 0
for name in sorted(os.listdir(SHOTS)):
    if not name.endswith(".png"):
        continue
    path = os.path.join(SHOTS, name)
    before = os.path.getsize(path)
    with Image.open(path) as im:
        width, height = im.size
        if before > LIMIT:
            q = im.convert("RGB").quantize(
                colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
            )
            q.save(path, optimize=True)
            changed += 1
    after = os.path.getsize(path)
    note = "quantized (256 colors)" if after != before else "kept as-is (truecolor)"
    print(f"{name:36s} {width}x{height:<6} {before/1024:8.1f} KB -> {after/1024:8.1f} KB  {note}")

over = [n for n in os.listdir(SHOTS)
        if n.endswith(".png") and os.path.getsize(os.path.join(SHOTS, n)) > LIMIT]
if over:
    print(f"\nstill over 400 KB: {', '.join(sorted(over))}", file=sys.stderr)
    sys.exit(1)
print(f"\nall PNGs are 400 KB or smaller ({changed} quantized)")
