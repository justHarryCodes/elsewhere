// District (vicinity) data: camera presets, the defaults every district starts from, and the prebuilt
// block layouts. District coordinates put the hero building at the origin with its door facing +Z,
// toward the street or square in front of it.
//
// Three layouts, all plain data:
//   street  a shopping street: neighbours either side, the road in front, a crossing.
//   corner  on a corner: neighbours on the left, a side road on the right meeting the front road.
//   plaza   on a square: a paved plaza in front with trees and benches, the road beyond it.

import type { CameraPreset, DistrictDef, LocationDef } from './locations';
import type { Waypoint } from './npcBrain';
import type { Rect } from './playerMotion';
import type { LampDef, Placement, SceneDef, SceneLighting } from './scene';

export const CAMERA_PRESETS = {
  /** House, library, church: high and far, soft daylight, mostly following the player. */
  quiet: { pitchDeg: 42, yawDeg: 20, distance: 26, focus: { x: 0, z: 4 }, followBias: 0.7, fov: 45 },
  /** Shops, food, work: a touch lower and closer. */
  busy: { pitchDeg: 36, yawDeg: 20, distance: 22, focus: { x: 0, z: 5 }, followBias: 0.55, fov: 48 },
  /** The club: low and close, favouring the entrance and the queue. */
  club: { pitchDeg: 27, yawDeg: 15, distance: 17, focus: { x: 0, z: 5 }, followBias: 0.4, fov: 50 },
  /** A square: high, and turned to look across it. */
  plaza: { pitchDeg: 44, yawDeg: 28, distance: 30, focus: { x: 0, z: 10 }, followBias: 0.6, fov: 45 },
  /** A corner: turned toward the side road, so both streets read. */
  corner: { pitchDeg: 38, yawDeg: 35, distance: 24, focus: { x: 3, z: 5 }, followBias: 0.6, fov: 48 },
  /** Inside: high over the player's shoulder, so the walls in front can be cut away. */
  inside: { pitchDeg: 52, yawDeg: 20, distance: 13, focus: { x: 0, z: 0 }, followBias: 1, fov: 50 },
} as const satisfies Record<string, CameraPreset>;

/** The road's centre line in front of a street or corner block (tiles are 10 m: 8 m of road, 1 m kerbs). */
const ROAD_Z = 16;
const KERB_Z = ROAD_Z - 5;
/** A plaza's road runs further out, past the square. */
const PLAZA_ROAD_Z = 26;
/** A corner block's side road, running back (-Z) on the right. */
const SIDE_X = 16;

/** A loop along a road at z: the near lane one way, the far lane back, turning off-screen. */
const roadLoop = (z: number, near = -1, far = 1.6) => [
  { x: -58, z: z + near },
  { x: 58, z: z + near },
  { x: 58, z: z + far },
  { x: -58, z: z + far },
];

/** A district with the standard spawn and door zone in front of the hero building, and `cars` on its road. */
export function district(
  layout: DistrictDef['layout'],
  camera: CameraPreset,
  fillerBuildings: string[],
  npcCount: number,
  cars: number,
  mood: DistrictDef['mood'] = 'day',
): DistrictDef {
  const roadZ = layout === 'plaza' ? PLAZA_ROAD_Z : ROAD_Z;
  return {
    layout,
    fillerBuildings,
    spawn: { x: 0, z: 9, rotY: Math.PI },
    doorZone: { x: 0, z: 6, radius: 2.5 },
    npcCount,
    // Plaza roads have no parking strip, so their near lane sits closer to the kerb.
    carLoops: cars ? [{ points: roadLoop(roadZ, layout === 'plaza' ? -1.8 : -1), count: cars }] : [],
    camera: { ...camera, focus: { ...camera.focus } },
    mood,
  };
}

/** The top of the pavement and kerbs (Kenney's road kit tiles are 0.2 m thick at street scale). */
export const PAVEMENT_Y = 0.2;

/** How high the surface is at a point: on a raised area (pavement), or the ground. */
export function standHeight(raised: readonly Rect[], x: number, z: number) {
  return raised.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) ? PAVEMENT_Y : 0;
}

/** A district ready to draw and walk: the scene, where the player may go, and where life moves. */
export interface DistrictBuild {
  scene: SceneDef;
  /** The invisible walls: the block's edge (the kerb on the street side). */
  walkArea: Rect;
  /** Pavement loops people walk (clear of the street furniture). */
  npcRoutes: Waypoint[][];
  /** Where cars slow down (crossings). */
  slowZones: Rect[];
  /** The pavements (with their kerbs), at PAVEMENT_Y: people and street furniture stand on them. */
  raised: Rect[];
}

/** What a layout lays out, before lighting and heights are worked out. */
interface Block {
  placements: Placement[];
  raised: Rect[];
  walkArea: Rect;
  npcRoutes: Waypoint[][];
  slowZones: Rect[];
  /** Street lamps and bulbs (lit in the evening and at night). */
  lamps: LampDef[];
}

export function buildDistrict(location: LocationDef): DistrictBuild {
  const d = location.district;
  const block = d.layout === 'corner' ? cornerBlock(location) : d.layout === 'plaza' ? plazaBlock(location) : streetBlock(location);
  const { placements, raised } = block;

  // The club's queue and neon; elsewhere a planter each side of the door.
  if (d.mood === 'club') {
    placements.push(
      { asset: 'barrier', x: 4, z: 6.4, rotY: Math.PI / 2, solid: true },
      { asset: 'barrier', x: 6.6, z: 6.4, rotY: Math.PI / 2, solid: true },
    );
  } else if (location.interiorId !== 'none') {
    placements.push({ asset: 'planter', x: -3.4, z: 4.8, solid: true }, { asset: 'planter', x: 3.4, z: 4.8, solid: true });
  }

  // Everything standing on a pavement stands on top of it (not the tiles themselves, nor the buildings).
  for (const p of placements) {
    if (!p.id && !/^(sidewalk-tile|road-)/.test(p.asset)) p.y = standHeight(raised, p.x, p.z);
    // Trees fade when they stand between the camera and the player (the close-up passes among them).
    if (/^tree-/.test(p.asset)) p.occluder = true;
  }
  for (const lamp of block.lamps) lamp.groundY = standHeight(raised, lamp.x, lamp.z);

  const { camera, spawn } = d;
  const b = camera.followBias;
  return {
    scene: {
      id: `district-${location.id}`,
      ground: { size: 130, color: d.mood === 'club' ? '#3b4a3a' : d.mood === 'evening' ? '#86ad6b' : '#8fbf72' },
      placements,
      view: {
        target: { x: camera.focus.x + (spawn.x - camera.focus.x) * b, z: camera.focus.z + (spawn.z - camera.focus.z) * b },
        distance: camera.distance,
        pitchDeg: camera.pitchDeg,
        yawDeg: camera.yawDeg,
        fov: camera.fov,
      },
      lighting: lighting(d.mood, block.lamps),
    },
    walkArea: block.walkArea,
    npcRoutes: block.npcRoutes,
    slowZones: block.slowZones,
    raised,
  };
}

// ------------------------------------------------------------------ lighting

const WARM = '#ffc27a';
/** A bulb over the hero building's door. */
const DOOR_LAMP: LampDef = { x: 0, y: 3.3, z: 4.4, color: WARM, pool: 4 };

/**
 * Day: no lamps. Evening: every street lamp glows with a soft pool, and two cast real light (the
 * door's bulb and the nearest street lamp). The club: its neon casts the light, the lamps just glow.
 * Intensities stay low: light should model the street, never flood it.
 */
function lighting(mood: DistrictDef['mood'], lamps: LampDef[]): SceneLighting {
  if (mood === 'day') return { mood: 'day', lamps: [] };
  if (mood === 'evening') {
    const nearest = [...lamps].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    return {
      mood: 'evening',
      lamps: [
        { ...DOOR_LAMP, light: { intensity: 0.9, range: 9 } },
        ...lamps.map((l) => (l === nearest ? { ...l, light: { intensity: 0.8, range: 13 } } : l)),
      ],
    };
  }
  return {
    mood: 'night',
    lamps: [
      { x: -2.6, y: 3.4, z: 5, color: '#ff3fb4', pool: 5, light: { intensity: 2.6, range: 10 } },
      { x: 2.6, y: 3.4, z: 5, color: '#33d6ff', pool: 5, light: { intensity: 2.6, range: 10 } },
      ...lamps,
    ],
  };
}

/**
 * A street lamp (Kenney's light-square or light-curved: a 6 m pole with an arm) whose arm reaches
 * toward `arm` (radians; 0 = +Z, over a road in front). Kenney's arms reach along the model's -Z, so
 * the model turns half round from that. The bulb hangs about 1.1 m out along the arm, 5.7 m up.
 */
function streetLamp(x: number, z: number, arm: number, asset = 'street-lamp'): [Placement, LampDef] {
  const bulb = { x: x + Math.sin(arm) * 1.1, y: 5.7, z: z + Math.cos(arm) * 1.1 };
  return [{ asset, x, z, rotY: arm + Math.PI }, { ...bulb, color: WARM, pool: 7 }];
}

// ------------------------------------------------------------------ the pieces every layout shares

/** Neighbours either side of the hero building, nearest first. */
const FILLER_SLOTS = [-11, 11, -21, 21];

function fillers(location: LocationDef, slots: readonly { x: number; z: number }[]): Placement[] {
  return location.district.fillerBuildings.slice(0, slots.length).map((asset, i) => ({
    id: `filler-${i}`, asset, x: slots[i].x, z: slots[i].z, solid: true, occluder: true,
  }));
}

/** The hero building, or for an open place (a park) a grove of trees where it would stand. */
function hero(location: LocationDef): Placement[] {
  if (location.interiorId !== 'none') return [{ id: location.id, asset: location.buildingAsset, x: 0, z: 0, solid: true }];
  return [
    { asset: 'tree-large', x: -3.5, z: -1.5, solid: true },
    { asset: 'tree-large', x: 3, z: -2.5, solid: true },
    { asset: 'tree-large', x: 0.5, z: 2, solid: true },
    { asset: 'tree-small', x: -6, z: 2.5 },
    { asset: 'tree-small', x: 6.5, z: 1.5 },
  ];
}

/** A row of road tiles along X at z, with a crossing at `crossingX` and a crossroad at `junctionX`. */
function roadAlongX(z: number, crossingX: number, junctionX?: number): Placement[] {
  const out: Placement[] = [];
  for (let x = -54; x <= 56; x += 10) {
    const asset = x === junctionX ? 'road-crossroad' : x === crossingX ? 'road-crossing' : 'road-straight';
    out.push({ asset, x, z });
  }
  return out;
}

/** A row of pavement tiles along X at z (10 m deep), skipping any x in `gaps`. */
function pavementAlongX(z: number, gaps: number[] = []): Placement[] {
  const out: Placement[] = [];
  for (let x = -54; x <= 56; x += 10) if (!gaps.includes(x)) out.push({ asset: 'sidewalk-tile', x, z });
  return out;
}

/** Benches, a bin and trees along a pavement edge, keeping the door clear. */
function streetFurniture(kerbZ: number): Placement[] {
  return [
    { asset: 'bench', x: -7.5, z: kerbZ - 1.4, rotY: Math.PI, solid: true },
    { asset: 'bench', x: -22, z: kerbZ - 1.4, rotY: Math.PI, solid: true },
    { asset: 'tree-small', x: -18.5, z: kerbZ - 1.2 },
    { asset: 'tree-small', x: 7.5, z: kerbZ - 1.2 },
    { asset: 'dumpster', x: 5.6, z: -2.5, rotY: Math.PI / 2, solid: true },
  ];
}

// ------------------------------------------------------------------ the layouts

// A shopping street: the hero building between its neighbours, a pavement in front, the road with a
// crossing, and the far pavement with trees.
function streetBlock(location: LocationDef): Block {
  const club = location.district.mood === 'club';
  const lamps: [Placement, LampDef][] = [streetLamp(-15, KERB_Z - 0.6, 0), streetLamp(15, KERB_Z - 0.6, 0), streetLamp(-26, KERB_Z - 0.6, 0)];
  const placements: Placement[] = [
    ...hero(location),
    ...fillers(location, FILLER_SLOTS.map((x) => ({ x, z: 0 }))),
    ...pavementAlongX(KERB_Z - 5),
    ...roadAlongX(ROAD_Z, 6),
    ...pavementAlongX(ROAD_Z + 10),
    ...lamps.map(([p]) => p),
    ...streetFurniture(KERB_Z),
    { asset: 'bench', x: 20, z: KERB_Z - 1.4, rotY: Math.PI, solid: true },
    { asset: 'traffic-light', x: 11, z: KERB_Z - 0.4, rotY: Math.PI },
    { asset: 'sedan', x: -21, z: KERB_Z + 2.3, rotY: Math.PI / 2 },
    { asset: 'taxi', x: 24, z: KERB_Z + 2.3, rotY: Math.PI / 2 },
    { asset: 'tree-large', x: -12, z: ROAD_Z + 9.5 },
    { asset: 'tree-large', x: 6, z: ROAD_Z + 9.5 },
    { asset: 'tree-large', x: 22, z: ROAD_Z + 9.5 },
  ];
  return {
    placements,
    raised: [
      { minX: -60, maxX: 60, minZ: KERB_Z - 10, maxZ: KERB_Z + 1 },
      { minX: -60, maxX: 60, minZ: ROAD_Z + 4, maxZ: ROAD_Z + 15 },
    ],
    walkArea: { minX: -27, maxX: 27, minZ: -9, maxZ: KERB_Z - 0.2 },
    npcRoutes: [
      // Along the near pavement (east at 7.8 m, back west at 8.9 m, between the planters and the
      // benches); at the club, the walk past the door is the queue.
      [
        { x: -25, z: 7.8 },
        { x: -11, z: 7.8, pause: club ? undefined : 2.5 },
        { x: 1.5, z: 7.8, pause: club ? 7 : undefined },
        { x: 25, z: 7.8 },
        { x: 25, z: 8.9 },
        { x: -25, z: 8.9 },
      ],
      farPavement(ROAD_Z),
    ],
    slowZones: [{ minX: 0, maxX: 13, minZ: KERB_Z, maxZ: KERB_Z + 10 }],
    lamps: lamps.map(([, l]) => l),
  };
}

// On a corner: neighbours on the left, a side road on the right running back from a crossroad with
// the front road, pavement round the corner, and buildings across the side road.
function cornerBlock(location: LocationDef): Block {
  const sideKerb = SIDE_X - 5;
  const lamps: [Placement, LampDef][] = [
    streetLamp(-15, KERB_Z - 0.6, 0),
    streetLamp(-26, KERB_Z - 0.6, 0),
    streetLamp(sideKerb - 0.6, -8, Math.PI / 2),
  ];
  const side: Placement[] = [];
  for (let z = -44; z <= 6; z += 10) {
    side.push({ asset: z === 6 ? 'road-crossing' : 'road-straight', x: SIDE_X, z, rotY: Math.PI / 2 });
    // The pavement down the hero's side of the side road, and across it.
    side.push({ asset: 'sidewalk-tile', x: SIDE_X - 10, z }, { asset: 'sidewalk-tile', x: SIDE_X + 10, z });
  }
  const placements: Placement[] = [
    ...hero(location),
    ...fillers(location, [{ x: -11, z: 0 }, { x: -21, z: 0 }, { x: SIDE_X + 12, z: -2 }, { x: SIDE_X + 22, z: -2 }]),
    ...pavementAlongX(KERB_Z - 5, [SIDE_X]),
    ...roadAlongX(ROAD_Z, -14, SIDE_X),
    ...pavementAlongX(ROAD_Z + 10),
    ...side,
    ...lamps.map(([p]) => p),
    ...streetFurniture(KERB_Z),
    { asset: 'traffic-light', x: sideKerb - 0.4, z: KERB_Z - 0.4, rotY: (Math.PI * 3) / 4 },
    { asset: 'sign-street', x: sideKerb - 0.5, z: KERB_Z - 2.5, rotY: Math.PI / 2 },
    { asset: 'tree-small', x: sideKerb - 1.2, z: -16 },
    { asset: 'van', x: sideKerb + 2.3, z: -18, rotY: 0 },
    { asset: 'sedan', x: -24, z: KERB_Z + 2.3, rotY: Math.PI / 2 },
    { asset: 'tree-large', x: -12, z: ROAD_Z + 9.5 },
    { asset: 'tree-large', x: 6, z: ROAD_Z + 9.5 },
    { asset: 'tree-large', x: 30, z: ROAD_Z + 9.5 },
  ];
  return {
    placements,
    raised: [
      { minX: -60, maxX: sideKerb + 1, minZ: -50, maxZ: KERB_Z + 1 },
      { minX: SIDE_X + 4, maxX: 60, minZ: -50, maxZ: KERB_Z + 1 },
      { minX: -60, maxX: 60, minZ: ROAD_Z + 4, maxZ: ROAD_Z + 15 },
    ],
    walkArea: { minX: -27, maxX: sideKerb - 0.2, minZ: -22, maxZ: KERB_Z - 0.2 },
    npcRoutes: [
      // Along the front, round the corner and down the side road's pavement, and back.
      [
        { x: -25, z: 7.8 },
        { x: -11, z: 7.8, pause: 2.5 },
        { x: 9.2, z: 7.8 },
        { x: 9.2, z: -20 },
        { x: 8.2, z: -20 },
        { x: 8.2, z: 8.9 },
        { x: -25, z: 8.9 },
      ],
      farPavement(ROAD_Z),
    ],
    slowZones: [
      { minX: SIDE_X - 6, maxX: SIDE_X + 6, minZ: KERB_Z, maxZ: KERB_Z + 10 },
      { minX: -20, maxX: -8, minZ: KERB_Z, maxZ: KERB_Z + 10 },
    ],
    lamps: lamps.map(([, l]) => l),
  };
}

// On a square: a paved plaza in front of the hero building with trees, benches round a planted
// middle and lamps, the neighbours either side, and the road beyond the plaza.
function plazaBlock(location: LocationDef): Block {
  const kerb = PLAZA_ROAD_Z - 5;
  const lamps: [Placement, LampDef][] = [
    streetLamp(-16, 13, Math.PI / 2, 'street-lamp-curved'),
    streetLamp(16, 13, -Math.PI / 2, 'street-lamp-curved'),
    streetLamp(-26, kerb - 0.6, 0),
    streetLamp(26, kerb - 0.6, 0),
  ];
  const middle = { x: 0, z: 14 };
  const placements: Placement[] = [
    ...hero(location),
    ...fillers(location, FILLER_SLOTS.map((x) => ({ x, z: 0 }))),
    ...pavementAlongX(6),
    ...pavementAlongX(16),
    ...roadAlongX(PLAZA_ROAD_Z, 10),
    ...pavementAlongX(PLAZA_ROAD_Z + 10),
    ...lamps.map(([p]) => p),
    // The planted middle, benches facing it, trees at the plaza's corners.
    { asset: 'planter', x: middle.x - 1.6, z: middle.z, solid: true },
    { asset: 'planter', x: middle.x + 1.6, z: middle.z, solid: true },
    { asset: 'planter', x: middle.x, z: middle.z - 1.6, solid: true },
    { asset: 'planter', x: middle.x, z: middle.z + 1.6, solid: true },
    { asset: 'tree-small', x: middle.x, z: middle.z, solid: true },
    { asset: 'bench', x: middle.x - 5.5, z: middle.z, rotY: Math.PI / 2, solid: true },
    { asset: 'bench', x: middle.x + 5.5, z: middle.z, rotY: -Math.PI / 2, solid: true },
    { asset: 'bench', x: middle.x, z: middle.z + 5.2, rotY: Math.PI, solid: true },
    { asset: 'tree-large', x: -11, z: 9, solid: true },
    { asset: 'tree-large', x: 11, z: 9, solid: true },
    { asset: 'tree-large', x: -11, z: 19, solid: true },
    { asset: 'tree-large', x: 11, z: 19, solid: true },
    { asset: 'parasol-a', x: -21, z: 7, solid: true },
    { asset: 'parasol-b', x: 21, z: 7, solid: true },
    { asset: 'tree-large', x: -14, z: PLAZA_ROAD_Z + 9.5 },
    { asset: 'tree-large', x: 14, z: PLAZA_ROAD_Z + 9.5 },
  ];
  return {
    placements,
    raised: [
      { minX: -60, maxX: 60, minZ: 1, maxZ: kerb + 1 },
      { minX: -60, maxX: 60, minZ: PLAZA_ROAD_Z + 4, maxZ: PLAZA_ROAD_Z + 15 },
    ],
    walkArea: { minX: -27, maxX: 27, minZ: -9, maxZ: kerb - 0.2 },
    npcRoutes: [
      // Round the square, stopping at the benches.
      [
        { x: -19, z: 5 },
        { x: 19, z: 5 },
        { x: 19, z: 19.5 },
        { x: 3, z: 19.5, pause: 4 },
        { x: -19, z: 19.5 },
      ],
      // Across it and back, past the planted middle.
      [
        { x: -8, z: 7 },
        { x: -3.5, z: 11, pause: 3 },
        { x: 3.5, z: 17 },
        { x: 8, z: 21 },
        { x: 3.5, z: 11 },
      ],
      farPavement(PLAZA_ROAD_Z),
    ],
    slowZones: [{ minX: 4, maxX: 16, minZ: kerb, maxZ: kerb + 10 }],
    lamps: lamps.map(([, l]) => l),
  };
}

/** Along the pavement across the road and back. */
function farPavement(roadZ: number): Waypoint[] {
  return [
    { x: 30, z: roadZ + 6.5 },
    { x: -30, z: roadZ + 6.5 },
    { x: -30, z: roadZ + 7.5 },
    { x: 30, z: roadZ + 7.5 },
  ];
}
