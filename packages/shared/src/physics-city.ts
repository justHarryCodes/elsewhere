/**
 * physics-city.ts  -  the generated city (city.ts) as static colliders. Same on server and client.
 */
import { KIND_GROUPS } from "./physics-extra";
import { RULES, type Sim } from "./physics-core";
import type { City } from "./city";

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
    surface(
      "asphalt",
      RAPIER.ColliderDesc.cuboid((x1 - x0) / 2 + margin, 0.5, (z1 - z0) / 2 + margin).setTranslation((x0 + x1) / 2, -0.5, (z0 + z1) / 2),
    );
  }
  for (const b of city.colliders) {
    surface("concrete", RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z));
  }
  sim.bodies.set("city", { body, kind: "static" });
}
