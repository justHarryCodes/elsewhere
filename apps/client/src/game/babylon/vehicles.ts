import {
  type AbstractMesh,
  type AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  type Material,
  MultiMaterial,
  type PBRMaterial,
  Quaternion,
  type Scene,
  TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  VEHICLE_MODELS,
  VehicleLights,
  vehicleGeometry,
  type ModelBounds,
  type VehicleGeometry,
  type VehicleModelKey,
  type VehicleSnapshot,
} from '@game/shared';

// Lamp colours (linear) and strengths. Glow comes from a GlowLayer picking up emissive colour.
const HEADLIGHT = new Color3(1, 0.93, 0.78);
const HEADLIGHT_LOW = 1.4;
const HEADLIGHT_HIGH = 3;
const TAIL = new Color3(1, 0.04, 0.02);
const TAIL_RUNNING = 0.35; // tail lights glow dimly whenever the headlights are on
const TAIL_BRAKE = 2.2;
const REVERSE = new Color3(1, 0.9, 0.88);
const REVERSE_STRENGTH = 1.6;
const SIREN_A = new Color3(0.02, 0.1, 1);
const SIREN_B = new Color3(1, 1, 1);
const SIREN_STRENGTH = 1.8;
const SIREN_PERIOD = 0.6; // seconds for one blue-white cycle

/** Loads each vehicle model once and creates any number of independently painted instances. */
export class VehicleLibrary {
  private readonly containers = new Map<VehicleModelKey, Promise<AssetContainer>>();

  constructor(private readonly scene: Scene) {}

  load(model: VehicleModelKey): Promise<AssetContainer> {
    let container = this.containers.get(model);
    if (!container) {
      container = LoadAssetContainerAsync(VEHICLE_MODELS[model].url, this.scene);
      this.containers.set(model, container);
    }
    return container;
  }

  async createVehicle(model: VehicleModelKey, name: string): Promise<VehicleVisual> {
    const container = await this.load(model);
    // Materials are cloned so each car can have its own paint and lamp state.
    const entries = container.instantiateModelsToScene((source) => `${name}-${source}`, true, {
      doNotInstantiate: true,
    });
    return new VehicleVisual(this.scene, model, name, entries.rootNodes as TransformNode[]);
  }

  dispose() {
    for (const container of this.containers.values()) void container.then((c) => c.dispose());
    this.containers.clear();
  }
}

interface WheelRig {
  steer: TransformNode; // yaw around the wheel centre
  spin: TransformNode; // roll around the axle
  rest: { x: number; y: number; z: number }; // pivot position, model units
  wheels: number[]; // physics wheel indices this mesh follows (the rear axle is one mesh)
  front: boolean;
}

/**
 * One drawn vehicle. Call apply() with a VehicleSnapshot every frame; it places the body,
 * turns and spins the wheels, moves them on their suspension, and drives paint and lamps.
 */
export class VehicleVisual {
  readonly root: TransformNode;
  readonly geometry: VehicleGeometry;
  private readonly wheels: WheelRig[] = [];
  private readonly paint: PBRMaterial[] = [];
  private readonly lamps: Record<'headlight' | 'taillight' | 'sirenA' | 'sirenB', PBRMaterial[]> = {
    headlight: [],
    taillight: [],
    sirenA: [],
    sirenB: [],
  };
  private paintHex = '';
  private time = 0;

  constructor(
    scene: Scene,
    readonly model: VehicleModelKey,
    name: string,
    rootNodes: TransformNode[],
  ) {
    const def = VEHICLE_MODELS[model];
    this.geometry = vehicleGeometry(model);
    const { scale, offset } = this.geometry;

    // root follows the physics body (origin on the ground under the body centre);
    // frame scales the model to real size and centres it on that origin.
    this.root = new TransformNode(`vehicle-${name}`, scene);
    this.root.rotationQuaternion = Quaternion.Identity();
    const frame = new TransformNode(`vehicle-${name}-frame`, scene);
    frame.parent = this.root;
    frame.scaling.setAll(scale);
    frame.position.set(offset.x * scale, 0, offset.z * scale);
    for (const node of rootNodes) node.parent = frame;
    // setParent() below keeps world transforms, so they must be current.
    for (const node of [this.root, frame, ...frame.getDescendants(false)]) (node as TransformNode).computeWorldMatrix(true);

    const meshes = this.root.getChildMeshes(false);
    const { nodes, materials } = def.rig;
    this.rigWheel(meshes, nodes.frontLeft, def.bounds.frontLeft, [0], true);
    this.rigWheel(meshes, nodes.frontRight, def.bounds.frontRight, [1], true);
    this.rigWheel(meshes, nodes.rear, def.bounds.rear, [2, 3], false);

    const byName = new Map<string, PBRMaterial[]>();
    for (const material of uniqueMaterials(meshes)) {
      const source = material.name.slice(name.length + 1); // undo the `${name}-` prefix
      byName.set(source, [...(byName.get(source) ?? []), material as PBRMaterial]);
    }
    this.paint.push(...(byName.get(materials.paint) ?? []));
    this.lamps.headlight.push(...(byName.get(materials.headlight) ?? []));
    this.lamps.taillight.push(...(byName.get(materials.taillight) ?? []));
    if (materials.sirenA) this.lamps.sirenA.push(...(byName.get(materials.sirenA) ?? []));
    if (materials.sirenB) this.lamps.sirenB.push(...(byName.get(materials.sirenB) ?? []));
    // Unlit lamps keep their authored colour; lit ones add emissive on top.
    for (const material of Object.values(this.lamps).flat()) material.emissiveColor = Color3.Black();
  }

  /** Meshes to give shadows or bounding boxes to. */
  get meshes(): AbstractMesh[] {
    return this.root.getChildMeshes(false);
  }

  apply(state: VehicleSnapshot, dtSeconds: number) {
    this.time += dtSeconds;
    this.root.position.set(state.x, state.y, state.z);
    this.root.rotationQuaternion!.set(state.qx, state.qy, state.qz, state.qw);

    const { scale } = this.geometry;
    for (const wheel of this.wheels) {
      const avg = (values: readonly number[]) => wheel.wheels.reduce((sum, i) => sum + values[i], 0) / wheel.wheels.length;
      wheel.steer.rotation.y = wheel.front ? state.steer : 0;
      wheel.spin.rotation.x = avg(state.wheelSpin);
      // drop is in metres (positive = wheel hangs lower); the rig lives in model units.
      wheel.steer.position.y = wheel.rest.y - avg(state.wheelDrop) / scale;
    }

    this.setPaint(state.paint);
    this.applyLights(state.lights);
  }

  setPaint(hex: string) {
    if (hex === this.paintHex) return;
    this.paintHex = hex;
    const colour = Color3.FromHexString(hex).toLinearSpace();
    for (const material of this.paint) material.albedoColor = colour;
  }

  dispose() {
    for (const material of [...this.paint, ...Object.values(this.lamps).flat()]) material.dispose();
    this.root.dispose(false, true);
  }

  private applyLights(lights: number) {
    const has = (flag: number) => (lights & flag) !== 0;
    const head = has(VehicleLights.High) ? HEADLIGHT_HIGH : has(VehicleLights.Low) ? HEADLIGHT_LOW : 0;
    glow(this.lamps.headlight, HEADLIGHT, head);

    if (has(VehicleLights.Reverse)) glow(this.lamps.taillight, REVERSE, REVERSE_STRENGTH);
    else glow(this.lamps.taillight, TAIL, has(VehicleLights.Brake) ? TAIL_BRAKE : head ? TAIL_RUNNING : 0);

    // Siren: blue and white alternate, each with a quick double flash.
    const siren = has(VehicleLights.Siren);
    const phase = (this.time % SIREN_PERIOD) / SIREN_PERIOD;
    const flash = (from: number) => phase >= from && phase < from + 0.5 && (phase - from) % 0.25 < 0.17;
    glow(this.lamps.sirenA, SIREN_A, siren && flash(0) ? SIREN_STRENGTH : 0);
    glow(this.lamps.sirenB, SIREN_B, siren && flash(0.5) ? SIREN_STRENGTH : 0);
  }

  // Wheels are exported with their origin at the car's origin. Give each one a steer + spin pivot at
  // its own centre, then hang the mesh back under it where it was.
  private rigWheel(meshes: AbstractMesh[], match: string, bounds: ModelBounds, wheels: number[], front: boolean) {
    const mesh = meshes.find((m) => m.name.includes(match));
    if (!mesh) {
      console.warn(`Vehicle ${this.model}: no wheel mesh matching "${match}"`);
      return;
    }
    const rest = {
      x: (bounds.min[0] + bounds.max[0]) / 2,
      y: (bounds.min[1] + bounds.max[1]) / 2,
      z: (bounds.min[2] + bounds.max[2]) / 2,
    };
    const scene = mesh.getScene();
    const steer = new TransformNode(`${mesh.name}-steer`, scene);
    steer.parent = mesh.parent;
    steer.position.set(rest.x, rest.y, rest.z);
    const spin = new TransformNode(`${mesh.name}-spin`, scene);
    spin.parent = steer;
    steer.computeWorldMatrix(true);
    spin.computeWorldMatrix(true);
    mesh.setParent(spin);
    this.wheels.push({ steer, spin, rest, wheels, front });
  }
}

function uniqueMaterials(meshes: AbstractMesh[]): Material[] {
  const found = new Set<Material>();
  for (const mesh of meshes) {
    const material = mesh.material;
    if (material instanceof MultiMaterial) {
      for (const sub of material.subMaterials) if (sub) found.add(sub);
    } else if (material) {
      found.add(material);
    }
  }
  return [...found];
}

function glow(materials: PBRMaterial[], colour: Color3, strength: number) {
  for (const material of materials) material.emissiveColor.copyFrom(colour).scaleInPlace(strength);
}
