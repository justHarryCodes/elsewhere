// Drivable vehicle definitions shared by the physics (server + client prediction) and the renderers.
//
// A definition says which model to load, how big it is in the real world, which parts are wheels,
// which materials are paint and lamps, and how it handles. Physics and rendering both derive their
// geometry from the same numbers, so the wheels you see sit exactly where the physics wheels are.
//
// Conventions (same as players): metres, +Y up, a vehicle with heading 0 faces +Z, its left is +X.

import { getRealSize, type SizeKey } from "./scale";

type Vec3Tuple = readonly [number, number, number];

/** Axis-aligned bounds of one mesh, in the model's own units, as exported. */
export interface ModelBounds {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

/** How a model is put together: node names to look for and which material plays which role. */
export interface VehicleRig {
  /** Substrings of node names. The rear axle may be one mesh holding both rear wheels. */
  nodes: { frontLeft: string; frontRight: string; rear: string };
  /** Material names in the model. Anything not listed keeps its look. */
  materials: {
    paint: string;
    headlight: string;
    taillight: string;
    sirenA?: string;
    sirenB?: string;
  };
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
  /** Front wheel angle at standstill and at top speed, degrees. */
  maxSteerDeg: number;
  minSteerDeg: number;
  /** Tyre grip multiplier: 1 = ordinary road tyre. */
  grip: number;
}

export interface VehicleModel {
  label: string;
  url: string;
  /** Real-world size the model is scaled to. */
  size: SizeKey;
  /**
   * Which measured dimension matches the catalog. These models are stylised (short and wide), so
   * matching width keeps them fitting real lanes and parking bays.
   */
  fit: "width" | "length";
  rig: VehicleRig;
  /** Mesh bounds read from the .glb (accessor min/max); the models have no node transforms. */
  bounds: { body: ModelBounds; frontLeft: ModelBounds; frontRight: ModelBounds; rear: ModelBounds };
  handling: VehicleHandling;
  /** Starting paint colour, #rrggbb. */
  paint: string;
}

const QUATERNIUS_RIG = (paint: string, siren = false): VehicleRig => ({
  nodes: { frontLeft: "FrontLeftWheel", frontRight: "FrontRightWheel", rear: "BackWheels" },
  materials: {
    paint,
    headlight: "Headlights",
    taillight: "TailLights",
    ...(siren ? { sirenA: "BlueLights", sirenB: "WhiteLights" } : {}),
  },
});

const b = (min: Vec3Tuple, max: Vec3Tuple): ModelBounds => ({ min, max });

const ROAD_CAR: VehicleHandling = {
  drive: "fwd",
  accel: 3.5,
  brakeDecel: 8.5,
  topSpeed: 50,
  reverseTopSpeed: 8,
  maxSteerDeg: 35,
  minSteerDeg: 8,
  grip: 1,
};

export const VEHICLE_MODELS = {
  policeCar: {
    label: "Police car",
    url: "/assets/vehicles/singles/police-car.glb",
    size: "vehicle.policeCar",
    fit: "width",
    rig: QUATERNIUS_RIG("White", true),
    bounds: {
      body: b([-0.889, 0.09, -1.867], [0.889, 1.222, 1.863]),
      frontLeft: b([0.624, -0.016, 0.866], [0.8, 0.534, 1.416]),
      frontRight: b([-0.799, -0.016, 0.866], [-0.624, 0.534, 1.416]),
      rear: b([-0.776, -0.016, -1.43], [0.777, 0.534, -0.879]),
    },
    handling: { ...ROAD_CAR, drive: "rwd", accel: 4.5, topSpeed: 58, grip: 1.1 },
    paint: "#f1f5f9",
  },
  sportsCar: {
    label: "Sports car",
    url: "/assets/vehicles/singles/sports-car.glb",
    size: "vehicle.sportsCar",
    fit: "width",
    rig: QUATERNIUS_RIG("White"),
    bounds: {
      body: b([-0.936, 0.152, -2.029], [0.936, 1.187, 1.898]),
      frontLeft: b([0.637, -0.016, 0.906], [0.815, 0.545, 1.466]),
      frontRight: b([-0.813, -0.016, 0.906], [-0.635, 0.545, 1.466]),
      rear: b([-0.79, -0.016, -1.601], [0.792, 0.545, -1.04]),
    },
    handling: { ...ROAD_CAR, drive: "rwd", accel: 7, brakeDecel: 10, topSpeed: 75, minSteerDeg: 6, grip: 1.3 },
    paint: "#dc2626",
  },
  suv: {
    label: "SUV",
    url: "/assets/vehicles/singles/suv.glb",
    size: "vehicle.suv",
    fit: "width",
    rig: QUATERNIUS_RIG("White"),
    bounds: {
      body: b([-1.056, 0.236, -2.105], [1.056, 1.51, 2.104]),
      frontLeft: b([0.653, -0.018, 0.99], [0.892, 0.636, 1.644]),
      frontRight: b([-0.882, -0.018, 0.99], [-0.643, 0.636, 1.644]),
      rear: b([-0.909, -0.018, -1.578], [0.919, 0.636, -0.924]),
    },
    handling: { ...ROAD_CAR, drive: "awd", accel: 3.2, brakeDecel: 8, topSpeed: 50, maxSteerDeg: 32, grip: 1 },
    paint: "#334155",
  },
  taxi: {
    label: "Taxi",
    url: "/assets/vehicles/singles/taxi.glb",
    size: "vehicle.taxi",
    fit: "width",
    rig: QUATERNIUS_RIG("Yellow"),
    bounds: {
      body: b([-0.904, 0.154, -2.007], [0.903, 1.3, 2.214]),
      frontLeft: b([0.594, -0.011, 1.034], [0.785, 0.513, 1.558]),
      frontRight: b([-0.786, -0.011, 1.034], [-0.595, 0.513, 1.558]),
      rear: b([-0.784, -0.011, -1.405], [0.783, 0.513, -0.881]),
    },
    handling: ROAD_CAR,
    paint: "#facc15",
  },
  hatchback: {
    label: "Hatchback",
    url: "/assets/buildings/city-pack/car.glb",
    size: "vehicle.compactCar",
    fit: "width",
    rig: QUATERNIUS_RIG("LightBlue"),
    bounds: {
      body: b([-0.819, 0.143, -1.649], [0.819, 1.117, 1.66]),
      frontLeft: b([0.569, -0.028, 0.793], [0.749, 0.467, 1.288]),
      frontRight: b([-0.748, -0.028, 0.793], [-0.567, 0.467, 1.288]),
      rear: b([-0.748, -0.028, -1.203], [0.749, 0.467, -0.708]),
    },
    handling: { ...ROAD_CAR, accel: 3, topSpeed: 45, maxSteerDeg: 38 },
    paint: "#7dd3fc",
  },
  sedan: {
    label: "Sedan",
    url: "/assets/buildings/city-pack/car-2.glb",
    size: "vehicle.sedan",
    fit: "width",
    rig: QUATERNIUS_RIG("Blue"),
    bounds: {
      body: b([-0.904, 0.171, -2.107], [0.904, 1.183, 2.113]),
      frontLeft: b([0.595, 0.006, 0.934], [0.786, 0.53, 1.458]),
      frontRight: b([-0.784, 0.006, 0.934], [-0.593, 0.53, 1.458]),
      rear: b([-0.783, 0.006, -1.505], [0.784, 0.53, -0.981]),
    },
    handling: ROAD_CAR,
    paint: "#2563eb",
  },
} as const satisfies Record<string, VehicleModel>;

export type VehicleModelKey = keyof typeof VEHICLE_MODELS;
export const DEFAULT_VEHICLE_MODEL: VehicleModelKey = "policeCar";

export const isVehicleModel = (value: unknown): value is VehicleModelKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(VEHICLE_MODELS, value);

// ------------------------------------------------------------------ geometry (metres)

export interface WheelGeometry {
  /** Wheel centre in the vehicle's frame (origin on the ground under the body centre). */
  x: number;
  y: number;
  z: number;
  front: boolean;
  left: boolean;
}

export interface VehicleGeometry {
  /** Uniform scale applied to the model so it matches its catalog size. */
  scale: number;
  /** Model-space offset that puts the body centre at x = z = 0 (applied before scaling). */
  offset: { x: number; z: number };
  /** Body box half extents and its centre height, metres. */
  halfLength: number;
  halfWidth: number;
  bodyBottom: number;
  bodyTop: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Order: front-left, front-right, rear-left, rear-right. */
  wheels: [WheelGeometry, WheelGeometry, WheelGeometry, WheelGeometry];
}

const centre = ({ min, max }: ModelBounds, axis: 0 | 1 | 2) => (min[axis] + max[axis]) / 2;
const extent = ({ min, max }: ModelBounds, axis: 0 | 1 | 2) => max[axis] - min[axis];

/** Real-world geometry of a vehicle model, derived from its measured bounds and catalog size. */
export function vehicleGeometry(key: VehicleModelKey): VehicleGeometry {
  const model: VehicleModel = VEHICLE_MODELS[key];
  const { body, frontLeft, frontRight, rear } = model.bounds;
  const real = getRealSize(model.size);
  const scale = model.fit === "width" ? real.width / extent(body, 0) : real.length / extent(body, 2);
  const offset = { x: -centre(body, 0), z: -centre(body, 2) };

  const wheelWidth = extent(frontLeft, 0) * scale;
  const wheelRadius = (extent(frontLeft, 1) / 2) * scale;
  const wheelY = centre(frontLeft, 1) * scale;
  const at = (x: number, z: number, front: boolean, left: boolean): WheelGeometry => ({
    x: (x + offset.x) * scale,
    y: wheelY,
    z: (z + offset.z) * scale,
    front,
    left,
  });
  // The rear axle is one mesh: its wheels sit at its outer edges, one wheel width in.
  const rearHalfWidth = extent(frontLeft, 0) / 2;
  return {
    scale,
    offset,
    halfLength: (extent(body, 2) / 2) * scale,
    halfWidth: (extent(body, 0) / 2) * scale,
    bodyBottom: body.min[1] * scale,
    bodyTop: body.max[1] * scale,
    wheelRadius,
    wheelWidth,
    wheels: [
      at(centre(frontLeft, 0), centre(frontLeft, 2), true, true),
      at(centre(frontRight, 0), centre(frontRight, 2), true, false),
      at(rear.max[0] - rearHalfWidth, centre(rear, 2), false, true),
      at(rear.min[0] + rearHalfWidth, centre(rear, 2), false, false),
    ],
  };
}

// ------------------------------------------------------------------ lights & state

/** Lamp switches, packed into one number for the network. */
export const VehicleLights = {
  Low: 1,
  High: 2,
  Brake: 4,
  Reverse: 8,
  Siren: 16,
} as const;

export type HeadlightMode = "off" | "low" | "high";

/** Everything a renderer needs to draw a vehicle; also the shape it will have in synced state. */
export interface VehicleSnapshot {
  model: string;
  paint: string;
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
