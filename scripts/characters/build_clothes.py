# Builds the mix-and-match clothing for one base body (Body_Male / Body_Female) in Blender.
#
# Most pieces are cut from the body's own surface with clean planes (so they're skinned exactly like
# the skin under them and follow every animation), welded, loosened away from the limb or torso axis,
# smoothed (fabric, not anatomy), pushed a few millimetres outside the skin and given a real
# thickness. Skirts and the backpack are generated and skinned from the nearest body surface.
# Each piece has up to three colour zones, materials "<id>.main", "<id>.trim" and "<id>.detail",
# which the game tints. One mesh per piece (named by its id) goes into one GLB per body, plus a JSON
# saying which body vertices each piece fully covers, so the game can hide that skin.
#
# blender -b -P scripts/characters/build_clothes.py -- <Body_X.gltf> <out.glb> <out-cover.json>
import base64
import heapq
import json
import math
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

body_path, out_path, cover_path = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=body_path)
scene = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not body:
        bpy.data.objects.remove(o)
female = 'Female' in body.name
body_bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
body_verts = [v.co.copy() for v in body.data.vertices]

# ------------------------------------------------------------------ landmarks (Blender: +X left, -Y front, +Z up)

bones = arm.data.bones
head = lambda name: bones[name].head_local
L = dict(
    neck=head('neck_01').z, chest=head('spine_03').z, mid=head('spine_02').z, waist=head('spine_01').z,
    hip=head('thigh_l').z, knee=head('calf_l').z, ankle=head('foot_l').z,
    shoulder=head('upperarm_l').x, elbow=head('lowerarm_l').x, wrist=head('hand_l').x, armz=head('upperarm_l').z,
    legx=head('thigh_l').x, top=max(v.z for v in body_verts),
)
L['knuckle'] = L['wrist'] + (0.075 if female else 0.085)
print('landmarks', {k: round(v, 3) for k, v in L.items()})


def slices(select, axis, step=0.04):
    """Centroid and half-extents of body vertices per slice along an axis, as a lookup function."""
    bins = {}
    for co in body_verts:
        if select(co):
            bins.setdefault(round(co[axis] / step), []).append(co)
    table = {}
    for k, cos in bins.items():
        c = sum(cos, Vector()) / len(cos)
        table[k] = (c, max(abs(p.x - c.x) for p in cos), max(abs(p.y - c.y) for p in cos), max(abs(p.z - c.z) for p in cos))
    keys = sorted(table)

    def at(value):
        k = round(value / step)
        k = min(keys, key=lambda j: abs(j - k))
        return table[k]
    return at


torso_at = slices(lambda c: abs(c.x) < L['shoulder'] - 0.02 and L['hip'] - 0.05 < c.z < L['neck'], 2)
side = lambda c: 1 if c.x >= 0 else -1


def along(points, key, value):
    """Interpolates a polyline of joint positions by one coordinate (z for legs, |x| for arms)."""
    for a, b in zip(points, points[1:]):
        ka, kb = key(a), key(b)
        if min(ka, kb) <= value <= max(ka, kb) and ka != kb:
            return a.lerp(b, (value - ka) / (kb - ka))
    return min(points, key=lambda p: abs(key(p) - value)).copy()


LEG = {s: [head(f'{n}_{"l" if s > 0 else "r"}').copy() for n in ('thigh', 'calf', 'foot')] for s in (1, -1)}
ARM = {s: [head(f'{n}_{"l" if s > 0 else "r"}').copy() for n in ('upperarm', 'lowerarm', 'hand')] for s in (1, -1)}
leg_centre = lambda s, z: along(LEG[s], lambda p: p.z, z)
arm_centre = lambda s, x: along(ARM[s], lambda p: p.x, x)


def axis_centre(c):
    """The nearest point on the limb or torso axis (arms run along X, legs and torso along Z)."""
    if abs(c.x) > L['shoulder'] - 0.01 and c.z > L['chest'] - 0.06:
        a = arm_centre(side(c), c.x)
        return Vector((c.x, a.y, a.z)), 'arm'
    if c.z < L['hip'] - 0.04:
        a = leg_centre(side(c), c.z)
        return Vector((a.x, a.y, c.z)), 'leg'
    a = torso_at(c.z)[0]
    return Vector((0, a.y, c.z)), 'torso'


# ------------------------------------------------------------------ mesh helpers

def edit(obj, fn):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result = fn(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return result


def piece(name, keep, cuts=()):
    """A welded copy of the body surface: cut along planes, faces outside `keep` deleted."""
    me = body.data.copy()
    me.materials.clear()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    for g in body.vertex_groups:  # same order, so the copied weights keep their bones
        obj.vertex_groups.new(name=g.name)

    def run(bm):
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        for co, no in cuts:
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6,
                                   plane_co=Vector(co), plane_no=Vector(no).normalized())
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        # Keep only the biggest connected parts (drops slivers left by the cuts).
        seen, parts = set(), []
        for f in bm.faces:
            if f.index in seen:
                continue
            stack, part = [f], []
            seen.add(f.index)
            while stack:
                g = stack.pop()
                part.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h.index not in seen:
                            seen.add(h.index)
                            stack.append(h)
            parts.append(part)
        bm.faces.index_update()
        small = [f for part in parts if len(part) < 12 for f in part]
        bmesh.ops.delete(bm, geom=small, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    edit(obj, lambda bm: (bm.faces.index_update(), run(bm)))
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)
    return obj


def smooth(obj, iterations, factor=0.5, hems=False):
    """Averages vertices with their neighbours; hem (boundary) vertices stay put unless `hems`."""
    def run(bm):
        verts = [v for v in bm.verts if hems or not v.is_boundary]
        for _ in range(iterations):
            bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    edit(obj, run)


def loosen(obj, amount):
    """Pushes the surface away from its limb/torso axis: amount(c, part) -> fraction."""
    for v in obj.data.vertices:
        centre, part = axis_centre(v.co)
        k = amount(v.co, part)
        if k:
            v.co = centre + (v.co - centre) * (1 + k)


def inflate(obj, distance):
    def run(bm):
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * distance
    edit(obj, run)


def outside(obj, gap):
    """Moves any vertex closer to the skin than `gap` (or under it) out along the skin normal."""
    for v in obj.data.vertices:
        hit, normal, _, _ = body_bvh.find_nearest(v.co)
        if hit is None:
            continue
        d = (v.co - hit).dot(normal)
        if d < gap:
            v.co = hit + normal * gap + (v.co - hit - normal * d)


def materials(obj, item, colours):
    for slot, colour in zip(('main', 'trim', 'detail'), colours):
        name = f'{item}.{slot}'
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        rgb = tuple(int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
        lin = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
        mat.diffuse_color = (*lin, 1)
        try:
            mat.use_nodes = True
        except Exception:
            pass
        bsdf = mat.node_tree.nodes.get('Principled BSDF') if mat.node_tree else None
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (*lin, 1)
            bsdf.inputs['Roughness'].default_value = 0.85
        obj.data.materials.append(mat)


def paint(obj, pred, slot):
    """Sets faces whose centre satisfies pred(centre, normal) to a colour zone (0 main, 1 trim, 2 detail)."""
    for p in obj.data.polygons:
        if pred(p.center, p.normal):
            p.material_index = slot


def band(obj, width, slot, where=lambda c: True):
    """Paints faces within `width` (along the surface) of an open edge: hems, cuffs, collars, rips."""
    def run(bm):
        dist = {v: 0.0 for v in bm.verts if v.is_boundary and where(v.co)}
        queue = [(0.0, v.index, v) for v in dist]
        heapq.heapify(queue)
        while queue:
            d, _, v = heapq.heappop(queue)
            if d > dist.get(v, 1e9) or d > width:
                continue
            for e in v.link_edges:
                u = e.other_vert(v)
                nd = d + e.calc_length()
                if nd < dist.get(u, 1e9):
                    dist[u] = nd
                    heapq.heappush(queue, (nd, u.index, u))
        for f in bm.faces:
            if all(dist.get(v, 1e9) <= width for v in f.verts):
                f.material_index = slot
    edit(obj, run)


def solidify(obj, thickness):
    mod = obj.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = -1
    mod.use_rim = True
    apply_modifiers(obj)


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    for mod in list(obj.modifiers):
        if mod.type != 'ARMATURE':
            bpy.ops.object.modifier_apply(modifier=mod.name)


def weights_like_body(obj, points=None):
    """Skins generated geometry from the nearest body surface (weights blended over that face), per
    vertex, or from the given points instead (one per vertex)."""
    groups = {g.index: g.name for g in body.vertex_groups}
    for name in groups.values():
        if name not in obj.vertex_groups:
            obj.vertex_groups.new(name=name)
    out = []
    for co in points or [v.co for v in obj.data.vertices]:
        hit, _, index, _ = body_bvh.find_nearest(co)
        poly = body.data.polygons[index]
        acc = {}
        total = 0
        for vi in poly.vertices:
            w_dist = 1 / max(1e-4, (body.data.vertices[vi].co - hit).length)
            for g in body.data.vertices[vi].groups:
                acc[g.group] = acc.get(g.group, 0) + g.weight * w_dist
            total += w_dist
        out.append({groups[k]: w / total for k, w in acc.items()})
    return out


def set_weights(obj, per_vertex):
    for v, weights in zip(obj.data.vertices, per_vertex):
        for g in obj.vertex_groups:
            g.remove([v.index])
        for name, w in weights.items():
            if w > 1e-3:
                (obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)).add([v.index], w, 'REPLACE')


def rigid(obj, bone):
    set_weights(obj, [{bone: 1.0}] * len(obj.data.vertices))


def join(target, *others):
    bpy.context.view_layer.objects.active = target
    for o in bpy.context.selected_objects:
        o.select_set(False)
    target.select_set(True)
    for o in others:
        o.select_set(True)
    bpy.ops.object.join()
    return target


def mesh_bvh(obj):
    return BVHTree.FromPolygons([v.co for v in obj.data.vertices], [p.vertices[:] for p in obj.data.polygons])


def stuck_box(target, origin, direction, size, slot, bevel=0.006, lift=0.0, segments=2):
    """A bevelled box stuck on a garment where a ray from origin meets it: pockets, flaps, pads.
    size = (width, height, depth), depth along the surface normal."""
    bvh = mesh_bvh(target)
    hit, normal, _, _ = bvh.ray_cast(Vector(origin), Vector(direction).normalized(), 1.0)
    if hit is None:
        raise RuntimeError(f'stuck_box missed {target.name} from {origin}')
    w, h, d = size
    n = Vector((normal.x, normal.y, 0)).normalized()
    bpy.ops.mesh.primitive_cube_add(size=1, location=hit + n * (d / 2 - 0.003 + lift))
    box = bpy.context.active_object
    box.scale = (w, d, h)
    box.rotation_euler = (0, 0, math.atan2(-n.x, n.y))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    mod = box.modifiers.new('round', 'BEVEL')
    mod.width = bevel
    mod.segments = segments
    apply_modifiers(box)
    box.data.materials.clear()
    for m in target.data.materials:
        box.data.materials.append(m)
    for p in box.data.polygons:
        p.material_index = slot
    # Rigid: the whole box takes the skin weights where it sits, so it never shears across a joint.
    set_weights(box, weights_like_body(box, [hit] * len(box.data.vertices)))
    return box


def cargo_pockets(obj, z, size=(0.11, 0.13, 0.014)):
    """A patch pocket with a flap on the outside of each thigh."""
    out = []
    for s in (1, -1):
        a = leg_centre(s, z)
        out.append(stuck_box(obj, (a.x, a.y, z), (s, 0, 0), size, 2))
        out.append(stuck_box(obj, (a.x, a.y, z + size[1] / 2), (s, 0, 0), (size[0] * 1.06, 0.03, size[2] + 0.006), 1))
    return out


def ribbon(target, samples, width, slot, lift=0.002):
    """A sewn-on stripe: a thin band laid on a finished garment where rays meet it.
    samples = [(origin, direction, along)], `along` being the stripe's running direction."""
    bvh = mesh_bvh(target)
    bm = bmesh.new()
    rows = []
    for origin, direction, along in samples:
        hit, normal, _, _ = bvh.ray_cast(Vector(origin), Vector(direction).normalized(), 1.0)
        if hit is None:
            continue
        across = normal.cross(Vector(along)).normalized() * (width / 2)
        p = hit + normal * lift
        rows.append((bm.verts.new(p - across), bm.verts.new(p + across), normal.copy()))
    for (a, b, n), (c, d, _) in zip(rows, rows[1:]):
        face = bm.faces.new((a, b, d, c))
        face.normal_update()
        if face.normal.dot(n) < 0:
            face.normal_flip()
    me = bpy.data.meshes.new('ribbon')
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new('ribbon', me)
    scene.collection.objects.link(obj)
    for m in target.data.materials:
        obj.data.materials.append(m)
    for p in obj.data.polygons:
        p.material_index = slot
    set_weights(obj, weights_like_body(obj))
    solidify(obj, 0.0015)
    return obj


def steps(a, b, step=0.02):
    n = max(2, int(abs(b - a) / step) + 1)
    return [a + (b - a) * i / (n - 1) for i in range(n)]


def patch(src, keep, lift, thickness, slot):
    """A raised patch copied from part of a finished garment's surface: pockets, pads, straps."""
    obj = src.copy()
    obj.data = src.data.copy()
    scene.collection.objects.link(obj)
    edit(obj, lambda bm: bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median(), f.normal)], context='FACES'))
    edit(obj, lambda bm: bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'))
    inflate(obj, lift)
    for p in obj.data.polygons:
        p.material_index = slot
    solidify(obj, thickness)
    return obj


# ------------------------------------------------------------------ plane shorthands

X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
at_z = lambda z: ((0, 0, z), Z)
at_x = lambda x: ((x, 0, 0), X)


def neck_plane(z, dip):
    """A neckline: a plane through z at the centre, sloping down to the front by `dip` (rise over run)."""
    no = Vector((0, -dip, 1)).normalized()
    return (0, 0, z), no, lambda c: (c - Vector((0, 0, z))).dot(no) < 0


def outward(c, centre, cos):
    """True on the outer side (left or right) of a vertical axis through centre, within acos(cos).
    Stripes picked this way follow the mesh's own lengthwise edges, so they come out clean."""
    dx, dy = c.x - centre.x, c.y - centre.y
    return side(c) * dx / max(1e-6, math.hypot(dx, dy)) > cos


ARM_RADIUS = 0.055 if female else 0.065


def ARMS(c):
    """True on an arm (near the arm bones), not on the side of the chest, however wide it is."""
    if abs(c.x) < L['shoulder'] - 0.02:
        return False
    a = arm_centre(side(c), c.x)
    return math.hypot(c.y - a.y, c.z - a.z) < ARM_RADIUS or abs(c.x) > L['shoulder'] + 0.06


# ------------------------------------------------------------------ the pieces

ITEMS = {}


def item(fn):
    ITEMS[fn.__name__] = fn
    return fn


def top(name, sleeve, hem, neck_z, dip, loose=0.07, sleeve_loose=0.12, gap=0.009, armhole=None, colours=('#2b2b30', '#1b1b1f', '#c9c9c9'), extra=(), zones=()):
    """A shirt-like top: sleeve end at fraction `sleeve` of the arm (0 = shoulder, 1 = wrist; None = sleeveless)."""
    co, no, below_neck = neck_plane(neck_z, dip)
    cuts = [at_z(hem), (co, no)]
    if sleeve is None:
        cut = armhole
        keep = lambda c: below_neck(c) and c.z > hem and not ARMS(c) and (c.z < L['armz'] - 0.07 or abs(c.x) < cut)
        cuts += [at_x(cut), at_x(-cut)]
    else:
        cut = L['shoulder'] + (L['wrist'] - L['shoulder']) * sleeve
        keep = lambda c: below_neck(c) and c.z > hem and abs(c.x) < cut
        cuts += [at_x(cut), at_x(-cut)]
    obj = piece(name, keep, cuts + list(extra))
    materials(obj, name, colours)
    for pred, slot in zones:
        paint(obj, pred, slot)

    def amount(c, part):
        if part == 'arm':
            return sleeve_loose
        if part == 'torso':
            # Hangs from the chest: looser lower down.
            t = max(0.0, min(1.0, (L['chest'] - c.z) / max(0.01, L['chest'] - hem)))
            return loose * (0.4 + 0.6 * t)
        return 0
    loosen(obj, amount)
    smooth(obj, 8, 0.5)
    outside(obj, gap)
    smooth(obj, 2, 0.3)
    outside(obj, gap)
    return obj


@item
def tee():
    obj = top('tee', 0.22, L['hip'] + 0.01, L['neck'] - 0.005, 0.25)
    band(obj, 0.018, 1)
    solidify(obj, 0.003)
    return obj, 'top'


@item
def tank():
    obj = top('tank', None, L['hip'] + 0.01, L['neck'] - 0.02, 0.6, armhole=L['shoulder'] - (0.03 if female else 0.045),
              colours=('#f2f2ee', '#d8d8d2', '#d8d8d2'))
    band(obj, 0.012, 1)
    solidify(obj, 0.003)
    return obj, 'top'


@item
def crop():
    px, pz = L['shoulder'] - 0.05, L['chest'] + 0.03
    obj = top('crop', 0.14, L['mid'] + 0.03, L['neck'] - 0.03, 0.5, loose=0.03,
              colours=('#7b3fc4', '#f2f2f2', '#1b1b1f'), extra=[at_x(px), at_x(-px), at_z(pz)],
              zones=[(lambda c, n: abs(c.x) < px and c.z > pz, 1)])
    band(obj, 0.02, 1)
    solidify(obj, 0.003)
    return obj, 'top'


@item
def track():
    """A zipped track jacket: high collar, contrast yoke, stripes down the sides and along the sleeves."""
    yoke_z = L['chest'] + 0.1
    obj = top('track', 0.97, L['hip'] - 0.01, L['neck'] + 0.045, 0.12, loose=0.08, sleeve_loose=0.14,
              colours=('#2459c9', '#86b6ff', '#e8eef7'),
              extra=[at_z(yoke_z), at_x(0.008), at_x(-0.008)],
              zones=[(lambda c, n: not ARMS(c) and c.z > yoke_z, 1),
                     (lambda c, n: abs(c.x) < 0.008 and c.y < 0 and c.z < yoke_z, 2)])
    band(obj, 0.035, 1, where=lambda c: c.z > L['neck'] - 0.02)
    band(obj, 0.03, 1, where=lambda c: abs(c.x) > L['elbow'])
    band(obj, 0.03, 2, where=lambda c: c.z < L['waist'])
    stripes = []
    for s in (1, -1):
        stripes.append(ribbon(obj, [((0, torso_at(z)[0].y, z), (s, 0, 0), (0, 0, 1)) for z in steps(L['armz'] - 0.09, L['hip'] + 0.01)], 0.035, 1))
        stripes.append(ribbon(obj, [(arm_centre(s, x), (0, 0, 1), (1, 0, 0)) for x in steps(s * (L['shoulder'] + 0.03), s * (L['wrist'] - 0.05))], 0.03, 1))
    solidify(obj, 0.003)
    return join(obj, *stripes), 'top'


@item
def tactical():
    """A field shirt: collar, sleeves rolled to the elbow, two chest pockets."""
    obj = top('tactical', 0.5, L['hip'] - 0.005, L['neck'] + 0.015, 0.3, loose=0.08, sleeve_loose=0.16,
              colours=('#5f6b3a', '#4b5530', '#3e4628'))
    band(obj, 0.04, 1, where=lambda c: abs(c.x) > L['shoulder'] + 0.05)
    band(obj, 0.025, 1, where=lambda c: c.z > L['chest'])
    z = L['chest'] - 0.02 if not female else L['chest'] + 0.04
    pockets = []
    for s in (1, -1):
        pockets.append(stuck_box(obj, (s * 0.08, 0, z), (0, -1, 0), (0.085, 0.095, 0.01), 2, 0.003))
        pockets.append(stuck_box(obj, (s * 0.08, 0, z + 0.045), (0, -1, 0), (0.09, 0.028, 0.014), 1, 0.003))
    solidify(obj, 0.003)
    return join(obj, *pockets), 'top'


@item
def hoodie():
    """A pullover hoodie: long sleeves with cuffs, a kangaroo pocket and the hood folded behind the neck."""
    obj = top('hoodie', 0.95, L['hip'] - 0.03, L['neck'] + 0.01, 0.2, loose=0.12, sleeve_loose=0.2, gap=0.012,
              colours=('#d9d4c7', '#c4bfb1', '#8c877a'))
    band(obj, 0.04, 1, where=lambda c: c.z < L['waist'] or abs(c.x) > L['elbow'])
    pocket = stuck_box(obj, (0, 0, L['hip'] + 0.09), (0, -1, 0), (0.24, 0.13, 0.012), 1, 0.005)
    solidify(obj, 0.004)
    # The hood: a squashed torus resting on the shoulders behind the neck.
    neck = torso_at(L['neck'])[0]
    bpy.ops.mesh.primitive_torus_add(major_radius=0.105, minor_radius=0.035, major_segments=28, minor_segments=10,
                                     location=(0, neck.y + 0.035, L['neck'] + 0.01))
    hood = bpy.context.active_object
    hood.scale = (1.0, 0.9, 0.55)
    hood.rotation_euler = (math.radians(-18), 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    hood.data.materials.clear()
    for m in obj.data.materials:
        hood.data.materials.append(m)
    outside(hood, 0.012)
    set_weights(hood, [{'spine_03': 0.6, 'neck_01': 0.4}] * len(hood.data.vertices))
    return join(obj, pocket, hood), 'top'


def bottom(name, cuff, loose, waist_up=0.09, gap=0.006, taper=True, colours=('#3a3f4a', '#2a2e36', '#2a2e36'), extra=(), zones=()):
    waist = L['hip'] + waist_up
    co, no, below = neck_plane(waist, 0.12)
    obj = piece(name, lambda c: below(c) and c.z > cuff, [at_z(cuff), (co, no)] + list(extra))
    materials(obj, name, colours)
    for pred, slot in zones:
        paint(obj, pred, slot)

    def amount(c, part):
        if part != 'leg':
            return loose * 0.25
        t = max(0.0, min(1.0, (L['hip'] - c.z) / (L['hip'] - L['ankle'])))
        k = loose * (1 - 0.5 * t) if taper else loose
        # Joggers gather into a cuff.
        if taper and c.z < cuff + 0.06:
            k *= (c.z - cuff) / 0.06
        return k
    loosen(obj, amount)
    smooth(obj, 8, 0.5)
    outside(obj, gap)
    smooth(obj, 2, 0.3)
    outside(obj, gap)
    band(obj, 0.035, 1, where=lambda c: c.z > L['hip'])
    return obj


@item
def cargo():
    obj = bottom('cargo', L['ankle'] + 0.04, 0.2, colours=('#3d3f45', '#2b2d31', '#2b2d31'))
    band(obj, 0.035, 1, where=lambda c: c.z < L['knee'])
    pockets = cargo_pockets(obj, L['knee'] + 0.17)
    solidify(obj, 0.003)
    return join(obj, *pockets), 'bottom'


@item
def trackpants():
    obj = bottom('trackpants', L['ankle'] + 0.03, 0.12, colours=('#1f3f9e', '#e8eef7', '#86b6ff'))
    band(obj, 0.03, 2, where=lambda c: c.z < L['knee'])
    stripes = [ribbon(obj, [(leg_centre(s, z), (s, 0, 0), (0, 0, 1)) for z in steps(L['hip'] - 0.02, L['ankle'] + 0.05)], 0.028, 1)
               for s in (1, -1)]
    solidify(obj, 0.003)
    return join(obj, *stripes), 'bottom'


@item
def shorts():
    obj = bottom('shorts', L['knee'] + 0.08, 0.24, taper=False, colours=('#7a7048', '#5f5735', '#5f5735'))
    band(obj, 0.03, 1, where=lambda c: c.z < L['hip'] - 0.1)
    pockets = cargo_pockets(obj, L['knee'] + 0.21, (0.1, 0.1, 0.014))
    solidify(obj, 0.003)
    return join(obj, *pockets), 'bottom'


@item
def ripped():
    """Skin-tight ripped jeans: holes at the knees and thighs with frayed light edges."""
    rips = [  # (side, z, half-height, half-width): front of the leg
        (1, L['knee'] + 0.01, 0.045, 0.05), (-1, L['knee'] - 0.01, 0.04, 0.05),
        (1, L['knee'] + 0.2, 0.03, 0.045), (-1, L['knee'] - 0.17, 0.025, 0.035),
    ]
    obj = bottom('ripped', L['ankle'] + 0.03, 0.02, taper=False, gap=0.004, colours=('#1c1c22', '#d9d4c7', '#d9d4c7'))

    def torn(c):
        for s, z, hh, hw in rips:
            a = leg_centre(s, c.z)
            if side(c) == s and c.y < a.y and ((c.z - z) / hh) ** 2 + ((c.x - a.x) / hw) ** 2 < 1:
                return True
        return False
    edit(obj, lambda bm: bmesh.ops.delete(bm, geom=[f for f in bm.faces if torn(f.calc_center_median())], context='FACES'))
    band(obj, 0.008, 1, where=lambda c: L['ankle'] + 0.06 < c.z < L['hip'] - 0.05)
    solidify(obj, 0.003)
    return obj, 'bottom'


def skirt_mesh(name, z0, z1, flare, pleats=0, gap=0.012):
    """A skirt from z0 down to z1, widening by `flare`, pleated if asked. Skinned to the hips and thighs."""
    rings, segs = 14, 48
    bm = bmesh.new()
    rows = []
    widest = [0.0, 0.0]
    for r in range(rings + 1):
        t = r / rings
        z = z0 + (z1 - z0) * t
        c, hx, hy, _ = torso_at(z) if z > L['hip'] - 0.02 else torso_at(L['hip'] - 0.02)
        if z <= L['hip']:
            # Below the hip: as wide as the hips (both legs together), widening with t.
            lo = [p for p in body_verts if abs(p.z - z) < 0.03 and p.z < L['hip']]
            if lo:
                hx = max(abs(p.x) for p in lo)
                hy = (max(p.y for p in lo) - min(p.y for p in lo)) / 2
                c = Vector((0, (max(p.y for p in lo) + min(p.y for p in lo)) / 2, z))
        widest = [max(widest[0], hx), max(widest[1], hy)]
        ax, ay = widest[0] + gap, widest[1] + gap
        k = 1 + flare * t * t
        row = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            pleat = 1 + (pleats * t * (0.5 + 0.5 * math.cos(a * 16)) if pleats else 0)
            row.append(bm.verts.new((math.cos(a) * ax * k * pleat, c.y + math.sin(a) * ay * k * pleat, z)))
        rows.append(row)
    for r in range(rings):
        for s in range(segs):
            a, b = rows[r][s], rows[r][(s + 1) % segs]
            c, d = rows[r + 1][(s + 1) % segs], rows[r + 1][s]
            bm.faces.new((a, d, c, b))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    edit(obj, lambda bm: bmesh.ops.recalc_face_normals(bm, faces=bm.faces))
    outside(obj, gap)
    # Skin: like the body near the waist, then hips and thighs (each side by how far round it is).
    near = weights_like_body(obj)
    out = []
    for v, w0 in zip(obj.data.vertices, near):
        t = (z0 - v.co.z) / (z0 - z1)
        s = max(-1.0, min(1.0, v.co.x / 0.09))
        legs = 0.55 * t
        custom = {'pelvis': 1 - legs, 'thigh_l': legs * (1 + s) / 2, 'thigh_r': legs * (1 - s) / 2}
        blend = max(0.0, min(1.0, (t - 0.1) / 0.3))
        mixed = {k: w0.get(k, 0) * (1 - blend) + custom.get(k, 0) * blend for k in set(w0) | set(custom)}
        out.append(mixed)
    set_weights(obj, out)
    return obj


@item
def skirt():
    obj = skirt_mesh('skirt', L['hip'] + 0.07, L['hip'] - 0.27, 0.35, pleats=0.05)
    materials(obj, 'skirt', ('#2b2b33', '#c43a5a', '#22222a'))
    band(obj, 0.025, 1, where=lambda c: c.z < L['hip'] - 0.2)
    band(obj, 0.03, 2, where=lambda c: c.z > L['hip'])
    solidify(obj, 0.004)
    return obj, 'bottom'


@item
def dress():
    """A sundress: a fitted bodice on straps, a belt, and a flared skirt to the knee."""
    top_z = L['chest'] + (0.075 if female else 0.03)
    strap = (L['shoulder'] - 0.02) * 0.55
    cuts = [at_z(top_z), at_z(L['hip'] - 0.01)] + [at_x(s * (strap + d)) for s in (1, -1) for d in (-0.018, 0.018)]
    co, no, below_neck = neck_plane(L['neck'] - 0.015, 0.2)
    keep = lambda c: c.z > L['hip'] - 0.01 and not ARMS(c) and below_neck(c) and (
        c.z < top_z or abs(abs(c.x) - strap) < 0.018)
    bodice = piece('dress', keep, cuts + [(co, no)])
    smooth(bodice, 6, 0.5)
    outside(bodice, 0.007)
    materials(bodice, 'dress', ('#2f9a52', '#1f6e3a', '#e9d9a6'))
    band(bodice, 0.012, 1, where=lambda c: c.z > top_z - 0.01)
    skirt_part = skirt_mesh('dress-skirt', L['hip'] + 0.01, L['knee'] - 0.02, 0.45)
    skirt_part.data.materials.clear()
    for m in bodice.data.materials:
        skirt_part.data.materials.append(m)
    band(skirt_part, 0.03, 1, where=lambda c: c.z < L['knee'] + 0.05)
    belt = piece('dress-belt', lambda c: L['waist'] - 0.035 < c.z < L['waist'] + 0.01,
                 [at_z(L['waist'] - 0.035), at_z(L['waist'] + 0.01)])
    smooth(belt, 4, 0.5)
    outside(belt, 0.014)
    for m in bodice.data.materials:
        belt.data.materials.append(m)
    paint(belt, lambda c, n: True, 2)
    solidify(belt, 0.006)
    solidify(bodice, 0.003)
    solidify(skirt_part, 0.003)
    return join(bodice, skirt_part, belt), 'full'


def shoe(name, height, puff, colours, sole=0.032, cuff=0.0):
    obj = piece(name, lambda c: c.z < height, [at_z(height)])

    # Keep only the hulls: rebuild the mesh from each foot's hull, open at the top.
    def rebuild(bm):
        feet = []
        for s in (1, -1):
            pts = [v.co.copy() for v in bm.verts if side(v.co) == s]
            feet.append(pts)
        bm.clear()
        for pts in feet:
            verts = [bm.verts.new(p) for p in pts]
            result = bmesh.ops.convex_hull(bm, input=verts)
            junk = {v for v in result['geom_interior'] + result['geom_unused'] if isinstance(v, bmesh.types.BMVert)}
            bmesh.ops.delete(bm, geom=list(junk), context='VERTS')
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bm.normal_update()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > height - 0.004], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    edit(obj, rebuild)
    mod = obj.modifiers.new('fewer', 'DECIMATE')
    mod.ratio = 0.3
    mod = obj.modifiers.new('round', 'SUBSURF')
    mod.levels = 2
    apply_modifiers(obj)
    inflate(obj, puff * 0.5)
    outside(obj, puff * 0.5)
    heel = head('foot_l').y
    for v in obj.data.vertices:  # a little longer at the toe
        if v.co.y < heel:
            v.co.y = heel + (v.co.y - heel) * 1.07
    for v in obj.data.vertices:  # flat sole
        if v.co.z < 0.015:
            v.co.z = 0.0
    smooth(obj, 3, 0.3)
    for v in obj.data.vertices:
        if v.co.z < 0.004:
            v.co.z = 0.0
    materials(obj, name, colours)
    paint(obj, lambda c, n: c.z < sole, 1)
    if cuff:
        band(obj, cuff, 2)
    set_weights(obj, weights_like_body(obj))
    solidify(obj, 0.004)
    return obj


@item
def sneakers():
    return shoe('sneakers', L['ankle'] + 0.045, 0.014, ('#f4f4f2', '#f4f4f2', '#d0d0cc'), sole=0.035), 'shoes'


@item
def hightops():
    return shoe('hightops', L['ankle'] + 0.11, 0.014, ('#1d1d22', '#f4f4f2', '#c43a5a'), sole=0.04, cuff=0.025), 'shoes'


@item
def boots():
    return shoe('boots', L['ankle'] + 0.2, 0.012, ('#3b3326', '#1d1a15', '#5c513d'), sole=0.03, cuff=0.03), 'shoes'


@item
def gloves():
    """Fingerless gloves with a cuff."""
    cut0, cut1 = L['wrist'] - 0.05, L['knuckle']
    obj = piece('gloves', lambda c: cut0 < abs(c.x) < cut1, [at_x(cut0), at_x(-cut0), at_x(cut1), at_x(-cut1)])
    smooth(obj, 4, 0.4)
    outside(obj, 0.004)
    materials(obj, 'gloves', ('#1d1d22', '#3a3a42', '#3a3a42'))
    band(obj, 0.022, 1, where=lambda c: abs(c.x) < L['wrist'])
    solidify(obj, 0.003)
    return obj, 'hands'


@item
def kneepads():
    holder = bpy.data.objects.new('kneepads', bpy.data.meshes.new('kneepads'))
    scene.collection.objects.link(holder)
    materials(holder, 'kneepads', ('#f2f2f2', '#2b2b30', '#2b2b30'))
    pads = []
    for s in (1, -1):
        a = leg_centre(s, L['knee'] + 0.01)
        pads.append(stuck_box(body, (a.x, a.y, a.z), (0, -1, 0), (0.11, 0.14, 0.028), 0, 0.012, lift=0.012, segments=4))
        pads.append(stuck_box(body, (a.x, a.y, a.z + 0.085), (0, -1, 0), (0.115, 0.022, 0.022), 1, 0.006, lift=0.006))
        pads.append(stuck_box(body, (a.x, a.y, a.z - 0.085), (0, -1, 0), (0.11, 0.022, 0.022), 1, 0.006, lift=0.004))
    for p in pads:
        p.data.materials.clear()
        for m in holder.data.materials:
            p.data.materials.append(m)
    obj = join(pads[0], *pads[1:])
    bpy.data.objects.remove(holder)
    return obj, 'knees'


@item
def backpack():
    back = torso_at(L['chest'] - 0.05)
    w, h, d = (0.3, 0.4, 0.13) if not female else (0.27, 0.36, 0.12)
    centre = (0, back[0].y + back[2] + d / 2 + 0.01, L['chest'] - 0.08)
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    bag = bpy.context.active_object
    bag.name = 'backpack'
    bag.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = bag.modifiers.new('round', 'BEVEL')
    mod.width = 0.035
    mod.segments = 4
    apply_modifiers(bag)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, centre[1] + d / 2 + 0.02, centre[2] - 0.08))
    pocket = bpy.context.active_object
    pocket.scale = (w * 0.7, 0.05, h * 0.38)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = pocket.modifiers.new('round', 'BEVEL')
    mod.width = 0.018
    mod.segments = 3
    apply_modifiers(pocket)
    for o in (bag, pocket):
        o.data.materials.clear()
    materials(bag, 'backpack', ('#26272c', '#3a3b42', '#b8b8b8'))
    for m in bag.data.materials:
        pocket.data.materials.append(m)
    for p in pocket.data.polygons:
        p.material_index = 1
    rigid(bag, 'spine_03')
    rigid(pocket, 'spine_03')
    # Straps: bands of the torso surface over each shoulder.
    straps = []
    for s in (1, -1):
        x = s * (0.085 if not female else 0.08)
        keep = lambda c, x=x: abs(c.x - x) < 0.022 and L['chest'] - 0.2 < c.z < L['neck'] + 0.01 and not ARMS(c) and (c.y > 0 or c.z > L['chest'] - 0.03)
        strap = piece(f'strap{s}', keep, [at_x(x - 0.022), at_x(x + 0.022)])
        smooth(strap, 4, 0.5)
        outside(strap, 0.014)
        strap.data.materials.clear()
        for m in bag.data.materials:
            strap.data.materials.append(m)
        paint(strap, lambda c, n: True, 1)
        solidify(strap, 0.006)
        straps.append(strap)
    return join(bag, pocket, *straps), 'back'


def ring(name, z0, z1, keep, gap, thick, colours):
    obj = piece(name, lambda c: z0 < c.z < z1 and keep(c), [at_z(z0), at_z(z1)])
    smooth(obj, 6, 0.5)
    outside(obj, gap)
    materials(obj, name, colours)
    solidify(obj, thick)
    return obj


@item
def headband():
    z = L['top'] - 0.05
    obj = ring('headband', z - 0.018, z + 0.018, lambda c: True, 0.022, 0.006, ('#f2f2f2', '#c43a5a', '#c43a5a'))
    return obj, 'head'


@item
def belt():
    z = L['hip'] + 0.07
    obj = ring('belt', z - 0.02, z + 0.02, lambda c: True, 0.016, 0.006, ('#2a221b', '#c9a24a', '#c9a24a'))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, torso_at(z)[0].y - torso_at(z)[2] - 0.022, z))
    buckle = bpy.context.active_object
    buckle.scale = (0.05, 0.012, 0.04)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    buckle.data.materials.clear()
    for m in obj.data.materials:
        buckle.data.materials.append(m)
    for p in buckle.data.polygons:
        p.material_index = 1
    set_weights(buckle, weights_like_body(buckle))
    return join(obj, buckle), 'waist'


@item
def wristbands():
    x0, x1 = L['wrist'] - 0.09, L['wrist'] - 0.035
    obj = piece('wristbands', lambda c: x0 < abs(c.x) < x1, [at_x(x0), at_x(-x0), at_x(x1), at_x(-x1)])
    smooth(obj, 4, 0.4)
    outside(obj, 0.008)
    materials(obj, 'wristbands', ('#1d1d22', '#c0c0c8', '#c0c0c8'))
    band(obj, 0.006, 1)
    solidify(obj, 0.005)
    return obj, 'wrists'


@item
def choker():
    z = L['neck'] + 0.035
    return ring('choker', z - 0.012, z + 0.012, lambda c: not ARMS(c), 0.004, 0.003, ('#141418', '#c0c0c8', '#c0c0c8')), 'neck'


# ------------------------------------------------------------------ build, skin, export

built = {}
for name, fn in ITEMS.items():
    obj, slot = fn()
    obj.name = name
    obj.data.name = name
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    built[name] = (obj, slot)
    print(f'{name:12s} {slot:8s} {len(obj.data.vertices):6d} verts')

# Which body vertices each piece hides: the skin's outward normal runs into the piece within 6 cm,
# eroded twice along the surface so nothing shows at hems.
depsgraph = bpy.context.evaluated_depsgraph_get()
neighbours = [set() for _ in body.data.vertices]
key = {}
for v in body.data.vertices:
    key.setdefault((round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5)), []).append(v.index)
twin = {i: group for group in key.values() for i in group}
for e in body.data.edges:
    a, b = e.vertices
    for i in twin[a]:
        neighbours[i].update(twin[b])
    for i in twin[b]:
        neighbours[i].update(twin[a])
cover = {}
for name, (obj, slot) in built.items():
    if slot in ('back', 'waist', 'head', 'neck', 'wrists', 'knees'):
        continue
    bvh = mesh_bvh(obj)
    hidden = set()
    for v in body.data.vertices:
        hit = bvh.ray_cast(v.co + v.normal * 0.001, v.normal, 0.06)
        if hit[0] is not None:
            hidden.add(v.index)
    for _ in range(2):
        hidden = {i for i in hidden if all(j in hidden for j in neighbours[i])}
    bits = bytearray((len(body.data.vertices) + 7) // 8)
    for i in hidden:
        bits[i >> 3] |= 1 << (i & 7)
    cover[name] = base64.b64encode(bytes(bits)).decode()
    print(f'{name:12s} hides {len(hidden)} body vertices')

for o in bpy.context.selected_objects:
    o.select_set(False)
arm.select_set(True)
for obj, _ in built.values():
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_animations=False,
                          export_texcoords=False, export_morph=False, export_yup=True)
with open(cover_path, 'w') as f:
    json.dump({'vertices': len(body.data.vertices), 'slots': {k: s for k, (_, s) in built.items()}, 'cover': cover}, f)
print('wrote', out_path)
