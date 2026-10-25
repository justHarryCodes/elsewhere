/**
 * physics-config.ts
 * ONLY what your scale file does not already define. Everything that can be derived from it
 * (gravity, player size, speeds, jump, step height, object sizes) IS derived from it.
 *
 * !! Change this one import path to wherever your scale file lives. !!
 */
import {
  GRAVITY,
  HUMAN_METRICS,
  getRealSize,
  type SizeKey,
  type RealSize,
} from "./scale";

export { GRAVITY };

// ---------------------------------------------------------------- simulation
export const TICK_RATE = 60; // fixed steps per second, never use frame time
export const DT = 1 / TICK_RATE;
export const AIR_DENSITY = 1.225; // kg/m^3
export const WATER_DENSITY = 1000; // kg/m^3
export const MAX_SPEED = 60; // m/s safety cap for players and crates

const g = Math.abs(GRAVITY);
/** Launch speed needed to reach a height: v = sqrt(2 g h). */
export const speedForHeight = (heightMeters: number) =>
  Math.sqrt(2 * g * heightMeters);

// ---------------------------------------------------------------- player (derived from HUMAN_METRICS)
export const PLAYER = {
  mass: 80, // kg
  radius: HUMAN_METRICS.shoulderWidth / 2,
  // capsule total height = 2*halfHeight + 2*radius = HUMAN_METRICS.height
  halfHeight: (HUMAN_METRICS.height - HUMAN_METRICS.shoulderWidth) / 2,
  walkSpeed: HUMAN_METRICS.walkSpeed,
  runSpeed: HUMAN_METRICS.runSpeed,
  sprintSpeed: HUMAN_METRICS.sprintSpeed,
  jumpSpeed: speedForHeight(HUMAN_METRICS.jumpHeight), // from jumpHeight + GRAVITY
  autostepHeight: HUMAN_METRICS.stepHeight,
  autostepMinWidth: 0.2,
  walkAccel: 40, // m/s^2, how snappy movement feels
  dragCd: 1.0,
  frontalArea: HUMAN_METRICS.shoulderWidth * HUMAN_METRICS.height * 0.7,
  density: 985, // kg/m^3, humans float barely
} as const;

// ---------------------------------------------------------------- surfaces & materials (new)
export const SURFACES = {
  concrete: { friction: 0.7, restitution: 0.05 },
  asphalt: { friction: 0.8, restitution: 0.05 },
  metal: { friction: 0.5, restitution: 0.15 },
  wood: { friction: 0.5, restitution: 0.3 },
  rubber: { friction: 1.0, restitution: 0.8 },
  ice: { friction: 0.05, restitution: 0.05 },
  glass: { friction: 0.4, restitution: 0.1 },
} as const;
export type SurfaceName = keyof typeof SURFACES;

export const DENSITY = {
  concrete: 2400,
  metal: 7800,
  wood: 700,
  rubber: 1100,
  glass: 2500,
  plastic: 950,
} as const;
export type MaterialName = keyof typeof DENSITY;

// ---------------------------------------------------------------- mass / drag for catalog objects
/** Known real masses in kg. Anything missing falls back to density * volume * FILL. */
export const MASS_KG: Partial<Record<SizeKey, number>> = {
  "vehicle.bicycle": 15,
  "vehicle.motorcycle": 200,
  "vehicle.compactCar": 1100,
  "vehicle.sedan": 1500,
  "vehicle.sportsCar": 1400,
  "vehicle.taxi": 1600,
  "vehicle.policeCar": 1900,
  "vehicle.suv": 2100,
  "vehicle.pickupTruck": 2200,
  "vehicle.van": 2500,
  "vehicle.ambulance": 3500,
  "vehicle.cargoTruck": 7500,
  "vehicle.fireTruck": 15000,
  "vehicle.bus": 12000,
  "prop.barrel": 60,
  "prop.crate": 40,
};
const FILL = 0.25; // objects are mostly hollow: a sofa is not a solid block of wood

export function massFor(key: SizeKey, material: MaterialName = "wood"): number {
  const known = MASS_KG[key];
  if (known !== undefined) return known;
  const s = getRealSize(key);
  return DENSITY[material] * s.length * s.width * s.height * FILL;
}

export function dragCoefficient(key: SizeKey): number {
  if (key.startsWith("vehicle.")) return 0.32;
  if (key.startsWith("human.")) return 1.0;
  return 1.05; // blunt box
}

export function frontalArea(target: SizeKey | RealSize): number {
  const s = typeof target === "string" ? getRealSize(target) : target;
  return s.width * s.height * 0.8;
}

// ---------------------------------------------------------------- damage (new, tune freely)
const FALL_SAFE_HEIGHT = 3; // metres you can drop for free
export const DAMAGE = {
  FALL_SAFE_SPEED: speedForHeight(FALL_SAFE_HEIGHT), // ~7.7 m/s
  FALL_DMG_PER_MS: 10, // HP per m/s above safe speed
  IMPACT_FORCE_MIN: 15000, // Newtons per step before an impact hurts
  IMPACT_DMG_PER_N: 1 / 1000,
  PROJECTILE_DMG_PER_JOULE: 0.05,
} as const;
