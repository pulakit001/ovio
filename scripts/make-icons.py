#!/usr/bin/env python3
"""
make-icons.py — one source of truth for every Ovio app icon.

The mark: a lime half-disc leading four ink capsules (an equalizer / voice
wave). It is drawn as geometry here, not resized from a bitmap, so every size
is crisp, aligned to a sub-pixel grid and optically tuned.

Platform specifics
------------------
macOS   Apple HIG: 1024 canvas, 824pt tile ("squircle"), the remaining 100pt
        margin stays transparent because macOS does NOT mask app icons. The
        tile uses a superellipse (n=5) — continuous corners, no flat spots.
        Output: icon.iconset/*.png + icon.icns + icon_1024.png (dock icon) +
        icon_dark_1024.png (the inverted dark-mode dock appearance).
Windows No OS mask, so the tile is baked in. Ships as a real multi-resolution
        .ico (PNG-compressed entries, Vista+): 16/20/24/32/40/48/64/128/256.
        Explorer and the taskbar pick the nearest size instead of shrinking one
        big bitmap — that is what makes the 16px version stay legible.
Linux   hicolor theme set 16 -> 1024 in build/icons/, which electron-builder
        turns into the .deb / AppImage icon theme.

Optical sizes
-------------
<= 32px the four bars plus the disc turn into five hairlines and the gaps
disappear. Those sizes get a compact drawing instead: three thicker capsules
with wider gaps, same silhouette and colours.

Anti-aliasing: every icon is rendered at 4x (8x below 64px) and downsampled
with Lanczos, so the curves are smooth without hand-hinting.
"""
from __future__ import annotations

import io
import math
import os
import struct
import subprocess

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "build", "icon")
LINUX_DIR = os.path.join(ROOT, "build", "icons")
ICONSET = os.path.join(ICON_DIR, "icon.iconset")

# Brand palette, sampled from the approved artwork.
INK = (9, 9, 9, 255)
LIME = (135, 250, 34, 255)
PAPER_TOP = (255, 255, 255)
PAPER_BOTTOM = (248, 249, 245)
HAIRLINE = (9, 9, 9, 20)

# Dark appearance (macOS dark mode): the same geometry, inverted tile — light
# capsules on a near-black tile so the mark reads the way it does in the
# approved dark artwork. The tile is not pure #000: a slight lift plus a white
# hairline keeps its squircle from dissolving into a dark Dock.
DARK_TOP = (12, 12, 14)
DARK_BOTTOM = (20, 20, 24)
DARK_MARK = (247, 247, 248, 255)
DARK_HAIRLINE = (255, 255, 255, 34)

MAC_TILE = 824 / 1024      # Apple's standard macOS tile
WIN_TILE = 0.94
LINUX_TILE = 0.90

# ---- geometry, in units of a 100x100 tile -------------------------------
# Shared: every bar is a capsule (radius = half width) centred on the tile's
# horizontal midline, and the lime half-disc is vertically centred with bar 1.
REGULAR = dict(bar_w=13.6, gap=4.6, heights=(38.5, 60.5, 32.5, 18.5), disc_r=13.6)
COMPACT = dict(bar_w=17.0, gap=7.0, heights=(46.0, 66.0, 30.0), disc_r=17.0)
MICRO = dict(bar_w=22.0, gap=7.0, heights=(66.0, 42.0), disc_r=18.0)


# ---- shape masks --------------------------------------------------------
def superellipse_mask(size: int, frac: float) -> Image.Image:
    """White tile shape on an L mask, `frac` of the canvas, continuous corners.

    Centre-scaled superellipse |x/a|^n + |y/a|^n = 1 with n=5: the 45-degree
    corner sits at the same inset as a 22.45% circular arc, but the curvature
    runs continuously into the straight edges the way Apple's does.
    """
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    half = size * frac / 2
    cx = cy = size / 2
    n = 5.0
    steps = 4096
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        ct, st = math.cos(t), math.sin(t)
        x = cx + half * (abs(ct) ** (2 / n)) * (1 if ct >= 0 else -1)
        y = cy + half * (abs(st) ** (2 / n)) * (1 if st >= 0 else -1)
        pts.append((x, y))
    d.polygon(pts, fill=255)
    return img


def paper(size: int, frac: float, top=PAPER_TOP, bottom=PAPER_BOTTOM) -> Image.Image:
    """The tile: a subtle vertical gradient, masked to the squircle."""
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        grad.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    tile = grad.resize((size, size), Image.NEAREST).convert("RGBA")
    tile.putalpha(superellipse_mask(size, frac))
    return tile


def draw_mark(tile_px: int, geometry: dict, ink=INK) -> Image.Image:
    """The waveform, drawn into a transparent tile_px square."""
    img = Image.new("RGBA", (tile_px, tile_px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = tile_px / 100.0  # one design unit in pixels

    w = geometry["bar_w"] * u
    gap = geometry["gap"] * u
    heights = [h * u for h in geometry["heights"]]
    disc_r = geometry["disc_r"] * u

    total = disc_r + gap + len(heights) * w + (len(heights) - 1) * gap
    x = (tile_px - total) / 2
    cy = tile_px / 2

    # Lime half-disc: flat edge faces the bars, bulge points left.
    d.pieslice([x, cy - disc_r, x + 2 * disc_r, cy + disc_r], 90, 270, fill=LIME)
    x += disc_r + gap

    for h in heights:
        d.rounded_rectangle([x, cy - h / 2, x + w, cy + h / 2], radius=w / 2, fill=ink)
        x += w + gap
    return img


def geometry_for(px: int) -> dict:
    """Fewer, thicker shapes as the canvas shrinks — the difference between a
    mark and a smudge at 16px."""
    if px <= 20:
        return MICRO
    if px <= 32:
        return COMPACT
    return REGULAR


def render(size: int, tile: float, *, top=PAPER_TOP, bottom=PAPER_BOTTOM,
           mark=INK, hairline=HAIRLINE) -> Image.Image:
    ss = 8 if size <= 64 else 4
    big = size * ss
    canvas = paper(big, tile, top, bottom)
    tile_px = big * tile
    mark = draw_mark(int(round(tile_px)), geometry_for(size), mark)
    off = int(round((big - tile_px) / 2))
    canvas.alpha_composite(mark, (off, off))

    # A hairline keeps the white tile from melting into a white desktop. It is
    # skipped below 64px where it would just grey the whole icon.
    if size >= 64:
        inset = 2 * 1.2 * ss / big
        if inset < tile:
            edge = ImageChops.subtract(
                superellipse_mask(big, tile),
                superellipse_mask(big, tile - inset),
            )
            stroke = Image.new("RGBA", (big, big), tuple(hairline[:3]) + (0,))
            stroke.putalpha(edge.point(lambda v: v * hairline[3] // 255))
            canvas.alpha_composite(stroke)

    return canvas.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(f"  {os.path.relpath(path, ROOT):50s} {img.size[0]:>4}px  {os.path.getsize(path) / 1024:6.1f} KB")


# ---- platform writers ---------------------------------------------------
def write_ico(path: str, sizes=(16, 20, 24, 32, 40, 48, 64, 128, 256)) -> None:
    """Multi-resolution .ico with PNG-compressed entries (Vista and later)."""
    images = []
    for s in sizes:
        tile = 1.0 if s <= 32 else WIN_TILE
        images.append((s, render(s, tile)))

    header = struct.pack("<HHH", 0, 1, len(images))
    entries, blobs = b"", b""
    offset = 6 + 16 * len(images)
    for size, img in images:
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        png = buf.getvalue()
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset)
        blobs += png
        offset += len(png)
    with open(path, "wb") as fh:
        fh.write(header + entries + blobs)
    print(f"  {os.path.relpath(path, ROOT):50s} {len(images)} layers  {os.path.getsize(path) / 1024:6.1f} KB")


def write_icns() -> None:
    os.makedirs(ICONSET, exist_ok=True)
    mac_sizes = [
        ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
    ]
    for name, px in mac_sizes:
        render(px, MAC_TILE).save(os.path.join(ICONSET, name))
    subprocess.run(
        ["iconutil", "-c", "icns", ICONSET, "-o", os.path.join(ICON_DIR, "icon.icns")],
        check=True,
    )
    print(f"  {os.path.relpath(os.path.join(ICON_DIR, 'icon.icns'), ROOT):50s} "
          f"icns  {os.path.getsize(os.path.join(ICON_DIR, 'icon.icns')) / 1024:6.1f} KB")


def main() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)

    print("macOS")
    save(render(1024, MAC_TILE), os.path.join(ICON_DIR, "icon_1024.png"))
    write_icns()

    # macOS dark appearance: the Dock icon main.cjs swaps in while the system
    # is in dark mode. White capsules, lime half-disc, near-black tile.
    save(
        render(1024, MAC_TILE, top=DARK_TOP, bottom=DARK_BOTTOM, mark=DARK_MARK, hairline=DARK_HAIRLINE),
        os.path.join(ICON_DIR, "icon_dark_1024.png"),
    )

    print("Windows")
    write_ico(os.path.join(ICON_DIR, "icon.ico"))
    save(render(512, WIN_TILE), os.path.join(ICON_DIR, "icon_512.png"))

    print("Linux")
    for px in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        save(render(px, 1.0 if px <= 32 else LINUX_TILE), os.path.join(LINUX_DIR, f"{px}x{px}.png"))

    print("Runtime / web")
    # BrowserWindow + taskbar icon on Windows, window icon on Linux.
    save(render(512, WIN_TILE), os.path.join(ROOT, "logo.png"))
    # Favicon: full-bleed tile, otherwise the browser tab shows a tiny stamp.
    save(render(256, 1.0), os.path.join(ROOT, "public", "logo.png"))


if __name__ == "__main__":
    main()
