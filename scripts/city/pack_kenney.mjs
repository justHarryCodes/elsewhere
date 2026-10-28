// Packs the Kenney kits the neighbourhood is built from into one compact file for the city renderer, in the
// same layout as pack_town.py and pack_megakit.py (so game/megakit.ts loads it with the others):
//
//   apps/client/public/assets/city/kenney/pieces.json   piece -> bounds and, per material, offsets into pieces.bin
//   apps/client/public/assets/city/kenney/pieces.bin    positions, normals, UVs, colours (float32), indices (uint32)
//   apps/client/public/assets/city/kenney/textures/     each kit's colormap (and its colour variations)
//   apps/client/public/assets/city/kenney/textures/patterns/   Kenney's pattern packs, for wallpaper and floors
//
// Kits (art-source/kenny, and the city kits already in public/assets/buildings):
//   roads       City Kit (Roads): 2-lane streets, junctions, crossings, street lights, signs
//   suburban    City Kit (Suburban): detached houses, fences, paths, driveways, garden trees (4 colour schemes)
//   commercial  City Kit (Commercial): shops and small offices for the town centre (3 colour schemes)
//   arcade, market, skate   the Mini Arcade, Mini Market and Mini Skate kits
//   graveyard   Graveyard Kit
//   coaster     Coaster Kit: the monorail (track, supports, train), park entrance, food and drink stalls
//   food        Food Kit: dishes for café tables and stalls
//
// Each kit is drawn from one palette texture ("colormap"), so it's one material; untextured parts (glass) go
// to vertex colours. Everything is scaled to metres, and models whose front is -Z are turned to face +Z like
// the rest of the city. No dependencies: `node scripts/city/pack_kenney.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = path.join(ROOT, 'art-source');
const KENNY = path.join(ART, 'kenny');
const ASSETS = path.join(ROOT, 'apps', 'client', 'public', 'assets');
const OUT = path.join(ASSETS, 'city', 'kenney');

const glbDir = (kit) => path.join(KENNY, kit, 'Models', 'GLB format');
const range = (prefix, from, to) => Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) => prefix + String.fromCharCode(from.charCodeAt(0) + i));

/**
 * name: pieces are called `k/<name>/<model>`. scale: kit units to metres. turn: front from -Z to +Z.
 * models: which to pack (all but the characters when left out). skins: extra colour-scheme textures with
 * the colormap's layout. scales: per-model scale instead of the kit's. keep: models left as authored in a turned kit.
 * centre: put the middle of each model's footprint on x = z = 0.
 */
/** A quarter turn. */
const Q = Math.PI / 2;
const KITS = [
  {
    name: 'roads',
    dir: glbDir('kenney_city-kit-roads'),
    scale: 10, // one tile is a 10 m street: 8 m of road and a 1 m kerb each side
    models: [
      'road-straight', 'road-crossroad', 'road-intersection', 'road-bend', 'road-crossing', 'road-end-round',
      'light-curved', 'light-curved-double', 'light-square', 'light-square-double', 'traffic-light',
      'road-sign-stop', 'road-sign-street', 'road-sign-warning', 'construction-cone', 'construction-barrier',
      'construction-light', 'dumpster', 'electricity-pole', 'electricity-pole-single', 'electricity-wires',
    ],
  },
  {
    name: 'suburban',
    dir: path.join(ASSETS, 'buildings', 'kenney-city-kit-suburban'),
    scale: 7.5, // two-storey houses come out about 8.5 m tall, 10 m across
    turn: true,
    skins: [path.join(ART, 'buildings', 'kenney-city-kit-suburban', 'Models', 'Textures'), ['variation-a', 'variation-b', 'variation-c']],
    models: [
      ...range('building-type-', 'a', 'u'), 'fence', 'fence-low', 'planter', 'tree-large', 'tree-small',
      'driveway-long', 'driveway-short', 'path-long', 'path-short', 'path-stones-long', 'path-stones-short', 'path-stones-messy',
    ],
    // A picket fence about a metre high in 2 m panels; planters a metre and a half across.
    scales: { fence: 4, 'fence-low': 4, planter: 4 },
  },
  {
    name: 'commercial',
    dir: path.join(ASSETS, 'buildings', 'kenney-city-kit-commercial'),
    scale: 7.5,
    turn: true,
    skins: [path.join(ART, 'buildings', 'kenney-city-kit-commercial', 'Models', 'Textures'), ['variation-a', 'variation-b']],
    models: [...range('building-', 'a', 'n'), 'detail-parasol-a', 'detail-parasol-b'],
    scales: { 'detail-parasol-a': 6, 'detail-parasol-b': 6 },
  },
  { name: 'arcade', dir: glbDir('kenney_mini-arcade'), scale: 2.5, turn: true, centre: true },
  { name: 'market', dir: glbDir('kenney_mini-market'), scale: 2.5, turn: true, centre: true },
  { name: 'skate', dir: glbDir('kenney_mini-skate'), scale: 2.5, turn: true },
  { name: 'graveyard', dir: glbDir('kenney_graveyard-kit_5.0'), scale: 2.5, turn: true },
  {
    name: 'coaster',
    dir: glbDir('kenney_coaster-kit'),
    scale: 3, // the monorail car is about 2.7 m wide and 3 m long
    turn: true,
    // The track runs along +Z from its origin and its corners turn left, as authored: the city lays it that way.
    keep: ['coaster-monorail-straight', 'coaster-monorail-corner-large', 'coaster-monorail-corner-small', 'train-monorail'],
    models: [
      'coaster-monorail-straight', 'coaster-monorail-corner-large', 'coaster-monorail-corner-small', 'train-monorail',
      'support-large', 'support-large-bottom', 'support-small', 'support-small-bottom', 'station', 'station-fence',
      'station-gate', 'park-entrance', 'stall-food', 'stall-drinks', 'stall-information', 'stall-toilets', 'bench',
      'trash', 'tree', 'tree-large', 'flowers', 'grass', 'ride-entrance', 'ride-exit',
    ],
  },
  { name: 'food', dir: glbDir('kenney_food-kit'), scale: 0.35, turn: true, centre: true },
  // The premium furniture (public/assets/furniture): the best pieces of each pack, as `p/<pack>/<model>`.
  // Each is turned to face +Z (yaw) and sized in metres: h = its height, w = its width (along X once
  // turned). recolor: flat colours to put right.
  { name: 'singles', prefix: 'p', dir: path.join(ASSETS, 'furniture', 'singles'), centre: true, premium: {
    sofa: { w: 2.1 }, 'sofa-2': { w: 2.2, yaw: Q }, couch: { w: 2.8 }, 'couch-2': { w: 2.2, yaw: -Q },
    bed: { w: 1.8 }, 'bed-2': { w: 1.7 }, 'bed-3': { w: 1.8 }, 'double-bed': { w: 1.9 },
  } },
  { name: 'house', prefix: 'p', dir: path.join(ASSETS, 'furniture', 'house-interior'), centre: true, premium: {
    'couch-large': { w: 2.6 }, 'l-couch': { w: 2.8 }, 'bed-single': { w: 1.0 }, 'bunk-bed': { h: 1.6 }, bathtub: { w: 1.75, yaw: Q },
    fireplace: { w: 1.6 }, houseplant: { h: 1.1 }, 'houseplant-2': { h: 0.75 }, cactus: { h: 0.9 }, 'light-floor': { h: 1.6 },
    lamp: { h: 0.55 }, 'table-lamp': { h: 0.55 }, 'light-stand': { h: 1.7 }, 'night-stand': { h: 0.55 }, 'night-stand-2': { h: 0.55 },
    drawer: { h: 1.0 }, 'drawer-2': { w: 1.8 }, 'drawer-3': { w: 1.3 }, oven: { h: 0.9 }, 'kitchen-fridge': { h: 1.85 },
    'kitchen-sink': { h: 0.95 }, 'washing-machine': { h: 0.85 }, 'shelf-large': { h: 1.9 }, 'table-round-large': { w: 1.9 },
    'table-round-small': { h: 0.5 }, 'table-round-small-2': { h: 0.75 }, chair: { h: 0.95 }, stool: { h: 0.75 },
  } },
  { name: 'office', prefix: 'p', dir: path.join(ASSETS, 'furniture', 'office-pack'), centre: true, premium: {
    'desk-2': { w: 1.5, yaw: -Q }, 'desk-3': { w: 1.3, yaw: -Q }, 'standing-desk': { w: 1.8 }, 'office-chair': { h: 1.1 }, 'chair-2': { h: 1.15 },
    'couch-small': { h: 0.85 }, chair: { h: 0.75 }, 'coffee-table': { h: 0.45 }, 'file-cabinet': { h: 1.3, yaw: Q },
    'water-cooler': { h: 1.3, yaw: Q }, printer: { h: 0.4 }, 'message-board': { w: 1.4, yaw: Q }, 'vending-machine': { h: 1.9, yaw: Q },
    'computer-screen': { w: 1.3 }, 'dual-monitors-on-sit-stand-arm': { h: 0.6 }, computer: { h: 0.45 }, 'fire-extinguisher': { h: 0.6 },
    'fire-exit-sign': { w: 0.45 }, 'trash-bin': { h: 0.7 }, shelf: { h: 1.6, yaw: Q }, 'coat-rack': { h: 1.8 }, trophy: { h: 0.55 },
    dartboard: { h: 0.45, yaw: Q }, 'table-tennis-table': { w: 2.74 }, rug: { w: 2.6 }, 'rug-round': { w: 2.0 },
    'wall-art-02': { h: 0.9 }, 'wall-art-03': { h: 0.9 }, 'wall-art-05': { h: 0.9 }, 'wall-art-06': { h: 0.9 }, toilet: { h: 0.8 },
    'bathroom-sink': { h: 0.85 }, 'towel-rack': { w: 0.6 }, 'bathroom-toilet-paper': { w: 0.18 }, 'plant-white-pot': { h: 0.6 },
    'potted-plant': { h: 1.0 }, houseplant: { h: 0.9 }, lamp: { h: 1.6 }, 'table-large-circular': { h: 0.76 }, table: { h: 0.76 },
    'wall-shelf': { w: 1.0, yaw: Q }, 'night-stand': { h: 0.6 },
  } },
  { name: 'cafe', prefix: 'p', dir: path.join(ASSETS, 'furniture', 'coffeehouse-lounge'), centre: true, premium: {
    'couch-medium': { w: 2.0 }, 'couch-small': { w: 1.0 }, barstool: { h: 1.0 }, 'bar-stool': { h: 0.75 },
    'analog-clock': { h: 0.45, yaw: Q }, 'can-fridge': { h: 1.9, yaw: Q }, 'cash-register': { h: 0.35 }, 'coffee-machine': { h: 0.5 },
    'kitchen-microwave': { h: 0.35 }, dishwasher: { h: 0.85 }, 'fruit-bowl': { w: 0.35 }, 'drum-set': { h: 1.2 },
    'electric-guitar': { h: 1.0 }, 'guitar-amp': { h: 0.6 }, 'floor-monitor': { h: 0.45, yaw: Q }, 'bass-speakers': { h: 1.6 },
    speaker: { h: 1.2 }, 'pool-table': { w: 2.4, recolor: [['#ff00ff', '#1f8f4e'], ['#e600e6', '#1f8f4e']] }, houseplant: { h: 1.1 },
    'houseplant-2': { h: 0.7 }, 'houseplant-3': { h: 0.8 }, 'side-table': { h: 0.75 }, bins: { h: 1.0 }, rug: { w: 1.6 },
    'round-rug': { w: 1.8 }, 'triple-sink': { h: 0.95 }, 'light-desk': { h: 0.5 }, 'coat-rack': { w: 1.0 },
  } },
  { name: 'kitchen', prefix: 'p', dir: path.join(ASSETS, 'furniture', 'restaurant-bits'), centre: true, premium: {
    'stove-with-multi-burner': { h: 0.95 }, 'stove-2': { h: 0.95 }, 'kitchen-table': { h: 0.92 }, 'kitchen-table-2': { h: 0.92 },
    'table-with-sink': { h: 0.92 }, extractorhood: { h: 0.8 }, dishrack: { h: 0.5 }, fridge: { h: 1.9, yaw: Q }, oven: { h: 0.95 },
    'kitchen-cabinet': { h: 0.92 }, 'round-table': { h: 0.76 }, 'round-table-2': { h: 0.76 }, 'table-with-food': { w: 1.0 },
    'table-round-a-small': { w: 0.8 }, chair: { h: 0.9 }, 'chair-2': { h: 0.9 }, shelf: { w: 1.0 }, crate: { h: 0.5 }, 'large-pot': { w: 0.5 },
  } },
  // Furniture for the interiors (both CC0, flat colours): Kenney's Furniture Kit (2.1 makes its doors
  // 2.1 m) and Quaternius' house interior pieces (half a metre a unit).
  { name: 'furniture', dir: path.join(ASSETS, 'furniture', 'kenney-furniture-kit'), scale: 2.1, centre: true },
  { name: 'house', dir: path.join(ASSETS, 'furniture', 'house-interior'), scale: 0.5, centre: true, models: [
    'bathtub', 'bed-king', 'bed-single', 'bunk-bed', 'cactus', 'chair', 'couch-large', 'couch-medium', 'drawer', 'drawer-2',
    'drawer-3', 'fireplace', 'houseplant', 'houseplant-2', 'kitchen-fridge', 'kitchen-sink', 'l-couch', 'lamp', 'light-floor',
    'light-stand', 'night-stand', 'night-stand-2', 'oven', 'shelf-large', 'shelf-small', 'stool', 'table-lamp',
    'table-round-large', 'table-round-small', 'trashcan-small', 'washing-machine',
  ] },
];

// The pattern packs: black and white tiles, recoloured in the browser into wallpaper and floors.
const PATTERNS = [
  ['extra', path.join(KENNY, 'kenney_pattern-pack-extra', 'PNG', 'Default')],
  ['thin', path.join(KENNY, 'kenney_pattern-pack-lines', 'PNG', 'Thin', 'Default (256px)')],
  ['thick', path.join(KENNY, 'kenney_pattern-pack-lines', 'PNG', 'Thick', 'Default (256px)')],
];

// ------------------------------------------------------------------ glb reading

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const READERS = {
  5126: [4, (b, o) => b.readFloatLE(o)],
  5125: [4, (b, o) => b.readUInt32LE(o)],
  5123: [2, (b, o) => b.readUInt16LE(o)],
  5121: [1, (b, o) => b[o]],
};

/** Column-major 4x4 multiply, as glTF stores them. */
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function trs(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** A glb's triangles in scene space, per material: { textured, colour, p, n, uv, i }. */
function readGlb(file) {
  const raw = fs.readFileSync(file);
  const jsonLength = raw.readUInt32LE(12);
  const g = JSON.parse(raw.subarray(20, 20 + jsonLength).toString());
  const blob = raw.subarray(20 + jsonLength + 8);
  const accessor = (index) => {
    const a = g.accessors[index];
    const view = g.bufferViews[a.bufferView];
    const n = COMPONENTS[a.type];
    const [size, read] = READERS[a.componentType];
    const stride = view.byteStride ?? size * n;
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = new Array(a.count);
    for (let k = 0; k < a.count; k++) {
      const v = new Array(n);
      for (let c = 0; c < n; c++) v[c] = read(blob, start + k * stride + c * size);
      out[k] = v;
    }
    return out;
  };
  /** A texture's image: embedded (a buffer view) or a file next to the glb. */
  const image = (textureIndex) => {
    const source = g.textures[textureIndex].source;
    const im = g.images[source];
    if (im.uri?.startsWith('data:')) {
      const [head, data] = im.uri.split(',');
      return { source, data: Buffer.from(data, 'base64'), mime: head.slice(5).split(';')[0] };
    }
    if (im.uri) return { source, data: fs.readFileSync(path.join(path.dirname(file), decodeURIComponent(im.uri))), mime: im.uri.endsWith('.png') ? 'image/png' : 'image/jpeg' };
    const view = g.bufferViews[im.bufferView];
    const start = view.byteOffset ?? 0;
    return { source, data: Buffer.from(blob.subarray(start, start + view.byteLength)), mime: im.mimeType ?? 'image/png' };
  };
  const groups = new Map();
  const walk = (index, parent) => {
    const node = g.nodes[index];
    const m = mul(parent, trs(node));
    if (node.mesh !== undefined) {
      for (const prim of g.meshes[node.mesh].primitives) {
        const material = g.materials?.[prim.material] ?? {};
        const pbr = material.pbrMetallicRoughness ?? {};
        const textured = !!pbr.baseColorTexture;
        const picture = textured ? image(pbr.baseColorTexture.index) : undefined;
        const key = textured ? `tex:${picture.source}` : JSON.stringify(pbr.baseColorFactor ?? [1, 1, 1, 1]);
        let group = groups.get(key);
        if (!group) groups.set(key, (group = { textured, image: picture, colour: pbr.baseColorFactor ?? [1, 1, 1, 1], p: [], n: [], uv: [], i: [] }));
        const pos = accessor(prim.attributes.POSITION);
        const nor = prim.attributes.NORMAL !== undefined ? accessor(prim.attributes.NORMAL) : pos.map(() => [0, 1, 0]);
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? accessor(prim.attributes.TEXCOORD_0) : pos.map(() => [0, 0]);
        const idx = prim.indices !== undefined ? accessor(prim.indices).map((v) => v[0]) : pos.map((_, k) => k);
        const first = group.p.length / 3;
        for (let k = 0; k < pos.length; k++) {
          const [x, y, z] = pos[k];
          group.p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          const [a, b, c] = nor[k];
          const nx = m[0] * a + m[4] * b + m[8] * c;
          const ny = m[1] * a + m[5] * b + m[9] * c;
          const nz = m[2] * a + m[6] * b + m[10] * c;
          const length = Math.hypot(nx, ny, nz) || 1;
          group.n.push(nx / length, ny / length, nz / length);
          group.uv.push(uv[k][0], uv[k][1]);
        }
        for (const t of idx) group.i.push(first + t);
      }
    }
    for (const child of node.children ?? []) walk(child, m);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of g.scenes[g.scene ?? 0].nodes) walk(root, identity);
  return [...groups.values()];
}

// ------------------------------------------------------------------ packing

function main() {
  fs.mkdirSync(path.join(OUT, 'textures', 'patterns'), { recursive: true });
  const chunks = [];
  let length = 0;
  const put = (values, type) => {
    const array = type === 'f' ? Float32Array.from(values) : Uint32Array.from(values);
    const offset = length;
    chunks.push(Buffer.from(array.buffer));
    length += array.byteLength;
    return offset;
  };
  const pieces = {};
  const materials = { 'kenney-vcolor': { base: null, color: [1, 1, 1, 1], vertexColors: true } };
  const r3 = (v) => Math.round(v * 1000) / 1000;

  for (const kit of KITS) {
    // Kits drawn from a palette texture; the furniture kits are flat colours only (vertex colours).
    const colormap = path.join(kit.dir, 'Textures', 'colormap.png');
    const material = `kenney-${kit.name}`;
    if (fs.existsSync(colormap)) {
      fs.copyFileSync(colormap, path.join(OUT, 'textures', `${kit.name}.png`));
      materials[material] = { base: `${kit.name}.png`, pixel: true };
    }
    if (kit.skins) {
      const [folder, names] = kit.skins;
      const skins = [`${kit.name}.png`];
      for (const name of names) {
        fs.copyFileSync(path.join(folder, `${name}.png`), path.join(OUT, 'textures', `${kit.name}-${name}.png`));
        skins.push(`${kit.name}-${name}.png`);
      }
      materials[material].skins = skins;
    }
    const models =
      (kit.premium && Object.keys(kit.premium)) ??
      kit.models ??
      fs
        .readdirSync(kit.dir)
        .filter((f) => f.endsWith('.glb') && !f.startsWith('character-'))
        .map((f) => f.slice(0, -4))
        .sort();
    for (const model of models) {
      const spec = kit.premium?.[model] ?? {};
      const groups = readGlb(path.join(kit.dir, `${model}.glb`));
      // Turned to face +Z (spec.yaw, as the city turns pieces), then sized to a real height or width.
      if (spec.yaw) {
        const c = Math.cos(spec.yaw);
        const s = Math.sin(spec.yaw);
        for (const group of groups) {
          for (const arr of [group.p, group.n]) {
            for (let k = 0; k < arr.length; k += 3) {
              const [x, z] = [arr[k], arr[k + 2]];
              arr[k] = x * c + z * s;
              arr[k + 2] = -x * s + z * c;
            }
          }
        }
      }
      let scale = kit.scales?.[model] ?? kit.scale ?? 1;
      if (spec.h || spec.w) {
        const lo0 = [Infinity, Infinity, Infinity];
        const hi0 = [-Infinity, -Infinity, -Infinity];
        for (const group of groups) {
          for (let k = 0; k < group.p.length; k++) {
            lo0[k % 3] = Math.min(lo0[k % 3], group.p[k]);
            hi0[k % 3] = Math.max(hi0[k % 3], group.p[k]);
          }
        }
        scale = spec.h ? spec.h / (hi0[1] - lo0[1]) : spec.w / (hi0[0] - lo0[0]);
      }
      // A colour put right (e.g. a neon pool table's felt): flat colours near `from` become `to`.
      for (const [from, to] of spec.recolor ?? []) {
        const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
        const [f, t] = [hex(from), hex(to)];
        for (const group of groups) {
          if (!group.textured && Math.hypot(...group.colour.slice(0, 3).map((v, i) => v - f[i])) < 0.35) group.colour = [...t, 1];
        }
      }
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      const parts = {};
      // Untextured parts (glass) of every colour share one vertex-coloured part.
      const flat = { p: [], n: [], uv: [], c: [], i: [] };
      for (const group of groups) {
        group.p = group.p.map((v) => v * scale);
        if (kit.turn && !kit.keep?.includes(model)) {
          // Half a turn about Y: (x, z) -> (-x, -z).
          for (let k = 0; k < group.p.length; k += 3) {
            group.p[k] = -group.p[k];
            group.p[k + 2] = -group.p[k + 2];
            group.n[k] = -group.n[k];
            group.n[k + 2] = -group.n[k + 2];
          }
        }
        for (let k = 0; k < group.p.length; k++) {
          lo[k % 3] = Math.min(lo[k % 3], group.p[k]);
          hi[k % 3] = Math.max(hi[k % 3], group.p[k]);
        }
      }
      if (kit.centre) {
        // Furniture and dishes: the middle of the footprint on x = z = 0, so rooms can lay them out (and
        // the premium pieces, modelled anywhere, stood on y = 0).
        const shift = [-(lo[0] + hi[0]) / 2, kit.premium ? -lo[1] : 0, -(lo[2] + hi[2]) / 2];
        for (const group of groups) for (let k = 0; k < group.p.length; k++) group.p[k] += shift[k % 3];
        for (const a of kit.premium ? [0, 1, 2] : [0, 2]) {
          lo[a] += shift[a];
          hi[a] += shift[a];
        }
      }
      for (const group of groups) {
        const { p, n } = group;
        if (group.textured) {
          // The premium packs carry their own textures: one material per image, saved once.
          let key = material;
          if (kit.premium) {
            const hash = createHash('sha1').update(group.image.data).digest('hex').slice(0, 10);
            key = `tex-${hash}`;
            if (!materials[key]) {
              const file = `tex-${hash}.${group.image.mime === 'image/jpeg' ? 'jpg' : 'png'}`;
              fs.writeFileSync(path.join(OUT, 'textures', file), group.image.data);
              materials[key] = { base: file };
            }
          }
          // Two textures of the model with the same picture: the second gets its own (identical) material.
          while (parts[key]) {
            const next = `${key}x`;
            materials[next] ??= materials[key];
            key = next;
          }
          parts[key] = { vertices: p.length / 3, indices: group.i.length, p: put(p, 'f'), n: put(n, 'f'), uv: put(group.uv, 'f'), i: put(group.i, 'u') };
        } else {
          const base = flat.p.length / 3;
          flat.p.push(...p);
          flat.n.push(...n);
          flat.uv.push(...group.uv);
          for (let k = 0; k < p.length / 3; k++) flat.c.push(group.colour[0], group.colour[1], group.colour[2]);
          for (const t of group.i) flat.i.push(base + t);
        }
      }
      if (flat.i.length) {
        parts['kenney-vcolor'] = { vertices: flat.p.length / 3, indices: flat.i.length, p: put(flat.p, 'f'), n: put(flat.n, 'f'), uv: put(flat.uv, 'f'), c: put(flat.c, 'f'), i: put(flat.i, 'u') };
      }
      pieces[`${kit.prefix ?? 'k'}/${kit.name}/${model}`] = { min: lo.map(r3), max: hi.map(r3), parts };
    }
  }

  // Pattern tiles: copied as they are (each a 256 px black and white tile).
  const patterns = {};
  for (const [set, folder] of PATTERNS) {
    patterns[set] = [];
    for (const file of fs.readdirSync(folder).filter((f) => f.endsWith('.png')).sort()) {
      const name = `${set}-${file.replace(/^pattern_/, '')}`;
      fs.copyFileSync(path.join(folder, file), path.join(OUT, 'textures', 'patterns', name));
      patterns[set].push(name);
    }
  }

  fs.writeFileSync(path.join(OUT, 'pieces.bin'), Buffer.concat(chunks));
  fs.writeFileSync(path.join(OUT, 'pieces.json'), JSON.stringify({ pieces, materials, patterns }));
  const count = Object.keys(pieces).length;
  const tiles = Object.values(patterns).reduce((n, list) => n + list.length, 0);
  console.log(`${count} pieces, ${Object.keys(materials).length} materials, ${(length / 1e6).toFixed(1)} MB geometry, ${tiles} pattern tiles`);
  // The sizes the city generator needs (width x height x depth, metres, front toward +Z).
  // The furniture the rooms are laid out with (sizes for their colliders, on the server too).
  const catalog = Object.entries(pieces)
    .filter(([name]) => /^(k\/(furniture|house|arcade|market|food)|p\/\w+)\//.test(name))
    .map(([name, p]) => `  '${name}': [${[0, 1, 2].map((a) => r3(p.max[a] - (a === 1 ? 0 : p.min[a]))).join(', ')}],`);
  fs.writeFileSync(
    path.join(ROOT, 'packages', 'shared', 'src', 'furniture-catalog.ts'),
    `// GENERATED by scripts/city/pack_kenney.mjs. Do not edit by hand: change the kits there and run it again.\n//\n` +
      `// Furniture, fittings and food for the rooms: width (X), height and depth (Z) in metres, centred on\n// x = z = 0, base on y = 0, front toward +Z.\n\n` +
      `export const FURNITURE_CATALOG = {\n${catalog.join('\n')}\n} as const;\n\nexport type CatalogPiece = keyof typeof FURNITURE_CATALOG;\n`,
  );
  if (process.argv.includes('--sizes')) {
    for (const [name, p] of Object.entries(pieces)) {
      console.log(name.padEnd(44), [0, 1, 2].map((a) => (p.max[a] - p.min[a]).toFixed(2)).join(' x '), ' x', p.min[0], p.max[0], ' z', p.min[2], p.max[2], ' y', p.min[1], p.max[1]);
    }
  }
}

main();
