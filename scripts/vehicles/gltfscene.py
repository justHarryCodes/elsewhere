"""Minimal glTF reader for the vehicle catalog: node world matrices, per-primitive materials and vertices."""
import json, struct, math

def load(path):
    raw = open(path, 'rb').read()
    if raw[:4] == b'glTF':
        n, = struct.unpack_from('<I', raw, 12)
        return json.loads(raw[20:20 + n])
    return json.loads(raw)

def mat_mul(a, b):  # column-major 4x4 as flat list of 16
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]

def trs(node):
    if 'matrix' in node: return list(node['matrix'])
    tx, ty, tz = node.get('translation', [0, 0, 0])
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    sx, sy, sz = node.get('scale', [1, 1, 1])
    r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
         2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
         2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
         0, 0, 0, 1]
    for i in range(3): r[i] *= sx; r[4 + i] *= sy; r[8 + i] *= sz
    r[12], r[13], r[14] = tx, ty, tz
    return r

def apply(m, p):
    x, y, z = p
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]

def box_corners(lo, hi):
    return [[a, b, c] for a in (lo[0], hi[0]) for b in (lo[1], hi[1]) for c in (lo[2], hi[2])]

def union(boxes):
    boxes = [b for b in boxes if b]
    if not boxes: return None
    return ([min(b[0][i] for b in boxes) for i in range(3)], [max(b[1][i] for b in boxes) for i in range(3)])

def world_box(m, lo, hi):
    pts = [apply(m, p) for p in box_corners(lo, hi)]
    return ([min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)])

def evaluate(g):
    """Returns list of mesh nodes: {index, name, path, world, box, prims:[(materialName, box)]}."""
    scene = g.get('scenes', [{}])[g.get('scene', 0)]
    out = []
    mats = [m.get('name', f'mat{i}') for i, m in enumerate(g.get('materials', []))]
    def walk(i, parent, path):
        node = g['nodes'][i]
        world = mat_mul(parent, trs(node))
        name = node.get('name', f'node{i}')
        p = path + [name]
        if 'mesh' in node:
            prims = []
            for prim in g['meshes'][node['mesh']]['primitives']:
                a = g['accessors'][prim['attributes']['POSITION']]
                prims.append((mats[prim['material']] if 'material' in prim else None, world_box(world, a['min'], a['max'])))
            out.append({'index': i, 'name': name, 'path': p, 'world': world, 'box': union([b for _, b in prims]), 'prims': prims})
        for c in node.get('children', []): walk(c, world, p)
    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for r in scene.get('nodes', []): walk(r, ident, [])
    return out


def _binary_chunk(path):
    raw = open(path, 'rb').read()
    jlen, = struct.unpack_from('<I', raw, 12)
    off = 20 + jlen
    blen, = struct.unpack_from('<I', raw, off)
    return raw[off + 8: off + 8 + blen]


def node_points(path, g):
    """Scene-space vertex positions per mesh node: {node index: [(x, y, z), ...]} plus per material."""
    binc = _binary_chunk(path)
    mats = [m.get('name', f'mat{i}') for i, m in enumerate(g.get('materials', []))]
    per_node, per_material = {}, {}
    for n in evaluate(g):
        pts = []
        for prim in g['meshes'][g['nodes'][n['index']]['mesh']]['primitives']:
            a = g['accessors'][prim['attributes']['POSITION']]
            bv = g['bufferViews'][a['bufferView']]
            start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
            stride = bv.get('byteStride', 12)
            prim_pts = [apply(n['world'], struct.unpack_from('<3f', binc, start + i * stride)) for i in range(a['count'])]
            pts += prim_pts
            if 'material' in prim:
                per_material.setdefault(mats[prim['material']], []).extend(prim_pts)
        per_node[n['index']] = pts
    return per_node, per_material
