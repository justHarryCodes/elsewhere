// Authors the furniture actions the Universal Animation Library doesn't have, on the same skeleton:
// lying asleep, soaking in a bath, showering, typing at a desk, working at a counter and playing an
// arcade cabinet. Each is a base pose (a library clip, sampled over its loop) with limbs aimed at
// world directions (the character faces +Z, Y up) and small loops of motion on top: breathing,
// scrubbing, typing. Writes public/assets/animations/UAL_Actions.glb.
//
// Contact, in character space (the root at the floor under the character):
//   Lie_Loop     the back on y = 0.03, head toward -Z, feet toward +Z; stand the root on the mattress.
//   Bath_Loop    the seat on y = 0.03, reclined against -Z, legs out along +Z; root on the tub floor.
//   others       standing or sitting like the library's clips (seat 0.46 m up, 0.3 m behind the root).
//
// node scripts/characters/pose_clips.mjs
import { aim, clonePose, forward, inv, loadLibrary, rotate, sampleClip, turn, writeClips } from './rig.mjs';

const lib = loadLibrary('UAL1_Standard.glb');
const LOOP = 4;
const FPS = 8;
const times = Array.from({ length: LOOP * FPS + 1 }, (_, k) => k / FPS);
const wave = (t, period, phase = 0) => Math.sin(((t / period) * 2 + phase) * Math.PI);

/** Moves the pelvis so it sits at a world point (its translation lives in the rotated root's space). */
function placePelvis(pose, world) {
  const pelvis = lib.byName.get('pelvis');
  const root = lib.parent.get(pelvis);
  const rootWorld = forward(lib, pose).get(root);
  const local = rotate(inv(rootWorld.r), world.map((v, k) => v - rootWorld.p[k]));
  pose.translation.set(pelvis, local);
}

/** Lowest point of the main joints: to set a pose down on a surface. */
function lowest(pose) {
  const w = forward(lib, pose);
  return Math.min(...['pelvis', 'spine_02', 'spine_03', 'Head', 'calf_l', 'calf_r', 'foot_l', 'foot_r'].map((n) => w.get(lib.byName.get(n)).p[1]));
}

function lie(t) {
  const pose = clonePose(sampleClip(lib, 'Idle_Loop', 0));
  // Tip the whole body onto its back: head to -Z, face up.
  turn(lib, pose, 'pelvis', [1, 0, 0], -Math.PI / 2);
  // Legs straight down the bed, one knee a little up; arms along the body, a hand on the chest.
  aim(lib, pose, 'thigh_l', [0.1, 0.12, 1]);
  aim(lib, pose, 'calf_l', [0.08, -0.12, 1]);
  aim(lib, pose, 'thigh_r', [-0.08, 0, 1]);
  aim(lib, pose, 'calf_r', [-0.06, 0, 1]);
  aim(lib, pose, 'foot_l', [0.1, 1, 0.3]);
  aim(lib, pose, 'foot_r', [-0.1, 1, 0.3]);
  aim(lib, pose, 'upperarm_l', [0.35, -0.12, 1]);
  aim(lib, pose, 'lowerarm_l', [0.1, -0.05, 1]);
  aim(lib, pose, 'upperarm_r', [-0.3, 0.05, 1]);
  aim(lib, pose, 'lowerarm_r', [0.9, 0.35, -0.1]);
  // The head turned a little to one side on the pillow, and slow breathing.
  turn(lib, pose, 'Head', [0, 0, 1], 0.25);
  turn(lib, pose, 'spine_03', [1, 0, 0], 0.04 * wave(t, LOOP));
  const w = forward(lib, pose).get(lib.byName.get('pelvis')).p;
  placePelvis(pose, [w[0], w[1] - lowest(pose) + 0.1, w[2]]);
  return pose;
}

function bath(t) {
  const pose = lie(t);
  // Sit up against the end of the tub, arms along its rims.
  turn(lib, pose, 'spine_01', [1, 0, 0], 0.55);
  turn(lib, pose, 'spine_02', [1, 0, 0], 0.15);
  aim(lib, pose, 'thigh_l', [0.12, 0.05, 1]);
  aim(lib, pose, 'calf_l', [0.08, -0.05, 1]);
  aim(lib, pose, 'upperarm_l', [1, -0.25, 0.2]);
  aim(lib, pose, 'lowerarm_l', [0.6, -0.1, 0.8]);
  aim(lib, pose, 'upperarm_r', [-1, -0.25, 0.2]);
  aim(lib, pose, 'lowerarm_r', [-0.6, -0.1, 0.8]);
  turn(lib, pose, 'Head', [1, 0, 0], -0.2 + 0.05 * wave(t, LOOP));
  const w = forward(lib, pose).get(lib.byName.get('pelvis')).p;
  placePelvis(pose, [w[0], w[1] - lowest(pose) + 0.08, w[2]]);
  return pose;
}

function shower(t) {
  const pose = clonePose(sampleClip(lib, 'Idle_Loop', (t * 0.7) % 2));
  // Hands in the hair, scrubbing; face tipped up into the water, a gentle sway.
  const s = 0.12 * wave(t, 1);
  aim(lib, pose, 'upperarm_l', [0.75, 0.45, 0.25]);
  aim(lib, pose, 'lowerarm_l', [-0.55 + s, 0.75, 0.1]);
  aim(lib, pose, 'upperarm_r', [-0.75, 0.45, 0.25]);
  aim(lib, pose, 'lowerarm_r', [0.55 + s, 0.75, 0.1]);
  turn(lib, pose, 'Head', [1, 0, 0], -0.3);
  turn(lib, pose, 'spine_01', [0, 0, 1], 0.04 * wave(t, 2));
  return pose;
}

function typing(t) {
  const pose = clonePose(sampleClip(lib, 'Sitting_Idle_Loop', 0));
  // Forearms out to the keyboard, fingers tapping, eyes on the screen.
  aim(lib, pose, 'upperarm_l', [0.15, -0.6, 0.8]);
  aim(lib, pose, 'lowerarm_l', [-0.1, 0.05 + 0.04 * wave(t, 0.5), 1]);
  aim(lib, pose, 'upperarm_r', [-0.15, -0.6, 0.8]);
  aim(lib, pose, 'lowerarm_r', [0.1, 0.05 + 0.04 * wave(t, 0.5, 0.5), 1]);
  turn(lib, pose, 'hand_l', [1, 0, 0], 0.15 * wave(t, 0.25));
  turn(lib, pose, 'hand_r', [1, 0, 0], 0.15 * wave(t, 0.25, 0.7));
  turn(lib, pose, 'Head', [1, 0, 0], 0.1);
  return pose;
}

function counter(t) {
  const pose = clonePose(sampleClip(lib, 'Idle_Loop', (t * 0.5) % 2));
  // Hands busy on a worktop: washing, chopping, stirring, in small circles.
  const cx = 0.12 * wave(t, 1.3);
  const cz = 0.12 * wave(t, 1.3, 0.5);
  aim(lib, pose, 'upperarm_l', [0.25, -0.85, 0.45]);
  aim(lib, pose, 'lowerarm_l', [-0.2 + cx, -0.2, 1 + cz]);
  aim(lib, pose, 'upperarm_r', [-0.25, -0.85, 0.45]);
  aim(lib, pose, 'lowerarm_r', [0.2 + cx, -0.2, 1 - cz]);
  turn(lib, pose, 'Head', [1, 0, 0], 0.3);
  turn(lib, pose, 'spine_02', [1, 0, 0], 0.12);
  return pose;
}

function play(t) {
  const pose = clonePose(sampleClip(lib, 'Idle_Loop', (t * 0.5) % 2));
  // Standing at a cabinet: a hand on the stick, the other hitting buttons, a little bounce.
  aim(lib, pose, 'upperarm_l', [0.2, -0.6, 0.75]);
  aim(lib, pose, 'lowerarm_l', [-0.15 + 0.1 * wave(t, 0.6), 0.1, 1]);
  aim(lib, pose, 'upperarm_r', [-0.2, -0.6, 0.75]);
  aim(lib, pose, 'lowerarm_r', [0.15, 0.1 + 0.08 * wave(t, 0.3), 1]);
  turn(lib, pose, 'Head', [1, 0, 0], 0.08);
  turn(lib, pose, 'spine_01', [0, 1, 0], 0.06 * wave(t, 2));
  return pose;
}

const clips = { Lie_Loop: lie, Bath_Loop: bath, Shower_Loop: shower, Type_Loop: typing, Counter_Loop: counter, Play_Loop: play };
writeClips(
  lib,
  'UAL_Actions.glb',
  Object.fromEntries(Object.entries(clips).map(([name, fn]) => [name, { times, frames: times.map((t) => fn(t)) }])),
);
for (const [name, fn] of Object.entries(clips)) {
  const w = forward(lib, fn(0));
  const at = (n) => w.get(lib.byName.get(n)).p.map((v) => v.toFixed(2)).join(',');
  console.log(name.padEnd(12), 'pelvis', at('pelvis'), 'head', at('Head'), 'hand_l', at('hand_l'), 'foot_l', at('foot_l'), 'low', lowest(fn(0)).toFixed(2));
}
