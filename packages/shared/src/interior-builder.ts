// The engine the rooms are built with. A building's inside is a floor plan: rectangular rooms on one or
// more levels that tile the plan, joined by doorways ("links"). From that the builder raises the walls
// itself: an edge two rooms share becomes a partition, papered on each side in its own room's wallpaper
// (or no wall at all between rooms of the same open-plan "zone"), and the plan's outer edges become
// exterior walls with framed windows. Floors are laid per room; upper levels stand on slabs with a hole
// over each staircase, and the stairs are real steps you walk up.
//
// Everything is in plan space: x across the building's front, z from the back (-) to the front door
// (+), y up from the level's floor. A plan can be mirrored (x -> -x) for variety. Every wall's shapes
// carry a wall id, so the renderer can cut walls away between the camera and the player.

import type { CityBox, CityPiece, CityShape } from './city';
import { type CatalogPiece, FURNITURE_CATALOG } from './furniture-catalog';

/** One storey, floor to floor. */
export const INTERIOR_HEIGHT = 3.2;
const SLAB = 0.3;
/** Walls stand up to the slab of the level above. */
export const WALL_HEIGHT = INTERIOR_HEIGHT - SLAB;
const PARTITION = 0.16;
const EXTERIOR = 0.26;
const DOOR = 1.1;
const WINDOW = 1.4;
const SILL = 0.9;
const HEAD = 2.15;
/** Steps: 18 risers per storey. */
const STEPS = 18;
const RUN = 0.28;

/**
 * A wallpaper or a floor: one of Kenney's pattern tiles (file name, as packed by pack_kenney.mjs) drawn
 * in `ink` over `color`, one repeat every `tile` metres.
 */
export interface Finish {
  pattern: string;
  color: string;
  ink: string;
  tile: number;
}
export type Paint = string | Finish;

// Pieces from the town pack (scripts/city/pack_town.py) the older rooms still use: width, height, depth.
const EXTRA = {
  'furniture/file-cabinet': [0.64, 1.3, 0.55],
  'furniture/water-cooler': [0.3, 1.3, 0.35],
  'furniture/vending-machine': [1.01, 1.95, 1.06],
  'furniture/whiteboard': [2.81, 1.9, 0.08],
  'furniture/printer': [0.6, 0.45, 0.86],
  'furniture/office-chair': [0.7, 1.1, 0.79],
  'furniture/wall-art': [0.55, 0.9, 0.03],
  'furniture/cash-register': [0.37, 0.35, 0.33],
  'furniture/can-fridge': [1.05, 1.95, 0.59],
  'furniture/coffee-machine': [0.36, 0.5, 0.48],
} as const;
export type Furniture = CatalogPiece | keyof typeof EXTRA;
const SIZES: Record<string, readonly number[]> = { ...FURNITURE_CATALOG, ...EXTRA };
export const furnitureSize = (name: Furniture) => SIZES[name] as readonly [number, number, number];
/** Things you walk over, that hang on a wall or sit on something else: no collider. */
const NOT_SOLID = /rug|books|lamp(Round|Square)Table|plantSmall|computer|laptop|Microwave|CoffeeMachine|Blender|toaster|pillow|CabinetUpper|Mirror|lampWall|ceilingFan|Ceiling|paneling|wall-art|cash-register|coffee-machine|radio|printer|^k\/food\/|shopping-basket|table-lamp|houseplant-2|cactus|televisionModern|televisionAntenna/;

export interface InteriorPlace {
  /** Middle of the plan and the ground floor's height. */
  x: number;
  y: number;
  z: number;
  /** The building's front faces this way (radians): the plan's +z. */
  yaw: number;
}

/** A room of the plan. */
export interface PlanRoom {
  kind: string;
  level: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floor: Paint;
  paper: Paint;
  /** Rooms of the same zone on a level are one open space: no wall between them. */
  zone?: string;
  /** Exterior walls get windows (default) or stay blank. */
  windows?: boolean;
  /** Glass partitions (meeting rooms) instead of solid ones, toward rooms not of this zone. */
  glass?: boolean;
}

/** A room as the game sees it: world rectangle, level, what it is. */
export interface InteriorRoom {
  kind: string;
  level: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** A doorway between two rooms (indexes into rooms; -1 for the way out). */
export interface InteriorLink {
  level: number;
  x: number;
  z: number;
  a: number;
  b: number;
  /** The doorway's width. */
  width: number;
}
/** A straight flight of stairs (world metres): from its foot on `level` up to its head on the next. */
export interface InteriorStairs {
  level: number;
  bottom: { x: number; z: number };
  top: { x: number; z: number };
  width: number;
}
/** Where someone stands: staff at their post, or a visitor's favourite spot. */
export interface InteriorSpot {
  level: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  role: 'staff' | 'visitor';
}
/** A point to stand at and the way to face, world space. */
export interface Stand {
  x: number;
  y: number;
  z: number;
  heading: number;
}

type Side = 'back' | 'front' | 'left' | 'right';
interface Opening {
  at: number;
  width: number;
  kind: 'door' | 'window';
}

export class InteriorBuilder {
  readonly pieces: CityPiece[] = [];
  readonly shapes: CityShape[] = [];
  readonly colliders: CityBox[] = [];
  readonly rooms: PlanRoom[] = [];
  readonly spots: InteriorSpot[] = [];
  /** Every flight of stairs, for anything that walks up them without physics. */
  readonly flights: InteriorStairs[] = [];
  private readonly linkPoints: { level: number; x: number; z: number; width: number }[] = [];
  private readonly holes: { level: number; x0: number; z0: number; x1: number; z1: number; open: 'x0' | 'x1' | 'z0' | 'z1' }[] = [];
  private nextWall = 1;
  private readonly cos: number;
  private readonly sin: number;
  roof?: Stand;
  /** One finish for every wall in the building (a home's), instead of each room's own. */
  wallFinish?: Paint;

  constructor(
    readonly place: InteriorPlace,
    /** Plan size: across the front, and back to front. */
    readonly w: number,
    readonly d: number,
    readonly levels: number,
    readonly random: () => number,
    readonly mirrored = false,
    /** The outside of the exterior walls. */
    readonly facade = '#efe7da',
  ) {
    this.cos = Math.cos(place.yaw);
    this.sin = Math.sin(place.yaw);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)];
  }
  between(lo: number, hi: number) {
    return lo + (hi - lo) * this.random();
  }

  /** Plan (x, z) to world, mirrored if the plan is. */
  world(x: number, z: number) {
    const mx = this.mirrored ? -x : x;
    return { x: this.place.x + mx * this.cos + z * this.sin, z: this.place.z - mx * this.sin + z * this.cos };
  }
  /** A plan heading (0 = toward the front door, +PI/2 = toward +x) in the world. */
  heading(turn: number) {
    return this.place.yaw + (this.mirrored ? -turn : turn);
  }
  floorY(level: number) {
    return this.place.y + level * INTERIOR_HEIGHT;
  }

  // ------------------------------------------------------------------ primitives

  /** A box at plan (x, z), `y` up from the level's floor, w across x, d along z. */
  box(level: number, x: number, z: number, y: number, bw: number, bh: number, bd: number, paint: Paint, opts: { solid?: boolean; drawn?: boolean; wall?: number; glow?: boolean; glass?: boolean; turn?: number } = {}) {
    const at = this.world(x, z);
    const yaw = this.heading(opts.turn ?? 0);
    const finish = typeof paint === 'string' ? { color: paint } : paint;
    const base = this.floorY(level) + y;
    if (opts.drawn !== false) {
      this.shapes.push({ kind: 'box', x: at.x, y: base, z: at.z, w: bw, h: bh, d: bd, yaw, ...finish, level, wall: opts.wall, glow: opts.glow, glass: opts.glass });
    }
    if (opts.solid ?? true) {
      const across = Math.abs(Math.sin(yaw)) > 0.5;
      this.colliders.push({ x: at.x, y: base + bh / 2, z: at.z, hx: (across ? bd : bw) / 2, hy: bh / 2, hz: (across ? bw : bd) / 2 });
    }
  }
  /** An upright cylinder (posts, stands, drums, pins). */
  cylinder(level: number, x: number, z: number, y: number, diameter: number, h: number, color: string, opts: { solid?: boolean; glow?: boolean } = {}) {
    const at = this.world(x, z);
    const base = this.floorY(level) + y;
    this.shapes.push({ kind: 'cylinder', x: at.x, y: base, z: at.z, w: diameter, h, d: diameter, yaw: 0, color, level, glow: opts.glow });
    if (opts.solid) this.colliders.push({ x: at.x, y: base + h / 2, z: at.z, hx: diameter / 2, hy: h / 2, hz: diameter / 2 });
  }

  /** A piece of furniture at plan (x, z), turned `turn` from facing the front (+z), `y` up off the floor. */
  put(name: Furniture, level: number, x: number, z: number, turn = 0, y = 0) {
    const at = this.world(x, z);
    const yaw = this.heading(turn);
    this.pieces.push({ piece: name, x: at.x, y: this.floorY(level) + y, z: at.z, yaw, level });
    if (NOT_SOLID.test(name) || y > 0.3 || !SIZES[name]) return;
    const [fw, fh, fd] = furnitureSize(name);
    const across = Math.abs(Math.sin(yaw)) > 0.5;
    this.colliders.push({ x: at.x, y: this.floorY(level) + y + fh / 2, z: at.z, hx: (across ? fd : fw) / 2, hy: fh / 2, hz: (across ? fw : fd) / 2 });
  }

  /** Whether plan (x, z) on a level is within `reach` of a doorway (kept clear of furniture). */
  nearDoor(level: number, x: number, z: number, reach: number) {
    return this.linkPoints.some((l) => l.level === level && Math.abs(l.x - x) < reach + l.width / 2 && Math.abs(l.z - z) < reach + l.width / 2);
  }

  /**
   * Against one of a room's walls, facing into the room, `along` that wall (plan x or z). Left out if
   * it would stand in a doorway; says whether it went in.
   */
  against(name: Furniture, room: PlanRoom, side: Side, along: number, y = 0, gap = 0.04): boolean {
    const [fw, , fd] = furnitureSize(name);
    const inset = PARTITION / 2 + gap + fd / 2;
    const { level } = room;
    const [px, pz] = side === 'back' ? [along, room.z0 + inset] : side === 'front' ? [along, room.z1 - inset] : side === 'left' ? [room.x0 + inset, along] : [room.x1 - inset, along];
    if (y < 0.3 && this.nearDoor(level, px, pz, Math.max(fw, fd) / 2 + 0.35)) return false;
    if (side === 'back') this.put(name, level, along, room.z0 + inset, 0, y);
    else if (side === 'front') this.put(name, level, along, room.z1 - inset, Math.PI, y);
    else if (side === 'left') this.put(name, level, room.x0 + inset, along, Math.PI / 2, y);
    else this.put(name, level, room.x1 - inset, along, -Math.PI / 2, y);
    return true;
  }

  /** A run of the same piece side by side along a wall, from `from` to `to`. */
  row(name: Furniture, room: PlanRoom, side: Side, from: number, to: number, y = 0) {
    const [fw] = furnitureSize(name);
    for (let t = from + fw / 2; t <= to - fw / 2 + 1e-6; t += fw) this.against(name, room, side, t, y);
  }

  // ------------------------------------------------------------------ the plan

  room(kind: string, level: number, x0: number, z0: number, x1: number, z1: number, floor: Paint, paper: Paint, opts: { zone?: string; windows?: boolean; glass?: boolean } = {}): PlanRoom {
    const room: PlanRoom = { kind, level, x0, z0, x1, z1, floor, paper, ...opts };
    this.rooms.push(room);
    return room;
  }

  /** A doorway at plan (x, z), on the line between two rooms (or in an exterior wall: the way out). */
  link(level: number, x: number, z: number, width = DOOR) {
    this.linkPoints.push({ level, x, z, width });
  }

  spot(level: number, x: number, z: number, turn: number, role: 'staff' | 'visitor' = 'staff') {
    const at = this.world(x, z);
    this.spots.push({ level, x: at.x, y: this.floorY(level), z: at.z, heading: this.heading(turn), role });
  }

  /**
   * A straight flight from `level` up to the next, starting at plan (x, z) and climbing toward `dir`
   * (+z is 'front'), `width` wide, with a handrail; it cuts its hole in the floor above.
   */
  stairs(level: number, x: number, z: number, dir: 'front' | 'back' | 'left' | 'right', width = 1.15, paint: Paint = '#b98a5c') {
    const rise = INTERIOR_HEIGHT / STEPS;
    const [dx, dz] = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[dir];
    const length = STEPS * RUN;
    for (let k = 0; k < STEPS; k++) {
      const t = (k + 0.5) * RUN;
      const top = (k + 1) * rise;
      const cx = x + dx * t;
      const cz = z + dz * t;
      this.box(level, cx, cz, 0, dx !== 0 ? RUN : width, top, dz !== 0 ? RUN : width, paint);
      // A nosing on every tread.
      this.box(level, cx, cz, top - 0.03, dx !== 0 ? RUN : width + 0.02, 0.04, dz !== 0 ? RUN : width + 0.02, '#f4efe6', { solid: false });
    }
    // The handrail up the open side.
    const side = dx !== 0 ? [0, 1] : [1, 0];
    const rail = width / 2 + 0.05;
    for (let k = 0; k <= STEPS; k += 3) {
      const t = Math.min(k, STEPS - 1) * RUN + RUN / 2;
      this.box(level, x + dx * t + side[0] * rail, z + dz * t + side[1] * rail, (k + 1) * rise, 0.05, 0.9, 0.05, '#3b3f4a', { solid: false });
    }
    this.box(level, x + (dx * length) / 2 + side[0] * rail, z + (dz * length) / 2 + side[1] * rail, INTERIOR_HEIGHT / 2 + 0.9, dx !== 0 ? length : 0.06, 0.06, dz !== 0 ? length : 0.06, '#3b3f4a', { solid: false });
    const ex = x + dx * length;
    const ez = z + dz * length;
    const hole = {
      level: level + 1,
      x0: Math.min(x, ex) - (dx !== 0 ? 0 : width / 2 + 0.05),
      x1: Math.max(x, ex) + (dx !== 0 ? 0 : width / 2 + 0.05),
      z0: Math.min(z, ez) - (dz !== 0 ? 0 : width / 2 + 0.05),
      z1: Math.max(z, ez) + (dz !== 0 ? 0 : width / 2 + 0.05),
      open: ({ front: 'z1', back: 'z0', left: 'x0', right: 'x1' } as const)[dir],
    };
    this.holes.push(hole);
    this.flights.push({ level, bottom: this.world(x, z), top: this.world(ex, ez), width });
  }

  /** The door up to the roof terrace: a few steps up to a door in a wall, from where E takes you up. */
  roofDoor(room: PlanRoom, side: 'back' | 'left' | 'right', along: number) {
    const { level } = room;
    const [ox, oz, turn] = { back: [0, 1, 0], left: [1, 0, Math.PI / 2], right: [-1, 0, -Math.PI / 2] }[side];
    const line = side === 'back' ? room.z0 : side === 'left' ? room.x0 : room.x1;
    const at = (out: number): [number, number] => (side === 'back' ? [along, line + oz * out] : [line + ox * out, along]);
    const wall = this.nextWall++;
    // Door leaf and frame on the wall, a sign over it.
    const [fx, fz] = at(PARTITION / 2 + 0.03);
    this.box(level, fx, fz, 0.45, 1.2, 2.3, 0.06, '#f6f1e8', { solid: false, wall, turn });
    const [lx, lz] = at(PARTITION / 2 + 0.06);
    this.box(level, lx, lz, 0.5, 1.0, 2.2, 0.04, '#e8743b', { solid: false, wall, turn });
    const [sx, sz] = at(PARTITION / 2 + 0.08);
    this.box(level, sx, sz, 2.5, 0.9, 0.25, 0.03, '#2ec4b6', { solid: false, glow: true, wall, turn });
    // Three steps up to it.
    for (let k = 0; k < 3; k++) {
      const [px, pz] = at(PARTITION / 2 + 0.2 + (2 - k) * 0.3 + 0.15);
      this.box(level, px, pz, 0, side === 'back' ? 1.3 : 0.3, 0.15 * (k + 1), side === 'back' ? 0.3 : 1.3, '#9aa1ad');
    }
    const [ix, iz] = at(PARTITION / 2 + 1.4);
    const w = this.world(ix, iz);
    this.roof = { x: w.x, y: this.floorY(level), z: w.z, heading: this.heading(turn + Math.PI) };
  }

  // ------------------------------------------------------------------ raising it

  /** Floors, slabs, walls and the backdrop. Call once every room, link and staircase is in. */
  finish() {
    for (let level = 0; level < this.levels; level++) {
      this.slab(level);
      // Each room's flooring, kept off the stairwell so the stairs show from above.
      for (const room of this.rooms) {
        if (room.level !== level) continue;
        for (const [x0, z0, x1, z1] of this.cut(level, room.x0, room.z0, room.x1, room.z1)) {
          this.box(level, (x0 + x1) / 2, (z0 + z1) / 2, 0.002, x1 - x0, 0.012, z1 - z0, room.floor, { solid: false });
        }
      }
      this.walls(level);
      for (const hole of this.holes.filter((h) => h.level === level)) this.railing(hole);
    }
    // A dark void all round, below the ground floor.
    this.box(0, 0, 0, -0.9, this.w + 120, 0.3, this.d + 120, '#1b1e26', { solid: false });
  }

  /** The level's floor slab, with holes for the stairs coming up through it. */
  private slab(level: number) {
    const { w, d } = this;
    for (const [x0, z0, x1, z1] of this.cut(level, -w / 2, -d / 2, w / 2, d / 2)) {
      this.box(level, (x0 + x1) / 2, (z0 + z1) / 2, -SLAB, x1 - x0, SLAB, z1 - z0, '#b8b0a2');
    }
  }

  /** A plan rectangle with this level's stair holes cut out of it: the pieces left round them. */
  private cut(level: number, x0: number, z0: number, x1: number, z1: number): [number, number, number, number][] {
    let rects: [number, number, number, number][] = [[x0, z0, x1, z1]];
    for (const h of this.holes.filter((hole) => hole.level === level)) {
      rects = rects.flatMap(([a0, b0, a1, b1]): [number, number, number, number][] => {
        if (h.x1 <= a0 || h.x0 >= a1 || h.z1 <= b0 || h.z0 >= b1) return [[a0, b0, a1, b1]];
        const hx0 = Math.max(a0, h.x0);
        const hx1 = Math.min(a1, h.x1);
        const hz0 = Math.max(b0, h.z0);
        const hz1 = Math.min(b1, h.z1);
        // Left and right of it full depth, then in front of and behind it.
        const pieces: [number, number, number, number][] = [[a0, b0, hx0, b1], [hx1, b0, a1, b1], [hx0, b0, hx1, hz0], [hx0, hz1, hx1, b1]];
        return pieces.filter(([p0, q0, p1, q1]) => p1 - p0 > 0.01 && q1 - q0 > 0.01);
      });
    }
    return rects;
  }

  /** A glass balustrade round a stairwell, open on the side the stairs arrive at. */
  private railing(h: { level: number; x0: number; z0: number; x1: number; z1: number; open: string }) {
    const sides: [string, number, number, number, number][] = [
      ['x0', h.x0, h.z0, h.x0, h.z1],
      ['x1', h.x1, h.z0, h.x1, h.z1],
      ['z0', h.x0, h.z0, h.x1, h.z0],
      ['z1', h.x0, h.z1, h.x1, h.z1],
    ];
    for (const [name, ax, az, bx, bz] of sides) {
      if (name === h.open) continue;
      const alongX = az === bz;
      const length = alongX ? bx - ax : bz - az;
      // Skip the sides against a wall (the plan's edge).
      if ((alongX && Math.abs(Math.abs(az) - this.d / 2) < 0.3) || (!alongX && Math.abs(Math.abs(ax) - this.w / 2) < 0.3)) continue;
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      this.box(h.level, cx, cz, 0, alongX ? length : 0.05, 1.0, alongX ? 0.05 : length, '#bfe3f2', { glass: true });
      this.box(h.level, cx, cz, 1.0, alongX ? length : 0.07, 0.05, alongX ? 0.07 : length, '#3b3f4a', { solid: false });
    }
  }

  /** Every wall of a level, worked out from the rooms' edges. */
  private walls(level: number) {
    const rooms = this.rooms.filter((r) => r.level === level);
    const eps = 0.05;
    type Edge = { room: PlanRoom; axis: 'x' | 'z'; at: number; a: number; b: number; inward: 1 | -1 };
    // inward: which way from the line the room lies (+1: toward +z for an x-line, +x for a z-line).
    const edges = (r: PlanRoom): Edge[] => [
      { room: r, axis: 'x', at: r.z0, a: r.x0, b: r.x1, inward: 1 },
      { room: r, axis: 'x', at: r.z1, a: r.x0, b: r.x1, inward: -1 },
      { room: r, axis: 'z', at: r.x0, a: r.z0, b: r.z1, inward: 1 },
      { room: r, axis: 'z', at: r.x1, a: r.z0, b: r.z1, inward: -1 },
    ];
    const all = rooms.flatMap(edges);
    for (const e of all) {
      // Shared stretches with rooms on the other side of the line.
      const shared: { a: number; b: number; other: PlanRoom }[] = [];
      for (const o of all) {
        if (o.room === e.room || o.axis !== e.axis || Math.abs(o.at - e.at) > eps || o.inward === e.inward) continue;
        const a = Math.max(e.a, o.a);
        const b = Math.min(e.b, o.b);
        if (b - a > eps) shared.push({ a, b, other: o.room });
      }
      // Each partition once: from the room on the line's negative side.
      if (e.inward === -1) {
        for (const s of shared) {
          const open = e.room.zone !== undefined && e.room.zone === s.other.zone;
          if (open) continue;
          const glass = !!(e.room.glass || s.other.glass) && e.room.zone !== s.other.zone;
          this.wallLine(level, e.axis, e.at, s.a, s.b, this.wallFinish ?? e.room.paper, this.wallFinish ?? s.other.paper, PARTITION, false, glass, false);
        }
      }
      // What's left of the edge is outside wall.
      shared.sort((p, q) => p.a - q.a);
      let from = e.a;
      for (const s of [...shared, { a: e.b, b: e.b }]) {
        if (s.a - from > eps) {
          const inner = this.wallFinish ?? e.room.paper;
          const [neg, pos] = e.inward === 1 ? [this.facade, inner] : [inner, this.facade];
          this.wallLine(level, e.axis, e.at, from, s.a, neg, pos, EXTERIOR, e.room.windows !== false, false, true);
        }
        from = Math.max(from, s.b);
      }
    }
  }

  /**
   * One wall along a line (an x-line is z = at, running a..b along x), painted `neg` on its negative
   * side and `pos` on its positive side, with doorways where links are and, outside, windows. A door in
   * an outside wall is shut (the inside is out in the void): E at it takes you out.
   */
  private wallLine(level: number, axis: 'x' | 'z', at: number, a: number, b: number, neg: Paint, pos: Paint, thick: number, windows: boolean, glass: boolean, outside: boolean) {
    const wall = this.nextWall++;
    const openings: Opening[] = [];
    for (const l of this.linkPoints) {
      if (l.level !== level) continue;
      const [along, across] = axis === 'x' ? [l.x, l.z] : [l.z, l.x];
      if (Math.abs(across - at) < 0.3 && along > a + 0.2 && along < b - 0.2) openings.push({ at: along, width: l.width, kind: 'door' });
    }
    if (windows) {
      const count = Math.floor((b - a) / 3.1);
      for (let k = 0; k < count; k++) {
        const c = a + ((k + 0.5) * (b - a)) / count;
        if (openings.some((o) => Math.abs(o.at - c) < (o.width + WINDOW) / 2 + 0.3)) continue;
        openings.push({ at: c, width: WINDOW, kind: 'window' });
      }
    }
    openings.sort((p, q) => p.at - q.at);
    // Plan coordinates of a stretch of this wall, on one side (-1, +1) or the middle (0).
    const piece = (p: number, q: number, y: number, h: number, side: -1 | 0 | 1, paint: Paint, opts: { glow?: boolean; glass?: boolean; solid?: boolean; depth?: number } = {}) => {
      const length = q - p;
      if (length < 0.01) return;
      const mid = (p + q) / 2;
      const depth = opts.depth ?? (side === 0 ? thick : thick / 2);
      const off = (side * thick) / 4;
      const [x, z] = axis === 'x' ? [mid, at + off] : [at + off, mid];
      const [bw, bd] = axis === 'x' ? [length, depth] : [depth, length];
      this.box(level, x, z, y, bw, h, bd, paint, { solid: opts.solid ?? false, wall, glow: opts.glow, glass: opts.glass });
    };
    const collider = (p: number, q: number, y: number, h: number) => {
      const mid = (p + q) / 2;
      const [x, z] = axis === 'x' ? [mid, at] : [at, mid];
      const [bw, bd] = axis === 'x' ? [q - p, Math.max(thick, 0.3)] : [Math.max(thick, 0.3), q - p];
      this.box(level, x, z, y, bw, h, bd, '#000', { drawn: false });
    };
    const frame = '#f7f4ee';
    let from = a;
    for (const o of [...openings, undefined]) {
      const to = o ? o.at - o.width / 2 : b;
      if (to - from > 0.01) {
        if (glass) {
          piece(from, to, 0, 0.12, 0, '#e9eef2');
          piece(from, to, 0.12, WALL_HEIGHT - 0.24, 0, '#a9d6ee', { glass: true, depth: 0.05 });
          piece(from, to, WALL_HEIGHT - 0.12, 0.12, 0, '#e9eef2');
        } else {
          piece(from, to, 0, WALL_HEIGHT, -1, neg);
          piece(from, to, 0, WALL_HEIGHT, 1, pos);
          // Skirting boards both sides.
          piece(from, to, 0, 0.1, -1, '#ffffff', { depth: thick / 2 + 0.02 });
          piece(from, to, 0, 0.1, 1, '#ffffff', { depth: thick / 2 + 0.02 });
        }
        collider(from, to, 0, WALL_HEIGHT);
      }
      if (!o) break;
      const p = o.at - o.width / 2;
      const q = o.at + o.width / 2;
      if (o.kind === 'door') {
        // The lintel over the doorway and a white frame round it.
        if (!glass) {
          piece(p, q, HEAD + 0.05, WALL_HEIGHT - HEAD - 0.05, -1, neg);
          piece(p, q, HEAD + 0.05, WALL_HEIGHT - HEAD - 0.05, 1, pos);
        } else piece(p, q, WALL_HEIGHT - 0.12, 0.12, 0, '#e9eef2');
        piece(p, q, HEAD, 0.08, 0, frame, { depth: thick + 0.04 });
        piece(p - 0.04, p + 0.04, 0, HEAD, 0, frame, { depth: thick + 0.04 });
        piece(q - 0.04, q + 0.04, 0, HEAD, 0, frame, { depth: thick + 0.04 });
        if (outside) {
          // The front door, shut: a wooden leaf with a handle, and a solid wall behind it.
          piece(p + 0.04, q - 0.04, 0, HEAD, 0, '#6b4226', { depth: thick * 0.6 });
          piece(q - 0.25, q - 0.15, 1.0, 0.06, 0, '#e8c25a', { depth: thick * 0.6 + 0.08 });
          collider(p, q, 0, WALL_HEIGHT);
        } else collider(p, q, HEAD, WALL_HEIGHT - HEAD);
      } else {
        // Wall under and over the window, a sill, a frame, the glass bright with daylight.
        piece(p, q, 0, SILL, -1, neg);
        piece(p, q, 0, SILL, 1, pos);
        piece(p, q, HEAD, WALL_HEIGHT - HEAD, -1, neg);
        piece(p, q, HEAD, WALL_HEIGHT - HEAD, 1, pos);
        piece(p - 0.05, q + 0.05, SILL - 0.04, 0.06, 0, frame, { depth: thick + 0.1 });
        piece(p, q, HEAD - 0.04, 0.06, 0, frame, { depth: thick + 0.04 });
        piece(p - 0.03, p + 0.03, SILL, HEAD - SILL, 0, frame, { depth: thick + 0.04 });
        piece(q - 0.03, q + 0.03, SILL, HEAD - SILL, 0, frame, { depth: thick + 0.04 });
        piece(o.at - 0.025, o.at + 0.025, SILL, HEAD - SILL, 0, frame, { depth: thick + 0.03 });
        piece(p, q, SILL, HEAD - SILL, 0, '#7f9fb4', { glow: true, depth: 0.03 });
        collider(p, q, 0, WALL_HEIGHT);
      }
      from = q;
    }
  }

  // ------------------------------------------------------------------ what the game keeps

  /** Rooms in world space, and the doorways between them (by room index). */
  layout(): { rooms: InteriorRoom[]; links: InteriorLink[] } {
    const rooms = this.rooms.map((r) => {
      const a = this.world(r.x0, r.z0);
      const b = this.world(r.x1, r.z1);
      return { kind: r.kind, level: r.level, x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
    });
    const links = this.linkPoints.map((l) => {
      const inside = this.rooms
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.level === l.level && l.x > r.x0 - 0.3 && l.x < r.x1 + 0.3 && l.z > r.z0 - 0.3 && l.z < r.z1 + 0.3)
        .map(({ i }) => i);
      const at = this.world(l.x, l.z);
      return { level: l.level, x: at.x, z: at.z, a: inside[0] ?? -1, b: inside[1] ?? -1, width: l.width };
    });
    return { rooms, links };
  }
}
