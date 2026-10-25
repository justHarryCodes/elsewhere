/**
 * physics-walker.ts  -  a person on foot: a kinematic capsule moved by Rapier's character controller.
 * It is blocked by walls, cars and props (sliding along them), walks up ramps and slopes, climbs
 * steps and kerbs, falls off edges and lands on whatever is below, and pushes loose crates (with a
 * person's strength) but never vehicles: a parked car doesn't budge when you walk into it.
 * Used by the server for every player and by the sandbox for its character.
 */
import type RAPIER from "@dimforge/rapier3d-compat";
import { RULES, type Sim, type Vec3 } from "./physics-core";
import { HUMAN_METRICS } from "./scale";

export const WALKER = {
  radius: 0.3, // about shoulder half-width
  skin: 0.02, // gap the controller keeps from surfaces
  stepHeight: 0.35, // highest step walked up without jumping (a standard stair is 0.18)
  mass: 80, // kg, for pushing crates
  maxSlope: (45 * Math.PI) / 180, // steeper than this is a wall
  maxFallSpeed: 50, // m/s, terminal velocity of a falling person
  pushForce: 400, // N, about what a person leaning into a crate manages
};

export interface Walker {
  sim: Sim;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
}

/** A capsule the height of a person with its feet at the body's origin (like the drawn character). */
export function createWalker(sim: Sim, at: Vec3): Walker {
  const { RAPIER, world } = sim;
  const radius = WALKER.radius;
  const halfHeight = HUMAN_METRICS.height / 2 - radius;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y, at.z));
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(halfHeight, radius).setTranslation(0, halfHeight + radius, 0),
    body,
  );
  const controller = world.createCharacterController(WALKER.skin);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.setSlideEnabled(true);
  controller.setMaxSlopeClimbAngle(WALKER.maxSlope);
  controller.setMinSlopeSlideAngle(WALKER.maxSlope + (5 * Math.PI) / 180);
  controller.enableAutostep(WALKER.stepHeight, 0.15, false); // stairs and kerbs, not crates
  controller.enableSnapToGround(0.3); // stay on the ground walking down slopes and steps
  // Pushing is done in moveWalker instead, so vehicles can be left out of it.
  controller.setApplyImpulsesToDynamicBodies(false);
  return { sim, body, collider, controller };
}

/**
 * Moves the walker by `delta` (metres over `dt` seconds; y includes gravity and jumps) from `from`,
 * or from where its body is, and returns where it ends up and whether it is standing on something.
 */
export function moveWalker(
  walker: Walker,
  delta: Vec3,
  from: Vec3 = walker.body.translation(),
  dt: number = RULES.DT,
): { position: Vec3; grounded: boolean } {
  walker.body.setTranslation(from, false);
  walker.controller.computeColliderMovement(walker.collider, delta);
  const m = walker.controller.computedMovement();
  const position = { x: from.x + m.x, y: from.y + m.y, z: from.z + m.z };
  walker.body.setNextKinematicTranslation(position);
  pushBodies(walker, delta, dt);
  return { position, grounded: walker.controller.computedGrounded() };
}

/**
 * Leans into whatever loose body the walker walked into: it is pushed toward the walker's walking
 * speed, with no more than a person's strength, so a crate slides and a heavy one doesn't. Vehicles
 * are never pushed.
 */
function pushBodies(walker: Walker, delta: Vec3, dt: number) {
  const { controller, sim } = walker;
  const count = controller.numComputedCollisions();
  if (count === 0 || dt <= 0) return;
  const vx = delta.x / dt;
  const vz = delta.z / dt;
  const pushed = new Set<number>();
  for (let i = 0; i < count; i++) {
    const hit = controller.computedCollision(i);
    const body = hit?.collider?.parent();
    if (!hit || !body || !body.isDynamic() || pushed.has(body.handle) || isVehicle(sim, body)) continue;
    // Horizontal direction from the walker into the body (the character's outward contact normal).
    const nx = hit.normal2.x;
    const nz = hit.normal2.z;
    const length = Math.hypot(nx, nz);
    if (length < 1e-3) continue;
    const dx = nx / length;
    const dz = nz / length;
    const along = vx * dx + vz * dz; // how hard we're walking into it
    if (along <= 0) continue;
    const v = body.linvel();
    const gap = along - (v.x * dx + v.z * dz);
    if (gap <= 0) continue;
    const impulse = Math.min(body.mass() * gap, WALKER.pushForce * dt);
    body.applyImpulseAtPoint({ x: dx * impulse, y: 0, z: dz * impulse }, hit.witness1, true); // at the contact on the body
    pushed.add(body.handle);
  }
}

function isVehicle(sim: Sim, body: RAPIER.RigidBody): boolean {
  for (const entity of sim.bodies.values()) if (entity.kind === "vehicle" && entity.body.handle === body.handle) return true;
  return false;
}

export function removeWalker(sim: Sim, walker: Walker): void {
  sim.world.removeCharacterController(walker.controller);
  sim.world.removeRigidBody(walker.body);
}
