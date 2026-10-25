import {
  Color3,
  Constants,
  DynamicTexture,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  PBRMaterial,
  type Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  CITY_MODELS,
  CITY_NEON_COLORS,
  CITY_UNIT,
  KERB_HEIGHT,
  type City,
  type CityLight,
  type CityModelKey,
  type CityNeon,
  type CityObject,
  type CityZone,
} from '@game/shared';

// The city streams in square chunks round the player: built (rising out of the ground) when they
// come within BUILD_RADIUS, taken down again (sinking away) once they're past KEEP_RADIUS. The gap
// between the two stops a chunk on the edge flickering in and out.
const CHUNK = 100;
const BUILD_RADIUS = 220;
const KEEP_RADIUS = 300;
const RISE_SECONDS = 0.7;
const SINK_SECONDS = 0.5;

const POOL_RADIUS = 7; // metres of road lit under a street lamp
const POOL_Y = 0.1; // just above the sidewalks, so the light pools never flicker into them

// Lots are dark paving and scrubby grass: the night glow is what gives the city its colour.
const GROUND_COLOURS: Record<CityZone | 'outside', Color3> = {
  residential: new Color3(0.27, 0.4, 0.27),
  commercial: new Color3(0.3, 0.3, 0.34),
  industrial: new Color3(0.26, 0.26, 0.28),
  outside: new Color3(0.28, 0.36, 0.26),
};

// What the windows glow at night, per model: mostly warm or cool interiors, some neon-lit.
const WINDOW_TINTS = [
  new Color3(1, 0.7, 0.4),
  new Color3(1, 0.7, 0.4),
  new Color3(0.55, 0.8, 1),
  new Color3(0.55, 0.8, 1),
  new Color3(0.15, 0.9, 1),
  new Color3(1, 0.25, 0.8),
];
const WINDOW_BRIGHTNESS: Record<string, number> = { commercial: 0.7, suburban: 0.6, industrial: 0.5 };

/** What a city mesh is, for callers that treat them differently (e.g. only neon in a glow layer). */
export type CityMeshKind = 'ground' | 'building' | 'neon' | 'lamp' | 'pool';

interface Chunk {
  key: string;
  /** Bounds of the chunk, metres. */
  x0: number;
  z0: number;
  byModel: Map<CityModelKey, CityObject[]>;
  neon: Map<number, CityNeon[]>;
  lights: Map<number, CityLight[]>;
  state: 'empty' | 'loading' | 'rising' | 'built' | 'sinking';
  meshes: Mesh[];
  /** Progress of the current rise or sink, 0..1. */
  t: number;
}

export interface CityRendererOptions {
  /** Grass all round the city (off when the scene has its own ground there). */
  outsideGround?: boolean;
  /** Called for every mesh the city creates, e.g. to keep all but the neon out of a glow layer. */
  onMesh?: (mesh: Mesh, kind: CityMeshKind) => void;
}

/**
 * Draws a generated city, streamed in chunks round a focus point (the player): call update() every
 * frame. Every model is loaded the first time a chunk needs it and merged into one mesh; each copy
 * of it in a chunk is a thin instance, so a chunk costs one draw call per kind of model in it.
 * Lots (the ground between roads) are cheap and always there.
 *
 * Neon (shop-front tubes, blade signs, billboards, tower outlines) glows day and night. At night
 * (setNight) the windows light up, and street lamps glow and throw pools of coloured light.
 */
export class CityRenderer {
  readonly root: TransformNode;
  /** The ground meshes plus every chunk mesh currently built. */
  readonly meshes = new Set<Mesh>();
  private readonly chunks: Chunk[] = [];
  private readonly sources = new Map<CityModelKey, Promise<Mesh | undefined>>();
  private disposed = false;
  private night = false;
  /** Lamp heads and light pools: drawn only at night. */
  private readonly nightOnly = new Set<Mesh>();
  /** Building materials and the glow colour of their windows. */
  private readonly windowMaterials = new Map<PBRMaterial, Color3>();
  private readonly nightMaps = new Map<string, Texture>();
  private readonly neonMaterials: StandardMaterial[];
  private readonly poolMaterials: StandardMaterial[];

  private constructor(
    private readonly scene: Scene,
    private readonly onMesh?: (mesh: Mesh, kind: CityMeshKind) => void,
  ) {
    this.root = new TransformNode('city', scene);
    this.neonMaterials = CITY_NEON_COLORS.map((hex, i) => {
      const material = new StandardMaterial(`city-neon-${i}`, scene);
      material.disableLighting = true;
      material.diffuseColor = Color3.Black();
      material.emissiveColor = Color3.FromHexString(hex);
      material.freeze();
      return material;
    });
    // A soft round spot, bright in the middle and fading to nothing, added onto whatever is under it.
    const spot = new DynamicTexture('city-light-pool', { width: 128, height: 128 }, scene, false);
    const ctx = spot.getContext();
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    spot.update();
    spot.hasAlpha = true;
    this.poolMaterials = CITY_NEON_COLORS.map((hex, i) => {
      const material = new StandardMaterial(`city-pool-${i}`, scene);
      material.disableLighting = true;
      material.diffuseColor = Color3.Black();
      material.emissiveTexture = spot;
      material.opacityTexture = spot;
      material.emissiveColor = Color3.FromHexString(hex).scale(0.4); // faint, so it tints rather than whitens
      material.alphaMode = Constants.ALPHA_ADD;
      material.disableDepthWrite = true;
      material.freeze();
      return material;
    });
  }

  /** Night: lit windows, glowing lamps and pools of light under them. Neon is on either way. */
  setNight(night: boolean) {
    this.night = night;
    for (const mesh of this.nightOnly) mesh.setEnabled(night);
    for (const [material, tint] of this.windowMaterials) this.applyWindows(material, tint);
  }

  private applyWindows(material: PBRMaterial, tint: Color3) {
    material.unfreeze();
    material.emissiveColor = this.night ? tint : Color3.Black();
    material.freeze();
  }

  static create(scene: Scene, city: City, { outsideGround = true, onMesh }: CityRendererOptions = {}): CityRenderer {
    const renderer = new CityRenderer(scene, onMesh);
    renderer.addGround(city, outsideGround);
    const chunks = new Map<string, Chunk>();
    const chunkAt = (x: number, z: number) => {
      const cx = Math.floor(x / CHUNK);
      const cz = Math.floor(z / CHUNK);
      const key = `${cx},${cz}`;
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { key, x0: cx * CHUNK, z0: cz * CHUNK, byModel: new Map(), neon: new Map(), lights: new Map(), state: 'empty', meshes: [], t: 0 };
        chunks.set(key, chunk);
      }
      return chunk;
    };
    const addTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
      const list = map.get(key);
      if (list) list.push(value);
      else map.set(key, [value]);
    };
    for (const o of [...city.roads, ...city.objects]) addTo(chunkAt(o.x, o.z).byModel, o.model, o);
    for (const n of city.neon) addTo(chunkAt(n.x, n.z).neon, n.color, n);
    for (const l of city.lights) addTo(chunkAt(l.x, l.z).lights, l.color, l);
    renderer.chunks.push(...chunks.values());
    return renderer;
  }

  /** Chunks currently on screen (built or on their way up or down), for a HUD. */
  get chunksShown(): number {
    return this.chunks.filter((c) => c.state !== 'empty').length;
  }

  /** Builds chunks coming into range (nearest first), takes down ones left behind, animates both. */
  update(focus: { x: number; z: number }, dt: number) {
    let next: Chunk | undefined;
    let nearest = Infinity;
    for (const chunk of this.chunks) {
      const dx = Math.max(chunk.x0 - focus.x, 0, focus.x - (chunk.x0 + CHUNK));
      const dz = Math.max(chunk.z0 - focus.z, 0, focus.z - (chunk.z0 + CHUNK));
      const distance = Math.hypot(dx, dz);
      if (chunk.state === 'empty' && distance < BUILD_RADIUS && distance < nearest) {
        next = chunk;
        nearest = distance;
      } else if ((chunk.state === 'built' || chunk.state === 'rising') && distance > KEEP_RADIUS) {
        chunk.state = 'sinking';
        for (const mesh of chunk.meshes) mesh.unfreezeWorldMatrix();
      } else if (chunk.state === 'sinking' && distance < BUILD_RADIUS) {
        chunk.state = 'rising'; // came back before it was gone
      }
      this.animate(chunk, dt);
    }
    // One chunk at a time, so a frame never has to build half the city.
    if (next && !this.chunks.some((c) => c.state === 'loading')) void this.build(next);
  }

  private animate(chunk: Chunk, dt: number) {
    if (chunk.state === 'rising') {
      chunk.t = Math.min(1, chunk.t + dt / RISE_SECONDS);
      if (chunk.t >= 1) {
        chunk.state = 'built';
        for (const mesh of chunk.meshes) {
          mesh.scaling.y = 1;
          mesh.freezeWorldMatrix();
        }
        return;
      }
    } else if (chunk.state === 'sinking') {
      chunk.t = Math.max(0, chunk.t - dt / SINK_SECONDS);
      if (chunk.t <= 0) {
        for (const mesh of chunk.meshes) {
          this.meshes.delete(mesh);
          mesh.dispose(false, false); // materials are shared with the other chunks
        }
        chunk.meshes = [];
        chunk.state = 'empty';
        return;
      }
    } else {
      return;
    }
    // Instances are placed first and the mesh's own scale applies after, so scaling Y squashes the
    // whole chunk down onto the ground (y = 0): it grows up out of the street, or sinks into it.
    const k = chunk.t * chunk.t * (3 - 2 * chunk.t);
    for (const mesh of chunk.meshes) mesh.scaling.y = Math.max(k, 0.001);
  }

  private async build(chunk: Chunk) {
    chunk.state = 'loading';
    const models = [...chunk.byModel.keys()];
    const sources = await Promise.all(models.map((model) => this.source(model)));
    if (this.disposed) return;
    const scale = new Vector3(CITY_UNIT, CITY_UNIT, CITY_UNIT);
    const rotation = new Quaternion();
    const position = new Vector3();
    const m = new Matrix();
    models.forEach((model, i) => {
      const source = sources[i];
      if (!source) return;
      const objects = chunk.byModel.get(model)!;
      const mesh = source.clone(`city-${model}-${chunk.key}`, this.root);
      // Its own geometry: meshes sharing one mix up their thin-instance buffers (Babylon caches
      // the vertex array object on the geometry), and all but one batch draw garbage.
      mesh.makeGeometryUnique();
      mesh.setEnabled(true);
      const matrices = new Float32Array(objects.length * 16);
      objects.forEach((o, j) => {
        Quaternion.RotationYawPitchRollToRef(o.yaw, 0, 0, rotation);
        position.set(o.x, o.y, o.z);
        Matrix.ComposeToRef(scale, rotation, position, m);
        m.copyToArray(matrices, j * 16);
      });
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
      mesh.thinInstanceRefreshBoundingInfo(false);
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      this.addToChunk(chunk, mesh, 'building');
    });

    // Neon tubes and signs, and at night the lamp heads, one batch per colour.
    for (const [color, boxes] of chunk.neon) {
      this.addBoxes(chunk, `city-neon-${color}-${chunk.key}`, boxes, this.neonMaterials[color], 'neon');
    }
    for (const [color, lights] of chunk.lights) {
      const heads = lights.map((l) => ({ x: l.x, y: l.y, z: l.z, hx: 0.35, hy: 0.07, hz: 0.35 }));
      this.addBoxes(chunk, `city-lamp-${color}-${chunk.key}`, heads, this.neonMaterials[color], 'lamp');
      const pool = MeshBuilder.CreateGround(`city-pool-${color}-${chunk.key}`, { width: 1, height: 1 }, this.scene);
      pool.material = this.poolMaterials[color];
      const matrices = new Float32Array(lights.length * 16);
      lights.forEach((l, j) => {
        Matrix.ComposeToRef(new Vector3(POOL_RADIUS * 2, 1, POOL_RADIUS * 2), Quaternion.Identity(), new Vector3(l.x, POOL_Y, l.z), m);
        m.copyToArray(matrices, j * 16);
      });
      pool.thinInstanceSetBuffer('matrix', matrices, 16, true);
      pool.thinInstanceRefreshBoundingInfo(false);
      this.addToChunk(chunk, pool, 'pool');
    }
    chunk.t = 0;
    chunk.state = 'rising';
  }

  /** Unit boxes stretched into place as thin instances. */
  private addBoxes(chunk: Chunk, name: string, boxes: { x: number; y: number; z: number; hx: number; hy: number; hz: number }[], material: StandardMaterial, kind: CityMeshKind) {
    const mesh = MeshBuilder.CreateBox(name, { size: 1 }, this.scene);
    mesh.material = material;
    const matrices = new Float32Array(boxes.length * 16);
    const m = new Matrix();
    boxes.forEach((b, j) => {
      Matrix.ComposeToRef(new Vector3(b.hx * 2, b.hy * 2, b.hz * 2), Quaternion.Identity(), new Vector3(b.x, b.y, b.z), m);
      m.copyToArray(matrices, j * 16);
    });
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
    this.addToChunk(chunk, mesh, kind);
  }

  private addToChunk(chunk: Chunk, mesh: Mesh, kind: CityMeshKind) {
    mesh.parent = this.root;
    mesh.isPickable = false;
    mesh.scaling.y = 0.001;
    if (kind === 'building') mesh.receiveShadows = true;
    if (kind === 'lamp' || kind === 'pool') {
      this.nightOnly.add(mesh);
      mesh.setEnabled(this.night);
      mesh.onDisposeObservable.addOnce(() => this.nightOnly.delete(mesh));
    }
    chunk.meshes.push(mesh);
    this.meshes.add(mesh);
    this.onMesh?.(mesh, kind);
  }

  /** The model loaded and merged into one hidden mesh, loaded once on first use. */
  private source(model: CityModelKey): Promise<Mesh | undefined> {
    let source = this.sources.get(model);
    if (!source) {
      source = this.loadSource(model).catch((error: unknown) => {
        console.error(`Failed to load city model ${model}`, error);
        return undefined;
      });
      this.sources.set(model, source);
    }
    return source;
  }

  private async loadSource(model: CityModelKey): Promise<Mesh | undefined> {
    const container = await LoadAssetContainerAsync(CITY_MODELS[model].url, this.scene);
    const parts = container.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
    container.addAllToScene();
    for (const part of parts) part.computeWorldMatrix(true);
    const merged = parts.length === 1 ? parts[0] : Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    if (!merged) return undefined;
    // Bake the model's own placement into the vertices, then drop the loader's root node.
    merged.setParent(null);
    merged.bakeCurrentTransformIntoVertices();
    for (const node of container.rootNodes) if (node !== merged) node.dispose();
    merged.name = `city-source-${model}`;
    merged.parent = this.root;
    if (merged.material instanceof PBRMaterial) this.addWindows(model, merged.material);
    merged.material?.freeze();
    merged.setEnabled(false); // never drawn itself; chunks draw copies of it
    return merged;
  }

  /** Building windows glow at night: the kit's night map lights just the window glass. */
  private addWindows(model: CityModelKey, material: PBRMaterial) {
    const kit = model.split('/')[0];
    const brightness = WINDOW_BRIGHTNESS[kit];
    if (brightness === undefined) return; // roads and props have no windows
    const url = CITY_MODELS[model].url.replace(/[^/]+\.glb$/, 'Textures/colormap-night.png');
    let map = this.nightMaps.get(url);
    if (!map) {
      map = new Texture(url, this.scene, false, false); // glTF textures aren't flipped
      this.nightMaps.set(url, map);
    }
    let hash = 0;
    for (let i = 0; i < model.length; i++) hash = (hash * 31 + model.charCodeAt(i)) >>> 0;
    const tint = WINDOW_TINTS[hash % WINDOW_TINTS.length].scale(brightness);
    material.emissiveTexture = map;
    this.windowMaterials.set(material, tint);
    this.applyWindows(material, tint);
  }

  /** Lots in their district's colour, flush with the sidewalks; grass all round the city. */
  private addGround(city: City, outside: boolean) {
    const materials = {} as Record<CityZone | 'outside', StandardMaterial>;
    for (const [zone, colour] of Object.entries(GROUND_COLOURS) as [CityZone | 'outside', Color3][]) {
      const material = new StandardMaterial(`city-ground-${zone}`, this.scene);
      material.diffuseColor = colour;
      material.specularColor = Color3.Black();
      materials[zone] = material;
    }

    const byZone = new Map<CityZone, Float32Array>();
    for (const zone of ['residential', 'commercial', 'industrial'] as const) {
      const blocks = city.blocks.filter((b) => b.zone === zone);
      const matrices = new Float32Array(blocks.length * 16);
      blocks.forEach((b, i) => {
        Matrix.ComposeToRef(
          new Vector3(b.x1 - b.x0, KERB_HEIGHT, b.z1 - b.z0),
          Quaternion.Identity(),
          new Vector3((b.x0 + b.x1) / 2, KERB_HEIGHT / 2, (b.z0 + b.z1) / 2),
          Matrix.Identity(),
        ).copyToArray(matrices, i * 16);
      });
      byZone.set(zone, matrices);
    }
    for (const [zone, matrices] of byZone) {
      const box = MeshBuilder.CreateBox(`city-lots-${zone}`, { size: 1 }, this.scene);
      box.material = materials[zone];
      box.parent = this.root;
      box.thinInstanceSetBuffer('matrix', matrices, 16, true);
      box.thinInstanceRefreshBoundingInfo(false);
      box.receiveShadows = true;
      box.isPickable = false;
      this.meshes.add(box);
      this.onMesh?.(box, 'ground');
    }

    if (outside) {
      const { x0, z0, x1, z1 } = city.bounds;
      const margin = 400;
      const ground = MeshBuilder.CreateGround('city-outside', { width: x1 - x0 + 2 * margin, height: z1 - z0 + 2 * margin }, this.scene);
      ground.position.set((x0 + x1) / 2, -0.03, (z0 + z1) / 2);
      ground.material = materials.outside;
      ground.parent = this.root;
      ground.receiveShadows = true;
      ground.isPickable = false;
      this.meshes.add(ground);
      this.onMesh?.(ground, 'ground');
    }
  }

  dispose() {
    this.disposed = true;
    this.root.dispose(false, true);
  }
}
