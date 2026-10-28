// Floor plans and furnishing for the buildings you can go into. Each plan is a set of rooms that tile
// the building on one or more levels (see interior-builder.ts for how walls, floors and stairs follow
// from that), and each room is dressed for what it is: a living room round its TV, a kitchen run with
// its wall cabinets, a bedroom round its bed, hospital wards, bowling lanes, a stage with its lights...
//
// Plans vary per building: they're mirrored half the time, rooms swap purposes (a study or a kids'
// room), wallpapers and floors come from palettes that suit each room. Low-poly furniture is Kenney's
// Furniture Kit and Quaternius' house interior pieces (both CC0), Kenney's mini kits and Food Kit, and
// things neither has (IV stands, bowling lanes, stage lights) are built from coloured shapes.

import { type Finish, type Furniture, INTERIOR_HEIGHT, InteriorBuilder, type InteriorPlace, type PlanRoom, WALL_HEIGHT, furnitureSize } from './interior-builder';

// ------------------------------------------------------------------ finishes
// Wallpapers: Kenney's pattern tiles in bold, saturated colours (the "extra" tiles are pictures).
export const PAPERS = {
  coral: { pattern: 'extra-078.png', color: '#ff8a6b', ink: '#ffb59f', tile: 0.9 },
  teal: { pattern: 'extra-073.png', color: '#1fb5a8', ink: '#5fd6c9', tile: 0.9 },
  mustard: { pattern: 'extra-036.png', color: '#f2b632', ink: '#f7cf6d', tile: 0.7 },
  cobalt: { pattern: 'extra-041.png', color: '#3a6fd8', ink: '#6d97ea', tile: 0.9 },
  mint: { pattern: 'extra-009.png', color: '#9fe3c4', ink: '#c9f1df', tile: 1.0 },
  blush: { pattern: 'extra-059.png', color: '#ffb3c7', ink: '#ffd6e1', tile: 0.7 },
  sage: { pattern: 'extra-021.png', color: '#a7c98a', ink: '#c8e0b4', tile: 0.9 },
  lilac: { pattern: 'extra-006.png', color: '#b79cf0', ink: '#d6c7f7', tile: 0.8 },
  cream: { pattern: 'extra-080.png', color: '#f6ecd6', ink: '#e6d3ac', tile: 1.0 },
  sky: { pattern: 'extra-005.png', color: '#7cc6f2', ink: '#d9f0fd', tile: 1.2 },
  night: { pattern: 'extra-003.png', color: '#2b3a7a', ink: '#ffe08a', tile: 1.0 },
  stars: { pattern: 'extra-001.png', color: '#ffd36b', ink: '#fff0c2', tile: 0.8 },
  sun: { pattern: 'extra-074.png', color: '#ffb547', ink: '#ffd38a', tile: 1.2 },
  brick: { pattern: 'extra-008.png', color: '#c8644a', ink: '#de8a72', tile: 1.2 },
  office: { pattern: 'extra-023.png', color: '#dfe7f1', ink: '#c3d1e3', tile: 0.8 },
  slate: { pattern: 'extra-040.png', color: '#4a5568', ink: '#5e6b80', tile: 0.9 },
  clinic: { pattern: 'extra-031.png', color: '#e6f5f3', ink: '#bfe3de', tile: 0.6 },
  ward: { pattern: 'extra-009.png', color: '#d4ecf7', ink: '#b3dcef', tile: 1.0 },
  arcade: { pattern: 'extra-002.png', color: '#2a1458', ink: '#ff5cd6', tile: 1.1 },
  neon: { pattern: 'extra-077.png', color: '#16123a', ink: '#33e1ff', tile: 1.0 },
  velvet: { pattern: 'extra-073.png', color: '#7a1f3d', ink: '#a8355c', tile: 0.9 },
  gold: { pattern: 'extra-080.png', color: '#2d2440', ink: '#d9a93a', tile: 1.1 },
  candy: { pattern: 'extra-037.png', color: '#fbeee6', ink: '#e65a5a', tile: 0.6 },
  produce: { pattern: 'extra-054.png', color: '#eaf4e4', ink: '#b5d8a3', tile: 0.8 },
  tile: { pattern: 'thin-0009.png', color: '#f3f6f8', ink: '#c9d3db', tile: 0.6 },
  aqua: { pattern: 'thin-0009.png', color: '#7fd6e6', ink: '#a9e6f0', tile: 0.5 },
  white: { pattern: 'thin-0009.png', color: '#f7f7f4', ink: '#ececea', tile: 2 },
} satisfies Record<string, Finish>;
export const FLOORS = {
  oak: { pattern: 'thick-0009.png', color: '#c08a55', ink: '#a06c3a', tile: 1.4 },
  walnut: { pattern: 'thick-0005.png', color: '#7e4f30', ink: '#653d22', tile: 1.2 },
  ash: { pattern: 'thick-0009.png', color: '#dcc19a', ink: '#c4a67c', tile: 1.4 },
  tiles: { pattern: 'thin-0009.png', color: '#f1eee6', ink: '#c6bfb0', tile: 1.0 },
  mint: { pattern: 'thin-0009.png', color: '#cdeeea', ink: '#a8d8d2', tile: 1.2 },
  slate: { pattern: 'thin-0011.png', color: '#5c6676', ink: '#4b5463', tile: 1.6 },
  lino: { pattern: 'thin-0010.png', color: '#d8d2c4', ink: '#bfb7a4', tile: 1.5 },
  checker: { pattern: 'extra-060.png', color: '#f4f0e6', ink: '#24242c', tile: 1.6 },
  carpet: { pattern: 'thin-0004.png', color: '#5b7bd5', ink: '#4a68bd', tile: 0.9 },
  rose: { pattern: 'thin-0004.png', color: '#e07a8f', ink: '#c96679', tile: 0.9 },
  moss: { pattern: 'thin-0004.png', color: '#6aa86a', ink: '#5a945a', tile: 0.9 },
  galaxy: { pattern: 'extra-002.png', color: '#1d1145', ink: '#6a46e6', tile: 1.4 },
  marble: { pattern: 'thin-0002.png', color: '#f4f1ec', ink: '#ddd6cc', tile: 1.8 },
  vinyl: { pattern: 'thin-0010.png', color: '#bfe6df', ink: '#a5d4cc', tile: 1.5 },
  lanes: { pattern: 'thick-0009.png', color: '#e8c48a', ink: '#d4ab6c', tile: 0.6 },
  deck: { pattern: 'thick-0009.png', color: '#b07a4c', ink: '#8f5f37', tile: 1.0 },
  turf: { pattern: 'extra-021.png', color: '#5fbf5a', ink: '#7fd47a', tile: 0.8 },
  concrete: { pattern: 'thin-0011.png', color: '#c9ccd2', ink: '#b7bbc3', tile: 2.0 },
} satisfies Record<string, Finish>;
const LIVING: Finish[] = [PAPERS.coral, PAPERS.teal, PAPERS.mustard, PAPERS.cobalt, PAPERS.sage, PAPERS.lilac, PAPERS.cream, PAPERS.sun];
const BEDROOM: Finish[] = [PAPERS.mint, PAPERS.blush, PAPERS.lilac, PAPERS.sky, PAPERS.night, PAPERS.cream, PAPERS.teal];
const KIDS: Finish[] = [PAPERS.stars, PAPERS.sky, PAPERS.night, PAPERS.blush, PAPERS.mint];
const WOOD: Finish[] = [FLOORS.oak, FLOORS.walnut, FLOORS.ash];
const SOFT: Finish[] = [FLOORS.carpet, FLOORS.rose, FLOORS.moss, FLOORS.ash];
// A home's walls are one finish throughout, in deep colours: plain paint, or a pattern only a shade
// lighter than its ground.
const DARK_PAINT = ['#2f4858', '#3d2c4e', '#264653', '#4a3728', '#2b3a55', '#2f4a35', '#5a2e36', '#33373f'];
const DARK_PAPERS: Finish[] = [
  { pattern: 'extra-073.png', color: '#264653', ink: '#2e5361', tile: 0.9 },
  { pattern: 'extra-001.png', color: '#2b3a55', ink: '#344563', tile: 0.8 },
  { pattern: 'extra-078.png', color: '#3d2c4e', ink: '#48365b', tile: 0.9 },
  { pattern: 'extra-021.png', color: '#2f4a35', ink: '#38563f', tile: 0.9 },
  { pattern: 'extra-080.png', color: '#5a2e36', ink: '#663741', tile: 1.0 },
  { pattern: 'extra-023.png', color: '#33373f', ink: '#3c414a', tile: 0.8 },
  { pattern: 'extra-041.png', color: '#4a3728', ink: '#554030', tile: 0.9 },
];
const homeWalls = (b: InteriorBuilder) => (b.random() < 0.5 ? b.pick(DARK_PAINT) : b.pick(DARK_PAPERS));

/** Bright colours for pictures, cushions, signs. */
const POP = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#2ec4b6', '#f15bb5'];

// ------------------------------------------------------------------ helpers

type Wall = 'back' | 'front' | 'left' | 'right';
/** Positions in a room measured from one of its walls: u along it, v out from it into the room. */
function wallFrame(r: PlanRoom, side: Wall) {
  const horizontal = side === 'back' || side === 'front';
  const [u0, u1] = horizontal ? [r.x0, r.x1] : [r.z0, r.z1];
  const at = (u: number, v: number): [number, number] =>
    side === 'back' ? [u, r.z0 + v] : side === 'front' ? [u, r.z1 - v] : side === 'left' ? [r.x0 + v, u] : [r.x1 - v, u];
  /** The turn that faces out from this wall, into the room. */
  const out = { back: 0, front: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[side];
  return { at, out, u0, u1, mid: (u0 + u1) / 2, length: u1 - u0, depth: horizontal ? r.z1 - r.z0 : r.x1 - r.x0 };
}
/** A plan offset (ox, oz) turned by `turn` (0 = toward the front). */
const turned = (ox: number, oz: number, turn: number): [number, number] => [ox * Math.cos(turn) + oz * Math.sin(turn), -ox * Math.sin(turn) + oz * Math.cos(turn)];
const PARTITION_FACE = 0.1;

// The premium furniture (scripts/city/pack_kenney.mjs: 'p/<pack>/<model>'), by what it's for. Rooms pick
// from these lists, so homes differ; Kenney's kit fills in what no premium pack has (kitchen cupboards,
// showers, mirrors, counters).
const SOFAS: Furniture[] = ['p/singles/sofa', 'p/singles/sofa-2', 'p/singles/couch-2', 'p/house/couch-large', 'p/cafe/couch-medium'];
const BIG_SOFAS: Furniture[] = ['p/singles/couch', 'p/house/l-couch'];
const ARMCHAIRS: Furniture[] = ['p/cafe/couch-small', 'p/office/couch-small'];
const RUGS: Furniture[] = ['p/office/rug', 'p/office/rug-round', 'p/cafe/rug', 'p/cafe/round-rug'];
const COFFEE_TABLES: Furniture[] = ['p/office/coffee-table', 'p/house/table-round-small'];
const FLOOR_LAMPS: Furniture[] = ['p/house/light-stand', 'p/house/light-floor', 'p/office/lamp'];
const TABLE_LAMPS: Furniture[] = ['p/house/table-lamp', 'p/house/lamp'];
const PLANTS: Furniture[] = ['p/house/houseplant', 'p/house/houseplant-2', 'p/cafe/houseplant', 'p/cafe/houseplant-3', 'p/office/potted-plant', 'p/office/plant-white-pot', 'p/house/cactus'];
const BEDS: Furniture[] = ['p/singles/bed', 'p/singles/bed-2', 'p/singles/bed-3', 'p/singles/double-bed'];
const NIGHTSTANDS: Furniture[] = ['p/house/night-stand', 'p/house/night-stand-2'];
const ART: Furniture[] = ['p/office/wall-art-02', 'p/office/wall-art-03', 'p/office/wall-art-05', 'p/office/wall-art-06'];
/** How tall a piece is: for things standing on it. */
const top = (name: Furniture) => furnitureSize(name)[1];

/** A framed print on a wall (never the front one: the camera looks in over it, so it's cut away). */
function art(b: InteriorBuilder, r: PlanRoom, side: Wall, along: number, y = 1.25) {
  if (side === 'front') return;
  const f = wallFrame(r, side);
  const [x, z] = f.at(along, PARTITION_FACE + 0.03);
  b.put(b.pick(ART), r.level, x, z, f.out, y);
}
function plant(b: InteriorBuilder, level: number, x: number, z: number) {
  b.put(b.pick(PLANTS), level, x, z, b.random() * 6);
}
/** A plate of something and a drink, on a table `y` high. */
function meal(b: InteriorBuilder, level: number, x: number, z: number, y: number, dishes: readonly Furniture[] = DISHES) {
  b.put('k/food/plate', level, x, z, b.random() * 6, y);
  b.put(b.pick(dishes), level, x, z, b.random() * 6, y + 0.02);
  b.put(b.random() < 0.5 ? 'k/food/soda' : 'k/food/cup-coffee', level, x + 0.22, z + 0.12, b.random() * 6, y);
}
const DISHES: Furniture[] = ['k/food/burger', 'k/food/pizza', 'k/food/salad', 'k/food/sandwich', 'k/food/pancakes', 'k/food/cake', 'k/food/hot-dog', 'k/food/croissant'];
const SWEETS: Furniture[] = ['k/food/donut-sprinkles', 'k/food/muffin', 'k/food/croissant', 'k/food/cake'];

/**
 * A sofa facing the TV on its sideboard on `tvWall`, floor speakers either side, a coffee table on a
 * rug, an armchair, a floor lamp, plants in the corners, prints and a clock on the wall.
 */
function living(b: InteriorBuilder, r: PlanRoom, tvWall: Wall) {
  const f = wallFrame(r, tvWall);
  const L = r.level;
  const mid = f.mid;
  const stand: Furniture = 'p/house/drawer-2';
  b.against(stand, r, tvWall, mid);
  const [tx, tz] = f.at(mid, 0.3);
  b.put('k/furniture/televisionModern', L, tx, tz, f.out, top(stand));
  for (const s of [-1, 1]) b.against('p/cafe/speaker', r, tvWall, mid + s * 1.35);
  const dist = Math.min(3.4, f.depth - 1.2);
  const sofa = f.length >= 6 && b.random() < 0.6 ? b.pick(BIG_SOFAS) : b.pick(SOFAS);
  const [sx, sz] = f.at(mid, dist);
  b.put(sofa, L, sx, sz, f.out + Math.PI);
  const [rx, rz] = f.at(mid, dist * 0.6);
  b.put(b.pick(RUGS), L, rx, rz, f.out);
  const table = b.pick(COFFEE_TABLES);
  const [cx, cz] = f.at(mid, dist * 0.56);
  b.put(table, L, cx, cz, f.out);
  b.put(b.random() < 0.5 ? 'p/cafe/fruit-bowl' : 'k/furniture/books', L, cx + 0.15, cz, b.random(), top(table));
  if (mid - 2.4 > f.u0 + 0.7) {
    const [ax, az] = f.at(mid - 2.3, dist * 0.55);
    b.put(b.pick(ARMCHAIRS), L, ax, az, f.out + Math.PI / 2 + 0.4);
  }
  if (mid + 2.5 < f.u1 - 0.4) {
    const [lx, lz] = f.at(mid + 2.4, dist + 0.2);
    b.put(b.pick(FLOOR_LAMPS), L, lx, lz, f.out + Math.PI);
  }
  const [p1x, p1z] = f.at(f.u0 + 0.45, 0.45);
  plant(b, L, p1x, p1z);
  const [p2x, p2z] = f.at(f.u1 - 0.45, 0.45);
  plant(b, L, p2x, p2z);
  art(b, r, tvWall, mid - 2.3);
  art(b, r, tvWall, mid + 2.3);
  if (tvWall !== 'front') {
    const [kx, kz] = f.at(mid, PARTITION_FACE + 0.03);
    b.put('p/cafe/analog-clock', L, kx, kz, f.out, 2.1);
  }
}

/**
 * A run of kitchen units along a wall, from `from` to `to`: the fridge, a sink, the dishwasher, the
 * oven with its hood, worktops between, cupboards over, a coffee machine, a microwave, fruit.
 */
function kitchen(b: InteriorBuilder, r: PlanRoom, side: Wall, from: number, to: number) {
  const L = r.level;
  const f = wallFrame(r, side);
  const units: Furniture[] = ['p/house/kitchen-fridge', 'k/furniture/kitchenCabinet', 'p/house/kitchen-sink', 'p/cafe/dishwasher', 'k/furniture/kitchenCabinetDrawer', 'p/house/oven', 'k/furniture/kitchenCabinet', 'k/furniture/kitchenCabinetDrawer', 'k/furniture/kitchenCabinet'];
  const extras: Furniture[] = ['p/cafe/coffee-machine', 'p/cafe/kitchen-microwave', 'p/cafe/fruit-bowl', 'k/furniture/toaster'];
  let t = from;
  let extra = 0;
  for (const unit of units) {
    const [uw] = furnitureSize(unit);
    if (t + uw > to + 0.01) break;
    const along = t + uw / 2;
    t += uw;
    if (!b.against(unit, r, side, along)) continue;
    if (unit === 'p/house/oven') b.against('k/furniture/hoodModern', r, side, along, 1.6);
    else if (unit !== 'p/house/kitchen-fridge') b.against('k/furniture/kitchenCabinetUpper', r, side, along, 1.55);
    if (unit.startsWith('k/furniture/kitchenCabinet') && extra < extras.length) {
      const [x, z] = f.at(along, 0.32);
      b.put(extras[extra++], L, x, z, f.out, top(unit));
    }
  }
}

/** A kitchen island: bar counters in a row with stools along one side. */
function island(b: InteriorBuilder, level: number, x: number, z: number, units: number, turn: number) {
  const stool = b.pick(['p/cafe/barstool', 'p/house/stool'] as const);
  for (let k = 0; k < units; k++) {
    const [ox, oz] = turned((k - (units - 1) / 2) * 0.9, 0, turn);
    b.put('k/furniture/kitchenBar', level, x + ox, z + oz, turn);
    const [sx, sz] = turned((k - (units - 1) / 2) * 0.9, 0.65, turn);
    b.put(stool, level, x + sx, z + sz, turn + Math.PI);
    if (b.random() < 0.4) b.put(b.pick(['k/food/cup-coffee', 'k/food/soda', 'k/food/muffin'] as const), level, x + ox, z + oz, b.random() * 6, 0.88);
  }
  const [fx, fz] = turned(0, -0.05, turn);
  b.put('p/cafe/fruit-bowl', level, x + fx, z + fz, 0, 0.88);
}

/** A dining table with chairs round it and a meal at most places. */
function dining(b: InteriorBuilder, level: number, x: number, z: number, turn: number, seats: 4 | 6 = 4) {
  const table: Furniture = seats === 6 ? 'p/house/table-round-large' : b.pick(['p/office/table', 'p/house/table-round-small-2'] as const);
  b.put(table, level, x, z, turn);
  const along = seats === 6 ? [-0.6, 0, 0.6] : [-0.38, 0.38];
  const [, height, depth] = furnitureSize(table);
  for (const u of along) {
    for (const s of [-1, 1]) {
      const [cx, cz] = turned(u, s * (depth / 2 + 0.32), turn);
      b.put('p/house/chair', level, x + cx, z + cz, turn + (s > 0 ? Math.PI : 0));
      if (b.random() < 0.8) {
        const [mx, mz] = turned(u, s * Math.min(0.22, depth / 4), turn);
        meal(b, level, x + mx, z + mz, height);
      }
    }
  }
}

/** A bed against `bedWall` with bedside tables and lamps, a dresser, a rug, a desk if there's room. */
function bedroom(b: InteriorBuilder, r: PlanRoom, bedWall: Wall, double: boolean, kids = false) {
  const L = r.level;
  const f = wallFrame(r, bedWall);
  const bed: Furniture = kids ? b.pick(['p/house/bed-single', 'p/house/bunk-bed'] as const) : double ? b.pick(BEDS) : 'p/house/bed-single';
  const [bw, , bd] = furnitureSize(bed);
  const at = f.mid + (kids ? -f.length * 0.18 : 0);
  b.against(bed, r, bedWall, at);
  const stand = b.pick(NIGHTSTANDS);
  for (const s of [-1, 1]) {
    const u = at + s * (bw / 2 + 0.35);
    if (u < f.u0 + 0.3 || u > f.u1 - 0.3) continue;
    if (!b.against(stand, r, bedWall, u)) continue;
    const [lx, lz] = f.at(u, 0.3);
    b.put(b.pick(TABLE_LAMPS), L, lx, lz, f.out, top(stand));
  }
  const [rx, rz] = f.at(at, bd + 0.5);
  b.put(b.pick(RUGS), L, rx, rz, f.out);
  if (kids) {
    const [tx, tz] = f.at(at + bw / 2 + 0.9, bd * 0.6);
    b.put('k/furniture/bear', L, tx, tz, f.out + 0.5);
  }
  art(b, r, bedWall, at, 1.45);
  // A dresser (or a tall shelf) on the wall to one side, and a desk on the other.
  const sides: Wall[] = bedWall === 'back' || bedWall === 'front' ? ['left', 'right'] : ['back', 'front'];
  const [w1, w2] = b.random() < 0.5 ? sides : [sides[1], sides[0]];
  const g1 = wallFrame(r, w1);
  const dresser = b.pick(['p/house/drawer', 'p/house/drawer-3', 'p/house/shelf-large'] as const);
  if (b.against(dresser, r, w1, g1.mid) && dresser !== 'p/house/shelf-large') {
    const [dx, dz] = g1.at(g1.mid + 0.3, 0.25);
    plant(b, L, dx, dz);
  }
  const g2 = wallFrame(r, w2);
  if (g2.length > 2.6) b.against(kids ? 'p/office/desk-3' : b.pick(['p/office/desk-3', 'p/office/standing-desk'] as const), r, w2, g2.mid);
  const [px, pz] = f.at(f.u1 - 0.4, f.depth - 0.45);
  plant(b, L, px, pz);
}

/** A freestanding bath (or a shower), toilet, basin under its mirror, towel rail, toilet roll. */
function bathroom(b: InteriorBuilder, r: PlanRoom) {
  const L = r.level;
  const walls: Wall[] = ['back', 'front', 'left', 'right'];
  const long = walls.sort((p, q) => wallFrame(r, q).length - wallFrame(r, p).length)[0];
  const f = wallFrame(r, long);
  if (f.length >= 3.4) b.against('p/house/bathtub', r, long, f.u0 + 1.0);
  else b.against('k/furniture/shower', r, long, f.u0 + 0.65);
  const sink = f.length >= 3.4 ? f.u0 + 2.5 : f.u0 + 1.75;
  if (sink < f.u1 - 0.4 && b.against('p/office/bathroom-sink', r, long, sink, 0.0)) b.against('k/furniture/bathroomMirror', r, long, sink, 1.3);
  const other: Wall = long === 'back' ? 'front' : long === 'front' ? 'back' : long === 'left' ? 'right' : 'left';
  const g = wallFrame(r, other);
  const toilet = b.against('p/office/toilet', r, other, g.u0 + 0.55) ? g.u0 + 0.55 : b.against('p/office/toilet', r, other, g.u1 - 0.55) ? g.u1 - 0.55 : undefined;
  if (toilet !== undefined) b.against('p/office/bathroom-toilet-paper', r, other, toilet + 0.5, 0.7);
  if (f.length >= 4.2) b.against('k/furniture/shower', r, long, f.u1 - 0.65);
  b.against('p/office/towel-rack', r, other, g.mid, 1.1);
  const [px, pz] = g.at(g.u1 - 0.4, 0.3);
  b.put('p/house/houseplant-2', L, px, pz, b.random() * 6);
  const [mx, mz] = f.at(f.mid, Math.min(1.5, f.depth / 2));
  b.put('p/cafe/rug', L, mx, mz, f.out);
}

/** A desk with its computer and chair, shelves of books, a reading chair under a lamp. */
function study(b: InteriorBuilder, r: PlanRoom, deskWall: Wall) {
  const L = r.level;
  const f = wallFrame(r, deskWall);
  b.against(b.pick(['p/office/desk-3', 'p/office/standing-desk'] as const), r, deskWall, f.mid);
  const back: Wall = deskWall === 'back' ? 'front' : deskWall === 'front' ? 'back' : deskWall === 'left' ? 'right' : 'left';
  const g = wallFrame(r, back);
  b.against('p/house/shelf-large', r, back, g.mid - 1.0);
  b.against('p/office/shelf', r, back, g.mid + 1.0);
  const [ax, az] = f.at(f.u0 + 0.9, f.depth * 0.6);
  b.put(b.pick(ARMCHAIRS), L, ax, az, f.out + 0.8);
  const [lx, lz] = f.at(f.u0 + 0.35, f.depth * 0.6 - 0.8);
  b.put(b.pick(FLOOR_LAMPS), L, lx, lz, 0);
  const [px, pz] = f.at(f.u1 - 0.4, 0.4);
  plant(b, L, px, pz);
  art(b, r, deskWall, f.mid - 1.6, 1.5);
  const [dx, dz] = f.at(f.u1 - 1.2, PARTITION_FACE + 0.03);
  b.put('p/office/dartboard', L, dx, dz, f.out, 1.5);
}

function laundry(b: InteriorBuilder, r: PlanRoom, side: Wall) {
  const f = wallFrame(r, side);
  b.against('p/house/washing-machine', r, side, f.u0 + 0.5);
  b.against('k/furniture/dryer', r, side, f.u0 + 1.4);
  b.against('k/furniture/kitchenCabinetUpper', r, side, f.u0 + 0.95, 1.55);
  b.against('p/office/trash-bin', r, side, f.u1 - 0.35);
  b.against('p/office/wall-shelf', r, side, f.u0 + 1.0, 1.7);
}


// ------------------------------------------------------------------ homes

export type HomeVariant = 'studio' | 'flat' | 'duplex';
export interface HomePlan {
  builder: InteriorBuilder;
  name: string;
}

/** A studio: one room with the bed behind a low divider, the kitchen along one side, a shower room. */
export function studio(place: InteriorPlace, random: () => number): InteriorBuilder {
  const b = new InteriorBuilder(place, 9, 8, 1, random, random() < 0.5);
  b.wallFinish = homeWalls(b);
  const paper = b.pick(LIVING);
  const floor = b.pick(WOOD);
  const bath = b.room('bathroom', 0, 2, -4, 4.5, -1.3, FLOORS.tiles, b.pick([PAPERS.tile, PAPERS.aqua]));
  const main = b.room('studio', 0, -4.5, -4, 2, 4, floor, paper, { zone: 'studio' });
  const galley = b.room('kitchen', 0, 2, -1.3, 4.5, 4, FLOORS.checker, paper, { zone: 'studio' });
  b.link(0, -0.5, 4);
  b.link(0, 3.25, -1.3, 0.9);
  // The sleeping corner at the back, behind a low bookcase.
  b.against('k/furniture/bedDouble', main, 'back', -2.6);
  b.against('p/house/night-stand', main, 'back', -4.1);
  b.put('p/house/table-lamp', 0, -4.1, -3.7, 0, 0.55);
  b.against('p/house/night-stand', main, 'back', -1.1);
  b.put('p/office/rug-round', 0, -2.6, -1.0, 0);
  for (const x of [-3.0, -2.16]) b.put('k/furniture/bookcaseOpenLow', 0, x, -0.45, Math.PI);
  b.put('k/furniture/books', 0, -3.0, -0.45, 0.3, 0.84);
  b.put('k/furniture/plantSmall1', 0, -2.16, -0.45, 0, 0.84);
  b.against('k/furniture/bookcaseClosedDoors', main, 'left', -1.0);
  art(b, main, 'back', -2.6, 1.55);
  // The lounge in front.
  b.against('p/house/drawer-2', main, 'left', 2.0);
  b.put('k/furniture/televisionModern', 0, -4.2, 2.0, Math.PI / 2, 0.65);
  b.put('p/singles/sofa', 0, -1.4, 2.0, -Math.PI / 2);
  b.put('p/office/rug', 0, -2.7, 2.0, Math.PI / 2);
  b.put('p/house/table-round-small', 0, -2.75, 2.0, 0);
  b.put('p/office/coat-rack', 0, 1.4, 3.4, 0);
  plant(b, 0, -4.05, 3.55);
  art(b, main, 'left', 0.4, 1.4);
  // The galley kitchen and a little table.
  kitchen(b, galley, 'right', -1.2, 2.6);
  b.put('p/house/table-round-small-2', 0, 2.75, 3.05, 0);
  b.put('p/house/stool', 0, 2.75, 2.25, 0);
  meal(b, 0, 2.75, 3.05, 0.57, SWEETS);
  // The shower room.
  b.against('k/furniture/shower', bath, 'back', 3.9);
  b.against('p/office/toilet', bath, 'left', -3.2);
  b.against('p/office/bathroom-sink', bath, 'right', -2.4);
  b.against('k/furniture/bathroomMirror', bath, 'right', -2.4, 1.25);
  b.spot(0, -1.0, 1.0, 0, 'visitor');
  b.finish();
  return b;
}

/** A flat: an open-plan living room and kitchen across the front, two bedrooms and a bathroom behind. */
export function flat(place: InteriorPlace, random: () => number): InteriorBuilder {
  const b = new InteriorBuilder(place, 13, 10, 1, random, random() < 0.5);
  b.wallFinish = homeWalls(b);
  const paper = b.pick(LIVING);
  const floor = b.pick(WOOD);
  const lounge = b.room('living', 0, -6.5, -0.5, -1.2, 5, floor, paper, { zone: 'day' });
  const hall = b.room('hall', 0, -1.2, -0.5, 1.2, 5, floor, paper, { zone: 'day' });
  const cook = b.room('kitchen', 0, 1.2, -0.5, 6.5, 5, b.pick([FLOORS.tiles, FLOORS.checker]), paper, { zone: 'day' });
  const bed1 = b.room('bedroom', 0, -6.5, -5, -1.5, -0.5, b.pick(SOFT), b.pick(BEDROOM));
  const bath = b.room('bathroom', 0, -1.5, -5, 1.5, -0.5, FLOORS.tiles, b.pick([PAPERS.tile, PAPERS.aqua]));
  const kids = random() < 0.5;
  const bed2 = b.room(kids ? 'kids' : 'study', 0, 1.5, -5, 6.5, -0.5, kids ? FLOORS.moss : b.pick(WOOD), kids ? b.pick(KIDS) : PAPERS.slate);
  b.link(0, 0, 5);
  b.link(0, -3.6, -0.5);
  b.link(0, 0, -0.5);
  b.link(0, 3.6, -0.5);
  living(b, lounge, 'left');
  kitchen(b, cook, 'right', -0.4, 4.6);
  dining(b, 0, 2.7, 2.4, Math.PI / 2, 4);
  b.put('p/office/coat-rack', 0, 0.8, 4.4, 0);
  b.put('k/furniture/rugDoormat', 0, 0, 4.5, 0);
  b.put('p/house/drawer-3', 0, -0.85, 1.8, Math.PI / 2);
  b.put('k/furniture/plantSmall3', 0, -0.85, 1.8, 0, 0.81);
  bedroom(b, bed1, 'back', true);
  bathroom(b, bath);
  if (kids) bedroom(b, bed2, 'back', false, true);
  else study(b, bed2, 'back');
  b.spot(0, -3.4, 2.5, 0, 'visitor');
  b.spot(0, 3.2, 1.2, 0, 'visitor');
  b.finish();
  return b;
}

/**
 * A duplex: living room, kitchen and dining across the front of the ground floor, a den, a cloakroom and
 * a laundry behind, the stairs up to a landing with the main bedroom and its own bathroom, a second
 * bedroom, and (if `roof`) the door up to the roof terrace.
 */
export function duplex(place: InteriorPlace, random: () => number, roof: boolean): InteriorBuilder {
  const b = new InteriorBuilder(place, 14, 11, 2, random, random() < 0.5);
  b.wallFinish = homeWalls(b);
  const paper = b.pick(LIVING);
  const floor = b.pick(WOOD);
  // Ground floor.
  const lounge = b.room('living', 0, -7, -0.5, 1, 5.5, floor, paper, { zone: 'day' });
  const cook = b.room('kitchen', 0, 1, -0.5, 7, 5.5, b.pick([FLOORS.marble, FLOORS.checker, FLOORS.tiles]), paper, { zone: 'day' });
  const hallway = b.room('stairs', 0, -7, -5.5, -3, -0.5, floor, paper, { zone: 'day' });
  // The room behind the living room is the family's: a TV den, a library or the children's playroom.
  const denKind = b.pick(['den', 'library', 'playroom'] as const);
  const denPaper = denKind === 'playroom' ? b.pick(KIDS) : denKind === 'library' ? b.pick([PAPERS.sage, PAPERS.velvet, PAPERS.cream]) : b.pick([PAPERS.cobalt, PAPERS.night, PAPERS.velvet, PAPERS.slate]);
  const den = b.room(denKind, 0, -3, -5.5, 3.5, -0.5, denKind === 'library' ? b.pick(WOOD) : b.pick(SOFT), denPaper);
  const wc = b.room('bathroom', 0, 3.5, -5.5, 7, -2.5, FLOORS.tiles, PAPERS.aqua);
  const wash = b.room('laundry', 0, 3.5, -2.5, 7, -0.5, FLOORS.lino, PAPERS.white);
  b.link(0, 0.4, 5.5);
  b.link(0, 0, -0.5);
  b.link(0, 3.5, -4.2, 0.9);
  b.link(0, 5.3, -0.5, 0.9);
  b.stairs(0, -6.3, 0.8, 'back');
  // The living room round the TV on the side wall, a fire by the front windows (or a reading corner);
  // the kitchen with an island and a long table, or a round one in the window.
  living(b, lounge, 'front');
  if (random() < 0.6) b.against('p/house/fireplace', lounge, 'left', 3.6);
  else {
    b.put('k/furniture/loungeChairRelax', 0, -5.2, 4.4, Math.PI + 0.4);
    b.put('p/house/light-stand', 0, -6.3, 4.9, 0);
    b.against('k/furniture/bookcaseOpenLow', lounge, 'left', 2.2);
  }
  kitchen(b, cook, 'right', -0.4, 5.3);
  if (random() < 0.65) {
    island(b, 0, 3.8, 0.9, 3, Math.PI);
    dining(b, 0, 3.6, 3.7, 0, 6);
  } else {
    dining(b, 0, 3.4, 1.4, Math.PI / 2, 4);
    b.put('p/house/table-round-small-2', 0, 3.4, 4.2, 0);
    for (const s of [-1, 1]) b.put('p/house/chair', 0, 3.4 + s * 0.95, 4.2, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    plant(b, 0, 1.6, 5.0);
  }
  art(b, hallway, 'back', -4.4, 1.5);
  plant(b, 0, -3.6, -1.0);
  const dv = wallFrame(den, 'back');
  if (denKind === 'den') {
    // Big sofa round the TV, books, a rug.
    b.against('p/house/drawer-2', den, 'back', dv.mid);
    b.put('k/furniture/televisionModern', 0, dv.mid, -5.1, 0, 0.65);
    b.put('p/house/l-couch', 0, dv.mid + 0.2, -2.3, Math.PI);
    b.put('p/house/table-round-small', 0, dv.mid, -3.5, 0);
    b.against('p/office/shelf', den, 'left', -4.6);
    b.against('p/office/shelf', den, 'left', -3.76);
    b.put('p/office/rug', 0, dv.mid, -3.4, 0);
  } else if (denKind === 'library') {
    // Shelves wall to wall, a reading table, armchairs by a lamp.
    b.row('p/office/shelf', den, 'back', -2.8, 3.3);
    b.put('p/office/table', 0, 0.3, -3.0, 0);
    for (const x of [-0.1, 0.7]) {
      b.put('p/house/chair', 0, x, -3.75, 0);
      b.put('k/furniture/books', 0, x, -3.0, b.random() * 6, 0.69);
    }
    b.put('p/house/table-lamp', 0, 0.9, -2.9, 0, 0.69);
    for (const x of [-2.0, 2.6]) b.put('p/cafe/couch-small', 0, x, -1.6, Math.PI);
    b.put('p/office/rug', 0, 0.3, -3.0, 0);
  } else {
    // Toys everywhere: a little table, bean bags of cushions, a toy chest, the bear.
    b.put('p/office/rug-round', 0, dv.mid, -3.0, 0);
    b.put('p/house/table-round-small-2', 0, dv.mid, -3.0, 0);
    for (let a = 0; a < 3; a++) b.put('k/furniture/pillowBlue', 0, dv.mid + Math.sin(a * 2.1) * 0.9, -3.0 + Math.cos(a * 2.1) * 0.9, a);
    b.put('k/furniture/bear', 0, dv.mid + 1.9, -4.8, 0.4);
    b.put('k/furniture/cardboardBoxOpen', 0, dv.u0 + 0.6, -4.9, 0.2);
    b.against('k/furniture/bookcaseOpenLow', den, 'back', dv.mid - 1.6);
    b.against('k/furniture/televisionVintage', den, 'left', -4.6);
  }
  plant(b, 0, 3.0, -5.0);
  // Cloakroom and laundry.
  b.against('p/office/toilet', wc, 'back', 5.6);
  b.against('p/office/bathroom-sink', wc, 'right', -3.6);
  b.against('k/furniture/bathroomMirror', wc, 'right', -3.6, 1.25);
  laundry(b, wash, 'right');
  // Upstairs.
  const landing = b.room('landing', 1, -7, -5.5, -3, 5.5, floor, paper);
  const main = b.room('bedroom', 1, -3, 0.5, 7, 5.5, b.pick(SOFT), b.pick(BEDROOM));
  const second = random() < 0.5;
  const other = b.room(second ? 'kids' : 'study', 1, -3, -5.5, 3, 0.5, second ? FLOORS.moss : b.pick(WOOD), second ? b.pick(KIDS) : PAPERS.slate);
  const ensuite = b.room('bathroom', 1, 3, -5.5, 7, 0.5, FLOORS.marble, b.pick([PAPERS.tile, PAPERS.aqua]));
  b.link(1, -3, 3);
  b.link(1, -3, -2.6);
  b.link(1, 5, 0.5);
  bedroom(b, main, 'right', true);
  const mv = wallFrame(main, 'back');
  b.put('p/cafe/couch-medium', 1, -0.6, 3.6, Math.PI);
  b.put('p/office/rug', 1, -0.6, 2.6, 0);
  b.put('p/office/coffee-table', 1, -0.6, 2.4, 0);
  void mv;
  if (second) bedroom(b, other, 'back', false, true);
  else study(b, other, 'back');
  bathroom(b, ensuite);
  // The landing: a bench, a reading corner, pictures.
  b.against('p/house/shelf-large', landing, 'right', -4.6);
  b.put('k/furniture/loungeChairRelax', 1, -4.3, 2.1, Math.PI / 2 + 0.4);
  b.put('p/house/light-floor', 1, -4.4, 1.0, 0);
  b.put('p/office/rug-round', 1, -4.6, 2.6, 0);
  art(b, landing, 'right', 1.6, 1.4);
  plant(b, 1, -3.5, 5.0);
  if (roof) b.roofDoor(landing, 'left', 3.6);
  else art(b, landing, 'left', 3.6, 1.4);
  b.spot(0, -2.2, 1.6, 0, 'visitor');
  b.spot(1, -1.0, 2.0, 0, 'visitor');
  b.finish();
  return b;
}

// ------------------------------------------------------------------ the roof terrace

/**
 * A roof terrace on a building's real roof, `w` by `d` (across the front, back to front) round `place`
 * (its y the roof's surface): decking and a lawn, the stair hut you come up through, an outdoor lounge,
 * a hot tub, sun loungers under a parasol, a dining table under a pergola, a bar, planters, a fire pit,
 * a telescope and strings of lights. Bigger roofs get more of it. Returns where the stair hut's door is.
 */
export function rooftop(b: InteriorBuilder, w: number, d: number) {
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const big = w * d > 60;
  // The deck, with a strip of lawn along one side.
  b.box(0, 0, 0, 0, w, 0.06, d, FLOORS.deck, { solid: false });
  b.box(0, x1 - 1.4, 0, 0.06, 2.6, 0.03, d - 1, FLOORS.turf, { solid: false });
  // Glass panels on the parapet, and a collider so nobody walks off.
  for (const [x, z, bw, bd] of [[0, z0, w, 0.08], [0, z1, w, 0.08], [x0, 0, 0.08, d], [x1, 0, 0.08, d]] as const) {
    b.box(0, x, z, 0.6, bw, 0.7, bd, '#bfe3f2', { glass: true, solid: false });
    b.box(0, x, z, 0, bw === 0.08 ? 0.3 : bw, 1.3, bd === 0.08 ? 0.3 : bd, '#000', { drawn: false });
  }
  // The stair hut in the back left corner, its door toward the front.
  const hx = x0 + 1.3;
  const hz = z0 + 1.2;
  b.box(0, hx, hz, 0, 2.2, 2.5, 2.0, '#f3eee4');
  b.box(0, hx, hz, 2.5, 2.5, 0.15, 2.3, '#e8743b', { solid: false });
  b.box(0, hx, hz + 1.01, 0.05, 1.0, 2.1, 0.04, '#2ec4b6', { solid: false });
  b.box(0, hx, hz + 1.03, 2.25, 0.6, 0.18, 0.02, '#ffd36b', { solid: false, glow: true });
  const door = b.world(hx, hz + 1.9);
  // Planters along the back with flowers and little trees.
  for (let x = hx + 1.8; x < x1 - 3; x += 1.9) {
    b.box(0, x, z0 + 0.5, 0, 1.6, 0.55, 0.6, '#3c4654');
    b.box(0, x, z0 + 0.5, 0.55, 1.5, 0.04, 0.5, '#4f9a45', { solid: false });
    b.put(b.pick(['p/house/houseplant', 'k/furniture/plantSmall3', 'k/house/houseplant-2'] as const), 0, x - 0.4, z0 + 0.5, b.random() * 6, 0.55);
    b.put('k/furniture/plantSmall2', 0, x + 0.4, z0 + 0.5, b.random() * 6, 0.55);
  }
  // The lounge: a corner sofa round a low table and a rug, cushions in bold colours.
  const lx = x0 + 2.4;
  const lz = z1 - 2.3;
  b.put('p/cafe/rug', 0, lx + 0.4, lz + 0.2, 0);
  b.put('p/singles/couch', 0, lx, lz + 0.6, Math.PI);
  b.put('p/house/table-round-small', 0, lx + 0.5, lz - 0.2, 0);
  b.put('k/food/cocktail' as Furniture, 0, lx + 0.4, lz - 0.2, 0, 0.48);
  for (const [ox, oz] of [[-0.5, 1.0], [0.6, 1.1], [-1.1, 0.2]]) b.put('k/furniture/pillowBlue', 0, lx + ox, lz + oz, b.random() * 6, 0.45);
  // A fire pit.
  b.cylinder(0, lx + 2.2, lz - 0.3, 0, 0.9, 0.35, '#5a5f6b', { solid: true });
  b.cylinder(0, lx + 2.2, lz - 0.3, 0.35, 0.6, 0.08, '#ff8a2b', { glow: true });
  // Sun loungers under a parasol on the lawn.
  for (let k = 0; k < (big ? 3 : 2); k++) b.put('k/furniture/loungeChairRelax', 0, x1 - 1.4, z0 + 2.6 + k * 1.6, -Math.PI / 2);
  b.put('k/commercial/detail-parasol-a' as Furniture, 0, x1 - 1.4, z0 + 2.6 + (big ? 4.8 : 3.2), 0);
  if (big) {
    // The hot tub, with its steps, glowing at night.
    const tx = 0.5;
    const tz = z0 + 2.4;
    b.cylinder(0, tx, tz, 0, 2.3, 0.85, '#8a5a3a', { solid: true });
    b.cylinder(0, tx, tz, 0.85, 2.0, 0.04, '#3fd6e8', { glow: true });
    b.box(0, tx, tz + 1.3, 0, 1.0, 0.3, 0.45, '#8a5a3a');
    // A pergola over a dining table.
    const dx = 1.2;
    const dz = z1 - 2.2;
    for (const [ox, oz] of [[-1.7, -1.3], [1.7, -1.3], [-1.7, 1.3], [1.7, 1.3]]) b.box(0, dx + ox, dz + oz, 0, 0.12, 2.6, 0.12, '#f4efe6');
    for (let k = -1.6; k <= 1.6; k += 0.4) b.box(0, dx + k, dz, 2.6, 0.08, 0.1, 2.9, '#f4efe6', { solid: false });
    dining(b, 0, dx, dz, 0, 6);
    // A bar along the side, stools and bottles.
    for (let k = 0; k < 3; k++) {
      b.put('k/furniture/kitchenBar', 0, x1 - 3.6, z1 - 1.0 - k * 0.9, Math.PI / 2);
      b.put('p/cafe/barstool', 0, x1 - 2.95, z1 - 1.0 - k * 0.9, -Math.PI / 2);
      b.put(b.pick(['k/food/soda', 'k/food/cocktail', 'k/food/wine-red'] as Furniture[]), 0, x1 - 3.6, z1 - 1.0 - k * 0.9, b.random() * 6, 0.88);
    }
    // A telescope at the corner, for the view.
    const sx = x1 - 0.9;
    const sz = z1 - 0.9;
    for (const a of [0, 2.1, 4.2]) b.box(0, sx + Math.cos(a) * 0.25, sz + Math.sin(a) * 0.25, 0, 0.04, 1.2, 0.04, '#3b3f4a', { solid: false });
    b.box(0, sx, sz, 1.2, 0.18, 0.18, 0.9, '#e8743b', { solid: false, turn: 0.7 });
  }
  // Strings of lights between posts at the corners, warm at night.
  const posts: [number, number][] = [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x1 - 0.3, z1 - 0.3], [x0 + 0.3, z1 - 0.3]];
  for (const [px, pz] of posts) b.box(0, px, pz, 0, 0.08, 2.7, 0.08, '#3b3f4a', { solid: false });
  for (let k = 0; k < 4; k++) {
    const [ax, az] = posts[k];
    const [bx, bz] = posts[(k + 1) % 4];
    const n = Math.max(3, Math.round(Math.hypot(bx - ax, bz - az) / 0.8));
    for (let j = 1; j < n; j++) {
      const t = j / n;
      const sag = Math.sin(t * Math.PI) * 0.35;
      b.box(0, ax + (bx - ax) * t, az + (bz - az) * t, 2.6 - sag, 0.1, 0.1, 0.1, POP[j % 4] === '#8ac926' ? '#ffd36b' : '#ffe2a8', { solid: false, glow: true });
    }
  }
  plant(b, 0, x0 + 0.5, z1 - 0.5);
  return { x: door.x, z: door.z, heading: b.heading(0) };
}

// ------------------------------------------------------------------ an office

/**
 * Two floors of offices: a reception lobby with the company's sign, open-plan desks, a glass meeting
 * room and a break room downstairs; more desks, the manager's office, a conference room, a lounge and
 * the archive upstairs.
 */
export function offices(place: InteriorPlace, random: () => number): InteriorBuilder {
  const b = new InteriorBuilder(place, 22, 16, 2, random, random() < 0.5, '#e4e7ec');
  const brand = b.pick(POP);
  const carpet = b.pick([FLOORS.carpet, FLOORS.slate, FLOORS.moss]);
  const lobby = b.room('lobby', 0, -5, 2, 5, 8, FLOORS.marble, b.pick([PAPERS.office, PAPERS.cream]), { zone: 'lobby' });
  const corridor = b.room('corridor', 0, -5, -1, 5, 2, FLOORS.marble, PAPERS.office, { zone: 'lobby' });
  const stairsRoom = b.room('stairs', 0, 0, -8, 5, -1, FLOORS.marble, PAPERS.office, { zone: 'lobby' });
  const open = b.room('open office', 0, -11, -8, -5, 8, carpet, PAPERS.office);
  const meeting = b.room('meeting', 0, 5, 2, 11, 8, FLOORS.ash, PAPERS.slate, { glass: true });
  const breakRoom = b.room('break room', 0, 5, -8, 11, 2, FLOORS.checker, b.pick([PAPERS.sun, PAPERS.mint, PAPERS.coral]));
  const rest = b.room('restroom', 0, -5, -8, 0, -1, FLOORS.tiles, PAPERS.tile);
  b.link(0, 0, 8, 1.6);
  b.link(0, -5, 5);
  b.link(0, -5, 0.5);
  b.link(0, 5, 5);
  b.link(0, 5, 0.5);
  b.link(0, -2.5, -1);
  b.stairs(0, 0.9, -1.6, 'back');
  // Reception: a long desk, the sign on the wall behind, sofas to wait on.
  for (let k = -1.5; k <= 1.5; k++) b.put('k/furniture/kitchenBar', 0, k * 0.9, 3.4, Math.PI);
  b.put('p/office/dual-monitors-on-sit-stand-arm', 0, 0.5, 3.4, Math.PI, 0.88);
  b.box(0, 0, 2.15, 1.2, 3.4, 0.9, 0.06, brand, { solid: false, glow: true });
  b.box(0, 0, 2.12, 1.05, 3.8, 1.2, 0.04, '#22262e', { solid: false });
  b.spot(0, 0, 2.8, 0, 'staff');
  for (const s of [-1, 1]) {
    b.put('p/cafe/couch-medium', 0, s * 3.4, 6.6, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.put('p/office/coffee-table', 0, s * 2.3, 6.6, 0);
    plant(b, 0, s * 4.5, 7.6);
  }
  b.put('p/office/rug', 0, 0, 6.2, 0);
  // Open-plan desks in pods of four, each with a screen and chair.
  for (let z = -6.4; z <= 6; z += 3.2) {
    for (const x of [-9.1, -6.9]) {
      for (const s of [-1, 1]) {
        b.put('p/office/table', 0, x, z + s * 0.42, s > 0 ? 0 : Math.PI);
        b.put('p/office/dual-monitors-on-sit-stand-arm', 0, x, z + s * 0.2, s > 0 ? Math.PI : 0, 0.76);
        b.put('p/office/office-chair', 0, x, z + s * 1.2, s > 0 ? Math.PI : 0);
      }
    }
    if (random() < 0.7) b.spot(0, -8, z + 1.2, Math.PI, 'staff');
  }
  b.row('k/furniture/bookcaseClosedDoors', open, 'left', -7.5, -3.0);
  plant(b, 0, -5.6, 7.4);
  // The meeting room: a long table and a screen.
  b.put('p/house/table-round-large', 0, 8, 5, Math.PI / 2);
  b.put('p/house/table-round-large', 0, 8, 3.25, Math.PI / 2);
  for (const z of [2.9, 3.6, 4.6, 5.3]) for (const s of [-1, 1]) b.put('k/furniture/chairModernCushion', 0, 8 + s * 0.8, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.against('k/furniture/televisionModern', meeting, 'right', 4.2, 0.9);
  // The break room: kitchen, a table, a sofa, the vending machine.
  kitchen(b, breakRoom, 'right', -7.6, -2.0);
  dining(b, 0, 7.6, -5.3, Math.PI / 2, 6);
  b.put('p/singles/sofa', 0, 8, -1.0, Math.PI);
  b.against('k/arcade/vending-machine', breakRoom, 'back', 7.0);
  b.spot(0, 8.5, -3, 0, 'visitor');
  // Restrooms.
  for (const x of [-4.2, -3.3, -2.4]) b.against('p/office/toilet', rest, 'back', x);
  b.against('p/office/bathroom-sink', rest, 'left', -4.0);
  b.against('p/office/bathroom-sink', rest, 'left', -3.0);
  plant(b, 0, 4.4, -1.6);
  // Upstairs.
  const hub = b.room('lounge', 1, -5, -1, 5, 8, FLOORS.ash, b.pick([PAPERS.teal, PAPERS.mustard, PAPERS.cobalt]), { zone: 'hub' });
  b.room('landing', 1, 0, -8, 5, -1, FLOORS.ash, PAPERS.office, { zone: 'hub' });
  const open2 = b.room('open office', 1, -11, -8, -5, 8, carpet, PAPERS.office);
  const boss = b.room('manager', 1, 5, -8, 11, 2, FLOORS.walnut, PAPERS.velvet);
  const conference = b.room('conference', 1, 5, 2, 11, 8, FLOORS.carpet, PAPERS.slate, { glass: true });
  const archive = b.room('archive', 1, -5, -8, 0, -1, FLOORS.concrete, PAPERS.white);
  b.link(1, -5, 4);
  b.link(1, -5, -4);
  b.link(1, 5, 0);
  b.link(1, 5, 5);
  b.link(1, -2.5, -1);
  for (let z = -6.4; z <= 6; z += 3.2) {
    for (const x of [-9.1, -6.9]) {
      for (const s of [-1, 1]) {
        b.put('p/office/table', 1, x, z + s * 0.42, s > 0 ? 0 : Math.PI);
        b.put(random() < 0.5 ? 'k/furniture/laptop' : 'p/office/dual-monitors-on-sit-stand-arm', 1, x, z + s * 0.2, s > 0 ? Math.PI : 0, 0.76);
        b.put('p/office/office-chair', 1, x, z + s * 1.2, s > 0 ? Math.PI : 0);
      }
    }
    if (random() < 0.6) b.spot(1, -8, z - 1.2, 0, 'staff');
  }
  // The lounge: beanbag-ish chairs, a ping-pong... a sofa round a rug, a coffee bar.
  b.put('p/office/rug', 1, 0, 4.5, 0);
  b.put('p/house/l-couch', 1, -1.5, 5.6, Math.PI);
  b.put('p/office/coffee-table', 1, -0.6, 4.2, 0);
  for (const x of [1.8, 3.0]) b.put('p/cafe/couch-small', 1, x, 3.6, -Math.PI / 2 + 0.3);
  island(b, 1, 0, 0.6, 4, 0);
  plant(b, 1, 4.4, 7.4);
  plant(b, 1, -4.4, 7.4);
  art(b, hub, 'front', 0, 1.5);
  // The manager's office.
  b.against('p/office/desk-2', boss, 'back', 9.6);
  b.put('p/cafe/couch-medium', 1, 7.4, -1.2, Math.PI);
  b.put('p/office/coffee-table', 1, 7.4, -2.3, 0);
  b.row('p/house/shelf-large', boss, 'right', -5.0, -1.6);
  art(b, boss, 'back', 7, 1.5);
  b.spot(1, 9.3, -6.5, Math.PI, 'staff');
  // The conference room.
  for (const z of [3.5, 5.3]) b.put('p/house/table-round-large', 1, 8, z, Math.PI / 2);
  for (const z of [3.0, 3.9, 4.8, 5.7]) for (const s of [-1, 1]) b.put('p/office/chair-2', 1, 8 + s * 0.85, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.against('k/furniture/televisionModern', conference, 'right', 4.4, 0.9);
  // The archive.
  for (let z = -7.4; z < -1.6; z += 1.2) for (const x of [-4.2, -2.6, -1.0]) b.put('p/office/file-cabinet', 1, x, z, 0);
  b.finish();
  return b;
}

// ------------------------------------------------------------------ the hospital

/** A hospital bed with its curtain rail, a monitor on a stand and an IV pole. */
function hospitalBed(b: InteriorBuilder, level: number, x: number, z: number, turn: number, curtain: string) {
  b.put('p/house/bed-single', level, x, z, turn);
  const [ix, iz] = turned(0.85, -0.7, turn);
  b.cylinder(level, x + ix, z + iz, 0, 0.04, 1.9, '#c9ced6');
  b.box(level, x + ix, z + iz, 1.7, 0.25, 0.3, 0.06, '#bfe7ff', { solid: false, glow: true });
  const [mx, mz] = turned(-0.85, -0.9, turn);
  b.cylinder(level, x + mx, z + mz, 0, 0.06, 1.2, '#7c8594');
  b.box(level, x + mx, z + mz, 1.2, 0.45, 0.32, 0.08, '#1d2430', { solid: false, turn });
  const [gx, gz] = turned(-0.85, -0.86, turn);
  b.box(level, x + gx, z + gz, 1.24, 0.38, 0.22, 0.02, '#38e07b', { solid: false, glow: true, turn });
  // The curtain drawn half round, on one side.
  const [cx, cz] = turned(1.15, 0, turn);
  b.box(level, x + cx, z + cz, 0.25, 0.04, 1.9, 2.3, curtain, { solid: false, turn });
  b.box(level, x + cx, z + cz, 2.2, 0.05, 0.05, 2.4, '#c9ced6', { solid: false, turn });
}

/**
 * Two floors: the entrance lobby with reception and a waiting area, the pharmacy, emergency bays,
 * X-ray and a café downstairs; wards, the operating theatre, the doctors' office and the nurses' room
 * upstairs, along a corridor on each floor.
 */
export function hospital(place: InteriorPlace, random: () => number): InteriorBuilder {
  const b = new InteriorBuilder(place, 30, 22, 2, random, random() < 0.5, '#f2f5f7');
  const lobby = b.room('lobby', 0, -6, 3, 6, 11, FLOORS.vinyl, PAPERS.clinic, { zone: 'hall' });
  const waiting = b.room('waiting', 0, -15, 3, -6, 11, FLOORS.vinyl, PAPERS.mint, { zone: 'hall' });
  const pharmacy = b.room('pharmacy', 0, 6, 3, 15, 11, FLOORS.tiles, PAPERS.produce);
  b.room('corridor', 0, -15, -1, 15, 3, FLOORS.vinyl, PAPERS.clinic, { zone: 'hall' });
  const er = b.room('emergency', 0, -15, -11, -3, -1, FLOORS.mint, PAPERS.ward);
  const xray = b.room('x-ray', 0, -3, -11, 3, -1, FLOORS.slate, PAPERS.slate, { windows: false });
  b.room('stairs', 0, 3, -11, 7, -1, FLOORS.vinyl, PAPERS.clinic, { zone: 'hall' });
  const cafe = b.room('cafe', 0, 7, -11, 15, -1, FLOORS.checker, PAPERS.sun);
  b.link(0, 0, 11, 2.0);
  b.link(0, 10, 3, 1.4);
  b.link(0, -9, -1, 1.6);
  b.link(0, 0, -1);
  b.link(0, 11, -1, 1.6);
  b.stairs(0, 3.9, -1.6, 'back');
  // The entrance: big red cross sign, reception desk, a wheelchair spot.
  for (let k = -2; k <= 2; k++) b.put('k/furniture/kitchenBar', 0, k * 0.9, 5.6, Math.PI);
  b.put('p/office/dual-monitors-on-sit-stand-arm', 0, -0.5, 5.6, Math.PI, 0.88);
  b.put('p/office/dual-monitors-on-sit-stand-arm', 0, 1.0, 5.6, Math.PI, 0.88);
  // The wall behind reception, with the red cross on it.
  b.box(0, 0, 3.6, 0, 4.2, 2.6, 0.2, '#ffffff');
  b.box(0, 0, 3.72, 1.2, 1.0, 0.3, 0.04, '#e53b3b', { solid: false, glow: true });
  b.box(0, 0, 3.72, 0.85, 0.3, 1.0, 0.04, '#e53b3b', { solid: false, glow: true });
  b.spot(0, -0.5, 4.8, 0, 'staff');
  b.spot(0, 1.0, 4.8, 0, 'staff');
  plant(b, 0, -5.4, 10.4);
  plant(b, 0, 5.4, 10.4);
  // The waiting area: rows of seats, a water cooler, magazines, a TV.
  for (let z = 5; z <= 9.5; z += 1.5) {
    for (let x = -13.6; x <= -7.4; x += 0.55) b.put('k/furniture/chairModernCushion', 0, x, z, 0);
    b.spot(0, -12 + random() * 4, z + 0.6, 0, 'visitor');
  }
  b.against('k/furniture/televisionModern', waiting, 'left', 7, 1.4);
  b.put('p/office/water-cooler', 0, -6.6, 3.6, 0);
  b.against('k/arcade/vending-machine', waiting, 'front', -14);
  // The pharmacy: counter, shelves of medicine.
  for (let z = 4.1; z < 10.5; z += 2) b.against('k/market/shelf-boxes', pharmacy, 'right', z);
  for (let x = 7.5; x <= 11; x += 0.9) b.put('k/furniture/kitchenBar', 0, x, 7.4, 0);
  b.put('p/cafe/cash-register', 0, 9.3, 7.4, 0, 0.88);
  b.spot(0, 9.3, 8.2, Math.PI, 'staff');
  b.box(0, 10.5, 10.9, 1.9, 2.4, 0.5, 0.05, '#2fb36b', { solid: false, glow: true });
  // Emergency: bays of beds with curtains, a nurses' desk.
  for (let k = 0; k < 4; k++) {
    hospitalBed(b, 0, -13.4 + k * 2.9, -9.2, 0, b.pick(['#7fc8f8', '#a8e6cf', '#ffd3b6', '#ffaaa5']));
    if (random() < 0.6) b.spot(0, -12.6 + k * 2.9, -7.4, Math.PI, 'staff');
  }
  for (let k = 0; k < 3; k++) b.put('k/furniture/kitchenBar', 0, -8.5 + k * 0.9, -3.4, Math.PI);
  b.put('p/office/dual-monitors-on-sit-stand-arm', 0, -7.6, -3.4, Math.PI, 0.88);
  // X-ray: the machine, a bed under it, the lead screen and its console.
  b.put('p/house/bed-single', 0, 0, -7.5, Math.PI / 2);
  b.box(0, 0, -9.6, 0, 0.6, 2.4, 0.6, '#d9dee6');
  b.box(0, 0, -8.4, 2.0, 0.5, 0.35, 2.0, '#d9dee6', { solid: false });
  b.box(0, 0, -7.5, 1.9, 0.6, 0.12, 0.6, '#9fd7ff', { solid: false, glow: true });
  b.box(0, -2.2, -3.6, 0, 1.4, 1.9, 0.1, '#7c8594');
  b.put('p/office/table', 0, -1.6, -2.2, Math.PI);
  b.put('p/office/dual-monitors-on-sit-stand-arm', 0, -1.6, -2.4, 0, 0.76);
  b.spot(0, -1.6, -1.6, Math.PI, 'staff');
  // The café.
  for (let x = 8; x < 11; x += 0.9) b.put('k/furniture/kitchenBar', 0, x, -9.4, 0);
  b.put('p/cafe/coffee-machine', 0, 9.8, -9.4, Math.PI, 0.88);
  b.spot(0, 9.2, -10.3, 0, 'staff');
  for (const [x, z] of [[9, -6], [12.5, -6], [9, -3.4], [12.5, -3.4]] as const) {
    b.put('p/house/table-round-small-2', 0, x, z, 0);
    for (const s of [-1, 1]) b.put('p/house/chair', 0, x + s * 0.95, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    meal(b, 0, x - 0.3, z, 0.77, SWEETS);
  }
  b.against('k/arcade/vending-machine', cafe, 'right', -9.5);
  // Upstairs.
  b.room('corridor', 1, -15, -1, 15, 3, FLOORS.vinyl, PAPERS.clinic, { zone: 'hall' });
  b.room('landing', 1, 3, -11, 7, -1, FLOORS.vinyl, PAPERS.clinic, { zone: 'hall' });
  const wards = [
    b.room('ward', 1, -15, 3, -5, 11, FLOORS.mint, PAPERS.ward),
    b.room('ward', 1, -5, 3, 5, 11, FLOORS.mint, b.pick([PAPERS.sky, PAPERS.mint])),
    b.room('maternity', 1, 5, 3, 15, 11, FLOORS.rose, PAPERS.blush),
  ];
  const theatre = b.room('theatre', 1, -15, -11, -3, -1, FLOORS.mint, PAPERS.aqua, { windows: false });
  const doctors = b.room('doctors', 1, -3, -11, 3, -1, FLOORS.carpet, PAPERS.office);
  const nurses = b.room('nurses', 1, 7, -11, 15, -1, FLOORS.lino, PAPERS.mint);
  b.link(1, -10, 3, 1.4);
  b.link(1, 0, 3, 1.4);
  b.link(1, 10, 3, 1.4);
  b.link(1, -9, -1, 1.8);
  b.link(1, 0, -1);
  b.link(1, 11, -1);
  // Wards: beds along the front wall, chairs for visitors.
  wards.forEach((ward, k) => {
    for (let i = 0; i < 3; i++) {
      const x = ward.x0 + 1.9 + i * 3.1;
      hospitalBed(b, 1, x, 9.6, Math.PI, k === 2 ? '#ffc2d1' : b.pick(['#7fc8f8', '#a8e6cf', '#ffd3b6']));
      b.put('p/house/chair', 1, x + 1.0, 7.6, Math.PI);
      if (random() < 0.5) b.spot(1, x - 0.6, 7.4, Math.PI, 'visitor');
    }
    b.spot(1, (ward.x0 + ward.x1) / 2, 5.6, 0, 'staff');
    plant(b, 1, ward.x0 + 0.5, 3.6);
    art(b, ward, 'back', (ward.x0 + ward.x1) / 2 + 2.5, 1.5);
  });
  // The operating theatre: the table under its big lamp, machines, a tray of tools.
  b.box(1, -9, -6, 0, 0.7, 0.85, 2.1, '#b9c2cc');
  b.box(1, -9, -6, 0.85, 0.75, 0.1, 2.0, '#4fd1c5', { solid: false });
  b.cylinder(1, -9, -6, 2.5, 1.2, 0.2, '#f4f7fa', { glow: true });
  b.cylinder(1, -9, -6, 2.7, 0.08, 0.2, '#c9ced6');
  for (const [x, z] of [[-11.2, -7.2], [-6.8, -7.2], [-11.2, -4.6]] as const) {
    b.box(1, x, z, 0, 0.7, 1.3, 0.6, '#d9dee6');
    b.box(1, x, z + 0.31, 1.0, 0.5, 0.25, 0.02, '#38e07b', { solid: false, glow: true });
  }
  b.box(1, -6.9, -4.6, 0, 0.9, 0.9, 0.5, '#c9ced6');
  for (const k of [-1, 0, 1]) b.spot(1, -9 + k * 1.1, -4.6, Math.PI, 'staff');
  // The doctors' office and the nurses' room.
  study(b, doctors, 'back');
  b.spot(1, 0, -9.2, Math.PI, 'staff');
  kitchen(b, nurses, 'right', -10.5, -5.0);
  b.put('p/singles/sofa', 1, 9.5, -2.2, Math.PI);
  dining(b, 1, 9.5, -6.0, 0, 4);
  b.spot(1, 9.5, -4.4, Math.PI, 'staff');
  void theatre;
  b.finish();
  return b;
}

// ------------------------------------------------------------------ the game centre

/** One bowling lane, pins at the far (back) end, gutters either side, a ball on the return. */
function lane(b: InteriorBuilder, x: number, zNear: number, zFar: number, colour: string) {
  const length = zNear - zFar;
  b.box(0, x, (zNear + zFar) / 2, 0, 1.1, 0.08, length, FLOORS.lanes);
  for (const s of [-1, 1]) b.box(0, x + s * 0.68, (zNear + zFar) / 2, 0, 0.26, 0.05, length, '#3b3f4a', { solid: false });
  b.box(0, x, zNear - 0.6, 0.08, 1.1, 0.01, 0.06, colour, { solid: false, glow: true });
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) b.cylinder(0, x + (i - row / 2) * 0.24, zFar + 0.5 + (3 - row) * 0.22, 0.08, 0.1, 0.38, '#ffffff');
  }
  b.box(0, x, zFar + 0.15, 0, 1.6, 1.2, 0.3, '#22262e');
  b.box(0, x, zFar + 0.3, 1.2, 1.6, 0.6, 0.05, colour, { solid: false, glow: true });
}

/**
 * A game centre: arcade cabinets and claw machines across a starry carpet, four bowling lanes with
 * their benches and score screens, a billiards lounge, a snack bar and the prize counter by the door.
 */
export function gameCentre(place: InteriorPlace, random: () => number): InteriorBuilder {
  const b = new InteriorBuilder(place, 28, 20, 1, random, random() < 0.5, '#2a1458');
  const lobby = b.room('lobby', 0, -5, 4, 5, 10, FLOORS.galaxy, PAPERS.arcade, { zone: 'floor' });
  const snack = b.room('snack bar', 0, 5, 4, 14, 10, FLOORS.checker, PAPERS.candy, { zone: 'floor' });
  b.room('concourse', 0, -5, 1, 14, 4, FLOORS.galaxy, PAPERS.arcade, { zone: 'floor' });
  const arcade = b.room('arcade', 0, -14, -2, -5, 10, FLOORS.galaxy, PAPERS.neon, { zone: 'floor' });
  const bowling = b.room('bowling', 0, -5, -10, 14, 1, FLOORS.lanes, PAPERS.night, { windows: false });
  const billiards = b.room('billiards', 0, -14, -10, -5, -2, FLOORS.moss, PAPERS.velvet);
  b.link(0, 0, 10, 2.2);
  b.link(0, 0, 1, 2.4);
  b.link(0, 9, 1, 2.4);
  b.link(0, -9.5, -2, 1.8);
  b.link(0, -5, -6, 1.4);
  // Neon strips along the arcade's walls.
  for (const z of [-1.9, 9.9]) b.box(0, -9.5, z, 2.4, 8.8, 0.08, 0.06, b.pick(['#ff2bd6', '#19f0ff', '#9d4dff']), { solid: false, glow: true });
  // The prize counter by the door.
  b.against('k/arcade/prizes', lobby, 'front', -3.2);
  b.against('k/arcade/prize-wheel', lobby, 'front', 3.4);
  b.put('k/arcade/cash-register', 0, 0, 7.6, Math.PI);
  b.spot(0, 0, 8.6, Math.PI, 'staff');
  for (const x of [-4.2, 4.2]) b.put('k/arcade/ticket-machine', 0, x, 5, x > 0 ? -Math.PI / 2 : Math.PI / 2);
  // Rows of cabinets, claw machines, the big games.
  for (let z = -1; z <= 9; z += 2.6) {
    for (const x of [-13.3, -11.6]) b.put(b.pick(['k/arcade/arcade-machine', 'k/arcade/arcade-machine', 'k/arcade/gambling-machine', 'k/arcade/pinball'] as const), 0, x, z, Math.PI / 2);
    b.spot(0, -10.5, z, -Math.PI / 2, 'visitor');
  }
  for (const z of [0, 2.2, 4.4]) b.put('k/arcade/claw-machine', 0, -6.2, z, -Math.PI / 2);
  b.put('k/arcade/dance-machine', 0, -8.6, 7.6, 0);
  b.put('k/arcade/air-hockey', 0, -8.6, 2.2, Math.PI / 2);
  b.put('k/arcade/basketball-game', 0, -6.2, 8.2, -Math.PI / 2);
  b.spot(0, -8.6, 8.9, Math.PI, 'visitor');
  b.spot(0, -9.8, 2.2, Math.PI / 2, 'visitor');
  // Bowling: lanes from the benches (near the concourse) back to the pins.
  const colours = ['#ff2bd6', '#19f0ff', '#ffd23f', '#38e07b'];
  for (let k = 0; k < 4; k++) {
    const x = -2.2 + k * 2.4;
    lane(b, x, -2.2, -9.8, colours[k]);
    b.put('k/furniture/benchCushion', 0, x - 0.45, -0.6, 0);
    b.put('k/furniture/benchCushion', 0, x + 0.45, -0.6, 0);
    b.box(0, x, -1.35, 0, 0.4, 0.75, 0.4, '#3b3f4a');
    b.cylinder(0, x, -1.35, 0.75, 0.24, 0.22, colours[(k + 2) % 4]);
    if (random() < 0.7) b.spot(0, x, -1.7, Math.PI, 'visitor');
  }
  b.row('k/furniture/benchCushionLow', bowling, 'right', -8, -2);
  b.against('k/arcade/vending-machine', bowling, 'right', -0.8);
  // The billiards lounge: two pool tables, ping-pong, darts on the wall, a bench to wait on.
  for (const [x, z] of [[-11.2, -7.6], [-7.8, -7.6]] as const) {
    b.put('p/cafe/pool-table', 0, x, z, Math.PI / 2);
    b.spot(0, x + 1.0, z, -Math.PI / 2, 'visitor');
  }
  b.put('p/office/table-tennis-table', 0, -9.5, -3.9, 0);
  b.spot(0, -9.5, -2.6, Math.PI, 'visitor');
  b.row('k/furniture/benchCushion', billiards, 'left', -6.5, -3);
  b.against('p/office/dartboard', billiards, 'back', -6.2, 1.5);
  b.against('p/office/trophy', billiards, 'back', -12.6, 0);
  art(b, billiards, 'back', -9.5, 1.6);
  // The snack bar.
  for (let x = 6; x < 13; x += 0.9) b.put('k/furniture/kitchenBar', 0, x, 8.2, 0);
  for (let x = 6; x < 13; x += 0.9) b.put('p/cafe/barstool', 0, x, 7.4, Math.PI);
  for (let x = 6.2; x < 13; x += 1.8) meal(b, 0, x, 8.2, 0.88);
  b.against('p/house/kitchen-fridge', snack, 'front', 13.2);
  b.spot(0, 9.5, 9.2, Math.PI, 'staff');
  for (const x of [7, 10, 13]) {
    b.put('p/house/table-round-small-2', 0, x, 5.5, 0);
    meal(b, 0, x - 0.25, 5.5, 0.77);
  }
  b.finish();
  return b;
}

// ------------------------------------------------------------------ the event centre

/**
 * An event centre: the lobby with the ticket desk, a cloakroom and a cocktail lounge at the front; the
 * main hall behind with a stage (the band's kit, speakers, a truss of coloured lights), a glowing dance
 * floor, round tables laid for dinner, a long bar and the DJ booth; the green room backstage.
 */
export function eventCentre(place: InteriorPlace, random: () => number): InteriorBuilder {
  const b = new InteriorBuilder(place, 30, 24, 1, random, random() < 0.5, '#2d2440');
  const lobby = b.room('lobby', 0, -6, 6, 6, 12, FLOORS.marble, PAPERS.gold);
  const cloak = b.room('cloakroom', 0, -15, 6, -6, 12, FLOORS.carpet, PAPERS.velvet);
  const lounge = b.room('lounge', 0, 6, 6, 15, 12, FLOORS.walnut, PAPERS.velvet);
  b.room('hall', 0, -15, -12, 8, 6, FLOORS.walnut, PAPERS.gold, { zone: 'hall', windows: false });
  b.room('hall', 0, 8, -6, 15, 6, FLOORS.walnut, PAPERS.gold, { zone: 'hall', windows: false });
  const green = b.room('green room', 0, 8, -12, 15, -6, FLOORS.carpet, PAPERS.lilac, { windows: false });
  b.link(0, 0, 12, 2.4);
  b.link(0, -6, 9);
  b.link(0, 6, 9);
  b.link(0, -3, 6, 2.0);
  b.link(0, 3, 6, 2.0);
  b.link(0, 11, -6);
  // Lobby: the ticket desk and posters.
  for (let k = -1; k <= 1; k++) b.put('k/furniture/kitchenBar', 0, k * 0.9, 9.6, Math.PI);
  b.spot(0, 0, 8.9, 0, 'staff');
  for (const x of [-4.5, 4.5]) {
    b.box(0, x, 6.12, 0.6, 1.2, 1.8, 0.04, b.pick(POP), { solid: false, glow: true });
    plant(b, 0, x, 11.4);
  }
  // Cloakroom: rails of coats.
  for (const z of [7.4, 9.4]) for (let x = -14; x < -8; x += 1) b.put('p/office/coat-rack', 0, x, z, 0);
  for (let z = 7; z < 11.5; z += 0.9) b.put('k/furniture/kitchenBar', 0, -7.2, z, Math.PI / 2);
  b.spot(0, -7.9, 9, Math.PI / 2, 'staff');
  // The lounge: velvet sofas, low tables, cocktails.
  for (const [x, z, t] of [[8.5, 7.6, 0], [12.5, 7.6, 0], [8.5, 10.6, Math.PI], [12.5, 10.6, Math.PI]] as const) {
    b.put('p/cafe/couch-medium', 0, x, z, t);
    b.put('p/office/coffee-table', 0, x, 9.1, 0);
    b.put('k/food/cocktail' as Furniture, 0, x, 9.1, 0, 0.48);
  }
  b.spot(0, 10.5, 9.1, 0, 'visitor');
  // The stage across the back of the hall, steps up at both ends.
  const stage = { x0: -12, x1: 6, z0: -12, z1: -7 };
  const sx = (stage.x0 + stage.x1) / 2;
  b.box(0, sx, (stage.z0 + stage.z1) / 2, 0, stage.x1 - stage.x0, 0.8, stage.z1 - stage.z0, '#2b2b33');
  b.box(0, sx, stage.z1 - 0.02, 0.05, stage.x1 - stage.x0, 0.05, 0.04, '#ffd23f', { solid: false, glow: true });
  for (const x of [stage.x0 - 0.5, stage.x1 + 0.5]) for (let k = 0; k < 4; k++) b.box(0, x, stage.z1 - 0.6 - k * 0.3, 0, 1.0, 0.2 * (k + 1), 0.3, '#3b3f4a');
  // The band's kit on the stage: the drums at the back, guitar and amp, mic stands at the front with
  // monitors facing the band, speaker stacks either side.
  const up = 0.8;
  b.put('p/cafe/drum-set', 0, sx, -10.4, 0, up);
  for (const x of [sx - 2.4, sx + 2.4]) b.put('p/cafe/guitar-amp', 0, x, -10.9, 0, up);
  b.put('p/cafe/electric-guitar', 0, sx + 2.4, -10.3, 0.3, up);
  for (const x of [sx - 3.5, sx, sx + 3.5]) {
    b.cylinder(0, x, -8.0, up, 0.04, 1.5, '#3b3f4a');
    b.cylinder(0, x, -8.0, up + 1.5, 0.08, 0.12, '#22262e');
    b.put('p/cafe/floor-monitor', 0, x, -7.45, Math.PI, up);
  }
  for (const x of [stage.x0 + 0.7, stage.x1 - 0.7]) b.put('p/cafe/bass-speakers', 0, x, -8.4, 0, up);
  for (const x of [stage.x0 - 1.4, stage.x1 + 1.4]) b.put('p/cafe/speaker', 0, x, -6.4, 0);
  // The lighting truss over the stage, lamps in every colour.
  b.box(0, sx, -9.5, 2.75, stage.x1 - stage.x0, 0.12, 0.12, '#9aa1ad', { solid: false });
  for (let x = stage.x0 + 1; x < stage.x1; x += 1.6) b.cylinder(0, x, -9.5, 2.45, 0.28, 0.3, b.pick(['#ff2bd6', '#19f0ff', '#ffd23f', '#9d4dff', '#38e07b']), { glow: true });
  b.box(0, sx, -11.9, 0.8, stage.x1 - stage.x0 - 1, 1.9, 0.05, '#9d4dff', { solid: false, glow: true });
  for (const k of [-1, 0, 1]) b.spot(0, sx + k * 3.5, -8.6, 0, 'staff');
  // The dance floor in front: a grid of glowing tiles.
  const tiles = ['#ff2bd6', '#19f0ff', '#ffd23f', '#9d4dff', '#38e07b', '#ff924c'];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) b.box(0, sx - 3.5 + i, -6.0 + j, 0.01, 0.96, 0.02, 0.96, tiles[(i * 3 + j * 5) % tiles.length], { solid: false, glow: true });
  }
  for (let k = 0; k < 6; k++) b.spot(0, sx - 3 + random() * 6, -5.5 + random() * 2.5, random() * 6, 'visitor');
  // Round tables laid for dinner across the hall.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -12.5 + i * 4.6;
      const z = -0.6 + j * 4.2;
      b.put('p/house/table-round-small-2', 0, x, z, 0);
      b.cylinder(0, x, z, 0.77, 0.2, 0.25, b.pick(['#ffd23f', '#ff8fb1', '#ffffff']));
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2;
        b.put('p/house/chair', 0, x + Math.sin(a) * 1.15, z + Math.cos(a) * 1.15, a + Math.PI);
        if (random() < 0.7) meal(b, 0, x + Math.sin(a) * 0.5, z + Math.cos(a) * 0.5, 0.77);
      }
      if (random() < 0.6) b.spot(0, x + 1.5, z + 1.2, random() * 6, 'visitor');
    }
  }
  // The bar down the side, bottles glowing behind it.
  for (let z = -5; z <= 4.5; z += 0.9) {
    b.put('k/furniture/kitchenBar', 0, 11.2, z, -Math.PI / 2);
    b.put('p/cafe/barstool', 0, 10.4, z, Math.PI / 2);
    if (random() < 0.45) b.put(b.pick(['k/food/cocktail', 'k/food/wine-red', 'k/food/soda'] as Furniture[]), 0, 11.2, z, random() * 6, 0.88);
  }
  b.box(0, 14.85, -0.3, 1.0, 0.3, 1.6, 9.5, '#22262e', { solid: false });
  for (let z = -4.5; z <= 4; z += 0.5) b.cylinder(0, 14.8, z, 1.6 + (z % 1 === 0 ? 0 : 0.5), 0.12, 0.35, b.pick(['#38e07b', '#ffd23f', '#ff8fb1', '#19f0ff']), { glow: true });
  b.spot(0, 12.3, -1, -Math.PI / 2, 'staff');
  b.spot(0, 12.3, 3, -Math.PI / 2, 'staff');
  // The DJ booth by the stage.
  b.box(0, 7.0, -4.5, 0, 1.6, 1.1, 0.8, '#22262e');
  b.box(0, 7.0, -4.88, 0.4, 1.4, 0.4, 0.03, '#19f0ff', { solid: false, glow: true });
  b.spot(0, 7.0, -5.3, Math.PI, 'staff');
  // The green room.
  b.put('p/house/couch-large', 0, 11.5, -11.2, 0);
  b.put('p/office/coffee-table', 0, 11.5, -9.6, 0);
  b.against('k/furniture/bathroomMirror', green, 'right', -8, 1.2);
  b.against('p/office/coat-rack', green, 'right', -10.5);
  meal(b, 0, 11.5, -9.6, 0.48, SWEETS);
  void lobby;
  void cloak;
  void lounge;
  b.finish();
  return b;
}

/** A level's height above the ground floor, for anything placed upstairs from outside this file. */
export const levelHeight = (level: number) => level * INTERIOR_HEIGHT;
export { WALL_HEIGHT };
