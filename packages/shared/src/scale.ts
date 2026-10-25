// Real-world scale for the whole virtual world.
//
// Every size here is in METRES. Engine units are derived from UNITS_PER_METER, which is 1
// to match Babylon.js (and glTF): 1 Babylon unit = 1 metre. Change it in one place if the
// world ever needs a different mapping; everything else goes through toUnits()/toMeters().

export const UNITS_PER_METER = 1;

export const toUnits = (meters: number) => meters * UNITS_PER_METER;
export const toMeters = (units: number) => units / UNITS_PER_METER;

/** Earth gravity in engine units per second squared (negative = down). */
export const GRAVITY = toUnits(-9.81);

/** Which measured dimension a model is scaled by. */
export type FitAxis = "height" | "length" | "width";

/**
 * Real-world bounding size in metres.
 * - height: vertical extent
 * - length: longest horizontal extent (a car's nose to tail, a sofa's seat span)
 * - width:  shortest horizontal extent
 * `fit` is the dimension that is most reliable for that object type and is used when scaling.
 */
export interface RealSize {
  length: number;
  width: number;
  height: number;
  fit: FitAxis;
}

const size = (
  length: number,
  width: number,
  height: number,
  fit: FitAxis,
): RealSize => ({
  length,
  width,
  height,
  fit,
});

/** Human reference metrics. The adult male is the yardstick the rest of the world is sized against. */
export const HUMAN_METRICS = {
  height: 1.75,
  eyeHeight: 1.63,
  shoulderWidth: 0.46,
  walkSpeed: 1.2, // m/s
  runSpeed: 3.5, // m/s
  sprintSpeed: 6, // m/s
  stepHeight: 0.18, // a standard stair riser
  jumpHeight: 0.5,
} as const;

/** Building metrics used to derive floors, doors and ceilings. */
export const BUILDING_METRICS = {
  storyHeight: 3.0, // floor-to-floor, residential
  commercialGroundFloorHeight: 4.0,
  ceilingHeight: 2.7,
  doorHeight: 2.1,
  doorWidth: 0.9,
  windowSillHeight: 0.9,
  pitchedRoofHeight: 2.5,
} as const;

/** Street metrics used to lay out roads and sidewalks. */
export const STREET_METRICS = {
  laneWidth: 3.5,
  sidewalkWidth: 2.0,
  curbHeight: 0.15,
  parkingSpaceLength: 5.0,
  parkingSpaceWidth: 2.5,
  streetLightSpacing: 30,
} as const;

export const REAL_WORLD_SIZES = {
  human: {
    adultMale: size(
      HUMAN_METRICS.shoulderWidth,
      0.28,
      HUMAN_METRICS.height,
      "height",
    ),
    adultFemale: size(0.4, 0.26, 1.62, "height"),
    teen: size(0.38, 0.24, 1.55, "height"),
    child: size(0.32, 0.2, 1.2, "height"),
  },
  vehicle: {
    compactCar: size(4.0, 1.75, 1.5, "length"),
    sedan: size(4.7, 1.85, 1.45, "length"),
    sportsCar: size(4.5, 1.95, 1.2, "length"),
    taxi: size(4.7, 1.85, 1.5, "length"),
    policeCar: size(5.0, 1.95, 1.55, "length"),
    suv: size(4.8, 1.95, 1.75, "length"),
    pickupTruck: size(5.4, 2.0, 1.9, "length"),
    van: size(5.2, 2.0, 2.0, "length"),
    ambulance: size(6.3, 2.3, 2.8, "length"),
    cargoTruck: size(8.5, 2.5, 3.6, "length"),
    fireTruck: size(10.0, 2.5, 3.4, "length"),
    bus: size(12.0, 2.55, 3.2, "length"),
    schoolBus: size(11.0, 2.4, 3.2, "length"),
    motorcycle: size(2.1, 0.8, 1.2, "length"),
    bicycle: size(1.75, 0.6, 1.1, "length"),
    trainCarriage: size(23.0, 3.0, 4.0, "length"),
    rowBoat: size(4.0, 1.5, 0.8, "length"),
    speedBoat: size(6.5, 2.4, 1.8, "length"),
  },
  building: {
    shed: size(3.0, 2.5, 2.5, "height"),
    houseOneStory: size(
      12,
      10,
      BUILDING_METRICS.storyHeight + BUILDING_METRICS.pitchedRoofHeight,
      "height",
    ),
    houseTwoStory: size(
      12,
      10,
      BUILDING_METRICS.storyHeight * 2 + BUILDING_METRICS.pitchedRoofHeight,
      "height",
    ),
    shop: size(
      12,
      10,
      BUILDING_METRICS.commercialGroundFloorHeight + 1,
      "height",
    ),
    door: size(
      BUILDING_METRICS.doorWidth,
      0.05,
      BUILDING_METRICS.doorHeight,
      "height",
    ),
    window: size(1.2, 0.1, 1.2, "height"),
    stairStep: size(1.0, 0.28, HUMAN_METRICS.stepHeight, "height"),
  },
  street: {
    streetLight: size(1.5, 0.3, 8.0, "height"),
    streetLightResidential: size(1.0, 0.25, 5.0, "height"),
    trafficLight: size(0.4, 0.4, 5.0, "height"),
    stopSign: size(0.75, 0.1, 2.1, "height"),
    trafficCone: size(0.36, 0.36, 0.7, "height"),
    fireHydrant: size(0.4, 0.4, 0.8, "height"),
    bench: size(1.8, 0.6, 0.8, "length"),
    trashCan: size(0.6, 0.6, 1.0, "height"),
    mailbox: size(0.5, 0.45, 1.2, "height"),
    busStop: size(3.5, 1.5, 2.6, "length"),
    roadSegment: size(10, STREET_METRICS.laneWidth * 2, 0.05, "width"),
  },
  furniture: {
    singleBed: size(2.0, 0.9, 0.55, "length"),
    doubleBed: size(2.0, 1.4, 0.55, "length"),
    queenBed: size(2.03, 1.52, 0.6, "length"),
    kingBed: size(2.03, 1.93, 0.6, "length"),
    sofa: size(2.1, 0.9, 0.85, "length"),
    loveseat: size(1.5, 0.9, 0.85, "length"),
    armchair: size(0.85, 0.85, 0.9, "height"),
    diningChair: size(0.5, 0.45, 0.9, "height"),
    officeChair: size(0.65, 0.65, 1.1, "height"),
    diningTable: size(1.8, 0.9, 0.75, "height"),
    coffeeTable: size(1.2, 0.6, 0.45, "height"),
    desk: size(1.4, 0.7, 0.75, "height"),
    kitchenCounter: size(2.4, 0.6, 0.9, "height"),
    fridge: size(0.7, 0.7, 1.8, "height"),
    wardrobe: size(1.2, 0.6, 2.0, "height"),
    bookshelf: size(0.9, 0.3, 1.8, "height"),
    tv: size(1.25, 0.08, 0.75, "length"), // 55"
    toilet: size(0.7, 0.4, 0.75, "height"),
    bathtub: size(1.7, 0.75, 0.55, "length"),
    lamp: size(0.4, 0.4, 1.6, "height"),
    plantPot: size(0.4, 0.4, 0.9, "height"),
  },
  nature: {
    grass: size(0.3, 0.3, 0.3, "height"),
    flower: size(0.2, 0.2, 0.35, "height"),
    bush: size(1.5, 1.2, 1.2, "height"),
    treeSmall: size(2.5, 2.5, 4.0, "height"),
    treeMedium: size(5.0, 5.0, 8.0, "height"),
    treeLarge: size(9.0, 9.0, 15.0, "height"),
    pineTree: size(4.0, 4.0, 12.0, "height"),
    palmTree: size(4.0, 4.0, 10.0, "height"),
    rockSmall: size(0.5, 0.4, 0.3, "length"),
    rockLarge: size(2.5, 2.0, 1.5, "length"),
  },
  animal: {
    cat: size(0.46, 0.15, 0.25, "length"),
    dog: size(0.9, 0.3, 0.6, "length"),
    horse: size(2.4, 0.6, 2.2, "length"),
    cow: size(2.5, 0.8, 1.5, "length"),
    deer: size(1.8, 0.5, 1.6, "length"),
    fish: size(0.3, 0.06, 0.12, "length"),
    bird: size(0.25, 0.1, 0.15, "length"),
  },
  food: {
    apple: size(0.08, 0.08, 0.08, "height"),
    burger: size(0.12, 0.12, 0.09, "length"),
    pizza: size(0.3, 0.3, 0.03, "length"),
    plate: size(0.27, 0.27, 0.03, "length"),
    cup: size(0.09, 0.09, 0.1, "height"),
    bottle: size(0.08, 0.08, 0.3, "height"),
  },
  prop: {
    crate: size(1.0, 1.0, 1.0, "height"),
    barrel: size(0.6, 0.6, 0.9, "height"),
    pistol: size(0.2, 0.04, 0.14, "length"),
    rifle: size(1.0, 0.07, 0.25, "length"),
    gravestone: size(0.6, 0.15, 1.0, "height"),
    arcadeCabinet: size(0.7, 0.8, 1.8, "height"),
  },
} as const satisfies Record<string, Record<string, RealSize>>;

type Catalog = typeof REAL_WORLD_SIZES;
export type SizeCategory = keyof Catalog;
/** Catalog key such as 'vehicle.sedan' or 'furniture.sofa'. */
export type SizeKey = {
  [C in SizeCategory]: `${C}.${keyof Catalog[C] & string}`;
}[SizeCategory];

export function getRealSize(key: SizeKey): RealSize {
  const [category, name] = key.split(".") as [SizeCategory, string];
  return (REAL_WORLD_SIZES[category] as Record<string, RealSize>)[name];
}

const resolve = (target: SizeKey | RealSize) =>
  typeof target === "string" ? getRealSize(target) : target;

/** A model's measured bounding size in engine units (y is up). */
export interface Dimensions {
  x: number;
  y: number;
  z: number;
}

/**
 * Uniform scale factor that makes a model with `measured` bounds match its real-world size.
 * Length/width are taken from the larger/smaller horizontal axis, so the result does not
 * depend on whether the model faces x or z.
 */
export function fitScaleFactor(
  measured: Dimensions,
  target: SizeKey | RealSize,
  axis?: FitAxis,
): number {
  const real = resolve(target);
  const fitAxis = axis ?? real.fit;
  const current =
    fitAxis === "height"
      ? measured.y
      : fitAxis === "length"
        ? Math.max(measured.x, measured.z)
        : Math.min(measured.x, measured.z);

  if (!(current > 1e-6)) {
    throw new Error(
      `Cannot scale a model with zero ${fitAxis} (measured ${JSON.stringify(measured)})`,
    );
  }
  return toUnits(real[fitAxis]) / current;
}

/** Real-world size converted to engine units, e.g. for primitives and colliders. */
export function sizeInUnits(target: SizeKey | RealSize): RealSize {
  const real = resolve(target);
  return {
    ...real,
    length: toUnits(real.length),
    width: toUnits(real.width),
    height: toUnits(real.height),
  };
}

/** How many adult men tall something is, e.g. 'street.streetLight' -> ~4.6. */
export function heightInHumans(target: SizeKey | RealSize): number {
  return resolve(target).height / HUMAN_METRICS.height;
}

export interface BuildingOptions {
  footprintLength?: number;
  footprintWidth?: number;
  /** Use a taller ground floor for shops/offices. */
  commercialGroundFloor?: boolean;
  /** Add a pitched roof on top of the last floor. */
  pitchedRoof?: boolean;
}

/** Real size of a multi-story building, e.g. buildingSize(10) for a 10-story apartment block. */
export function buildingSize(
  floors: number,
  options: BuildingOptions = {},
): RealSize {
  const { storyHeight, commercialGroundFloorHeight, pitchedRoofHeight } =
    BUILDING_METRICS;
  const groundFloor = options.commercialGroundFloor
    ? commercialGroundFloorHeight
    : storyHeight;
  const height =
    groundFloor +
    Math.max(0, floors - 1) * storyHeight +
    (options.pitchedRoof ? pitchedRoofHeight : 0);
  return size(
    options.footprintLength ?? 20,
    options.footprintWidth ?? 15,
    height,
    "height",
  );
}

/** Floors a building of a given height (metres) represents. */
export function floorsForHeight(heightMeters: number): number {
  return Math.max(1, Math.round(heightMeters / BUILDING_METRICS.storyHeight));
}

/** Full road width in metres for a lane count, optionally including sidewalks on both sides. */
export function roadWidth(lanes: number, withSidewalks = false): number {
  return (
    lanes * STREET_METRICS.laneWidth +
    (withSidewalks ? STREET_METRICS.sidewalkWidth * 2 : 0)
  );
}
