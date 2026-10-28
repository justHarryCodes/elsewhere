// Builds the game's two base bodies (Body_Male / Body_Female) from Quaternius' Universal Base
// Characters, whose "Superhero" builds are bodybuilders. Everything happens in the bind pose and
// stays consistent with the skin, so every Universal Animation Library clip still plays:
//   1. each bone's cross-section is thinned (chest, arms, legs, neck): vertices are moved into the
//      bone's bind space, scaled across it, moved back and blended by the skin weights;
//   2. the shoulder joints move in (and a little down): the arm bones' bind matrices shift with
//      them, and so do the vertices, by their arm weight;
//   3. muscle definition is smoothed out (Taubin smoothing, which keeps the volume) on the torso
//      and limbs, never the face, hands or feet;
//   4. normals are recomputed, and channels the game never reads (extra UVs, vertex colours) and
//      the muscle normal map are dropped.
// The renderer only takes rotations (and the root/pelvis translation) from the clips, so the arm
// bones keep their new rest position. Writes public/assets/characters/base/Body_*.gltf + .bin.
//
// node scripts/characters/reshape_bodies.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const BASE = path.join(ROOT, 'apps', 'client', 'public', 'assets', 'characters', 'base');

/** Cross-section factors [x, along, z]; spine x = width, z = depth. First match wins. */
const BUILDS = {
  male: {
    source: 'Superhero_Male_FullBody',
    out: 'Body_Male',
    skin: 'T_Body_Male.png',
    bones: [
      [/^spine_03$/, [0.86, 1, 0.9]],
      [/^spine_02$/, [0.9, 1, 0.92]],
      [/^spine_01$/, [0.93, 1, 0.94]],
      [/^pelvis$/, [0.96, 1, 0.96]],
      [/^clavicle_/, [0.9, 1, 0.9]],
      [/^neck_/, [0.86, 1, 0.88]],
      [/^upperarm_/, [0.84, 1, 0.84]],
      [/^lowerarm_/, [0.84, 1, 0.84]],
      [/^hand_/, [0.94, 1, 0.94]],
      [/^thigh_/, [0.88, 1, 0.88]],
      [/^calf_/, [0.9, 1, 0.9]],
    ],
    shoulderIn: 0.016,
    shoulderDown: 0.006,
    smooth: 14,
  },
  female: {
    source: 'Superhero_Female_FullBody',
    out: 'Body_Female',
    skin: 'T_Body_Female.png',
    bones: [
      [/^spine_03$/, [0.95, 1, 0.97]],
      [/^spine_02$/, [0.95, 1, 0.96]],
      [/^clavicle_/, [0.88, 1, 0.88]],
      [/^neck_/, [0.92, 1, 0.92]],
      [/^upperarm_/, [0.86, 1, 0.86]],
      [/^lowerarm_/, [0.9, 1, 0.9]],
      [/^thigh_/, [0.95, 1, 0.95]],
      [/^calf_/, [0.95, 1, 0.95]],
    ],
    shoulderIn: 0.007,
    shoulderDown: 0.003,
    smooth: 8,
  },
};

/** Bones whose skin may be smoothed (by how much they influence a vertex). */
const SMOOTHED = /^(pelvis|spine_0\d|clavicle_|upperarm_|lowerarm_|thigh_|calf_)/;
/** The arm chain below the clavicle, which moves with the shoulder joint. */
const ARM = (side) => new RegExp(`^(upperarm|lowerarm|hand|(thumb|index|middle|ring|pinky)_\\d+(_leaf)?)_${side}$`);

// ------------------------------------------------------------------ 4x4 (column-major, like glTF)

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const invert = (m) => {
  // General 4x4 inverse (cofactors).
  const inv = new Array(16);
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15] = m;
  inv[0] = a5 * a10 * a15 - a5 * a11 * a14 - a9 * a6 * a15 + a9 * a7 * a14 + a13 * a6 * a11 - a13 * a7 * a10;
  inv[4] = -a4 * a10 * a15 + a4 * a11 * a14 + a8 * a6 * a15 - a8 * a7 * a14 - a12 * a6 * a11 + a12 * a7 * a10;
  inv[8] = a4 * a9 * a15 - a4 * a11 * a13 - a8 * a5 * a15 + a8 * a7 * a13 + a12 * a5 * a11 - a12 * a7 * a9;
  inv[12] = -a4 * a9 * a14 + a4 * a10 * a13 + a8 * a5 * a14 - a8 * a6 * a13 - a12 * a5 * a10 + a12 * a6 * a9;
  inv[1] = -a1 * a10 * a15 + a1 * a11 * a14 + a9 * a2 * a15 - a9 * a3 * a14 - a13 * a2 * a11 + a13 * a3 * a10;
  inv[5] = a0 * a10 * a15 - a0 * a11 * a14 - a8 * a2 * a15 + a8 * a3 * a14 + a12 * a2 * a11 - a12 * a3 * a10;
  inv[9] = -a0 * a9 * a15 + a0 * a11 * a13 + a8 * a1 * a15 - a8 * a3 * a13 - a12 * a1 * a11 + a12 * a3 * a9;
  inv[13] = a0 * a9 * a14 - a0 * a10 * a13 - a8 * a1 * a14 + a8 * a2 * a13 + a12 * a1 * a10 - a12 * a2 * a9;
  inv[2] = a1 * a6 * a15 - a1 * a7 * a14 - a5 * a2 * a15 + a5 * a3 * a14 + a13 * a2 * a7 - a13 * a3 * a6;
  inv[6] = -a0 * a6 * a15 + a0 * a7 * a14 + a4 * a2 * a15 - a4 * a3 * a14 - a12 * a2 * a7 + a12 * a3 * a6;
  inv[10] = a0 * a5 * a15 - a0 * a7 * a13 - a4 * a1 * a15 + a4 * a3 * a13 + a12 * a1 * a7 - a12 * a3 * a5;
  inv[14] = -a0 * a5 * a14 + a0 * a6 * a13 + a4 * a1 * a14 - a4 * a2 * a13 - a12 * a1 * a6 + a12 * a2 * a5;
  inv[3] = -a1 * a6 * a11 + a1 * a7 * a10 + a5 * a2 * a11 - a5 * a3 * a10 - a9 * a2 * a7 + a9 * a3 * a6;
  inv[7] = a0 * a6 * a11 - a0 * a7 * a10 - a4 * a2 * a11 + a4 * a3 * a10 + a8 * a2 * a7 - a8 * a3 * a6;
  inv[11] = -a0 * a5 * a11 + a0 * a7 * a9 + a4 * a1 * a11 - a4 * a3 * a9 - a8 * a1 * a7 + a8 * a3 * a5;
  inv[15] = a0 * a5 * a10 - a0 * a6 * a9 - a4 * a1 * a10 + a4 * a2 * a9 + a8 * a1 * a6 - a8 * a2 * a5;
  const det = a0 * inv[0] + a1 * inv[4] + a2 * inv[8] + a3 * inv[12];
  return inv.map((x) => x / det);
};
const scaling = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
const translation = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const applyDir = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];

// ------------------------------------------------------------------ glTF access

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

function reader(gltf, bin) {
  return (index) => {
    const a = gltf.accessors[index];
    const view = gltf.bufferViews[a.bufferView];
    const n = COMPONENTS[a.type];
    const Type = TYPED[a.componentType];
    const stride = view.byteStride ?? n * Type.BYTES_PER_ELEMENT;
    const out = new Float64Array(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0));
    const get = {
      5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true),
      5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
    }[a.componentType];
    const max = { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType];
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < n; k++) {
        const v = get(i * stride + k * Type.BYTES_PER_ELEMENT);
        out[i * n + k] = a.normalized ? v / max : v;
      }
    }
    return out;
  };
}

// ------------------------------------------------------------------ build

function build(sex) {
  const spec = BUILDS[sex];
  const gltf = JSON.parse(fs.readFileSync(path.join(BASE, `${spec.source}.gltf`), 'utf8'));
  const bin = fs.readFileSync(path.join(BASE, gltf.buffers[0].uri));
  const read = reader(gltf, bin);
  const skin = gltf.skins[0];
  const names = skin.joints.map((j) => gltf.nodes[j].name);
  const ibm = read(skin.inverseBindMatrices);
  const inverseBind = names.map((_, b) => Array.from(ibm.slice(b * 16, b * 16 + 16)));
  const bind = inverseBind.map(invert);

  // 1. Cross-sections, per bone: bind · scale · inverse bind.
  const reshape = names.map((name, b) => {
    const rule = spec.bones.find(([match]) => match.test(name));
    return rule ? mul(bind[b], mul(scaling(...rule[1]), inverseBind[b])) : null;
  });

  // 2. Shoulders: world offset per side (left is +X), and each bone's share of it.
  const shift = { l: [-spec.shoulderIn, -spec.shoulderDown, 0], r: [spec.shoulderIn, -spec.shoulderDown, 0] };
  const armShare = names.map((name) => {
    for (const side of ['l', 'r']) {
      if (ARM(side).test(name)) return { side, k: 1 };
      if (name === `clavicle_${side}`) return { side, k: 0.45 };
    }
    return null;
  });

  const meshes = [];
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const pos = read(prim.attributes.POSITION);
      const joints = read(prim.attributes.JOINTS_0);
      const weights = read(prim.attributes.WEIGHTS_0);
      const count = pos.length / 3;
      const out = new Float64Array(pos);
      const smoothMask = new Float64Array(count);
      for (let i = 0; i < count; i++) {
        let sx = 0, sy = 0, sz = 0, total = 0;
        const d = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const w = weights[i * 4 + k];
          if (w <= 0) continue;
          const b = joints[i * 4 + k];
          const m = reshape[b];
          const [x, y, z] = m ? apply(m, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) : [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
          sx += x * w; sy += y * w; sz += z * w; total += w;
          const share = armShare[b];
          if (share) for (let c = 0; c < 3; c++) d[c] += shift[share.side][c] * share.k * w;
          if (SMOOTHED.test(names[b])) smoothMask[i] += w;
        }
        if (total <= 0) continue;
        out[i * 3] = sx / total + d[0];
        out[i * 3 + 1] = sy / total + d[1];
        out[i * 3 + 2] = sz / total + d[2];
      }
      const indices = read(prim.indices);
      // Only the body gets smoothed: brows and eyes sit on the (unchanged) head.
      if (count > 5000) taubin(out, indices, smoothMask, spec.smooth);
      const normals = count > 5000 ? normalsOf(out, indices) : Float32Array.from(read(prim.attributes.NORMAL));
      meshes.push({ prim, positions: out, normals, indices });
    }
  }

  // The arm bones' new rest: world bind shifted by the offset; local translation of upperarm
  // moved by the offset expressed in its parent's (clavicle's) frame.
  for (let b = 0; b < names.length; b++) {
    const share = armShare[b];
    if (!share || share.k !== 1) continue;
    const [dx, dy, dz] = shift[share.side];
    inverseBind[b] = mul(inverseBind[b], translation(-dx, -dy, -dz));
    if (/^upperarm_/.test(names[b])) {
      const parent = names.indexOf(`clavicle_${share.side}`);
      const local = applyDir(inverseBind[parent], dx, dy, dz);
      const node = gltf.nodes[skin.joints[b]];
      node.translation = node.translation.map((t, c) => t + local[c]);
    }
  }

  write(gltf, spec, meshes, inverseBind);
  report(sex, names, bind, inverseBind);
}

/** Taubin λ|μ smoothing (no shrinking), weighted per vertex; UV-seam copies move together. */
function taubin(pos, indices, mask, iterations) {
  const count = pos.length / 3;
  // Weld seam copies by position.
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const groupOf = new Int32Array(count);
  const groups = new Map();
  for (let i = 0; i < count; i++) {
    const k = key(i);
    if (!groups.has(k)) groups.set(k, groups.size);
    groupOf[i] = groups.get(k);
  }
  const g = groups.size;
  const neighbours = Array.from({ length: g }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [groupOf[indices[t]], groupOf[indices[t + 1]], groupOf[indices[t + 2]]];
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  const p = new Float64Array(g * 3);
  const m = new Float64Array(g);
  for (let i = 0; i < count; i++) {
    p.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], groupOf[i] * 3);
    m[groupOf[i]] = Math.max(m[groupOf[i]], Math.min(1, mask[i]));
  }
  // Ease the mask in so the edge of the smoothed area doesn't show.
  for (let j = 0; j < g; j++) m[j] = m[j] * m[j] * (3 - 2 * m[j]);
  const step = (factor) => {
    const next = new Float64Array(p);
    for (let j = 0; j < g; j++) {
      if (m[j] <= 0 || !neighbours[j].size) continue;
      const avg = [0, 0, 0];
      for (const n of neighbours[j]) for (let c = 0; c < 3; c++) avg[c] += p[n * 3 + c];
      for (let c = 0; c < 3; c++) next[j * 3 + c] = p[j * 3 + c] + factor * m[j] * (avg[c] / neighbours[j].size - p[j * 3 + c]);
    }
    p.set(next);
  };
  for (let n = 0; n < iterations; n++) {
    step(0.5);
    step(-0.53);
  }
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = p[groupOf[i] * 3 + c];
}

/** Smooth area-weighted normals, shared across UV-seam copies. */
function normalsOf(pos, indices) {
  const count = pos.length / 3;
  const key = (i) => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  const groups = new Map();
  const groupOf = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const k = key(i);
    if (!groups.has(k)) groups.set(k, groups.size);
    groupOf[i] = groups.get(k);
  }
  const acc = new Float64Array(groups.size * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const e1 = [0, 1, 2].map((k) => pos[b * 3 + k] - pos[a * 3 + k]);
    const e2 = [0, 1, 2].map((k) => pos[c * 3 + k] - pos[a * 3 + k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) acc[groupOf[v] * 3 + k] += n[k];
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const j = groupOf[i];
    const l = Math.hypot(acc[j * 3], acc[j * 3 + 1], acc[j * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = acc[j * 3 + k] / l;
  }
  return out;
}

/** Rewrites the file compactly: positions, normals, first UV, skin, indices; no muscle normal map. */
function write(gltf, spec, meshes, inverseBind) {
  const read = reader(gltf, fs.readFileSync(path.join(BASE, gltf.buffers[0].uri)));
  const chunks = [];
  let offset = 0;
  const views = [];
  const accessors = [];
  const add = (typed, type, componentType, extra = {}, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    chunks.push(bytes);
    offset += bytes.length;
    accessors.push({ bufferView: views.length - 1, componentType, count: typed.length / COMPONENTS[type], type, ...extra });
    return accessors.length - 1;
  };
  const bounds = (p) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
    return { min, max };
  };
  for (const { prim, positions, normals, indices } of meshes) {
    const p32 = Float32Array.from(positions);
    const attributes = {
      POSITION: add(p32, 'VEC3', 5126, bounds(p32), 34962),
      NORMAL: add(normals, 'VEC3', 5126, {}, 34962),
      TEXCOORD_0: add(Float32Array.from(read(prim.attributes.TEXCOORD_0)), 'VEC2', 5126, {}, 34962),
      JOINTS_0: add(Uint8Array.from(read(prim.attributes.JOINTS_0)), 'VEC4', 5121, {}, 34962),
      WEIGHTS_0: add(Float32Array.from(read(prim.attributes.WEIGHTS_0)), 'VEC4', 5126, {}, 34962),
    };
    const idx = add(Uint16Array.from(indices), 'SCALAR', 5123, {}, 34963);
    prim.attributes = attributes;
    prim.indices = idx;
  }
  gltf.skins[0].inverseBindMatrices = add(Float32Array.from(inverseBind.flat()), 'MAT4', 5126);
  gltf.accessors = accessors;
  gltf.bufferViews = views;
  gltf.buffers = [{ uri: `${spec.out}.bin`, byteLength: offset }];
  // The skin: a toon base colour (muscle shading painted out), no muscle normal map.
  for (const material of gltf.materials) {
    if (!/^MI_Superhero_/.test(material.name)) continue;
    delete material.normalTexture;
    const texture = gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index];
    gltf.images.push({ uri: spec.skin });
    gltf.textures.push({ ...texture, source: gltf.images.length - 1 });
    material.pbrMetallicRoughness.baseColorTexture = { index: gltf.textures.length - 1 };
  }
  pruneImages(gltf);
  fs.writeFileSync(path.join(BASE, `${spec.out}.bin`), Buffer.concat(chunks));
  fs.writeFileSync(path.join(BASE, `${spec.out}.gltf`), JSON.stringify(gltf));
}

/** Drops textures and images no material uses any more. */
function pruneImages(gltf) {
  const used = new Set();
  const visit = (ref) => ref && used.add(ref.index);
  for (const m of gltf.materials) {
    visit(m.pbrMetallicRoughness?.baseColorTexture);
    visit(m.pbrMetallicRoughness?.metallicRoughnessTexture);
    visit(m.normalTexture);
    visit(m.emissiveTexture);
    visit(m.occlusionTexture);
  }
  const keep = [...used].sort((a, b) => a - b);
  const remap = new Map(keep.map((old, i) => [old, i]));
  const textures = keep.map((i) => gltf.textures[i]);
  const images = [...new Set(textures.map((t) => t.source))].sort((a, b) => a - b);
  const imageRemap = new Map(images.map((old, i) => [old, i]));
  gltf.images = images.map((i) => gltf.images[i]);
  gltf.textures = textures.map((t) => ({ ...t, source: imageRemap.get(t.source) }));
  const fix = (ref) => ref && (ref.index = remap.get(ref.index));
  for (const m of gltf.materials) {
    fix(m.pbrMetallicRoughness?.baseColorTexture);
    fix(m.pbrMetallicRoughness?.metallicRoughnessTexture);
    fix(m.normalTexture);
  }
}

function report(sex, names, before, inverseBind) {
  const at = (m) => [m[12], m[13], m[14]].map((v) => v.toFixed(3)).join(', ');
  const after = inverseBind.map(invert);
  for (const name of ['clavicle_l', 'upperarm_l', 'hand_l']) {
    const b = names.indexOf(name);
    console.log(`${sex} ${name}: ${at(before[b])} -> ${at(after[b])}`);
  }
}

build('male');
build('female');
