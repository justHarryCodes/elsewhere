import {
  type AbstractMesh,
  type AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  type Material,
  Mesh,
  MultiMaterial,
  type Node,
  PBRMaterial,
  Quaternion,
  type Scene,
  SpotLight,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  VEHICLE_MODELS,
  VehicleLights,
  vehicleGeometry,
  type MaterialRole,
  type PaintFinish,
  type VehicleCatalogEntry,
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
const SIREN_STRENGTH = 1.8; // siren lamps glow in their own colour (red, blue, white)
const SIREN_PERIOD = 0.6; // seconds for one blue-white cycle
// Tinted glass: dark, glossy and opaque (the cars have no interior to show).
const GLASS_TINT = new Color3(0.02, 0.025, 0.03);

// Real headlight beams (only for the car the player drives; each light costs every lit material).
const BEAM_COLOUR = new Color3(1, 0.95, 0.85);
const BEAMS = {
  low: { intensity: 3, range: 45, angle: 1.0, pitch: -0.12 },
  high: { intensity: 6, range: 110, angle: 0.65, pitch: -0.03 },
};

/**
 * Car paint is a base coat under a clear coat. Metallic flake makes the base reflect like metal;
 * matte (a satin wrap) has no clear coat at all.
 */
const FINISHES: Record<PaintFinish, { metallic: number; roughness: number; clearCoat: number }> = {
  gloss: { metallic: 0.05, roughness: 0.45, clearCoat: 1 },
  metallic: { metallic: 0.85, roughness: 0.3, clearCoat: 1 },
  matte: { metallic: 0.1, roughness: 0.8, clearCoat: 0 },
};

/** Loads each vehicle model once and creates any number of independently painted instances. */
export class VehicleLibrary {
  private readonly containers = new Map<VehicleModelKey, Promise<AssetContainer>>();

  constructor(private readonly scene: Scene) {}

  load(model: VehicleModelKey): Promise<AssetContainer> {
    let container = this.containers.get(model);
    if (!container) {
      container = LoadAssetContainerAsync(VEHICLE_MODELS[model].url, this.scene).then((loaded) => {
        // Some models are exported with the artist's camera and lights; the scene has its own.
        for (const item of [...loaded.cameras, ...loaded.lights]) item.dispose();
        loaded.cameras.length = 0;
        loaded.lights.length = 0;
        return loaded;
      });
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
    entries.animationGroups.forEach((group) => group.dispose());
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
  restY: number; // pivot height, metres
  physics: number[]; // physics wheel indices this part follows (an axle mesh follows two)
  front: boolean;
}

/**
 * One drawn vehicle. Call apply() with a VehicleSnapshot every frame; it places the body, turns and
 * spins the wheels, moves them on their suspension, and drives paint, finish and lamps.
 *
 *   root (physics pose: origin on the ground under the body centre, facing +Z)
 *   ├── frame (turns, scales and centres the model as exported)
 *   │   └── model nodes
 *   └── wheel pivots (vehicle space, metres) ── spin ── wheel node
 */
export class VehicleVisual {
  readonly root: TransformNode;
  readonly geometry: VehicleGeometry;
  private readonly wheels: WheelRig[] = [];
  private readonly roles = new Map<MaterialRole, PBRMaterial[]>();
  private paintHex = '';
  private finish?: PaintFinish;
  private readonly originalPaint = new Map<PBRMaterial, Color3>();
  private beams: SpotLight[] = [];
  private time = 0;

  constructor(
    scene: Scene,
    readonly model: VehicleModelKey,
    name: string,
    rootNodes: TransformNode[],
  ) {
    const def: VehicleCatalogEntry = VEHICLE_MODELS[model];
    this.geometry = vehicleGeometry(model);
    const { scale, offset, yaw } = this.geometry;

    this.root = new TransformNode(`vehicle-${name}`, scene);
    this.root.rotationQuaternion = Quaternion.Identity();
    const frame = new TransformNode(`vehicle-${name}-frame`, scene);
    frame.parent = this.root;
    frame.rotation.y = yaw;
    frame.scaling.setAll(scale);
    frame.position.set(offset.x * scale, offset.y * scale, offset.z * scale);
    for (const node of rootNodes) node.parent = frame;
    // setParent() below keeps world transforms, so they must be current.
    for (const node of [this.root, frame, ...frame.getDescendants(false)]) (node as TransformNode).computeWorldMatrix?.(true);

    const nodes = new Map<string, Node>();
    for (const node of frame.getDescendants(false)) nodes.set(node.name.slice(name.length + 1), node);
    for (const wheel of this.geometry.visualWheels) {
      const parts = wheel.nodes.map((n) => nodes.get(n)).filter((n): n is TransformNode => n instanceof TransformNode);
      if (!parts.length) {
        console.warn(`Vehicle ${model}: wheel node ${wheel.nodes.join(', ')} not found`);
        continue;
      }
      const steer = new TransformNode(`${name}-wheel-steer`, scene);
      steer.parent = this.root;
      steer.position.set(wheel.x, wheel.y, wheel.z);
      const spin = new TransformNode(`${name}-wheel-spin`, scene);
      spin.parent = steer;
      steer.computeWorldMatrix(true);
      spin.computeWorldMatrix(true);
      for (const part of parts) part.setParent(spin);
      this.wheels.push({ steer, spin, restY: wheel.y, physics: wheel.physics, front: wheel.front });
    }

    const byName = new Map<string, PBRMaterial[]>();
    for (const material of uniqueMaterials(this.root.getChildMeshes(false))) {
      if (!(material instanceof PBRMaterial)) continue;
      const source = material.name.slice(name.length + 1); // undo the `${name}-` prefix
      byName.set(source, [...(byName.get(source) ?? []), material]);
    }
    for (const [role, names] of Object.entries(def.materials) as [MaterialRole, readonly string[]][]) {
      this.roles.set(role, names.flatMap((n) => byName.get(n) ?? []));
    }
    for (const split of def.splits ?? []) {
      const above = (split.above + offset.y) * scale; // vehicle space; the root is still at the origin
      for (const material of byName.get(split.material) ?? []) {
        const meshes = this.root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.material === material);
        for (const mesh of meshes) {
          const top = splitAbove(mesh, above, `${name}-${split.material}-${split.role}`);
          if (top) this.roles.set(split.role, [...this.materials(split.role), top.material as PBRMaterial]);
        }
      }
    }
    for (const material of this.materials('paint')) this.originalPaint.set(material, material.albedoColor.clone());
    // Unlit lamps keep their authored colour; lit ones add emissive on top.
    for (const role of ['headlight', 'taillight', 'reverse', 'sirenA', 'sirenB'] as const) {
      for (const material of this.materials(role)) material.emissiveColor = Color3.Black();
    }
    for (const material of this.materials('glass')) {
      material.albedoColor = GLASS_TINT.clone();
      material.metallic = 0;
      material.roughness = 0.05;
    }
  }

  /** Meshes to give shadows or bounding boxes to. */
  get meshes(): AbstractMesh[] {
    return this.root.getChildMeshes(false);
  }

  apply(state: VehicleSnapshot, dtSeconds: number) {
    this.time += dtSeconds;
    this.root.position.set(state.x, state.y, state.z);
    this.root.rotationQuaternion!.set(state.qx, state.qy, state.qz, state.qw);

    for (const wheel of this.wheels) {
      const avg = (values: readonly number[]) => wheel.physics.reduce((sum, i) => sum + values[i], 0) / wheel.physics.length;
      wheel.steer.rotation.y = wheel.front ? state.steer : 0;
      wheel.spin.rotation.x = avg(state.wheelSpin);
      wheel.steer.position.y = wheel.restY - avg(state.wheelDrop); // drop: + = wheel hangs lower
    }

    this.setPaint(state.paint);
    this.setFinish(state.finish);
    this.applyLights(state.lights);
  }

  setPaint(hex: string) {
    if (hex === this.paintHex) return;
    this.paintHex = hex;
    const colour = hex ? Color3.FromHexString(hex).toLinearSpace() : undefined;
    for (const material of this.materials('paint')) {
      material.albedoColor = colour ?? this.originalPaint.get(material) ?? material.albedoColor;
    }
  }

  setFinish(finish: PaintFinish) {
    if (finish === this.finish) return;
    this.finish = finish;
    const f = FINISHES[finish];
    for (const material of this.materials('paint')) {
      material.metallic = f.metallic;
      material.roughness = f.roughness;
      material.clearCoat.isEnabled = f.clearCoat > 0;
      material.clearCoat.intensity = f.clearCoat;
      material.clearCoat.roughness = 0.03;
    }
  }

  /**
   * Gives this car real headlight beams that light the road (for the player's car). Two spot lights
   * sit at the front corners, at headlight height, and follow the headlight switch.
   */
  enableBeams() {
    if (this.beams.length) return;
    const { halfLength, halfWidth, bodyTop } = this.geometry;
    const scene = this.root.getScene();
    for (const side of [1, -1]) {
      const beam = new SpotLight(`${this.root.name}-beam`, Vector3.Zero(), new Vector3(0, 0, 1), 1, 2, scene);
      beam.parent = this.root;
      beam.position.set(side * halfWidth * 0.65, Math.max(0.55, bodyTop * 0.45), halfLength - 0.05);
      beam.diffuse = BEAM_COLOUR;
      beam.specular = BEAM_COLOUR;
      beam.intensity = 0;
      beam.setEnabled(false);
      this.beams.push(beam);
    }
  }

  dispose() {
    for (const beam of this.beams) beam.dispose();
    for (const material of uniqueMaterials(this.meshes)) material.dispose();
    this.root.dispose(false, true);
  }

  private materials(role: MaterialRole): PBRMaterial[] {
    return this.roles.get(role) ?? [];
  }

  private applyLights(lights: number) {
    const has = (flag: number) => (lights & flag) !== 0;
    const head = has(VehicleLights.High) ? HEADLIGHT_HIGH : has(VehicleLights.Low) ? HEADLIGHT_LOW : 0;
    glow(this.materials('headlight'), HEADLIGHT, head);
    const beam = has(VehicleLights.High) ? BEAMS.high : has(VehicleLights.Low) ? BEAMS.low : undefined;
    for (const light of this.beams) {
      light.setEnabled(!!beam);
      if (!beam) continue;
      light.intensity = beam.intensity;
      light.range = beam.range;
      light.angle = beam.angle;
      light.direction.set(0, beam.pitch, 1);
    }

    const reversing = has(VehicleLights.Reverse);
    const reverseLamps = this.materials('reverse');
    const tailStrength = has(VehicleLights.Brake) ? TAIL_BRAKE : head ? TAIL_RUNNING : 0;
    if (reverseLamps.length) {
      glow(reverseLamps, REVERSE, reversing ? REVERSE_STRENGTH : 0);
      glow(this.materials('taillight'), TAIL, tailStrength);
    } else if (reversing) {
      glow(this.materials('taillight'), REVERSE, REVERSE_STRENGTH); // no separate reverse lamps
    } else {
      glow(this.materials('taillight'), TAIL, tailStrength);
    }

    // Siren: the two colours alternate, each with a quick double flash.
    const siren = has(VehicleLights.Siren);
    const phase = (this.time % SIREN_PERIOD) / SIREN_PERIOD;
    const flash = (from: number) => phase >= from && phase < from + 0.5 && (phase - from) % 0.25 < 0.17;
    for (const material of this.materials('sirenA')) glow([material], lampColour(material), siren && flash(0) ? SIREN_STRENGTH : 0);
    for (const material of this.materials('sirenB')) glow([material], lampColour(material), siren && flash(0.5) ? SIREN_STRENGTH : 0);
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

/**
 * Moves the triangles of `mesh` that lie entirely above `y` (world space) into a new mesh with its own
 * copy of the material, so part of a shared material (e.g. a light bar using the tail-light colour)
 * can light up on its own.
 */
function splitAbove(mesh: Mesh, y: number, name: string): Mesh | undefined {
  mesh.computeWorldMatrix(true);
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  if (!positions || !indices) return undefined;
  const world = mesh.getWorldMatrix();
  const vertexY = (i: number) => Vector3.TransformCoordinates(new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]), world).y;
  const above: number[] = [];
  const below: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    (tri.every((i) => vertexY(i) > y) ? above : below).push(...tri);
  }
  if (!above.length) return undefined;
  mesh.makeGeometryUnique(); // the instance shares geometry with the loaded model
  const top = new Mesh(name, mesh.getScene(), mesh.parent);
  VertexData.ExtractFromMesh(mesh).applyToMesh(top);
  top.setIndices(above);
  mesh.setIndices(below);
  top.position.copyFrom(mesh.position);
  top.rotationQuaternion = mesh.rotationQuaternion?.clone() ?? null;
  top.rotation.copyFrom(mesh.rotation);
  top.scaling.copyFrom(mesh.scaling);
  top.material = (mesh.material as PBRMaterial).clone(name);
  return top;
}

/** A lamp's own hue at full brightness: red stays red, blue stays blue. */
function lampColour(material: PBRMaterial): Color3 {
  const c = material.albedoColor;
  const max = Math.max(c.r, c.g, c.b, 1e-3);
  return new Color3(c.r / max, c.g / max, c.b / max);
}

function glow(materials: PBRMaterial[], colour: Color3, strength: number) {
  for (const material of materials) material.emissiveColor.copyFrom(colour).scaleInPlace(strength);
}
