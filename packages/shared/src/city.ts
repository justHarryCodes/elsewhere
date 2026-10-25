// The city: a seeded generator shared by the server (colliders) and the clients (drawing), so the same
// seed builds the same streets, buildings and props everywhere without sending any of it over the wire.
//
// A green, colourful town about 1 km along X by 600 m along Z. Streets are the Downtown City MegaKit's
// 4-lane pieces on a grid of blocks about 55 m across. Each town block holds a cluster of 3 to 10
// buildings from Quaternius' Ultimate Buildings Pack, packed together in the middle with mixed heights
// and colour schemes, ringed by lawn, trees, flower beds and paths (Stylized Nature MegaKit); some
// blocks are parks or squares instead. Streets get trees, benches, bins, hydrants, bus stops, signs,
// billboards and traffic lights. Old Town (low houses and shops) at -X, Downtown (taller) in the
// middle, Industry (works halls from the MegaKit's modules, with tanks and containers) at +X.
//
// Heights: the road surface is y = 0; sidewalks and lots are a kerb (15 cm) above it.

/** Sidewalks and lots stand this far above the road (the kit's kerb). */
export const KERB_HEIGHT = 0.15;
/** A 4-lane street with its sidewalks, metres: 4 lanes of 3 m plus a 3 m sidewalk each side. */
export const STREET_WIDTH = 18;
export const LANE_WIDTH = 3;
export const SIDEWALK_WIDTH = 3;
const HALF_STREET = STREET_WIDTH / 2;
/**
 * How far a junction piece's road reaches from its centre: the same 18 m as the street. (The pieces
 * measure 24.7 m across, but only because their zebra crossings overhang onto the streets.)
 */
const JUNCTION_HALF = HALF_STREET;
/** A corner's curve piece reaches this far along each street from the corner. */
const CURVE_REACH = 9;
const SEGMENT = 6; // length of one straight street piece
const FLOOR = 3; // every wall module is one 3 m storey
const MODULE = 2; // and 2 m wide

const CITY_WIDTH = 1000;
const CITY_DEPTH = 600;
const BLOCK_COLUMNS = 13;
const BLOCK_ROWS = 8;

export type CityZone = 'residential' | 'commercial' | 'industrial';
export const CITY_ZONES: readonly CityZone[] = ['residential', 'commercial', 'industrial'];
/** What the districts are called on screen. */
export const CITY_ZONE_LABELS: Record<CityZone, string> = { residential: 'Old Town', commercial: 'Downtown', industrial: 'Industry' };
/** Which block columns (west to east) each district takes. */
const DISTRICT_COLUMNS: Record<CityZone, [number, number]> = { residential: [0, 5], commercial: [5, 10], industrial: [10, 13] };

/** One MegaKit piece placed in the world: turned `yaw` radians about Y, stretched `sx` along its own X. */
export interface CityPiece {
  piece: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx?: number;
  /** Uniform scale (trees and flowers vary in size). */
  scale?: number;
  /** Colour scheme for pieces that have several (town buildings): an index into their palettes. */
  skin?: number;
  /** Behind-the-window look: which room shows, and whether it's lit at night (see roomLook). */
  room?: number;
}

export type BuildingStyle = 'brick' | 'modern' | 'stone' | 'works' | 'landmark' | 'town';

export interface CityBuilding {
  zone: CityZone;
  style: BuildingStyle;
  /** Footprint, metres (world X/Z). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Roof height above the lot, metres. */
  height: number;
  /** The side facing the street (where the entrance is). */
  face: Side;
  pieces: CityPiece[];
}

/** Ground drawn over a block: lawn, paths, paving for plazas, asphalt with bays for parking, works yards, dirt. */
export interface CityLot {
  kind: 'lawn' | 'path' | 'plaza' | 'parking' | 'yard' | 'dirt';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A simple solid made in code (tanks, chimneys, containers, lamp posts): box or upright cylinder. */
export interface CityShape {
  kind: 'box' | 'cylinder';
  x: number;
  y: number;
  z: number;
  /** Box: size along X, Y, Z (before yaw). Cylinder: w = diameter, h = height. */
  w: number;
  h: number;
  d: number;
  yaw: number;
  color: string;
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

/** A glowing neon tube, sign or billboard: an axis-aligned box in one colour. */
export interface CityNeon extends CityBox {
  /** Index into CITY_NEON_COLORS. */
  color: number;
}

/** A street lamp's head (where the light comes from) and the colour it shines. */
export interface CityLight {
  x: number;
  y: number;
  z: number;
  /** Index into CITY_NEON_COLORS. */
  color: number;
}

/** The night palette: hot pink, cyan, violet, red-pink, acid yellow, electric blue, sodium amber, warm white. */
export const CITY_NEON_COLORS = ['#ff2bd6', '#19f0ff', '#9d4dff', '#ff3b6b', '#e8ff3b', '#2b7bff', '#ff9a3c', '#ffd9a0'] as const;
const PINK = 0;
const CYAN = 1;
const AMBER = 6;
const WARM = 7;

/** A block of ground between streets, metres (world X/Z). */
export interface CityBlock {
  zone: CityZone;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A place on a street to put a car or a player: on its centre line, heading along it. */
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
  /** Street and junction pieces. */
  streets: CityPiece[];
  /** Where the streets are (sidewalk to sidewalk), as rectangles: for the map and anything that drives. */
  roads: { x0: number; z0: number; x1: number; z1: number }[];
  buildings: CityBuilding[];
  /** Loose kit props: planters, bollards, AC units. */
  props: CityPiece[];
  shapes: CityShape[];
  lots: CityLot[];
  blocks: CityBlock[];
  colliders: CityBox[];
  spots: CitySpot[];
  neon: CityNeon[];
  lights: CityLight[];
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

/** Whether the room behind a window is lit at night, and which room picture it shows. */
export function roomLook(room: number): { lit: boolean; picture: 0 | 1 } {
  return { lit: room % 100 < 62, picture: room % 2 === 0 ? 0 : 1 };
}

// ------------------------------------------------------------------ directions
// Openings as bits, N = +Z, E = +X, S = -Z, W = -X. Turning a piece by yaw +PI/2 maps N -> E -> S -> W.
type Side = 'N' | 'E' | 'S' | 'W';
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const turn = (mask: number) => ((mask << 1) | (mask >> 3)) & 15;
/** Yaw that turns a piece's +Z (the outside of a wall, a building's front) to face this side. */
const FACING: Record<Side, number> = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };
/** Unit vector out of each side. */
const OUT: Record<Side, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

/** Quarter turns k (yaw k*PI/2) that turn the opening mask `base` into `mask`, or -1. */
function turnsTo(base: number, mask: number): number {
  let m = base;
  for (let k = 0; k < 4; k++, m = turn(m)) if (m === mask) return k;
  return -1;
}

/** Rotates a local (x, z) offset by yaw. */
function rotate(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const overlaps = (a: Rect, b: Rect, gap = 0) => a.x0 - gap < b.x1 && b.x0 - gap < a.x1 && a.z0 - gap < b.z1 && b.z0 - gap < a.z1;

// ------------------------------------------------------------------ building styles
// Pieces per style: the shop floor (windows, door, plain wall), upper-floor windows (2 m and 4 m wide),
// plain upper wall, corner column (bottom / middle / top storey) and the cornice along the roof line.
interface Style {
  shopWindow: string;
  shopWall: string;
  door: string;
  windows: string[];
  wideWindows: string[];
  wall: string;
  corner: [string, string, string];
  /** Corner columns stand at the corner (centred) or tuck into it (the brick ones). */
  cornerTucked: boolean;
  cornice: string;
}

const STYLES: Record<Exclude<BuildingStyle, 'landmark' | 'town'>, Style> = {
  brick: {
    shopWindow: 'Metal_FirstFloor_Window',
    shopWall: 'Brick_BottomTrim',
    door: 'DoorFrame_Wooden',
    windows: ['Brick_Window_Trim_Single', 'Brick_Window_Square_Single', 'Brick_Window_Trim'],
    wideWindows: ['Brick_Inset_Window', 'Brick_Inset_Window_Curved', 'Brick_RedWhite_DoubleWindow', 'Brick_Window_CurvedDouble'],
    wall: 'Brick_Plain_3',
    corner: ['Brick_CornerColumn_Bottom', 'Brick_CornerColumn_Center', 'Brick_CornerColumn_Top'],
    cornerTucked: true,
    cornice: 'Cornice_Brick_Center',
  },
  modern: {
    shopWindow: 'Metal_FirstFloor_Window',
    shopWall: 'Metal_FirstFloor_Wall',
    door: 'DoorFrame_Metal_Single',
    windows: ['Metal_FullWindow', 'Metal_Window_Half'],
    wideWindows: ['Metal_Window'],
    wall: 'Metal_Plain_3',
    corner: ['Metal_Column_Bottom', 'Metal_Column_Center', 'Metal_Column_Top'],
    cornerTucked: false,
    cornice: 'Cornice_Metal_Center',
  },
  stone: {
    shopWindow: 'Trim_FirstFloor_Window_001',
    shopWall: 'Trim_FirstFloor_Wall',
    door: 'DoorFrame_Trim',
    windows: ['Trim_Window'],
    wideWindows: [],
    wall: 'Trim_Plain_3',
    corner: ['Trim_Column_Bottom', 'Trim_Column_Center', 'Trim_Column_Top'],
    cornerTucked: false,
    cornice: 'Cornice_Trim_Center',
  },
  works: {
    shopWindow: 'Metal_FirstFloor_Window',
    shopWall: 'Metal_FirstFloor_Wall',
    door: 'DoorFrame_Metal_Single',
    windows: ['Metal_Window_Half'],
    wideWindows: [],
    wall: 'Metal_Plain_3',
    corner: ['Metal_Column_Bottom', 'Metal_Column_Center', 'Metal_Column_Top'],
    cornerTucked: false,
    cornice: 'Cornice_Metal_Center',
  },
};

// The kit's three ready-made buildings: footprint as authored (front, with its entrance, toward +Z), height.
const LANDMARKS = {
  Building_Large_2: { x0: -9.32, x1: 11.32, z0: -16.32, z1: 0.32, height: 28 },
  Building_Medium_2_001: { x0: -7.53, x1: 7.53, z0: -12.49, z1: 0.57, height: 25 },
  Building_Small_1: { x0: -7.23, x1: 5.23, z0: -12.23, z1: 2.31, height: 17 },
} as const;
type Landmark = keyof typeof LANDMARKS;

// ------------------------------------------------------------------ the town's models
// Ultimate Buildings Pack (scripts/city/pack_town.py, in metres): x0, x1, z0, z1 as authored (the front,
// with its door and steps, toward +Z) and roof height.
const TOWN_BUILDINGS = {
  '1Story': [-2.585, 2.585, -2.585, 2.634, 4.013],
  '1Story_GableRoof': [-2.526, 2.526, -2.856, 2.856, 4.859],
  '1Story_RoundRoof': [-2.523, 2.485, -2.551, 2.551, 5.719],
  '1Story_Sign': [-2.585, 2.585, -2.585, 2.585, 4.305],
  '2Story': [-2.59, 2.59, -2.586, 3.492, 6.589],
  '2Story_2': [-2.59, 2.59, -2.586, 2.634, 6.63],
  '2Story_Balcony': [-2.59, 2.59, -2.586, 3.492, 7.066],
  '2Story_Center': [-2.905, 2.905, -2.586, 3.411, 6.568],
  '2Story_Columns': [-2.59, 2.59, -2.586, 3.388, 6.645],
  '2Story_Double': [-2.477, 3.334, -2.586, 3.492, 6.589],
  '2Story_GableRoof': [-2.59, 2.59, -2.856, 2.856, 7.52],
  '2Story_RoundRoof': [-2.534, 2.534, -2.551, 2.551, 6.959],
  '2Story_Sidehouse': [-5.745, 2.579, -3.055, 3.022, 6.617],
  '2Story_Sign': [-2.585, 2.585, -2.585, 2.585, 6.617],
  '2Story_Slim': [-1.313, 1.364, -2.586, 2.586, 6.617],
  '2Story_Stairs': [-2.59, 2.59, -2.586, 3.492, 6.589],
  '2Story_Wide': [-4.59, 4.59, -2.586, 2.827, 6.595],
  '2Story_Wide_2Doors': [-8.193, 8.193, -2.586, 2.827, 6.595],
  '3Story_Balcony': [-2.59, 2.59, -2.586, 3.433, 10.11],
  '3Story_Slim': [-1.313, 1.364, -2.586, 2.586, 9.581],
  '3Story_Small': [-2.309, 2.272, -2.713, 2.026, 9.236],
  '4Story': [-2.477, 3.334, -2.586, 3.492, 12.22],
  '4Story_Center': [-2.905, 2.905, -2.586, 3.492, 12.22],
  '4Story_Wide_2Doors': [-8.193, 8.193, -2.586, 3.886, 12.363],
  '4Story_Wide_2Doors_Roof': [-8.193, 8.193, -2.586, 3.886, 13.64],
  '6Story_Stack': [-2.59, 2.59, -2.586, 3.411, 18.728],
} as const;
type TownBuilding = keyof typeof TOWN_BUILDINGS;
const TOWN_SKINS = 10;

/** Which buildings each district builds with, repeated for weight: Old Town low, Downtown taller. */
const TOWN_SETS: Record<'residential' | 'commercial', TownBuilding[]> = {
  residential: [
    '1Story', '1Story_GableRoof', '1Story_GableRoof', '1Story_RoundRoof', '1Story_Sign',
    '2Story', '2Story_2', '2Story_Balcony', '2Story_GableRoof', '2Story_GableRoof', '2Story_RoundRoof', '2Story_Slim',
    '2Story_Stairs', '2Story_Sidehouse', '2Story_Columns', '3Story_Slim', '3Story_Small', '3Story_Balcony',
  ],
  commercial: [
    '2Story_Sign', '2Story_Wide', '2Story_Wide_2Doors', '2Story_Center', '2Story_Double', '2Story_Columns',
    '3Story_Balcony', '3Story_Slim', '3Story_Small', '4Story', '4Story', '4Story_Center', '4Story_Center',
    '4Story_Wide_2Doors', '4Story_Wide_2Doors_Roof', '6Story_Stack', '6Story_Stack',
  ],
};
/** How many buildings a town cluster has, by district (repeated for weight). */
const CLUSTER_SIZES: Record<'residential' | 'commercial', number[]> = {
  residential: [3, 3, 4, 4, 4, 5, 5, 6, 8],
  commercial: [4, 5, 5, 6, 6, 8, 10, 10],
};

// Street props: footprint (x, z) and height in metres, and which way their front faces as authored.
const PROPS = {
  bench: { w: 1.47, d: 0.72, h: 0.95, front: 'Z' },
  'trash-can': { w: 0.87, d: 0.91, h: 1.0, front: 'Z' },
  'fire-hydrant': { w: 0.37, d: 0.37, h: 0.8, front: 'Z' },
  mailbox: { w: 0.59, d: 0.61, h: 1.25, front: 'Z' },
  'planter-bushes': { w: 2.01, d: 0.65, h: 0.95, front: 'Z' },
  'flower-pot': { w: 0.56, d: 0.33, h: 1.0, front: 'Z' },
  'flower-pot-2': { w: 0.49, d: 0.47, h: 1.0, front: 'Z' },
  'power-box': { w: 0.42, d: 0.44, h: 1.4, front: 'Z' },
  'bus-stop': { w: 3.8, d: 2.46, h: 2.7, front: 'Z' },
  'bus-stop-sign': { w: 0.46, d: 0.11, h: 2.8, front: 'Z' },
  'stop-sign': { w: 0.09, d: 0.85, h: 2.6, front: 'X' },
  'traffic-light-2': { w: 0.91, d: 0.78, h: 3.8, front: 'Z' },
  billboard: { w: 2.71, d: 6.72, h: 7.5, front: '-X' },
  'billboard-2': { w: 4.93, d: 6.92, h: 7.5, front: '-X' },
  dumpster: { w: 1.68, d: 0.89, h: 1.4, front: 'Z' },
  atm: { w: 0.73, d: 0.75, h: 1.8, front: 'Z' },
} as const;
type Prop = keyof typeof PROPS;
/** Yaw that turns a prop's authored front toward a side. */
const propYaw = (prop: Prop, side: Side) => FACING[side] + { Z: 0, X: -Math.PI / 2, '-X': Math.PI / 2 }[PROPS[prop].front];

// Trees are the heaviest models (2-6k triangles): weighted toward the lighter ones.
const TREES = ['tree', 'tree-4', 'tree-4', 'tree-5'];
const PINES = ['pine-3', 'pine-5', 'pine-5'];
const FLOWERS = ['flower-group', 'flower-group-2', 'flower-single', 'flower-single-2', 'bush-with-flowers'];
const GROUND_COVER = ['grass', 'grass-wispy', 'grass-wispy-2', 'tall-grass', 'clover', 'clover-2', 'plant', 'plant-2'];

// Per district: how many buildings a block gets, their size (modules wide/deep, storeys), styles, gaps.
interface ZonePlan {
  buildings: [number, number];
  width: [number, number];
  depth: [number, number];
  floors: [number, number];
  styles: Exclude<BuildingStyle, 'landmark' | 'town'>[];
  /** Chance a building is one of the kit's ready-made ones instead. */
  landmark: number;
  setback: [number, number];
  gap: number;
  /** Chance a street between two blocks is left out, making one big block. */
  merge: number;
}

const PLANS: Record<CityZone, ZonePlan> = {
  residential: { buildings: [4, 7], width: [6, 10], depth: [6, 8], floors: [3, 5], styles: ['brick', 'brick', 'stone'], landmark: 0.15, setback: [0, 0.5], gap: 2, merge: 0.15 },
  commercial: { buildings: [2, 4], width: [8, 12], depth: [8, 11], floors: [6, 13], styles: ['modern', 'stone', 'brick'], landmark: 0.2, setback: [0, 1], gap: 6, merge: 0.1 },
  industrial: { buildings: [2, 3], width: [14, 22], depth: [10, 15], floors: [2, 3], styles: ['works', 'works'], landmark: 0, setback: [6, 12], gap: 10, merge: 0.35 },
};

// ------------------------------------------------------------------ the generator

export function generateCity(options: CityOptions = {}): City {
  const seed = hashSeed(options.seed ?? 1);
  const rng = seededRandom(seed);
  // Signs get their own random sequence, so restyling them never moves a building.
  const signRng = seededRandom(seed ^ 0x9e3779b9);
  const origin = options.origin ?? { x: -CITY_WIDTH / 2, z: -CITY_DEPTH / 2 };
  const bounds = { x0: origin.x, z0: origin.z, x1: origin.x + CITY_WIDTH, z1: origin.z + CITY_DEPTH };

  const streets: CityPiece[] = [];
  const roads: Rect[] = [];
  const buildings: CityBuilding[] = [];
  const props: CityPiece[] = [];
  const shapes: CityShape[] = [];
  const lots: CityLot[] = [];
  const blocks: CityBlock[] = [];
  const colliders: CityBox[] = [];
  const spots: CitySpot[] = [];
  const neon: CityNeon[] = [];
  const lights: CityLight[] = [];

  /** A street prop turned to face `side`, with a collider (unless it's something you'd step over). */
  const addProp = (prop: Prop, x: number, z: number, side: Side, solid = true) => {
    const yaw = propYaw(prop, side);
    props.push({ piece: `prop/${prop}`, x, y: KERB_HEIGHT, z, yaw });
    if (!solid) return;
    const p = PROPS[prop];
    const across = Math.abs(Math.sin(yaw)) > 0.5; // turned a quarter: footprint swaps
    colliders.push({ x, y: KERB_HEIGHT + p.h / 2, z, hx: (across ? p.d : p.w) / 2, hy: p.h / 2, hz: (across ? p.w : p.d) / 2 });
  };
  /** A plant (any way round, any size between `lo` and `hi`). */
  const addPlant = (model: string, x: number, z: number, lo = 0.85, hi = 1.15) => {
    props.push({ piece: `nature/${model}`, x, y: KERB_HEIGHT, z, yaw: rng() * Math.PI * 2, scale: between(rng, lo, hi) });
  };
  /** A tree, and a collider for its trunk. */
  const addTree = (model: string, x: number, z: number, lo = 0.85, hi = 1.15) => {
    addPlant(model, x, z, lo, hi);
    colliders.push({ x, y: KERB_HEIGHT + 2, z, hx: 0.3, hy: 2, hz: 0.3 });
  };

  // ---- the street grid: straight lines of junctions, a little uneven
  const lines = (count: number, from: number, to: number) => {
    const pitch = (to - from) / count;
    return Array.from({ length: count + 1 }, (_, i) => from + i * pitch + (i > 0 && i < count ? between(rng, -6, 6) : 0));
  };
  const xs = lines(BLOCK_COLUMNS, bounds.x0 + HALF_STREET, bounds.x1 - HALF_STREET);
  const zs = lines(BLOCK_ROWS, bounds.z0 + HALF_STREET, bounds.z1 - HALF_STREET);
  const nx = xs.length;
  const nz = zs.length;
  const zoneOfColumn = (i: number): CityZone =>
    CITY_ZONES.find((z) => i >= DISTRICT_COLUMNS[z][0] && i < DISTRICT_COLUMNS[z][1]) ?? 'industrial';
  const zoneAtX = (x: number): CityZone => {
    for (const zone of CITY_ZONES) if (x < xs[DISTRICT_COLUMNS[zone][1]]) return zone;
    return 'industrial';
  };

  // Edges: east-west between (i,j)-(i+1,j), north-south between (i,j)-(i,j+1). Some inner ones are left
  // out (never the ring), joining two blocks into one, as long as both junctions keep three streets.
  const eastWest = Array.from({ length: nx - 1 }, () => Array<boolean>(nz).fill(true));
  const northSouth = Array.from({ length: nx }, () => Array<boolean>(nz - 1).fill(true));
  const degree = (i: number, j: number) =>
    (i > 0 && eastWest[i - 1][j] ? 1 : 0) + (i < nx - 1 && eastWest[i][j] ? 1 : 0) + (j > 0 && northSouth[i][j - 1] ? 1 : 0) + (j < nz - 1 && northSouth[i][j] ? 1 : 0);
  const merged = new Set<string>();
  const cellKey = (i: number, j: number) => `${i},${j}`;
  const candidates: { kind: 'ew' | 'ns'; i: number; j: number }[] = [];
  for (let i = 0; i < nx - 1; i++) for (let j = 1; j < nz - 1; j++) candidates.push({ kind: 'ew', i, j });
  // Never a district's edge street: each block stays in one district.
  const edges = new Set(CITY_ZONES.flatMap((z) => DISTRICT_COLUMNS[z]));
  for (let i = 1; i < nx - 1; i++) for (let j = 0; j < nz - 1; j++) if (!edges.has(i)) candidates.push({ kind: 'ns', i, j });
  for (let k = candidates.length - 1; k > 0; k--) {
    const r = Math.floor(rng() * (k + 1));
    [candidates[k], candidates[r]] = [candidates[r], candidates[k]];
  }
  const pairs: [string, string][] = [];
  for (const c of candidates) {
    // The two blocks either side of this street, and its two junctions.
    const [a, b, n1, n2] =
      c.kind === 'ew'
        ? [cellKey(c.i, c.j - 1), cellKey(c.i, c.j), [c.i, c.j], [c.i + 1, c.j]]
        : [cellKey(c.i - 1, c.j), cellKey(c.i, c.j), [c.i, c.j], [c.i, c.j + 1]];
    const zone = zoneOfColumn(c.kind === 'ew' ? c.i : c.i - (rng() < 0.5 ? 1 : 0));
    if (merged.has(a) || merged.has(b) || rng() >= PLANS[zone].merge) continue;
    if (degree(n1[0], n1[1]) < 4 || degree(n2[0], n2[1]) < 4) continue;
    if (c.kind === 'ew') eastWest[c.i][c.j] = false;
    else northSouth[c.i][c.j] = false;
    merged.add(a);
    merged.add(b);
    pairs.push([a, b]);
  }

  // ---- junction pieces: how far each junction's piece reaches along its streets
  const reach = new Map<string, number>();
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const mask =
        (j < nz - 1 && northSouth[i][j] ? N : 0) | (i < nx - 1 && eastWest[i][j] ? E : 0) | (j > 0 && northSouth[i][j - 1] ? S : 0) | (i > 0 && eastWest[i - 1][j] ? W : 0);
      const x = xs[i];
      const z = zs[j];
      const y = KERB_HEIGHT;
      let k: number;
      if ((k = turnsTo(N | E | S | W, mask)) >= 0) {
        streets.push({ piece: 'Street_4WayIntersection', x, y, z, yaw: 0 });
        reach.set(cellKey(i, j), JUNCTION_HALF);
      } else if ((k = turnsTo(E | W | S, mask)) >= 0) {
        streets.push({ piece: 'Street_TIntersection', x, y, z, yaw: (k * Math.PI) / 2 });
        reach.set(cellKey(i, j), JUNCTION_HALF);
      } else if ((k = turnsTo(S | W, mask)) >= 0) {
        // The corner curve's origin sits 9 m from the corner along both streets.
        const yaw = (k * Math.PI) / 2;
        const [ox, oz] = rotate(CURVE_REACH, CURVE_REACH, yaw);
        streets.push({ piece: 'Street_Curve_4LaneShort', x: x - ox, y, z: z - oz, yaw });
        reach.set(cellKey(i, j), CURVE_REACH);
      } else if ((k = turnsTo(E | W, mask)) >= 0) {
        // A street straight through (its cross street left out): fill the junction's square with road.
        const yaw = k % 2 === 0 ? 0 : Math.PI / 2;
        const count = Math.round((2 * JUNCTION_HALF) / SEGMENT);
        const sx = (2 * JUNCTION_HALF) / (count * SEGMENT);
        for (let s = 0; s < count; s++) {
          const [ox, oz] = rotate((s - (count - 1) / 2) * SEGMENT * sx, 0, yaw);
          streets.push({ piece: 'Street_4Lane', x: x + ox, y, z: z + oz, yaw, sx });
        }
        reach.set(cellKey(i, j), JUNCTION_HALF);
      }
      roads.push({ x0: x - HALF_STREET, x1: x + HALF_STREET, z0: z - HALF_STREET, z1: z + HALF_STREET });
      // Junction corners: traffic lights downtown, stop signs elsewhere (never at the works).
      const zone = zoneAtX(x);
      const arms = [N, E, S, W].filter((bit) => mask & bit).length;
      if (zone !== 'industrial' && arms >= 3) {
        const corner = JUNCTION_HALF - 5;
        for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
          if (zone === 'commercial') addProp('traffic-light-2', x + sx * corner, z + sz * corner, sz > 0 ? 'N' : 'S');
          else if (sx === sz) addProp('stop-sign', x + sx * corner, z + sz * corner, sx > 0 ? 'E' : 'W');
        }
      }
    }
  }

  // ---- straight streets between junctions, street lamps along both sidewalks, and spots on them
  const addStreet = (ax: number, az: number, bx: number, bz: number, ra: number, rb: number) => {
    const alongX = az === bz;
    const length = (alongX ? bx - ax : bz - az) - ra - rb;
    const count = Math.max(1, Math.round(length / SEGMENT));
    const sx = length / (count * SEGMENT);
    const yaw = alongX ? 0 : -Math.PI / 2; // the piece runs along its own X
    const heading = alongX ? Math.PI / 2 : 0;
    for (let s = 0; s < count; s++) {
      const t = (alongX ? ax : az) + ra + (s + 0.5) * SEGMENT * sx;
      const x = alongX ? t : ax;
      const z = alongX ? az : t;
      streets.push({ piece: 'Street_4Lane', x, y: KERB_HEIGHT, z, yaw, sx });
      if (s % 2 === 1) spots.push({ x, z, heading, zone: zoneAtX(x) });
    }
    roads.push(
      alongX
        ? { x0: ax + ra, x1: bx - rb, z0: az - HALF_STREET, z1: az + HALF_STREET }
        : { x0: ax - HALF_STREET, x1: ax + HALF_STREET, z0: az + ra, z1: bz - rb },
    );
    // Lamps every ~32 m, alternating sides, by the kerb with the arm out over the road.
    const lamps = Math.max(1, Math.round(length / 32));
    for (let l = 0; l < lamps; l++) {
      const t = (alongX ? ax : az) + ra + ((l + 0.5) * length) / lamps;
      const side = l % 2 === 0 ? 1 : -1;
      const off = HALF_STREET - SIDEWALK_WIDTH + 0.5;
      const x = alongX ? t : ax + side * off;
      const z = alongX ? az + side * off : t;
      addLamp(x, z, alongX ? 0 : -side, alongX ? -side : 0, zoneAtX(x), l);
    }
    const zone = zoneAtX(alongX ? (ax + bx) / 2 : ax);
    if (zone === 'industrial') return;
    const from = (alongX ? ax : az) + ra;
    const to = (alongX ? bx : bz) - rb;
    const at = (t: number, off: number): [number, number] => (alongX ? [t, az + off] : [ax + off, t]);
    const lampAt = (t: number) => Array.from({ length: lamps }, (_, l) => from + ((l + 0.5) * length) / lamps).some((lt) => Math.abs(lt - t) < 4);
    // Street trees along the kerb side of both sidewalks, between the lamps.
    const trees = Math.max(1, Math.round(length / 20));
    for (let k = 0; k < trees; k++) {
      const t = from + ((k + 0.5) * length) / trees;
      if (lampAt(t)) continue;
      for (const side of [1, -1]) {
        if (rng() < 0.4) continue;
        const [x, z] = at(t, side * (HALF_STREET - SIDEWALK_WIDTH + 1));
        addTree(pick(rng, zone === 'commercial' ? ['tree-4', 'tree-5'] : TREES), x, z, 0.6, 0.8);
      }
    }
    // Furniture along the building side of the sidewalks, facing the road: benches with a bin,
    // hydrants, mailboxes, power boxes and now and then a bus stop.
    for (const side of [1, -1]) {
      const face: Side = alongX ? (side > 0 ? 'S' : 'N') : side > 0 ? 'W' : 'E';
      const back = side * (HALF_STREET - 0.55);
      let busStop = length > 40 && rng() < 0.35;
      for (let t = from + between(rng, 5, 12); t < to - 4; t += between(rng, 9, 20)) {
        const r = rng();
        if (busStop && t > from + length / 3) {
          const [x, z] = at(t, side * (HALF_STREET - 1.4));
          addProp('bus-stop', x, z, face);
          const [sx, sz] = at(t + 3.2, side * (HALF_STREET - SIDEWALK_WIDTH + 0.4));
          addProp('bus-stop-sign', sx, sz, face);
          busStop = false;
          t += 4;
        } else if (r < 0.25) {
          const [x, z] = at(t, back);
          addProp('bench', x, z, face);
          const [bx2, bz2] = at(t + 1.4, back);
          addProp('trash-can', bx2, bz2, face);
        } else if (r < 0.37) {
          const [x, z] = at(t, side * (HALF_STREET - SIDEWALK_WIDTH + 0.5));
          addProp('fire-hydrant', x, z, face);
        } else if (r < 0.47 && zone === 'residential') {
          const [x, z] = at(t, back);
          addProp('mailbox', x, z, face);
        } else if (r < 0.52) {
          const [x, z] = at(t, back);
          addProp('power-box', x, z, face);
        } else if (r < 0.58 && zone === 'commercial') {
          const [x, z] = at(t, back);
          addProp('atm', x, z, face);
        }
      }
    }
  };
  const addLamp = (x: number, z: number, dx: number, dz: number, zone: CityZone, n: number) => {
    const pole = 7.2;
    const arm = 1.8;
    shapes.push({ kind: 'cylinder', x, y: KERB_HEIGHT, z, w: 0.18, h: pole, d: 0.18, yaw: 0, color: '#23232b' });
    shapes.push({ kind: 'box', x: x + (dx * arm) / 2, y: KERB_HEIGHT + pole - 0.1, z: z + (dz * arm) / 2, w: dx !== 0 ? arm : 0.12, h: 0.12, d: dz !== 0 ? arm : 0.12, yaw: 0, color: '#23232b' });
    colliders.push({ x, y: KERB_HEIGHT + pole / 2, z, hx: 0.12, hy: pole / 2, hz: 0.12 });
    const colour = zone === 'commercial' ? (n % 3 === 0 ? PINK : CYAN) : zone === 'industrial' && n % 4 === 0 ? CYAN : AMBER;
    lights.push({ x: x + dx * arm, y: KERB_HEIGHT + pole - 0.25, z: z + dz * arm, color: colour });
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (i < nx - 1 && eastWest[i][j]) addStreet(xs[i], zs[j], xs[i + 1], zs[j], reach.get(cellKey(i, j))!, reach.get(cellKey(i + 1, j))!);
      if (j < nz - 1 && northSouth[i][j]) addStreet(xs[i], zs[j], xs[i], zs[j + 1], reach.get(cellKey(i, j))!, reach.get(cellKey(i, j + 1))!);
    }
  }

  // ---- blocks: the ground between streets (two cells where a street was left out)
  const cellRect = (i: number, j: number): Rect => ({ x0: xs[i] + HALF_STREET, x1: xs[i + 1] - HALF_STREET, z0: zs[j] + HALF_STREET, z1: zs[j + 1] - HALF_STREET });
  const done = new Set<string>();
  const union = (a: Rect, b: Rect): Rect => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) });
  const parse = (key: string) => key.split(',').map(Number) as [number, number];
  for (const [a, b] of pairs) {
    const rect = union(cellRect(...parse(a)), cellRect(...parse(b)));
    blocks.push({ ...rect, zone: zoneAtX((rect.x0 + rect.x1) / 2) });
    done.add(a);
    done.add(b);
  }
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nz - 1; j++) {
      if (done.has(cellKey(i, j))) continue;
      blocks.push({ ...cellRect(i, j), zone: zoneOfColumn(i) });
    }
  }
  // Each block and the sidewalks round it are one raised slab.
  for (const b of blocks) {
    colliders.push({
      x: (b.x0 + b.x1) / 2,
      y: KERB_HEIGHT / 2,
      z: (b.z0 + b.z1) / 2,
      hx: (b.x1 - b.x0) / 2 + SIDEWALK_WIDTH,
      hy: KERB_HEIGHT / 2,
      hz: (b.z1 - b.z0) / 2 + SIDEWALK_WIDTH,
    });
  }
  // The ring road's outer sidewalk.
  const halfX = CITY_WIDTH / 2;
  const halfZ = CITY_DEPTH / 2;
  const cx = bounds.x0 + halfX;
  const cz = bounds.z0 + halfZ;
  for (const s of [-1, 1]) {
    colliders.push({ x: cx, y: KERB_HEIGHT / 2, z: cz + s * (halfZ - SIDEWALK_WIDTH / 2), hx: halfX, hy: KERB_HEIGHT / 2, hz: SIDEWALK_WIDTH / 2 });
    colliders.push({ x: cx + s * (halfX - SIDEWALK_WIDTH / 2), y: KERB_HEIGHT / 2, z: cz, hx: SIDEWALK_WIDTH / 2, hy: KERB_HEIGHT / 2, hz: halfZ });
  }

  // ---- buildings, then plazas, parking and yards in what's left of each block
  for (const block of blocks) {
    if (block.zone === 'industrial') fillBlock(block);
    else fillTownBlock(block, block.zone);
  }

  // ---- town blocks: a cluster of buildings in the middle (or a park, or a square), all on a lawn

  function fillTownBlock(block: CityBlock, zone: 'residential' | 'commercial') {
    lots.push({ kind: 'lawn', x0: block.x0, z0: block.z0, x1: block.x1, z1: block.z1 });
    const taken: Rect[] = [];
    const roll = rng();
    const kind = roll < (zone === 'commercial' ? 0.8 : 0.74) ? 'cluster' : roll < 0.92 ? 'park' : 'square';
    if (kind === 'cluster') placeCluster(block, zone, taken);
    else if (kind === 'park') placePark(block, taken);
    else placeSquare(block, taken);
    plant(block, zone, kind, taken);
  }

  /** World bounds of a town building turned by yaw, relative to its origin. */
  function turnedBounds(model: TownBuilding, yaw: number): Rect {
    const [x0, x1, z0, z1] = TOWN_BUILDINGS[model];
    const corners = [rotate(x0, z0, yaw), rotate(x1, z0, yaw), rotate(x0, z1, yaw), rotate(x1, z1, yaw)];
    return {
      x0: Math.min(...corners.map((c) => c[0])),
      x1: Math.max(...corners.map((c) => c[0])),
      z0: Math.min(...corners.map((c) => c[1])),
      z1: Math.max(...corners.map((c) => c[1])),
    };
  }

  /**
   * 3 to 10 buildings shoulder to shoulder in the middle of the block: one row facing a street, or two
   * rows back to back facing opposite streets. Each in its own colours, with flower beds along the
   * fronts and a path from every door to the sidewalk.
   */
  function placeCluster(block: CityBlock, zone: 'residential' | 'commercial', taken: Rect[]) {
    const count = pick(rng, CLUSTER_SIZES[zone]);
    const rows = count <= 5 ? 1 : 2;
    const alongX = block.x1 - block.x0 >= block.z1 - block.z0 ? rng() < 0.75 : rng() < 0.25;
    const span = alongX ? block.x1 - block.x0 : block.z1 - block.z0;
    const cx = (block.x0 + block.x1) / 2;
    const cz = (block.z0 + block.z1) / 2;
    let lastSkin = -1;
    const all: Rect[] = [];
    for (let row = 0; row < rows; row++) {
      const wanted = row === 0 ? Math.ceil(count / rows) : Math.floor(count / rows);
      // Facing: two rows look out both ways; a single row picks one.
      const outward = rows === 2 ? row === 0 : rng() < 0.5;
      const face: Side = alongX ? (outward ? 'N' : 'S') : outward ? 'E' : 'W';
      const yaw = FACING[face];
      const models: TownBuilding[] = [];
      let length = 0;
      for (let k = 0; k < wanted; k++) {
        const model = pick(rng, TOWN_SETS[zone]);
        const b = turnedBounds(model, yaw);
        const w = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
        if (length + w > span - 12) break;
        models.push(model);
        length += w;
      }
      // Single rows sit back from the middle a little, leaving a bigger garden in front.
      const line = rows === 2 ? 0 : (outward ? -1 : 1) * between(rng, 0, 4);
      let cursor = (alongX ? cx : cz) - length / 2;
      for (const [index, model] of models.entries()) {
        const b = turnedBounds(model, yaw);
        // The back of the building on the row's line, its side at the cursor.
        let x: number;
        let z: number;
        if (alongX) {
          x = cursor - b.x0;
          z = face === 'N' ? cz + line - b.z0 : cz + line - b.z1;
          cursor += b.x1 - b.x0;
        } else {
          z = cursor - b.z0;
          x = face === 'E' ? cx + line - b.x0 : cx + line - b.x1;
          cursor += b.z1 - b.z0;
        }
        const rect = { x0: x + b.x0, x1: x + b.x1, z0: z + b.z0, z1: z + b.z1 };
        let skin = intBetween(rng, 0, TOWN_SKINS - 1);
        if (skin === lastSkin) skin = (skin + 1) % TOWN_SKINS;
        lastSkin = skin;
        const height = TOWN_BUILDINGS[model][4];
        const building: CityBuilding = { zone, style: 'town', ...rect, height, face, pieces: [{ piece: `ub/${model}`, x, y: KERB_HEIGHT, z, yaw, skin, room: intBetween(rng, 0, 9999) }] };
        buildings.push(building);
        all.push(rect);
        // Collide with the walls, not the steps in front (you walk up those): trim the front back to
        // where a square body would end (the back is as far behind the middle as that front).
        const coreRect = { ...rect };
        const [ox, oz] = OUT[face];
        const [, , back, frontEdge] = TOWN_BUILDINGS[model];
        const steps = frontEdge + back;
        if (steps > 0.2) {
          if (ox > 0) coreRect.x1 -= steps;
          if (ox < 0) coreRect.x0 += steps;
          if (oz > 0) coreRect.z1 -= steps;
          if (oz < 0) coreRect.z0 += steps;
        }
        colliders.push({ x: (coreRect.x0 + coreRect.x1) / 2, y: KERB_HEIGHT + height / 2, z: (coreRect.z0 + coreRect.z1) / 2, hx: (coreRect.x1 - coreRect.x0) / 2, hy: height / 2, hz: (coreRect.z1 - coreRect.z0) / 2 });
        addSigns(building);
        // Neighbours share a path to the street (every other door), so a row isn't striped with them.
        frontGarden(block, zone, rect, face, taken, index % 2 === 0);
      }
    }
    if (all.length) {
      const r = all.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) }));
      taken.push({ x0: r.x0 - 1.5, x1: r.x1 + 1.5, z0: r.z0 - 1.5, z1: r.z1 + 1.5 });
    }
  }

  /** A path from a building's door out to the sidewalk (if `path`), with flowers along the front. */
  function frontGarden(block: CityBlock, zone: 'residential' | 'commercial', rect: Rect, face: Side, taken: Rect[], withPath: boolean) {
    const alongX = face === 'N' || face === 'S';
    const door = alongX ? (rect.x0 + rect.x1) / 2 : (rect.z0 + rect.z1) / 2;
    const front = face === 'N' ? rect.z1 : face === 'S' ? rect.z0 : face === 'E' ? rect.x1 : rect.x0;
    const edge = face === 'N' ? block.z1 : face === 'S' ? block.z0 : face === 'E' ? block.x1 : block.x0;
    const [lo, hi] = front < edge ? [front, edge] : [edge, front];
    const half = 0.8;
    const path = alongX ? { x0: door - half, x1: door + half, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: door - half, z1: door + half };
    if (withPath) {
      lots.push({ kind: 'path', ...path });
      taken.push({ x0: path.x0 - 0.6, x1: path.x1 + 0.6, z0: path.z0 - 0.6, z1: path.z1 + 0.6 });
    }
    // A flower bed along the front, 1.3 m out, leaving the path clear.
    const out = Math.sign(edge - front) * 1.3;
    const a0 = alongX ? rect.x0 : rect.z0;
    const a1 = alongX ? rect.x1 : rect.z1;
    if (Math.abs(edge - front) > 3) {
      for (let t = a0 + 0.6; t < a1 - 0.4; t += between(rng, 0.9, 1.5)) {
        if (Math.abs(t - door) < 1.6) continue;
        const [x, z] = alongX ? [t, front + out] : [front + out, t];
        if (zone === 'commercial' && rng() < 0.3) addProp('planter-bushes', x, z, face, false);
        else addPlant(pick(rng, FLOWERS), x, z, 0.8, 1.2);
      }
    }
    if (withPath && zone === 'residential' && rng() < 0.5) {
      // A mailbox by the path where it meets the sidewalk.
      const t = door + 1.4;
      const at = edge - Math.sign(edge - front) * 0.8;
      const [x, z] = alongX ? [t, at] : [at, t];
      addProp('mailbox', x, z, face);
    }
  }

  /** A park: crossing paths, benches and bins along them, trees and a big old tree in one corner. */
  function placePark(block: CityBlock, taken: Rect[]) {
    const cx = (block.x0 + block.x1) / 2;
    const cz = (block.z0 + block.z1) / 2;
    const half = 1.3;
    const paths = [
      { x0: block.x0, x1: block.x1, z0: cz - half, z1: cz + half },
      { x0: cx - half, x1: cx + half, z0: block.z0, z1: block.z1 },
    ];
    for (const path of paths) {
      lots.push({ kind: 'path', ...path });
      taken.push({ x0: path.x0 - 0.8, x1: path.x1 + 0.8, z0: path.z0 - 0.8, z1: path.z1 + 0.8 });
    }
    // Benches facing the paths, each with a bin.
    for (const [dx, dz, face] of [[8, 1, 'S'], [-8, -1, 'N'], [1, 8, 'W'], [-1, -8, 'E']] as const) {
      const off = half + 1.2;
      const x = cx + (Math.abs(dx) > 1 ? dx : dx * off);
      const z = cz + (Math.abs(dz) > 1 ? dz : dz * off);
      addProp('bench', x, z, face);
      addProp('trash-can', x + (face === 'N' || face === 'S' ? 1.5 : 0), z + (face === 'E' || face === 'W' ? 1.5 : 0), face);
    }
    // A big old tree in the middle of one quarter.
    const qx = cx + (rng() < 0.5 ? -1 : 1) * (block.x1 - block.x0) / 4;
    const qz = cz + (rng() < 0.5 ? -1 : 1) * (block.z1 - block.z0) / 4;
    addTree(pick(rng, ['twisted-tree', 'twisted-tree-3']), qx, qz, 0.6, 0.75);
    taken.push({ x0: qx - 5, x1: qx + 5, z0: qz - 5, z1: qz + 5 });
    for (let r = intBetween(rng, 2, 4); r > 0; r--) {
      addPlant(pick(rng, ['rock-medium', 'rock-medium-3']), between(rng, block.x0 + 3, block.x1 - 3), between(rng, block.z0 + 3, block.z1 - 3), 0.7, 1.2);
    }
  }

  /** A paved square with planters, and a parking lot beside it. */
  function placeSquare(block: CityBlock, taken: Rect[]) {
    const w = block.x1 - block.x0;
    const d = block.z1 - block.z0;
    const plaza = { x0: block.x0 + 4, x1: block.x0 + w * 0.55, z0: block.z0 + 4, z1: block.z1 - 4 };
    lots.push({ kind: 'plaza', ...plaza });
    taken.push(plaza);
    for (let t = 0; t < 5; t++) {
      const px = between(rng, plaza.x0 + 2, plaza.x1 - 2);
      const pz = between(rng, plaza.z0 + 2, plaza.z1 - 2);
      props.push({ piece: 'Prop_Planter_Single', x: px, y: KERB_HEIGHT, z: pz, yaw: 0 });
      colliders.push({ x: px, y: KERB_HEIGHT + 0.3, z: pz, hx: 1, hy: 0.3, hz: 1 });
      addPlant(pick(rng, FLOWERS), px, pz, 0.7, 0.9);
    }
    addProp('bench', (plaza.x0 + plaza.x1) / 2, plaza.z0 + 1.5, 'N');
    const bays = Math.floor((d - 8) / 2.6) * 2.6;
    const parking = { x0: block.x0 + w * 0.6, x1: block.x0 + w * 0.6 + 17, z0: block.z0 + 4, z1: block.z0 + 4 + bays };
    if (parking.x1 < block.x1 - 2) {
      lots.push({ kind: 'parking', ...parking });
      taken.push(parking);
    }
  }

  /** Trees, bushes, flowers, grass tufts and rocks on the open lawn, kept off buildings and paths. */
  function plant(block: CityBlock, zone: 'residential' | 'commercial', kind: 'cluster' | 'park' | 'square', taken: Rect[]) {
    const placed: [number, number, number][] = []; // x, z, radius
    const tryAt = (radius: number, inset: number): [number, number] | undefined => {
      for (let t = 0; t < 14; t++) {
        const x = between(rng, block.x0 + inset, block.x1 - inset);
        const z = between(rng, block.z0 + inset, block.z1 - inset);
        if (taken.some((r) => x > r.x0 - radius && x < r.x1 + radius && z > r.z0 - radius && z < r.z1 + radius)) continue;
        if (placed.some(([px, pz, pr]) => (px - x) ** 2 + (pz - z) ** 2 < (pr + radius) ** 2)) continue;
        placed.push([x, z, radius]);
        return [x, z];
      }
      return undefined;
    };
    const area = ((block.x1 - block.x0) * (block.z1 - block.z0)) / 3000; // about 1 for a normal block
    const trees = Math.round((kind === 'park' ? intBetween(rng, 14, 20) : kind === 'square' ? 3 : intBetween(rng, 4, 7)) * area);
    const kinds = zone === 'commercial' ? [...TREES, 'tree-4', 'tree-5'] : [...TREES, ...PINES];
    for (let t = 0; t < trees; t++) {
      const at = tryAt(2.6, 3);
      if (at) addTree(pick(rng, kinds), at[0], at[1]);
    }
    for (let b = Math.round(intBetween(rng, 5, 10) * area); b > 0; b--) {
      const at = tryAt(1, 1.2);
      if (at) addPlant(pick(rng, ['bush', 'bush', 'bush-with-flowers']), at[0], at[1], 0.9, 1.3);
    }
    for (let f = Math.round(intBetween(rng, 6, 12) * area); f > 0; f--) {
      const at = tryAt(0.6, 1);
      if (at) addPlant(pick(rng, FLOWERS), at[0], at[1], 0.8, 1.2);
    }
    for (let g = Math.round(intBetween(rng, 30, 50) * area); g > 0; g--) {
      const at = tryAt(0.3, 0.8);
      if (at) addPlant(pick(rng, GROUND_COVER), at[0], at[1], 0.8, 1.4);
    }
    // A billboard by a downtown corner, facing the wider street.
    if (zone === 'commercial' && kind !== 'park' && rng() < 0.3) {
      const sx = rng() < 0.5 ? 1 : -1;
      const x = sx > 0 ? block.x1 - 4 : block.x0 + 4;
      const z = (block.z0 + block.z1) / 2 + between(rng, -8, 8);
      if (!taken.some((r) => x > r.x0 - 4 && x < r.x1 + 4 && z > r.z0 - 4 && z < r.z1 + 4)) addProp(rng() < 0.5 ? 'billboard' : 'billboard-2', x, z, sx > 0 ? 'E' : 'W');
    }
  }

  function fillBlock(block: CityBlock) {
    const plan = PLANS[block.zone];
    const taken: Rect[] = [];
    const wanted = intBetween(rng, plan.buildings[0], plan.buildings[1]);
    for (let tries = 0; taken.length < wanted && tries < wanted * 12; tries++) {
      const face = pick(rng, ['N', 'S', 'E', 'W'] as const);
      const landmark = rng() < plan.landmark ? pick(rng, Object.keys(LANDMARKS) as Landmark[]) : undefined;
      // w runs along the front, d back from it.
      const { w, d } = landmark ? landmarkFootprint(landmark) : moduleFootprint(plan);
      const along = face === 'N' || face === 'S';
      const span = along ? block.x1 - block.x0 : block.z1 - block.z0;
      if (w > span - 4) continue;
      const setback = between(rng, plan.setback[0], plan.setback[1]);
      const start = between(rng, 2, span - w - 2);
      const rect: Rect = along
        ? { x0: block.x0 + start, x1: block.x0 + start + w, z0: face === 'S' ? block.z0 + setback : block.z1 - setback - d, z1: face === 'S' ? block.z0 + setback + d : block.z1 - setback }
        : { z0: block.z0 + start, z1: block.z0 + start + w, x0: face === 'W' ? block.x0 + setback : block.x1 - setback - d, x1: face === 'W' ? block.x0 + setback + d : block.x1 - setback };
      if (rect.x0 < block.x0 || rect.x1 > block.x1 || rect.z0 < block.z0 || rect.z1 > block.z1) continue;
      if (taken.some((t) => overlaps(t, rect, plan.gap))) continue;
      taken.push(rect);
      const building = landmark ? placeLandmark(landmark, rect, face, block.zone) : assemble(rect, face, block.zone, plan);
      buildings.push(building);
      colliders.push({ x: (rect.x0 + rect.x1) / 2, y: KERB_HEIGHT + building.height / 2, z: (rect.z0 + rect.z1) / 2, hx: (rect.x1 - rect.x0) / 2, hy: building.height / 2, hz: (rect.z1 - rect.z0) / 2 });
      addSigns(building);
    }

    // Open ground: a parking lot or two, a plaza (downtown) or works yard (industry), the rest paving or dirt.
    const free = (w: number, d: number, gap = 3): Rect | undefined => {
      for (let tries = 0; tries < 30; tries++) {
        const x0 = between(rng, block.x0 + 2, block.x1 - w - 2);
        const z0 = between(rng, block.z0 + 2, block.z1 - d - 2);
        const rect = { x0, z0, x1: x0 + w, z1: z0 + d };
        if (block.x1 - block.x0 < w + 4 || block.z1 - block.z0 < d + 4) return undefined;
        if (!taken.some((t) => overlaps(t, rect, gap))) return rect;
      }
      return undefined;
    };
    const parkings = block.zone === 'industrial' ? 1 : intBetween(rng, 1, 2);
    for (let p = 0; p < parkings; p++) {
      const across = rng() < 0.5;
      const bays = intBetween(rng, 5, 10) * 2.6;
      const rect = free(across ? bays : 17, across ? 17 : bays);
      if (!rect) continue;
      taken.push(rect);
      lots.push({ kind: 'parking', ...rect });
    }
    if (block.zone === 'commercial') {
      const rect = free(between(rng, 22, 36), between(rng, 18, 30));
      if (rect) {
        taken.push(rect);
        lots.push({ kind: 'plaza', ...rect });
        // Planters round the plaza and bollards along its edge.
        for (let t = 0; t < 4; t++) {
          const px = between(rng, rect.x0 + 2, rect.x1 - 2);
          const pz = between(rng, rect.z0 + 2, rect.z1 - 2);
          props.push({ piece: 'Prop_Planter_Single', x: px, y: KERB_HEIGHT, z: pz, yaw: 0 });
          colliders.push({ x: px, y: KERB_HEIGHT + 0.3, z: pz, hx: 1, hy: 0.3, hz: 1 });
        }
        for (let bx = rect.x0 + 1; bx < rect.x1; bx += 2.5) props.push({ piece: 'Prop_Bollard', x: bx, y: KERB_HEIGHT, z: rect.z0, yaw: 0 });
      }
    }
    if (block.zone === 'industrial') {
      const rect = free(between(rng, 30, 50), between(rng, 24, 36), 1);
      if (rect) {
        taken.push(rect);
        lots.push({ kind: 'yard', ...rect });
        fillYard(rect);
      }
    }
    if (block.zone !== 'commercial' && rng() < 0.5) {
      const rect = free(between(rng, 16, 30), between(rng, 14, 24));
      if (rect) lots.push({ kind: 'dirt', ...rect });
    }
  }

  /** Width (along the front) and depth of a building made of modules, metres. */
  function moduleFootprint(plan: ZonePlan) {
    return { w: intBetween(rng, plan.width[0], plan.width[1]) * MODULE, d: intBetween(rng, plan.depth[0], plan.depth[1]) * MODULE };
  }

  function landmarkFootprint(landmark: Landmark) {
    const b = LANDMARKS[landmark];
    return { w: b.x1 - b.x0, d: b.z1 - b.z0 };
  }

  /** One of the kit's ready-made buildings, turned to face the street, filling `rect`. */
  function placeLandmark(landmark: Landmark, rect: Rect, face: Side, zone: CityZone): CityBuilding {
    const b = LANDMARKS[landmark];
    const yaw = FACING[face];
    // Where the authored bounds' centre lands once turned; move it onto the rect's centre.
    const [ox, oz] = rotate((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, yaw);
    const x = (rect.x0 + rect.x1) / 2 - ox;
    const z = (rect.z0 + rect.z1) / 2 - oz;
    return { zone, style: 'landmark', ...rect, height: b.height, face, pieces: [{ piece: landmark, x, y: KERB_HEIGHT, z, yaw, room: intBetween(rng, 0, 9999) }] };
  }

  /** A building assembled from wall modules: shop floor, upper storeys, corner columns, cornice and roof. */
  function assemble(rect: Rect, face: Side, zone: CityZone, plan: ZonePlan): CityBuilding {
    const style = pick(rng, plan.styles);
    const kit = STYLES[style];
    const floors = intBetween(rng, plan.floors[0], plan.floors[1]);
    const height = floors * FLOOR;
    const pieces: CityPiece[] = [];
    const window = pick(rng, kit.windows);
    const wide = kit.wideWindows.length > 0 && rng() < 0.5 ? pick(rng, kit.wideWindows) : undefined;
    // Industrial halls: tall plain walls with a row of high windows at the top.
    const hall = style === 'works';
    const room = () => intBetween(rng, 0, 9999);

    for (const side of ['N', 'E', 'S', 'W'] as Side[]) {
      const yaw = FACING[side];
      const alongX = side === 'N' || side === 'S';
      const from = alongX ? rect.x0 : rect.z0;
      const modules = Math.round(((alongX ? rect.x1 - rect.x0 : rect.z1 - rect.z0) / MODULE));
      const line = side === 'N' ? rect.z1 : side === 'S' ? rect.z0 : side === 'E' ? rect.x1 : rect.x0;
      const at = (m: number, width = 1) => {
        const t = from + (m + width / 2) * MODULE;
        return alongX ? { x: t, z: line } : { x: line, z: t };
      };
      const front = side === face;
      const door = Math.floor(modules / 2);
      for (let f = 0; f < floors; f++) {
        const y = KERB_HEIGHT + f * FLOOR;
        for (let m = 0; m < modules; m++) {
          let piece: string;
          if (f === 0) {
            if (front && m === door) piece = kit.door;
            else if (hall) piece = front && m % 4 === 1 ? kit.door : kit.shopWall;
            else piece = front || (m + f) % 3 === 0 ? kit.shopWindow : kit.shopWall;
          } else if (hall) {
            piece = f === floors - 1 && m % 2 === 0 ? window : kit.wall;
          } else if (wide && m + 1 < modules && m % 2 === 0 && (front || side === 'S' || side === 'N')) {
            // A 4 m window over two modules.
            const p = at(m, 2);
            pieces.push({ piece: wide, ...p, y, yaw, room: room() });
            m++;
            continue;
          } else {
            piece = !front && (m + f) % 4 === 3 ? kit.wall : window;
          }
          pieces.push({ piece, ...at(m), y, yaw, room: room() });
          if (piece === kit.door && piece !== 'DoorFrame_Wooden') {
            // Two door leaves in the frame, a step inside the wall.
            const p = at(m);
            const [ix, iz] = rotate(0, -0.12, yaw);
            const [lx, lz] = rotate(1, 0, yaw);
            pieces.push({ piece: 'Door_2', x: p.x + ix, y, z: p.z + iz, yaw });
            pieces.push({ piece: 'Door_2', x: p.x + ix + lx, y, z: p.z + iz + lz, yaw });
          }
        }
        // Corner column: this side's left-hand corner (looking at it), for every storey.
        const corner = f === 0 ? kit.corner[0] : f === floors - 1 ? kit.corner[2] : kit.corner[1];
        const c = cornerPoint(rect, side);
        pieces.push({ piece: corner, x: c.x, y, z: c.z, yaw: kit.cornerTucked ? yaw : 0 });
      }
      // Cornice along the roof line.
      for (let m = 0; m < modules; m++) pieces.push({ piece: kit.cornice, ...at(m), y: KERB_HEIGHT + height, yaw });
    }
    // Flat roof in 4 m tiles (2 m along an odd edge), with a few AC units.
    const top = KERB_HEIGHT + height + 0.2; // roof tiles sit 0.2 m below their origin
    for (let x = rect.x0; x < rect.x1 - 0.01; x += 4) {
      for (let z = rect.z0; z < rect.z1 - 0.01; z += 4) {
        const w = Math.min(4, rect.x1 - x);
        const d = Math.min(4, rect.z1 - z);
        if (w >= 4 && d >= 4) pieces.push({ piece: 'Roof_4x4', x: x + 2, y: top, z: z + 2, yaw: 0 });
        else for (let sx = 0; sx < w - 0.01; sx += 2) for (let sz = 0; sz < d - 0.01; sz += 2) pieces.push({ piece: 'Roof_2x2', x: x + sx + 1, y: top, z: z + sz + 1, yaw: 0 });
      }
    }
    for (let a = intBetween(rng, 1, 4); a > 0; a--) {
      props.push({ piece: 'Prop_ACUnit', x: between(rng, rect.x0 + 2, rect.x1 - 2), y: KERB_HEIGHT + height, z: between(rng, rect.z0 + 2, rect.z1 - 2), yaw: pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]) });
    }
    return { zone, style, ...rect, height, face, pieces };
  }

  /**
   * The corner a side's corner column stands on: walking along the side with the building on your left
   * (the way the side's walls run), its last corner; with the column turned like the side's walls, its
   * outward faces point out of this side and the next.
   */
  function cornerPoint(rect: Rect, side: Side) {
    switch (side) {
      case 'N':
        return { x: rect.x1, z: rect.z1 };
      case 'E':
        return { x: rect.x1, z: rect.z0 };
      case 'S':
        return { x: rect.x0, z: rect.z0 };
      default:
        return { x: rect.x0, z: rect.z1 };
    }
  }

  /** Tanks, a chimney and stacks of containers in a works yard. */
  function fillYard(rect: Rect) {
    const placed: Rect[] = [];
    const tryPlace = (w: number, d: number, make: (x: number, z: number) => void) => {
      for (let t = 0; t < 12; t++) {
        const x = between(rng, rect.x0 + w / 2 + 1, rect.x1 - w / 2 - 1);
        const z = between(rng, rect.z0 + d / 2 + 1, rect.z1 - d / 2 - 1);
        const r = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
        if (placed.some((p) => overlaps(p, r, 1.5))) continue;
        placed.push(r);
        make(x, z);
        return;
      }
    };
    const tankColour = pick(rng, ['#c9ccd1', '#b9bfb5', '#d8d2c4']);
    for (let t = intBetween(rng, 1, 3); t > 0; t--) {
      const size = between(rng, 4, 7);
      const tall = between(rng, 5, 11);
      tryPlace(size, size, (x, z) => {
        shapes.push({ kind: 'cylinder', x, y: KERB_HEIGHT, z, w: size, h: tall, d: size, yaw: 0, color: tankColour });
        colliders.push({ x, y: KERB_HEIGHT + tall / 2, z, hx: size / 2, hy: tall / 2, hz: size / 2 });
      });
    }
    if (rng() < 0.6) {
      tryPlace(2.4, 2.4, (x, z) => {
        const tall = between(rng, 18, 30);
        shapes.push({ kind: 'cylinder', x, y: KERB_HEIGHT, z, w: 1.8, h: tall, d: 1.8, yaw: 0, color: '#8b5a4a' });
        colliders.push({ x, y: KERB_HEIGHT + tall / 2, z, hx: 0.9, hy: tall / 2, hz: 0.9 });
      });
    }
    // Shipping containers (6.1 x 2.6 x 2.4 m), sometimes two high.
    for (let c = intBetween(rng, 3, 8); c > 0; c--) {
      const turned = rng() < 0.5;
      const w = turned ? 2.4 : 6.1;
      const d = turned ? 6.1 : 2.4;
      tryPlace(w, d, (x, z) => {
        const stack = rng() < 0.35 ? 2 : 1;
        for (let s = 0; s < stack; s++) {
          shapes.push({ kind: 'box', x, y: KERB_HEIGHT + s * 2.6, z, w, h: 2.6, d, yaw: 0, color: pick(rng, ['#b8432f', '#2f6db8', '#3f8a4a', '#c78a2a', '#7a7f87']) });
        }
        colliders.push({ x, y: KERB_HEIGHT + (stack * 2.6) / 2, z, hx: w / 2, hy: (stack * 2.6) / 2, hz: d / 2 });
      });
    }
  }

  /**
   * Neon on a building's street front: a tube over the shop fronts, a blade sign sticking out over the
   * sidewalk, a billboard on the roof, and the roof line of the tallest towers. Downtown gets most.
   */
  function addSigns(b: CityBuilding) {
    const r = signRng;
    const height = b.height;
    const base = KERB_HEIGHT;
    const alongX = b.face === 'S' || b.face === 'N';
    const [ox, oz] = OUT[b.face];
    const out = ox + oz; // +1 or -1 along the axis the front faces
    const front = b.face === 'S' ? b.z0 : b.face === 'N' ? b.z1 : b.face === 'W' ? b.x0 : b.x1;
    const a0 = alongX ? b.x0 : b.z0;
    const a1 = alongX ? b.x1 : b.z1;
    const width = a1 - a0;
    const colour = () => (b.zone === 'residential' ? pick(r, [PINK, CYAN, 2, WARM]) : intBetween(r, 0, 5));
    const box = (along: number, halfAlong: number, y: number, hy: number, offset: number, halfOut: number, color: number) => {
      const c = front + out * offset;
      neon.push(alongX ? { x: along, y, z: c, hx: halfAlong, hy, hz: halfOut, color } : { x: c, y, z: along, hx: halfOut, hy, hz: halfAlong, color });
    };
    const chance = b.zone === 'commercial' ? 1 : b.zone === 'industrial' ? 0.35 : 0.6;
    if (r() < 0.85 * chance) box((a0 + a1) / 2, width * between(r, 0.25, 0.42), base + 3.25, 0.09, 0.35, 0.06, colour());
    if (b.zone === 'industrial') return;
    if (height > 10 && r() < 0.65) {
      const end = r() < 0.5 ? a0 + 1.2 : a1 - 1.2;
      const tall = Math.min(between(r, 4, 9), height - 6);
      box(end, 0.1, base + 4.5 + tall / 2, tall / 2, 0.75, 0.45, colour());
    }
    if (b.zone === 'commercial' && height > 8 && height < 26 && r() < 0.35) {
      const w = Math.min(width * 0.6, between(r, 5, 9));
      box((a0 + a1) / 2, w / 2, base + height + 2.2, 1.4, -1.5, 0.12, colour());
    }
    if (height > 26 && r() < 0.75) {
      const c = colour();
      const y = base + height + 0.9;
      const t = 0.12;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const hx = (b.x1 - b.x0) / 2 + 0.3;
      const hz = (b.z1 - b.z0) / 2 + 0.3;
      neon.push({ x: cx, y, z: b.z0 - 0.3, hx, hy: t, hz: t, color: c });
      neon.push({ x: cx, y, z: b.z1 + 0.3, hx, hy: t, hz: t, color: c });
      neon.push({ x: b.x0 - 0.3, y, z: cz, hx: t, hy: t, hz, color: c });
      neon.push({ x: b.x1 + 0.3, y, z: cz, hx: t, hy: t, hz, color: c });
    }
  }

  return {
    seed,
    origin,
    bounds,
    districts: CITY_ZONES.map((zone) => ({
      zone,
      x0: zone === 'residential' ? bounds.x0 : xs[DISTRICT_COLUMNS[zone][0]],
      x1: zone === 'industrial' ? bounds.x1 : xs[DISTRICT_COLUMNS[zone][1]],
    })),
    streets,
    roads,
    buildings,
    props,
    shapes,
    lots,
    blocks,
    colliders,
    spots,
    neon,
    lights,
  };
}

/** The street spot (on a street's centre line) nearest a point. */
export function nearestSpot(city: City, x: number, z: number, zone?: CityZone): CitySpot {
  let best = city.spots[0];
  let bestDistance = Infinity;
  for (const s of city.spots) {
    if (zone && s.zone !== zone) continue;
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}

/** Middle of the kerbside lane on the right at a spot, facing along the street. */
export function laneAt(spot: CitySpot) {
  // Right of the direction of travel is -X when facing +Z.
  const d = LANE_WIDTH * 1.5;
  return { x: spot.x - Math.cos(spot.heading) * d, z: spot.z + Math.sin(spot.heading) * d, heading: spot.heading };
}

/** Middle of the sidewalk on one side of a spot's street (side 1 = right of the direction of travel). */
export function sidewalkAt(spot: CitySpot, side: 1 | -1 = 1) {
  const d = (HALF_STREET - SIDEWALK_WIDTH / 2) * side;
  return { x: spot.x - Math.cos(spot.heading) * d, y: KERB_HEIGHT, z: spot.z + Math.sin(spot.heading) * d, heading: spot.heading };
}

/** Whether someone can stand at a point: inside the city and not inside a building, tank or container. */
export function isOpenGround(city: City, x: number, z: number): boolean {
  const { x0, z0, x1, z1 } = city.bounds;
  if (x < x0 || x > x1 || z < z0 || z > z1) return false;
  const margin = 0.6; // a person's half-width, and a little room
  if (city.buildings.some((b) => x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin)) return false;
  return !city.shapes.some((s) => Math.abs(x - s.x) < s.w / 2 + margin && Math.abs(z - s.z) < s.d / 2 + margin);
}

/**
 * Where to put someone who asked to go to (x, z), e.g. by clicking the map: right there if it's open
 * ground (dropped from just above, so they land on the road or the kerb), else the nearest sidewalk.
 */
export function arrivalAt(city: City, x: number, z: number, heading = 0) {
  if (isOpenGround(city, x, z)) return { x, y: KERB_HEIGHT + 0.05, z, heading };
  return sidewalkAt(nearestSpot(city, x, z));
}

/** Which district a world X falls in. */
export function cityZoneAt(city: City, x: number): CityZone | undefined {
  return city.districts.find((d) => x >= d.x0 && x < d.x1)?.zone;
}

/** The city every game uses unless the room picks another seed. */
export const CITY_SEED = 1;
