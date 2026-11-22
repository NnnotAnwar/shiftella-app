"""
Shrink the captured PNGs: pngquant when it is installed (best), otherwise a
256-colour Pillow quantization (no extra tools needed). UI screenshots are flat
colours + soft gradients, so a 256-colour palette with dithering is visually
lossless at README size.

    python3 tools/screenshots/optimize.py [docs/screenshots]
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def optimize(path: Path) -> None:
    before = path.stat().st_size
    if shutil.which("pngquant"):
        subprocess.run(["pngquant", "--force", "--skip-if-larger", "--quality=70-95", "--output", str(path), str(path)], check=False)
    else:
        img = Image.open(path).convert("RGB")
        q = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, kmeans=2, dither=Image.Dither.FLOYDSTEINBERG)
        q.save(path, optimize=True)
    after = path.stat().st_size
    print(f"{path.name}: {before // 1024} KB -> {after // 1024} KB")


def main() -> int:
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/screenshots"
    for png in sorted(folder.glob("*.png")):
        optimize(png)
    return 0


if __name__ == "__main__":
    sys.exit(main())
