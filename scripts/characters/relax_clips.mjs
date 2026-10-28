// Makes calmer copies of the Universal Animation Library's idle, walk, jog and run. The originals are
// action-hero poses: arms held out from the body, fists clenched, big arm pumps, a rolling chest.
// Here the upper arms are re-centred to hang by the body, every key of the arm and spine bones keeps
// only part of its swing around that centre (timing and shape stay, the motion is smaller), fists
// open toward a relaxed hand, and the hips bob a little less. Legs are untouched, so feet still match
// the ground speed. Writes public/assets/animations/UAL_Relaxed.glb (skeleton nodes + these clips,
// same names).
//
// node scripts/characters/relax_clips.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const DIR = path.join(ROOT, 'apps', 'client', 'public', 'assets', 'animations');

/** Clip -> how much of each bone group's motion is kept (1 = all of it); `hang` re-centres the upper
 * arms so they hang down by the body (null keeps the clip's own arm pose, for sprinting); `fingers`
 * is how much of the clip's fist is kept (0 = the rig's open hand); `elbow` how much of the clip's average
 * elbow bend is kept (0 = straight), so forearms hang down rather than reaching forward; `stance` how much
 * of the legs' sideways spread is kept (feet closer together; only where given). */
const CLIPS = {
  Idle_Loop: { arms: 1, forearms: 0.6, spine: 1, clavicles: 0.6, bob: 1, hang: [0.2, -1, -0.02], elbow: 0.3, fingers: 0.35, stance: 0.3 },
  Walk_Loop: { arms: 0.55, forearms: 0.6, spine: 0.55, clavicles: 0.4, bob: 0.85, hang: [0.18, -1, -0.01], elbow: 0.7, fingers: 0.4 },
  Jog_Fwd_Loop: { arms: 0.6, forearms: 0.65, spine: 0.55, clavicles: 0.4, bob: 0.8, hang: [0.2, -1, 0.02], elbow: 1, fingers: 0.5 },
  Sprint_Loop: { arms: 0.7, forearms: 0.7, spine: 0.6, clavicles: 0.45, bob: 0.85, hang: null, elbow: 1, fingers: 0.55 },
};
const GROUP = (name) =>
  /^upperarm_/.test(name) ? 'arms' :
  /^lowerarm_/.test(name) ? 'forearms' :
  /^clavicle_/.test(name) ? 'clavicles' :
  /^thigh_/.test(name) ? 'thighs' :
  /^(thumb|index|middle|ring|pinky)_0[1-3]_/.test(name) ? 'fingers' :
  /^(spine_0\d|neck_01|Head)$/.test(name) ? 'spine' : null;

const glb = fs.readFileSync(path.join(DIR, 'UAL1_Standard.glb'));
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const bin = glb.subarray(20 + jsonLength + 8);

const floats = (index) => {
  const a = gltf.accessors[index];
  const view = gltf.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || view.byteStride) throw new Error('expected tightly packed floats');
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new Float32Array(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * n * 4));
};

// Quaternion helpers (x, y, z, w).
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const normalize = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
function slerp(a, b, t) {
  let d = dot(a, b);
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return normalize(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
const rotate = (q, v) => mul(mul(q, [...v, 0]), inv(q)).slice(0, 3);
/** The shortest rotation taking direction a onto direction b. */
function fromTo(a, b) {
  const na = Math.hypot(...a), nb = Math.hypot(...b);
  const [ax, ay, az] = a.map((v) => v / na), [bx, by, bz] = b.map((v) => v / nb);
  return normalize([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, 1 + ax * bx + ay * by + az * bz]);
}
const IDENTITY = [0, 0, 0, 1];
function mean(quats) {
  const ref = quats[0];
  const sum = [0, 0, 0, 0];
  for (const q of quats) {
    const sign = dot(q, ref) < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) sum[i] += q[i] * sign;
  }
  return normalize(sum);
}

const out = { asset: { version: '2.0', generator: 'relax_clips.mjs' }, scene: 0, scenes: gltf.scenes, nodes: gltf.nodes.map(({ mesh, skin, ...node }) => node), animations: [], accessors: [], bufferViews: [], buffers: [] };
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

const parentOf = new Map();
gltf.nodes.forEach((node, i) => (node.children ?? []).forEach((c) => parentOf.set(c, i)));
const nodeNamed = (name) => gltf.nodes.findIndex((n) => n.name === name);

for (const [clip, keep] of Object.entries(CLIPS)) {
  const source = gltf.animations.find((a) => a.name === clip);
  if (!source) throw new Error(`no clip ${clip}`);
  // Each bone's average rotation over the clip (its rest rotation if the clip doesn't move it).
  const quatsOf = new Map();
  for (const channel of source.channels) {
    if (channel.target.path !== 'rotation') continue;
    const values = floats(source.samplers[channel.sampler].output);
    const quats = [];
    for (let i = 0; i < values.length; i += 4) quats.push([...values.subarray(i, i + 4)]);
    quatsOf.set(channel.target.node, quats);
  }
  const average = (node) => (quatsOf.has(node) ? mean(quatsOf.get(node)) : gltf.nodes[node].rotation ?? IDENTITY);
  const worldAverage = (node) => (node === undefined ? IDENTITY : mul(worldAverage(parentOf.get(node)), average(node)));

  const inputs = new Map();
  const animation = { name: clip, channels: [], samplers: [] };
  for (const channel of source.channels) {
    const sampler = source.samplers[channel.sampler];
    const name = gltf.nodes[channel.target.node].name;
    const time = floats(sampler.input);
    let values = floats(sampler.output);
    const group = GROUP(name);
    if (channel.target.path === 'rotation' && group === 'fingers') {
      // Open the fist toward the rig's relaxed hand.
      const rest = gltf.nodes[channel.target.node].rotation ?? IDENTITY;
      const quats = [];
      for (let i = 0; i < values.length; i += 4) quats.push([...values.subarray(i, i + 4)]);
      values = Float32Array.from(quats.flatMap((q) => slerp(rest, q, keep.fingers)));
    } else if (channel.target.path === 'rotation' && group === 'thighs') {
      if (keep.stance !== undefined) {
        // Turn each thigh in around the forward axis; calves and feet follow, soles stay level.
        const quats = [];
        for (let i = 0; i < values.length; i += 4) quats.push([...values.subarray(i, i + 4)]);
        const centre = mean(quats);
        const parent = worldAverage(parentOf.get(channel.target.node));
        const world = mul(parent, centre);
        const dir = rotate(world, [0, 1, 0]);
        const turn = fromTo(dir, [dir[0] * keep.stance, dir[1], dir[2]]);
        const target = mul(inv(parent), mul(turn, world));
        values = Float32Array.from(quats.flatMap((q) => normalize(mul(target, mul(inv(centre), q)))));
      }
    } else if (channel.target.path === 'rotation' && group) {
      const quats = [];
      for (let i = 0; i < values.length; i += 4) quats.push([...values.subarray(i, i + 4)]);
      const centre = mean(quats);
      let target = centre;
      if (group === 'forearms') target = slerp(gltf.nodes[channel.target.node].rotation ?? IDENTITY, centre, keep.elbow);
      if (group === 'arms' && keep.hang) {
        // Re-centre: turn the arm's average direction (bones run along +Y) to hang by the body.
        const side = name.endsWith('_l') ? 1 : -1;
        const parent = worldAverage(parentOf.get(channel.target.node));
        const world = mul(parent, centre);
        const turn = fromTo(rotate(world, [0, 1, 0]), [keep.hang[0] * side, keep.hang[1], keep.hang[2]]);
        target = mul(inv(parent), mul(turn, world));
      }
      // The new centre plus a share of the clip's own motion around its old one.
      values = Float32Array.from(quats.flatMap((q) => normalize(mul(target, slerp(IDENTITY, mul(inv(centre), q), keep[group])))));
    } else if (channel.target.path === 'translation' && name === 'pelvis') {
      // Less bounce: the hips' height swings less around its average.
      values = Float32Array.from(values);
      let avg = 0;
      for (let i = 1; i < values.length; i += 3) avg += values[i];
      avg /= values.length / 3;
      for (let i = 1; i < values.length; i += 3) values[i] = avg + (values[i] - avg) * keep.bob;
    }
    if (!inputs.has(sampler.input)) {
      inputs.set(sampler.input, add(time, 'SCALAR', { min: [time[0]], max: [time[time.length - 1]] }));
    }
    animation.samplers.push({ input: inputs.get(sampler.input), output: add(values, channel.target.path === 'rotation' ? 'VEC4' : 'VEC3'), interpolation: sampler.interpolation });
    animation.channels.push({ sampler: animation.samplers.length - 1, target: channel.target });
  }
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
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
fs.writeFileSync(path.join(DIR, 'UAL_Relaxed.glb'), Buffer.concat([header, chunk(0x4e4f534a, Buffer.concat([json, jsonPad])), chunk(0x004e4942, body)]));
console.log(`wrote UAL_Relaxed.glb: ${out.animations.map((a) => a.name).join(', ')} (${(offset / 1024).toFixed(0)} KB)`);
