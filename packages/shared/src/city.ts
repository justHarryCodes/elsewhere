// The city: a seeded generator shared by the server (colliders) and the clients (drawing), so the same
// seed builds the same streets, buildings and props everywhere without sending any of it over the wire.
//
// Layout: about 1 km along X by 600 m along Z, built on a grid of 8 m road tiles (Kenney's city kits,
// where one tile is one kit unit). Residential streets at the -X end, the commercial centre in the
// middle (tallest towers in its middle), industry at the +X end. A ring road runs round the edge and
// a main avenue straight through the middle; each district has its own block sizes.
//
// Heights: the road surface is y = 0; sidewalks and lots are a kerb (8 cm) above it.

import { CITY_MODELS, type CityModelKey } from './city-catalog';

export { CITY_MODELS, type CityModel, type CityModelKey } from './city-catalog';

/** Metres per kit unit; one road tile is one unit square. */
export const CITY_UNIT = 8;
export const CITY_CELL = CITY_UNIT;
/** Road tiles along X and Z. */
export const CITY_COLS = 125;
export const CITY_ROWS = 75;
/** Sidewalks and lots stand this far above the road (the tiles' own kerb). */
export const KERB_HEIGHT = 0.01 * CITY_UNIT;
/** Road tiles are drawn this low so their road surface lands on y = 0. */
export const ROAD_TILE_Y = -KERB_HEIGHT;
const SIDEWALK = 0.1 * CITY_UNIT;

export type CityZone = 'residential' | 'commercial' | 'industrial';
export const CITY_ZONES: readonly CityZone[] = ['residential', 'commercial', 'industrial'];

/** One model in the city: drawn at CITY_UNIT scale, turned `yaw` radians about Y (0 = as authored). */
export interface CityObject {
  model: CityModelKey;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Axis-aligned solid box: centre and half sizes, metres. */
export interface CityBox {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

/** The ground between roads, metres (world X/Z). */
export interface CityBlock {
  zone: CityZone;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A place on a road to put a car or a player: centre of a straight tile, heading along the road. */
export interface CitySpot {
  x: number;
  z: number;
  heading: number;
  zone: CityZone;
}

export interface City {
  seed: number;
  /** World X/Z of the city's south-west (-X, -Z) corner. */
  origin: { x: number; z: number };
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** World X where each district starts and ends. */
  districts: { zone: CityZone; x0: number; x1: number }[];
  roads: CityObject[];
  objects: CityObject[];
  blocks: CityBlock[];
  colliders: CityBox[];
  spots: CitySpot[];
}

export interface CityOptions {
  seed?: number | string;
  /** World position of the south-west corner; by default the city is centred on the origin. */
  origin?: { x: number; z: number };
}

// ------------------------------------------------------------------ randomness

/** Small, fast, deterministic PRNG (mulberry32): the same seed gives the same sequence everywhere. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Rng = ReturnType<typeof seededRandom>;
const between = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
const intBetween = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T | undefined {
  let total = 0;
  for (const item of items) total += weight(item);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// ------------------------------------------------------------------ districts

interface ZoneStyle {
  /** Block interior size range in tiles (between roads). */
  blockCols: [number, number];
  blockRows: [number, number];
  /** Chance a street between two blocks is left out, making one big block. */
  mergeChance: number;
  buildings: CityModelKey[];
  /** Building row depth (m), front yard (m), gap between buildings (m), gap at a block's ends (m). */
  rowDepth: number;
  setback: number;
  gap: [number, number];
  endGap: number;
  lamp: CityModelKey;
}

const range = (prefix: string, letters: string) => [...letters].map((l) => `${prefix}${l}` as CityModelKey);

const ZONE_STYLE: Record<CityZone, ZoneStyle> = {
  residential: {
    blockCols: [7, 9],
    blockRows: [4, 5],
    mergeChance: 0.1,
    buildings: range('suburban/building-type-', 'abcdefghijklmnopqrstu'),
    rowDepth: 17,
    setback: 4,
    gap: [2.5, 5],
    endGap: 2,
    lamp: 'roads/light-curved',
  },
  commercial: {
    blockCols: [5, 7],
    blockRows: [5, 6],
    mergeChance: 0.15,
    buildings: [...range('commercial/building-', 'abcdefghijklmn'), ...range('commercial/building-skyscraper-', 'abcde')],
    rowDepth: 18,
    setback: 0.6,
    gap: [0, 0.8],
    endGap: 0.6,
    lamp: 'roads/light-square',
  },
  industrial: {
    blockCols: [8, 11],
    blockRows: [6, 8],
    mergeChance: 0.25,
    buildings: range('industrial/building-', 'abcdefghijklmnopqrst'),
    rowDepth: 22,
    setback: 4,
    gap: [5, 10],
    endGap: 3,
    lamp: 'roads/light-curved',
  },
};

/** Fractions of the city's length where commercial starts and industry starts. */
const DISTRICT_SPLITS = [0.35, 0.65];

// ------------------------------------------------------------------ road tiles
// Openings as bits, N = +Z, E = +X, S = -Z, W = -X. Turning a tile 90 degrees (yaw +PI/2) maps
// N -> E -> S -> W -> N, i.e. shifts the bits up by one.
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const turn = (mask: number) => ((mask << 1) | (mask >> 3)) & 15;

const ROAD_PIECES: { mask: number; plain: CityModelKey; crossing?: CityModelKey }[] = [
  { mask: E | W, plain: 'roads/road-straight' },
  { mask: E, plain: 'roads/road-end' },
  { mask: N | E, plain: 'roads/road-bend' },
  { mask: E | W | N, plain: 'roads/road-intersection', crossing: 'roads/road-intersection-path' },
  { mask: N | E | S | W, plain: 'roads/road-crossroad', crossing: 'roads/road-crossroad-path' },
];

function roadPiece(mask: number, zebra: boolean): { model: CityModelKey; yaw: number } | undefined {
  for (const piece of ROAD_PIECES) {
    let m = piece.mask;
    for (let k = 0; k < 4; k++, m = turn(m)) {
      if (m === mask) return { model: (zebra && piece.crossing) || piece.plain, yaw: (k * Math.PI) / 2 };
    }
  }
  return undefined;
}

// ------------------------------------------------------------------ model footprints

/** World-aligned bounds of a model turned by quarter turns `k`, metres, relative to its origin. */
function turnedBounds(model: CityModelKey, k: number) {
  const { min, max } = CITY_MODELS[model];
  const u = CITY_UNIT;
  const [x0, y0, z0, x1, y1, z1] = [min[0] * u, min[1] * u, min[2] * u, max[0] * u, max[1] * u, max[2] * u];
  // Yaw +PI/2 maps (x, z) -> (z, -x).
  switch (k & 3) {
    case 0:
      return { x0, x1, z0, z1, height: y1 - y0 };
    case 1:
      return { x0: z0, x1: z1, z0: -x1, z1: -x0, height: y1 - y0 };
    case 2:
      return { x0: -x1, x1: -x0, z0: -z1, z1: -z0, height: y1 - y0 };
    default:
      return { x0: -z1, x1: -z0, z0: x0, z1: x1, height: y1 - y0 };
  }
}

/** Quarter turns that make a building's front (-Z as authored) face the given side. */
const FACE: Record<'S' | 'N' | 'E' | 'W', number> = { S: 0, W: 1, N: 2, E: 3 };

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

// ------------------------------------------------------------------ the generator

export function generateCity(options: CityOptions = {}): City {
  const seed = hashSeed(options.seed ?? 1);
  const rng = seededRandom(seed);
  const origin = options.origin ?? { x: (-CITY_COLS * CITY_CELL) / 2, z: (-CITY_ROWS * CITY_CELL) / 2 };
  const cellX = (c: number) => origin.x + (c + 0.5) * CITY_CELL;
  const cellZ = (r: number) => origin.z + (r + 0.5) * CITY_CELL;

  // District boundaries are north-south streets.
  const lastCol = CITY_COLS - 1;
  const lastRow = CITY_ROWS - 1;
  const bounds = [0, ...DISTRICT_SPLITS.map((f) => Math.round(lastCol * f)), lastCol];
  const zoneOfCol = (c: number): CityZone => CITY_ZONES[Math.min(2, bounds.findIndex((b, i) => i > 0 && c < b) - 1)] ?? 'industrial';

  // East-west: the ring road's two sides and the main avenue run the whole length; each district
  // splits the space between them into its own block depths.
  const avenue = Math.round(lastRow / 2);
  const mainRows = [0, avenue, lastRow];
  const zoneRows = {} as Record<CityZone, number[]>;
  const zoneCols = {} as Record<CityZone, number[]>;
  CITY_ZONES.forEach((zone, i) => {
    const style = ZONE_STYLE[zone];
    zoneRows[zone] = mainRows.slice(0, -1).flatMap((from, j) => [from, ...splitSpan(rng, from, mainRows[j + 1], style.blockRows)]);
    zoneRows[zone].push(lastRow);
    zoneCols[zone] = [bounds[i], ...splitSpan(rng, bounds[i], bounds[i + 1], style.blockCols), bounds[i + 1]];
  });

  // Some north-south streets are left out between two east-west ones, joining blocks.
  const road = new Uint8Array(CITY_COLS * CITY_ROWS);
  const at = (c: number, r: number) => c >= 0 && r >= 0 && c < CITY_COLS && r < CITY_ROWS && road[r * CITY_COLS + c] === 1;
  CITY_ZONES.forEach((zone, i) => {
    const rows = zoneRows[zone];
    const x0 = bounds[i];
    const x1 = bounds[i + 1];
    for (const r of rows) for (let c = x0; c <= x1; c++) road[r * CITY_COLS + c] = 1;
    for (const c of zoneCols[zone]) {
      const boundary = c === x0 || c === x1;
      for (let j = 0; j < rows.length - 1; j++) {
        if (!boundary && rng() < ZONE_STYLE[zone].mergeChance) continue;
        for (let r = rows[j]; r <= rows[j + 1]; r++) road[r * CITY_COLS + c] = 1;
      }
    }
  });

  const roads: CityObject[] = [];
  const objects: CityObject[] = [];
  const colliders: CityBox[] = [];
  const spots: CitySpot[] = [];
  const centreX = cellX((bounds[1] + bounds[2]) / 2);
  const commercialHalf = ((bounds[2] - bounds[1]) * CITY_CELL) / 2;

  const add = (model: CityModelKey, x: number, y: number, z: number, yaw = 0) => objects.push({ model, x, y, z, yaw });
  /** A solid prop: drawn, plus a box (footprint scaled by `solid`, e.g. a tree's trunk). */
  const addSolid = (model: CityModelKey, x: number, z: number, k: number, solid = 1, y = KERB_HEIGHT) => {
    const b = turnedBounds(model, k);
    add(model, x, y, z, (k * Math.PI) / 2);
    const cx = x + (b.x0 + b.x1) / 2;
    const cz = z + (b.z0 + b.z1) / 2;
    colliders.push({ x: cx, y: y + b.height / 2, z: cz, hx: ((b.x1 - b.x0) / 2) * solid, hy: b.height / 2, hz: ((b.z1 - b.z0) / 2) * solid });
  };

  // ---- road tiles, street lights, traffic lights
  for (let r = 0; r < CITY_ROWS; r++) {
    for (let c = 0; c < CITY_COLS; c++) {
      if (!at(c, r)) continue;
      const mask = (at(c, r + 1) ? N : 0) | (at(c + 1, r) ? E : 0) | (at(c, r - 1) ? S : 0) | (at(c - 1, r) ? W : 0);
      const zone = zoneOfCol(c);
      const piece = roadPiece(mask, zone === 'commercial');
      if (!piece) continue;
      const x = cellX(c);
      const z = cellZ(r);
      roads.push({ model: piece.model, x, y: ROAD_TILE_Y, z, yaw: piece.yaw });

      const side = CITY_CELL / 2 - SIDEWALK / 2;
      if (mask === (E | W) || mask === (N | S)) {
        const alongX = mask === (E | W);
        spots.push({ x, z, heading: alongX ? Math.PI / 2 : 0, zone });
        // A lamp every 4 tiles (32 m), alternating sides. The arm reaches out along -Z as authored.
        const n = alongX ? c : r;
        if (n % 4 === 0) {
          const flip = (n / 4) % 2 === 0 ? 1 : -1;
          const lx = alongX ? x : x + side * flip;
          const lz = alongX ? z + side * flip : z;
          const k = alongX ? (flip > 0 ? 0 : 2) : flip > 0 ? 1 : 3;
          addSolid(ZONE_STYLE[zone].lamp, lx, lz, k, 0.15);
        }
      } else if (mask === 15 && zone === 'commercial') {
        // Traffic lights on the four corners, each facing the traffic coming toward it.
        for (const [sx, sz, k] of [[1, 1, 2], [-1, 1, 1], [-1, -1, 0], [1, -1, 3]] as const) {
          addSolid('roads/traffic-light', x + sx * side, z + sz * side, k, 0.6);
        }
      }
    }
  }

  // ---- blocks: every stretch of ground between roads is a rectangle
  const blocks: CityBlock[] = [];
  const seen = new Uint8Array(CITY_COLS * CITY_ROWS);
  for (let r = 0; r < CITY_ROWS; r++) {
    for (let c = 0; c < CITY_COLS; c++) {
      if (at(c, r) || seen[r * CITY_COLS + c]) continue;
      let c1 = c;
      while (c1 + 1 < CITY_COLS && !at(c1 + 1, r)) c1++;
      let r1 = r;
      while (r1 + 1 < CITY_ROWS && !at(c, r1 + 1)) r1++;
      for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) seen[rr * CITY_COLS + cc] = 1;
      blocks.push({
        zone: zoneOfCol(Math.floor((c + c1) / 2)),
        x0: origin.x + c * CITY_CELL,
        z0: origin.z + r * CITY_CELL,
        x1: origin.x + (c1 + 1) * CITY_CELL,
        z1: origin.z + (r1 + 1) * CITY_CELL,
      });
    }
  }

  // The lot and the sidewalks round it are one raised slab.
  for (const b of blocks) {
    colliders.push({
      x: (b.x0 + b.x1) / 2,
      y: KERB_HEIGHT / 2,
      z: (b.z0 + b.z1) / 2,
      hx: (b.x1 - b.x0) / 2 + SIDEWALK,
      hy: KERB_HEIGHT / 2,
      hz: (b.z1 - b.z0) / 2 + SIDEWALK,
    });
  }
  // The ring road's outer sidewalk.
  const x0 = origin.x;
  const z0 = origin.z;
  const x1 = origin.x + CITY_COLS * CITY_CELL;
  const z1 = origin.z + CITY_ROWS * CITY_CELL;
  const halfX = (x1 - x0) / 2;
  const halfZ = (z1 - z0) / 2;
  for (const s of [-1, 1]) {
    colliders.push({ x: x0 + halfX, y: KERB_HEIGHT / 2, z: z0 + halfZ + s * (halfZ - SIDEWALK / 2), hx: halfX, hy: KERB_HEIGHT / 2, hz: SIDEWALK / 2 });
    colliders.push({ x: x0 + halfX + s * (halfX - SIDEWALK / 2), y: KERB_HEIGHT / 2, z: z0 + halfZ, hx: SIDEWALK / 2, hy: KERB_HEIGHT / 2, hz: halfZ });
  }

  // ---- buildings and props on each block
  for (const block of blocks) fillBlock(block);

  function fillBlock(block: CityBlock) {
    const style = ZONE_STYLE[block.zone];
    const width = block.x1 - block.x0;
    const depth = block.z1 - block.z0;
    const taken: Rect[] = [];
    const rowNS = Math.min(style.rowDepth, depth / 2);
    const rowEW = Math.min(style.rowDepth, width / 2);

    // Rows of buildings facing each street: south and north rows run the full width; west and east
    // rows fill what's left between them.
    fillRow(block, 'S', block.x0, block.x1, block.z0, rowNS, taken);
    fillRow(block, 'N', block.x0, block.x1, block.z1, rowNS, taken);
    if (depth - 2 * rowNS > 10) {
      fillRow(block, 'W', block.z0 + rowNS, block.z1 - rowNS, block.x0, rowEW, taken);
      fillRow(block, 'E', block.z0 + rowNS, block.z1 - rowNS, block.x1, rowEW, taken);
    }

    // The middle: back gardens, a plaza, or a yard.
    const core: Rect = { x0: block.x0 + rowEW, x1: block.x1 - rowEW, z0: block.z0 + rowNS, z1: block.z1 - rowNS };
    const area = Math.max(0, core.x1 - core.x0) * Math.max(0, core.z1 - core.z0);
    const everywhere: Rect = { x0: block.x0 + 1, x1: block.x1 - 1, z0: block.z0 + 1, z1: block.z1 - 1 };
    if (block.zone === 'residential') {
      scatter(everywhere, ['suburban/tree-large', 'suburban/tree-small'], Math.round((width * depth) / 220), taken, 0.2);
    } else if (block.zone === 'commercial') {
      if (area > 100) {
        scatter(core, ['commercial/detail-parasol-a', 'commercial/detail-parasol-b'], Math.round(area / 90), taken, 0.3);
        scatter(core, ['suburban/tree-large'], Math.round(area / 150), taken, 0.2);
      }
    } else {
      const yard = area > 80 ? core : everywhere;
      scatter(yard, ['industrial/shipping-container-a', 'industrial/shipping-container-b', 'industrial/shipping-container-c'], Math.round((width * depth) / 260), taken, 1, true);
      scatter(yard, ['industrial/detail-tank', 'industrial/detail-tank-large', 'industrial/chimney-medium', 'industrial/chimney-large', 'industrial/water-tower', 'industrial/solar-panel-landscape-group'], Math.round((width * depth) / 900), taken, 0.9);
    }
  }

  function fillRow(block: CityBlock, face: keyof typeof FACE, from: number, to: number, edge: number, rowDepth: number, taken: Rect[]) {
    const style = ZONE_STYLE[block.zone];
    const k = FACE[face];
    const alongX = face === 'S' || face === 'N';
    let cursor = from + style.endGap;
    const end = to - style.endGap;
    const room = rowDepth - style.setback;
    const fits = (model: CityModelKey) => {
      const b = turnedBounds(model, k);
      const w = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
      const d = alongX ? b.z1 - b.z0 : b.x1 - b.x0;
      return w <= end - cursor && d <= room;
    };
    while (cursor < end - 4) {
      const candidates = style.buildings.filter(fits);
      const model = pickWeighted(rng, candidates, (m) => buildingWeight(block.zone, m, block));
      if (!model) break;
      const b = turnedBounds(model, k);
      // Origin such that the front sits `setback` behind the sidewalk and the side starts at cursor.
      let ox: number;
      let oz: number;
      if (alongX) {
        ox = cursor - b.x0;
        oz = face === 'S' ? edge + style.setback - b.z0 : edge - style.setback - b.z1;
        cursor += b.x1 - b.x0;
      } else {
        oz = cursor - b.z0;
        ox = face === 'W' ? edge + style.setback - b.x0 : edge - style.setback - b.x1;
        cursor += b.z1 - b.z0;
      }
      const rect = { x0: ox + b.x0, x1: ox + b.x1, z0: oz + b.z0, z1: oz + b.z1 };
      if (taken.some((t) => overlaps(t, rect))) {
        cursor += 2;
        continue;
      }
      taken.push(rect);
      addSolid(model, ox, oz, k);
      const gap = between(rng, style.gap[0], style.gap[1]);
      // A tree in the front garden, now and then.
      if (block.zone === 'residential' && rng() < 0.45) {
        const t = cursor + gap / 2;
        const inset = style.setback / 2;
        const tx = alongX ? t : face === 'W' ? edge + inset : edge - inset;
        const tz = alongX ? (face === 'S' ? edge + inset : edge - inset) : t;
        if (t < end) {
          addSolid(rng() < 0.5 ? 'suburban/tree-large' : 'suburban/tree-small', tx, tz, intBetween(rng, 0, 3), 0.2);
          taken.push({ x0: tx - 1, x1: tx + 1, z0: tz - 1, z1: tz + 1 });
        }
      }
      cursor += gap;
    }
  }

  function buildingWeight(zone: CityZone, model: CityModelKey, block: CityBlock): number {
    if (zone !== 'commercial') return 1;
    // Towers gather in the middle of the commercial district.
    const t = Math.max(0, 1 - Math.abs((block.x0 + block.x1) / 2 - centreX) / commercialHalf);
    if (model.includes('skyscraper')) return 0.1 + 4 * t * t;
    const height = CITY_MODELS[model].max[1];
    return height > 2 ? 0.5 + 1.5 * t : 1.4 - t;
  }

  function scatter(area: Rect, models: CityModelKey[], count: number, taken: Rect[], solid: number, rows = false) {
    if (area.x1 - area.x0 < 3 || area.z1 - area.z0 < 3) return;
    for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
      const model = pick(rng, models);
      const k = rows ? 2 * intBetween(rng, 0, 1) + (area.x1 - area.x0 > area.z1 - area.z0 ? 1 : 0) : intBetween(rng, 0, 3);
      const b = turnedBounds(model, k);
      const x = between(rng, area.x0 - b.x0, area.x1 - b.x1);
      const z = between(rng, area.z0 - b.z0, area.z1 - b.z1);
      if (!(x === x) || !(z === z) || area.x1 - area.x0 < b.x1 - b.x0 || area.z1 - area.z0 < b.z1 - b.z0) continue;
      const rect = { x0: x + b.x0 - 1, x1: x + b.x1 + 1, z0: z + b.z0 - 1, z1: z + b.z1 + 1 };
      if (taken.some((t) => overlaps(t, rect))) continue;
      taken.push(rect);
      addSolid(model, x, z, k, solid);
      // Containers come stacked two high now and then.
      if (rows && rng() < 0.3) {
        const top = pick(rng, models);
        addSolid(top, x, z, k, solid, KERB_HEIGHT + b.height);
      }
      i++;
    }
  }

  return {
    seed,
    origin,
    bounds: { x0, z0, x1, z1 },
    districts: CITY_ZONES.map((zone, i) => ({ zone, x0: origin.x + bounds[i] * CITY_CELL, x1: origin.x + (bounds[i + 1] + 1) * CITY_CELL })),
    roads,
    objects,
    blocks,
    colliders,
    spots,
  };
}

/**
 * Street positions strictly between `from` and `to` (both streets), splitting the space into blocks
 * whose interiors fall in `size` (tiles) where possible, with a little jitter.
 */
function splitSpan(rng: Rng, from: number, to: number, size: [number, number]): number[] {
  const inner = to - from - 1;
  const average = (size[0] + size[1]) / 2;
  const blocks = Math.max(1, Math.round((inner + 1) / (average + 1)));
  const out: number[] = [];
  let last = from;
  for (let i = 1; i < blocks; i++) {
    const ideal = from + Math.round((i * (to - from)) / blocks);
    const at = ideal + intBetween(rng, -1, 1);
    // Keep at least three tiles of ground on each side.
    const clamped = Math.min(Math.max(at, last + 4), to - 4 * (blocks - i));
    out.push(clamped);
    last = clamped;
  }
  return out;
}

/** Which district a world X falls in. */
export function cityZoneAt(city: City, x: number): CityZone | undefined {
  return city.districts.find((d) => x >= d.x0 && x < d.x1)?.zone;
}

/** The city every game uses unless the room picks another seed. */
export const CITY_SEED = 1;
