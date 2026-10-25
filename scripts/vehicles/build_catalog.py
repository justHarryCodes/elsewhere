"""Builds packages/shared/src/vehicle-catalog.ts from the vehicle models in apps/client/public/assets.

Every model is exported differently: different units (millimetres to metres), facing different ways,
wheels as named parts, unnamed parts or not separate at all, and materials named anything. This reads
each .glb, works out which way it faces, finds the wheels (by name, or by shape), measures the body and
wheels from the actual vertices, and sorts materials into roles (paint, headlight, tail light, ...).
The game then scales each model to its real-world size from the catalog in scale.ts.

Add a vehicle: put the .glb under apps/client/public/assets, add an entry to MODELS below, run
    python3 scripts/vehicles/build_catalog.py
and check it in the sandbox. Overrides exist for when the guesses are wrong.
"""
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gltfscene import evaluate, load, node_points  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUBLIC = os.path.join(ROOT, 'apps', 'client', 'public')
OUT = os.path.join(ROOT, 'packages', 'shared', 'src', 'vehicle-catalog.ts')

# key, file under /assets, label, catalog size, fit axis, handling class, overrides
#   yaw:       degrees to turn the model so it faces +Z (default: detected)
#   materials: role -> material names (default: matched by name, see ROLE_PATTERNS)
#   wheels:    node names (default: detected); [] forces "no separate wheels"
#   split:     faces of a material above a height (fraction of body height) get their own role
QUATERNIUS = {'fit': 'width'}
MODELS = [
    ('policeCar', 'vehicles/singles/police-car.glb', 'Police car', 'vehicle.policeCar', 'police',
     {**QUATERNIUS, 'materials': {'paint': ['White'], 'sirenA': ['BlueLights']},
      # The red half of the light bar shares the tail-light material; the roof part becomes the red siren.
      'split': [{'material': 'TailLights', 'above': 0.75, 'role': 'sirenB'}]}),
    ('sportsCar', 'vehicles/singles/sports-car.glb', 'Sports car', 'vehicle.sportsCar', 'sports',
     {**QUATERNIUS, 'materials': {'paint': ['White']}}),
    ('suv', 'vehicles/singles/suv.glb', 'SUV', 'vehicle.suv', 'suv', {**QUATERNIUS, 'materials': {'paint': ['White']}}),
    ('taxi', 'vehicles/singles/taxi.glb', 'Taxi', 'vehicle.taxi', 'sedan', {**QUATERNIUS, 'materials': {'paint': ['Yellow']}}),
    ('hatchback', 'buildings/city-pack/car.glb', 'Hatchback', 'vehicle.compactCar', 'compact',
     {**QUATERNIUS, 'materials': {'paint': ['LightBlue']}}),
    ('sedan', 'buildings/city-pack/car-2.glb', 'Sedan', 'vehicle.sedan', 'sedan', {**QUATERNIUS, 'materials': {'paint': ['Blue']}}),
    ('pickup', 'vehicles/singles/pickup-truck.glb', 'Pickup', 'vehicle.pickupTruck', 'pickup',
     {**QUATERNIUS, 'materials': {'headlight': ['Headlights'], 'taillight': ['BrakeLight']}}),
    ('sportsCoupe', 'buildings/city-pack/sports-car.glb', 'Sports coupe', 'vehicle.sportsCar', 'sports',
     {**QUATERNIUS, 'materials': {'headlight': ['Headlights'], 'taillight': ['BrakeLight']}}),
    ('camaro', 'vehicles/singles/chevrolet-camaro.glb', 'Chevrolet Camaro', 'vehicle.sportsCar', 'sports',
     {'materials': {'paint': ['bodywork'], 'headlight': ['lights'], 'taillight': ['back_lights'], 'reverse': ['back_lights_2']}}),
    ('ferrariF40', 'vehicles/singles/ferrari-f40.glb', 'Ferrari F40', 'vehicle.sportsCar', 'supercar',
     {'materials': {'paint': ['bodywork'], 'headlight': ['front_lights'], 'taillight': ['back_lights_2']}}),
    ('dodgeChallenger', 'vehicles/singles/2015-dodge-challenger.glb', 'Dodge Challenger', 'vehicle.sedan', 'sports',
     {'materials': {'paint': ['Body'], 'headlight': ['Headlights', 'Long Headlights'], 'taillight': ['Brakelights', 'Tailights.002']}}),
    ('nissan180sx', 'buildings/city-pack/1994-nissan-180mx.glb', 'Nissan 180SX', 'vehicle.sportsCar', 'sports',
     {'materials': {'paint': ['Body.001'], 'headlight': ['Headlights'], 'taillight': ['Brakelights.001'], 'reverse': ['Tailights']}}),
    ('nissanGtr', 'buildings/city-pack/nissan-gtr.glb', 'Nissan GT-R', 'vehicle.sportsCar', 'supercar',
     {'materials': {'paint': ['chasis', 'chasis_NONE'], 'headlight': ['light'], 'taillight': ['redlight']}}),
    ('lamborghini', 'buildings/city-pack/car-model.glb', 'Lamborghini Aventador', 'vehicle.sportsCar', 'supercar',
     {'materials': {}}),
    ('classicMuscle', 'vehicles/singles/car.glb', 'Classic muscle car', 'vehicle.sportsCar', 'sports', {'yaw': 90}),
    ('mitsubishiL200', 'vehicles/singles/mitsubishi-l200.glb', 'Mitsubishi L200', 'vehicle.pickupTruck', 'pickup',
     {'materials': {}}),
    ('cargoTruck', 'vehicles/singles/cargo-truck.glb', 'Cargo truck', 'vehicle.cargoTruck', 'truck',
     {'materials': {'paint': ['truck_base_colour'], 'headlight': ['truck_headlight'], 'taillight': ['truck_backlight'],
                    'glass': ['truck_windows']}}),
    ('camaroZl1', 'vehicles/singles/camaro-zl1-2017.glb', 'Camaro ZL1', 'vehicle.sportsCar', 'sports', {'fit': 'average', 'yaw': -115.5}),
    ('cyberPickup', 'vehicles/singles/truck.glb', 'Angular pickup', 'vehicle.pickupTruck', 'pickup', {'yaw': 72.8}),
    ('hatchbackBlue', 'buildings/city-pack/car-3.glb', 'Blue hatchback', 'vehicle.compactCar', 'compact', {}),
    ('van', 'buildings/city-pack/van.glb', 'Van', 'vehicle.van', 'van', {'fit': 'average'}),
    ('ambulance', 'vehicles/singles/ambulance.glb', 'Ambulance', 'vehicle.ambulance', 'van', {'fit': 'average'}),
    ('sushiTruck', 'vehicles/singles/sushi-truck.glb', 'Food truck', 'vehicle.van', 'van',
     {'fit': 'average', 'materials': {'headlight': ['Lights'], 'glass': ['Glass']}}),
    ('bus', 'vehicles/singles/bus.glb', 'Bus', 'vehicle.bus', 'bus', {'fit': 'average'}),
    ('cityBus', 'buildings/city-pack/bus.glb', 'City bus', 'vehicle.schoolBus', 'bus', {'fit': 'average'}),
    ('motorcycle', 'buildings/city-pack/motorcycle.glb', 'Motorcycle', 'vehicle.motorcycle', 'motorcycle', {}),
    ('bicycle', 'buildings/city-pack/bicycle.glb', 'Bicycle', 'vehicle.bicycle', 'bicycle', {'yaw': 90}),
]

# Models that are in the asset library but not offered in the game: low quality (no interior, wheels
# built into the body, odd proportions) or two-wheelers, which need lean physics first. Their entries
# stay in MODELS so they come back by deleting them from here.
DISABLED = {
    # Detailed cars: no interior or seat to put the driver in, so the low-poly set is used for now.
    'pickup', 'sportsCoupe', 'camaro', 'ferrariF40', 'dodgeChallenger', 'nissan180sx', 'nissanGtr', 'cargoTruck',
    'lamborghini', 'classicMuscle', 'mitsubishiL200', 'camaroZl1', 'cyberPickup', 'hatchbackBlue', 'van',
    'ambulance', 'sushiTruck', 'bus', 'cityBus', 'motorcycle', 'bicycle',
}

# Used when a model has no material override for a role. Lamps also need to be the right colour
# family (tail lights red), checked in classify_materials.
ROLE_PATTERNS = {
    'paint': re.compile(r'^(body|bodywork|paint|carpaint)$', re.I),
    'headlight': re.compile(r'head ?lights?|front_lights', re.I),
    'taillight': re.compile(r'tail ?lights?|brake ?lights?|back_?lights?|redlight', re.I),
    'glass': re.compile(r'window|glass', re.I),
}
WHEEL_NAME = re.compile(r'wheel|tire|tyre', re.I)


def bounds(points):
    return ([min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)])


def rotate(points, yaw_deg):
    """Turns points about +Y so that a model facing heading -yaw ends up facing +Z."""
    t = math.radians(yaw_deg)
    c, s = math.cos(t), math.sin(t)
    return [(x * c + z * s, y, -x * s + z * c) for x, y, z in points]


def detect_yaw(per_node, per_material, wheel_nodes, names):
    """Heading of the model's front, from front/back wheel names or headlight vs tail light positions."""
    def centre(points):
        b = bounds(points)
        return [(b[0][i] + b[1][i]) / 2 for i in range(3)]

    front = [p for i in wheel_nodes if re.search(r'front|_f[lr]\b|^f[lr]', names[i], re.I) for p in per_node[i]]
    back = [p for i in wheel_nodes if re.search(r'back|rear|_r[lr]\b|^r[lr]', names[i], re.I) for p in per_node[i]]
    head = [p for m, pts in per_material.items() if ROLE_PATTERNS['headlight'].search(m) for p in pts]
    tail = [p for m, pts in per_material.items() if ROLE_PATTERNS['taillight'].search(m) for p in pts]
    for a, b in ((front, back), (head, tail)):
        if a and b:
            fa, fb = centre(a), centre(b)
            dx, dz = fa[0] - fb[0], fa[2] - fb[2]
            if math.hypot(dx, dz) > 1e-6:
                heading = math.degrees(math.atan2(dx, dz))
                return round(heading / 90) * 90 if abs(heading - round(heading / 90) * 90) < 5 else heading
    return 0.0


def find_wheels(nodes, per_node, names, override):
    if override is not None:
        return [i for i in per_node if names[i] in override]
    named = [i for i in per_node if WHEEL_NAME.search(names[i])]
    if named:
        return named
    # Unnamed wheels: near the ground, round in side view, much narrower than the body.
    allb = bounds([p for pts in per_node.values() for p in pts])
    height = allb[1][1] - allb[0][1]
    width = min(allb[1][0] - allb[0][0], allb[1][2] - allb[0][2])
    found = []
    for i, pts in per_node.items():
        if not pts:
            continue
        b = bounds(pts)
        d = b[1][1] - b[0][1]
        horiz = sorted([b[1][0] - b[0][0], b[1][2] - b[0][2]])
        near_ground = b[0][1] - allb[0][1] < 0.08 * height
        round_ = 0.12 * height < d < 0.65 * height and 0.75 < horiz[1] / d < 1.3
        thin = horiz[0] < 0.6 * d or horiz[0] > 0.5 * width  # one wheel, or a whole axle
        if near_ground and round_ and thin:
            found.append(i)
    return found if len(found) >= 2 else []


def classify_materials(g, per_material, override):
    if override is not None and override:
        roles = {role: [m for m in names if m in per_material] for role, names in override.items()}
    else:
        roles = {}
    textured = {m['name'] for m in g.get('materials', []) if 'baseColorTexture' in m.get('pbrMetallicRoughness', {})}
    base = {m['name']: m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1]) for m in g.get('materials', [])}
    for role, pattern in ROLE_PATTERNS.items():
        if role in roles:
            continue
        found = [m for m in per_material if pattern.search(m)]
        if role == 'taillight':
            found = [m for m in found if base[m][0] > 0.3 and base[m][1] < 0.25]  # must be red
        roles[role] = found
    roles['paint'] = [m for m in roles.get('paint', []) if m not in textured]  # can't recolour a texture atlas
    return {role: names for role, names in roles.items() if names}


def build(entry):
    key, rel, label, size, handling, opts = entry
    path = os.path.join(PUBLIC, 'assets', rel)
    g = load(path)
    nodes = evaluate(g)
    names = {n['index']: n['name'] for n in nodes}
    per_node, per_material = node_points(path, g)
    wheel_nodes = find_wheels(nodes, per_node, names, opts.get('wheels'))
    yaw = opts.get('yaw')
    if yaw is None:
        yaw = -detect_yaw(per_node, per_material, wheel_nodes, names)

    per_node = {i: rotate(pts, yaw) for i, pts in per_node.items()}
    body_pts = [p for i, pts in per_node.items() if i not in wheel_nodes for p in pts]
    body = bounds(body_pts)
    mid_x = (body[0][0] + body[1][0]) / 2

    wheels = []
    if wheel_nodes:
        boxes = {i: bounds(per_node[i]) for i in wheel_nodes}
        zs = [(b[0][2] + b[1][2]) / 2 for b in boxes.values()]
        front_z = max(zs)
        for i, b in sorted(boxes.items(), key=lambda kv: -(kv[1][0][2] + kv[1][1][2])):
            cz = (b[0][2] + b[1][2]) / 2
            spans = b[0][0] < mid_x < b[1][0]
            side = 'both' if spans else ('left' if (b[0][0] + b[1][0]) / 2 > mid_x else 'right')
            # The front axle is the frontmost one; everything well behind it is rear.
            axle = 'front' if front_z - cz < 0.15 * (body[1][2] - body[0][2]) else 'rear'
            wheels.append({'nodes': [names[i]], 'min': b[0], 'max': b[1], 'axle': axle, 'side': side})

    materials = classify_materials(g, per_material, opts.get('materials'))
    height = body[1][1] - body[0][1]
    # Roof line: top of the windows (the body top can include a light bar or roof rack).
    glass_pts = [p for name in materials.get('glass', []) for p in rotate(per_material.get(name, []), yaw)]
    roof = max(p[1] for p in glass_pts) if glass_pts else body[1][1]
    splits = [{'material': sp['material'], 'above': body[0][1] + sp['above'] * height, 'role': sp['role']}
              for sp in opts.get('split', [])]
    return {
        'splits': splits,
        'roof': roof,
        'key': key, 'label': label, 'url': '/assets/' + rel, 'size': size, 'fit': opts.get('fit', 'length'),
        'handling': handling, 'yaw': round(yaw, 2), 'body': body, 'wheels': wheels, 'materials': materials,
    }


def ts_num(v):
    return f'{v:.4g}' if abs(v) >= 1e-4 else '0'


def ts_vec(v):
    return '[' + ', '.join(ts_num(x) for x in v) + ']'


def emit(models):
    out = [
        '// GENERATED by scripts/vehicles/build_catalog.py from the .glb files. Do not edit by hand:',
        '// change MODELS in that script and run it again.',
        '//',
        '// Bounds are in model units, already turned by `yaw` so the model faces +Z (left = +X).',
        '',
        'import type { VehicleCatalogEntry } from "./vehicles";',
        '',
        'export const VEHICLE_CATALOG = {',
    ]
    for m in models:
        out.append(f'  {m["key"]}: {{')
        out.append(f'    label: "{m["label"]}",')
        out.append(f'    url: "{m["url"]}",')
        out.append(f'    size: "{m["size"]}",')
        out.append(f'    fit: "{m["fit"]}",')
        out.append(f'    handling: "{m["handling"]}",')
        out.append(f'    yaw: {ts_num(m["yaw"])},')
        out.append(f'    body: {{ min: {ts_vec(m["body"][0])}, max: {ts_vec(m["body"][1])} }},')
        out.append(f'    roof: {ts_num(m["roof"])},')
        if m['wheels']:
            out.append('    wheels: [')
            for w in m['wheels']:
                nodes = ', '.join(f'"{n}"' for n in w['nodes'])
                out.append(f'      {{ nodes: [{nodes}], min: {ts_vec(w["min"])}, max: {ts_vec(w["max"])}, '
                           f'axle: "{w["axle"]}", side: "{w["side"]}" }},')
            out.append('    ],')
        else:
            out.append('    wheels: [],')
        mats = ', '.join(f'{role}: [{", ".join(chr(34) + n + chr(34) for n in names)}]'
                         for role, names in m['materials'].items())
        out.append(f'    materials: {{ {mats} }},')
        if m['splits']:
            items = ', '.join(f'{{ material: "{sp["material"]}", above: {ts_num(sp["above"])}, role: "{sp["role"]}" }}'
                              for sp in m['splits'])
            out.append(f'    splits: [{items}],')
        out.append('  },')
    out.append('} as const satisfies Record<string, VehicleCatalogEntry>;')
    out.append('')
    return '\n'.join(out)


if __name__ == '__main__':
    built = []
    for entry in MODELS:
        if entry[0] in DISABLED:
            continue
        m = build(entry)
        b = m['body']
        print(f"{m['key']:16} yaw {m['yaw']:7.1f}  body {[round(b[1][i] - b[0][i], 3) for i in range(3)]}  "
              f"wheels {len(m['wheels'])} ({', '.join(w['axle'][0] + w['side'][0] for w in m['wheels'])})  "
              f"roles {sorted(m['materials'])}")
        built.append(m)
    with open(OUT, 'w') as f:
        f.write(emit(built))
    print('wrote', os.path.relpath(OUT, ROOT))
