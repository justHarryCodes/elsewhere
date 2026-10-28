// People on the pavement: each walks a loop of waypoints, sometimes stops for a moment (to look in a
// window, or in the club queue), and stops while the player stands right in front of them. No
// pathfinding: routes are laid out clear of the street furniture.

import { type HumanAppearance, type HumanBody, randomAppearance } from '../humans';

export interface Waypoint {
  x: number;
  z: number;
  /** Always stop here this many seconds (a queue, a shop window). */
  pause?: number;
}

export interface NpcState {
  id: string;
  body: HumanBody;
  appearance: HumanAppearance;
  route: number;
  /** Index of the waypoint being walked to. */
  next: number;
  x: number;
  z: number;
  rotY: number;
  /** Seconds left standing still. */
  wait: number;
  /** Ground speed this step, m/s (picks idle or walk). */
  speed: number;
  /** Its own random sequence (pauses, pace). */
  seed: number;
  pace: number;
}

const WALK = 1.25;
/** Stop when the player is this close in front. */
const PERSONAL_SPACE = 1.4;
const TURN_RATE = 8;
const BODIES: HumanBody[] = ['male', 'female', 'maleSlim', 'femaleSlim', 'male', 'female'];

function random(seed: number): [number, number] {
  const next = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  return [next / 4294967296, next];
}

/** `count` people spread evenly (with a little jitter) along the routes, each with its own look. */
export function createNpcs(count: number, routes: readonly Waypoint[][], seed: number, prefix = 'npc'): NpcState[] {
  const npcs: NpcState[] = [];
  if (!routes.length) return npcs;
  let s = seed >>> 0 || 1;
  for (let i = 0; i < count; i++) {
    const route = i % routes.length;
    const points = routes[route];
    const onRoute = Math.ceil((count - route) / routes.length);
    let r: number;
    [r, s] = random(s);
    // Where along the loop this one starts: its share of the length, nudged.
    const lengths = points.map((p, k) => Math.hypot(points[(k + 1) % points.length].x - p.x, points[(k + 1) % points.length].z - p.z));
    const total = lengths.reduce((a, b) => a + b, 0);
    let along = ((Math.floor(i / routes.length) + 0.5 + (r - 0.5) * 0.4) / onRoute) * total;
    let leg = 0;
    while (leg < points.length - 1 && along > lengths[leg]) along -= lengths[leg++];
    r = lengths[leg] ? along / lengths[leg] : 0;
    const a = points[leg];
    const b = points[(leg + 1) % points.length];
    const body = BODIES[i % BODIES.length];
    const id = `${prefix}-${i}`;
    let pace: number;
    [pace, s] = random(s);
    npcs.push({
      id,
      body,
      appearance: randomAppearance(body, s ^ (i * 7919)),
      route,
      next: (leg + 1) % points.length,
      x: a.x + (b.x - a.x) * r,
      z: a.z + (b.z - a.z) * r,
      rotY: Math.atan2(b.x - a.x, b.z - a.z),
      wait: 0,
      speed: 0,
      seed: s,
      pace: 0.85 + pace * 0.3,
    });
  }
  return npcs;
}

/** One step for one person. */
export function stepNpc(npc: NpcState, routes: readonly Waypoint[][], dt: number, player: { x: number; z: number } | null): NpcState {
  const n = { ...npc, speed: 0 };
  if (n.wait > 0) {
    n.wait -= dt;
    return n;
  }
  const points = routes[n.route];
  const goal = points[n.next];
  const dx = goal.x - n.x;
  const dz = goal.z - n.z;
  const d = Math.hypot(dx, dz);
  // Someone's in the way: stand still, facing them, until they move.
  if (player) {
    const px = player.x - n.x;
    const pz = player.z - n.z;
    const pd = Math.hypot(px, pz);
    if (pd < PERSONAL_SPACE && (px * dx + pz * dz) / Math.max(1e-6, pd * d) > 0.2) {
      n.rotY = turnToward(n.rotY, Math.atan2(px, pz), dt);
      n.wait = 0.6;
      return n;
    }
  }
  const step = WALK * n.pace * dt;
  if (d <= step) {
    n.x = goal.x;
    n.z = goal.z;
    n.next = (n.next + 1) % points.length;
    // A planned stop, or now and then a short one of its own.
    let r: number;
    [r, n.seed] = random(n.seed);
    n.wait = goal.pause ?? (r < 0.3 ? 1 + r * 6 : 0);
    n.speed = d / Math.max(dt, 1e-6);
    return n;
  }
  n.x += (dx / d) * step;
  n.z += (dz / d) * step;
  n.rotY = turnToward(n.rotY, Math.atan2(dx, dz), dt);
  n.speed = WALK * n.pace;
  return n;
}

function turnToward(from: number, to: number, dt: number) {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + turn * Math.min(1, TURN_RATE * dt);
}
