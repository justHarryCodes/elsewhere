// What a scene is made of, independent of the renderer that draws it. Renderers load a SceneDef and
// place each asset; game logic only ever builds SceneDefs.

import type { City } from '../city';
import type { DoorDef } from './interiorScene';

/** One asset (a key in the client's asset manifest) standing on the ground. */
export interface Placement {
  /** Names the placement for picking, highlighting, tags and collision (e.g. a location id). */
  id?: string;
  asset: string;
  x: number;
  z: number;
  /** Stands this high (e.g. on the pavement), metres; 0 = on the ground. */
  y?: number;
  /** Turn about the vertical axis, radians; 0 = the asset's front faces +Z. */
  rotY?: number;
  /** Multiplies the manifest's size (e.g. a slightly bigger filler building). */
  scale?: number;
  /** Tappable: the renderer can pick and highlight it (it gets its own copy of the materials). */
  pickable?: boolean;
  /** The player can't walk through it (its footprint, from the model's bounds). */
  solid?: boolean;
  /** May stand between the camera and the player: the renderer fades it out then (own materials). */
  occluder?: boolean;
  /** A text label to show over it (test scenes). */
  label?: string;
}

/**
 * A lamp, bulb or neon sign. Every lamp draws a soft glow round its head and a faint pool of light on
 * the ground under it (kept gentle, so nothing round it is washed out); only lamps with `light` also
 * cast real light, and a scene keeps those to two or three (phones).
 */
export interface LampDef {
  x: number;
  /** Height of the bulb. */
  y: number;
  z: number;
  /** Hex. */
  color: string;
  /** Real light: brightness (about 1 for a street lamp, 2 for neon) and reach in metres. */
  light?: { intensity: number; range: number };
  /** The pool of light on the ground under it, metres across (0: none, e.g. a sign on a wall). */
  pool: number;
  /** The ground's height under it. */
  groundY?: number;
}

/**
 * Day: sun and sky. Evening: a low warm sun, a dimmer sky, lamps on. Night: no sun, a dim violet sky,
 * lamps and neon. Renderers tone-map, so bright light rolls off instead of blowing out to white.
 */
export interface SceneLighting {
  mood: 'day' | 'evening' | 'night';
  lamps: LampDef[];
}

export interface SceneDef {
  id: string;
  /** A flat ground square centred on the origin (none inside). */
  ground?: { size: number; color: string };
  placements: Placement[];
  /** Where the camera starts: looking at `target` from `distance` away, `pitchDeg` down, turned `yawDeg`. */
  view: { target: { x: number; z: number; y?: number }; distance: number; pitchDeg: number; yawDeg: number; fov?: number };
  lighting?: SceneLighting;
  /** What shows behind everything (hex), instead of the mood's sky: e.g. the dark round an inside. */
  background?: string;
  /** Door leaves to draw (they swing open and shut with setDoor). */
  doors?: DoorDef[];
  /** Furnished rooms to draw (a city holding just the interiors), e.g. the inside of a place. */
  rooms?: City;
}
