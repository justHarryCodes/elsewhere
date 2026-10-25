/**
 * physics-extras.ts  -  collision layers, events, damage, projectiles, explosions, water, slopes.
 * Shared like physics-core.ts. On the SERVER these decide gameplay results (damage, hits, triggers).
 * On the CLIENT use only for prediction / cosmetic effects (debris, sparks).
 */
import type RAPIER from "@dimforge/rapier3d-compat";
import { RULES, step, isGrounded, type Sim, type Vec3 } from "./physics-core";
import { ALL_LAYERS as ALL, DAMAGE, LAYER, PLAYER, WATER_DENSITY, groups } from "./physics-config";
import { HUMAN_METRICS } from "./scale";
import { detachVehicle, stepVehicles } from "./physics-vehicle";

// DAMAGE rules live in physics-config.ts (fall height is derived from your GRAVITY).
// Collision layers live there too, so physics-vehicle.ts can use them without a circular import.
export { DAMAGE, LAYER, groups };

// ------------------------------------------------------------------ COLLISION LAYERS
export const KIND_GROUPS: Record<string, number> = {
  static: groups(LAYER.STATIC, ALL),
  dynamic: groups(LAYER.DYNAMIC, ALL),
  player: groups(LAYER.PLAYER, ALL),
  kinplayer: groups(LAYER.PLAYER, ALL),
  vehicle: groups(LAYER.DYNAMIC, ALL),
  projectile: groups(
    LAYER.PROJECTILE,
    LAYER.STATIC | LAYER.DYNAMIC | LAYER.PLAYER,
  ),
  debris: groups(LAYER.DEBRIS, LAYER.STATIC), // cheap: debris ignores players and other debris
};

// ------------------------------------------------------------------ HANDLERS
export interface PhysicsHandlers {
  onCollisionStart?(a: string, b: string): void;
  onTriggerEnter?(trigger: string, other: string): void;
  onTriggerExit?(trigger: string, other: string): void;
  onImpact?(a: string, b: string, force: number, damage: number): void;
  onFallDamage?(id: string, damage: number): void;
}

// ------------------------------------------------------------------ SETUP
/** Call once after createWorld() and adding the initial bodies. */
export function enablePhysicsEvents(sim: Sim): void {
  sim.events = new sim.RAPIER.EventQueue(true);
  indexColliders(sim);
}

/** Call again after adding new bodies. Applies layers and turns on collision events. */
export function indexColliders(sim: Sim): void {
  const AE = sim.RAPIER.ActiveEvents;
  for (const [id, e] of sim.bodies) {
    for (let i = 0; i < e.body.numColliders(); i++) {
      const c = e.body.collider(i);
      if (sim.colliderToId.has(c.handle)) continue;
      sim.colliderToId.set(c.handle, id);
      if (!c.isSensor())
        c.setCollisionGroups(KIND_GROUPS[e.kind] ?? KIND_GROUPS.dynamic);
      c.setActiveEvents(AE.COLLISION_EVENTS | AE.CONTACT_FORCE_EVENTS);
      c.setContactForceEventThreshold(DAMAGE.IMPACT_FORCE_MIN);
    }
  }
}

// ------------------------------------------------------------------ TRIGGERS (sensors)
/** Invisible zone that fires onTriggerEnter/Exit (checkpoints, pickups, kill zones, water volumes). */
export function addTrigger(
  sim: Sim,
  id: string,
  pos: Vec3,
  half: Vec3,
): RAPIER.Collider {
  const { RAPIER, world } = sim;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setSensor(true)
      .setCollisionGroups(groups(LAYER.TRIGGER, LAYER.PLAYER | LAYER.DYNAMIC)),
    body,
  );
  sim.bodies.set(id, { body, kind: "static", trigger: true });
  indexColliders(sim);
  return col;
}

// ------------------------------------------------------------------ EVENTS
function processEvents(sim: Sim, h: PhysicsHandlers): void {
  if (!sim.events) return;
  sim.events.drainCollisionEvents((h1, h2, started) => {
    const a = sim.colliderToId.get(h1);
    const b = sim.colliderToId.get(h2);
    if (a === undefined || b === undefined) return;
    const sensor1 = sim.world.getCollider(h1)?.isSensor() ?? false;
    const sensor2 = sim.world.getCollider(h2)?.isSensor() ?? false;
    if (sensor1 || sensor2) {
      // report as (trigger, other)
      const [trigger, other] = sensor1 ? [a, b] : [b, a];
      if (started) h.onTriggerEnter?.(trigger, other);
      else h.onTriggerExit?.(trigger, other);
    } else if (started) {
      h.onCollisionStart?.(a, b);
    }
  });
  sim.events.drainContactForceEvents((ev) => {
    const a = sim.colliderToId.get(ev.collider1());
    const b = sim.colliderToId.get(ev.collider2());
    if (a === undefined || b === undefined) return;
    const force = ev.totalForceMagnitude();
    const dmg = Math.max(
      0,
      (force - DAMAGE.IMPACT_FORCE_MIN) * DAMAGE.IMPACT_DMG_PER_N,
    );
    if (dmg > 0) h.onImpact?.(a, b, force, dmg);
  });
}

// ------------------------------------------------------------------ FALL DAMAGE (gravity -> landing speed)
function updateFallDamage(sim: Sim, h: PhysicsHandlers): void {
  for (const [id, e] of sim.bodies) {
    if (e.kind !== "player" && e.kind !== "kinplayer") continue;
    if (e.inVehicle) continue; // seated: the vehicle carries them
    const grounded =
      e.kind === "player" ? isGrounded(sim, e.body) : (e.grounded ?? false);
    const st = sim.fallState.get(id) ?? { vy: 0, grounded: true };
    if (grounded && !st.grounded && st.vy < -DAMAGE.FALL_SAFE_SPEED) {
      h.onFallDamage?.(
        id,
        (-st.vy - DAMAGE.FALL_SAFE_SPEED) * DAMAGE.FALL_DMG_PER_MS,
      );
    }
    st.vy = e.kind === "player" ? e.body.linvel().y : (e.vy ?? 0);
    st.grounded = grounded;
    sim.fallState.set(id, st);
  }
}

// ------------------------------------------------------------------ PROJECTILES (gravity + drag + CCD)
export interface ProjectileOptions {
  speed?: number; // m/s
  mass?: number; // kg
  radius?: number; // m
  cd?: number;
  lifetime?: number; // seconds
  owner?: string | null;
}

export function fireProjectile(
  sim: Sim,
  id: string,
  origin: Vec3,
  dir: Vec3,
  o: ProjectileOptions = {},
): void {
  const { RAPIER, world } = sim;
  const {
    speed = 400,
    mass = 0.01,
    radius = 0.005,
    cd = 0.3,
    lifetime = 5,
    owner = null,
  } = o;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(origin.x, origin.y, origin.z)
      .setLinvel(
        (dir.x / len) * speed,
        (dir.y / len) * speed,
        (dir.z / len) * speed,
      )
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(radius).setMass(mass).setRestitution(0.1),
    body,
  );
  sim.bodies.set(id, {
    body,
    kind: "projectile",
    cd,
    area: Math.PI * radius * radius,
    owner,
    expiresTick: sim.tick + lifetime * RULES.TICK_RATE,
  });
  indexColliders(sim);
}

/** Kinetic energy of a projectile: 1/2 m v^2 (use for damage on hit). */
export function projectileDamage(sim: Sim, id: string): number {
  const e = sim.bodies.get(id);
  if (!e) return 0;
  const v = e.body.linvel();
  return (
    0.5 *
    e.body.mass() *
    (v.x * v.x + v.y * v.y + v.z * v.z) *
    DAMAGE.PROJECTILE_DMG_PER_JOULE
  );
}

export interface HitscanResult {
  id: string | undefined;
  point: Vec3;
  distance: number;
}

/** Instant bullet (no travel time): ray cast. Needs rapier >= 0.12 (`timeOfImpact`). */
export function hitscan(
  sim: Sim,
  origin: Vec3,
  dir: Vec3,
  maxDist = 500,
  ignoreBody?: RAPIER.RigidBody,
): HitscanResult | null {
  const ray = new sim.RAPIER.Ray(origin, dir);
  const hit = sim.world.castRay(
    ray,
    maxDist,
    true,
    undefined,
    undefined,
    undefined,
    ignoreBody,
  );
  if (!hit) return null;
  const distance = hit.timeOfImpact;
  return {
    id: sim.colliderToId.get(hit.collider.handle),
    point: ray.pointAt(distance),
    distance,
  };
}

function cleanupProjectiles(sim: Sim): void {
  for (const [id, e] of [...sim.bodies]) {
    if (
      e.kind === "projectile" &&
      e.expiresTick !== undefined &&
      sim.tick > e.expiresTick
    ) {
      removeEntity(sim, id);
    }
  }
}

export function removeEntity(sim: Sim, id: string): void {
  const e = sim.bodies.get(id);
  if (!e) return;
  detachVehicle(sim, id);
  for (let i = 0; i < e.body.numColliders(); i++) {
    sim.colliderToId.delete(e.body.collider(i).handle);
  }
  sim.world.removeRigidBody(e.body);
  sim.bodies.delete(id);
  sim.fallState.delete(id);
}

// ------------------------------------------------------------------ EXPLOSIONS
export interface ExplosionOptions {
  radius?: number; // m
  impulse?: number; // N*s at the centre
  maxDamage?: number;
}
export interface Victim {
  id: string;
  damage: number;
}

/** Radial impulse that falls off with distance squared. Returns who was hit so the server can apply damage. */
export function explode(
  sim: Sim,
  c: Vec3,
  { radius = 8, impulse = 3000, maxDamage = 100 }: ExplosionOptions = {},
): Victim[] {
  const victims: Victim[] = [];
  for (const [id, e] of sim.bodies) {
    if (e.kind === "static" || e.kind === "kinplayer") continue; // kinematic bodies ignore impulses
    const t = e.body.translation();
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > radius) continue;
    const f = (1 - d / radius) ** 2;
    const n =
      d > 0.01 ? { x: dx / d, y: dy / d, z: dz / d } : { x: 0, y: 1, z: 0 };
    e.body.applyImpulse(
      {
        x: n.x * impulse * f,
        y: (n.y + 0.3) * impulse * f,
        z: n.z * impulse * f,
      },
      true,
    );
    victims.push({ id, damage: maxDamage * f });
  }
  return victims;
}

// ------------------------------------------------------------------ WATER / BUOYANCY (Archimedes)
export function applyBuoyancy(
  sim: Sim,
  waterY = 0,
  rhoWater: number = WATER_DENSITY,
): void {
  for (const e of sim.bodies.values()) {
    if (
      e.kind === "static" ||
      e.kind === "projectile" ||
      e.kind === "kinplayer"
    )
      continue;
    const y = e.body.translation().y;
    const h = e.half ?? (e.kind === "player" ? HUMAN_METRICS.height / 2 : 0.5);
    const frac = Math.min(1, Math.max(0, (waterY - (y - h)) / (2 * h)));
    if (frac <= 0) {
      e.body.setLinearDamping(0.01);
      continue;
    }
    const density = e.density ?? (e.kind === "player" ? PLAYER.density : 700);
    const volume = e.body.mass() / density;
    const up = rhoWater * -RULES.GRAVITY * volume * frac; // F = rho * g * V_submerged
    e.body.applyImpulse({ x: 0, y: up * RULES.DT, z: 0 }, true);
    e.body.setLinearDamping(0.01 + 3 * frac); // water resistance
  }
}

// ------------------------------------------------------------------ SLOPES & STAIRS (kinematic character controller)
export function addKinematicPlayer(sim: Sim, id: string, pos: Vec3): void {
  const { RAPIER, world } = sim;
  const P = RULES.PLAYER;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      pos.x,
      pos.y,
      pos.z,
    ),
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius),
    body,
  );
  const cc = world.createCharacterController(0.01);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180); // walk up slopes to 50 degrees
  cc.setMinSlopeSlideAngle((35 * Math.PI) / 180); // slide down steeper than 35
  cc.enableAutostep(PLAYER.autostepHeight, PLAYER.autostepMinWidth, false); // HUMAN_METRICS.stepHeight
  cc.enableSnapToGround(0.3); // stay glued going downhill
  cc.setApplyImpulsesToDynamicBodies(true); // pushes crates
  sim.bodies.set(id, {
    body,
    kind: "kinplayer",
    col,
    cc,
    vy: 0,
    grounded: false,
    input: { x: 0, z: 0, jump: false },
    lastSeq: 0,
  });
  indexColliders(sim);
}

function stepKinematicPlayers(sim: Sim): void {
  const P = RULES.PLAYER;
  for (const e of sim.bodies.values()) {
    if (e.kind !== "kinplayer" || !e.cc || !e.col || !e.input) continue;
    let vy = e.vy ?? 0;
    vy += RULES.GRAVITY * RULES.DT; // gravity
    if (e.grounded && e.input.jump) vy = P.jumpSpeed;
    const len = Math.max(1, Math.hypot(e.input.x, e.input.z));
    const sp = P.maxWalk * (e.grounded ? 1 : 0.6);
    e.cc.computeColliderMovement(e.col, {
      x: (e.input.x / len) * sp * RULES.DT,
      y: vy * RULES.DT,
      z: (e.input.z / len) * sp * RULES.DT,
    });
    const m = e.cc.computedMovement();
    const t = e.body.translation();
    e.body.setNextKinematicTranslation({
      x: t.x + m.x,
      y: t.y + m.y,
      z: t.z + m.z,
    });
    e.grounded = e.cc.computedGrounded();
    if (e.grounded && vy < 0) vy = 0;
    e.vy = vy;
  }
}

// ------------------------------------------------------------------ ONE CALL PER TICK
export interface StepOptions {
  /** Water surface height. Omit for no water. */
  waterY?: number;
}

export function stepAll(
  sim: Sim,
  handlers: PhysicsHandlers = {},
  { waterY }: StepOptions = {},
): void {
  stepKinematicPlayers(sim);
  stepVehicles(sim); // engine, brakes, steering and suspension rays, before the solver
  if (waterY !== undefined) applyBuoyancy(sim, waterY);
  step(sim); // gravity, drag, player input, solver, speed caps
  processEvents(sim, handlers);
  updateFallDamage(sim, handlers);
  cleanupProjectiles(sim);
}
