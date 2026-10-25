"""Packs the town's buildings, nature and street props into one compact file for the city renderer.

Sources (all under apps/client/public/assets):
  - Quaternius' Ultimate Buildings Pack, "Textured Models" (OBJ): 26 finished buildings and the modular parts
    (shop signs, AC units...). Coloured from a 32x32 palette; the pack ships ten palettes ("skins") with the same
    layout, so the city paints each building in one of them. The window glass (one palette cell) is split into
    its own material so it can glow at night.
  - Quaternius' Stylized Nature MegaKit (glb): trees, bushes, flowers, grass, rocks.
  - Street furniture from city-pack (glb, every model in its own units): signs, lights, benches, bins...

Everything is scaled to metres with its base on y = 0 and written like the MegaKit pack (pack_megakit.py):

    apps/client/public/assets/city/town/pieces.json   piece -> bounds and, per material, offsets into pieces.bin
    apps/client/public/assets/city/town/pieces.bin    positions, normals, UVs, colours (float32), indices (uint32)
    apps/client/public/assets/city/town/textures/

Materials with only a flat colour are baked into vertex colours under one shared material ("town-vcolor"),
so a chunk draws all of them at once.

    python3 scripts/city/pack_town.py
"""
import io
import json
import os
import struct
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'vehicles'))
from gltfscene import apply, mat_mul, trs  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'apps', 'client', 'public', 'assets')
OUT = os.path.join(ASSETS, 'city', 'town')
UB = os.path.join(ASSETS, 'buildings', 'ultimate-buildings-pack', 'Textured Models')
NATURE = os.path.join(ASSETS, 'nature', 'stylized-nature-megakit')
PROPS = os.path.join(ASSETS, 'buildings', 'city-pack')

UB_SCALE = 2.4  # pack units to metres: doors come out 2.1 m, storeys 3 m
UB_SKINS = ['Blue', 'Dark', 'DarkBlue', 'DarkPurple', 'Green', 'Grey', 'Light', 'Light2', 'Red', 'Yellow']
UB_PARTS = ['AC_Unit', 'AC_Unitx4', 'Balcony', 'Sign_Bakery', 'Sign_Barbershop', 'Sign_Bookshop', 'Sign_Hardware',
            'Sign_Pharmacy', 'CasinoSign', 'Stairs_Roof', 'Window_Roof']
# The glass cell of the palette (pixels x 4-8, y 24-32 of 32x32), in top-down UVs.
GLASS_CELL = (4 / 32, 8 / 32, 24 / 32, 32 / 32)

# Nature: scale for each model (they're roughly in metres already).
NATURE_SCALES = {
    'tree': 1, 'tree-2': 1, 'tree-3': 1, 'tree-4': 1, 'tree-5': 1,
    'pine': 1, 'pine-2': 1, 'pine-3': 1, 'pine-4': 1, 'pine-5': 1,
    'twisted-tree': 0.8, 'twisted-tree-3': 0.8,
    'bush': 0.75, 'bush-with-flowers': 0.75,
    'flower-group': 0.4, 'flower-group-2': 0.45, 'flower-single': 0.35, 'flower-single-2': 0.4,
    'flower-petal': 1, 'flower-petal-2': 1, 'flower-petal-4': 1,
    'grass': 0.45, 'grass-wispy': 0.55, 'grass-wispy-2': 0.5, 'tall-grass': 0.5,
    'plant': 1, 'plant-2': 0.8, 'plant-big': 0.5, 'clover': 0.5, 'clover-2': 0.5,
    'rock-medium': 0.45, 'rock-medium-3': 0.45,
    'rock-path-round-small': 1, 'rock-path-round-wide': 1, 'rock-path-square-wide': 1,
    'pebble-round': 1, 'pebble-square': 1,
}
# Street props: real height in metres for each (their own units are all different).
PROP_HEIGHTS = {
    'stop-sign': 2.6, 'traffic-light-2': 3.8, 'traffic-light-3': 1.0, 'billboard': 7.5, 'billboard-2': 7.5,
    'bus-stop': 2.7, 'bus-stop-sign': 2.8, 'bench': 0.95, 'trash-can': 1.0, 'fire-hydrant': 0.8,
    'mailbox': 1.25, 'planter-bushes': 0.95, 'power-box': 1.4, 'flower-pot': 1.0, 'flower-pot-2': 1.0,
    'bike-warning-road-sign': 2.6, 'dumpster': 1.4, 'cone': 0.7, 'atm': 1.8, 'roof-exit': 2.6,
}

COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
FORMATS = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}
NORMALISE = {5121: 255.0, 5123: 65535.0}


class Mesh:
    """Triangles of one material: positions, normals, UVs, optional colours, indices."""

    def __init__(self):
        self.p, self.n, self.uv, self.c, self.i = [], [], [], [], []

    def add_vertex(self, p, n, uv, c=None):
        self.p.extend(p)
        self.n.extend(n)
        self.uv.extend(uv)
        if c is not None:
            self.c.extend(c)
        return len(self.p) // 3 - 1


# ------------------------------------------------------------------ readers

def read_obj(path, scale):
    """OBJ (Blender export, Y up): yields (material, Mesh) with every face split by palette cell."""
    vs, vts, vns = [], [], []
    meshes = {}
    material = 'default'
    for line in open(path):
        if line.startswith('v '):
            vs.append([float(t) * scale for t in line.split()[1:4]])
        elif line.startswith('vt '):
            u, v = (float(t) for t in line.split()[1:3])
            vts.append((u, 1 - v))  # OBJ's V runs up; store it top-down like glTF
        elif line.startswith('vn '):
            vns.append([float(t) for t in line.split()[1:4]])
        elif line.startswith('usemtl'):
            material = line.split()[1]
        elif line.startswith('f '):
            corners = []
            for token in line.split()[1:]:
                parts = token.split('/')
                vi = int(parts[0]) - 1
                ti = int(parts[1]) - 1 if len(parts) > 1 and parts[1] else None
                ni = int(parts[2]) - 1 if len(parts) > 2 and parts[2] else None
                # Position, normal, UV: the order Mesh.add_vertex takes them in.
                corners.append((vs[vi], vns[ni] if ni is not None else (0, 1, 0), vts[ti] if ti is not None else (0, 0)))
            # Which palette cell the face is coloured from (its UV centre).
            cu = sum(c[2][0] for c in corners) / len(corners)
            cv = sum(c[2][1] for c in corners) / len(corners)
            u0, u1, v0, v1 = GLASS_CELL
            key = 'glass' if u0 <= cu <= u1 and v0 <= cv <= v1 else material
            mesh = meshes.setdefault(key, Mesh())
            first = [mesh.add_vertex(*c) for c in corners]
            for k in range(1, len(first) - 1):  # fan-triangulate
                mesh.i.extend((first[0], first[k], first[k + 1]))
    return meshes


def read_glb(path):
    """glb: yields per material (name, material json, images) -> Mesh, in scene space."""
    raw = open(path, 'rb').read()
    jlen, = struct.unpack_from('<I', raw, 12)
    g = json.loads(raw[20:20 + jlen])
    off = 20 + jlen
    blen, = struct.unpack_from('<I', raw, off)
    blob = raw[off + 8: off + 8 + blen]

    def accessor(index):
        a = g['accessors'][index]
        view = g['bufferViews'][a['bufferView']]
        n = COMPONENTS[a['type']]
        fmt = FORMATS[a['componentType']]
        size = struct.calcsize(fmt)
        stride = view.get('byteStride', size * n)
        start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        out = [struct.unpack_from('<' + fmt * n, blob, start + i * stride) for i in range(a['count'])]
        if a.get('normalized') and a['componentType'] in NORMALISE:
            out = [tuple(v / NORMALISE[a['componentType']] for v in t) for t in out]
        return out

    def image(index):
        im = g['images'][index]
        view = g['bufferViews'][im['bufferView']]
        data = blob[view.get('byteOffset', 0): view.get('byteOffset', 0) + view['byteLength']]
        return im.get('name') or f'{os.path.basename(path)}-{index}', data

    textures = [t['source'] for t in g.get('textures', [])]
    meshes = {}

    def walk(i, parent):
        node = g['nodes'][i]
        world = mat_mul(parent, trs(node))
        if 'mesh' in node:
            rot = [world[0], world[1], world[2], 0, world[4], world[5], world[6], 0, world[8], world[9], world[10], 0, 0, 0, 0, 1]
            for prim in g['meshes'][node['mesh']]['primitives']:
                mi = prim.get('material', -1)
                mat = g['materials'][mi] if mi >= 0 else {'name': 'default'}
                pbr = mat.get('pbrMetallicRoughness', {})
                base = pbr.get('baseColorTexture')
                entry = meshes.setdefault(mi, {'material': mat, 'image': image(textures[base['index']]) if base else None, 'mesh': Mesh()})
                mesh = entry['mesh']
                attrs = prim['attributes']
                pos = accessor(attrs['POSITION'])
                nor = accessor(attrs['NORMAL']) if 'NORMAL' in attrs else [(0, 1, 0)] * len(pos)
                uv = accessor(attrs['TEXCOORD_0']) if 'TEXCOORD_0' in attrs else [(0, 0)] * len(pos)
                idx = [t[0] for t in accessor(prim['indices'])] if 'indices' in prim else list(range(len(pos)))
                first = len(mesh.p) // 3
                for k in range(len(pos)):
                    x, y, z = apply(rot, nor[k])
                    length = (x * x + y * y + z * z) ** 0.5 or 1
                    mesh.add_vertex(apply(world, pos[k]), (x / length, y / length, z / length), uv[k][:2])
                mesh.i.extend(first + t for t in idx)
        for c in node.get('children', []):
            walk(c, world)

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for r in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(r, ident)
    return list(meshes.values())


# ------------------------------------------------------------------ packing

def main():
    os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
    blob = bytearray()
    pieces = {}
    materials = {}
    saved = set()

    def put(values, fmt):
        offset = len(blob)
        blob.extend(struct.pack('<%d%s' % (len(values), fmt), *values))
        return offset

    def save_image(name, data, size=None, lossless=False):
        out = os.path.splitext(name)[0]
        im = Image.open(io.BytesIO(data)) if isinstance(data, bytes) else data
        has_alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255
        lossless = lossless or has_alpha
        out += '.png' if lossless else '.jpg'
        if out not in saved:
            if size and max(im.size) > size:
                im = im.resize((size, size), Image.LANCZOS)
            if lossless:
                im.convert('RGBA' if has_alpha else 'RGB').save(os.path.join(OUT, 'textures', out), optimize=True)
            else:
                im.convert('RGB').save(os.path.join(OUT, 'textures', out), quality=90)
            saved.add(out)
        return out

    def add_piece(name, groups, scale=1.0, ground=True):
        """groups: material key -> Mesh. Scales, drops the base onto y = 0, writes it out."""
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for mesh in groups.values():
            for k in range(0, len(mesh.p), 3):
                for a in range(3):
                    lo[a] = min(lo[a], mesh.p[k + a] * scale)
                    hi[a] = max(hi[a], mesh.p[k + a] * scale)
        lift = -lo[1] if ground else 0
        entry = {'parts': {}, 'min': [round(lo[0], 3), 0 if ground else round(lo[1], 3), round(lo[2], 3)],
                 'max': [round(hi[0], 3), round(hi[1] + lift, 3), round(hi[2], 3)]}
        for key, mesh in groups.items():
            if not mesh.i:
                continue
            p = [v * scale + (lift if k % 3 == 1 else 0) for k, v in enumerate(mesh.p)]
            part = {'vertices': len(p) // 3, 'indices': len(mesh.i), 'p': put(p, 'f'), 'n': put(mesh.n, 'f'),
                    'uv': put(mesh.uv, 'f'), 'i': put(mesh.i, 'I')}
            if mesh.c:
                part['c'] = put(mesh.c, 'f')
            entry['parts'][key] = part
        pieces[name] = entry

    # ---- Ultimate Buildings: finished buildings and parts, palette "skins"
    palette = {skin: save_image(f'UB_{skin}.png', Image.open(os.path.join(UB, 'Textures', f'Texture_{skin}.png')), lossless=True)
               for skin in UB_SKINS + ['Signs', 'Casino']}
    materials['ub'] = {'base': palette['Blue'], 'skins': [palette[s] for s in UB_SKINS], 'pixel': True}
    materials['ub-glass'] = {'base': None, 'color': [0.45, 0.54, 0.6, 1], 'glass': True}
    materials['ub-signs'] = {'base': palette['Signs'], 'pixel': True}
    materials['ub-casino'] = {'base': palette['Casino'], 'pixel': True}
    folder = os.path.join(UB, 'Finished Textured Buildings', 'OBJ')
    for f in sorted(os.listdir(folder)):
        if f.endswith('.obj'):
            groups = read_obj(os.path.join(folder, f), UB_SCALE)
            add_piece('ub/' + f[:-4], {('ub-glass' if k == 'glass' else 'ub'): m for k, m in groups.items()})
    folder = os.path.join(UB, 'Base Modular Parts', 'OBJ')
    for name in UB_PARTS:
        groups = read_obj(os.path.join(folder, name + '.obj'), UB_SCALE)
        key = 'ub-signs' if name.startswith('Sign_') else 'ub-casino' if name == 'CasinoSign' else 'ub'
        merged = Mesh()
        for m in groups.values():  # signs and parts: one palette, no glass split
            base = len(merged.p) // 3
            merged.p += m.p
            merged.n += m.n
            merged.uv += m.uv
            merged.i += [base + t for t in m.i]
        add_piece('ub/' + name, {key: merged}, ground=not name.startswith('Sign') and name != 'CasinoSign')

    # ---- glb models: textured materials keep their texture; flat colours go to vertex colours
    def pack_glb(path, name, scale):
        groups = {}
        for entry in read_glb(path):
            mat = entry['material']
            pbr = mat.get('pbrMetallicRoughness', {})
            colour = pbr.get('baseColorFactor', [1, 1, 1, 1])
            if entry['image']:
                tex = save_image(entry['image'][0], entry['image'][1], size=512)
                key = 'town-' + os.path.splitext(tex)[0]
                if key not in materials:
                    materials[key] = {'base': tex, 'color': colour, 'cutout': mat.get('alphaMode') in ('BLEND', 'MASK'),
                                      'doubleSided': bool(mat.get('doubleSided')) or mat.get('alphaMode') == 'BLEND'}
                mesh = groups.setdefault(key, Mesh())
                src = entry['mesh']
                base = len(mesh.p) // 3
                mesh.p += src.p
                mesh.n += src.n
                mesh.uv += src.uv
                mesh.i += [base + t for t in src.i]
            else:
                # Flat colour: into vertex colours (sRGB-ish base colour factors as they are).
                mesh = groups.setdefault('town-vcolor', Mesh())
                src = entry['mesh']
                base = len(mesh.p) // 3
                mesh.p += src.p
                mesh.n += src.n
                mesh.uv += src.uv
                mesh.c += colour[:3] * (len(src.p) // 3)
                mesh.i += [base + t for t in src.i]
        add_piece(name, groups, scale)

    materials['town-vcolor'] = {'base': None, 'color': [1, 1, 1, 1], 'vertexColors': True}
    for name, scale in NATURE_SCALES.items():
        pack_glb(os.path.join(NATURE, name + '.glb'), 'nature/' + name, scale)
    for name, height in PROP_HEIGHTS.items():
        path = os.path.join(PROPS, name + '.glb')
        # Measure first, then scale to the real height.
        lo, hi = 1e9, -1e9
        for entry in read_glb(path):
            ys = entry['mesh'].p[1::3]
            lo, hi = min(lo, min(ys)), max(hi, max(ys))
        pack_glb(path, 'prop/' + name, height / (hi - lo))

    # A tileable lawn: soft green noise in two scales.
    import random
    random.seed(7)
    size = 256
    grass = Image.new('RGB', (size, size))
    px = grass.load()
    blobs = [[random.random() for _ in range(16)] for _ in range(16)]
    for y in range(size):
        for x in range(size):
            b = blobs[(y * 16 // size)][(x * 16 // size)]
            n = random.random()
            g = 0.55 + 0.25 * b + 0.2 * n
            px[x, y] = (int(78 * g), int(140 * g), int(62 * g))
    materials['town-lawn'] = {'base': save_image('lawn.png', grass)}

    open(os.path.join(OUT, 'pieces.bin'), 'wb').write(blob)
    json.dump({'pieces': pieces, 'materials': materials}, open(os.path.join(OUT, 'pieces.json'), 'w'), separators=(',', ':'))
    print(f'{len(pieces)} pieces, {len(materials)} materials, {len(blob) / 1e6:.1f} MB geometry, {len(saved)} textures')


if __name__ == '__main__':
    main()
