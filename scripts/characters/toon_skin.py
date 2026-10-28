# Paints the muscle shading out of a Universal Base Character skin texture for the toon look:
# skin and underwear are each blurred among themselves (so neither bleeds into the other) and only
# a little of the original detail is put back, except on the face, which keeps most of it.
#
# blender -b -P scripts/characters/toon_skin.py -- <in.png> <out.png> <face box: x0,y0,x1,y1 in 0-1, top-left origin>
import sys

import bpy
import numpy as np

src, dst, face = sys.argv[sys.argv.index('--') + 1:][:3]
fx0, fy0, fx1, fy1 = (float(v) for v in face.split(','))

image = bpy.data.images.load(src)
w, h = image.size
px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top row first
rgb = px[:, :, :3]
lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
sat = rgb.max(axis=2) - rgb.min(axis=2)
cloth = (lum < 0.3) & (sat < 0.08)


def box(a, r):
    # Separable box blur via cumulative sums, edges clamped.
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
        n = a.shape[axis]
        a = (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
    return a


def masked_blur(values, mask, r, passes=3):
    m = mask.astype(np.float32)[:, :, None]
    num, den = values * m, m
    for _ in range(passes):
        num, den = box(num, r), box(den, r)
    return num / np.maximum(den, 1e-4)


radius = max(4, w // 64)
skin_flat = masked_blur(rgb, ~cloth, radius)
cloth_flat = masked_blur(rgb, cloth, radius)

ys, xs = np.mgrid[0:h, 0:w]
u, v = xs / w, ys / h
# Detail kept: most on the face (soft edge), a little elsewhere.
edge = 0.03
inside = np.clip(np.minimum.reduce([(u - fx0) / edge, (fx1 - u) / edge, (v - fy0) / edge, (fy1 - v) / edge]), 0, 1)
detail = (0.22 + 0.6 * inside)[:, :, None]

flat = np.where(cloth[:, :, None], cloth_flat, skin_flat)
out = flat + (rgb - flat) * np.where(cloth[:, :, None], 0.15, detail)
px[:, :, :3] = np.clip(out, 0, 1)

result = bpy.data.images.new('toon', w, h, alpha=True)
result.pixels = px[::-1].ravel()
result.filepath_raw = dst
result.file_format = 'PNG'
result.save()
print('wrote', dst)
