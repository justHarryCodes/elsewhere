// Walking the player around a district: steering toward input, invisible walls at the block edge,
// and building footprints that can't be walked through. Plain maths, no renderer.

import { HUMAN_METRICS } from '../scale';

/** An axis-aligned rectangle on the ground. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerPose {
  x: number;
  z: number;
  /** Facing, radians; 0 = +Z. */
  rotY: number;
  /** Ground speed this step, m/s (picks the walk/jog clip). */
  speed: number;
}

/** A brisk walk: quick enough to cross a block, slow enough to read the street. */
export const DISTRICT_SPEED = HUMAN_METRICS.walkSpeed * 1.4;
const RADIUS = 0.35;
const TURN_RATE = 10;

/** Where the player may stand: a rectangle (a block's invisible walls), or a test (an inside's rooms and stairs). */
export type WalkArea = Rect | ((x: number, z: number) => boolean);

/**
 * One step: `move` is the wanted direction in world space (length up to 1). The player turns toward
 * it, moves, slides along walls and footprints, and stays inside `area`.
 */
export function stepPlayer(
  pose: PlayerPose,
  move: { x: number; z: number },
  dt: number,
  area: WalkArea,
  solids: readonly Rect[],
  /** How far the body reaches from its centre: where it touches walls and furniture. */
  radius = RADIUS,
): PlayerPose {
  const amount = Math.min(1, Math.hypot(move.x, move.z));
  if (amount < 0.05) return { ...pose, speed: 0 };
  const heading = Math.atan2(move.x, move.z);
  let turn = heading - pose.rotY;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const rotY = pose.rotY + turn * Math.min(1, TURN_RATE * dt);
  const step = DISTRICT_SPEED * amount * dt;
  // Each axis on its own, so the player slides along whatever blocks the other.
  const len = Math.hypot(move.x, move.z);
  const fits = (px: number, pz: number) => (typeof area === 'function' ? area(px, pz) : true) && !solids.some((s) => overlaps(px, pz, s, radius));
  const inX = (v: number) => (typeof area === 'function' ? v : clamp(v, area.minX + radius, area.maxX - radius));
  const inZ = (v: number) => (typeof area === 'function' ? v : clamp(v, area.minZ + radius, area.maxZ - radius));
  let x = inX(pose.x + (move.x / len) * step);
  if (!fits(x, pose.z)) x = pose.x;
  let z = inZ(pose.z + (move.z / len) * step);
  if (!fits(x, z)) z = pose.z;
  const moved = Math.hypot(x - pose.x, z - pose.z);
  return { x, z, rotY, speed: dt > 0 ? moved / dt : 0 };
}

/** Within a circular zone (e.g. a door). */
export const inZone = (x: number, z: number, zone: { x: number; z: number; radius: number }) =>
  Math.hypot(x - zone.x, z - zone.z) <= zone.radius;

/** A direction toward a target point, easing off when close (tap-to-walk). */
export function towards(pose: PlayerPose, target: { x: number; z: number }) {
  const dx = target.x - pose.x;
  const dz = target.z - pose.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) return { x: 0, z: 0 };
  const k = Math.min(1, d / 0.8) / d;
  return { x: dx * k, z: dz * k };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const overlaps = (x: number, z: number, s: Rect, r: number) => x > s.minX - r && x < s.maxX + r && z > s.minZ - r && z < s.maxZ + r;
