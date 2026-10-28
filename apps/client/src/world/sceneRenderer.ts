import type { Box3, EffectDef, HumanAnimation, HumanAppearance, HumanBody, SceneDef } from '@game/shared';

export { viewCamera } from '@game/shared';

// What each renderer (Babylon, Three) implements for the map, district and interior scenes. Game logic
// and data live in @game/shared; a renderer only draws a SceneDef and answers screen-space questions.

export type RendererKind = 'babylon' | 'three';

export interface ScreenPoint {
  x: number;
  y: number;
}

export type View = SceneDef['view'];

export interface RendererOptions {
  /** Let the mouse orbit the camera (test scenes). Game scenes drive the camera with setView. */
  orbit?: boolean;
}

export interface PlayerFrame {
  x: number;
  /** Floor height (inside, interiors sit under the district). */
  y?: number;
  z: number;
  rotY: number;
  animation: HumanAnimation;
}

export interface SceneRenderer {
  /** Replaces whatever is shown with this scene; resolves once every model is placed. */
  loadScene(def: SceneDef): Promise<void>;
  /** Moves the camera (call every frame for smooth motion). */
  setView(view: View): void;
  /** Where a world point appears on the canvas (CSS pixels), or null if it's behind the camera. */
  project(x: number, y: number, z: number): ScreenPoint | null;
  /** The pickable placement under a canvas point (CSS pixels), by its id: a ray against its bounding box. */
  pick(x: number, y: number): string | null;
  /** The point on the ground (or a floor at height `floorY`) under a canvas point (tap-to-walk), or null. */
  groundPoint(x: number, y: number, floorY?: number): { x: number; z: number } | null;
  /** Tints one pickable placement (null clears). */
  highlight(id: string | null, color?: string): void;
  /** Height in metres of a placement with an id (0 if unknown), e.g. to put a tag over it. */
  heightOf(id: string): number;
  /** World bounds of the scene's solid or occluder placements (after loadScene). */
  boxes(kind: 'solid' | 'occluder'): Box3[];
  /** Fades these occluders (by id) and shows every other one fully. */
  setFaded(ids: readonly string[]): void;
  /** Creates (or replaces) the player character; resolves when it's ready. */
  spawnPlayer(body: HumanBody, appearance?: HumanAppearance): Promise<void>;
  /** Poses the player this frame, or hides them (null). */
  setPlayer(frame: PlayerFrame | null): void;
  /** Adds a person to the scene (gone on the next loadScene); resolves when they're ready. */
  spawnNpc(id: string, body: HumanBody, appearance?: HumanAppearance): Promise<void>;
  setNpc(id: string, frame: PlayerFrame): void;
  /** Adds a car (an asset key) to the scene (gone on the next loadScene). */
  spawnCar(id: string, asset: string): Promise<void>;
  setCar(id: string, pose: { x: number; z: number; rotY: number }): void;
  /** The ray from the camera through a canvas point (CSS pixels): to tap furniture. */
  ray(x: number, y: number): { origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } };
  /** Swings one of the scene's doors: 0 shut, 1 wide open (call every frame while it moves). */
  setDoor(id: string, open: number): void;
  /** Inside: the floor the player is on; doors on floors above it hide, like the floors themselves. */
  setFloor(level: number): void;
  /** Starts a group of effects (water, steam, club lights...), replacing that group's previous ones. */
  playEffects(group: string, effects: readonly EffectDef[]): void;
  stopEffects(group: string): void;
  dispose(): void;
}

/**
 * The vertical field of view to use for a design `fov` (degrees, meant for a landscape screen about
 * 1.4 wide per 1 tall) on a screen of this aspect: narrower screens (phones held upright) keep the
 * same view across, so the place still fits side to side, and see more above and below instead.
 */
export function fitFov(fov: number, aspect: number) {
  const DESIGN = 1.4;
  if (aspect >= DESIGN) return fov;
  const across = Math.atan(Math.tan((fov * Math.PI) / 360) * DESIGN);
  return Math.min(100, (2 * Math.atan(Math.tan(across) / aspect) * 180) / Math.PI);
}
