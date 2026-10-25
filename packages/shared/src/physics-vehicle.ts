/**
 * physics-vehicle.ts  -  drivable 4-wheel vehicles on Rapier's DynamicRayCastVehicleController.
 *
 * Geometry (body box, wheel positions, wheel radius) comes from the model definition in vehicles.ts,
 * so the physics wheels sit exactly where the rendered ones do. Mass comes from MASS_KG, tyre grip
 * from the model's handling times the surface the wheel is touching (SURFACES friction).
 * Authoritative on the SERVER. The client may run it for the local driver (prediction) and in the
 * offline sandbox.
 *
 * Conventions (same as players): +Y up, heading 0 faces +Z, the vehicle's left is +X.
 * Wheel order: 0 front-left, 1 front-right, 2 rear-left, 3 rear-right.
 *
 * Driving input reuses the player's PlayerInput, so no new network message is needed:
 *   while driving:  input.z = throttle (+forward / -reverse), input.x = steer (+right), input.jump = handbrake
 *   on foot:        input.x / input.z = movement direction (as before)
 */
import type RAPIER from "@dimforge/rapier3d-compat";
import { RULES, type Sim, type Vec3 } from "./physics-core";
import * as C from "./physics-config";
import {
  VEHICLE_MODELS,
  vehicleFeatures,
  vehicleHandling,
  VehicleLights,
  vehicleGeometry,
  type HeadlightMode,
  type PaintFinish,
  type VehicleGeometry,
  type VehicleHandling,
  type VehicleModelKey,
  type VehicleSnapshot,
} from "./vehicles";

// ------------------------------------------------------------------ TYPES
export interface VehicleInput {
  throttle: number; // -1..1
  steer: number; // -1 (left) .. 1 (right)
  handbrake: boolean;
}

export interface VehicleState {
  controller: RAPIER.DynamicRayCastVehicleController;
  model: VehicleModelKey;
  handling: VehicleHandling;
  geometry: VehicleGeometry;
  mass: number;
  /** #rrggbb, or "" for the model's own colour. */
  paint: string;
  finish: PaintFinish;
  headlights: HeadlightMode;
  siren: boolean;
  /** Smoothed steering input, -1..1 (+ right). */
  steer: number;
  driver: string | null;
  /** Direct control (AI, sandbox, tests). null = use the driver's PlayerInput. */
  input: VehicleInput | null;
  /** Signed forward speed, m/s. */
  speed: number;
  braking: boolean;
  reversing: boolean;
  /** Per wheel, for rendering: yaw (+ left), rolling angle (+ forward), drop below rest (m). */
  wheels: { steer: number; spin: number; drop: number; contact: boolean }[];
  /** Wheel centre height below its chassis mount when the car rests on level ground. */
  restLength: number;
  driven: number[]; // wheel indices that receive engine force
}

const IDLE: VehicleInput = { throttle: 0, steer: 0, handbrake: false };

/**
 * Rapier's steering angle and wheel rotation signs depend on the axle direction. These map them to
 * the conventions above: + steer turns toward the vehicle's left, + spin rolls forward.
 * Calibrated by driving a car forward and turning: forward throttle moves it toward +Z with
 * rising wheel rotation, and a + yaw on the front wheels turns it toward +X.
 */
const RAPIER_STEER_SIGN = 1;
const RAPIER_SPIN_SIGN = 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function rotate(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
  const cx = q.y * v.z - q.z * v.y + q.w * v.x;
  const cy = q.z * v.x - q.x * v.z + q.w * v.y;
  const cz = q.x * v.y - q.y * v.x + q.w * v.z;
  return {
    x: v.x + 2 * (q.y * cz - q.z * cy),
    y: v.y + 2 * (q.z * cx - q.x * cz),
    z: v.z + 2 * (q.x * cy - q.y * cx),
  };
}

// ------------------------------------------------------------------ SPAWN
export interface VehicleOptions {
  yaw?: number; // radians, heading like players (0 faces +Z)
  paint?: string;
  finish?: PaintFinish;
}

/** Spawn a drivable vehicle. `pos` is the point on the ground under it. */
export function addVehicle(
  sim: Sim,
  id: string,
  model: VehicleModelKey,
  pos: Vec3,
  { yaw = 0, paint = "", finish = "gloss" }: VehicleOptions = {},
): RAPIER.RigidBody {
  const { RAPIER, world } = sim;
  const def = VEHICLE_MODELS[model];
  const handling = vehicleHandling(model);
  const geo = vehicleGeometry(model);
  const mass = C.massFor(def.size, "metal");
  const g = Math.abs(RULES.GRAVITY);

  // The body's origin is the point on the ground under the chassis centre (the model's origin),
  // so wheel and collider positions can be used straight from the geometry.
  const halfHeight = (geo.bodyTop - geo.bodyBottom) / 2;
  const bodyCentreY = (geo.bodyTop + geo.bodyBottom) / 2;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y + 0.05, pos.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(0.0)
      .setAngularDamping(1) // settles slides without dulling steering
      .setCcdEnabled(true),
  );

  // Real mass with a LOW centre of mass (engine + floor pan), so the car resists rolling over.
  const L = geo.halfLength * 2;
  const H = halfHeight * 2;
  const W = geo.halfWidth * 2;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(geo.halfWidth, halfHeight, geo.halfLength)
      .setTranslation(0, bodyCentreY, 0)
      .setFriction(0.3)
      .setRestitution(0.05)
      .setMassProperties(
        mass,
        // relative to the collider, which sits at bodyCentreY
        { x: 0, y: geo.bodyTop * C.VEHICLE.centreOfMassHeight - bodyCentreY, z: 0 },
        {
          x: (mass / 12) * (H * H + L * L),
          y: (mass / 12) * (W * W + L * L),
          z: (mass / 12) * (W * W + H * H),
        },
        { x: 0, y: 0, z: 0, w: 1 },
      ),
    body,
  );

  // ---- wheels (raycast suspension). Springs sag under the car's weight by g / (4 * stiffness);
  // mount them so the sagged wheel centre lands on the model's wheel centre.
  const cc = world.createVehicleController(body);
  cc.indexUpAxis = 1; // Y
  cc.setIndexForwardAxis = 2; // Z (Rapier's setter really is named this)
  const sag = g / (4 * C.VEHICLE.suspensionStiffness);
  const restLength = C.VEHICLE.suspensionTravel + sag;
  geo.wheels.forEach((w, i) => {
    cc.addWheel(
      { x: w.x, y: w.y + restLength - sag, z: w.z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      restLength,
      geo.wheelRadius,
    );
    cc.setWheelMaxSuspensionTravel(i, C.VEHICLE.suspensionTravel);
    cc.setWheelSuspensionStiffness(i, C.VEHICLE.suspensionStiffness);
    cc.setWheelSuspensionCompression(i, C.VEHICLE.suspensionCompression);
    cc.setWheelSuspensionRelaxation(i, C.VEHICLE.suspensionRelaxation);
    cc.setWheelMaxSuspensionForce(i, mass * g * 2);
    cc.setWheelSideFrictionStiffness(i, 1.0);
    cc.setWheelFrictionSlip(i, handling.grip * C.VEHICLE.tireFriction);
  });

  const drive = handling.drive;
  const state: VehicleState = {
    controller: cc,
    model,
    handling,
    geometry: geo,
    mass,
    paint,
    finish,
    headlights: "off",
    siren: false,
    steer: 0,
    driver: null,
    input: null,
    speed: 0,
    braking: false,
    reversing: false,
    wheels: geo.wheels.map(() => ({ steer: 0, spin: 0, drop: 0, contact: false })),
    restLength: restLength - sag,
    driven: drive === "fwd" ? [0, 1] : drive === "rwd" ? [2, 3] : [0, 1, 2, 3],
  };

  sim.bodies.set(id, {
    body,
    kind: "vehicle",
    key: def.size,
    cd: C.dragCoefficient(def.size),
    area: C.frontalArea(def.size),
    half: halfHeight,
    vehicle: state,
  });
  return body;
}

// ------------------------------------------------------------------ PER-TICK UPDATE (call BEFORE world.step)
function readInput(sim: Sim, v: VehicleState): VehicleInput {
  if (v.input) return v.input;
  if (!v.driver) return IDLE;
  const pi = sim.bodies.get(v.driver)?.input;
  if (!pi) return IDLE;
  return { throttle: pi.z, steer: pi.x, handbrake: pi.jump };
}

export function stepVehicles(sim: Sim): void {
  const { RAPIER } = sim;
  const dt = RULES.DT;
  const g = Math.abs(RULES.GRAVITY);
  const rayGroups = C.groups(0xffff, C.LAYER.STATIC | C.LAYER.DYNAMIC); // wheels ignore players, bullets, triggers

  for (const e of sim.bodies.values()) {
    const v = e.vehicle;
    if (e.kind !== "vehicle" || !v) continue;
    const cc = v.controller;
    const h = v.handling;
    const inp = readInput(sim, v);
    const parked = v.driver === null && !v.input;
    const speed = cc.currentVehicleSpeed();
    v.speed = speed;

    // ---- steering: smoothed, and less angle at speed (stability). + yaw turns left.
    const maxStep = C.VEHICLE.steerRate * dt;
    v.steer += clamp(clamp(inp.steer, -1, 1) - v.steer, -maxStep, maxStep);
    const maxAngle =
      (lerp(h.maxSteerDeg, h.minSteerDeg, clamp(Math.abs(speed) / (h.topSpeed * C.VEHICLE.steerFadeSpeed), 0, 1)) *
        Math.PI) /
      180;
    const wheelYaw = -v.steer * maxAngle;

    // ---- engine / brake forces (Newtons, total for the vehicle)
    const th = clamp(inp.throttle, -1, 1);
    const maxEngine = v.mass * h.accel;
    const maxBrake = v.mass * h.brakeDecel;
    let engine = 0;
    let brake = 0;
    v.braking = false;
    if (parked) {
      brake = maxBrake * 0.5; // parking brake
    } else if (th !== 0 && Math.abs(speed) > 0.5 && Math.sign(th) !== Math.sign(speed)) {
      brake = Math.abs(th) * maxBrake; // pushing against motion = brake
      v.braking = true;
    } else if (th !== 0) {
      const top = th > 0 ? h.topSpeed : h.reverseTopSpeed;
      engine = th * maxEngine * clamp(1 - Math.abs(speed) / top, 0, 1); // power fades toward top speed
    } else {
      brake = C.VEHICLE.rollingResistance * v.mass * g; // coasting
    }
    v.reversing = th < 0 && speed < 0.5 && !v.braking;
    if (inp.handbrake) v.braking = true;

    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      const hb = inp.handbrake && rear;
      cc.setWheelSteering(i, rear ? 0 : RAPIER_STEER_SIGN * wheelYaw);
      cc.setWheelEngineForce(i, hb || !v.driven.includes(i) ? 0 : engine / v.driven.length);
      // Rapier's wheel brake is an IMPULSE per step (measured), so Newtons * dt
      const axleShare = rear ? 1 - C.VEHICLE.brakeFrontBias : C.VEHICLE.brakeFrontBias;
      cc.setWheelBrake(i, (hb ? maxBrake / 2 : (brake * axleShare) / 2) * dt);

      // tyre grip = tyre * what the wheel is standing on (ice vs asphalt)
      const ground = cc.wheelGroundObject(i);
      const surfaceMu = ground ? ground.friction() : 0.8;
      let slip = h.grip * C.VEHICLE.tireFriction * surfaceMu;
      if (hb) slip *= C.VEHICLE.handbrakeRearGrip;
      cc.setWheelFrictionSlip(i, slip);
    }

    cc.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, rayGroups);

    // ---- stability control (ESC, as in modern cars): don't let the car yaw faster than its steering
    // and tyres allow, so braking or lifting mid-corner doesn't spin it. Off with the handbrake.
    if (!inp.handbrake && Math.abs(speed) > C.VEHICLE.escMinSpeed) {
      const up = rotate(e.body.rotation(), { x: 0, y: 1, z: 0 });
      const w = e.body.angvel();
      const yawRate = w.x * up.x + w.y * up.y + w.z * up.z;
      const geo = v.geometry;
      const wheelbase = geo.wheels[0].z - geo.wheels[2].z;
      const kinematic = (speed * Math.tan(wheelYaw)) / wheelbase; // + = turning left
      const limit = (h.grip * C.VEHICLE.tireFriction * g) / Math.abs(speed); // yaw rate the tyres can hold
      const error = yawRate - clamp(kinematic, -limit, limit);
      const L = geo.halfLength * 2;
      const W = geo.halfWidth * 2;
      const inertia = (v.mass / 12) * (L * L + W * W);
      const k = -error * inertia * Math.min(1, C.VEHICLE.escGain * dt);
      e.body.applyTorqueImpulse({ x: up.x * k, y: up.y * k, z: up.z * k }, true);
    }

    // ---- data for rendering the wheels on the client
    for (let i = 0; i < 4; i++) {
      const w = v.wheels[i];
      w.steer = RAPIER_STEER_SIGN * (cc.wheelSteering(i) ?? 0);
      w.spin = RAPIER_SPIN_SIGN * (cc.wheelRotation(i) ?? 0);
      w.drop = (cc.wheelSuspensionLength(i) ?? v.restLength) - v.restLength;
      w.contact = cc.wheelIsInContact(i);
    }

    // ---- the driver rides along (hidden physics body follows the chassis)
    if (v.driver) {
      const d = sim.bodies.get(v.driver);
      if (d) d.body.setTranslation(e.body.translation(), false);
    }
  }
}

/**
 * Two-wheelers ride on four raycast wheels with a narrow track and would tip over in turns. After
 * the solver runs (call AFTER world.step), strip any roll so they stay upright; heading and pitch
 * (ramps, hills) are kept. Leaning into corners can be layered on visually later.
 */
export function keepUpright(sim: Sim): void {
  for (const e of sim.bodies.values()) {
    const v = e.vehicle;
    if (e.kind !== "vehicle" || !v?.handling.upright) continue;
    const q = e.body.rotation();
    const f = rotate(q, { x: 0, y: 0, z: 1 });
    const heading = Math.atan2(f.x, f.z);
    const pitch = -Math.asin(clamp(f.y, -1, 1));
    // yaw about +Y, then pitch about the vehicle's own X axis
    const sy = Math.sin(heading / 2);
    const cy = Math.cos(heading / 2);
    const sp = Math.sin(pitch / 2);
    const cp = Math.cos(pitch / 2);
    e.body.setRotation({ x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp }, false);
    const w = e.body.angvel();
    const along = w.x * f.x + w.y * f.y + w.z * f.z; // roll rate about the forward axis
    e.body.setAngvel({ x: w.x - along * f.x, y: w.y - along * f.y, z: w.z - along * f.z }, false);
  }
}

// ------------------------------------------------------------------ LIGHTS & SNAPSHOT
export function setHeadlights(sim: Sim, vehicleId: string, mode: HeadlightMode): void {
  const v = sim.bodies.get(vehicleId)?.vehicle;
  if (v) v.headlights = mode;
}

export function setSiren(sim: Sim, vehicleId: string, on: boolean): void {
  const v = sim.bodies.get(vehicleId)?.vehicle;
  if (v) v.siren = on && vehicleFeatures(v.model).siren;
}

export function vehicleLights(v: VehicleState): number {
  let lights = 0;
  if (v.headlights === "low") lights |= VehicleLights.Low;
  if (v.headlights === "high") lights |= VehicleLights.Low | VehicleLights.High;
  if (v.braking) lights |= VehicleLights.Brake;
  if (v.reversing) lights |= VehicleLights.Reverse;
  if (v.siren) lights |= VehicleLights.Siren;
  return lights;
}

/** What a renderer needs to draw the vehicle; the same shape the server will sync. */
export function vehicleSnapshot(sim: Sim, vehicleId: string): VehicleSnapshot | null {
  const e = sim.bodies.get(vehicleId);
  const v = e?.vehicle;
  if (!e || !v) return null;
  const p = e.body.translation();
  const q = e.body.rotation();
  const [fl, fr, rl, rr] = v.wheels;
  return {
    model: v.model,
    paint: v.paint,
    finish: v.finish,
    x: p.x,
    y: p.y,
    z: p.z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    speed: v.speed,
    steer: (fl.steer + fr.steer) / 2,
    wheelSpin: [fl.spin, fr.spin, rl.spin, rr.spin],
    wheelDrop: [fl.drop, fr.drop, rl.drop, rr.drop],
    lights: vehicleLights(v),
  };
}

// ------------------------------------------------------------------ ENTER / EXIT
/** Put a player in the driver seat. Server-side check: must be close enough. */
export function enterVehicle(sim: Sim, vehicleId: string, playerId: string): boolean {
  const ve = sim.bodies.get(vehicleId);
  const pe = sim.bodies.get(playerId);
  const v = ve?.vehicle;
  if (!ve || !v || !pe) return false;
  if (pe.kind !== "player" && pe.kind !== "kinplayer") return false;
  if (v.driver !== null || pe.inVehicle) return false;
  const a = ve.body.translation();
  const b = pe.body.translation();
  if (Math.hypot(a.x - b.x, a.z - b.z) > v.geometry.halfLength + C.VEHICLE.enterDistance) return false;

  pe.body.setEnabled(false); // no collisions or physics while seated
  pe.inVehicle = vehicleId;
  pe.input = { x: 0, z: 0, jump: false };
  pe.vy = 0;
  sim.fallState.set(playerId, { vy: 0, grounded: true });
  v.driver = playerId;
  return true;
}

/** Step the driver out on the left (driver) side. Returns false if the player isn't driving. */
export function exitVehicle(sim: Sim, playerId: string): boolean {
  const pe = sim.bodies.get(playerId);
  const ve = pe?.inVehicle ? sim.bodies.get(pe.inVehicle) : undefined;
  const v = ve?.vehicle;
  if (!pe || !ve || !v) return false;

  const t = ve.body.translation();
  const side = rotate(ve.body.rotation(), {
    x: v.geometry.halfWidth + RULES.PLAYER.radius + 0.4,
    y: 0,
    z: 0,
  });
  pe.body.setEnabled(true);
  pe.body.setTranslation({ x: t.x + side.x, y: t.y + 1, z: t.z + side.z }, true);
  pe.body.setLinvel(ve.body.linvel(), true); // keep the car's momentum, like real life
  pe.input = { x: 0, z: 0, jump: false };
  pe.inVehicle = undefined;
  sim.fallState.set(playerId, { vy: 0, grounded: true });
  v.driver = null;
  return true;
}

/** Called by removeEntity: frees the controller and releases any driver / seated player. */
export function detachVehicle(sim: Sim, id: string): void {
  const e = sim.bodies.get(id);
  if (!e) return;
  if (e.vehicle) {
    if (e.vehicle.driver) exitVehicle(sim, e.vehicle.driver);
    sim.world.removeVehicleController(e.vehicle.controller);
  }
  if (e.inVehicle) {
    const ve = sim.bodies.get(e.inVehicle);
    if (ve?.vehicle) ve.vehicle.driver = null;
  }
}

// ------------------------------------------------------------------ HELPERS
export const speedKmh = (sim: Sim, vehicleId: string): number =>
  (sim.bodies.get(vehicleId)?.vehicle?.speed ?? 0) * 3.6;

export const driverOf = (sim: Sim, vehicleId: string): string | null =>
  sim.bodies.get(vehicleId)?.vehicle?.driver ?? null;
