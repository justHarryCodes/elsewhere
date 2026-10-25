/**
 * physics-walker.ts  -  a person on foot: a kinematic capsule moved by Rapier's character controller.
 * It is blocked by walls, cars and props (sliding along them), walks up ramps and slopes, climbs
 * steps and kerbs, falls off edges and lands on whatever is below, and pushes loose crates.
 * Used by the server for every player and by the sandbox for its character.
 */
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Sim, Vec3 } from "./physics-core";
import { HUMAN_METRICS } from "./scale";

export const WALKER = {
  radius: 0.3, // about shoulder half-width
  skin: 0.02, // gap the controller keeps from surfaces
  stepHeight: 0.35, // highest step walked up without jumping (a standard stair is 0.18)
  mass: 80, // kg, for pushing crates
  maxSlope: (45 * Math.PI) / 180, // steeper than this is a wall
  maxFallSpeed: 50, // m/s, terminal velocity of a falling person
};

export interface Walker {
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
  controller.setApplyImpulsesToDynamicBodies(true); // walking into a crate pushes it
  controller.setCharacterMass(WALKER.mass);
  return { body, collider, controller };
}

/**
 * Moves the walker by `delta` (metres; y includes gravity and jumps) from `from`, or from where its
 * body is, and returns where it ends up and whether it is standing on something.
 */
export function moveWalker(walker: Walker, delta: Vec3, from: Vec3 = walker.body.translation()): { position: Vec3; grounded: boolean } {
  walker.body.setTranslation(from, false);
  walker.controller.computeColliderMovement(walker.collider, delta);
  const m = walker.controller.computedMovement();
  const position = { x: from.x + m.x, y: from.y + m.y, z: from.z + m.z };
  walker.body.setNextKinematicTranslation(position);
  return { position, grounded: walker.controller.computedGrounded() };
}

export function removeWalker(sim: Sim, walker: Walker): void {
  sim.world.removeCharacterController(walker.controller);
  sim.world.removeRigidBody(walker.body);
}
