"""Packs Quaternius' Downtown City MegaKit into one compact file for the city renderer.

The kit is ~150 small .gltf pieces (walls, windows, cornices, roofs, streets...) with 2048px PBR textures. The
city assembles buildings and streets from those pieces itself, so instead of loading 150 files it loads:

    apps/client/public/assets/city/megakit/pieces.json   every piece: its bounds and, per material, where its
                                                         vertices and triangles are in pieces.bin
    apps/client/public/assets/city/megakit/pieces.bin    positions, normals, UVs (float32) and indices (uint32)
    apps/client/public/assets/city/megakit/textures/     the kit's textures at 1024px (a quarter of the memory)

Dropped on the way: the interior back faces of walls and floors (never seen from the street) and the vertex
colours (wear masks for the kit's own shaders, which other engines paint red over the asphalt).

    python3 scripts/city/pack_megakit.py
"""
import glob
import json
import os
import struct
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'vehicles'))
from gltfscene import apply, mat_mul, trs  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'apps', 'client', 'public', 'assets', 'buildings', 'downtown-city-megakit')
OUT = os.path.join(ROOT, 'apps', 'client', 'public', 'assets', 'city', 'megakit')
TEXTURE_SIZE = 1024
SKIP_MATERIALS = {'MI_InteriorWall', 'MI_InteriorFloor', 'MI_InteriorRoof'}
# Materials that are the same surface under another name.
ALIASES = {'MI_RedBrick_Pale': 'MI_RedBrick'}

COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
FORMATS = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}


def read_accessor(g, buffers, index):
    a = g['accessors'][index]
    view = g['bufferViews'][a['bufferView']]
    data = buffers[view['buffer']]
    n = COMPONENTS[a['type']]
    fmt = FORMATS[a['componentType']]
    size = struct.calcsize(fmt)
    stride = view.get('byteStride', size * n)
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * n, data, start + i * stride) for i in range(a['count'])]


def normal_matrix(m):
    # Rotation part only (pieces are placed with rotations and uniform scales).
    return [m[0], m[1], m[2], 0, m[4], m[5], m[6], 0, m[8], m[9], m[10], 0, 0, 0, 0, 1]


def main():
    os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
    blob = bytearray()
    pieces = {}
    materials = {}
    used_images = set()

    def put(values, fmt):
        offset = len(blob)
        blob.extend(struct.pack('<%d%s' % (len(values), fmt), *values))
        return offset

    for path in sorted(glob.glob(os.path.join(SRC, '*.gltf'))):
        name = os.path.splitext(os.path.basename(path))[0]
        g = json.load(open(path))
        buffers = [open(os.path.join(SRC, b['uri']), 'rb').read() for b in g['buffers']]
        images = [im['uri'] for im in g.get('images', [])]
        textures = [images[t['source']] for t in g.get('textures', [])]
        groups = {}

        def walk(i, parent):
            node = g['nodes'][i]
            world = mat_mul(parent, trs(node))
            if 'mesh' in node:
                for prim in g['meshes'][node['mesh']]['primitives']:
                    mat = g['materials'][prim['material']]
                    mname = ALIASES.get(mat['name'], mat['name'])
                    if mname in SKIP_MATERIALS:
                        continue
                    if mname not in materials:
                        pbr = mat.get('pbrMetallicRoughness', {})
                        tex = lambda ref: textures[ref['index']] if ref else None  # noqa: E731
                        entry = {
                            'base': tex(pbr.get('baseColorTexture')),
                            'orm': tex(pbr.get('metallicRoughnessTexture')),
                            'normal': tex(mat.get('normalTexture')),
                            'color': pbr.get('baseColorFactor', [1, 1, 1, 1]),
                            'blend': mat.get('alphaMode') == 'BLEND',
                            'mask': mat.get('alphaMode') == 'MASK',
                        }
                        materials[mname] = entry
                        used_images.update(v for k, v in entry.items() if k in ('base', 'orm', 'normal') and v)
                    attrs = prim['attributes']
                    pos = read_accessor(g, buffers, attrs['POSITION'])
                    nor = read_accessor(g, buffers, attrs['NORMAL']) if 'NORMAL' in attrs else [(0, 1, 0)] * len(pos)
                    uv = read_accessor(g, buffers, attrs['TEXCOORD_0']) if 'TEXCOORD_0' in attrs else [(0, 0)] * len(pos)
                    idx = [i[0] for i in read_accessor(g, buffers, prim['indices'])] if 'indices' in prim else list(range(len(pos)))
                    nm = normal_matrix(world)
                    group = groups.setdefault(mname, {'p': [], 'n': [], 'uv': [], 'i': []})
                    base = len(group['p']) // 3
                    for p in pos:
                        group['p'].extend(apply(world, p))
                    for n in nor:
                        x, y, z = apply(nm, n)
                        length = (x * x + y * y + z * z) ** 0.5 or 1
                        group['n'].extend((x / length, y / length, z / length))
                    for u in uv:
                        group['uv'].extend(u[:2])
                    group['i'].extend(base + i for i in idx)
            for c in node.get('children', []):
                walk(c, world)

        ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        for r in g['scenes'][g.get('scene', 0)]['nodes']:
            walk(r, ident)
        if not groups:
            continue
        entry = {'parts': {}}
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for mname, group in groups.items():
            for k in range(0, len(group['p']), 3):
                for a in range(3):
                    lo[a] = min(lo[a], group['p'][k + a])
                    hi[a] = max(hi[a], group['p'][k + a])
            entry['parts'][mname] = {
                'vertices': len(group['p']) // 3,
                'indices': len(group['i']),
                'p': put(group['p'], 'f'),
                'n': put(group['n'], 'f'),
                'uv': put(group['uv'], 'f'),
                'i': put(group['i'], 'I'),
            }
        entry['min'] = [round(v, 3) for v in lo]
        entry['max'] = [round(v, 3) for v in hi]
        pieces[name] = entry

    # Textures at 1024px: JPEG where there's no transparency, PNG where there is.
    renamed = {}
    for image in sorted(used_images):
        im = Image.open(os.path.join(SRC, image))
        im = im.resize((TEXTURE_SIZE, TEXTURE_SIZE), Image.LANCZOS)
        has_alpha = im.mode in ('RGBA', 'LA') and im.getextrema()[-1][0] < 255
        out = os.path.splitext(image)[0] + ('.png' if has_alpha else '.jpg')
        if has_alpha:
            im.save(os.path.join(OUT, 'textures', out), optimize=True)
        else:
            im.convert('RGB').save(os.path.join(OUT, 'textures', out), quality=88)
        renamed[image] = out
    # The room textures behind the windows (the kit's own fake-interior shader isn't in the free version).
    for image in ('T_lit_interior_1.png', 'T_lit_interior_2.png', 'T_dark_interior.png'):
        Image.open(os.path.join(SRC, image)).convert('RGB').save(os.path.join(OUT, 'textures', image[:-4] + '.jpg'), quality=88)
    for entry in materials.values():
        for k in ('base', 'orm', 'normal'):
            if entry[k]:
                entry[k] = renamed[entry[k]]

    open(os.path.join(OUT, 'pieces.bin'), 'wb').write(blob)
    json.dump({'pieces': pieces, 'materials': materials}, open(os.path.join(OUT, 'pieces.json'), 'w'), separators=(',', ':'))
    print(f'{len(pieces)} pieces, {len(materials)} materials, {len(blob) / 1e6:.1f} MB geometry, {len(renamed)} textures')


if __name__ == '__main__':
    main()
