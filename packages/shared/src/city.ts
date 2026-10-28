// The city: a seeded generator shared by the server (colliders) and the clients (drawing), so the same
// seed builds the same streets, buildings and props everywhere without sending any of it over the wire.
//
// A bright, friendly neighbourhood about 1 km along X by 600 m along Z, laid out like a life-sim town
// map rather than a crime-city one: quiet two-lane streets (Kenney's City Kit roads) on a grid of blocks
// about 60 m across, with zebra crossings at the corners and curved street lights.
//
//   Maple Grove (-X): detached family houses (Kenney's City Kit Suburban, in four colour schemes), each on
//     its own lot: a front lawn, a stepping-stone path to the door, a driveway with the car, a picket
//     fence round the back garden, a mailbox, trees and flowers. A few blocks are parks; the fire station,
//     school, post office and library are here.
//   Town Centre (middle): rows of shops and small offices (City Kit Commercial) with café parasols out
//     front, and the town hall, police, hospital and bank.
//   Parkside (+X): the community lots: a fairground with food and drink stalls, a skate park, the old
//     graveyard, an arcade, a grocery and a diner you can go into, a food court and parks. An elevated
//     monorail (Kenney's Coaster Kit) runs on pillars right round Parkside along its streets.
//
// Heights: the road surface is y = 0; sidewalks and lots are a kerb (10 cm) above it.

import { InteriorBuilder } from './interior-builder';
import { rooftop } from './interior-plans';
import { type CityInterior, type InteriorKind, buildInterior } from './interiors';

/** Sidewalks and lots stand this far above the road (the height of the road tiles' kerbs). */
export const KERB_HEIGHT = 0.1;
/**
 * A street with its sidewalks, metres: a 10 m road tile (two 3.5 m lanes plus gutters, and a 1 m kerb
 * each side) and 2.5 m of paving beyond each kerb.
 */
export const STREET_WIDTH = 15;
export const LANE_WIDTH = 3.5;
/** Lanes each way (traffic keeps to the right one). */
export const LANES_PER_SIDE = 1;
/** From the edge of a block to the road: the paving plus the road tile's kerb. */
export const SIDEWALK_WIDTH = 3.5;
const HALF_STREET = STREET_WIDTH / 2;
const ROAD_TILE = 10;
/** Road tiles stand this far down, so their asphalt is y = 0 and their kerb strips KERB_HEIGHT. */
const ROAD_Y = -0.1;
/** The paving between a block and the road tile's kerb strip. */
const PAVING = HALF_STREET - ROAD_TILE / 2;
/** How far a junction's tile reaches along each street from its centre. */
const JUNCTION_HALF = ROAD_TILE / 2;
const SEGMENT = ROAD_TILE; // length of one straight street tile

const CITY_WIDTH = 1000;
const CITY_DEPTH = 600;
const BLOCK_COLUMNS = 13;
const BLOCK_ROWS = 8;

export type CityZone = 'residential' | 'commercial' | 'leisure';
export const CITY_ZONES: readonly CityZone[] = ['residential', 'commercial', 'leisure'];
/** What the districts are called on screen. */
export const CITY_ZONE_LABELS: Record<CityZone, string> = { residential: 'Maple Grove', commercial: 'Town Centre', leisure: 'Parkside' };
/** Which block columns (west to east) each district takes. */
const DISTRICT_COLUMNS: Record<CityZone, [number, number]> = { residential: [0, 5], commercial: [5, 10], leisure: [10, 13] };
/** Chance a street between two blocks of a district is left out, making one big block. */
const MERGE: Record<CityZone, number> = { residential: 0.15, commercial: 0.1, leisure: 0.3 };

/** One packed piece placed in the world: turned `yaw` radians about Y, stretched `sx` along its own X. */
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
  /** Inside a building: which storey it stands on (the renderer hides the ones above the player). */
  level?: number;
}

export type BuildingStyle = 'town';

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

/** Ground drawn over a block: lawn, paths, paving for plazas, asphalt with bays for parking, yards, dirt. */
export interface CityLot {
  kind: 'lawn' | 'path' | 'plaza' | 'parking' | 'yard' | 'dirt';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A simple solid made in code (posts, boards, room walls and floors): box or upright cylinder. */
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
  /**
   * Wallpaper or flooring: one of Kenney's pattern tiles (a file name in the pattern packs), drawn in
   * `ink` over `color` and repeating every `tile` metres along every face.
   */
  pattern?: string;
  ink?: string;
  tile?: number;
  /** Inside a building: the storey it's on, and the wall it belongs to (walls are cut away for the camera). */
  level?: number;
  wall?: number;
  /** Lit from within (screens, signs, window glass by day, stage lights), or see-through glass. */
  glow?: boolean;
  glass?: boolean;
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
const VIOLET = 2;
const YELLOW = 4;
const AMBER = 6;
const WARM = 7;

/** A name board in front of a public building or a community lot: drawn as text. */
export interface CitySign {
  text: string;
  /** Centre of the board, metres. */
  x: number;
  y: number;
  z: number;
  /** Turns the board's face (+Z) toward the street, like a building's front. */
  yaw: number;
  w: number;
  h: number;
  /** Board and lettering colours (CSS). */
  background: string;
  color: string;
}

/** The town's public buildings, each on its own block. */
export type CityService = 'police' | 'fire' | 'hospital' | 'school' | 'townHall' | 'bank' | 'post' | 'library';
/** Parkside's community lots. The game centre, event centre, grocery and diner can be gone into. */
export type CityVenue = 'arcade' | 'events' | 'market' | 'diner' | 'fairground' | 'skatepark' | 'graveyard' | 'foodcourt' | 'park';

/** A junction of the street grid, for anything that drives along the streets. */
export interface CityNode {
  x: number;
  z: number;
  /** Traffic lights (Town Centre junctions of three or four streets). */
  signal: boolean;
}

/** The streets as a graph: junctions joined by straight streets (indexes into nodes). */
export interface CityGraph {
  nodes: CityNode[];
  edges: [number, number][];
}

/** A block of ground between streets, metres (world X/Z). */
export interface CityBlock {
  zone: CityZone;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** A public building's block. */
  service?: CityService;
  /** A community lot's block (Parkside). */
  venue?: CityVenue;
}

/** A place on a street to put a car or a player: on its centre line, heading along it. */
export interface CitySpot {
  x: number;
  z: number;
  heading: number;
  zone: CityZone;
}

/** The elevated monorail: where its track runs and how long its train is. */
export interface CityMonorail {
  /** The centre line of the track, a closed loop (the last point joins the first), metres. */
  path: { x: number; z: number }[];
  /** Height of the top of the beam, where the train runs. */
  y: number;
  /** Cars in the train. */
  cars: number;
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
  /** The sidewalks' paving (from the blocks out to the road tiles' kerbs), at kerb height. */
  sidewalks: { x0: number; z0: number; x1: number; z1: number }[];
  buildings: CityBuilding[];
  /** Everything else placed from the packs: trees, fences, street furniture, the monorail's track. */
  props: CityPiece[];
  shapes: CityShape[];
  lots: CityLot[];
  blocks: CityBlock[];
  colliders: CityBox[];
  spots: CitySpot[];
  neon: CityNeon[];
  lights: CityLight[];
  signs: CitySign[];
  graph: CityGraph;
  monorail: CityMonorail;
  /** Rooms you can go into (under their buildings): walk up to the front door. */
  interiors: CityInterior[];
  /** Which of them is the player's own home (an index into interiors), or -1. */
  home: number;
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
  return { lit: room % 100 < 80, picture: room % 2 === 0 ? 0 : 1 };
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

// ------------------------------------------------------------------ the town's models
// Every building is placed by its piece name; footprints are x0, x1, z0, z1 as packed (the front, with
// its door, toward +Z) and roof height, metres.

// Kenney's City Kit Suburban and Commercial (scripts/city/pack_kenney.mjs).
const KENNEY_BUILDINGS = {
  'k/suburban/building-type-a': [-4.875, 4.875, -3.856, 3.856, 6.252],
  'k/suburban/building-type-b': [-6.855, 6.855, -4.275, 4.275, 8.531],
  'k/suburban/building-type-c': [-4.824, 4.824, -3.856, 3.856, 7.752],
  'k/suburban/building-type-d': [-6.586, 6.586, -3.855, 3.855, 9.281],
  'k/suburban/building-type-e': [-4.875, 4.875, -3.855, 3.855, 8.531],
  'k/suburban/building-type-f': [-5.355, 5.355, -5.272, 5.272, 8.531],
  'k/suburban/building-type-g': [-5.438, 5.438, -4.417, 4.417, 5.762],
  'k/suburban/building-type-h': [-4.875, 4.875, -3.435, 3.435, 5.531],
  'k/suburban/building-type-i': [-4.824, 4.824, -3.855, 3.855, 5.531],
  'k/suburban/building-type-j': [-5.138, 5.138, -3.435, 3.435, 7.781],
  'k/suburban/building-type-k': [-3.454, 3.454, -3.825, 3.825, 8.622],
  'k/suburban/building-type-l': [-3.876, 3.876, -3.825, 3.825, 7.869],
  'k/suburban/building-type-m': [-5.355, 5.355, -5.355, 5.355, 5.531],
  'k/suburban/building-type-n': [-6.691, 6.691, -5.167, 5.167, 8.531],
  'k/suburban/building-type-o': [-4.762, 4.763, -3.855, 3.855, 8.531],
  'k/suburban/building-type-p': [-4.65, 4.65, -3.713, 3.713, 6.885],
  'k/suburban/building-type-q': [-4.65, 4.65, -3.477, 3.165, 6.885],
  'k/suburban/building-type-r': [-3.855, 3.855, -3.825, 3.825, 8.559],
  'k/suburban/building-type-s': [-5.273, 5.273, -4.074, 4.074, 8.531],
  'k/suburban/building-type-t': [-4.875, 4.977, -5.274, 5.274, 8.672],
  'k/suburban/building-type-u': [-5.355, 5.355, -4.076, 4.076, 8.531],
  'k/commercial/building-a': [-3.313, 3.313, -3.525, 3.525, 9.697],
  'k/commercial/building-b': [-3.638, 3.638, -3.525, 3.525, 9.697],
  'k/commercial/building-c': [-3.313, 3.313, -4.088, 4.088, 6.698],
  'k/commercial/building-d': [-3.15, 3.15, -3.375, 3.375, 9.697],
  'k/commercial/building-e': [-6.15, 6.15, -3.78, 3.78, 6.698],
  'k/commercial/building-f': [-3.15, 3.15, -3.863, 3.862, 12.698],
  'k/commercial/building-g': [-3.638, 3.638, -3.458, 3.457, 12.698],
  'k/commercial/building-h': [-3.313, 3.313, -3.78, 3.78, 9.697],
  'k/commercial/building-i': [-4.65, 4.65, -4.883, 4.882, 12.6],
  'k/commercial/building-j': [-7.813, 7.813, -5.025, 5.025, 12.698],
  'k/commercial/building-k': [-7.813, 7.813, -3.532, 3.532, 11.025],
  'k/commercial/building-l': [-5.138, 5.138, -5.258, 5.257, 17.025],
  'k/commercial/building-n': [-8.7, 8.7, -6.825, 6.825, 18.6],
} as const;
type KenneyBuilding = keyof typeof KENNEY_BUILDINGS;
/** Maple Grove's family houses. */
const HOUSES = (Object.keys(KENNEY_BUILDINGS) as KenneyBuilding[]).filter((b) => b.startsWith('k/suburban/'));
/** Town Centre's shops and offices, repeated for weight: mostly two and three storeys. */
const SHOPS: KenneyBuilding[] = [
  'k/commercial/building-a', 'k/commercial/building-b', 'k/commercial/building-c', 'k/commercial/building-c',
  'k/commercial/building-d', 'k/commercial/building-e', 'k/commercial/building-e', 'k/commercial/building-h',
  'k/commercial/building-a', 'k/commercial/building-b', 'k/commercial/building-h', 'k/commercial/building-f',
  'k/commercial/building-g', 'k/commercial/building-i', 'k/commercial/building-j', 'k/commercial/building-k',
  'k/commercial/building-l', 'k/commercial/building-n',
];
/** Which buildings a row in each district is made of. */
const ROW_SETS: Record<CityZone, readonly string[]> = { residential: HOUSES, commercial: SHOPS, leisure: SHOPS };

// Quaternius' Ultimate Buildings Pack (scripts/city/pack_town.py), for the public buildings.
const TOWN_BUILDINGS = {
  'ub/2Story_Columns': [-2.59, 2.59, -2.586, 3.388, 6.645],
  'ub/2Story_Wide': [-4.59, 4.59, -2.586, 2.827, 6.595],
  'ub/2Story_Wide_2Doors': [-8.193, 8.193, -2.586, 2.827, 6.595],
  'ub/4Story_Wide_2Doors': [-8.193, 8.193, -2.586, 3.886, 12.363],
  'ub/4Story_Wide_2Doors_Roof': [-8.193, 8.193, -2.586, 3.886, 13.64],
  'service/hospital': [-19.017, 7.568, -6.568, 7.657, 14],
} as const;
const FOOTPRINTS: Record<string, readonly number[]> = { ...KENNEY_BUILDINGS, ...TOWN_BUILDINGS };
/**
 * The flat roofs you can go out on (measured from the packed models): the roof's height and the
 * rectangle inside its parapet (x0, x1, z0, z1, as packed). Penthouses on these get a roof terrace.
 */
const ROOFS: Record<string, readonly [number, number, number, number, number]> = {
  'k/commercial/building-i': [12, -4.13, 4.13, -4.21, 4.04],
  'k/commercial/building-j': [12, -7.29, 7.68, -4.13, 4.23],
  'k/commercial/building-l': [15, -4.61, 4.36, -4.58, 4.42],
};
/** Interiors are laid out on a grid this far apart, well under the town. */
const INTERIOR_GRID = 50;
const INTERIOR_DEPTH = -40;
/** How many colour schemes a building's pack has (its `skin` is one of them). */
const skinCount = (model: string) => (model.startsWith('k/suburban/') ? 4 : model.startsWith('k/commercial/') ? 3 : 10);
/** How many buildings a Town Centre cluster has (repeated for weight). */
const CLUSTER_SIZES = [4, 5, 6, 6, 7, 8, 8, 9, 10, 12];

// Parked cars (pack_town.py, facing +Z): width, length and height, metres.
const CARS = {
  'police-car': [1.95, 4.1, 1.36],
  ambulance: [2.2, 4.8, 2.38],
  taxi: [1.85, 4.3, 1.34],
  suv: [1.95, 3.9, 1.41],
  hatchback: [1.8, 3.6, 1.26],
  sedan: [1.85, 4.3, 1.2],
  van: [2.0, 3.65, 1.56],
} as const;
type Car = keyof typeof CARS;
const CIVILIAN_CARS: Car[] = ['suv', 'hatchback', 'hatchback', 'sedan', 'sedan', 'taxi', 'van'];
/** What families keep on their driveways. */
const FAMILY_CARS: Car[] = ['suv', 'suv', 'hatchback', 'sedan', 'sedan', 'van'];

/**
 * A public building or a community lot's building: which district, which building in which colour
 * scheme, the name board out front, and what's beside it: a car park (with these cars), a playground or
 * a little square.
 */
interface ServiceSpec {
  zone: CityZone;
  name: string;
  model: string;
  skin?: number;
  background: string;
  color: string;
  yard: 'parking' | 'playground' | 'plaza';
  cars?: Car[];
  /** Share of the car park's bays taken. */
  fill?: number;
  /** Neon over the door at night. */
  neon?: number;
}
const SERVICES: Record<CityService, ServiceSpec> = {
  townHall: { zone: 'commercial', name: 'TOWN HALL', model: 'ub/4Story_Wide_2Doors_Roof', skin: 6, background: '#2f3340', color: '#f3d36b', yard: 'plaza' },
  police: { zone: 'commercial', name: 'POLICE', model: 'ub/4Story_Wide_2Doors', skin: 2, background: '#16306e', color: '#ffffff', yard: 'parking', cars: ['police-car'], fill: 0.55 },
  hospital: { zone: 'commercial', name: 'HOSPITAL', model: 'service/hospital', background: '#ffffff', color: '#c8161d', yard: 'parking', cars: ['ambulance', 'ambulance', ...CIVILIAN_CARS], fill: 0.5 },
  bank: { zone: 'commercial', name: 'BANK', model: 'ub/2Story_Columns', skin: 5, background: '#1d4d34', color: '#f4e7b0', yard: 'parking', cars: CIVILIAN_CARS, fill: 0.45 },
  fire: { zone: 'residential', name: 'FIRE STATION', model: 'ub/2Story_Wide_2Doors', skin: 8, background: '#b01b17', color: '#ffffff', yard: 'plaza' },
  school: { zone: 'residential', name: 'SCHOOL', model: 'ub/2Story_Wide_2Doors', skin: 9, background: '#f2b705', color: '#1d1d1d', yard: 'playground' },
  post: { zone: 'residential', name: 'POST OFFICE', model: 'ub/2Story_Wide', skin: 0, background: '#d42a2a', color: '#ffe14d', yard: 'parking', cars: ['van'], fill: 0.5 },
  library: { zone: 'residential', name: 'LIBRARY', model: 'ub/2Story_Columns', skin: 7, background: '#5a3a22', color: '#f1e3c6', yard: 'parking', cars: CIVILIAN_CARS, fill: 0.35 },
};
/** In the order they pick their blocks (the town hall first: it takes the one nearest the middle). */
const SERVICE_ORDER: CityService[] = ['townHall', 'police', 'hospital', 'bank', 'fire', 'school', 'post', 'library'];
/** Parkside's buildings you can go into. */
type Venue = 'arcade' | 'events' | 'market' | 'diner';
const VENUES: Record<Venue, ServiceSpec> = {
  arcade: { zone: 'leisure', name: 'GAME CENTRE', model: 'k/commercial/building-e', skin: 2, background: '#2a1458', color: '#ffd23f', yard: 'plaza', neon: PINK },
  events: { zone: 'leisure', name: 'EVENT CENTRE', model: 'k/commercial/building-n', skin: 1, background: '#2d2440', color: '#f2c14e', yard: 'parking', cars: CIVILIAN_CARS, fill: 0.6, neon: VIOLET },
  market: { zone: 'leisure', name: 'GROCERY', model: 'k/commercial/building-k', skin: 0, background: '#1f7a3a', color: '#ffffff', yard: 'parking', cars: CIVILIAN_CARS, fill: 0.5 },
  diner: { zone: 'leisure', name: 'DINER', model: 'k/commercial/building-c', skin: 1, background: '#c8202f', color: '#fff6e0', yard: 'parking', cars: CIVILIAN_CARS, fill: 0.4, neon: CYAN },
};
/** Parkside's lots, in the order the blocks take them (the biggest blocks first). */
const PARKSIDE: CityVenue[] = ['fairground', 'events', 'graveyard', 'arcade', 'skatepark', 'market', 'diner', 'foodcourt', 'park'];
/** What the rest of Parkside's blocks become. */
const PARKSIDE_MORE: CityVenue[] = ['park', 'park', 'park', 'park', 'park', 'park', 'foodcourt'];

// Street props: footprint (x, z) and height in metres, which way their front faces as authored, and
// (for Kenney's) the piece and its scale.
interface PropSpec {
  w: number;
  d: number;
  h: number;
  front: 'Z' | 'X' | '-X';
  piece?: string;
  scale?: number;
}
const PROP_SPECS = {
  bench: { w: 1.47, d: 0.72, h: 0.95, front: 'Z' },
  'trash-can': { w: 0.87, d: 0.91, h: 1.0, front: 'Z' },
  'fire-hydrant': { w: 0.37, d: 0.37, h: 0.8, front: 'Z' },
  mailbox: { w: 0.59, d: 0.61, h: 1.25, front: 'Z' },
  'planter-bushes': { w: 2.01, d: 0.65, h: 0.95, front: 'Z' },
  'power-box': { w: 0.42, d: 0.44, h: 1.4, front: 'Z' },
  'bus-stop': { w: 3.8, d: 2.46, h: 2.7, front: 'Z' },
  'bus-stop-sign': { w: 0.46, d: 0.11, h: 2.8, front: 'Z' },
  dumpster: { w: 1.68, d: 0.89, h: 1.4, front: 'Z' },
  atm: { w: 0.73, d: 0.75, h: 1.8, front: 'Z' },
  'washing-line': { w: 1.31, d: 1.66, h: 2.1, front: 'Z' },
  'stop-sign': { w: 0.43, d: 0.76, h: 2.7, front: 'X', piece: 'k/roads/road-sign-stop', scale: 0.55 },
  'traffic-light': { w: 0.89, d: 0.68, h: 3.9, front: 'Z', piece: 'k/roads/traffic-light', scale: 0.75 },
  parasol: { w: 2.08, d: 2.4, h: 2.7, front: 'Z', piece: 'k/commercial/detail-parasol-a' },
  'parasol-2': { w: 2.08, d: 2.4, h: 2.7, front: 'Z', piece: 'k/commercial/detail-parasol-b' },
  'park-bench': { w: 2.4, d: 1.46, h: 1.47, front: 'Z', piece: 'k/coaster/bench', scale: 0.7 },
  'park-bin': { w: 1.27, d: 1.27, h: 1.31, front: 'Z', piece: 'k/coaster/trash', scale: 0.7 },
  'stall-food': { w: 3.13, d: 3.6, h: 4.63, front: 'Z', piece: 'k/coaster/stall-food' },
  'stall-drinks': { w: 3.0, d: 3.6, h: 5.64, front: 'Z', piece: 'k/coaster/stall-drinks' },
  'stall-information': { w: 3.0, d: 3.45, h: 4.5, front: 'Z', piece: 'k/coaster/stall-information' },
  'stall-toilets': { w: 3.0, d: 3.18, h: 4.2, front: 'Z', piece: 'k/coaster/stall-toilets' },
  'grave-bench': { w: 2.02, d: 1.14, h: 1.31, front: 'Z', piece: 'k/graveyard/bench', scale: 0.8 },
  'grave-light': { w: 0.52, d: 1.82, h: 3.17, front: 'Z', piece: 'k/graveyard/lightpost-double' },
  'skate-benches': { w: 2.5, d: 2.72, h: 1.61, front: 'Z', piece: 'k/skate/benches' },
} satisfies Record<string, PropSpec>;
type Prop = keyof typeof PROP_SPECS;
const PROPS: Record<Prop, PropSpec> = PROP_SPECS;
/** Yaw that turns a prop's authored front toward a side. */
const propYaw = (prop: Prop, side: Side) => FACING[side] + { Z: 0, X: -Math.PI / 2, '-X': Math.PI / 2 }[PROPS[prop].front];

// Trees are the heaviest models (2-6k triangles): weighted toward the lighter ones.
const PARK_TREES = ['tree', 'tree-4', 'tree-4', 'tree-5'];
const GARDEN_TREES = ['k/suburban/tree-large', 'k/suburban/tree-large', 'k/suburban/tree-small'];
const FLOWERS = ['flower-group', 'flower-group-2', 'flower-single', 'flower-single-2', 'bush-with-flowers'];
const GROUND_COVER = ['grass', 'grass-wispy', 'grass-wispy-2', 'tall-grass', 'clover', 'clover-2', 'plant', 'plant-2'];
const GRAVESTONES = [
  'k/graveyard/gravestone-round', 'k/graveyard/gravestone-round', 'k/graveyard/gravestone-bevel', 'k/graveyard/gravestone-cross',
  'k/graveyard/gravestone-decorative', 'k/graveyard/gravestone-roof', 'k/graveyard/gravestone-wide', 'k/graveyard/gravestone-broken',
  'k/graveyard/gravestone-cross-large', 'k/graveyard/cross',
];

// The monorail (Kenney's Coaster Kit at 3 m a unit): track pieces hang this far below their origin, so
// they sit on stacks of 3 m supports; corners turn left with this radius; straights are this long.
const MONORAIL_HANG = 3.075;
const MONORAIL_BEAM = 0.675;
const MONORAIL_RADIUS = 12;
const MONORAIL_STRAIGHT = 12;
/** Underside of the beam: two supports (6 m) up, over the traffic. */
const MONORAIL_BOTTOM = 6;

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
  const sidewalks: Rect[] = [];
  const buildings: CityBuilding[] = [];
  const props: CityPiece[] = [];
  const shapes: CityShape[] = [];
  const lots: CityLot[] = [];
  const blocks: CityBlock[] = [];
  const colliders: CityBox[] = [];
  const spots: CitySpot[] = [];
  const neon: CityNeon[] = [];
  const lights: CityLight[] = [];
  const signs: CitySign[] = [];
  const graph: CityGraph = { nodes: [], edges: [] };
  const interiors: CityInterior[] = [];
  let home = -1;
  /** Which buildings are the public ones, and which Parkside's arcade, grocery and diner. */
  const serviceOf = new Map<CityBuilding, CityService>();
  const venueOf = new Map<CityBuilding, Venue>();

  /** A street prop turned to face `side`, with a collider (unless it's something you'd step over). */
  const addProp = (prop: Prop, x: number, z: number, side: Side, solid = true) => {
    const p = PROPS[prop];
    const yaw = propYaw(prop, side);
    props.push({ piece: p.piece ?? `prop/${prop}`, x, y: KERB_HEIGHT, z, yaw, scale: p.scale });
    if (!solid) return;
    const across = Math.abs(Math.sin(yaw)) > 0.5; // turned a quarter: footprint swaps
    const k = p.scale ?? 1;
    colliders.push({ x, y: KERB_HEIGHT + (p.h * k) / 2, z, hx: ((across ? p.d : p.w) * k) / 2, hy: (p.h * k) / 2, hz: ((across ? p.w : p.d) * k) / 2 });
  };
  /** A piece from the packs at (x, z) on the ground, turned `yaw`, with an optional collider (w along X, d along Z). */
  const addPiece = (piece: string, x: number, z: number, yaw: number, solid?: { w: number; d: number; h: number }, y = KERB_HEIGHT, scale?: number) => {
    props.push({ piece, x, y, z, yaw, scale });
    if (solid) colliders.push({ x, y: y + solid.h / 2, z, hx: solid.w / 2, hy: solid.h / 2, hz: solid.d / 2 });
  };
  /** A plant (any way round, any size between `lo` and `hi`): a nature pack name, or a Kenney piece. */
  const addPlant = (model: string, x: number, z: number, lo = 0.85, hi = 1.15) => {
    props.push({ piece: model.includes('/') ? model : `nature/${model}`, x, y: KERB_HEIGHT, z, yaw: rng() * Math.PI * 2, scale: between(rng, lo, hi) });
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
    CITY_ZONES.find((z) => i >= DISTRICT_COLUMNS[z][0] && i < DISTRICT_COLUMNS[z][1]) ?? 'leisure';
  const zoneAtX = (x: number): CityZone => {
    for (const zone of CITY_ZONES) if (x < xs[DISTRICT_COLUMNS[zone][1]]) return zone;
    return 'leisure';
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
    if (merged.has(a) || merged.has(b) || rng() >= MERGE[zone]) continue;
    if (degree(n1[0], n1[1]) < 4 || degree(n2[0], n2[1]) < 4) continue;
    if (c.kind === 'ew') eastWest[c.i][c.j] = false;
    else northSouth[c.i][c.j] = false;
    merged.add(a);
    merged.add(b);
    pairs.push([a, b]);
  }

  // ---- junctions: one road tile each (crossroads, T, corner bend, or straight on where a street was left out)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const mask =
        (j < nz - 1 && northSouth[i][j] ? N : 0) | (i < nx - 1 && eastWest[i][j] ? E : 0) | (j > 0 && northSouth[i][j - 1] ? S : 0) | (i > 0 && eastWest[i - 1][j] ? W : 0);
      const x = xs[i];
      const z = zs[j];
      const y = ROAD_Y;
      let k: number;
      // The kit's tiles as authored: the T opens to +Z (N), the bend joins -X and +Z, the straight runs along X.
      if (turnsTo(N | E | S | W, mask) >= 0) streets.push({ piece: 'k/roads/road-crossroad', x, y, z, yaw: 0 });
      else if ((k = turnsTo(E | W | N, mask)) >= 0) streets.push({ piece: 'k/roads/road-intersection', x, y, z, yaw: (k * Math.PI) / 2 });
      else if ((k = turnsTo(W | N, mask)) >= 0) streets.push({ piece: 'k/roads/road-bend', x, y, z, yaw: (k * Math.PI) / 2 });
      else if ((k = turnsTo(E | W, mask)) >= 0) streets.push({ piece: 'k/roads/road-straight', x, y, z, yaw: k % 2 === 0 ? 0 : Math.PI / 2 });
      roads.push({ x0: x - HALF_STREET, x1: x + HALF_STREET, z0: z - HALF_STREET, z1: z + HALF_STREET });
      // Junction corners: traffic lights in Town Centre, stop signs elsewhere.
      const zone = zoneAtX(x);
      const arms = [N, E, S, W].filter((bit) => mask & bit).length;
      graph.nodes[i * nz + j] = { x, z, signal: zone === 'commercial' && arms >= 3 };
      if (arms >= 3) {
        const corner = HALF_STREET - 1.5;
        for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
          if (zone === 'commercial') addProp('traffic-light', x + sx * corner, z + sz * corner, sz > 0 ? 'N' : 'S');
          else if (sx === sz) addProp('stop-sign', x + sx * corner, z + sz * corner, sx > 0 ? 'E' : 'W');
        }
      }
    }
  }

  // ---- straight streets between junctions, street lights along both sidewalks, and spots on them
  const addStreet = (ax: number, az: number, bx: number, bz: number) => {
    const alongX = az === bz;
    const ra = JUNCTION_HALF;
    const rb = JUNCTION_HALF;
    const length = (alongX ? bx - ax : bz - az) - ra - rb;
    const count = Math.max(1, Math.round(length / SEGMENT));
    const sx = length / (count * SEGMENT);
    const yaw = alongX ? 0 : -Math.PI / 2; // the tile runs along its own X
    const heading = alongX ? Math.PI / 2 : 0;
    for (let s = 0; s < count; s++) {
      const t = (alongX ? ax : az) + ra + (s + 0.5) * SEGMENT * sx;
      const x = alongX ? t : ax;
      const z = alongX ? az : t;
      // Zebra crossings next to the junctions, where people cross.
      const crossing = count >= 4 && (s === 0 || s === count - 1);
      streets.push({ piece: crossing ? 'k/roads/road-crossing' : 'k/roads/road-straight', x, y: ROAD_Y, z, yaw, sx });
      if (s % 2 === 1) spots.push({ x, z, heading, zone: zoneAtX(x) });
    }
    roads.push(
      alongX
        ? { x0: ax + ra, x1: bx - rb, z0: az - HALF_STREET, z1: az + HALF_STREET }
        : { x0: ax - HALF_STREET, x1: ax + HALF_STREET, z0: az + ra, z1: bz - rb },
    );
    // Now and then a manhole cover in a lane.
    if (rng() < 0.5) {
      const t = (alongX ? ax : az) + ra + between(rng, 0.2, 0.8) * length;
      const lane = (rng() < 0.5 ? -1 : 1) * LANE_WIDTH * 0.5;
      props.push({ piece: 'prop/manhole-cover', x: alongX ? t : ax + lane, y: 0.004, z: alongX ? az + lane : t, yaw: rng() * Math.PI, scale: 0.4 });
    }
    // Lights every ~30 m, alternating sides, on the kerb with the arm out over the road.
    const lamps = Math.max(1, Math.round(length / 30));
    const kerb = HALF_STREET - SIDEWALK_WIDTH + 0.5;
    for (let l = 0; l < lamps; l++) {
      const t = (alongX ? ax : az) + ra + ((l + 0.5) * length) / lamps;
      const side = l % 2 === 0 ? 1 : -1;
      const x = alongX ? t : ax + side * kerb;
      const z = alongX ? az + side * kerb : t;
      addLamp(x, z, alongX ? 0 : -side, alongX ? -side : 0, zoneAtX(x), l);
    }
    const zone = zoneAtX(alongX ? (ax + bx) / 2 : ax);
    const from = (alongX ? ax : az) + ra;
    const to = (alongX ? bx : bz) - rb;
    const at = (t: number, off: number): [number, number] => (alongX ? [t, az + off] : [ax + off, t]);
    const lampAt = (t: number) => Array.from({ length: lamps }, (_, l) => from + ((l + 0.5) * length) / lamps).some((lt) => Math.abs(lt - t) < 4);
    // Street trees in an even row along the kerb side of both sidewalks (one kind per street, all the
    // same size), opposite each other, leaving room for the lights.
    const trees = Math.max(1, Math.round(length / 16));
    const treeKind = zone === 'residential' ? pick(rng, GARDEN_TREES) : zone === 'commercial' ? 'k/suburban/tree-small' : 'k/coaster/tree';
    const treeAt: number[] = [];
    for (let k = 0; k < trees; k++) {
      const t = from + ((k + 0.5) * length) / trees;
      if (lampAt(t)) continue;
      treeAt.push(t);
      for (const side of [1, -1]) {
        const [x, z] = at(t, side * (HALF_STREET - SIDEWALK_WIDTH + 1.6));
        addTree(treeKind, x, z, 0.95, 1);
      }
    }
    // Furniture along the back of the sidewalks, facing the road: benches with a bin, hydrants,
    // mailboxes, power boxes and now and then a bus stop.
    for (const side of [1, -1]) {
      const face: Side = alongX ? (side > 0 ? 'S' : 'N') : side > 0 ? 'W' : 'E';
      const back = side * (HALF_STREET - 0.55);
      let busStop = zone !== 'residential' && length > 40 && rng() < 0.35;
      for (let t = from + between(rng, 5, 12); t < to - 4; t += between(rng, 10, 22)) {
        const r = rng();
        if (busStop && t > from + length / 3 && !treeAt.some((tt) => Math.abs(tt - t) < 3.5 || Math.abs(tt - t - 3.2) < 1.2)) {
          const [x, z] = at(t, side * (HALF_STREET - 1.3));
          addProp('bus-stop', x, z, face);
          const [sx2, sz2] = at(t + 3.2, side * (HALF_STREET - SIDEWALK_WIDTH + 1.2));
          addProp('bus-stop-sign', sx2, sz2, face);
          busStop = false;
          t += 4;
        } else if (r < 0.22) {
          const [x, z] = at(t, back);
          addProp('bench', x, z, face);
          const [bx2, bz2] = at(t + 1.4, back);
          addProp('trash-can', bx2, bz2, face);
        } else if (r < 0.34) {
          const [x, z] = at(t, side * (HALF_STREET - SIDEWALK_WIDTH + 1.2));
          addProp('fire-hydrant', x, z, face);
        } else if (r < 0.4) {
          const [x, z] = at(t, back);
          addProp('power-box', x, z, face);
        } else if (r < 0.46 && zone === 'commercial') {
          const [x, z] = at(t, back);
          addProp('atm', x, z, face);
        }
      }
    }
  };
  /** A curved street light on the kerb, its arm out over the road along (dx, dz). */
  const addLamp = (x: number, z: number, dx: number, dz: number, zone: CityZone, n: number) => {
    const arm = 1.95; // the arm reaches out along the piece's -Z
    props.push({ piece: 'k/roads/light-curved', x, y: KERB_HEIGHT, z, yaw: Math.atan2(-dx, -dz) });
    colliders.push({ x, y: KERB_HEIGHT + 3.3, z, hx: 0.15, hy: 3.3, hz: 0.15 });
    const colour = zone === 'leisure' && n % 3 === 0 ? PINK : n % 2 === 0 ? WARM : AMBER;
    lights.push({ x: x + dx * arm, y: KERB_HEIGHT + 6.35, z: z + dz * arm, color: colour });
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (i < nx - 1 && eastWest[i][j]) {
        addStreet(xs[i], zs[j], xs[i + 1], zs[j]);
        graph.edges.push([i * nz + j, (i + 1) * nz + j]);
      }
      if (j < nz - 1 && northSouth[i][j]) {
        addStreet(xs[i], zs[j], xs[i], zs[j + 1]);
        graph.edges.push([i * nz + j, i * nz + j + 1]);
      }
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
  const expand = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, x1: r.x1 + by, z0: r.z0 - by, z1: r.z1 + by });
  // Each block and the sidewalks round it are one raised slab; the paving is drawn out to the road
  // tiles' kerb strips (which are part of the sidewalk too).
  for (const b of blocks) {
    colliders.push({
      x: (b.x0 + b.x1) / 2,
      y: KERB_HEIGHT / 2,
      z: (b.z0 + b.z1) / 2,
      hx: (b.x1 - b.x0) / 2 + SIDEWALK_WIDTH,
      hy: KERB_HEIGHT / 2,
      hz: (b.z1 - b.z0) / 2 + SIDEWALK_WIDTH,
    });
    sidewalks.push(expand(b, PAVING));
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
  sidewalks.push(
    { x0: bounds.x0, x1: bounds.x1, z0: bounds.z0, z1: bounds.z0 + PAVING },
    { x0: bounds.x0, x1: bounds.x1, z0: bounds.z1 - PAVING, z1: bounds.z1 },
    { x0: bounds.x0, x1: bounds.x0 + PAVING, z0: bounds.z0, z1: bounds.z1 },
    { x0: bounds.x1 - PAVING, x1: bounds.x1, z0: bounds.z0, z1: bounds.z1 },
  );

  const opposite = (side: Side): Side => ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[side];

  // ---- public buildings: each takes a block of its district, picked before the rest are filled
  const downtownX = (xs[DISTRICT_COLUMNS.commercial[0]] + xs[DISTRICT_COLUMNS.commercial[1]]) / 2;
  for (const service of SERVICE_ORDER) {
    const zone = SERVICES[service].zone;
    const choices = blocks.filter((b) => b.zone === zone && !b.service && b.x1 - b.x0 >= 44 && b.z1 - b.z0 >= 42);
    if (!choices.length) continue;
    const away = (b: CityBlock) => Math.hypot((b.x0 + b.x1) / 2 - downtownX, (b.z0 + b.z1) / 2 - cz);
    const block = service === 'townHall' ? choices.reduce((a, b) => (away(a) <= away(b) ? a : b)) : pick(rng, choices);
    block.service = service;
  }
  // ---- Parkside: the biggest blocks take the fairground, the event centre and the graveyard, the rest follow in turn
  {
    const parkside = blocks.filter((b) => b.zone === 'leisure').sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
    const big = parkside.slice(0, 3);
    const rest = parkside.slice(3);
    for (let k = rest.length - 1; k > 0; k--) {
      const r = Math.floor(rng() * (k + 1));
      [rest[k], rest[r]] = [rest[r], rest[k]];
    }
    [...big, ...rest].forEach((block, k) => (block.venue = PARKSIDE[k] ?? pick(rng, PARKSIDE_MORE)));
  }

  // ---- buildings, gardens, parks and community lots
  for (const block of blocks) fillBlock(block);

  // ---- the monorail: an elevated loop right round Parkside, above its boundary streets
  const monorail = buildMonorail();

  // ---- rooms inside: the player's home, the public buildings, Parkside's venues, apartments, offices,
  // ---- houses, shops and cafés
  {
    // Their own random sequence, so adding rooms never moves a building.
    const roomRng = seededRandom(seed ^ 0x51ed27);
    const model = (b: CityBuilding) => b.pieces[0].piece;
    const free = (b: CityBuilding) => !serviceOf.has(b) && !venueOf.has(b);
    // Home: the penthouse (with its roof terrace) nearest where Town Centre meets Maple Grove.
    const target = { x: xs[DISTRICT_COLUMNS.commercial[0]] + 40, z: cz };
    let homeBuilding = -1;
    let best = Infinity;
    buildings.forEach((b, i) => {
      if (!free(b) || !ROOFS[model(b)]) return;
      const distance = Math.hypot((b.x0 + b.x1) / 2 - target.x, (b.z0 + b.z1) / 2 - target.z);
      if (distance < best) {
        best = distance;
        homeBuilding = i;
      }
    });
    const VENUE_ROOMS: Record<Venue, InteriorKind> = { arcade: 'gamecentre', events: 'eventcentre', market: 'market', diner: 'diner' };
    buildings.forEach((b, i) => {
      const venue = venueOf.get(b);
      let kind: InteriorKind | undefined = i === homeBuilding ? 'home' : serviceOf.get(b) ?? (venue && VENUE_ROOMS[venue]);
      const r = roomRng();
      const roofed = !!ROOFS[model(b)];
      if (!kind && b.zone === 'residential' && r < 0.3) kind = 'house';
      if (!kind && b.zone !== 'residential') {
        if (roofed && r < 0.55) kind = 'apartment';
        else if (b.height > 9 && r < 0.5) kind = r < 0.25 ? 'apartment' : 'office';
        else if (r < 0.35) kind = pick(roomRng, ['shop', 'cafe'] as const);
      }
      if (!kind) return;
      const [ox, oz] = OUT[b.face];
      const front = b.face === 'N' ? b.z1 : b.face === 'S' ? b.z0 : b.face === 'E' ? b.x1 : b.x0;
      const alongX = b.face === 'N' || b.face === 'S';
      const middle = alongX ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2;
      const doorAt = front + (ox + oz) * 0.7;
      const door = { x: alongX ? middle : doorAt, z: alongX ? doorAt : middle, heading: FACING[b.face] };
      // Every inside gets its own square of a grid well under the town, so even the biggest never meet.
      const n = interiors.length;
      const columns = Math.floor(CITY_WIDTH / INTERIOR_GRID);
      const cells = columns * Math.floor(CITY_DEPTH / INTERIOR_GRID);
      const at = {
        x: bounds.x0 + INTERIOR_GRID / 2 + (n % columns) * INTERIOR_GRID,
        y: INTERIOR_DEPTH - Math.floor(n / cells) * 20,
        z: bounds.z0 + INTERIOR_GRID / 2 + Math.floor((n % cells) / columns) * INTERIOR_GRID,
      };
      const roof = (kind === 'home' || kind === 'apartment') && roofed;
      const storeys = b.height > 7 ? 2 : 1;
      const built = buildInterior({ kind, building: i, ...at, yaw: FACING[b.face], door, roof, storeys }, roomRng);
      if (kind === 'home') home = interiors.length;
      interiors.push(built.interior);
      colliders.push(...built.colliders);
      if (roof && built.interior.roof) addRooftop(b, built.interior, roomRng);
    });
  }

  /** The roof terrace on a penthouse's building, and the stair hut that takes you back down. */
  function addRooftop(b: CityBuilding, interior: CityInterior, random: () => number) {
    const p = b.pieces[0];
    const [roofY, x0, x1, z0, z1] = ROOFS[p.piece];
    const [ox, oz] = rotate((x0 + x1) / 2, (z0 + z1) / 2, p.yaw);
    const place = { x: p.x + ox, y: KERB_HEIGHT + roofY, z: p.z + oz, yaw: p.yaw };
    const terrace = new InteriorBuilder(place, x1 - x0 - 0.5, z1 - z0 - 0.5, 1, random, random() < 0.5);
    const door = rooftop(terrace, terrace.w, terrace.d);
    for (const piece of terrace.pieces) props.push({ ...piece, level: undefined });
    for (const shape of terrace.shapes) shapes.push({ ...shape, level: undefined });
    colliders.push(...terrace.colliders);
    interior.roof = { inside: interior.roof!.inside, outside: { x: door.x, y: place.y, z: door.z, heading: door.heading } };
  }

  // ------------------------------------------------------------------ blocks

  function fillBlock(block: CityBlock) {
    lots.push({ kind: 'lawn', x0: block.x0, z0: block.z0, x1: block.x1, z1: block.z1 });
    const taken: Rect[] = [];
    if (block.service) {
      const building = placeService(block, block.zone, SERVICES[block.service], taken);
      serviceOf.set(building, block.service);
      plant(block, 'service', taken);
      return;
    }
    if (block.zone === 'leisure') {
      fillParkside(block, block.venue ?? 'park', taken);
      return;
    }
    const roll = rng();
    if (block.zone === 'residential') {
      if (roll < 0.86) {
        placeHomes(block, taken);
        plant(block, 'homes', taken);
      } else {
        placePark(block, taken);
        plant(block, 'park', taken);
      }
      return;
    }
    const kind = roll < 0.8 ? 'cluster' : roll < 0.92 ? 'park' : 'square';
    if (kind === 'cluster') placeCluster(block, taken);
    else if (kind === 'park') placePark(block, taken);
    else placeSquare(block, taken);
    plant(block, kind, taken);
  }

  /** World bounds of a building turned by yaw, relative to its origin. */
  function turnedBounds(model: string, yaw: number): Rect {
    const [x0, x1, z0, z1] = FOOTPRINTS[model];
    const corners = [rotate(x0, z0, yaw), rotate(x1, z0, yaw), rotate(x0, z1, yaw), rotate(x1, z1, yaw)];
    return {
      x0: Math.min(...corners.map((c) => c[0])),
      x1: Math.max(...corners.map((c) => c[0])),
      z0: Math.min(...corners.map((c) => c[1])),
      z1: Math.max(...corners.map((c) => c[1])),
    };
  }

  /** A building (by its piece name) with its origin at (x, z), facing `face`, and its collider. */
  function placeBuilding(zone: CityZone, model: string, x: number, z: number, face: Side, skin: number | undefined, withNeon: boolean): CityBuilding {
    const yaw = FACING[face];
    const b = turnedBounds(model, yaw);
    const rect = { x0: x + b.x0, x1: x + b.x1, z0: z + b.z0, z1: z + b.z1 };
    const [, , back, frontEdge, height] = FOOTPRINTS[model];
    // A flat roof you can stand on collides at its own height, not its parapet's.
    const top = ROOFS[model]?.[0] ?? height;
    const building: CityBuilding = { zone, style: 'town', ...rect, height, face, pieces: [{ piece: model, x, y: KERB_HEIGHT, z, yaw, skin, room: intBetween(rng, 0, 9999) }] };
    buildings.push(building);
    // Collide with the walls, not the steps in front of the Ultimate Buildings (you walk up those): trim
    // the front back to where a square body would end (the back is as far behind the middle as that front).
    const core = { ...rect };
    const [ox, oz] = OUT[face];
    const steps = model.startsWith('ub/') ? frontEdge + back : 0;
    if (steps > 0.2) {
      if (ox > 0) core.x1 -= steps;
      if (ox < 0) core.x0 += steps;
      if (oz > 0) core.z1 -= steps;
      if (oz < 0) core.z0 += steps;
    }
    colliders.push({ x: (core.x0 + core.x1) / 2, y: KERB_HEIGHT + top / 2, z: (core.z0 + core.z1) / 2, hx: (core.x1 - core.x0) / 2, hy: top / 2, hz: (core.z1 - core.z0) / 2 });
    if (withNeon) addSigns(building);
    return building;
  }

  /** A run of the picket fence from (ax, az) to (bx, bz), along X or Z, with one collider. */
  function fenceRun(ax: number, az: number, bx: number, bz: number, piece = 'k/suburban/fence', panel = 1.9, height = 1.1) {
    const alongX = Math.abs(bz - az) < 1e-6;
    const length = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (length < 0.5) return;
    const count = Math.max(1, Math.round(length / panel));
    const sx = length / (count * panel);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      props.push({ piece, x: ax + (bx - ax) * t, y: KERB_HEIGHT, z: az + (bz - az) * t, yaw: alongX ? 0 : Math.PI / 2, sx });
    }
    colliders.push({
      x: (ax + bx) / 2,
      y: KERB_HEIGHT + height / 2,
      z: (az + bz) / 2,
      hx: alongX ? length / 2 : 0.08,
      hy: height / 2,
      hz: alongX ? 0.08 : length / 2,
    });
  }

  // ------------------------------------------------------------------ Maple Grove: family houses on their own lots

  /**
   * Lots along both long sides of the block, back to back, each about 19 m wide and facing its street
   * (one row facing the wider street if the block is too shallow for two).
   */
  function placeHomes(block: CityBlock, taken: Rect[]) {
    const alongX = block.x1 - block.x0 >= block.z1 - block.z0;
    const [lo, hi] = alongX ? [block.z0, block.z1] : [block.x0, block.x1];
    const [a0, a1] = alongX ? [block.x0, block.x1] : [block.z0, block.z1];
    const [up, down]: Side[] = alongX ? ['N', 'S'] : ['E', 'W'];
    const count = Math.max(1, Math.round((a1 - a0) / 19));
    const width = (a1 - a0) / count;
    const rows: [Side, number, number][] = hi - lo >= 44 ? [[up, hi, (lo + hi) / 2], [down, lo, (lo + hi) / 2]] : [[up, hi, lo]];
    for (const [face, edge, back] of rows) {
      for (let k = 0; k < count; k++) placeLot(face, a0 + k * width, a0 + (k + 1) * width, edge, back, k === count - 1, face === up, taken);
    }
  }

  /**
   * One family's lot, from `s0` to `s1` along its street, from the sidewalk at `edge` back to `back`: the
   * house set back behind a front lawn, a stepping-stone path from its door, a driveway beside it with
   * the car, a mailbox by the sidewalk, flowers along the front, trees, and a picket fence round the
   * back garden (each lot draws its own left-hand side, the last one its right too, and the front row
   * the back fence they share).
   */
  function placeLot(face: Side, s0: number, s1: number, edge: number, back: number, last: boolean, backFence: boolean, taken: Rect[]) {
    const alongX = face === 'N' || face === 'S';
    const [ox, oz] = OUT[face];
    const out = ox + oz; // from the back of the lot toward the street
    const at = (along: number, across: number): [number, number] => (alongX ? [along, across] : [across, along]);
    const span = (p0: number, p1: number, q0: number, q1: number): Rect =>
      alongX ? { x0: Math.min(p0, p1), x1: Math.max(p0, p1), z0: Math.min(q0, q1), z1: Math.max(q0, q1) } : { x0: Math.min(q0, q1), x1: Math.max(q0, q1), z0: Math.min(p0, p1), z1: Math.max(p0, p1) };
    const width = s1 - s0;
    const depth = Math.abs(edge - back);
    const yaw = FACING[face];
    const size = (model: string) => {
      const b = turnedBounds(model, yaw);
      return alongX ? [b.x1 - b.x0, b.z1 - b.z0] : [b.z1 - b.z0, b.x1 - b.x0];
    };
    // A house that fits with room either side.
    let model: string = pick(rng, HOUSES);
    for (let t = 0; t < 10 && (size(model)[0] > width - 4 || size(model)[1] > depth - 12); t++) model = pick(rng, HOUSES);
    const [hw, hd] = size(model);
    const fits = hw <= width - 3 && hd <= depth - 8;
    const driveSide = fits && width - hw >= 8 ? (rng() < 0.5 ? -1 : 1) : 0;
    const centre = (s0 + s1) / 2 - driveSide * 2;
    const setback = Math.min(between(rng, 6, 8.5), depth - hd - 3);
    const frontLine = edge - out * setback;
    if (fits) {
      const b = turnedBounds(model, yaw);
      const across = frontLine - (alongX ? (out > 0 ? b.z1 : b.z0) : out > 0 ? b.x1 : b.x0);
      const along = centre - (alongX ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2);
      const [x, z] = at(along, across);
      const building = placeBuilding('residential', model, x, z, face, intBetween(rng, 0, skinCount(model) - 1), false);
      taken.push(expand(building, 1.2));

      // Stepping stones from the door to the sidewalk.
      const stones = Math.max(1, Math.round(setback / 3));
      for (let k = 0; k < stones; k++) {
        const [px, pz] = at(centre, frontLine + out * (setback * (k + 0.5)) / stones);
        props.push({ piece: rng() < 0.3 ? 'k/suburban/path-stones-messy' : 'k/suburban/path-stones-long', x: px, y: KERB_HEIGHT, z: pz, yaw });
      }
      taken.push(span(centre - 1, centre + 1, frontLine, edge));
      // Flowers along the front, a step out from the walls, leaving the door clear; planters at the corners.
      for (let t = centre - hw / 2 + 0.6; t < centre + hw / 2 - 0.4; t += between(rng, 0.9, 1.4)) {
        if (Math.abs(t - centre) < 1.4) continue;
        const [fx, fz] = at(t, frontLine + out * 1.1);
        addPlant(pick(rng, FLOWERS), fx, fz, 0.8, 1.2);
      }
      if (rng() < 0.5) {
        for (const t of [centre - 1.7, centre + 1.7]) {
          const [px, pz] = at(t, frontLine + out * 0.9);
          props.push({ piece: 'k/suburban/planter', x: px, y: KERB_HEIGHT, z: pz, yaw, scale: 0.7 });
        }
      }

      // The driveway beside the house, with the family car on it most of the time.
      if (driveSide) {
        const drive = driveSide > 0 ? s1 - 2.3 : s0 + 2.3;
        const length = setback + 3;
        const slabs = Math.ceil(length / 3);
        for (let k = 0; k < slabs; k++) {
          const [dx, dz] = at(drive, edge - out * (length * (k + 0.5)) / slabs);
          props.push({ piece: 'k/suburban/driveway-long', x: dx, y: KERB_HEIGHT, z: dz, yaw });
        }
        taken.push(span(drive - 1.6, drive + 1.6, edge, edge - out * length));
        if (rng() < 0.7) {
          const car = pick(rng, FAMILY_CARS);
          const [cw, cl, ch] = CARS[car];
          // Nose to tail between the sidewalk and the end of the drive, nearer the house.
          const [carX, carZ] = at(drive, frontLine + out * 0.6);
          const nose = rng() < 0.5 ? face : opposite(face);
          props.push({ piece: `car/${car}`, x: carX, y: KERB_HEIGHT + 0.075, z: carZ, yaw: FACING[nose] + between(rng, -0.03, 0.03) });
          colliders.push({ x: carX, y: KERB_HEIGHT + ch / 2, z: carZ, hx: (alongX ? cw : cl) / 2, hy: ch / 2, hz: (alongX ? cl : cw) / 2 });
        }
        // The bins out by the end of the drive.
        if (rng() < 0.45) {
          const [bx, bz] = at(drive + driveSide * 1.9, edge - out * 1.2);
          addProp('trash-can', bx, bz, face);
        }
      }
      // The mailbox by the sidewalk, on the other side of the path from the drive.
      const [mx, mz] = at(centre + (driveSide ? -driveSide : 1) * 1.5, edge - out * 0.7);
      addProp('mailbox', mx, mz, face);

      // A tree in the front lawn, one or two out back, now and then a washing line.
      if (setback > 5) {
        const t = driveSide > 0 || (!driveSide && rng() < 0.5) ? s0 + 3 : s1 - 3;
        const [tx, tz] = at(t, edge - out * Math.min(3, setback - 2));
        addTree(pick(rng, GARDEN_TREES), tx, tz, 0.85, 1.05);
      }
      const behind = frontLine - out * hd; // the back wall
      const garden = Math.abs(behind - back);
      if (garden > 5) {
        for (let k = intBetween(rng, 1, 2); k > 0; k--) {
          const [tx, tz] = at(between(rng, s0 + 2, s1 - 2), back + out * between(rng, 1.8, Math.min(garden - 2.5, 4)));
          addTree(pick(rng, GARDEN_TREES), tx, tz, 0.8, 1.05);
        }
        if (rng() < 0.35) {
          const [wx, wz] = at(centre, (behind + back) / 2);
          addProp('washing-line', wx, wz, face);
        }
      }
    }

    // The picket fence: from the front of the house back, down this lot's left side (and its right if
    // it's the last), and across the back.
    const fenceFrom = fits ? frontLine : edge - out * 4;
    const sideRun = (t: number) => {
      const [ax, az] = at(t, fenceFrom);
      const [bx, bz] = at(t, back);
      fenceRun(ax, az, bx, bz);
    };
    sideRun(s0);
    if (last) sideRun(s1);
    if (backFence) {
      const [ax, az] = at(s0, back);
      const [bx, bz] = at(s1, back);
      fenceRun(ax, az, bx, bz);
    }
  }

  // ------------------------------------------------------------------ Town Centre: rows of shops

  /**
   * A row of buildings shoulder to shoulder (or `gap` apart), centred along the block, all facing
   * `face`, each in its own colours, with flower beds along the fronts and a path to the sidewalk from
   * every other door. `line` is where their backs stand (or their fronts, with `byFront`). Any that would
   * land on `avoid` are left out.
   */
  function placeRow(block: CityBlock, zone: CityZone, face: Side, wanted: number, line: number, byFront: boolean, taken: Rect[], avoid: Rect[], skins: { last: number }, gap = 0) {
    const alongX = face === 'N' || face === 'S';
    const span = alongX ? block.x1 - block.x0 : block.z1 - block.z0;
    const yaw = FACING[face];
    const [ox, oz] = OUT[face];
    const out = ox + oz;
    const models: string[] = [];
    let length = 0;
    for (let k = 0; k < wanted; k++) {
      const model = pick(rng, ROW_SETS[zone]);
      const b = turnedBounds(model, yaw);
      const w = (alongX ? b.x1 - b.x0 : b.z1 - b.z0) + (k > 0 ? gap : 0);
      if (length + w > span - 12) break;
      models.push(model);
      length += w;
    }
    let cursor = (alongX ? block.x0 + block.x1 : block.z0 + block.z1) / 2 - length / 2;
    for (const [index, model] of models.entries()) {
      const b = turnedBounds(model, yaw);
      const [lo, hi] = alongX ? [b.z0, b.z1] : [b.x0, b.x1];
      // The back is the side away from the street; the front the other.
      const across = line - (byFront ? (out > 0 ? hi : lo) : out > 0 ? lo : hi);
      const x = alongX ? cursor - b.x0 : across;
      const z = alongX ? across : cursor - b.z0;
      cursor += (alongX ? b.x1 - b.x0 : b.z1 - b.z0) + gap;
      const rect = { x0: x + b.x0, x1: x + b.x1, z0: z + b.z0, z1: z + b.z1 };
      if (avoid.some((r) => overlaps(r, rect))) continue;
      const count = skinCount(model);
      let skin = intBetween(rng, 0, count - 1);
      if (skin === skins.last) skin = (skin + 1) % count;
      skins.last = skin;
      placeBuilding(zone, model, x, z, face, skin, zone !== 'residential');
      backYard(zone, rect, face, taken, index === models.length - 1);
      taken.push(expand(rect, 1.5));
      frontGarden(block, zone, rect, face, taken, index % 2 === 0);
    }
  }

  /** A dumpster and bin bags beside the last building in a row of shops. */
  function backYard(zone: CityZone, rect: Rect, face: Side, taken: Rect[], last: boolean) {
    if (!last || zone === 'residential' || rng() >= 0.6) return;
    const alongX = face === 'N' || face === 'S';
    const [ox, oz] = OUT[face];
    const out = ox + oz;
    const back = face === 'N' ? rect.z0 : face === 'S' ? rect.z1 : face === 'E' ? rect.x0 : rect.x1;
    const end = alongX ? rect.x1 : rect.z1;
    // Beside the building's back corner, lid toward the side.
    const at = (along: number, across: number): [number, number] => (alongX ? [along, across] : [across, along]);
    const [dx, dz] = at(end + 1.2, back + out * 1.4);
    addProp('dumpster', dx, dz, alongX ? 'E' : 'N');
    for (let k = 0; k < intBetween(rng, 1, 3); k++) {
      const [bx, bz] = at(end + between(rng, 0.6, 1.8), back + out * between(rng, 2.6, 3.4));
      props.push({ piece: 'prop/trah-bag-grey', x: bx, y: KERB_HEIGHT, z: bz, yaw: rng() * Math.PI * 2, scale: between(rng, 0.85, 1.15) });
    }
    taken.push(alongX ? { x0: end, x1: end + 2.6, z0: Math.min(back, back + out * 4), z1: Math.max(back, back + out * 4) } : { z0: end, z1: end + 2.6, x0: Math.min(back, back + out * 4), x1: Math.max(back, back + out * 4) });
  }

  /**
   * 4 to 12 shops: up to 5 in one row in the middle of the block; up to 9 in two rows back to back
   * facing the streets either side; more in two rows along those streets round a green courtyard.
   */
  function placeCluster(block: CityBlock, taken: Rect[]) {
    const zone = block.zone;
    const count = pick(rng, CLUSTER_SIZES);
    const alongX = block.x1 - block.x0 >= block.z1 - block.z0 ? rng() < 0.75 : rng() < 0.25;
    const [lo, hi] = alongX ? [block.z0, block.z1] : [block.x0, block.x1];
    const mid = (lo + hi) / 2;
    const [up, down]: Side[] = alongX ? ['N', 'S'] : ['E', 'W'];
    const skins = { last: -1 };
    if (count <= 5) {
      // One row, back from the middle a little, leaving a bigger forecourt in front.
      const outward = rng() < 0.5;
      placeRow(block, zone, outward ? up : down, count, mid + (outward ? -1 : 1) * between(rng, 0, 4), false, taken, [], skins);
    } else if (count <= 9) {
      placeRow(block, zone, up, Math.ceil(count / 2), mid, false, taken, [], skins);
      placeRow(block, zone, down, Math.floor(count / 2), mid, false, taken, [], skins);
    } else {
      const setback = between(rng, 6, 8);
      placeRow(block, zone, up, Math.ceil(count / 2), hi - setback, true, taken, [], skins);
      placeRow(block, zone, down, Math.floor(count / 2), lo + setback, true, taken, [], skins);
      // A path down the courtyard, out to the sidewalks at both ends.
      const path = alongX ? { x0: block.x0, x1: block.x1, z0: mid - 1, z1: mid + 1 } : { x0: mid - 1, x1: mid + 1, z0: block.z0, z1: block.z1 };
      lots.push({ kind: 'path', ...path });
      taken.push(expand(path, 0.8));
    }
  }

  /**
   * A public building (or one of Parkside's) facing one street, set back behind a paved forecourt with
   * its name board by the sidewalk, a car park (or playground, or square) beside it, and a row of houses
   * or shops behind it facing the street on the other side.
   */
  function placeService(block: CityBlock, zone: CityZone, spec: ServiceSpec, taken: Rect[]): CityBuilding {
    const wide = block.x1 - block.x0 >= block.z1 - block.z0;
    const face: Side = wide ? (rng() < 0.5 ? 'N' : 'S') : rng() < 0.5 ? 'E' : 'W';
    const alongX = face === 'N' || face === 'S';
    const [ox, oz] = OUT[face];
    const out = ox + oz;
    const edge = face === 'N' ? block.z1 : face === 'S' ? block.z0 : face === 'E' ? block.x1 : block.x0;
    const back = face === 'N' ? block.z0 : face === 'S' ? block.z1 : face === 'E' ? block.x0 : block.x1;
    const [a0, a1] = alongX ? [block.x0, block.x1] : [block.z0, block.z1];
    const yaw = FACING[face];
    const b = turnedBounds(spec.model, yaw);
    const width = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
    const yardWidth = Math.min(28, a1 - a0 - width - 11);
    const mirrored = rng() < 0.5;
    const s0 = yardWidth >= 10 ? (mirrored ? a1 - 4 - width : a0 + 4) : (a0 + a1 - width) / 2;
    const s1 = s0 + width;
    const frontLine = edge - out * 10;
    const across = frontLine - (alongX ? (out > 0 ? b.z1 : b.z0) : out > 0 ? b.x1 : b.x0);
    const x = alongX ? s0 - b.x0 : across;
    const z = alongX ? across : s0 - b.z0;
    const building = placeBuilding(zone, spec.model, x, z, face, spec.skin, false);
    taken.push(expand(building, 1.5));
    const span = (p0: number, p1: number, q0: number, q1: number): Rect =>
      alongX ? { x0: p0, x1: p1, z0: Math.min(q0, q1), z1: Math.max(q0, q1) } : { x0: Math.min(q0, q1), x1: Math.max(q0, q1), z0: p0, z1: p1 };
    // Forecourt: paving from the doors to the sidewalk, flower beds along its sides.
    const fore = span(s0 - 1, s1 + 1, frontLine, edge);
    lots.push({ kind: 'plaza', ...fore });
    taken.push(fore);
    for (const t of [s0 - 1.8, s1 + 1.8]) {
      for (let q = 1.5; q < 9; q += 1.2) {
        const c = edge - out * q;
        addPlant(pick(rng, FLOWERS), alongX ? t : c, alongX ? c : t, 0.8, 1.1);
      }
    }
    // The name board by the sidewalk, off to one side of the doors.
    const along = s0 + width * (mirrored ? 0.22 : 0.78);
    const at = edge - out * 2.2;
    addBoard(spec.name, alongX ? along : at, alongX ? at : along, face, spec.background, spec.color);
    // A neon tube over the doors (the arcade, the diner).
    if (spec.neon !== undefined) {
      const front = frontLine + out * 0.25;
      const mid = (s0 + s1) / 2;
      const [nx2, nz2] = alongX ? [mid, front] : [front, mid];
      neon.push(alongX ? { x: nx2, y: KERB_HEIGHT + 3.4, z: nz2, hx: width * 0.32, hy: 0.09, hz: 0.06, color: spec.neon } : { x: nx2, y: KERB_HEIGHT + 3.4, z: nz2, hx: 0.06, hy: 0.09, hz: width * 0.32, color: spec.neon });
    }
    // Beside it: a car park, a playground or a little square.
    const yard = yardWidth >= 10 ? (mirrored ? span(a0 + 3, s0 - 4, edge - out * 2, edge - out * 19) : span(s1 + 4, a1 - 3, edge - out * 2, edge - out * 19)) : undefined;
    if (yard) {
      taken.push(yard);
      if (spec.yard === 'parking') {
        lots.push({ kind: 'parking', ...yard });
        parkCars(yard, alongX, spec.fill ?? 0.5, spec.cars ?? CIVILIAN_CARS);
      } else if (spec.yard === 'playground') {
        lots.push({ kind: 'dirt', ...yard });
        const cx2 = (yard.x0 + yard.x1) / 2;
        const cz2 = (yard.z0 + yard.z1) / 2;
        for (const s of [-1, 1]) {
          const [bx, bz] = alongX ? [cx2 + s * 4, yard.z0 + 1.2] : [yard.x0 + 1.2, cz2 + s * 4];
          addProp('bench', bx, bz, alongX ? 'N' : 'E');
        }
        addProp('trash-can', alongX ? cx2 : yard.x0 + 1.2, alongX ? yard.z0 + 1.2 : cz2, alongX ? 'N' : 'E');
      } else {
        lots.push({ kind: 'plaza', ...yard });
        const cx2 = (yard.x0 + yard.x1) / 2;
        const cz2 = (yard.z0 + yard.z1) / 2;
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const px = cx2 + dx * (yard.x1 - yard.x0) * 0.28;
          const pz = cz2 + dz * (yard.z1 - yard.z0) * 0.28;
          props.push({ piece: 'k/suburban/planter', x: px, y: KERB_HEIGHT, z: pz, yaw: 0 });
          colliders.push({ x: px, y: KERB_HEIGHT + 0.35, z: pz, hx: 0.8, hy: 0.35, hz: 0.6 });
          addPlant(pick(rng, FLOWERS), px, pz, 0.7, 0.9);
        }
        addProp('bench', cx2, cz2, face);
      }
    }
    // Houses or shops behind, facing the other street (detached houses in Maple Grove).
    const behindZone = zone === 'residential' ? 'residential' : 'commercial';
    placeRow(block, behindZone, opposite(face), intBetween(rng, 3, 5), back + out * 7, true, taken, [expand(building, 3), ...(yard ? [yard] : [])], { last: spec.skin ?? -1 }, zone === 'residential' ? 4 : 0);
    return building;
  }

  /** A name board on two posts, its face toward `face`. */
  function addBoard(text: string, x: number, z: number, face: Side, background: string, color: string) {
    const yaw = FACING[face];
    const w = Math.max(3.4, text.length * 0.55 + 1.2);
    const h = 1.3;
    const y = KERB_HEIGHT + 1.6;
    const frame = '#34343c';
    shapes.push({ kind: 'box', x, y: y - h / 2 - 0.1, z, w: w + 0.2, h: h + 0.2, d: 0.16, yaw, color: frame });
    for (const s of [-1, 1]) {
      const [px, pz] = rotate(s * (w / 2 - 0.4), 0, yaw);
      shapes.push({ kind: 'box', x: x + px, y: KERB_HEIGHT, z: z + pz, w: 0.14, h: y - h / 2 - KERB_HEIGHT, d: 0.14, yaw, color: frame });
    }
    const [fx, fz] = rotate(0, 0.09, yaw);
    signs.push({ text, x: x + fx, y, z: z + fz, yaw, w, h, background, color });
    const across = face === 'E' || face === 'W';
    colliders.push({ x, y: y / 2 + 0.4, z, hx: across ? 0.1 : w / 2, hy: y / 2 + 0.4, hz: across ? w / 2 : 0.1 });
  }

  /** Cars nose-in along both long sides of a car park, in some of the bays. */
  function parkCars(lot: Rect, alongX: boolean, fill: number, models: readonly Car[]) {
    const length = alongX ? lot.x1 - lot.x0 : lot.z1 - lot.z0;
    const bays = Math.floor(length / 2.8);
    if (bays < 1) return;
    const pitch = length / bays;
    for (const row of [0, 1]) {
      const side: Side = alongX ? (row === 0 ? 'S' : 'N') : row === 0 ? 'W' : 'E';
      const c = alongX ? (row === 0 ? lot.z0 + 2.7 : lot.z1 - 2.7) : row === 0 ? lot.x0 + 2.7 : lot.x1 - 2.7;
      for (let k = 0; k < bays; k++) {
        if (rng() >= fill) continue;
        const t = (alongX ? lot.x0 : lot.z0) + (k + 0.5) * pitch;
        const model = pick(rng, models);
        const [w, l, h] = CARS[model];
        const x = alongX ? t : c;
        const z = alongX ? c : t;
        props.push({ piece: `car/${model}`, x, y: KERB_HEIGHT, z, yaw: FACING[side] + between(rng, -0.04, 0.04) });
        colliders.push({ x, y: KERB_HEIGHT + h / 2, z, hx: (alongX ? w : l) / 2, hy: h / 2, hz: (alongX ? l : w) / 2 });
      }
    }
  }

  /** A path from a shop's door out to the sidewalk (if `withPath`), flowers along the front, café tables. */
  function frontGarden(block: CityBlock, zone: CityZone, rect: Rect, face: Side, taken: Rect[], withPath: boolean) {
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
    const toward = Math.sign(edge - front);
    const a0 = alongX ? rect.x0 : rect.z0;
    const a1 = alongX ? rect.x1 : rect.z1;
    const room = Math.abs(edge - front);
    // Café tables under parasols out front, either side of the door.
    if (zone !== 'residential' && room > 5 && rng() < 0.4) {
      for (const t of [door - 2.6, door + 2.6]) {
        if (t < a0 + 1 || t > a1 - 1) continue;
        const [x, z] = alongX ? [t, front + toward * 2.4] : [front + toward * 2.4, t];
        addProp(rng() < 0.5 ? 'parasol' : 'parasol-2', x, z, face);
        taken.push({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5 });
      }
      return;
    }
    // A flower bed along the front, 1.3 m out, leaving the path clear.
    if (room > 3) {
      for (let t = a0 + 0.6; t < a1 - 0.4; t += between(rng, 0.9, 1.5)) {
        if (Math.abs(t - door) < 1.6) continue;
        const [x, z] = alongX ? [t, front + toward * 1.3] : [front + toward * 1.3, t];
        if (rng() < 0.3) addProp('planter-bushes', x, z, face, false);
        else addPlant(pick(rng, FLOWERS), x, z, 0.8, 1.2);
      }
    }
    // Bicycles parked against the front by the door.
    if (room > 3 && rng() < 0.3) {
      const side = rng() < 0.5 ? 1 : -1;
      for (let k = 0; k < intBetween(rng, 1, 2); k++) {
        const t = door + side * (2.4 + k * 1.95);
        if (t < a0 + 0.9 || t > a1 - 0.9) break;
        const across = front + toward * 0.55;
        const [x, z] = alongX ? [t, across] : [across, t];
        // Leaning along the wall.
        props.push({ piece: 'prop/bicycle', x, y: KERB_HEIGHT, z, yaw: FACING[face] + between(rng, -0.05, 0.05) });
      }
    }
  }

  /** A park: crossing paths with a ring of flowers where they meet, benches and bins, a big old tree. */
  function placePark(block: CityBlock, taken: Rect[]) {
    const cx2 = (block.x0 + block.x1) / 2;
    const cz2 = (block.z0 + block.z1) / 2;
    const half = 1.3;
    const paths = [
      { x0: block.x0, x1: block.x1, z0: cz2 - half, z1: cz2 + half },
      { x0: cx2 - half, x1: cx2 + half, z0: block.z0, z1: block.z1 },
    ];
    for (const path of paths) {
      lots.push({ kind: 'path', ...path });
      taken.push(expand(path, 0.8));
    }
    // Flowers round the crossing, in the four corners between the paths.
    const ring = 4.2;
    for (let a = 0; a < 32; a++) {
      const angle = ((a + 0.5) / 32) * Math.PI * 2;
      const x = Math.cos(angle) * ring;
      const z = Math.sin(angle) * ring;
      if (Math.abs(x) < half + 0.8 || Math.abs(z) < half + 0.8) continue;
      addPlant(pick(rng, FLOWERS), cx2 + x, cz2 + z, 0.9, 1.2);
    }
    taken.push({ x0: cx2 - ring - 1, x1: cx2 + ring + 1, z0: cz2 - ring - 1, z1: cz2 + ring + 1 });
    // Benches facing the paths, each with a bin.
    for (const [dx, dz, face] of [[9, 1, 'S'], [-9, -1, 'N'], [1, 9, 'W'], [-1, -9, 'E']] as const) {
      const off = half + 1.2;
      const x = cx2 + (Math.abs(dx) > 1 ? dx : dx * off);
      const z = cz2 + (Math.abs(dz) > 1 ? dz : dz * off);
      addProp('bench', x, z, face);
      addProp('trash-can', x + (face === 'N' || face === 'S' ? 1.5 : 0), z + (face === 'E' || face === 'W' ? 1.5 : 0), face);
    }
    // A big old tree in the middle of one quarter.
    const qx = cx2 + ((rng() < 0.5 ? -1 : 1) * (block.x1 - block.x0)) / 4;
    const qz = cz2 + ((rng() < 0.5 ? -1 : 1) * (block.z1 - block.z0)) / 4;
    addTree(pick(rng, ['twisted-tree', 'twisted-tree-3']), qx, qz, 0.6, 0.75);
    taken.push({ x0: qx - 6, x1: qx + 6, z0: qz - 6, z1: qz + 6 });
    for (let r = intBetween(rng, 2, 4); r > 0; r--) {
      addPlant(pick(rng, ['rock-medium', 'rock-medium-3']), between(rng, block.x0 + 3, block.x1 - 3), between(rng, block.z0 + 3, block.z1 - 3), 0.7, 1.2);
    }
  }

  /** A paved square with planters, and a car park beside it. */
  function placeSquare(block: CityBlock, taken: Rect[]) {
    const w = block.x1 - block.x0;
    const d = block.z1 - block.z0;
    const plaza = { x0: block.x0 + 4, x1: block.x0 + w * 0.55, z0: block.z0 + 4, z1: block.z1 - 4 };
    lots.push({ kind: 'plaza', ...plaza });
    taken.push(plaza);
    // Planters in two neat lines down the square.
    const pw = plaza.x1 - plaza.x0;
    for (const fx of [0.25, 0.75]) {
      for (let pz = plaza.z0 + 4; pz < plaza.z1 - 3; pz += 8) {
        const px = plaza.x0 + pw * fx;
        props.push({ piece: 'k/suburban/planter', x: px, y: KERB_HEIGHT, z: pz, yaw: 0 });
        colliders.push({ x: px, y: KERB_HEIGHT + 0.35, z: pz, hx: 0.8, hy: 0.35, hz: 0.6 });
        addPlant(pick(rng, FLOWERS), px, pz, 0.7, 0.9);
      }
    }
    addProp('bench', (plaza.x0 + plaza.x1) / 2, plaza.z0 + 1.5, 'N');
    const bays = Math.floor((d - 8) / 2.8) * 2.8;
    const parking = { x0: block.x0 + w * 0.6, x1: block.x0 + w * 0.6 + 17, z0: block.z0 + 4, z1: block.z0 + 4 + bays };
    if (parking.x1 < block.x1 - 2) {
      lots.push({ kind: 'parking', ...parking });
      taken.push(parking);
      parkCars(parking, false, 0.55, CIVILIAN_CARS);
    }
  }

  /**
   * Greenery over what's left of a block: trees in rows on a regular grid (avenues along the gardens,
   * an orchard in a courtyard or a park) wherever it's clear, then bushes, flowers, grass tufts. Family
   * lots have their own garden trees, so they only get the small things.
   */
  function plant(block: CityBlock, kind: 'cluster' | 'park' | 'square' | 'service' | 'homes', taken: Rect[]) {
    const placed: [number, number, number][] = []; // x, z, radius
    const clear = (x: number, z: number, radius: number) =>
      !taken.some((r) => x > r.x0 - radius && x < r.x1 + radius && z > r.z0 - radius && z < r.z1 + radius) &&
      !placed.some(([px, pz, pr]) => (px - x) ** 2 + (pz - z) ** 2 < (pr + radius) ** 2);
    const tryAt = (radius: number, inset: number): [number, number] | undefined => {
      for (let t = 0; t < 14; t++) {
        const x = between(rng, block.x0 + inset, block.x1 - inset);
        const z = between(rng, block.z0 + inset, block.z1 - inset);
        if (!clear(x, z, radius)) continue;
        placed.push([x, z, radius]);
        return [x, z];
      }
      return undefined;
    };
    const cx2 = (block.x0 + block.x1) / 2;
    const cz2 = (block.z0 + block.z1) / 2;
    if (kind !== 'homes') {
      // One kind of tree per block, all much the same size, on a grid centred on the block.
      const spacing = kind === 'park' ? 9 : 12;
      const treeKind = pick(rng, block.zone === 'commercial' ? ['tree-4', 'tree-5'] : PARK_TREES);
      const inset = 3;
      const startX = cx2 - Math.floor((cx2 - block.x0 - inset) / spacing) * spacing;
      const startZ = cz2 - Math.floor((cz2 - block.z0 - inset) / spacing) * spacing;
      for (let x = startX; x <= block.x1 - inset; x += spacing) {
        for (let z = startZ; z <= block.z1 - inset; z += spacing) {
          if (!clear(x, z, 2.4)) continue;
          placed.push([x, z, 2.4]);
          // Parks: every other row of pines.
          const pines = kind === 'park' && Math.round((z - startZ) / spacing) % 2 === 1;
          addTree(pines ? 'pine-5' : treeKind, x, z, 0.85, 0.95);
        }
      }
    }
    const area = ((block.x1 - block.x0) * (block.z1 - block.z0)) / 3000; // about 1 for a normal block
    for (let b = Math.round(intBetween(rng, 3, 6) * area); b > 0; b--) {
      const at = tryAt(1, 1.2);
      if (at) addPlant(pick(rng, ['bush', 'bush', 'bush-with-flowers']), at[0], at[1], 0.9, 1.3);
    }
    for (let f = Math.round(intBetween(rng, 4, 8) * area); f > 0; f--) {
      const at = tryAt(0.6, 1);
      if (at) addPlant(pick(rng, FLOWERS), at[0], at[1], 0.8, 1.2);
    }
    for (let g = Math.round(intBetween(rng, 20, 35) * area); g > 0; g--) {
      const at = tryAt(0.3, 0.8);
      if (at) addPlant(pick(rng, GROUND_COVER), at[0], at[1], 0.8, 1.4);
    }
  }

  // ------------------------------------------------------------------ Parkside: the community lots

  function fillParkside(block: CityBlock, venue: CityVenue, taken: Rect[]) {
    switch (venue) {
      case 'arcade':
      case 'events':
      case 'market':
      case 'diner': {
        const building = placeService(block, 'leisure', VENUES[venue], taken);
        venueOf.set(building, venue);
        plant(block, 'service', taken);
        return;
      }
      case 'fairground':
        placeFairground(block, taken);
        break;
      case 'skatepark':
        placeSkatePark(block, taken);
        break;
      case 'graveyard':
        placeGraveyard(block, taken);
        return; // the graveyard has its own pines
      case 'foodcourt':
        placeFoodCourt(block, taken);
        break;
      default:
        placePark(block, taken);
        plant(block, 'park', taken);
        return;
    }
    plant(block, 'square', taken);
  }

  /** The side of a block facing its longer street, and helpers to place things relative to it. */
  function frontage(block: CityBlock) {
    const wide = block.x1 - block.x0 >= block.z1 - block.z0;
    const face: Side = wide ? (rng() < 0.5 ? 'N' : 'S') : rng() < 0.5 ? 'E' : 'W';
    const alongX = face === 'N' || face === 'S';
    const [ox, oz] = OUT[face];
    const out = ox + oz;
    const edge = face === 'N' ? block.z1 : face === 'S' ? block.z0 : face === 'E' ? block.x1 : block.x0;
    const back = face === 'N' ? block.z0 : face === 'S' ? block.z1 : face === 'E' ? block.x0 : block.x1;
    const [a0, a1] = alongX ? [block.x0, block.x1] : [block.z0, block.z1];
    /** World (x, z) of a point `along` the street and `inward` from the block's edge. */
    const at = (along: number, inward: number): [number, number] => (alongX ? [along, edge - out * inward] : [edge - out * inward, along]);
    const depth = Math.abs(edge - back);
    return { face, alongX, out, edge, back, a0, a1, mid: (a0 + a1) / 2, depth, at };
  }

  /**
   * The fairground: an entrance arch by the street into a paved square ringed by food, drink and
   * information stalls (and the toilets), benches and bins, trees and flower beds in the corners.
   */
  function placeFairground(block: CityBlock, taken: Rect[]) {
    const f = frontage(block);
    const inset = 3;
    const ground = expand(block, -inset);
    lots.push({ kind: 'plaza', ...ground });
    taken.push(ground);
    // The arch, just in from the sidewalk.
    const [ex, ez] = f.at(f.mid, inset + 1.5);
    addPiece('k/coaster/park-entrance', ex, ez, FACING[f.face]);
    for (const s of [-1, 1]) {
      const [px, pz] = f.at(f.mid + s * 4.1, inset + 1.5);
      colliders.push({ x: px, y: KERB_HEIGHT + 3.5, z: pz, hx: 0.6, hy: 3.5, hz: 0.6 });
    }
    addBoard('FAIRGROUND', ...f.at(f.mid + 9, 1.8), f.face, '#ff5fa2', '#ffffff');
    // Stalls along the back and both sides, facing into the square.
    const stalls: Prop[] = ['stall-food', 'stall-drinks', 'stall-food', 'stall-information', 'stall-drinks', 'stall-food', 'stall-toilets'];
    let n = 0;
    for (let t = f.a0 + inset + 5; t < f.a1 - inset - 4; t += 6.5) {
      const [x, z] = f.at(t, f.depth - inset - 2.5);
      addProp(stalls[n++ % stalls.length], x, z, f.face);
    }
    for (const s of [-1, 1]) {
      const side: Side = f.alongX ? (s > 0 ? 'W' : 'E') : s > 0 ? 'S' : 'N';
      const along = s > 0 ? f.a1 - inset - 2.5 : f.a0 + inset + 2.5;
      for (let q = inset + 9; q < f.depth - inset - 7; q += 7) {
        const [x, z] = f.at(along, q);
        addProp(stalls[n++ % stalls.length], x, z, side);
      }
    }
    // Picnic tables under parasols in the middle, with benches and bins round them.
    for (let q = inset + 10; q < f.depth - inset - 8; q += 6) {
      for (let t = f.mid - 9; t <= f.mid + 9; t += 6) {
        const [x, z] = f.at(t, q);
        addProp(rng() < 0.5 ? 'parasol' : 'parasol-2', x, z, f.face);
      }
    }
    for (const s of [-1, 1]) {
      const [bx, bz] = f.at(f.mid + s * 14, inset + 6);
      addProp('park-bench', bx, bz, opposite(f.face));
      const [tx, tz] = f.at(f.mid + s * 16, inset + 6);
      addProp('park-bin', tx, tz, opposite(f.face));
    }
    // Trees and flower beds in the corners.
    for (const s of [-1, 1]) {
      for (const q of [inset + 3, f.depth - inset - 3]) {
        const [x, z] = f.at(s > 0 ? f.a1 - inset - 3 : f.a0 + inset + 3, q);
        addTree('k/coaster/tree-large', x, z, 0.9, 1.1);
        const [fx, fz] = f.at(s > 0 ? f.a1 - inset - 6.5 : f.a0 + inset + 6.5, q);
        addPiece('k/coaster/flowers', fx, fz, rng() * Math.PI * 2);
      }
    }
  }

  /**
   * The skate park: a concrete pad with half-pipes along the back, ramps, boxes and rails in the middle,
   * a fence round it open to the street, and benches to watch from.
   */
  function placeSkatePark(block: CityBlock, taken: Rect[]) {
    const f = frontage(block);
    const tile = 2.5;
    const across = Math.min(10, Math.floor((f.a1 - f.a0 - 14) / tile)); // tiles along the street
    const deep = Math.min(8, Math.floor((f.depth - 14) / tile)); // tiles back from it
    if (across < 4 || deep < 4) {
      placePark(block, taken);
      return;
    }
    const from = f.mid - (across * tile) / 2;
    const near = 8; // the pad starts this far in from the sidewalk
    const [px0, pz0] = f.at(from, near);
    const [px1, pz1] = f.at(from + across * tile, near + deep * tile);
    const pad = { x0: Math.min(px0, px1), x1: Math.max(px0, px1), z0: Math.min(pz0, pz1), z1: Math.max(pz0, pz1) };
    lots.push({ kind: 'plaza', ...pad });
    taken.push(expand(pad, 1));
    const yaw = FACING[f.face];
    const cell = (i: number, j: number) => f.at(from + (i + 0.5) * tile, near + (j + 0.5) * tile);
    // Half-pipes across the back, their ramps toward the street.
    for (let i = 0; i < across; i++) {
      const [x, z] = cell(i, deep - 1);
      addPiece('k/skate/half-pipe', x, z, yaw, { w: tile, d: tile, h: 2 });
    }
    // Obstacles in the middle, a tile apart.
    const obstacles = ['k/skate/ramp', 'k/skate/obstacle-box', 'k/skate/rail-low', 'k/skate/steps-rail', 'k/skate/obstacle-middle-rail', 'k/skate/ramp-rail', 'k/skate/rail-high'];
    for (let j = 1; j < deep - 2; j += 2) {
      for (let i = 1; i < across - 1; i += 2) {
        if (rng() < 0.25) continue;
        const [x, z] = cell(i, j);
        const piece = pick(rng, obstacles);
        addPiece(piece, x, z, yaw + (rng() < 0.5 ? 0 : Math.PI), { w: 1.6, d: 1.6, h: 0.8 });
      }
    }
    // The fence round the sides and back.
    const corners: [number, number][] = [f.at(from, near), f.at(from, near + deep * tile), f.at(from + across * tile, near + deep * tile), f.at(from + across * tile, near)];
    for (let k = 0; k < 3; k++) fenceRun(corners[k][0], corners[k][1], corners[k + 1][0], corners[k + 1][1], 'k/skate/fence', tile, 0.9);
    // Benches along the front, a skateboard or two lying about.
    for (const s of [-1, 1]) {
      const [bx, bz] = f.at(f.mid + s * (across * tile * 0.3), near - 2.2);
      addProp('skate-benches', bx, bz, opposite(f.face));
    }
    for (let k = intBetween(rng, 1, 3); k > 0; k--) {
      const [sx2, sz2] = cell(intBetween(rng, 0, across - 1), intBetween(rng, 0, Math.max(0, deep - 2)));
      addPiece(rng() < 0.7 ? 'k/skate/skateboard' : 'k/skate/scooter', sx2, sz2, rng() * Math.PI * 2);
    }
    addBoard('SKATE PARK', ...f.at(f.mid, 2), f.face, '#1e2b4a', '#7cf2ff');
  }

  /**
   * The old graveyard: an iron fence with a gate onto the street, a gravel path up to the family crypt,
   * rows of gravestones either side, pines along the fence, lamp posts, candles and a few pumpkins.
   */
  function placeGraveyard(block: CityBlock, taken: Rect[]) {
    const f = frontage(block);
    const inset = 2.5;
    const yaw = FACING[f.face];
    // The fence round the block, the gate in the middle of the front.
    const [c0x, c0z] = f.at(f.a0 + inset, inset);
    const [c1x, c1z] = f.at(f.a0 + inset, f.depth - inset);
    const [c2x, c2z] = f.at(f.a1 - inset, f.depth - inset);
    const [c3x, c3z] = f.at(f.a1 - inset, inset);
    const [g0x, g0z] = f.at(f.mid - 1.25, inset);
    const [g1x, g1z] = f.at(f.mid + 1.25, inset);
    fenceRun(c0x, c0z, c1x, c1z, 'k/graveyard/iron-fence', 2.5, 2.2);
    fenceRun(c1x, c1z, c2x, c2z, 'k/graveyard/iron-fence', 2.5, 2.2);
    fenceRun(c2x, c2z, c3x, c3z, 'k/graveyard/iron-fence', 2.5, 2.2);
    fenceRun(c3x, c3z, g1x, g1z, 'k/graveyard/iron-fence', 2.5, 2.2);
    fenceRun(g0x, g0z, c0x, c0z, 'k/graveyard/iron-fence', 2.5, 2.2);
    addPiece('k/graveyard/iron-fence-border-gate', ...f.at(f.mid, inset), yaw);
    for (const [x, z] of [[c0x, c0z], [c1x, c1z], [c2x, c2z], [c3x, c3z]] as const) addPiece('k/graveyard/border-pillar', x, z, 0, { w: 0.55, d: 0.55, h: 1.9 });
    addBoard('OLD GRAVEYARD', ...f.at(f.mid + 6, 1.2), f.face, '#2b2b33', '#cfd8c8');
    // The path up the middle to the crypt.
    const [p0x, p0z] = f.at(f.mid - 1.2, inset);
    const [p1x, p1z] = f.at(f.mid + 1.2, f.depth - 12);
    lots.push({ kind: 'dirt', x0: Math.min(p0x, p1x), x1: Math.max(p0x, p1x), z0: Math.min(p0z, p1z), z1: Math.max(p0z, p1z) });
    const [kx, kz] = f.at(f.mid, f.depth - 8);
    addPiece('k/graveyard/crypt-large', kx, kz, yaw, f.alongX ? { w: 4.7, d: 6, h: 2.5 } : { w: 6, d: 4.7, h: 2.5 });
    addPiece('k/graveyard/crypt-large-roof', kx, kz, yaw, undefined, KERB_HEIGHT + 2.5);
    for (const s of [-1, 1]) {
      const [lx, lz] = f.at(f.mid + s * 3.2, f.depth - 12.5);
      addPiece('k/graveyard/candle-multiple', lx, lz, rng() * 6);
    }
    // Rows of graves either side of the path, facing it... and the street.
    for (let q = inset + 5; q < f.depth - inset - 4; q += 4.2) {
      for (let t = f.a0 + inset + 3; t < f.a1 - inset - 3; t += 3.2) {
        if (Math.abs(t - f.mid) < 3.5) continue;
        if (Math.abs(t - f.mid) < 6 && q > f.depth - 15) continue; // round the crypt
        if (rng() < 0.12) continue;
        const [x, z] = f.at(t, q);
        const stone = pick(rng, GRAVESTONES);
        addPiece(stone, x, z, yaw + between(rng, -0.08, 0.08), { w: 1, d: 1, h: 1.3 });
        if (rng() < 0.55) {
          const [mx, mz] = f.at(t, q - 1.8);
          addPiece('k/graveyard/grave', mx, mz, yaw);
        }
      }
    }
    // Pines along the fence, lamp posts by the path, benches, pumpkins.
    for (let t = f.a0 + inset + 1.5; t < f.a1 - inset - 1; t += between(rng, 5, 8)) {
      const [x, z] = f.at(t, f.depth - inset - 1.8);
      addTree(pick(rng, ['k/graveyard/pine', 'k/graveyard/pine-crooked', 'k/graveyard/pine-fall']), x, z, 0.85, 1.1);
    }
    for (let q = inset + 4; q < f.depth - 14; q += 9) {
      const [lx, lz] = f.at(f.mid + 2, q);
      addProp('grave-light', lx, lz, f.face);
      lights.push({ x: lx, y: KERB_HEIGHT + 3, z: lz, color: AMBER });
    }
    for (const s of [-1, 1]) {
      const [bx, bz] = f.at(f.mid + s * 2.6, inset + 6);
      addProp('grave-bench', bx, bz, f.alongX ? (s > 0 ? 'W' : 'E') : s > 0 ? 'S' : 'N');
    }
    for (let k = intBetween(rng, 2, 5); k > 0; k--) {
      const [x, z] = f.at(f.mid + (rng() < 0.5 ? -1 : 1) * between(rng, 1.8, 2.4), between(rng, inset + 2, f.depth - 14));
      addPiece(pick(rng, ['k/graveyard/pumpkin', 'k/graveyard/pumpkin-carved', 'k/graveyard/pumpkin-tall-carved']), x, z, rng() * 6);
    }
  }

  /** A food court: stalls along the back of a paved square, tables under parasols, benches and bins. */
  function placeFoodCourt(block: CityBlock, taken: Rect[]) {
    const f = frontage(block);
    const inset = 6;
    const [p0x, p0z] = f.at(f.a0 + inset, inset);
    const [p1x, p1z] = f.at(f.a1 - inset, f.depth - inset);
    const square = { x0: Math.min(p0x, p1x), x1: Math.max(p0x, p1x), z0: Math.min(p0z, p1z), z1: Math.max(p0z, p1z) };
    lots.push({ kind: 'plaza', ...square });
    taken.push(square);
    const stalls: Prop[] = ['stall-food', 'stall-drinks', 'stall-food', 'stall-food', 'stall-drinks'];
    let n = 0;
    for (let t = f.a0 + inset + 4; t < f.a1 - inset - 3; t += 6) {
      const [x, z] = f.at(t, f.depth - inset - 2.5);
      addProp(stalls[n++ % stalls.length], x, z, f.face);
    }
    for (let q = inset + 4; q < f.depth - inset - 9; q += 5.5) {
      for (let t = f.a0 + inset + 4; t < f.a1 - inset - 3; t += 5.5) {
        const [x, z] = f.at(t, q);
        addProp(rng() < 0.5 ? 'parasol' : 'parasol-2', x, z, f.face);
      }
    }
    for (const s of [-1, 1]) {
      const [bx, bz] = f.at(f.mid + s * 5, inset - 1.5);
      addProp('park-bin', bx, bz, f.face);
    }
    addBoard('FOOD COURT', ...f.at(f.mid, 2.2), f.face, '#ffb000', '#3a1a00');
  }

  // ------------------------------------------------------------------ the monorail

  /**
   * Track along the middle of Parkside's boundary streets, a 12 m-radius curve at each corner, on pairs
   * of slim supports in the middle of the road (between the lanes, away from the junctions).
   */
  function buildMonorail(): CityMonorail {
    const x0 = xs[DISTRICT_COLUMNS.leisure[0]];
    const x1 = xs[nx - 1];
    const z0 = zs[0];
    const z1 = zs[nz - 1];
    const R = MONORAIL_RADIUS;
    const y = MONORAIL_BOTTOM + MONORAIL_HANG; // the pieces' origin
    const path: { x: number; z: number }[] = [];
    // Up the east side, along the north, down the west and back along the south: each corner turns left
    // (heading h becomes h - PI/2).
    let x = x1;
    let z = z0 + R;
    let h = 0;
    for (const length of [z1 - z0 - 2 * R, x1 - x0 - 2 * R, z1 - z0 - 2 * R, x1 - x0 - 2 * R]) {
      const dx = Math.sin(h);
      const dz = Math.cos(h);
      const count = Math.ceil(length / MONORAIL_STRAIGHT - 0.001);
      const pitch = length / count;
      for (let k = 0; k < count; k++) props.push({ piece: 'k/coaster/coaster-monorail-straight', x: x + dx * pitch * k, y, z: z + dz * pitch * k, yaw: h });
      // Supports every 24 m or so, kept out of the junctions.
      const crossings = Math.abs(dz) > 0.5 ? zs : xs;
      for (let t = 10; t < length - 4; t += 24) {
        const sx2 = x + dx * t;
        const sz2 = z + dz * t;
        const c = Math.abs(dz) > 0.5 ? sz2 : sx2;
        if (crossings.some((v) => Math.abs(v - c) < HALF_STREET + 2.5)) continue;
        for (const level of [0, 3]) props.push({ piece: 'k/coaster/support-small', x: sx2, y: level, z: sz2, yaw: h });
        colliders.push({ x: sx2, y: MONORAIL_BOTTOM / 2, z: sz2, hx: 0.5, hy: MONORAIL_BOTTOM / 2, hz: 0.5 });
      }
      path.push({ x, z });
      x += dx * length;
      z += dz * length;
      // The corner: a quarter circle about the point R to the left.
      props.push({ piece: 'k/coaster/coaster-monorail-corner-large', x, y, z, yaw: h });
      for (let s = 0; s < 8; s++) {
        const phi = (s / 8) * (Math.PI / 2);
        const [ox, oz] = rotate(-R + R * Math.cos(phi), R * Math.sin(phi), h);
        path.push({ x: x + ox, z: z + oz });
      }
      const [ex, ez] = rotate(-R, R, h);
      x += ex;
      z += ez;
      h -= Math.PI / 2;
    }
    return { path, y: MONORAIL_BOTTOM + MONORAIL_BEAM, cars: 3 };
  }

  /**
   * A little neon over a shop's street front: a tube over the door (warm colours, most shops), and now
   * and then a blade sign on the taller ones. Houses get none: it's a neighbourhood, not a strip.
   */
  function addSigns(b: CityBuilding) {
    const r = signRng;
    const base = KERB_HEIGHT;
    const alongX = b.face === 'S' || b.face === 'N';
    const [ox, oz] = OUT[b.face];
    const out = ox + oz; // +1 or -1 along the axis the front faces
    const front = b.face === 'S' ? b.z0 : b.face === 'N' ? b.z1 : b.face === 'W' ? b.x0 : b.x1;
    const a0 = alongX ? b.x0 : b.z0;
    const a1 = alongX ? b.x1 : b.z1;
    const width = a1 - a0;
    const colour = () => pick(r, [WARM, WARM, AMBER, PINK, CYAN, YELLOW, VIOLET]);
    const box = (along: number, halfAlong: number, y: number, hy: number, offset: number, halfOut: number, color: number) => {
      const c = front + out * offset;
      neon.push(alongX ? { x: along, y, z: c, hx: halfAlong, hy, hz: halfOut, color } : { x: c, y, z: along, hx: halfOut, hy, hz: halfAlong, color });
    };
    if (r() < 0.6) box((a0 + a1) / 2, width * between(r, 0.2, 0.35), base + 3.1, 0.08, 0.3, 0.05, colour());
    if (b.height > 9 && r() < 0.3) {
      const end = r() < 0.5 ? a0 + 1 : a1 - 1;
      const tall = Math.min(between(r, 2.5, 4.5), b.height - 5);
      box(end, 0.09, base + 4.2 + tall / 2, tall / 2, 0.6, 0.4, colour());
    }
  }

  return {
    seed,
    origin,
    bounds,
    districts: CITY_ZONES.map((zone) => ({
      zone,
      x0: zone === 'residential' ? bounds.x0 : xs[DISTRICT_COLUMNS[zone][0]],
      x1: zone === 'leisure' ? bounds.x1 : xs[DISTRICT_COLUMNS[zone][1]],
    })),
    streets,
    roads,
    sidewalks,
    buildings,
    props,
    shapes,
    lots,
    blocks,
    colliders,
    spots,
    neon,
    lights,
    signs,
    graph,
    monorail,
    interiors,
    home,
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
  const d = LANE_WIDTH * (LANES_PER_SIDE - 0.5);
  return { x: spot.x - Math.cos(spot.heading) * d, z: spot.z + Math.sin(spot.heading) * d, heading: spot.heading };
}

/** Middle of the sidewalk on one side of a spot's street (side 1 = right of the direction of travel). */
export function sidewalkAt(spot: CitySpot, side: 1 | -1 = 1) {
  const d = (HALF_STREET - SIDEWALK_WIDTH / 2) * side;
  return { x: spot.x - Math.cos(spot.heading) * d, y: KERB_HEIGHT, z: spot.z + Math.sin(spot.heading) * d, heading: spot.heading };
}

/** Whether someone can stand at a point: inside the city and not inside a building or a solid shape. */
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
