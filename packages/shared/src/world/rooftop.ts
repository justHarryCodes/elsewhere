// Up on the roof: a place whose building has a flat roof gets the walkable city's roof terrace (deck
// and lawn, the stair hut you come up through, a lounge, hot tub, bar, telescope, strings of lights)
// built on its real roof, over its street, so the street's life goes on below.

import { seededRandom } from '../city';
import { hashSeed } from '../humans';
import { InteriorBuilder } from '../interior-builder';
import { rooftop } from '../interior-plans';
import { type DistrictBuild, buildDistrict } from './districts';
import { cityWith } from './interiorScene';
import type { CameraPreset, LocationDef } from './locations';
import type { Rect } from './playerMotion';
import type { SceneDef } from './scene';

/**
 * Hero buildings with a flat roof deck you can stand on: its height and extent in district
 * coordinates (the building at the origin, its front facing +Z), measured from the model.
 */
const ROOFS: Record<string, { y: number; deck: Rect }> = {
  'house-modern': { y: 6.0, deck: { minX: -4.6, maxX: 4.6, minZ: -3.5, maxZ: 2.3 } },
};

/** High over the street, looking out across it. */
export const ROOF_CAMERA: CameraPreset = { pitchDeg: 40, yawDeg: 20, distance: 19, focus: { x: 0, z: 6 }, followBias: 0.6, fov: 50 };

export interface RooftopBuild {
  district: DistrictBuild;
  /** The street with the terrace on the roof. */
  scene: SceneDef;
  /** The deck's surface. */
  y: number;
  deck: Rect;
  /** The terrace's furniture and parapet at body height. */
  solids: Rect[];
  /** Outside the stair hut's door: where you come up, and stand to go back down. */
  door: { x: number; z: number; heading: number };
  doorZone: { x: number; z: number; radius: number };
}

/** Whether a place's building has a roof terrace to go up to. */
export const hasRooftop = (location: LocationDef) => location.buildingAsset in ROOFS;

export function buildRooftop(location: LocationDef): RooftopBuild | null {
  const roof = ROOFS[location.buildingAsset];
  if (!roof) return null;
  const district = buildDistrict(location);
  const { deck } = roof;
  const place = { x: (deck.minX + deck.maxX) / 2, y: roof.y, z: (deck.minZ + deck.maxZ) / 2, yaw: 0 };
  const random = seededRandom(hashSeed(`${location.id}-roof`));
  const terrace = new InteriorBuilder(place, deck.maxX - deck.minX, deck.maxZ - deck.minZ, 1, random, random() < 0.5);
  const door = rooftop(terrace, terrace.w, terrace.d);
  const solids = terrace.colliders
    .filter((c) => c.y - c.hy < roof.y + 1.4 && c.y + c.hy > roof.y + 0.3)
    .map((c) => ({ minX: c.x - c.hx, maxX: c.x + c.hx, minZ: c.z - c.hz, maxZ: c.z + c.hz }));
  const camera = ROOF_CAMERA;
  return {
    district,
    scene: {
      ...district.scene,
      id: `roof-${location.id}`,
      view: { target: { x: door.x, z: door.z, y: roof.y }, distance: camera.distance, pitchDeg: camera.pitchDeg, yawDeg: camera.yawDeg, fov: camera.fov },
      rooms: cityWith({ props: terrace.pieces, shapes: terrace.shapes }),
    },
    y: roof.y + 0.06,
    deck,
    solids,
    door,
    doorZone: { x: door.x, z: door.z, radius: 1.5 },
  };
}
