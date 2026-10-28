// The World Map: only the hero buildings, the streets between them and a few trees and lamps, so each
// landmark reads clearly. Built from the location registry; renderers just draw the SceneDef.

import { LOCATIONS } from './locations';
import type { Placement, SceneDef } from './scene';

/** Streets run along X and Z at these offsets; one road tile is 10 m. */
const STREETS = [-30, 0, 30];
const EXTENT = 60;
export const MAP_BOUNDS = { minX: -EXTENT, maxX: EXTENT, minZ: -EXTENT, maxZ: EXTENT };

export function mapScene(): SceneDef {
  const placements: Placement[] = [];

  // Roads: a tile every 10 m along each street, a crossroad where two meet, rounded ends at the edge.
  for (const along of STREETS) {
    for (let t = -EXTENT; t <= EXTENT; t += 10) {
      const crossing = STREETS.includes(t);
      const end = Math.abs(t) === EXTENT;
      // Streets along Z (x = along), then streets along X (z = along); crossings only once.
      // A road-straight tile runs along X, so streets along Z turn it a quarter.
      const asset = crossing ? 'road-crossroad' : end ? 'road-end' : 'road-straight';
      const flip = end && t < 0 ? Math.PI : 0;
      placements.push({ asset, x: along, z: t, rotY: Math.PI / 2 + flip });
      if (!crossing) placements.push({ asset, x: t, z: along, rotY: flip });
    }
  }

  // Lamps at every crossing, trees at the outer corners of the blocks.
  for (const x of STREETS) for (const z of STREETS) placements.push({ asset: 'street-lamp-double', x: x + 6, z: z + 6, rotY: Math.PI / 4 });
  for (const x of [-57, -33, -27, -3, 3, 27, 33, 57]) {
    for (const z of [-57, 57]) placements.push({ asset: x % 2 ? 'tree-large' : 'tree-small', x, z });
  }

  // The hero buildings, pickable and tagged by location id.
  for (const location of LOCATIONS) {
    placements.push({
      id: location.id,
      asset: location.buildingAsset,
      x: location.mapPos.x,
      z: location.mapPos.z,
      rotY: location.mapRotY,
      pickable: true,
      ...(location.id === 'park' ? { scale: 1.8 } : {}),
    });
  }
  // The park is paving plus trees around it.
  const park = LOCATIONS.find((l) => l.id === 'park');
  if (park) {
    for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      placements.push({ asset: 'tree-large', x: park.mapPos.x + dx, z: park.mapPos.z + dz });
    }
  }

  return {
    id: 'world-map',
    ground: { size: EXTENT * 2 + 40, color: '#8fbf72' },
    placements,
    view: { target: { x: 0, z: 0 }, distance: 150, pitchDeg: 50, yawDeg: 25 },
  };
}
