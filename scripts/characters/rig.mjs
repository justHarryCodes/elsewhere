// The Universal Animation Library's skeleton and clips as plain data, with forward kinematics and
// quaternion helpers: shared by the scripts that make new clips (relax_clips.mjs, pose_clips.mjs).
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
export const ANIMATIONS = path.join(ROOT, 'apps', 'client', 'public', 'assets', 'animations');

// ------------------------------------------------------------------ quaternions (x, y, z, w)

export const IDENTITY = [0, 0, 0, 1];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const normalize = (q) => {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
};
export const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
export const rotate = (q, v) => mul(mul(q, [...v, 0]), inv(q)).slice(0, 3);
export function slerp(a, b, t) {
  let d = dot(a, b);
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return normalize(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d);
  const s = Math.sin(th);
  return a.map((v, i) => v * (Math.sin((1 - t) * th) / s) + bb[i] * (Math.sin(t * th) / s));
}
/** The shortest rotation taking direction a onto direction b. */
export function fromTo(a, b) {
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  const [ax, ay, az] = a.map((v) => v / na);
  const [bx, by, bz] = b.map((v) => v / nb);
  const d = ax * bx + ay * by + az * bz;
  if (d < -0.9999) {
    // Opposite: half a turn about any axis square to a.
    const axis = Math.abs(ax) < 0.9 ? [0, -az, ay] : [az, 0, -ax];
    return normalize([...axis, 0]);
  }
  return normalize([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, 1 + d]);
}
export const axisAngle = (axis, angle) => {
  const l = Math.hypot(...axis);
  const s = Math.sin(angle / 2) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
export function mean(quats) {
  const sum = [0, 0, 0, 0];
  for (const q of quats) {
    const sign = dot(q, quats[0]) < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) sum[i] += q[i] * sign;
  }
  return normalize(sum);
}

// ------------------------------------------------------------------ the library

/** Loads a library GLB: its glTF, binary chunk, and the node tree (by index and by name). */
export function loadLibrary(file) {
  const glb = fs.readFileSync(path.join(ANIMATIONS, file));
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = glb.subarray(20 + jsonLength + 8);
  const parent = new Map();
  gltf.nodes.forEach((node, i) => (node.children ?? []).forEach((c) => parent.set(c, i)));
  const byName = new Map(gltf.nodes.map((n, i) => [n.name, i]));
  const floats = (index) => {
    const a = gltf.accessors[index];
    const view = gltf.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new Float32Array(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * n * 4));
  };
  return { gltf, bin, parent, byName, floats };
}

/**
 * A clip as per-node tracks, sampled at a time: { rotation: Map(node -> quat), translation: Map(node -> vec3) }.
 * Nodes the clip doesn't move keep their rest values.
 */
export function sampleClip(lib, clipName, time) {
  const { gltf, floats } = lib;
  const clip = gltf.animations.find((a) => a.name === clipName);
  if (!clip) throw new Error(`no clip ${clipName}`);
  const rotation = new Map(gltf.nodes.map((n, i) => [i, n.rotation ?? IDENTITY]));
  const translation = new Map(gltf.nodes.map((n, i) => [i, n.translation ?? [0, 0, 0]]));
  for (const channel of clip.channels) {
    const sampler = clip.samplers[channel.sampler];
    const times = floats(sampler.input);
    const values = floats(sampler.output);
    const n = channel.target.path === 'rotation' ? 4 : 3;
    if (channel.target.path === 'scale') continue;
    const t = Math.min(Math.max(time, times[0]), times[times.length - 1]);
    let k = 0;
    while (k < times.length - 2 && times[k + 1] < t) k++;
    const f = times[k + 1] > times[k] ? (t - times[k]) / (times[k + 1] - times[k]) : 0;
    const a = [...values.subarray(k * n, k * n + n)];
    const b = [...values.subarray((k + 1) * n, (k + 1) * n + n)];
    const v = n === 4 ? slerp(a, b, f) : a.map((x, i) => x + (b[i] - x) * f);
    (n === 4 ? rotation : translation).set(channel.target.node, v);
  }
  return { rotation, translation };
}

/** World rotation and position of every node for a pose (rotation/translation maps). */
export function forward(lib, pose) {
  const { gltf, parent } = lib;
  const world = new Map();
  const visit = (i) => {
    if (world.has(i)) return world.get(i);
    const p = parent.get(i);
    const local = { r: pose.rotation.get(i) ?? IDENTITY, t: pose.translation.get(i) ?? [0, 0, 0] };
    const scale = gltf.nodes[i].scale ?? [1, 1, 1];
    let out;
    if (p === undefined) out = { r: local.r, p: local.t };
    else {
      const up = visit(p);
      const ps = gltf.nodes[p].scale ?? [1, 1, 1];
      const t = local.t.map((v, k) => v * ps[k]);
      const off = rotate(up.r, t);
      out = { r: mul(up.r, local.r), p: up.p.map((v, k) => v + off[k]) };
    }
    void scale;
    world.set(i, out);
    return out;
  };
  gltf.nodes.forEach((_, i) => visit(i));
  return world;
}

/** Turns one bone so its own +Y axis (the way it runs) points along `dir` in world space; the rest follow. */
export function aim(lib, pose, name, dir, twist = 0) {
  const i = lib.byName.get(name);
  const world = forward(lib, pose);
  const parentWorld = lib.parent.has(i) ? world.get(lib.parent.get(i)).r : IDENTITY;
  const current = world.get(i).r;
  const along = rotate(current, [0, 1, 0]);
  let target = mul(fromTo(along, dir), current);
  if (twist) target = mul(axisAngle(dir, twist), target);
  pose.rotation.set(i, normalize(mul(inv(parentWorld), target)));
}

/** Turns one bone by an extra rotation about a world axis (radians). */
export function turn(lib, pose, name, axis, angle) {
  const i = lib.byName.get(name);
  const world = forward(lib, pose);
  const parentWorld = lib.parent.has(i) ? world.get(lib.parent.get(i)).r : IDENTITY;
  const target = mul(axisAngle(axis, angle), world.get(i).r);
  pose.rotation.set(i, normalize(mul(inv(parentWorld), target)));
}

export const clonePose = (pose) => ({ rotation: new Map(pose.rotation), translation: new Map(pose.translation) });

/** Writes clips (name -> { times, frames: pose[] }) as an animation-only GLB with the library's nodes. */
export function writeClips(lib, file, clips) {
  const { gltf } = lib;
  const out = { asset: { version: '2.0', generator: 'rig.mjs' }, scene: 0, scenes: gltf.scenes, nodes: gltf.nodes.map(({ mesh, skin, ...node }) => node), animations: [], accessors: [], bufferViews: [], buffers: [] };
  const chunks = [];
  let offset = 0;
  const add = (data, type, extra = {}) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    out.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    chunks.push(bytes);
    offset += bytes.length;
    out.accessors.push({ bufferView: out.bufferViews.length - 1, componentType: 5126, count: data.length / { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], type, ...extra });
    return out.accessors.length - 1;
  };
  for (const [name, { times, frames }] of Object.entries(clips)) {
    const input = add(Float32Array.from(times), 'SCALAR', { min: [times[0]], max: [times[times.length - 1]] });
    const animation = { name, channels: [], samplers: [] };
    gltf.nodes.forEach((node, i) => {
      if (node.mesh !== undefined || node.skin !== undefined || !lib.parent.has(i)) return;
      const rot = Float32Array.from(frames.flatMap((f) => f.rotation.get(i) ?? IDENTITY));
      animation.samplers.push({ input, output: add(rot, 'VEC4'), interpolation: 'LINEAR' });
      animation.channels.push({ sampler: animation.samplers.length - 1, target: { node: i, path: 'rotation' } });
      if (['root', 'pelvis'].includes(node.name)) {
        const tr = Float32Array.from(frames.flatMap((f) => f.translation.get(i) ?? [0, 0, 0]));
        animation.samplers.push({ input, output: add(tr, 'VEC3'), interpolation: 'LINEAR' });
        animation.channels.push({ sampler: animation.samplers.length - 1, target: { node: i, path: 'translation' } });
      }
    });
    out.animations.push(animation);
  }
  out.buffers.push({ byteLength: offset });
  const json = Buffer.from(JSON.stringify(out));
  const jsonPad = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + jsonPad.length + 8 + body.length, 8);
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  fs.writeFileSync(path.join(ANIMATIONS, file), Buffer.concat([header, chunk(0x4e4f534a, Buffer.concat([json, jsonPad])), chunk(0x004e4942, body)]));
}
