import {
  Color3,
  InstancedMesh,
  type Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  type ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import {
  HUMAN_METRICS,
  VehicleLights,
  lerpVehicleSnapshot,
  vehicleFeatures,
  vehicleGeometry,
  type HeadlightMode,
  type PaintFinish,
  type VehicleModelKey,
  type VehicleSnapshot,
  type City,
} from '@game/shared';
import {
  RULES,
  type Sim,
  type VehicleInput,
  addCatalogBody,
  addCityColliders,
  addStaticBox,
  addVehicle,
  createWalker,
  moveWalker,
  type Walker,
  createWorld,
  enablePhysicsEvents,
  indexColliders,
  removeEntity,
  setHeadlights,
  setSiren,
  stepAll,
  vehicleSnapshot,
} from '@game/shared/physics';
import { VehicleLibrary, type VehicleVisual } from '../game/babylon/vehicles';

const CAR = 'car';
const MAX_STEPS_PER_FRAME = 5; // never spiral: drop time rather than run 10 steps after a stall
const CRATE = { x: 12, z: 18, size: 1 };

export interface StaticBlock {
  x: number;
  z: number;
  width: number; // along X
  depth: number; // along Z
  height: number;
}

export interface VehicleStats {
  model: VehicleModelKey;
  /** #rrggbb, or "" while the car shows the model's own colour. */
  paint: string;
  finish: PaintFinish;
  features: ReturnType<typeof vehicleFeatures>;
  speedKmh: number;
  gear: 'P' | 'R' | 'N' | 'D';
  headlights: HeadlightMode;
  siren: boolean;
  hasSiren: boolean;
  braking: boolean;
}

/**
 * The sandbox's driving world: a Rapier simulation with flat ground, the reference boxes as walls,
 * a stack of crates to knock over, a ramp, and one drivable car drawn by VehicleVisual.
 */
export class SandboxVehicle {
  readonly input: VehicleInput = { throttle: 0, steer: 0, handbrake: false };
  /** Nobody at the wheel: the parking brake holds the car. */
  parked = true;
  private visual?: VehicleVisual;
  private snapshot?: VehicleSnapshot;
  private previous?: VehicleSnapshot;
  private accumulator = 0;
  private model: VehicleModelKey = 'policeCar';
  private paint = '';
  private finish: PaintFinish = 'metallic';
  private headlights: HeadlightMode = 'off';
  private siren = false;
  private loading?: Promise<void>;
  private readonly crates: { id: string; mesh: Mesh }[] = [];

  private constructor(
    private readonly scene: Scene,
    private readonly shadows: ShadowGenerator,
    private readonly sim: Sim,
    private readonly library: VehicleLibrary,
  ) {}

  static async create(scene: Scene, shadows: ShadowGenerator, blocks: StaticBlock[], city?: City): Promise<SandboxVehicle> {
    const sim = await createWorld();
    addStaticBox(sim, 'ground', { x: 0, y: -0.5, z: 0 }, { x: 500, y: 0.5, z: 500 }, 'asphalt');
    if (city) addCityColliders(sim, city);
    blocks.forEach((b, i) =>
      addStaticBox(sim, `block-${i}`, { x: b.x, y: b.height / 2, z: b.z }, { x: b.width / 2, y: b.height / 2, z: b.depth / 2 }),
    );
    const sandbox = new SandboxVehicle(scene, shadows, sim, new VehicleLibrary(scene));
    sandbox.addRamp();
    sandbox.addCrates();
    sandbox.addStairs();
    sandbox.addWalker();
    enablePhysicsEvents(sim);
    await sandbox.spawn({ x: -4, z: 6 }, 0);
    return sandbox;
  }

  get root() {
    return this.visual?.root;
  }

  // ------------------------------------------------------------------ the walking character
  // The character is drawn by Babylon but moves through a capsule in this physics world, driven by
  // Rapier's character controller: it is blocked by cars, walls and crates (sliding along them),
  // walks up ramps and slopes, climbs steps, falls off edges and lands on whatever is below.

  private walker?: Walker;

  private addWalker() {
    this.walker = createWalker(this.sim, { x: 0, y: 0, z: 0 });
  }

  /**
   * Moves the character by `delta` (metres; y includes gravity and jumps) from `from`, and returns
   * where it ends up and whether it is standing on something.
   */
  moveWalker(from: Vector3, delta: Vector3, dt: number): { position: Vector3; grounded: boolean } {
    if (!this.walker) {
      const to = from.add(delta);
      to.y = Math.max(0, to.y);
      return { position: to, grounded: to.y <= 0 };
    }
    const { position, grounded } = moveWalker(this.walker, delta, from, dt);
    return { position: new Vector3(position.x, position.y, position.z), grounded };
  }

  /**
   * How far a ray from `from` along the unit vector `dir` gets before hitting something that doesn't
   * move (buildings, walls, the ground), up to `max` metres; undefined when nothing is in the way.
   */
  castStatic(from: Vector3, dir: Vector3, max: number): number | undefined {
    const { RAPIER, world } = this.sim;
    const hit = world.castRay(new RAPIER.Ray(from, dir), max, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit?.timeOfImpact;
  }

  /** Keeps the capsule where the character is (after a teleport). */
  placeWalker(at: Vector3) {
    this.walker?.body.setTranslation({ x: at.x, y: at.y, z: at.z }, false);
  }

  /** The capsule is off while driving (the driver rides inside the car). */
  setWalkerEnabled(on: boolean) {
    this.walker?.collider.setEnabled(on);
  }

  get halfLength() {
    return this.visual?.geometry.halfLength ?? 2;
  }

  get halfWidth() {
    return this.visual?.geometry.halfWidth ?? 1;
  }

  /** Advances physics in fixed steps and redraws the car and crates. */
  update(dt: number) {
    this.accumulator = Math.min(this.accumulator + dt, RULES.DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= RULES.DT) {
      const car = this.sim.bodies.get(CAR)?.vehicle;
      if (car) car.input = this.parked ? null : this.input;
      this.previous = this.snapshot;
      stepAll(this.sim);
      this.snapshot = vehicleSnapshot(this.sim, CAR) ?? undefined;
      this.accumulator -= RULES.DT;
    }
    // Physics moves in 1/60 s steps while the screen refreshes on its own clock; draw the pose part
    // way between the last two steps so motion is smooth instead of stepping.
    if (this.snapshot) {
      const drawn = this.previous ? lerpVehicleSnapshot(this.previous, this.snapshot, this.accumulator / RULES.DT) : this.snapshot;
      this.visual?.apply(drawn, dt);
    }

    for (const { id, mesh } of this.crates) {
      const body = this.sim.bodies.get(id)?.body;
      if (!body) continue;
      const p = body.translation();
      const q = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
    }
  }

  /** Horizontal distance from a point to the car's outline, metres (0 when touching or inside). */
  distanceTo(point: Vector3): number {
    const s = this.snapshot;
    if (!s) return Infinity;
    const yaw = this.heading;
    const dx = point.x - s.x;
    const dz = point.z - s.z;
    const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    return Math.hypot(Math.max(0, Math.abs(localX) - this.halfWidth), Math.max(0, Math.abs(localZ) - this.halfLength));
  }

  /** Heading around Y, radians, 0 faces +Z (like players). */
  get heading(): number {
    const s = this.snapshot;
    if (!s) return 0;
    return Math.atan2(2 * (s.qw * s.qy + s.qx * s.qz), 1 - 2 * (s.qy * s.qy + s.qx * s.qx));
  }

  /** Driver's seat (hips), in the car's own frame: +Z forward, +X left, y up from the ground. */
  get seat() {
    return vehicleGeometry(this.model).seat;
  }

  /** Roof line above the ground (top of the windows), metres. */
  get roofTop() {
    return vehicleGeometry(this.model).roofTop;
  }

  /**
   * Whether the driver is drawn while driving. The low-poly cars have no interior or seat, so the
   * driver is hidden once in (as in a car with tinted windows); a rider on a bike would show.
   */
  get driverVisible() {
    return vehicleGeometry(this.model).seat.x === 0;
  }

  /** Where the driver stands after getting out: beside the driver's (left) door. */
  exitPoint(): { x: number; z: number; heading: number } {
    const s = this.snapshot!;
    const yaw = this.heading;
    const side = this.halfWidth + 0.6;
    const along = this.seat.z; // level with the seat, so the driver steps straight in
    return {
      x: s.x + side * Math.cos(yaw) + along * Math.sin(yaw),
      z: s.z - side * Math.sin(yaw) + along * Math.cos(yaw),
      heading: yaw,
    };
  }

  async setModel(model: VehicleModelKey) {
    if (model === this.model) return;
    this.model = model;
    this.paint = '';
    const s = this.snapshot;
    await this.spawn(s ? { x: s.x, z: s.z } : { x: -4, z: 6 }, this.heading);
  }

  setPaint(hex: string) {
    this.paint = hex;
    const car = this.sim.bodies.get(CAR)?.vehicle;
    if (car) car.paint = hex;
  }

  setFinish(finish: PaintFinish) {
    this.finish = finish;
    const car = this.sim.bodies.get(CAR)?.vehicle;
    if (car) car.finish = finish;
  }

  setHeadlights(mode: HeadlightMode) {
    this.headlights = mode;
    setHeadlights(this.sim, CAR, mode);
  }

  cycleHeadlights() {
    this.setHeadlights(this.headlights === 'off' ? 'low' : this.headlights === 'low' ? 'high' : 'off');
  }

  setSiren(on: boolean) {
    this.siren = on;
    setSiren(this.sim, CAR, on);
  }

  /** Puts the car back on its wheels where it is (or at `at`), facing the same way (or `at.heading`). */
  async respawn(at?: { x: number; z: number; heading: number }) {
    const s = this.snapshot;
    if (at) await this.spawn(at, at.heading);
    else await this.spawn(s ? { x: s.x, z: s.z } : { x: -4, z: 6 }, this.heading);
  }

  getStats(driving: boolean): VehicleStats {
    const s = this.snapshot;
    const speed = s?.speed ?? 0;
    const reversing = !!s && (s.lights & VehicleLights.Reverse) !== 0;
    const features = vehicleFeatures(this.model);
    const hasSiren = features.siren;
    return {
      model: this.model,
      paint: this.paint,
      finish: this.finish,
      features,
      speedKmh: Math.abs(speed) * 3.6,
      gear: !driving ? 'P' : reversing || speed < -0.5 ? 'R' : this.input.throttle > 0 || speed > 0.5 ? 'D' : 'N',
      headlights: this.headlights,
      siren: this.siren && hasSiren,
      hasSiren,
      braking: !!s && (s.lights & VehicleLights.Brake) !== 0,
    };
  }

  dispose() {
    this.visual?.dispose();
    this.library.dispose();
    this.sim.world.free();
  }

  private spawn(at: { x: number; z: number }, yaw: number): Promise<void> {
    const run = async () => {
      const visual = await this.library.createVehicle(this.model, CAR);
      if (this.sim.bodies.has(CAR)) removeEntity(this.sim, CAR);
      addVehicle(this.sim, CAR, this.model, { x: at.x, y: 0, z: at.z }, { yaw, paint: this.paint, finish: this.finish });
      setHeadlights(this.sim, CAR, this.headlights);
      setSiren(this.sim, CAR, this.siren);
      indexColliders(this.sim);
      this.visual?.dispose();
      this.visual = visual;
      visual.enableBeams(); // the player's car lights the road
      for (const mesh of visual.meshes) {
        this.shadows.addShadowCaster(mesh);
        if (!(mesh instanceof InstancedMesh)) mesh.receiveShadows = true; // instances follow their source
      }
      this.snapshot = vehicleSnapshot(this.sim, CAR) ?? undefined;
      this.previous = undefined;
      if (this.snapshot) visual.apply(this.snapshot, 0);
    };
    // Serialise spawns so quick model clicks can't leave two cars behind.
    this.loading = (this.loading ?? Promise.resolve()).then(run, run);
    return this.loading;
  }

  private addRamp() {
    // 6 m long, rising to 0.9 m: a 1-in-6.7 slope, steep enough to get some air at speed.
    const { RAPIER, world } = this.sim;
    const length = 6;
    const rise = 0.9;
    const angle = Math.atan2(rise, length);
    const half = { x: 2, y: 0.1, z: length / 2 / Math.cos(angle) };
    const pos = { x: -14, y: rise / 2 - 0.05, z: 20 };
    const rotation = { x: -Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z).setRotation(rotation));
    world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setFriction(0.8), body);
    this.sim.bodies.set('ramp', { body, kind: 'static' });

    const mesh = MeshBuilder.CreateBox('ramp', { width: half.x * 2, height: half.y * 2, depth: half.z * 2 }, this.scene);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.rotationQuaternion = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const material = new StandardMaterial('ramp-mat', this.scene);
    material.diffuseColor = new Color3(0.85, 0.55, 0.2);
    mesh.material = material;
    mesh.receiveShadows = true;
    this.shadows.addShadowCaster(mesh);
  }

  /** Ten 18 cm steps up to a 1.8 m platform, beside the ramp: real stair dimensions to walk on. */
  private addStairs() {
    const material = new StandardMaterial('stairs-mat', this.scene);
    material.diffuseColor = new Color3(0.62, 0.62, 0.66);
    const rise = HUMAN_METRICS.stepHeight;
    const run = 0.3;
    const width = 2;
    const x = -22;
    const z0 = 14;
    const box = (id: string, cx: number, cy: number, cz: number, w: number, h: number, d: number) => {
      addStaticBox(this.sim, id, { x: cx, y: cy, z: cz }, { x: w / 2, y: h / 2, z: d / 2 }, 'concrete');
      const mesh = MeshBuilder.CreateBox(id, { width: w, height: h, depth: d }, this.scene);
      mesh.position.set(cx, cy, cz);
      mesh.material = material;
      mesh.receiveShadows = true;
      this.shadows.addShadowCaster(mesh);
    };
    for (let i = 0; i < 10; i++) {
      const h = rise * (i + 1);
      box(`step-${i}`, x, h / 2, z0 + i * run + run / 2, width, h, run);
    }
    const top = rise * 10;
    box('platform', x, top / 2, z0 + 10 * run + 2, width + 2, top, 4);
  }

  private addCrates() {
    const material = new StandardMaterial('crate-mat', this.scene);
    material.diffuseColor = new Color3(0.6, 0.42, 0.24);
    // A 3-2-1 pyramid of 1 m, 40 kg crates.
    const rows = [3, 2, 1];
    rows.forEach((count, row) => {
      for (let i = 0; i < count; i++) {
        const id = `crate-${row}-${i}`;
        const x = CRATE.x + (i - (count - 1) / 2) * (CRATE.size + 0.02);
        addCatalogBody(this.sim, id, 'prop.crate', { x, y: row * CRATE.size, z: CRATE.z }, { surface: 'wood', material: 'wood' });
        const mesh = MeshBuilder.CreateBox(id, { size: CRATE.size }, this.scene);
        mesh.rotationQuaternion = Quaternion.Identity();
        mesh.material = material;
        mesh.receiveShadows = true;
        this.shadows.addShadowCaster(mesh);
        this.crates.push({ id, mesh });
      }
    });
  }
}
