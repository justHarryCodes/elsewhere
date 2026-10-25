"""Writes apps/client/public/assets/environment/sky.hdr: a daylight sky for image-based lighting.

Metallic and clear-coated paint only looks right when it has something to reflect. This is a simple
physically-plausible sky in linear HDR (equirectangular, Radiance RGBE): blue zenith, bright hazy
horizon, a sun 40 degrees up, and warm grey ground below the horizon.

    python3 scripts/environment/make_sky_hdr.py
"""
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'client', 'public', 'assets', 'environment', 'sky.hdr')
WIDTH, HEIGHT = 512, 256

ZENITH = (0.18, 0.36, 0.85)
HORIZON = (0.95, 1.0, 1.08)
GROUND_NEAR = (0.42, 0.40, 0.36)
GROUND_FAR = (0.16, 0.15, 0.14)
SUN_DIR = (math.cos(math.radians(40)) * math.sin(math.radians(35)), math.sin(math.radians(40)),
           math.cos(math.radians(40)) * math.cos(math.radians(35)))
SUN = (60.0, 55.0, 48.0)  # bright enough to give a crisp highlight on clear coat


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def radiance(dx, dy, dz):
    if dy >= 0:
        colour = lerp(HORIZON, ZENITH, dy ** 0.45)
        cos_sun = dx * SUN_DIR[0] + dy * SUN_DIR[1] + dz * SUN_DIR[2]
        disc = 1.0 if cos_sun > math.cos(math.radians(1.2)) else 0.0
        halo = max(0.0, cos_sun) ** 64 * 0.6
        return tuple(c + s * disc + s * halo * 0.02 for c, s in zip(colour, SUN))
    return lerp(GROUND_NEAR, GROUND_FAR, min(1.0, (-dy) ** 0.6))


def rgbe(r, g, b):
    m = max(r, g, b)
    if m < 1e-32:
        return (0, 0, 0, 0)
    e = math.frexp(m)[1]
    f = 256.0 / (2 ** e)
    return (int(r * f), int(g * f), int(b * f), e + 128)


def rle_channel(values):
    """Radiance 'new RLE': this writes literal runs only (count byte 1..128, then the bytes)."""
    out = bytearray()
    for i in range(0, len(values), 128):
        chunk = values[i:i + 128]
        out.append(len(chunk))
        out.extend(chunk)
    return out


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    data = bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
    data += f'-Y {HEIGHT} +X {WIDTH}\n'.encode()
    for row in range(HEIGHT):
        theta = math.pi * (row + 0.5) / HEIGHT  # 0 = straight up
        pixels = []
        for col in range(WIDTH):
            phi = 2 * math.pi * (col + 0.5) / WIDTH
            d = (math.sin(theta) * math.sin(phi), math.cos(theta), math.sin(theta) * math.cos(phi))
            pixels.append(rgbe(*radiance(*d)))
        data += bytes([2, 2, WIDTH >> 8, WIDTH & 255])
        for channel in range(4):
            data += rle_channel(bytes(p[channel] for p in pixels))
    with open(OUT, 'wb') as f:
        f.write(data)
    print('wrote', os.path.relpath(OUT, ROOT), len(data) // 1024, 'KB')


if __name__ == '__main__':
    main()
