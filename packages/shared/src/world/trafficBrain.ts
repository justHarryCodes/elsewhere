// Cars on a district's road: each follows a closed loop of points at a steady speed, slows through
// slow zones (crossings), and keeps its distance from the car ahead. The player can't step onto the
// road (the walk area stops at the kerb), so cars never meet them.

import type { Rect } from './playerMotion';

export interface CarLoop {
  points: { x: number; z: number }[];
  count: number;
}

export interface CarState {
  id: string;
  /** Asset key of the model. */
  asset: string;
  loop: number;
  /** Distance travelled along the loop, metres. */
  s: number;
  speed: number;
  x: number;
  z: number;
  /** Heading, radians; 0 = +Z. */
  rotY: number;
}

const CRUISE = 6;
const SLOW = 2.5;
const ACCEL = 3;
/** Bumper-to-bumper gap kept behind the car ahead (centre to centre). */
const GAP = 8;
const MODELS = ['sedan', 'taxi', 'van', 'suv', 'hatchback', 'delivery', 'sedan-sports', 'police'];

export function loopLength(points: readonly { x: number; z: number }[]) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Position and heading at a distance along a closed loop. */
export function pointOnLoop(points: readonly { x: number; z: number }[], s: number) {
  const total = loopLength(points);
  let left = ((s % total) + total) % total;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= len) {
      const t = len ? left / len : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, rotY: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    left -= len;
  }
  return { x: points[0].x, z: points[0].z, rotY: 0 };
}

/** The cars of every loop, evenly spaced. */
export function createCars(loops: readonly CarLoop[], prefix = 'car'): CarState[] {
  const cars: CarState[] = [];
  loops.forEach((loop, l) => {
    const total = loopLength(loop.points);
    for (let i = 0; i < loop.count; i++) {
      const s = (i * total) / loop.count;
      cars.push({ id: `${prefix}-${l}-${i}`, asset: MODELS[cars.length % MODELS.length], loop: l, s, speed: CRUISE, ...pointOnLoop(loop.points, s) });
    }
  });
  return cars;
}

/** One step for every car. */
export function stepCars(cars: readonly CarState[], loops: readonly CarLoop[], dt: number, slowZones: readonly Rect[]): CarState[] {
  return cars.map((car) => {
    const loop = loops[car.loop];
    const total = loopLength(loop.points);
    // The nearest car ahead on the same loop.
    let ahead = Infinity;
    for (const other of cars) {
      if (other === car || other.loop !== car.loop) continue;
      const d = (((other.s - car.s) % total) + total) % total;
      if (d > 0) ahead = Math.min(ahead, d);
    }
    const slow = slowZones.some((r) => car.x > r.minX && car.x < r.maxX && car.z > r.minZ && car.z < r.maxZ);
    const want = Math.min(slow ? SLOW : CRUISE, Math.max(0, (ahead - GAP) * 1.2));
    const speed = car.speed + Math.max(-ACCEL * 2 * dt, Math.min(ACCEL * dt, want - car.speed));
    const s = car.s + speed * dt;
    return { ...car, s, speed, ...pointOnLoop(loop.points, s) };
  });
}
