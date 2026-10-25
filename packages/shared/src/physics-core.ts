/**
 * physics-core.ts  -  SHARED module (same file runs on server AND client)
 * Install:  npm i @dimforge/rapier3d-compat
 * Units: meters, kilograms, seconds. +Y is up.
 * Works with Babylon.js or three.js: they only RENDER the positions this returns.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import * as C from "./physics-config";
import { GRAVITY } from "./physics-config";
import type { MaterialName, SurfaceName } from "./physics-config";
import { sizeInUnits, type SizeKey } from "./scale";
import type { VehicleState } from "./physics-vehicle";

// ------------------------------------------------------------------ TYPES
export type Vec3 = { x: number; y: number; z: number };

export type BodyKind =
  | "static"
  | "dynamic"
  | "player" // dynamic capsule driven by impulses
  | "kinplayer" // kinematic capsule with slope/stair controller
  | "projectile"
  | "vehicle"; // dynamic chassis on raycast wheels (physics-vehicle.ts)

export interface PlayerInput {
  x: number; // -1..1 strafe
  z: number; // -1..1 forward
  jump: boolean;
}

export interface Entity {
  body: RAPIER.RigidBody;
  kind: BodyKind;
  key?: SizeKey; // catalog key, if spawned from the catalog
  cd?: number; // drag coefficient
  area?: number; // frontal area, m^2
  half?: number; // half height, used by buoyancy
  density?: number; // kg/m^3, used by buoyancy
  // players
  input?: PlayerInput;
  lastSeq?: number;
  // kinematic player (see physics-extras.ts)
  col?: RAPIER.Collider;
  cc?: RAPIER.KinematicCharacterController;
  vy?: number;
  grounded?: boolean;
  // projectiles
  owner?: string | null;
  expiresTick?: number;
  // triggers
  trigger?: boolean;
  // vehicles (see physics-vehicle.ts)
  vehicle?: VehicleState;
  inVehicle?: string; // id of the vehicle a player is driving
}

export interface Sim {
  RAPIER: typeof RAPIER;
  world: RAPIER.World;
  bodies: Map<string, Entity>;
  tick: number;
  events?: RAPIER.EventQueue; // set by enablePhysicsEvents()
  colliderToId: Map<number, string>;
  fallState: Map<string, { vy: number; grounded: boolean }>;
}

export interface BodySnapshot {
  p: [number, number, number];
  r: [number, number, number, number];
  v: [number, number, number];
  seq: number;
}

export interface Snapshot {
  tick: number;
  bodies: Record<string, BodySnapshot>;
}

// ------------------------------------------------------------------ RULES
// Nothing is hard-coded here: gravity, player size, speeds, jump and step height all
// come from your scale file via physics-config.ts. Only physics-only values live in that config.
export const RULES = {
  GRAVITY, // from your scale file (engine units / s^2, negative = down)
  TICK_RATE: C.TICK_RATE,
  DT: C.DT,
  AIR_DENSITY: C.AIR_DENSITY,
  MAX_SPEED: C.MAX_SPEED,
  PLAYER: {
    radius: C.PLAYER.radius,
    halfHeight: C.PLAYER.halfHeight,
    mass: C.PLAYER.mass,
    walkAccel: C.PLAYER.walkAccel,
    maxWalk: C.PLAYER.runSpeed,
    jumpSpeed: C.PLAYER.jumpSpeed,
    dragCd: C.PLAYER.dragCd,
    area: C.PLAYER.frontalArea,
  },
  MATERIALS: C.SURFACES,
  DENSITY: C.DENSITY,
} as const;

// ------------------------------------------------------------------ WORLD
// RAPIER.init() instantiates the WebAssembly module. Two overlapping calls (e.g. React mounting a
// component twice in development) can each instantiate it, and objects from the first then crash
// with "recursive use of an object". Initialise once and share the promise.
let rapierReady: Promise<void> | undefined;

export async function createWorld(): Promise<Sim> {
  rapierReady ??= RAPIER.init();
  await rapierReady;
  const world = new RAPIER.World({ x: 0, y: RULES.GRAVITY, z: 0 });
  world.timestep = RULES.DT;
  return {
    RAPIER,
    world,
    bodies: new Map(),
    tick: 0,
    colliderToId: new Map(),
    fallState: new Map(),
  };
}

export function addStaticBox(
  sim: Sim,
  id: string,
  pos: Vec3,
  half: Vec3,
  mat: SurfaceName = "concrete",
): RAPIER.RigidBody {
  const { RAPIER, world } = sim;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
  );
  const m = RULES.MATERIALS[mat];
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setFriction(m.friction)
      .setRestitution(m.restitution),
    body,
  );
  sim.bodies.set(id, { body, kind: "static" });
  return body;
}

export function addDynamicBox(
  sim: Sim,
  id: string,
  pos: Vec3,
  half: Vec3,
  mat: SurfaceName = "wood",
  density: MaterialName = "wood",
): RAPIER.RigidBody {
  const { RAPIER, world } = sim;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.01)
      .setAngularDamping(0.05)
      .setCcdEnabled(true),
  );
  const m = RULES.MATERIALS[mat];
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setDensity(RULES.DENSITY[density])
      .setFriction(m.friction)
      .setRestitution(m.restitution),
    body,
  );
  sim.bodies.set(id, {
    body,
    kind: "dynamic",
    cd: 1.05,
    area: 4 * half.x * half.y,
  });
  return body;
}

export function addPlayer(sim: Sim, id: string, pos: Vec3): RAPIER.RigidBody {
  const { RAPIER, world } = sim;
  const P = RULES.PLAYER;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .lockRotations()
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius)
      .setMass(P.mass)
      .setFriction(0.0) // friction 0: movement is driven by us
      .setRestitution(0.0),
    body,
  );
  sim.bodies.set(id, {
    body,
    kind: "player",
    input: { x: 0, z: 0, jump: false },
    lastSeq: 0,
  });
  return body;
}

export interface CatalogBodyOptions {
  dynamic?: boolean;
  surface?: SurfaceName;
  material?: MaterialName;
}

/**
 * Spawn a body sized from your REAL_WORLD_SIZES catalog, e.g. 'vehicle.sedan', 'prop.crate'.
 * length -> X, width -> Z, height -> Y. `pos` is the point on the ground under the object.
 * Mass, drag and frontal area come from physics-config.ts, size comes from your scale file.
 */
export function addCatalogBody(
  sim: Sim,
  id: string,
  key: SizeKey,
  pos: Vec3,
  {
    dynamic = true,
    surface = "metal",
    material = "metal",
  }: CatalogBodyOptions = {},
): RAPIER.RigidBody {
  const { RAPIER, world } = sim;
  const s = sizeInUnits(key);
  const half = { x: s.length / 2, y: s.height / 2, z: s.width / 2 };
  const desc = (
    dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed()
  ).setTranslation(pos.x, pos.y + half.y, pos.z);
  if (dynamic)
    desc.setLinearDamping(0.01).setAngularDamping(0.05).setCcdEnabled(true);
  const body = world.createRigidBody(desc);
  const m = C.SURFACES[surface];
  const col = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
    .setFriction(m.friction)
    .setRestitution(m.restitution);
  if (dynamic) col.setMass(C.massFor(key, material));
  world.createCollider(col, body);
  sim.bodies.set(id, {
    body,
    kind: dynamic ? "dynamic" : "static",
    key,
    cd: C.dragCoefficient(key),
    area: C.frontalArea(key),
    half: half.y,
    density: C.DENSITY[material],
  });
  return body;
}

// ------------------------------------------------------------------ STEP
export function isGrounded(sim: Sim, body: RAPIER.RigidBody): boolean {
  const t = body.translation();
  const P = RULES.PLAYER;
  const ray = new sim.RAPIER.Ray(
    { x: t.x, y: t.y, z: t.z },
    { x: 0, y: -1, z: 0 },
  );
  const hit = sim.world.castRay(
    ray,
    P.halfHeight + P.radius + 0.1,
    true,
    undefined,
    undefined,
    undefined,
    body, // ignore the player's own body
  );
  return !!hit;
}

export function applyPlayerInput(sim: Sim, entry: Entity): void {
  if (!entry.input) return;
  const P = RULES.PLAYER;
  const b = entry.body;
  const v = b.linvel();
  const grounded = isGrounded(sim, b);
  const accel = grounded ? P.walkAccel : P.walkAccel * 0.25; // weak air control
  let { x, z } = entry.input;
  const len = Math.hypot(x, z) || 1;
  x /= Math.max(1, len);
  z /= Math.max(1, len);
  const speed = Math.hypot(v.x, v.z);
  if (speed < P.maxWalk || v.x * x + v.z * z < 0) {
    b.applyImpulse(
      {
        x: x * accel * P.mass * RULES.DT,
        y: 0,
        z: z * accel * P.mass * RULES.DT,
      },
      true,
    );
  }
  if (grounded && !(x || z)) {
    // ground friction when idle
    b.setLinvel({ x: v.x * 0.8, y: v.y, z: v.z * 0.8 }, true);
  }
  if (entry.input.jump && grounded)
    b.setLinvel({ x: v.x, y: P.jumpSpeed, z: v.z }, true);
}

export function applyAirDrag(entry: Entity): void {
  // F = 1/2 * rho * Cd * A * v^2 (opposes velocity). Gives natural terminal velocity.
  const cd = entry.kind === "player" ? RULES.PLAYER.dragCd : (entry.cd ?? 1.05);
  const area = entry.kind === "player" ? RULES.PLAYER.area : (entry.area ?? 1);
  const v = entry.body.linvel();
  const sp = Math.hypot(v.x, v.y, v.z);
  if (sp < 0.01) return;
  const f = 0.5 * RULES.AIR_DENSITY * cd * area * sp; // multiplied by v components below
  entry.body.applyImpulse(
    { x: -f * v.x * RULES.DT, y: -f * v.y * RULES.DT, z: -f * v.z * RULES.DT },
    true,
  );
}

export function clampSpeed(entry: Entity): void {
  const v = entry.body.linvel();
  const sp = Math.hypot(v.x, v.y, v.z);
  if (sp > RULES.MAX_SPEED) {
    const k = RULES.MAX_SPEED / sp;
    entry.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
  }
}

export function step(sim: Sim): void {
  for (const e of sim.bodies.values()) {
    if (e.kind === "player") applyPlayerInput(sim, e);
    // kinematic players move themselves; drag only makes sense for simulated bodies
    if (e.kind !== "static" && e.kind !== "kinplayer") applyAirDrag(e);
  }
  sim.world.step(sim.events); // sim.events is set by enablePhysicsEvents() in physics-extras.ts
  for (const e of sim.bodies.values()) {
    if (e.kind === "dynamic" || e.kind === "player" || e.kind === "vehicle") clampSpeed(e);
  }
  sim.tick++;
}

// ------------------------------------------------------------------ SNAPSHOT (what you send / render)
export function snapshot(sim: Sim): Snapshot {
  const out: Snapshot = { tick: sim.tick, bodies: {} };
  for (const [id, e] of sim.bodies) {
    if (e.kind === "static") continue;
    const p = e.body.translation();
    const r = e.body.rotation();
    const v = e.body.linvel();
    out.bodies[id] = {
      p: [p.x, p.y, p.z],
      r: [r.x, r.y, r.z, r.w],
      v: [v.x, v.y, v.z],
      seq: e.lastSeq ?? 0,
    };
  }
  return out;
}

/* ====================================================================
   SERVER (Node)  -  authoritative. Runs the REAL simulation.
   --------------------------------------------------------------------
   import { WebSocketServer } from 'ws';
   import * as P from './physics-core';
   import * as X from './physics-extras';

   const sim = await P.createWorld();
   P.addStaticBox(sim, 'ground', {x:0,y:-0.5,z:0}, {x:500,y:0.5,z:500}, 'asphalt');
   P.addCatalogBody(sim, 'crate1', 'prop.crate', {x:3,y:5,z:0});
   X.enablePhysicsEvents(sim);

   const wss = new WebSocketServer({ port: 8080 });
   wss.on('connection', ws => {
     const id = crypto.randomUUID();
     P.addPlayer(sim, id, {x:0,y:2,z:0});
     X.indexColliders(sim);
     ws.on('message', m => {                       // client sends INPUTS only, never positions
       const { x, z, jump, seq } = JSON.parse(m.toString());
       const e = sim.bodies.get(id);
       if (!e) return;
       e.input = { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)), jump: !!jump };
       e.lastSeq = seq;
     });
     ws.on('close', () => X.removeEntity(sim, id));
   });

   setInterval(() => X.stepAll(sim, { onFallDamage: (id, dmg) => {} }), 1000 / P.RULES.TICK_RATE);
   setInterval(() => {                                                  // send 20 snapshots/s
     const s = JSON.stringify(P.snapshot(sim));
     wss.clients.forEach(c => c.send(s));
   }, 50);

   ====================================================================
   CLIENT (browser)  -  Babylon.js or three.js only draws; server decides.
   --------------------------------------------------------------------
   - Run the SAME physics-core.ts locally ONLY for your own player (prediction):
       each frame: send input {x,z,jump,seq++}, apply it locally, step(sim).
   - On each server snapshot:
       * other players/crates: store snapshots, render ~100 ms in the past and
         interpolate between the two nearest (lerp position, slerp rotation).
       * your player: snap to server state for tick `seq`, then re-apply all
         inputs not yet acknowledged (reconciliation). Small error => blend, big => snap.
   - three.js:  mesh.position.set(...p); mesh.quaternion.set(...r);
   - Babylon:   mesh.position.set(...p); mesh.rotationQuaternion = new BABYLON.Quaternion(...r);
   - Purely cosmetic physics (debris, particles, cloth, ragdoll after death) can run
     client-only with no networking.
   ==================================================================== */
