// Inside a place: one of the walkable city's furnished interiors (the same plans, furniture and
// wallpaper), built on its own under the district, with what the player needs to walk round every
// floor (up and down the stairs) and back out of the door.

import type { City, CityPiece, CityShape } from '../city';
import { seededRandom } from '../city';
import type { Stand } from '../interior-builder';
import { buildInterior, type CityInterior, INTERIOR_HEIGHT, type InteriorKind, type InteriorStairs } from '../interiors';
import { hashSeed } from '../humans';
import type { LocationDef } from './locations';
import { type PlayerPose, type Rect, stepPlayer } from './playerMotion';

/** Interiors are built this far under the district (the renderer draws rooms below ground). */
export const INTERIOR_Y = -40;

/**
 * Which plan each interiorId uses. Places with no plan of their own yet borrow the closest one:
 * the chapel a hall, the gym the game centre's open floor, the station the post office counter.
 */
const PLANS: Record<string, InteriorKind> = {
  house: 'home', eventcentre: 'eventcentre', diner: 'diner', cafe: 'cafe', townHall: 'townHall',
  office: 'office', library: 'library', shop: 'shop', hospital: 'hospital', school: 'school',
  church: 'townHall', gym: 'gamecentre', station: 'post',
};

/**
 * A door leaf in an inside doorway: hinged at one end of the opening, swinging 90 degrees into one of
 * the rooms. `along` is the direction the wall runs (the leaf lies along it when shut).
 */
export interface DoorDef {
  id: string;
  level: number;
  y: number;
  /** The doorway's middle. */
  x: number;
  z: number;
  along: 'x' | 'z';
  width: number;
}

/** How far the body reaches from its centre inside: it touches furniture, it doesn't stop short of it. */
export const INSIDE_RADIUS = 0.24;

/** A shut door across its doorway, as something the player can't walk through. */
export function doorBlock(door: DoorDef): Rect {
  const half = door.width / 2;
  return door.along === 'x'
    ? { minX: door.x - half, maxX: door.x + half, minZ: door.z - 0.06, maxZ: door.z + 0.06 }
    : { minX: door.x - 0.06, maxX: door.x + 0.06, minZ: door.z - half, maxZ: door.z + half };
}

/** Each floor: its height, its rooms and what blocks the way on it; and the stairs between them. */
export interface InteriorNav {
  floors: { y: number; rooms: Rect[]; solids: Rect[] }[];
  stairs: InteriorStairs[];
}

/** The player inside: where they stand, which floor they count as on, and their height (on stairs too). */
export interface InsidePose extends PlayerPose {
  level: number;
  y: number;
}

export interface InteriorBuild {
  interior: CityInterior;
  /** A city holding just this interior, for renderers that draw interiors from a City. */
  city: City;
  floorY: number;
  /** Where the player stands on coming in. */
  entry: Stand;
  /** Stand here (inside the front door, on the ground floor) to leave. */
  exitZone: { x: number; z: number; radius: number };
  /** The door up to the roof terrace (a home's top floor), if there is one. */
  roofDoor?: { x: number; z: number; heading: number; level: number; y: number; radius: number };
  nav: InteriorNav;
  /** A door in every inside doorway that has a wall round it. */
  doors: DoorDef[];
}

/** Whether a place has an inside to go into (the park doesn't). */
export const hasInterior = (location: LocationDef) => location.interiorId in PLANS;

export function buildLocationInterior(location: LocationDef): InteriorBuild | null {
  const kind = PLANS[location.interiorId];
  if (!kind) return null;
  const { interior, colliders } = buildInterior(
    {
      kind,
      building: -1,
      x: 0,
      y: INTERIOR_Y,
      z: 0,
      yaw: 0,
      door: { x: 0, z: 12, heading: 0 },
      storeys: kind === 'home' ? 2 : 1,
      roof: kind === 'home',
      name: location.name,
    },
    seededRandom(hashSeed(location.id)),
  );
  const floors = Array.from({ length: interior.levels }, (_, level) => {
    const y = interior.y + level * INTERIOR_HEIGHT;
    const rooms = interior.rooms.filter((r) => r.level === level).map(({ x0, x1, z0, z1 }) => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 }));
    // Anything spanning knee to chest height on this floor blocks the way, except the steps of a
    // flight starting here (they're walked up, not round).
    const solids = colliders
      .filter((c) => c.y - c.hy < y + 1.4 && c.y + c.hy > y + 0.3)
      .filter((c) => !interior.stairs.some((s) => s.level === level && inFlight(s, c.x, c.z, 0.05)))
      .map((c) => ({ minX: c.x - c.hx, maxX: c.x + c.hx, minZ: c.z - c.hz, maxZ: c.z + c.hz }));
    return { y, rooms, solids };
  });
  const up = interior.roof?.inside;
  return {
    interior,
    city: cityWith({ interiors: [interior] }),
    ...(up ? { roofDoor: { ...up, level: Math.round((up.y - interior.y) / INTERIOR_HEIGHT), radius: 1.5 } } : {}),
    floorY: interior.y,
    entry: interior.entry,
    exitZone: { x: interior.entry.x, z: interior.entry.z, radius: 1.8 },
    nav: { floors, stairs: interior.stairs },
    doors: doorsOf(interior),
  };
}

/**
 * One step inside. The player walks within the rooms of their floor, round its walls and furniture.
 * A flight is stepped onto from its foot (on its floor) or its head (from the floor above), never
 * from the side, and left the same way; on it, their height follows the steps, and past halfway
 * they're on the next floor. Nobody walks under or through a flight.
 */
export function stepInside(nav: InteriorNav, pose: InsidePose, move: { x: number; z: number }, dt: number, shut: readonly Rect[] = []): InsidePose {
  const floor = nav.floors[pose.level] ?? nav.floors[0];
  const on = flightUnder(nav, pose);
  const inRooms = (level: number, x: number, z: number) =>
    // Rooms share their edges (the walls between them are solids, with gaps at the doorways).
    (nav.floors[level]?.rooms ?? []).some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
  const area = (x: number, z: number) => {
    if (on) {
      // On a flight: along it, or off its ends (the foot onto its floor, the head onto the one above).
      if (inFlight(on, x, z, 0)) return true;
      const { along, across, length } = measure(on, x, z);
      if (across > on.width / 2) return false;
      return along < 0 ? inRooms(on.level, x, z) : along > length ? inRooms(on.level + 1, x, z) : false;
    }
    for (const s of nav.stairs) {
      if (!inFlight(s, x, z, 0) || (s.level !== pose.level && s.level + 1 !== pose.level)) continue;
      // Stepping on at the end that meets this floor; anywhere else on the flight is in the way.
      const t = progress(s, x, z);
      return (s.level === pose.level && t < 0.15) || (s.level + 1 === pose.level && t > 0.85);
    }
    return inRooms(pose.level, x, z);
  };
  // On the stairs, keys and taps steer along the flight (up or down it), so a slightly diagonal push
  // climbs rather than grinding against its side; nothing on the floors blocks you there.
  const next = stepPlayer(pose, on ? alongFlight(on, move) : towardEnd(nav, pose, move), dt, area, on ? [] : [...floor.solids, ...shut], INSIDE_RADIUS);
  const flight = flightUnder(nav, { ...next, level: pose.level });
  if (!flight) return { ...next, level: pose.level, y: floor.y };
  const t = progress(flight, next.x, next.z);
  const base = nav.floors[flight.level].y;
  return { ...next, level: t >= 0.5 ? flight.level + 1 : flight.level, y: base + t * INTERIOR_HEIGHT };
}

/** The flight the player is on (one meeting their floor, under their feet), if any. */
function flightUnder(nav: InteriorNav, pose: { x: number; z: number; level: number }) {
  return nav.stairs.find((s) => (s.level === pose.level || s.level + 1 === pose.level) && inFlight(s, pose.x, pose.z, 0));
}

/** 0 at the foot of a flight, 1 at its head. */
function progress(s: InteriorStairs, x: number, z: number) {
  const dx = s.top.x - s.bottom.x;
  const dz = s.top.z - s.bottom.z;
  const t = ((x - s.bottom.x) * dx + (z - s.bottom.z) * dz) / (dx * dx + dz * dz);
  return Math.min(1, Math.max(0, t));
}

/** Where a point is relative to a flight: metres along it from the foot, and out from its centre line. */
function measure(s: InteriorStairs, x: number, z: number) {
  const dx = s.top.x - s.bottom.x;
  const dz = s.top.z - s.bottom.z;
  const length = Math.hypot(dx, dz);
  const along = ((x - s.bottom.x) * dx + (z - s.bottom.z) * dz) / length;
  const across = Math.abs((x - s.bottom.x) * dz - (z - s.bottom.z) * dx) / length;
  return { along, across, length };
}

/** Within a flight's footprint (its length and width), grown by `margin`. */
function inFlight(s: InteriorStairs, x: number, z: number, margin: number) {
  const { along, across, length } = measure(s, x, z);
  return along > -margin && along < length + margin && across < s.width / 2 + margin;
}

/**
 * Near a flight and heading along it (up from below, or down from above), a move is guided to the end
 * that meets this floor, so coming at the stairs at an angle steps onto them instead of catching on
 * their side.
 */
function towardEnd(nav: InteriorNav, pose: InsidePose, move: { x: number; z: number }) {
  const strength = Math.hypot(move.x, move.z);
  if (strength < 0.05) return move;
  for (const s of nav.stairs) {
    const up = s.level === pose.level;
    if (!up && s.level + 1 !== pose.level) continue;
    const { length } = measure(s, pose.x, pose.z);
    const ux = (s.top.x - s.bottom.x) / length;
    const uz = (s.top.z - s.bottom.z) / length;
    // The way onto it from this floor, a step in from its end.
    const end = up ? { x: s.bottom.x + ux * 0.2, z: s.bottom.z + uz * 0.2 } : { x: s.top.x - ux * 0.2, z: s.top.z - uz * 0.2 };
    const dx = end.x - pose.x;
    const dz = end.z - pose.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.5 || d < 0.05) continue;
    const sign = up ? 1 : -1;
    // Heading along the flight, and still short of its end (not beside or past it).
    const lean = ((move.x * ux + move.z * uz) / strength) * sign;
    const before = ((pose.x - end.x) * ux + (pose.z - end.z) * uz) * sign < 0;
    if (lean > 0.3 && before) return { x: (dx / d) * strength, z: (dz / d) * strength };
  }
  return move;
}

/** A move turned to run along a flight (up or down, whichever it leans), keeping its strength. */
function alongFlight(s: InteriorStairs, move: { x: number; z: number }) {
  const dx = s.top.x - s.bottom.x;
  const dz = s.top.z - s.bottom.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const strength = Math.hypot(move.x, move.z);
  const lean = move.x * ux + move.z * uz;
  // Pushing straight across the stairs goes nowhere.
  if (Math.abs(lean) < strength * 0.25) return { x: 0, z: 0 };
  const sign = Math.sign(lean);
  return { x: ux * sign * strength, z: uz * sign * strength };
}

/** Doors for the doorways between two rooms where a wall stands (open-plan rooms have none). */
function doorsOf(interior: CityInterior): DoorDef[] {
  const doors: DoorDef[] = [];
  interior.links.forEach((link, i) => {
    const a = interior.rooms[link.a];
    const b = interior.rooms[link.b];
    if (!a || !b) return;
    // The wall between them: they meet along x (one's maxX is the other's minX) or along z.
    const meetX = Math.abs(a.x1 - b.x0) < 0.05 || Math.abs(b.x1 - a.x0) < 0.05;
    const along = meetX ? 'z' : 'x';
    const y = interior.y + link.level * INTERIOR_HEIGHT;
    const walled = interior.shapes.some(
      (s) => s.wall && (s.level ?? 0) === link.level && Math.hypot(s.x - link.x, s.z - link.z) < link.width / 2 + 1.2 && s.h > 1.5,
    );
    if (walled) doors.push({ id: `door-${i}`, level: link.level, y, x: link.x, z: link.z, along, width: link.width });
  });
  return doors;
}

/** An otherwise empty city holding just these (interiors to draw as rooms, or props and shapes outdoors). */
export function cityWith({ interiors = [], props = [], shapes = [] }: { interiors?: CityInterior[]; props?: CityPiece[]; shapes?: CityShape[] }): City {
  const r = 60;
  const bounds = { x0: -r, z0: -r, x1: r, z1: r };
  return {
    seed: 0,
    origin: { x: bounds.x0, z: bounds.z0 },
    bounds,
    districts: [],
    streets: [],
    roads: [],
    sidewalks: [],
    buildings: [],
    props,
    shapes,
    lots: [],
    blocks: [],
    colliders: [],
    spots: [],
    neon: [],
    lights: [],
    signs: [],
    graph: { nodes: [], edges: [] },
    monorail: { path: [], y: 0, cars: 0 },
    interiors,
    home: -1,
  };
}
