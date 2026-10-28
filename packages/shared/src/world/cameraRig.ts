// The district camera: an angled third-person view that keeps the place in frame. It aims at a blend
// of the preset's focus and the player (followBias), eases toward that, and reports which buildings
// stand between the camera and the player so the renderer can fade them.

import type { CameraPreset } from './locations';
import type { SceneDef } from './scene';

export type View = SceneDef['view'];

export interface Box3 {
  id: string;
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** Where the camera stands for a view: yaw 0 looks toward -Z from the +Z side. */
export function viewCamera(view: View) {
  const pitch = (view.pitchDeg * Math.PI) / 180;
  const yaw = (view.yawDeg * Math.PI) / 180;
  const flat = Math.cos(pitch) * view.distance;
  const y = view.target.y ?? 0;
  return {
    position: { x: view.target.x + Math.sin(yaw) * flat, y: y + Math.sin(pitch) * view.distance, z: view.target.z + Math.cos(yaw) * flat },
    target: { x: view.target.x, y, z: view.target.z },
  };
}

/** The view the camera wants: the preset's angle, aimed between its focus and the player (at floor height y). */
export function districtView(preset: CameraPreset, player: { x: number; z: number }, y = 0): View {
  const b = preset.followBias;
  return {
    target: { x: preset.focus.x + (player.x - preset.focus.x) * b, z: preset.focus.z + (player.z - preset.focus.z) * b, y },
    distance: preset.distance,
    pitchDeg: preset.pitchDeg,
    yawDeg: preset.yawDeg,
    fov: preset.fov,
  };
}

/**
 * The close-up: a third-person view just behind and above the player, looking past them, so walking
 * round feels like exploring. `yaw` (radians) is where the camera stands round them (0 = on their
 * +Z side); inside it sits a little closer and higher, over the cut-away walls.
 */
export const CLOSE_UP = {
  outside: { distance: 4.8, pitchDeg: 15, height: 1.35, fov: 55 },
  inside: { distance: 3.8, pitchDeg: 24, height: 1.3, fov: 58 },
} as const;

export function closeUpView(player: { x: number; z: number }, yaw: number, floorY: number, inside: boolean): View {
  const c = inside ? CLOSE_UP.inside : CLOSE_UP.outside;
  return {
    target: { x: player.x, z: player.z, y: floorY + c.height },
    distance: c.distance,
    pitchDeg: c.pitchDeg,
    yawDeg: (yaw * 180) / Math.PI,
    fov: c.fov,
  };
}

/** Eases the current view toward the goal (frame-rate independent); the camera turns the short way round. */
export function easeView(now: View, goal: View, dt: number, rate = 4): View {
  const t = 1 - Math.exp(-rate * dt);
  const mix = (a: number, b: number) => a + (b - a) * t;
  const turn = ((((goal.yawDeg - now.yawDeg) % 360) + 540) % 360) - 180;
  return {
    target: { x: mix(now.target.x, goal.target.x), z: mix(now.target.z, goal.target.z), y: mix(now.target.y ?? 0, goal.target.y ?? 0) },
    distance: mix(now.distance, goal.distance),
    pitchDeg: mix(now.pitchDeg, goal.pitchDeg),
    yawDeg: now.yawDeg + turn * t,
    fov: mix(now.fov ?? 45, goal.fov ?? 45),
  };
}

/**
 * The view pulled in so nothing solid stands between the player and the camera (a tree, a planter,
 * a wall): the camera stops just short of the first box in the way, no nearer than `nearest`.
 */
export function pullIn(view: View, boxes: readonly Box3[], nearest = 1.4): View {
  const from = { ...view.target, y: view.target.y ?? 0 };
  const to = viewCamera(view).position;
  let clear = view.distance;
  for (const box of boxes) {
    // A box the player stands in (a building's footprint round a doorway) doesn't count.
    if (inside(from, box)) continue;
    const t = entry(from, to, box);
    if (t !== null) clear = Math.min(clear, t * view.distance - 0.35);
  }
  return clear < view.distance ? { ...view, distance: Math.max(nearest, clear) } : view;
}

const inside = (p: { x: number; y: number; z: number }, b: Box3) =>
  p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z;

/** How far along the segment a to b (0 to 1) it first enters the box, or null if it misses. */
function entry(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, box: Box3): number | null {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] < box.min[k] || a[k] > box.max[k]) return null;
      continue;
    }
    let near = (box.min[k] - a[k]) / d;
    let far = (box.max[k] - a[k]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return null;
  }
  return t0;
}

/** Boxes that cut the line from the camera to the player's chest. */
export function occluders(view: View, player: { x: number; z: number }, boxes: readonly Box3[]): string[] {
  const from = viewCamera(view).position;
  const to = { x: player.x, y: (view.target.y ?? 0) + 1.2, z: player.z };
  return boxes.filter((box) => segmentHitsBox(from, to, box)).map((box) => box.id);
}

// Slab test: does the segment from a to b pass through the box?
function segmentHitsBox(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, box: Box3) {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] < box.min[k] || a[k] > box.max[k]) return false;
      continue;
    }
    let near = (box.min[k] - a[k]) / d;
    let far = (box.max[k] - a[k]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}
