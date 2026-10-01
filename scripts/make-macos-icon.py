#!/usr/bin/env python3
"""
make-macos-icon.py — converts the full-bleed logo.png into a proper macOS
app icon: squircle mask (Apple's rounded-rect proportions), transparent
corners, correct margins — then regenerates the iconset + icns.

macOS icon spec (from Apple HIG):
  - canvas: 1024x1024
  - the rounded-rect "squircle" occupies ~824x824 centered (~80% of canvas)
    with the remaining margin transparent; macOS does NOT auto-mask app
    icons (unlike iOS) — the rounded shape must be baked into the PNG
  - corner radius for an 824pt shape ≈ 185pt (Apple's continuous curve —
    approximated here with a superellipse/squircle path)

Usage:  python3 scripts/make-macos-icon.py
Reads:  logo.png
Writes: build/icon/iconset/*.png, build/icon/icon.icns (via iconutil)
"""
import math
import os
import struct
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "logo.png")
OUT_DIR = os.path.join(ROOT, "build", "icon")
ICONSET = os.path.join(OUT_DIR, "icon.iconset")

CANVAS = 1024
SHAPE = 824  # squircle edge length, centered
RADIUS = 185  # corner radius for the 824 shape


def squircle_mask(size: int, scale: float) -> Image.Image:
    """Apple-style continuous-corner squircle as an L-mode mask at `size` px.

    The shape spans `scale` of the canvas, centered. Instead of a plain
    rounded rect, we use a superellipse (|x/a|^n + |y/a|^n = 1, n≈5) which
    closely matches Apple's squircle curvature.
    """
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)

    # superellipse exponent — n=5 approximates Apple's macOS icon curvature
    n = 5.0
    half = (SHAPE / 2) * (size / CANVAS)
    cx = cy = size / 2

    # draw via polygon sampling the superellipse
    pts = []
    steps = 720
    for i in range(steps):
        t = 2 * math.pi * i / steps
        ct, st = math.cos(t), math.sin(t)
        x = cx + half * (abs(ct) ** (2 / n)) * (1 if ct >= 0 else -1)
        y = cy + half * (abs(st) ** (2 / n)) * (1 if st >= 0 else -1)
        pts.append((x, y))
    # oversample the polygon by 2px inward to avoid jaggies at the edge
    d.polygon(pts, fill=255)
    return img


def build() -> None:
    src = Image.open(SRC).convert("RGBA")

    # 1. scale the full-bleed logo to the shape size
    art = src.resize((SHAPE, SHAPE), Image.LANCZOS)

    # 2. mask it with the squircle (transparent corners)
    mask = squircle_mask(CANVAS, SHAPE / CANVAS)
    mask_full = Image.new("L", (CANVAS, CANVAS), 0)
    mask_full.paste(mask, ((CANVAS - CANVAS) // 2, (CANVAS - CANVAS) // 2))

    # place the art centered on a transparent 1024 canvas
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    offset = (CANVAS - SHAPE) // 2
    canvas.paste(art, (offset, offset))
    # apply the mask (mask is at full-canvas coords already)
    r, g, b, a = canvas.split()
    # recompute mask at full canvas
    m = squircle_mask(CANVAS, 1.0)
    # m draws shape across the whole canvas; but we want shape=824 centered:
    # regenerate properly:
    m = Image.new("L", (CANVAS, CANVAS), 0)
    dm = ImageDraw.Draw(m)
    n = 5.0
    half = SHAPE / 2
    cx = cy = CANVAS / 2
    pts = []
    steps = 1440
    for i in range(steps):
        t = 2 * math.pi * i / steps
        ct, st = math.cos(t), math.sin(t)
        x = cx + half * (abs(ct) ** (2 / n)) * (1 if ct >= 0 else -1)
        y = cy + half * (abs(st) ** (2 / n)) * (1 if st >= 0 else -1)
        pts.append((x, y))
    dm.polygon(pts, fill=255)
    canvas.putalpha(m)

    master = canvas
    master.save(os.path.join(OUT_DIR, "icon_1024.png"))

    # 3. generate every iconset size Apple requires
    os.makedirs(ICONSET, exist_ok=True)
    sizes = [
        ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
    ]
    for name, px in sizes:
        master.resize((px, px), Image.LANCZOS).save(os.path.join(ICONSET, name))

    # 4. icns via iconutil
    subprocess.run(
        ["iconutil", "-c", "icns", ICONSET, "-o", os.path.join(OUT_DIR, "icon.icns")],
        check=True,
    )
    print("✅ wrote", os.path.join(OUT_DIR, "icon.icns"), "and iconset sizes")


if __name__ == "__main__":
    build()
