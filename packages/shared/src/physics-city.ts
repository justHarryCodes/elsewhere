/**
 * physics-city.ts  -  the generated city (city.ts) as static colliders. Same on server and client.
 */
import { KIND_GROUPS } from "./physics-extra";
import { RULES, type Sim } from "./physics-core";
import type { City } from "./city";

const GROUND_TILE = 64; // metres

/**
 * Flat ground (top at y = 0) over a rectangle, as a grid of 64 m tiles. One huge box would do, but
 * on a box a kilometre across Rapier's character controller loses precision and lets walkers sink
 * several centimetres into it; on tiles this size they stand where they should, seams and all.
 */
export function addGroundTiles(sim: Sim, x0: number, z0: number, x1: number, z1: number): void {
  const { RAPIER, world } = sim;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const m = RULES.MATERIALS.asphalt;
  const half = GROUND_TILE / 2;
  for (let x = x0; x < x1; x += GROUND_TILE) {
    for (let z = z0; z < z1; z += GROUND_TILE) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, 0.5, half)
          .setTranslation(x + half, -0.5, z + half)
          .setFriction(m.friction)
          .setRestitution(m.restitution)
          .setCollisionGroups(KIND_GROUPS.static),
        body,
      );
    }
  }
}

/**
 * Adds every lot, sidewalk, building and solid prop of `city` to the world as one fixed body with a
 * box collider each, plus flat ground under everything (the road surface, y = 0) unless `ground` is
 * false because the world already has its own.
 */
export function addCityColliders(sim: Sim, city: City, { ground = true } = {}): void {
  const { RAPIER, world } = sim;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const surface = (name: keyof typeof RULES.MATERIALS, desc: ReturnType<typeof RAPIER.ColliderDesc.cuboid>) => {
    const m = RULES.MATERIALS[name];
    world.createCollider(desc.setFriction(m.friction).setRestitution(m.restitution).setCollisionGroups(KIND_GROUPS.static), body);
  };
  if (ground) {
    const { x0, z0, x1, z1 } = city.bounds;
    const margin = 500;
    addGroundTiles(sim, x0 - margin, z0 - margin, x1 + margin, z1 + margin);
  }
  for (const b of city.colliders) {
    surface("concrete", RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z));
  }
  sim.bodies.set("city", { body, kind: "static" });
}
