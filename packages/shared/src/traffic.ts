// Town life: cars driving the streets and people walking the sidewalks. Pure logic (no drawing, no
// physics): call update() every frame with where the player is, then draw `cars` and `people`.
//
// Cars keep to the right in one of the two lanes, pick a new street at every junction (never straight
// back), follow the car ahead, stop at red lights downtown, take turns through the other junctions, and
// stop for people and anything else in the road. People walk round the blocks on the sidewalks, now and
// then stop for a while, and cross the street at the corners when no car is close.
//
// It's ambient: each client runs its own, only round the player, so it costs nothing far away.

import { type City, KERB_HEIGHT, LANE_WIDTH, SIDEWALK_WIDTH, STREET_WIDTH } from './city';

/** Where the streets run into a junction's square (all junction pieces reach 9 m along each street). */
const JUNCTION_REACH = STREET_WIDTH / 2;
/** Lane centres to the right of a street's middle, metres. */
const LANES = [LANE_WIDTH / 2, LANE_WIDTH * 1.5];
const CRUISE = 11; // m/s, about 40 km/h
const TURN_SPEED = 6;
const ACCELERATION = 2.5;
const BRAKING = 7;
/** Traffic lights: each axis has green for GREEN seconds, then all red for CLEAR seconds. */
const GREEN = 11;
const CLEAR = 2.5;
const CYCLE = 2 * (GREEN + CLEAR);
/** People walk this far out from the block's edge (sidewalks are 3 m wide). */
const WALK_LINE = 1.4;

export interface TrafficOptions {
  cars?: number;
  people?: number;
  /** Things are added this far round the player and taken away beyond `radius + 40`. */
  radius?: number;
  random?: () => number;
}

export interface TrafficCar {
  id: number;
  /** Index into TRAFFIC_CAR_KINDS. */
  kind: number;
  x: number;
  y: number;
  z: number;
  /** Turned this far about Y from facing +Z. */
  heading: number;
  speed: number;
  braking: boolean;
  /** Front wheel angle, radians, + left. */
  steer: number;
  /** Distance driven, metres (spins the wheels). */
  odometer: number;
  // Route.
  path: Point[];
  /** Distance along `path`. */
  s: number;
  lane: number;
  /** The last two junctions of the route planned so far, and the one it'll turn toward after them. */
  from: number;
  to: number;
  after: number;
  /** Junctions on the route ahead: where along `path` the car enters and leaves each, which way it enters. */
  junctions: { node: number; entry: number; exit: number; heading: number }[];
  /** Junction this car may cross (it has checked the lights and the traffic), or -1. */
  claim: number;
}

export interface Pedestrian {
  id: number;
  /** Which of the town's walker models, 0..1 (the renderer maps it to one). */
  look: number;
  /** Walks a dog on a lead. */
  dog: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** 0 when standing still. */
  speed: number;
  // Route: walking round a block's sidewalk loop, or across the street to another block.
  block: number;
  /** Position round the loop, metres from its south-west corner, anticlockwise seen from above. */
  t: number;
  dir: 1 | -1;
  pace: number;
  /** Seconds left standing still. */
  rest: number;
  crossing?: { ax: number; az: number; bx: number; bz: number; s: number; block: number; t: number };
}

/** Which cars drive the streets (their vehicle model keys), repeated for weight, and their paint. */
export const TRAFFIC_CAR_KINDS = [
  { model: 'sedan', paints: ['#c9ccd1', '#1f2733', '#7a1e1e', '#2a4f86', '#e8e4da', '#3d5c3a'] },
  { model: 'hatchback', paints: ['#d94f3a', '#f2c94c', '#4a90d9', '#f5f5f0', '#2b2b2b'] },
  { model: 'suv', paints: ['#1d1f22', '#8a9199', '#f0eee8', '#26405c', '#5b3a29'] },
  { model: 'taxi', paints: [''] },
  { model: 'sportsCar', paints: ['#d81e1e', '#ffb300', '#1a1a1a', '#1e88e5'] },
  { model: 'policeCar', paints: [''] },
] as const;
const CAR_WEIGHTS = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5];

interface Point {
  x: number;
  z: number;
}

interface Corner {
  block: number;
  /** Position round that block's loop. */
  t: number;
  x: number;
  z: number;
}

export class TownTraffic {
  readonly cars: TrafficCar[] = [];
  readonly people: Pedestrian[] = [];
  private readonly neighbours: number[][];
  private readonly signalOffset: number[];
  private readonly loops: { x0: number; z0: number; x1: number; z1: number; length: number }[];
  /** For each block's corner (4 per block, SW SE NE NW), the corners across the street from it. */
  private readonly across: Corner[][];
  private readonly random: () => number;
  private readonly maxCars: number;
  private readonly maxPeople: number;
  private readonly radius: number;
  private time = 0;
  private nextId = 1;

  constructor(
    private readonly city: City,
    { cars = 28, people = 40, radius = 170, random = Math.random }: TrafficOptions = {},
  ) {
    this.random = random;
    this.maxCars = cars;
    this.maxPeople = people;
    this.radius = radius;
    const { nodes, edges } = city.graph;
    this.neighbours = nodes.map(() => []);
    for (const [a, b] of edges) {
      this.neighbours[a].push(b);
      this.neighbours[b].push(a);
    }
    // Neighbouring lights run out of step, so a whole avenue doesn't go red at once.
    this.signalOffset = nodes.map((_, i) => ((i * 7.3) % CYCLE));
    this.loops = city.blocks.map((b) => {
      const r = { x0: b.x0 - WALK_LINE, z0: b.z0 - WALK_LINE, x1: b.x1 + WALK_LINE, z1: b.z1 + WALK_LINE };
      return { ...r, length: 2 * (r.x1 - r.x0 + r.z1 - r.z0) };
    });
    const corners: Corner[] = this.loops.flatMap((l, block) => {
      const w = l.x1 - l.x0;
      const d = l.z1 - l.z0;
      return [
        { block, t: 0, x: l.x0, z: l.z0 },
        { block, t: w, x: l.x1, z: l.z0 },
        { block, t: w + d, x: l.x1, z: l.z1 },
        { block, t: 2 * w + d, x: l.x0, z: l.z1 },
      ];
    });
    // Across a street: about a street's width (less the two walking margins) away along one axis.
    const gap = STREET_WIDTH - 2 * WALK_LINE;
    this.across = corners.map((c) =>
      corners.filter((o) => {
        if (o.block === c.block) return false;
        const dx = Math.abs(o.x - c.x);
        const dz = Math.abs(o.z - c.z);
        return (Math.abs(dx - gap) < 2 && dz < 2) || (Math.abs(dz - gap) < 2 && dx < 2);
      }),
    );
  }

  /** Whether a junction's lights are green for traffic along X (or along Z). */
  green(node: number, alongX: boolean): boolean {
    const t = (this.time + this.signalOffset[node]) % CYCLE;
    return alongX ? t < GREEN : t >= GREEN + CLEAR && t < CYCLE - CLEAR;
  }

  /**
   * Moves everything on by dt seconds round `focus` (the player). `obstacles` are other things cars
   * must stop for: the player, the player's car.
   */
  update(dt: number, focus: Point, obstacles: Point[] = []) {
    this.time += dt;
    this.populate(focus);
    for (const car of this.cars) this.drive(car, dt, obstacles);
    for (const person of this.people) this.walk(person, dt);
  }

  // ------------------------------------------------------------------ cars

  private populate(focus: Point) {
    const far = (p: Point) => Math.hypot(p.x - focus.x, p.z - focus.z) > this.radius + 40;
    for (let i = this.cars.length - 1; i >= 0; i--) if (far(this.cars[i])) this.cars.splice(i, 1);
    for (let i = this.people.length - 1; i >= 0; i--) if (far(this.people[i])) this.people.splice(i, 1);
    // A few at a time, out of sight where possible (more than 60 m away), on streets near the player.
    const { nodes, edges } = this.city.graph;
    for (let tries = 0; this.cars.length < this.maxCars && tries < 6; tries++) {
      const [a, b] = this.pick(edges);
      const flip = this.random() < 0.5;
      const from = flip ? b : a;
      const to = flip ? a : b;
      const after = this.choose(from, to);
      const lane = this.laneFor(from, to, after);
      const path = this.lanePath(from, to, lane);
      const s = this.random() * Math.max(0, this.length(path) - 25);
      const at = this.pointAt(path, s);
      const d = Math.hypot(at.x - focus.x, at.z - focus.z);
      if (d > this.radius || (d < 60 && this.cars.length > 4)) continue;
      if (this.cars.some((c) => Math.hypot(c.x - at.x, c.z - at.z) < 12)) continue;
      const kind = CAR_WEIGHTS[Math.floor(this.random() * CAR_WEIGHTS.length)];
      const car: TrafficCar = { id: this.nextId++, kind, x: at.x, y: 0, z: at.z, heading: at.heading, speed: CRUISE * 0.7, braking: false, steer: 0, odometer: 0, path, s, lane, from, to, after, junctions: [], claim: -1 };
      this.cars.push(car);
    }
    for (let tries = 0; this.people.length < this.maxPeople && tries < 6; tries++) {
      const block = Math.floor(this.random() * this.loops.length);
      const loop = this.loops[block];
      const t = this.random() * loop.length;
      const at = this.loopPoint(block, t);
      const d = Math.hypot(at.x - focus.x, at.z - focus.z);
      if (d > this.radius * 0.8 || (d < 35 && this.people.length > 6)) continue;
      const zone = this.city.blocks[block].zone;
      if (zone === 'industrial' && this.random() < 0.7) continue;
      this.people.push({
        id: this.nextId++,
        look: this.random(),
        dog: this.random() < 0.15,
        x: at.x,
        y: KERB_HEIGHT,
        z: at.z,
        heading: 0,
        speed: 0,
        block,
        t,
        dir: this.random() < 0.5 ? 1 : -1,
        pace: 1.1 + this.random() * 0.45,
        rest: this.random() < 0.2 ? 2 + this.random() * 6 : 0,
      });
    }
  }

  private drive(car: TrafficCar, dt: number, obstacles: Point[]) {
    const { nodes } = this.city.graph;
    // Keep at least 40 m of route ahead: through the next junction and down the next street.
    while (this.length(car.path) - car.s < 40) this.extend(car);
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let limit = CRUISE;
    // Slow for the bends ahead.
    for (let look = 4; look <= 30; look += 4) {
      const a = this.pointAt(car.path, car.s + look);
      const turn = Math.abs(angleBetween(a.heading, car.heading));
      if (turn > 0.3) limit = Math.min(limit, Math.sqrt(TURN_SPEED ** 2 + 2 * ACCELERATION * Math.max(0, look - 8)));
    }
    // The next junction: wait at the line for green, and for anyone crossing it from another way.
    const next = car.junctions.find((j) => j.exit > car.s);
    if (next && car.claim !== next.node) {
      const stopAt = next.entry - car.s - 2.4; // the car's front at the line
      if (stopAt < 25) {
        const node = nodes[next.node];
        const alongX = Math.abs(Math.sin(next.heading)) > 0.7;
        const red = node.signal && !this.green(next.node, alongX);
        // Others may be crossing only if they came in the same way (following through), never across.
        const clear = this.cars.every((o) => o === car || o.claim !== next.node || Math.cos((o.junctions.find((j) => j.node === next.node)?.heading ?? next.heading + Math.PI) - next.heading) > 0.9);
        // Too close to stop when the lights change: carry on through (the all-red gives it time).
        const committed = stopAt < (car.speed * car.speed) / (2 * BRAKING) + 0.5;
        if (clear && ((!red && stopAt < 6) || committed)) car.claim = next.node;
        else if (red || !clear) limit = Math.min(limit, Math.sqrt(2 * BRAKING * 0.6 * Math.max(0, stopAt)));
      }
    }
    // Whatever is in front: cars in the same lane, people, the player.
    // Along the route ahead (so round the bends too), metre by metre: the first thing on it.
    let gap = Infinity;
    const things: [number, number, number][] = []; // x, z, how close counts as in the way
    for (const o of this.cars) if (o !== car && Math.abs(o.x - car.x) < 45 && Math.abs(o.z - car.z) < 45) things.push([o.x, o.z, 2]);
    for (const p of this.people) if (p.crossing) things.push([p.x, p.z, 1.8]);
    for (const o of obstacles) if (Math.abs(o.x - car.x) < 45 && Math.abs(o.z - car.z) < 45) things.push([o.x, o.z, 2.2]);
    if (things.length) {
      for (let look = 1; look <= 36 && gap === Infinity; look += 1.5) {
        const p = this.pointAt(car.path, car.s + look);
        for (const [x, z, near] of things) {
          if ((x - p.x) ** 2 + (z - p.z) ** 2 < near * near) {
            gap = look;
            break;
          }
        }
      }
    }
    if (gap < Infinity) limit = Math.min(limit, Math.max(0, (gap - 6) * 1.1));
    // Speed up gently, brake as hard as it takes.
    const before = car.speed;
    car.speed = limit > car.speed ? Math.min(limit, car.speed + ACCELERATION * dt) : Math.max(limit, car.speed - BRAKING * dt);
    car.speed = Math.max(0, car.speed);
    car.braking = car.speed < before - 0.01 || car.speed < 0.1;
    const step = car.speed * dt;
    car.s += step;
    car.odometer += step;
    const at = this.pointAt(car.path, car.s);
    const ahead2 = this.pointAt(car.path, car.s + 3);
    car.steer = Math.max(-0.5, Math.min(0.5, angleBetween(ahead2.heading, at.heading) * 1.6));
    car.x = at.x;
    car.z = at.z;
    car.heading = at.heading;
    // Drop the route behind.
    if (car.s > 30) {
      let cut = 0;
      let run = 0;
      while (cut < car.path.length - 2 && run + dist(car.path[cut], car.path[cut + 1]) < car.s - 10) {
        run += dist(car.path[cut], car.path[cut + 1]);
        cut++;
      }
      car.path.splice(0, cut);
      car.s -= run;
      for (const j of car.junctions) {
        j.entry -= run;
        j.exit -= run;
      }
      car.junctions = car.junctions.filter((j) => j.exit > -20);
    }
    // Out the other side: let the next car in.
    const crossed = car.junctions.find((j) => j.node === car.claim);
    if (car.claim >= 0 && (!crossed || car.s > crossed.exit + 2.4)) car.claim = -1;
  }

  /** Appends the turn through the next junction and the street after it. */
  private extend(car: TrafficCar) {
    const { nodes } = this.city.graph;
    const next = car.after;
    const after = this.choose(car.to, next);
    // Into the lane for the turn after: the kerb lane to turn right, the inside lane to turn left.
    let lane = this.laneFor(car.to, next, after);
    const a = nodes[car.from];
    const b = nodes[car.to];
    const c = nodes[next];
    const d1 = unit(b.x - a.x, b.z - a.z);
    const d2 = unit(c.x - b.x, c.z - b.z);
    const off1 = LANES[car.lane];
    // Out of the turn in the same lane, changing lanes (if it must) down the street after it.
    const off2 = off1;
    const r1 = right(d1);
    const r2 = right(d2);
    const p0 = { x: b.x - d1.x * JUNCTION_REACH + r1.x * off1, z: b.z - d1.z * JUNCTION_REACH + r1.z * off1 };
    const p2 = { x: b.x + d2.x * JUNCTION_REACH + r2.x * off2, z: b.z + d2.z * JUNCTION_REACH + r2.z * off2 };
    const straight = Math.abs(d1.x * d2.x + d1.z * d2.z) > 0.9;
    const entry = this.length(car.path);
    if (!straight) {
      // Where the two lanes' lines meet is the curve's control point.
      const k1 = (r2.x * d1.x + r2.z * d1.z) * off2;
      const k2 = (r1.x * d2.x + r1.z * d2.z) * off1;
      const ctrl = { x: b.x + d1.x * k1 + d2.x * k2, z: b.z + d1.z * k1 + d2.z * k2 };
      for (let i = 1; i < 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        car.path.push({ x: u * u * p0.x + 2 * u * t * ctrl.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * ctrl.z + t * t * p2.z });
      }
    }
    const street = this.lanePath(car.to, next, car.lane);
    const streetLength = dist(street[0], street[1]);
    if (lane !== car.lane && streetLength > 40) {
      const target = this.lanePath(car.to, next, lane);
      const at = (path: Point[], t: number) => ({ x: path[0].x + (path[1].x - path[0].x) * t, z: path[0].z + (path[1].z - path[0].z) * t });
      street.splice(1, 0, at(street, 8 / streetLength), at(target, 26 / streetLength));
      street[street.length - 1] = target[1];
    } else {
      lane = car.lane;
    }
    car.junctions.push({ node: car.to, entry, exit: this.length(car.path) + dist(car.path[car.path.length - 1], street[0]), heading: Math.atan2(d1.x, d1.z) });
    car.path.push(...street);
    car.from = car.to;
    car.to = next;
    car.after = after;
    car.lane = lane;
  }

  /** A random way on from junction `to` (arriving from `from`), never straight back if there's another. */
  private choose(from: number, to: number): number {
    const options = this.neighbours[to].filter((n) => n !== from);
    return options.length ? options[Math.floor(this.random() * options.length)] : from;
  }

  /** The lane to drive from `from` to `to` in, to turn toward `after` there. */
  private laneFor(from: number, to: number, after: number): number {
    const { nodes } = this.city.graph;
    const d1 = unit(nodes[to].x - nodes[from].x, nodes[to].z - nodes[from].z);
    const d2 = unit(nodes[after].x - nodes[to].x, nodes[after].z - nodes[to].z);
    const r = right(d1);
    const side = d2.x * r.x + d2.z * r.z;
    return side > 0.5 ? 1 : side < -0.5 ? 0 : this.random() < 0.5 ? 0 : 1;
  }

  /** The two ends of a lane down the street from one junction to the next. */
  private lanePath(from: number, to: number, lane: number): Point[] {
    const { nodes } = this.city.graph;
    const a = nodes[from];
    const b = nodes[to];
    const d = unit(b.x - a.x, b.z - a.z);
    const r = right(d);
    const off = LANES[lane];
    return [
      { x: a.x + d.x * JUNCTION_REACH + r.x * off, z: a.z + d.z * JUNCTION_REACH + r.z * off },
      { x: b.x - d.x * JUNCTION_REACH + r.x * off, z: b.z - d.z * JUNCTION_REACH + r.z * off },
    ];
  }

  private length(path: Point[]) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
    return total;
  }

  private pointAt(path: Point[], s: number): Point & { heading: number } {
    let run = 0;
    for (let i = 1; i < path.length; i++) {
      const len = dist(path[i - 1], path[i]);
      if (run + len >= s || i === path.length - 1) {
        const t = len > 0 ? Math.max(0, Math.min(1, (s - run) / len)) : 0;
        const a = path[i - 1];
        const b = path[i];
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) };
      }
      run += len;
    }
    return { ...path[0], heading: 0 };
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)];
  }

  // ------------------------------------------------------------------ people

  /** A point round a block's sidewalk loop, and the way along it. */
  private loopPoint(block: number, t: number): Point & { heading: number } {
    const l = this.loops[block];
    const w = l.x1 - l.x0;
    const d = l.z1 - l.z0;
    t = ((t % l.length) + l.length) % l.length;
    if (t < w) return { x: l.x0 + t, z: l.z0, heading: Math.PI / 2 };
    if (t < w + d) return { x: l.x1, z: l.z0 + (t - w), heading: 0 };
    if (t < 2 * w + d) return { x: l.x1 - (t - w - d), z: l.z1, heading: -Math.PI / 2 };
    return { x: l.x0, z: l.z1 - (t - 2 * w - d), heading: Math.PI };
  }

  private walk(person: Pedestrian, dt: number) {
    if (person.rest > 0) {
      person.rest -= dt;
      person.speed = 0;
      return;
    }
    person.speed = person.pace;
    if (person.crossing) {
      const c = person.crossing;
      const length = Math.hypot(c.bx - c.ax, c.bz - c.az);
      c.s += person.pace * dt;
      const t = Math.min(1, c.s / length);
      person.x = c.ax + (c.bx - c.ax) * t;
      person.z = c.az + (c.bz - c.az) * t;
      person.heading = Math.atan2(c.bx - c.ax, c.bz - c.az);
      // Down off the kerb and up again (the kerb is SIDEWALK_WIDTH - WALK_LINE away at each end).
      const kerb = (SIDEWALK_WIDTH - WALK_LINE) / length;
      person.y = t < kerb || t > 1 - kerb ? KERB_HEIGHT : 0;
      if (t >= 1) {
        person.block = c.block;
        person.t = c.t;
        person.crossing = undefined;
      }
      return;
    }
    const before = person.t;
    person.t += person.dir * person.pace * dt;
    const loop = this.loops[person.block];
    // Passing a corner: sometimes cross the street, sometimes turn back; now and then stop a while.
    const corners = this.cornersOf(person.block);
    for (const [k, corner] of corners.entries()) {
      const passed = person.dir > 0 ? wrapBetween(before, person.t, corner.t, loop.length) : wrapBetween(person.t, before, corner.t, loop.length);
      if (!passed) continue;
      const roll = this.random();
      if (roll < 0.35) {
        const options = this.across[person.block * 4 + k];
        if (options.length) {
          const to = options[Math.floor(this.random() * options.length)];
          // Wait for a gap in the traffic.
          if (this.cars.some((c) => Math.hypot(c.x - (corner.x + to.x) / 2, c.z - (corner.z + to.z) / 2) < 20)) {
            person.t = corner.t;
            person.rest = 1.5;
            return;
          }
          person.crossing = { ax: corner.x, az: corner.z, bx: to.x, bz: to.z, s: 0, block: to.block, t: to.t };
          person.x = corner.x;
          person.z = corner.z;
          return;
        }
      } else if (roll < 0.42) {
        person.dir = person.dir > 0 ? -1 : 1;
      } else if (roll < 0.5) {
        person.rest = 2 + this.random() * 5;
      }
    }
    person.t = ((person.t % loop.length) + loop.length) % loop.length;
    const at = this.loopPoint(person.block, person.t);
    person.x = at.x;
    person.z = at.z;
    person.y = KERB_HEIGHT;
    person.heading = person.dir > 0 ? at.heading : at.heading + Math.PI;
  }

  private cornersOf(block: number): Corner[] {
    const l = this.loops[block];
    const w = l.x1 - l.x0;
    const d = l.z1 - l.z0;
    return [
      { block, t: 0, x: l.x0, z: l.z0 },
      { block, t: w, x: l.x1, z: l.z0 },
      { block, t: w + d, x: l.x1, z: l.z1 },
      { block, t: 2 * w + d, x: l.x0, z: l.z1 },
    ];
  }
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.z - a.z);
const unit = (x: number, z: number) => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
};
/** The right-hand side of a direction (seen from above, +Y up: facing +Z, right is -X). */
const right = (d: Point) => ({ x: -d.z, z: d.x });
/** Signed smallest angle from b to a. */
const angleBetween = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** Whether `x` lies in (lo, hi] going round a loop of length `length` (lo may be > hi after wrapping). */
function wrapBetween(lo: number, hi: number, x: number, length: number) {
  const span = hi - lo;
  if (span <= 0) return false;
  const off = (((x - lo) % length) + length) % length;
  return off > 0 && off <= span;
}
