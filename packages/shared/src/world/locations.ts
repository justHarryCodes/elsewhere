// The places on the World Map. Everything here is hardcoded data: rename, recolour or move a place by
// editing its entry. `buildingAsset` and district filler keys are names in the client's assetManifest.

import { CAMERA_PRESETS, district } from './districts';
import type { CarLoop } from './trafficBrain';

export type LocationType =
  | 'home' | 'worship' | 'nightlife' | 'food' | 'civic' | 'work'
  | 'learning' | 'shop' | 'health' | 'fitness' | 'transit' | 'leisure';

export interface CameraPreset {
  /** Angle down from horizontal. */
  pitchDeg: number;
  yawDeg: number;
  distance: number;
  /** The point the camera favours (district coordinates). */
  focus: { x: number; z: number };
  /** 0 = locked on focus, 1 = locked on the player. */
  followBias: number;
  fov: number;
}

export interface DistrictDef {
  /** Which prebuilt block layout. */
  layout: 'corner' | 'plaza' | 'street';
  /** 2 to 4 neighbouring asset keys. */
  fillerBuildings: string[];
  /** Where the player appears (district coordinates: the hero building at the origin, door facing +Z). */
  spawn: { x: number; z: number; rotY: number };
  doorZone: { x: number; z: number; radius: number };
  /** 3 to 6. */
  npcCount: number;
  carLoops: CarLoop[];
  camera: CameraPreset;
  /** Day, a lamp-lit evening, or the club's neon night. */
  mood: 'day' | 'evening' | 'club';
}

export interface LocationDef {
  id: string;
  /** Shown on the name tag. */
  name: string;
  type: LocationType;
  mapPos: { x: number; z: number };
  /** Which way the building's front faces on the map (radians, 0 = +Z). */
  mapRotY: number;
  buildingAsset: string;
  /** Hex. */
  tagColor: string;
  district: DistrictDef;
  /** The interior to load on Enter: an existing interior kind, or one still to be built. */
  interiorId: string;
}

export const LOCATION_TYPE_LABELS: Record<LocationType, { label: string; icon: string }> = {
  home: { label: 'Home', icon: '🏠' },
  worship: { label: 'Worship', icon: '⛪' },
  nightlife: { label: 'Nightlife', icon: '🎵' },
  food: { label: 'Food & drink', icon: '🍽️' },
  civic: { label: 'Civic', icon: '🏛️' },
  work: { label: 'Work', icon: '💼' },
  learning: { label: 'Learning', icon: '📚' },
  shop: { label: 'Shop', icon: '🛍️' },
  health: { label: 'Health', icon: '🩺' },
  fitness: { label: 'Fitness', icon: '🏋️' },
  transit: { label: 'Transit', icon: '🚌' },
  leisure: { label: 'Leisure', icon: '🌳' },
};

// The map is a 4 x 4 grid of blocks, 30 m apart, with streets between them (see mapScene.ts).
// Rows alternate facing +Z and -Z, so each pair of rows faces the street between them.
const lot = (col: number, row: number) => ({ mapPos: { x: -45 + col * 30, z: -45 + row * 30 }, mapRotY: row % 2 === 0 ? 0 : Math.PI });

/** In priority order: when tags overlap, earlier places keep theirs. Your required places come first. */
export const LOCATIONS: LocationDef[] = [
  {
    id: 'home', name: 'My House', type: 'home', ...lot(0, 3), buildingAsset: 'house-modern', tagColor: '#f2b33d',
    district: district('corner', CAMERA_PRESETS.corner, ['house-a', 'house-d', 'house-k'], 3, 1, 'evening'), interiorId: 'house',
  },
  {
    id: 'church', name: 'Grace Chapel', type: 'worship', ...lot(0, 0), buildingAsset: 'church', tagColor: '#e8e0d0',
    district: district('plaza', CAMERA_PRESETS.plaza, ['house-c', 'house-g'], 3, 1), interiorId: 'church',
  },
  {
    id: 'club', name: 'Pulse Club', type: 'nightlife', ...lot(2, 1), buildingAsset: 'shop-dark-awning', tagColor: '#e86fb0',
    district: district('street', CAMERA_PRESETS.club, ['shop-balconies-orange', 'tower-c', 'shop-stairs', 'shop-narrow-green'], 6, 4, 'club'),
    interiorId: 'eventcentre',
  },
  {
    id: 'eatery', name: 'Corner Eats', type: 'food', ...lot(1, 1), buildingAsset: 'diner-wide-awning', tagColor: '#e8553f',
    district: district('corner', CAMERA_PRESETS.corner, ['shop-stairs', 'house-l'], 4, 2), interiorId: 'diner',
  },
  {
    id: 'restaurant', name: 'Olive & Ember', type: 'food', ...lot(3, 1), buildingAsset: 'shop-orange-front', tagColor: '#c9a24a',
    district: district('street', CAMERA_PRESETS.busy, ['shop-narrow-green', 'tower-a'], 4, 2, 'evening'), interiorId: 'diner',
  },
  {
    id: 'civic', name: 'Civic Hall', type: 'civic', ...lot(1, 2), buildingAsset: 'block-wide-balconies', tagColor: '#86b6ff',
    district: district('plaza', CAMERA_PRESETS.plaza, ['tower-green-roof', 'shop-stairs'], 4, 2), interiorId: 'townHall',
  },
  {
    id: 'hq', name: 'Project HQ', type: 'work', ...lot(2, 2), buildingAsset: 'tower-green-stripe', tagColor: '#2f9a52',
    district: district('street', CAMERA_PRESETS.busy, ['tower-b', 'tower-d', 'tower-a'], 5, 2), interiorId: 'office',
  },
  {
    id: 'library', name: 'Maple Library', type: 'learning', ...lot(0, 2), buildingAsset: 'block-wide-planters', tagColor: '#a3d39c',
    district: district('corner', CAMERA_PRESETS.quiet, ['house-o', 'house-c'], 2, 1), interiorId: 'library',
  },
  {
    id: 'boutique', name: 'Thread & Co.', type: 'shop', ...lot(3, 2), buildingAsset: 'shop-small-blue', tagColor: '#7b3fc4',
    district: district('street', CAMERA_PRESETS.busy, ['shop-narrow-green', 'shop-balconies-orange'], 4, 2), interiorId: 'shop',
  },
  {
    id: 'gadgets', name: 'Byte Shop', type: 'shop', ...lot(1, 3), buildingAsset: 'shop-green-front', tagColor: '#2a9d9a',
    district: district('street', CAMERA_PRESETS.busy, ['shop-stairs', 'tower-c'], 4, 2, 'evening'), interiorId: 'shop',
  },
  {
    id: 'gym', name: 'Iron Works Gym', type: 'fitness', ...lot(3, 0), buildingAsset: 'hall-arched', tagColor: '#f2f2ee',
    district: district('corner', CAMERA_PRESETS.corner, ['warehouse-a', 'warehouse-i'], 3, 2), interiorId: 'gym',
  },
  {
    id: 'clinic', name: 'Riverside Clinic', type: 'health', ...lot(2, 0), buildingAsset: 'block-canopy', tagColor: '#ff6b6b',
    district: district('corner', CAMERA_PRESETS.quiet, ['tower-green-roof', 'house-l'], 3, 1), interiorId: 'hospital',
  },
  {
    id: 'cafe', name: 'Little Bean', type: 'food', ...lot(2, 3), buildingAsset: 'cafe-rooftop', tagColor: '#b07a52',
    district: district('plaza', CAMERA_PRESETS.plaza, ['house-a', 'shop-stairs'], 4, 1, 'evening'), interiorId: 'cafe',
  },
  {
    id: 'bus', name: 'Central Station', type: 'transit', ...lot(1, 0), buildingAsset: 'hall-sawtooth', tagColor: '#f2b33d',
    district: district('street', CAMERA_PRESETS.busy, ['warehouse-i', 'tower-b'], 5, 2), interiorId: 'station',
  },
  {
    id: 'park', name: 'Willow Park', type: 'leisure', ...lot(0, 1), buildingAsset: 'sidewalk-tile', tagColor: '#2f9a52',
    district: district('plaza', CAMERA_PRESETS.plaza, ['house-g', 'house-k'], 5, 1), interiorId: 'none',
  },
  {
    id: 'school', name: 'Brookside School', type: 'learning', ...lot(3, 3), buildingAsset: 'block-long', tagColor: '#ffd166',
    district: district('corner', CAMERA_PRESETS.quiet, ['house-d', 'house-o'], 4, 1), interiorId: 'school',
  },
];

export const locationById = (id: string): LocationDef | undefined => LOCATIONS.find((l) => l.id === id);
