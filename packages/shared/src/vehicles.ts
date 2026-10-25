// Drivable vehicle definitions shared by the physics (server + client prediction) and the renderers.
//
// The per-model data (which way it faces, body and wheel bounds, which materials are paint and
// lamps) is generated from the .glb files into vehicle-catalog.ts by scripts/vehicles/build_catalog.py.
// This file turns it into real-world geometry and handling. Physics and rendering both derive their
// geometry from the same numbers, so the wheels you see sit exactly where the physics wheels are.
//
// Conventions (same as players): metres, +Y up, a vehicle with heading 0 faces +Z, its left is +X.

import { getRealSize, type SizeKey } from "./scale";
import { VEHICLE_CATALOG } from "./vehicle-catalog";

type Vec3Tuple = readonly [number, number, number];

/** Axis-aligned bounds in model units, after the model has been turned to face +Z. */
export interface ModelBounds {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

export type MaterialRole = "paint" | "headlight" | "taillight" | "reverse" | "glass" | "sirenA" | "sirenB";

export interface CatalogWheel {
  /** glTF node names that make up this wheel (or whole axle). */
  nodes: readonly string[];
  min: Vec3Tuple;
  max: Vec3Tuple;
  axle: "front" | "rear";
  /** "both" = one mesh holding the wheels on both sides of an axle. */
  side: "left" | "right" | "both";
}

/** One entry of the generated catalog. */
export interface VehicleCatalogEntry {
  label: string;
  url: string;
  size: SizeKey;
  /**
   * Which measured dimension is matched to the catalog size. Stylised models are short and wide:
   * "width" keeps them in their lane, "average" (geometric mean of both) suits stylised big vehicles.
   */
  fit: "width" | "length" | "average";
  handling: HandlingClass;
  /** Degrees the model is turned about +Y so it faces +Z. */
  yaw: number;
  body: ModelBounds;
  /** Height of the roof line (top of the windows), model units. */
  roof: number;
  /** Empty when the model's wheels are not separate parts (they can't spin or steer). */
  wheels: readonly CatalogWheel[];
  materials: Partial<Record<MaterialRole, readonly string[]>>;
  /** Faces of `material` higher than `above` (model units) are given their own material in `role`. */
  splits?: readonly { material: string; above: number; role: MaterialRole }[];
}

/** Handling, in real units. Mass comes from the size catalog (MASS_KG). */
export interface VehicleHandling {
  drive: "fwd" | "rwd" | "awd";
  /** Peak acceleration from standstill, m/s^2 (0-100 km/h in 27.8 / accel seconds). */
  accel: number;
  /** Braking deceleration, m/s^2 (~8-9 for a road car on asphalt). */
  brakeDecel: number;
  topSpeed: number; // m/s
  reverseTopSpeed: number; // m/s
  /** Front wheel angle at standstill and at speed, degrees. */
  maxSteerDeg: number;
  minSteerDeg: number;
  /** Tyre grip multiplier: 1 = ordinary road tyre. */
  grip: number;
  /** Two-wheelers: physics keeps them upright (they don't lean yet). */
  upright?: boolean;
  /** Driver sits behind the front axle like a car, at the front like a bus, or astride. */
  seat: "car" | "cab" | "saddle";
}

const ROAD: VehicleHandling = {
  drive: "fwd",
  accel: 3.5,
  brakeDecel: 8.5,
  topSpeed: 50,
  reverseTopSpeed: 8,
  maxSteerDeg: 35,
  minSteerDeg: 8,
  grip: 1,
  seat: "car",
};

/** Typical figures per kind of vehicle; every model picks one. */
export const HANDLING = {
  compact: { ...ROAD, accel: 3, topSpeed: 45, maxSteerDeg: 38 },
  sedan: ROAD,
  police: { ...ROAD, drive: "rwd", accel: 4.5, topSpeed: 58, grip: 1.1 },
  sports: { ...ROAD, drive: "rwd", accel: 7, brakeDecel: 10, topSpeed: 75, minSteerDeg: 6, grip: 1.3 },
  supercar: { ...ROAD, drive: "awd", accel: 8, brakeDecel: 10.5, topSpeed: 90, minSteerDeg: 5, grip: 1.35 },
  suv: { ...ROAD, drive: "awd", accel: 3.2, brakeDecel: 8, maxSteerDeg: 32 },
  pickup: { ...ROAD, drive: "rwd", accel: 3, brakeDecel: 7.5, topSpeed: 45, maxSteerDeg: 32 },
  van: { ...ROAD, accel: 2.5, brakeDecel: 7, topSpeed: 40, maxSteerDeg: 34, grip: 0.95, seat: "cab" },
  truck: { ...ROAD, drive: "rwd", accel: 1.2, brakeDecel: 6, topSpeed: 25, maxSteerDeg: 30, grip: 0.9, seat: "cab" },
  bus: { ...ROAD, drive: "rwd", accel: 1.3, brakeDecel: 6, topSpeed: 25, maxSteerDeg: 40, grip: 0.9, seat: "cab" },
  motorcycle: { ...ROAD, drive: "rwd", accel: 7, brakeDecel: 9, topSpeed: 55, maxSteerDeg: 30, minSteerDeg: 4, upright: true, seat: "saddle" },
  bicycle: { ...ROAD, drive: "rwd", accel: 1.5, brakeDecel: 5, topSpeed: 9, maxSteerDeg: 35, upright: true, seat: "saddle" },
} as const satisfies Record<string, VehicleHandling>;
export type HandlingClass = keyof typeof HANDLING;

export const VEHICLE_MODELS = VEHICLE_CATALOG;
export type VehicleModelKey = keyof typeof VEHICLE_CATALOG;
export const DEFAULT_VEHICLE_MODEL: VehicleModelKey = "policeCar";

export const isVehicleModel = (value: unknown): value is VehicleModelKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(VEHICLE_MODELS, value);

export const vehicleHandling = (key: VehicleModelKey): VehicleHandling => HANDLING[VEHICLE_MODELS[key].handling];

/** What a model can show, for UIs: paint needs a plain-coloured body, lamps need lamp materials. */
export function vehicleFeatures(key: VehicleModelKey) {
  const m: VehicleCatalogEntry = VEHICLE_MODELS[key];
  return {
    paint: !!m.materials.paint?.length,
    headlights: !!m.materials.headlight?.length,
    taillights: !!m.materials.taillight?.length,
    siren: !!m.materials.sirenA?.length,
    glass: !!m.materials.glass?.length,
    wheels: m.wheels.length > 0,
  };
}

// ------------------------------------------------------------------ geometry (metres)

export interface WheelGeometry {
  /** Wheel centre in the vehicle's frame (origin on the ground under the body centre). */
  x: number;
  y: number;
  z: number;
  front: boolean;
  left: boolean;
}

/** A drawn wheel (or whole axle): pivot in vehicle space and the physics wheels it follows. */
export interface VisualWheel {
  nodes: readonly string[];
  x: number;
  y: number;
  z: number;
  front: boolean;
  physics: number[];
}

export interface VehicleGeometry {
  /** Uniform scale applied to the model so it matches its catalog size. */
  scale: number;
  /** Turn applied to the model (radians, about +Y) so it faces +Z. */
  yaw: number;
  /** Model-unit offset (after turning) that puts the body centre at x = z = 0 and the tyres on y = 0. */
  offset: { x: number; y: number; z: number };
  halfLength: number;
  halfWidth: number;
  /** Physics chassis box, vertically. The bottom never dips below the wheel centres. */
  bodyBottom: number;
  bodyTop: number;
  /** Roof line above the ground (top of the windows); a light bar or rack can sit above it. */
  roofTop: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Physics wheels. Order: front-left, front-right, rear-left, rear-right. */
  wheels: [WheelGeometry, WheelGeometry, WheelGeometry, WheelGeometry];
  /** Separate wheel parts in the model, empty when the wheels are part of the body. */
  visualWheels: VisualWheel[];
  /** Where the driver's hips go, vehicle space. */
  seat: { x: number; y: number; z: number };
}

const centre = ({ min, max }: { min: Vec3Tuple; max: Vec3Tuple }, axis: 0 | 1 | 2) => (min[axis] + max[axis]) / 2;
const extent = ({ min, max }: { min: Vec3Tuple; max: Vec3Tuple }, axis: 0 | 1 | 2) => max[axis] - min[axis];
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

const geometryCache = new Map<VehicleModelKey, VehicleGeometry>();

/** Real-world geometry of a vehicle model, derived from its measured bounds and catalog size. */
export function vehicleGeometry(key: VehicleModelKey): VehicleGeometry {
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const model: VehicleCatalogEntry = VEHICLE_MODELS[key];
  const { body, wheels: parts } = model;
  const real = getRealSize(model.size);
  const byWidth = real.width / extent(body, 0);
  const byLength = real.length / extent(body, 2);
  const scale = model.fit === "width" ? byWidth : model.fit === "length" ? byLength : Math.sqrt(byWidth * byLength);
  const ground = parts.length ? Math.min(...parts.map((w) => w.min[1])) : body.min[1];
  const offset = { x: -centre(body, 0), y: -ground, z: -centre(body, 2) };
  const toX = (x: number) => (x + offset.x) * scale;
  const toY = (y: number) => (y + offset.y) * scale;
  const toZ = (z: number) => (z + offset.z) * scale;

  const halfLength = (extent(body, 2) / 2) * scale;
  const halfWidth = (extent(body, 0) / 2) * scale;
  const height = (body.max[1] - ground) * scale;

  let wheelRadius: number;
  let wheelWidth: number;
  let physics: VehicleGeometry["wheels"];
  const visualWheels: VisualWheel[] = [];

  if (parts.length) {
    wheelRadius = (mean(parts.map((w) => extent(w, 1))) / 2) * scale;
    const single = parts.find((w) => w.side !== "both");
    wheelWidth = single ? extent(single, 0) * scale : wheelRadius * 0.7;
    const wheelY = toY(mean(parts.map((w) => centre(w, 1))));
    // One physics wheel per corner: left/right parts as they are, axle meshes split at their ends.
    const corner = (axle: "front" | "rear", left: boolean): WheelGeometry => {
      const onAxle = parts.filter((w) => w.axle === axle);
      const z = toZ(mean(onAxle.map((w) => centre(w, 2))));
      const xs = onAxle.flatMap((w) => {
        if (w.side === "both") return [left ? toX(w.max[0]) - wheelWidth / 2 : toX(w.min[0]) + wheelWidth / 2];
        return (w.side === "left") === left ? [toX(centre(w, 0))] : [];
      });
      return { x: xs.length ? mean(xs) : (left ? 1 : -1) * (halfWidth - wheelWidth), y: wheelY, z, front: axle === "front", left };
    };
    physics = [corner("front", true), corner("front", false), corner("rear", true), corner("rear", false)];
    for (const w of parts) {
      const indices = w.axle === "front" ? [0, 1] : [2, 3];
      visualWheels.push({
        nodes: w.nodes,
        x: toX(centre(w, 0)),
        y: toY(centre(w, 1)),
        z: toZ(centre(w, 2)),
        front: w.axle === "front",
        physics: w.side === "both" ? indices : [indices[w.side === "left" ? 0 : 1]],
      });
    }
  } else {
    // Wheels are part of the body mesh: put physics wheels where a real vehicle of this size has them.
    wheelRadius = Math.min(0.5, Math.max(0.3, 0.22 * height));
    wheelWidth = wheelRadius * 0.7;
    const axleZ = halfLength - Math.max(wheelRadius * 1.6, halfLength * 0.22);
    const x = Math.max(0.12, halfWidth - wheelWidth * 0.8);
    const at = (front: boolean, left: boolean): WheelGeometry => ({
      x: left ? x : -x, y: wheelRadius, z: front ? axleZ : -axleZ, front, left,
    });
    physics = [at(true, true), at(true, false), at(false, true), at(false, false)];
  }

  const handling = HANDLING[model.handling];
  const frontZ = physics[0].z;
  const rearZ = physics[2].z;
  const floor = Math.max(toY(body.min[1]), 0.15);
  const seat =
    handling.seat === "saddle"
      ? { x: 0, y: Math.max(height * 0.55, 0.6), z: (frontZ + rearZ) / 2 - 0.1 * (frontZ - rearZ) }
      : handling.seat === "cab"
        ? { x: halfWidth * 0.5, y: floor + 0.45, z: halfLength - 1.1 }
        : { x: halfWidth * 0.38, y: floor + 0.4, z: (frontZ + rearZ) / 2 - 0.05 * (frontZ - rearZ) };

  const geometry: VehicleGeometry = {
    scale,
    yaw: (model.yaw * Math.PI) / 180,
    offset,
    halfLength,
    halfWidth,
    bodyBottom: Math.max(toY(body.min[1]), physics[0].y),
    bodyTop: toY(body.max[1]),
    roofTop: toY(model.roof),
    wheelRadius,
    wheelWidth,
    wheels: physics,
    visualWheels,
    seat,
  };
  geometryCache.set(key, geometry);
  return geometry;
}

// ------------------------------------------------------------------ lights, paint & state

/** Lamp switches, packed into one number for the network. */
export const VehicleLights = {
  Low: 1,
  High: 2,
  Brake: 4,
  Reverse: 8,
  Siren: 16,
} as const;

export type HeadlightMode = "off" | "low" | "high";

/** Paint finish: gloss = ordinary clear-coated paint, metallic = metal flake under clear coat, matte = satin wrap. */
export type PaintFinish = "gloss" | "metallic" | "matte";
export const PAINT_FINISHES: PaintFinish[] = ["gloss", "metallic", "matte"];

/** Everything a renderer needs to draw a vehicle; also the shape it will have in synced state. */
export interface VehicleSnapshot {
  model: string;
  /** #rrggbb, or "" to keep the model's own colour. */
  paint: string;
  finish: PaintFinish;
  x: number;
  y: number;
  z: number;
  /** Chassis rotation quaternion (the body pitches and rolls on its suspension). */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Signed forward speed, m/s. */
  speed: number;
  /** Front wheel yaw, radians, + turns toward the vehicle's left. */
  steer: number;
  /** Rolling angle per wheel (FL, FR, RL, RR), radians, + rolls forward. */
  wheelSpin: [number, number, number, number];
  /** Suspension: wheel centre height below its rest point, metres, per wheel. */
  wheelDrop: [number, number, number, number];
  /** VehicleLights bitmask. */
  lights: number;
}

/**
 * Blends two snapshots, e.g. the last two physics steps by how far the frame is into the next one.
 * Physics runs at a fixed rate; drawing the in-between pose keeps motion smooth at any frame rate.
 */
export function lerpVehicleSnapshot(a: VehicleSnapshot, b: VehicleSnapshot, t: number): VehicleSnapshot {
  const mix = (x: number, y: number) => x + (y - x) * t;
  // Quaternion slerp (shortest way round).
  let { qx: bx, qy: by, qz: bz, qw: bw } = b;
  let dot = a.qx * bx + a.qy * by + a.qz * bz + a.qw * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }
  let wa = 1 - t;
  let wb = t;
  if (dot < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sin;
    wb = Math.sin(t * theta) / sin;
  }
  const four = (x: readonly number[], y: readonly number[]) =>
    [mix(x[0], y[0]), mix(x[1], y[1]), mix(x[2], y[2]), mix(x[3], y[3])] as [number, number, number, number];
  return {
    ...b,
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
    qx: a.qx * wa + bx * wb,
    qy: a.qy * wa + by * wb,
    qz: a.qz * wa + bz * wb,
    qw: a.qw * wa + bw * wb,
    speed: mix(a.speed, b.speed),
    steer: mix(a.steer, b.steer),
    wheelSpin: four(a.wheelSpin, b.wheelSpin),
    wheelDrop: four(a.wheelDrop, b.wheelDrop),
  };
}
