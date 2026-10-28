import {
  type AbstractMesh,
  type AssetContainer,
  ArcRotateCamera,
  BoundingBox,
  Color3,
  Color4,
  Constants,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Light,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { type Box3, type EffectDef, type HumanAppearance, type HumanBody, type Placement, type SceneDef, defaultAppearance } from '@game/shared';
import { Effects } from './effects';
import { assetEntry } from '../../assets/assetManifest';
import { CityRenderer } from '../../game/babylon/city';
import { MegaKit } from '../../game/megakit';
import { type HumanCharacter, HumanLibrary } from '../../game/babylon/humans';
import { type PlayerFrame, type RendererOptions, type SceneRenderer, type ScreenPoint, type View, fitFov, viewCamera } from '../sceneRenderer';

/** A placement the game asks about: picked, collided with or faded. */
interface Tracked {
  box: BoundingBox;
  meshes: AbstractMesh[];
  height: number;
  placement: Placement;
}

/** Sun, sky and exposure for each mood. Exposure sits a touch above 1: tone mapping darkens mid-tones. */
const MOODS = {
  day: {
    sky: new Color4(0.62, 0.78, 0.92, 1), exposure: 1.2, ambient: 0.75, skyLight: Color3.White(), groundLight: new Color3(0.45, 0.42, 0.38),
    sun: 1.6, sunColor: Color3.White(), sunDirection: new Vector3(-0.4, -1, -0.6),
  },
  evening: {
    sky: new Color4(0.86, 0.6, 0.5, 1), exposure: 1.1, ambient: 0.52, skyLight: new Color3(0.72, 0.68, 0.92), groundLight: new Color3(0.28, 0.2, 0.22),
    sun: 0.95, sunColor: new Color3(1, 0.7, 0.45), sunDirection: new Vector3(-0.75, -0.35, -0.55),
  },
  night: {
    sky: new Color4(0.05, 0.04, 0.1, 1), exposure: 1.15, ambient: 0.48, skyLight: new Color3(0.55, 0.5, 0.9), groundLight: new Color3(0.08, 0.06, 0.12),
    sun: 0, sunColor: Color3.White(), sunDirection: new Vector3(-0.4, -1, -0.6),
  },
};
const FADED = 0.22;

/** Babylon renderer for world scenes. Each GLB is loaded once; placements are instances of it. */
export class BabylonWorld implements SceneRenderer {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly sky: HemisphericLight;
  private readonly sun: DirectionalLight;
  private readonly containers = new Map<string, Promise<AssetContainer>>();
  private readonly tracked = new Map<string, Tracked>();
  private lamps: PointLight[] = [];
  /** Lamp glows and pools. */
  private lampMeshes: Mesh[] = [];
  private glowTexture?: DynamicTexture;
  private doorMaterial?: PBRMaterial;
  private content?: TransformNode;
  /** The furnished rooms of an inside scene, drawn by the walkable city's renderer. */
  private rooms?: CityRenderer;
  private highlighted: string | null = null;
  private humans?: Promise<HumanLibrary>;
  private player?: HumanCharacter;
  private readonly npcs = new Map<string, HumanCharacter>();
  private readonly cars = new Map<string, TransformNode>();
  /** Door leaves by id: each turns about its hinge. */
  private readonly doors = new Map<string, TransformNode>();
  private readonly doorLevels = new Map<string, number>();
  private effects?: Effects;
  private readonly onResize = () => this.engine.resize();

  constructor(private readonly canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.engine = new Engine(canvas, true, { stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.scene.clearColor = MOODS.day.sky;
    // Filmic tone mapping: bright light (lamps, neon, a low sun) rolls off instead of blowing out.
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.camera = new ArcRotateCamera('camera', 0, 1, 50, Vector3.Zero(), this.scene);
    this.camera.minZ = 0.3;
    this.camera.maxZ = 2000;
    this.camera.fov = (45 * Math.PI) / 180;
    if (options.orbit) {
      this.camera.wheelDeltaPercentage = 0.02;
      this.camera.attachControl(canvas, true);
    }
    this.sky = new HemisphericLight('sky', new Vector3(0, 1, 0), this.scene);
    this.sun = new DirectionalLight('sun', new Vector3(-0.4, -1, -0.6), this.scene);
    this.engine.runRenderLoop(() => {
      // Rooms build and cut their walls round the camera's target (chest height over the floor).
      const t = this.camera.target;
      this.rooms?.update({ x: t.x, y: t.y + 1.2, z: t.z }, this.engine.getDeltaTime() / 1000);
      this.scene.render();
    });
    window.addEventListener('resize', this.onResize);
  }

  async loadScene(def: SceneDef) {
    // The cached GLBs' materials are shared by every instance and stay. Only pickable and fading
    // copies own theirs (cloned in place()); a merely solid placement shares the kit's, so it's left alone.
    for (const { meshes, placement } of this.tracked.values()) {
      if (placement.pickable || placement.occluder) for (const mesh of meshes) mesh.material?.dispose();
    }
    this.effects?.stopAll();
    this.doors.clear();
    this.content?.dispose(false, false);
    this.tracked.clear();
    for (const npc of this.npcs.values()) npc.dispose();
    this.npcs.clear();
    this.cars.clear();
    this.highlighted = null;
    const content = new TransformNode(def.id, this.scene);
    this.content = content;
    if (def.ground) {
      const ground = MeshBuilder.CreateGround('ground', { width: def.ground.size, height: def.ground.size }, this.scene);
      // Matte PBR like the glTF models, so it's lit the same way.
      const groundMaterial = new PBRMaterial('ground', this.scene);
      groundMaterial.albedoColor = Color3.FromHexString(def.ground.color).toLinearSpace();
      groundMaterial.metallic = 0;
      groundMaterial.roughness = 1;
      ground.material = groundMaterial;
      ground.position.y = -0.02;
      ground.isPickable = false;
      ground.parent = content;
    }
    this.rooms?.dispose();
    this.rooms = undefined;
    if (def.rooms) {
      // Wait for the piece kit, so the furniture is there when the scene fades in.
      await MegaKit.load();
      this.rooms = CityRenderer.create(this.scene, def.rooms, { outsideGround: false });
    }
    this.light(def);
    this.doorLevels.clear();
    for (const door of def.doors ?? []) {
      this.doors.set(door.id, this.doorLeaf(door, content));
      this.doorLevels.set(door.id, door.level);
    }
    await Promise.all(def.placements.map((p, i) => this.place(p, i, content)));
    this.setView(def.view);
  }

  setView(view: View) {
    const { position, target } = viewCamera(view);
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.camera.fov = (fitFov(view.fov ?? 45, aspect) * Math.PI) / 180;
    this.camera.setTarget(new Vector3(target.x, target.y, target.z));
    this.camera.setPosition(new Vector3(position.x, position.y, position.z));
  }

  project(x: number, y: number, z: number): ScreenPoint | null {
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const p = Vector3.Project(new Vector3(x, y, z), Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(width, height));
    if (p.z < 0 || p.z > 1) return null;
    // Render pixels to CSS pixels.
    const k = this.canvas.clientWidth / width;
    return { x: p.x * k, y: p.y * k };
  }

  pick(x: number, y: number): string | null {
    const ray = this.pickRay(x, y);
    let best: string | null = null;
    let nearest = Infinity;
    for (const [id, { box, placement }] of this.tracked) {
      if (!placement.pickable || !ray.intersectsBox(box)) continue;
      const d = Vector3.Distance(ray.origin, box.centerWorld);
      if (d < nearest) {
        nearest = d;
        best = id;
      }
    }
    return best;
  }

  groundPoint(x: number, y: number, floorY = 0) {
    const ray = this.pickRay(x, y);
    if (ray.direction.y >= -1e-4) return null;
    const t = (floorY - ray.origin.y) / ray.direction.y;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  highlight(id: string | null, color = '#ffffff') {
    if (this.highlighted) this.tint(this.highlighted, null);
    this.highlighted = id;
    if (id) this.tint(id, Color3.FromHexString(color).scale(0.35));
  }

  heightOf(id: string) {
    return this.tracked.get(id)?.height ?? 0;
  }

  boxes(kind: 'solid' | 'occluder'): Box3[] {
    return [...this.tracked]
      .filter(([, t]) => t.placement[kind])
      .map(([id, { box }]) => ({ id, min: box.minimumWorld, max: box.maximumWorld }));
  }

  setFaded(ids: readonly string[]) {
    for (const [id, t] of this.tracked) {
      if (!t.placement.occluder) continue;
      const visibility = ids.includes(id) ? FADED : 1;
      for (const mesh of t.meshes) mesh.visibility += (visibility - mesh.visibility) * 0.25;
    }
  }

  async spawnPlayer(body: HumanBody, appearance: HumanAppearance = defaultAppearance(body)) {
    this.humans ??= HumanLibrary.load(this.scene);
    const library = await this.humans;
    this.player?.dispose();
    this.player = library.createHuman(body, 'player', appearance);
    this.player.root.setEnabled(false);
  }

  setPlayer(frame: PlayerFrame | null) {
    if (!this.player) return;
    this.player.root.setEnabled(!!frame);
    if (!frame) return;
    this.player.root.position.set(frame.x, frame.y ?? 0, frame.z);
    this.player.root.rotation.y = frame.rotY;
    this.player.play(frame.animation);
  }

  async spawnNpc(id: string, body: HumanBody, appearance: HumanAppearance = defaultAppearance(body)) {
    this.humans ??= HumanLibrary.load(this.scene);
    const library = await this.humans;
    this.npcs.get(id)?.dispose();
    this.npcs.set(id, library.createHuman(body, id, appearance));
  }

  setNpc(id: string, frame: PlayerFrame) {
    const npc = this.npcs.get(id);
    if (!npc) return;
    npc.root.position.set(frame.x, frame.y ?? 0, frame.z);
    npc.root.rotation.y = frame.rotY;
    npc.play(frame.animation);
  }

  async spawnCar(id: string, asset: string) {
    if (!this.content) return;
    this.cars.set(id, await this.place({ asset, x: 0, z: 0 }, -1, this.content));
  }

  setCar(id: string, pose: { x: number; z: number; rotY: number }) {
    const car = this.cars.get(id);
    if (!car) return;
    car.position.set(pose.x, 0, pose.z);
    car.rotation.y = pose.rotY;
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.engine.dispose();
  }

  ray(x: number, y: number) {
    const r = this.pickRay(x, y);
    return { origin: { x: r.origin.x, y: r.origin.y, z: r.origin.z }, dir: { x: r.direction.x, y: r.direction.y, z: r.direction.z } };
  }

  setDoor(id: string, open: number) {
    const hinge = this.doors.get(id);
    if (hinge) hinge.rotation.y = (hinge.metadata as { swing: number }).swing * open * (Math.PI / 2);
  }

  setFloor(level: number) {
    for (const [id, hinge] of this.doors) hinge.setEnabled((this.doorLevels.get(id) ?? 0) <= level);
  }

  playEffects(group: string, effects: readonly EffectDef[]) {
    this.effects ??= new Effects(this.scene);
    this.effects.play(group, effects);
  }

  stopEffects(group: string) {
    this.effects?.stop(group);
  }

  // A wooden leaf hinged at one end of its doorway, shut along the wall; setDoor swings it into the room.
  private doorLeaf(door: NonNullable<SceneDef['doors']>[number], parent: TransformNode) {
    const hinge = new TransformNode(door.id, this.scene);
    const half = door.width / 2 - 0.03;
    hinge.position.set(door.x - (door.along === 'x' ? half : 0), door.y, door.z - (door.along === 'z' ? half : 0));
    // Leaves along x swing toward -z; along z, toward +x: both turn the same way about Y from shut.
    hinge.metadata = { swing: door.along === 'x' ? 1 : -1 };
    const leaf = MeshBuilder.CreateBox(`${door.id}-leaf`, { width: door.along === 'x' ? half * 2 : 0.05, height: 2.05, depth: door.along === 'z' ? half * 2 : 0.05 }, this.scene);
    leaf.position.set(door.along === 'x' ? half : 0, 1.025, door.along === 'z' ? half : 0);
    this.doorMaterial ??= Object.assign(new PBRMaterial('door', this.scene), { albedoColor: new Color3(0.6, 0.42, 0.28), metallic: 0, roughness: 0.75 });
    leaf.material = this.doorMaterial;
    leaf.isPickable = false;
    leaf.parent = hinge;
    const handle = MeshBuilder.CreateBox(`${door.id}-handle`, { width: 0.12, height: 0.03, depth: 0.12 }, this.scene);
    handle.position.set(door.along === 'x' ? half * 1.8 : 0, 1.0, door.along === 'z' ? half * 1.8 : 0);
    handle.material = this.doorMaterial;
    handle.parent = hinge;
    hinge.parent = parent;
    return hinge;
  }

  private pickRay(x: number, y: number) {
    const k = this.engine.getRenderWidth() / this.canvas.clientWidth;
    return this.scene.createPickingRay(x * k, y * k, Matrix.Identity(), this.camera);
  }

  // Day: sky and sun. Night: a dim violet sky, no sun, and the scene's point lights.
  // The mood's sun and sky, then each lamp: a soft glow round the bulb and a faint pool on the ground
  // (both additive and kept dim, so they read as light without hiding what's under them), and real
  // light only where the scene asks for it. Tone mapping rolls bright light off instead of clipping.
  private light(def: SceneDef) {
    for (const lamp of this.lamps) lamp.dispose();
    // Their materials are each lamp's own; the soft-spot texture is shared and stays.
    for (const mesh of this.lampMeshes) {
      mesh.material?.dispose();
      mesh.dispose();
    }
    this.lamps = [];
    this.lampMeshes = [];
    const mood = MOODS[def.lighting?.mood ?? 'day'];
    this.scene.clearColor = def.background ? Color4.FromColor3(Color3.FromHexString(def.background)) : mood.sky;
    this.scene.imageProcessingConfiguration.exposure = mood.exposure;
    this.sky.intensity = mood.ambient;
    this.sky.diffuse = mood.skyLight;
    this.sky.groundColor = mood.groundLight;
    this.sun.setEnabled(mood.sun > 0);
    this.sun.intensity = mood.sun;
    this.sun.diffuse = mood.sunColor;
    this.sun.direction = mood.sunDirection;
    for (const lamp of def.lighting?.lamps ?? []) {
      const color = Color3.FromHexString(lamp.color);
      const glow = MeshBuilder.CreatePlane('lamp-glow', { size: 1.5 }, this.scene);
      glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
      glow.position.set(lamp.x, lamp.y, lamp.z);
      glow.material = this.glowMaterial(color.scale(0.85));
      glow.isPickable = false;
      this.lampMeshes.push(glow);
      if (lamp.pool > 0) {
        const pool = MeshBuilder.CreateDisc('lamp-pool', { radius: lamp.pool / 2, tessellation: 24 }, this.scene);
        pool.rotation.x = Math.PI / 2;
        pool.position.set(lamp.x, (lamp.groundY ?? 0) + 0.03, lamp.z);
        pool.material = this.glowMaterial(color.scale(0.28));
        pool.isPickable = false;
        this.lampMeshes.push(pool);
      }
      if (lamp.light) {
        const light = new PointLight('lamp', new Vector3(lamp.x, lamp.y, lamp.z), this.scene);
        light.diffuse = color;
        // Standard falloff to its range; scaled to match the Three.js renderer's look.
        light.intensity = lamp.light.intensity * 1.8;
        light.range = lamp.light.range;
        light.falloffType = Light.FALLOFF_STANDARD;
        this.lamps.push(light);
      }
    }
  }

  /**
   * An unlit, additive soft spot in one colour (lamp glows and pools). The spot is only the opacity:
   * a standard material adds an emissive texture on top of its colour, which would wash it to white.
   */
  private glowMaterial(color: Color3) {
    this.glowTexture ??= softSpot(this.scene);
    const material = new StandardMaterial('lamp-glow', this.scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.emissiveColor = color;
    material.opacityTexture = this.glowTexture;
    material.alphaMode = Constants.ALPHA_ADD;
    material.disableDepthWrite = true;
    return material;
  }

  private tint(id: string, emissive: Color3 | null) {
    for (const mesh of this.tracked.get(id)?.meshes ?? []) {
      if (mesh.material instanceof PBRMaterial) mesh.material.emissiveColor = emissive ?? Color3.Black();
    }
  }

  private load(url: string) {
    let container = this.containers.get(url);
    if (!container) {
      container = LoadAssetContainerAsync(url, this.scene);
      this.containers.set(url, container);
    }
    return container;
  }

  // An instance of the asset, turned to face +Z, its footprint centred and its base on the ground,
  // scaled to metres, then put where the placement says. Pickable and fading ones are copies with
  // their own materials, so tinting or fading one doesn't touch every building sharing the kit's.
  private async place(placement: Placement, index: number, parent: TransformNode) {
    const entry = assetEntry(placement.asset);
    const container = await this.load(entry.url);
    const own = !!(placement.pickable || placement.occluder);
    const holder = new TransformNode(placement.id ?? placement.asset, this.scene);
    const model = new TransformNode(`${placement.asset}-model`, this.scene);
    model.parent = holder;
    const copy = container.instantiateModelsToScene((name) => name, own, { doNotInstantiate: own });
    for (const node of copy.rootNodes) node.parent = model;
    model.rotation.y = entry.yaw ?? 0;
    holder.computeWorldMatrix(true);
    const { min, max } = model.getHierarchyBoundingVectors(true);
    const scale = (entry.scale ?? (entry.height ?? 1) / Math.max(1e-6, max.y - min.y)) * (placement.scale ?? 1);
    model.position.set(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
    holder.scaling.setAll(scale);
    holder.rotation.y = placement.rotY ?? 0;
    holder.position.set(placement.x, placement.y ?? 0, placement.z);
    holder.parent = parent;
    if (placement.pickable || placement.solid || placement.occluder) {
      holder.computeWorldMatrix(true);
      const meshes = holder.getChildMeshes(false);
      for (const mesh of meshes) mesh.computeWorldMatrix(true);
      const bounds = holder.getHierarchyBoundingVectors(true);
      const id = placement.id ?? `${placement.asset}#${index}`;
      this.tracked.set(id, { box: new BoundingBox(bounds.min, bounds.max), meshes, height: bounds.max.y, placement });
    }
    return holder;
  }
}

/** A soft round spot, bright in the middle and fading to nothing at the edge. */
function softSpot(scene: Scene) {
  const texture = new DynamicTexture('soft-spot', { width: 128, height: 128 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}
