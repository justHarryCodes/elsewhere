// Things you can use: tap a piece of furniture (or a door, or the dance floor) and pick an action.
// Each action has a clip, a pose that puts the body in contact with the furniture (hips on the seat,
// back on the mattress, feet on the floor in front of the cooker), where to stand to get there, and
// the effects it sets off. Plain data from an interior's pieces and the furniture catalog's sizes.

import type { CityPiece } from '../city';
import { FURNITURE_CATALOG } from '../furniture-catalog';
import type { HumanAnimation } from '../humans';
import type { CityInterior } from '../interiors';

export type EffectKind = 'shower' | 'bathWater' | 'steam' | 'hot' | 'tap' | 'sleepy' | 'club' | 'screen';

/** An effect placed in the world: what, where (its base or source), which way it faces, how big. */
export interface EffectDef {
  kind: EffectKind;
  x: number;
  y: number;
  z: number;
  heading: number;
  size: number;
}

export interface ActionDef {
  id: string;
  label: string;
  icon: string;
  clip: HumanAnimation;
  /** Where the body goes (its root: the floor under the character, or the surface it lies on) and faces. */
  pose: { x: number; y: number; z: number; heading: number };
  /**
   * Where to stand before settling into the pose, best first: a seat from its front, then its sides,
   * then behind. The first one that can be walked to is used, and you get up back onto it after.
   */
  approaches: { x: number; z: number }[];
  effects: EffectDef[];
}

export interface Interactable {
  id: string;
  /** What the sheet calls it ("Single bed", "Couch"). */
  name: string;
  level: number;
  /** World bounds, for tapping it. */
  box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  actions: ActionDef[];
}

/** How long an action lasts before the character gets up. */
export const ACTION_SECONDS = 10;

/** The library's sitting clips put the seat 0.46 m up and the hips 0.3 m behind the root. */
const SIT_HEIGHT = 0.46;
const HIPS_BEHIND = 0.3;

interface Rule {
  match: RegExp;
  name: string;
  /** Builds the actions for one placed piece (its centre, size and facing). */
  actions: (p: Placed) => ActionDef[];
}

/** A placed piece: centre on the floor, size (w across, d deep, h tall), and its front's direction. */
interface Placed {
  piece: CityPiece;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  /** Unit vectors: toward its front, and across it (its local +X). */
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  /** Other pieces in the room (a desk looks for its chair, a TV for a couch). */
  near: (match: RegExp, within: number, keep?: (q: Placed) => boolean) => Placed | undefined;
}

/** Whether a piece's front faces another (within about 45 degrees): a couch facing a TV. */
const faces = (p: Placed, q: Placed) => {
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  return (dx * p.fx + dz * p.fz) / Math.max(1e-6, Math.hypot(dx, dz)) > 0.7;
};

const at = (p: Placed, forward: number, across = 0) => ({ x: p.x + p.fx * forward + p.rx * across, z: p.z + p.fz * forward + p.rz * across });

/** Sitting on a seat whose top is `seat` metres up, hips `back` metres behind its centre. */
function sit(p: Placed, id: string, label: string, icon: string, clip: HumanAnimation, seat: number, back = 0.05, effects: EffectDef[] = [], across = 0): ActionDef {
  // Facing out of the seat, back against its backrest.
  const hips = at(p, -back, across);
  return {
    id, label, icon, clip, effects,
    pose: { x: hips.x + p.fx * HIPS_BEHIND, y: p.y + seat - SIT_HEIGHT, z: hips.z + p.fz * HIPS_BEHIND, heading: p.yaw },
    approaches: around(p, across),
  };
}

/** Where to stand to get to a piece: in front, then either side, then behind it. */
function around(p: Placed, across = 0) {
  return [
    at(p, p.d / 2 + 0.45, across),
    at(p, p.d / 2 + 0.45, across - 0.5),
    at(p, p.d / 2 + 0.45, across + 0.5),
    at(p, 0, p.w / 2 + 0.45),
    at(p, 0, -p.w / 2 - 0.45),
    at(p, -p.d / 2 - 0.45, across),
  ];
}

/** Standing in front of a piece, facing it, hands on it. */
function standAt(p: Placed, id: string, label: string, icon: string, clip: HumanAnimation, effects: EffectDef[] = [], gap = 0.32): ActionDef {
  const spot = at(p, p.d / 2 + gap);
  return {
    id, label, icon, clip, effects,
    pose: { ...spot, y: p.y, heading: p.yaw + Math.PI },
    approaches: [at(p, p.d / 2 + gap + 0.35), at(p, p.d / 2 + gap + 0.35, -0.5), at(p, p.d / 2 + gap + 0.35, 0.5)],
  };
}

const effect = (kind: EffectKind, p: { x: number; y: number; z: number }, size: number, heading = 0): EffectDef => ({ kind, ...p, size, heading });

const SEATS = /chair|couch|sofa|stool|bench|loungeChair/i;

const RULES: Rule[] = [
  {
    match: /bed/i,
    name: 'Bed',
    actions: (p) => {
      // Lying on the mattress: the body runs along the bed, head at its back (the headboard).
      const mattress = Math.min(0.62, p.h * 0.62);
      // Either side of the bed, then its foot.
      const sides = [at(p, 0.2, p.w / 2 + 0.45), at(p, 0.2, -p.w / 2 - 0.45), at(p, p.d / 2 + 0.45)];
      return [
        {
          id: 'sleep', label: 'Sleep', icon: '😴', clip: 'lieDown',
          pose: { x: p.x, y: p.y + mattress, z: p.z, heading: p.yaw },
          approaches: sides,
          effects: [effect('sleepy', { x: p.x - p.fx * 0.7, y: p.y + mattress + 0.5, z: p.z - p.fz * 0.7 }, 1)],
        },
        ...[1, -1].map((side) => {
          // On the side edge, facing out of the bed.
          const hips = at(p, 0.2, side * (p.w / 2 - 0.22));
          const heading = Math.atan2(p.rx * side, p.rz * side);
          return {
            id: side > 0 ? 'sit' : 'sit-other', label: side > 0 ? 'Sit on the edge' : 'Sit on the other edge', icon: '🛏️', clip: 'sitIdle' as const, effects: [],
            pose: { x: hips.x + Math.sin(heading) * HIPS_BEHIND, y: p.y + mattress - 0.05 - SIT_HEIGHT, z: hips.z + Math.cos(heading) * HIPS_BEHIND, heading },
            approaches: [at(p, 0.2, side * (p.w / 2 + 0.45)), at(p, 0.7, side * (p.w / 2 + 0.45)), at(p, -0.3, side * (p.w / 2 + 0.45))],
          };
        }),
      ];
    },
  },
  {
    match: /bathtub/i,
    name: 'Bathtub',
    actions: (p) => {
      // The tub runs along its width: lie back against one end, legs to the other.
      const along = Math.atan2(p.rx, p.rz);
      const head = { x: p.x - p.rx * 0.35, z: p.z - p.rz * 0.35 };
      const out = [at(p, p.d / 2 + 0.5), at(p, p.d / 2 + 0.5, -0.6), at(p, p.d / 2 + 0.5, 0.6)];
      const top = p.y + p.h;
      return [
        {
          id: 'bath', label: 'Take a bath', icon: '🛁', clip: 'bathSoak',
          pose: { x: head.x, y: p.y + 0.12, z: head.z, heading: along },
          approaches: out,
          effects: [effect('bathWater', { x: p.x, y: top - 0.15, z: p.z }, p.w - 0.25, along), effect('steam', { x: p.x, y: top, z: p.z }, 1.2)],
        },
        {
          id: 'shower', label: 'Shower', icon: '🚿', clip: 'shower',
          pose: { x: p.x + p.rx * 0.45, y: p.y + 0.1, z: p.z + p.rz * 0.45, heading: p.yaw + Math.PI },
          approaches: out,
          effects: [
            effect('shower', { x: p.x + p.rx * 0.45 - p.fx * 0.15, y: p.y + 2.25, z: p.z + p.rz * 0.45 - p.fz * 0.15 }, 1),
            effect('steam', { x: p.x, y: top, z: p.z }, 1.4),
          ],
        },
      ];
    },
  },
  {
    match: /shower/i,
    name: 'Shower',
    actions: (p) => [
      {
        id: 'shower', label: 'Shower', icon: '🚿', clip: 'shower',
        pose: { x: p.x, y: p.y + 0.05, z: p.z, heading: p.yaw + Math.PI },
        approaches: [at(p, p.d / 2 + 0.5), at(p, p.d / 2 + 0.5, -0.5), at(p, p.d / 2 + 0.5, 0.5)],
        effects: [effect('shower', { x: p.x - p.fx * 0.2, y: p.y + 2.2, z: p.z - p.fz * 0.2 }, 1), effect('steam', { x: p.x, y: p.y + 1.6, z: p.z }, 1.4)],
      },
    ],
  },
  {
    match: /toilet$/i,
    name: 'Toilet',
    actions: (p) => [sit(p, 'toilet', 'Use the toilet', '🚽', 'sitIdle', 0.42, 0.12)],
  },
  {
    match: /couch|sofa/i,
    name: 'Couch',
    actions: (p) => {
      const tv = p.near(/television/i, 6, (q) => faces(p, q));
      const watch = tv ? [sit(p, 'tv', 'Watch TV', '📺', 'sitIdle', 0.44, 0.15, [effect('screen', { x: tv.x + tv.fx * 0.1, y: tv.y + tv.h * 0.55, z: tv.z + tv.fz * 0.1 }, tv.w, tv.yaw)])] : [];
      return [sit(p, 'sit', 'Sit down', '🛋️', 'sitIdle', 0.44, 0.15), sit(p, 'chat', 'Relax and chat', '💬', 'sitTalking', 0.44, 0.15), ...watch];
    },
  },
  {
    match: /television/i,
    name: 'TV',
    actions: (p) => {
      const couch = p.near(/couch|sofa|loungeChair|armchair/i, 6, (q) => faces(q, p));
      const glow = effect('screen', { x: p.x + p.fx * 0.1, y: p.y + p.h * 0.55, z: p.z + p.fz * 0.1 }, p.w, p.yaw);
      if (couch) return [{ ...sit(couch, 'tv', 'Watch TV', '📺', 'sitIdle', 0.44, 0.15, [glow]) }];
      return [{ ...standAt(p, 'tv', 'Watch TV', '📺', 'idle', [glow], 2.2) }];
    },
  },
  {
    // A desk ('desk', 'desk-3', 'standing-desk') or what's on one; not the desk chair.
    match: /[/-]desk|monitor|laptop|computer/,
    name: 'Computer',
    actions: (p) => {
      const chair = p.near(/chair/i, 1.6);
      const screen = effect('screen', { x: p.x, y: p.y + 1.05, z: p.z }, 0.6, p.yaw);
      if (!chair) return [standAt(p, 'computer', 'Use the computer', '💻', 'playGame', [screen])];
      // Sit on the chair, turned to face the desk.
      const facing = Math.atan2(p.x - chair.x, p.z - chair.z);
      const hips = { x: chair.x, z: chair.z };
      return [
        {
          id: 'computer', label: 'Use the computer', icon: '💻', clip: 'typing', effects: [screen],
          pose: { x: hips.x + Math.sin(facing) * HIPS_BEHIND, y: chair.y + 0.48 - SIT_HEIGHT, z: hips.z + Math.cos(facing) * HIPS_BEHIND, heading: facing },
          // Behind the chair, then beside it.
          approaches: [
            { x: chair.x - Math.sin(facing) * 0.75, z: chair.z - Math.cos(facing) * 0.75 },
            { x: chair.x + Math.cos(facing) * 0.75, z: chair.z - Math.sin(facing) * 0.75 },
            { x: chair.x - Math.cos(facing) * 0.75, z: chair.z + Math.sin(facing) * 0.75 },
          ],
        },
      ];
    },
  },
  {
    match: /stove|oven/i,
    name: 'Cooker',
    actions: (p) => [standAt(p, 'cook', 'Cook', '🍳', 'counterWork', [effect('hot', { x: p.x, y: p.y + p.h + 0.02, z: p.z }, 0.6), effect('steam', { x: p.x, y: p.y + p.h + 0.1, z: p.z }, 0.7)])],
  },
  {
    match: /sink/i,
    name: 'Sink',
    actions: (p) => [standAt(p, 'wash', /bathroom/.test(p.piece.piece) ? 'Wash hands' : 'Wash up', '🚰', 'counterWork', [effect('tap', { x: p.x - p.fx * 0.1, y: p.y + p.h + 0.25, z: p.z - p.fz * 0.1 }, 0.3)])],
  },
  {
    match: /coffee-?machine|kitchenCoffeeMachine|microwave/i,
    name: 'Coffee machine',
    actions: (p) => [standAt(p, 'brew', 'Make a drink', '☕', 'counterWork', [effect('steam', { x: p.x, y: p.y + p.h, z: p.z }, 0.4)])],
  },
  {
    match: /fridge/i,
    name: 'Fridge',
    actions: (p) => [standAt(p, 'snack', 'Grab a snack', '🥪', 'interact')],
  },
  {
    match: /arcade|pinball|claw|dance-machine|basketball|air-hockey/i,
    name: 'Game',
    actions: (p) => [standAt(p, 'play', 'Play', '🕹️', 'playGame', [effect('screen', { x: p.x, y: p.y + 1.3, z: p.z }, 0.6, p.yaw)])],
  },
  {
    match: /pool-table|table-tennis/i,
    name: 'Games table',
    actions: (p) => [standAt(p, 'play', 'Play a round', '🎱', 'playGame')],
  },
  {
    match: /drum-set|guitar/i,
    name: 'Instrument',
    actions: (p) => [standAt(p, 'jam', 'Jam', '🎸', 'playGame', [], 0.1)],
  },
  {
    match: SEATS,
    name: 'Seat',
    actions: (p) => {
      // Bar stools are high; lounge chairs low and deep.
      const seat = /stool|barstool/i.test(p.piece.piece) ? 0.74 : /lounge/i.test(p.piece.piece) ? 0.4 : 0.46;
      return [sit(p, 'sit', 'Sit down', '🪑', 'sitIdle', seat, 0.05), sit(p, 'chat', 'Sit and chat', '💬', 'sitTalking', seat, 0.05)];
    },
  },
];

/** Every usable piece in an inside, plus its dance floor (if it has one). */
export function interactablesOf(interior: CityInterior): Interactable[] {
  const placed: Placed[] = [];
  for (const piece of interior.pieces) {
    const size = (FURNITURE_CATALOG as Record<string, readonly number[]>)[piece.piece];
    if (!size) continue;
    const [w, h, d] = size;
    placed.push({
      piece, x: piece.x, y: piece.y, z: piece.z, w, h, d, yaw: piece.yaw,
      fx: Math.sin(piece.yaw), fz: Math.cos(piece.yaw), rx: Math.cos(piece.yaw), rz: -Math.sin(piece.yaw),
      near: () => undefined,
    });
  }
  for (const p of placed) {
    p.near = (match, within, keep = () => true) => {
      let best: Placed | undefined;
      let distance = within;
      for (const q of placed) {
        if (q === p || (q.piece.level ?? 0) !== (p.piece.level ?? 0) || !match.test(q.piece.piece) || !keep(q)) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < distance) {
          distance = d;
          best = q;
        }
      }
      return best;
    };
  }
  const out: Interactable[] = [];
  placed.forEach((p, i) => {
    const rule = RULES.find((r) => r.match.test(p.piece.piece));
    if (!rule) return;
    const across = Math.abs(Math.sin(p.yaw)) > 0.5;
    const hx = (across ? p.d : p.w) / 2;
    const hz = (across ? p.w : p.d) / 2;
    out.push({
      id: `piece-${i}`,
      name: rule.name,
      level: p.piece.level ?? 0,
      box: { min: { x: p.x - hx, y: p.y, z: p.z - hz }, max: { x: p.x + hx, y: p.y + p.h, z: p.z + hz } },
      actions: rule.actions(p),
    });
  });
  const floor = danceFloor(interior);
  if (floor) out.push(floor);
  return out;
}

/** The club's dance floor (the glowing tiles of an event centre): dance where you stand, under the lights. */
function danceFloor(interior: CityInterior): Interactable | undefined {
  if (interior.kind !== 'eventcentre') return undefined;
  const tiles = interior.shapes.filter((s) => s.glow && (s.level ?? 0) === 0 && s.h < 0.1);
  if (tiles.length < 4) return undefined;
  const x0 = Math.min(...tiles.map((t) => t.x - t.w / 2));
  const x1 = Math.max(...tiles.map((t) => t.x + t.w / 2));
  const z0 = Math.min(...tiles.map((t) => t.z - t.d / 2));
  const z1 = Math.max(...tiles.map((t) => t.z + t.d / 2));
  const y = Math.max(...tiles.map((t) => t.y + t.h));
  const centre = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  return {
    id: 'dance-floor',
    name: 'Dance floor',
    level: 0,
    box: { min: { x: x0, y: y - 0.05, z: z0 }, max: { x: x1, y: y + 0.05, z: z1 } },
    actions: [
      {
        id: 'dance', label: 'Dance', icon: '🪩', clip: 'dance',
        pose: { ...centre, y, heading: 0 },
        approaches: [centre],
        effects: [effect('club', { ...centre, y: y + 4.5 }, Math.max(x1 - x0, z1 - z0))],
      },
    ],
  };
}

/** The nearest usable thing a ray (from the camera through a tap) hits, on the player's floor. */
export function pickInteractable(items: readonly Interactable[], level: number, origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }) {
  let best: Interactable | undefined;
  let nearest = Infinity;
  for (const item of items) {
    if (item.level !== level) continue;
    const t = rayBox(origin, dir, item.box);
    if (t !== null && t < nearest) {
      nearest = t;
      best = item;
    }
  }
  return best;
}

function rayBox(o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, box: Interactable['box']): number | null {
  let t0 = 0;
  let t1 = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < box.min[k] || o[k] > box.max[k]) return null;
      continue;
    }
    let near = (box.min[k] - o[k]) / d[k];
    let far = (box.max[k] - o[k]) / d[k];
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return null;
  }
  return t0;
}
