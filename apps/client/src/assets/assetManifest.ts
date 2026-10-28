// Every model the map, district and interior scenes use, by friendly name. Renderers load each GLB once
// and instance it; placements refer to these keys (see @game/shared Placement.asset).
//
// Kenney packs are CC0. The City Kits (commercial, suburban, industrial) were already in the repo under
// /assets/buildings (the walkable city's packer reads them there); Roads, Car Kit and Graveyard Kit were
// copied unedited from art-source/kenny into /assets/kenney/<pack>.

export type AssetKit = 'commercial' | 'suburban' | 'industrial' | 'roads' | 'cars' | 'graveyard' | 'architecture';

export interface AssetEntry {
  url: string;
  kit: AssetKit;
  /** Model units to metres. */
  scale?: number;
  /** Or: scaled so the model is this many metres tall (for models with no fixed unit). */
  height?: number;
  /** Turn applied first so the model's front faces +Z (the Kenney city kits face -Z). */
  yaw?: number;
}

const HALF = Math.PI;

const commercial = (model: string): AssetEntry => ({
  url: `/assets/buildings/kenney-city-kit-commercial/${model}.glb`, kit: 'commercial', scale: 7.5, yaw: HALF,
});
const suburban = (model: string, scale = 7.5): AssetEntry => ({
  url: `/assets/buildings/kenney-city-kit-suburban/${model}.glb`, kit: 'suburban', scale, yaw: HALF,
});
const industrial = (model: string): AssetEntry => ({
  url: `/assets/buildings/kenney-city-kit-industrial/${model}.glb`, kit: 'industrial', scale: 7.5, yaw: HALF,
});
/** One road tile is a 10 m street: 8 m of road and a 1 m kerb each side. */
const roads = (model: string): AssetEntry => ({ url: `/assets/kenney/city-kit-roads/${model}.glb`, kit: 'roads', scale: 10 });
/** About 4 m long, 2.4 m wide: chunky, like the buildings. */
const cars = (model: string): AssetEntry => ({ url: `/assets/kenney/car-kit/${model}.glb`, kit: 'cars', scale: 1.6 });
const graveyard = (model: string): AssetEntry => ({
  url: `/assets/kenney/graveyard-kit/${model}.glb`, kit: 'graveyard', scale: 2.5, yaw: HALF,
});

export const ASSETS = {
  // Hero buildings (one per location; see the location registry).
  'shop-dark-awning': commercial('building-h'),
  'diner-wide-awning': commercial('building-e'),
  'shop-orange-front': commercial('building-i'),
  'cafe-rooftop': commercial('building-d'),
  'shop-small-blue': commercial('building-a'),
  'shop-green-front': commercial('building-l'),
  'block-wide-planters': commercial('building-c'),
  'block-long': commercial('building-k'),
  'block-wide-balconies': commercial('building-j'),
  'block-canopy': commercial('building-n'),
  'tower-green-stripe': commercial('building-skyscraper-e'),
  'house-modern': suburban('building-type-p'),
  'hall-arched': industrial('building-j'),
  'hall-sawtooth': industrial('building-k'),

  // No Kenney city kit has a church: this one is from the architecture pack already in the repo (not
  // Kenney; check its licence before shipping).
  church: { url: '/assets/buildings/architecture-pack/church.glb', kit: 'architecture', height: 15 },

  // Filler buildings for districts.
  'shop-stairs': commercial('building-b'),
  'shop-narrow-green': commercial('building-f'),
  'shop-balconies-orange': commercial('building-g'),
  'tower-green-roof': commercial('building-m'),
  'tower-a': commercial('building-skyscraper-a'),
  'tower-b': commercial('building-skyscraper-b'),
  'tower-c': commercial('building-skyscraper-c'),
  'tower-d': commercial('building-skyscraper-d'),
  'house-a': suburban('building-type-a'),
  'house-c': suburban('building-type-c'),
  'house-d': suburban('building-type-d'),
  'house-g': suburban('building-type-g'),
  'house-k': suburban('building-type-k'),
  'house-l': suburban('building-type-l'),
  'house-o': suburban('building-type-o'),
  'warehouse-a': industrial('building-a'),
  'warehouse-i': industrial('building-i'),

  // Ground: road tiles.
  'road-straight': roads('road-straight'),
  'road-crossroad': roads('road-crossroad'),
  'road-intersection': roads('road-intersection'),
  'road-bend': roads('road-bend'),
  'road-crossing': roads('road-crossing'),
  'road-end': roads('road-end-round'),
  'plaza-tile': roads('road-square'),
  'sidewalk-tile': roads('tile-low'),

  // Street props.
  'street-lamp': roads('light-square'),
  'street-lamp-double': roads('light-square-double'),
  'street-lamp-curved': roads('light-curved'),
  'traffic-light': roads('traffic-light'),
  'sign-stop': roads('road-sign-stop'),
  'sign-street': roads('road-sign-street'),
  dumpster: roads('dumpster'),
  cone: roads('construction-cone'),
  barrier: roads('construction-barrier'),
  'tree-large': suburban('tree-large'),
  'tree-small': suburban('tree-small'),
  planter: suburban('planter', 4),
  fence: suburban('fence', 4),
  'parasol-a': { ...commercial('detail-parasol-a'), scale: 6 },
  'parasol-b': { ...commercial('detail-parasol-b'), scale: 6 },
  awning: commercial('detail-awning'),
  'awning-wide': commercial('detail-awning-wide'),
  'shelter-roof': commercial('detail-overhang-wide'),
  bench: graveyard('bench'),

  // Traffic and parked cars.
  sedan: cars('sedan'),
  'sedan-sports': cars('sedan-sports'),
  suv: cars('suv'),
  taxi: cars('taxi'),
  van: cars('van'),
  hatchback: cars('hatchback-sports'),
  police: cars('police'),
  delivery: cars('delivery'),
  truck: cars('truck'),
  ambulance: cars('ambulance'),
} as const satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof ASSETS;

export const isAssetKey = (key: string): key is AssetKey => Object.prototype.hasOwnProperty.call(ASSETS, key);

export function assetEntry(key: string): AssetEntry {
  if (!isAssetKey(key)) throw new Error(`Unknown asset "${key}" (not in assetManifest.ts)`);
  return ASSETS[key];
}
