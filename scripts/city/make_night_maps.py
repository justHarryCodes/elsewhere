"""Builds the night glow maps for the Kenney city kits: Textures/colormap-night.png beside each kit's colormap.

Every model in a kit is coloured from one palette texture (colormap.png), so the window glass is the same few
swatches everywhere. This keeps those swatches (the blues) and blacks out everything else; the city renderer
uses the result as an emissive texture at night, so windows light up and walls stay dark.

    python3 scripts/city/make_night_maps.py
"""
import colorsys
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KITS = [
    'apps/client/public/assets/buildings/kenney-city-kit-commercial',
    'apps/client/public/assets/buildings/kenney-city-kit-suburban',
    'apps/client/public/assets/buildings/kenney-city-kit-industrial',
]


def is_glass(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    # Glass is the clear blues; the grey-blue wall swatches sit just past it (hue 0.625+).
    return 0.53 < h < 0.615 and s > 0.15 and v > 0.55


def main():
    for kit in KITS:
        src = Image.open(os.path.join(ROOT, kit, 'Textures', 'colormap.png')).convert('RGB')
        out = Image.new('RGB', src.size)
        px, dst = src.load(), out.load()
        for y in range(src.size[1]):
            for x in range(src.size[0]):
                r, g, b = px[x, y]
                # Lit windows: a warm-white light, brighter where the glass swatch is lighter.
                dst[x, y] = (255, 236, 200) if is_glass(r, g, b) else (0, 0, 0)
        path = os.path.join(ROOT, kit, 'Textures', 'colormap-night.png')
        out.save(path)
        print('wrote', os.path.relpath(path, ROOT))


if __name__ == '__main__':
    main()
