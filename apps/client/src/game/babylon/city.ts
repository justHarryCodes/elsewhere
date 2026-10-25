import {
  Color3,
  Constants,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  type Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import {
  CITY_NEON_COLORS,
  KERB_HEIGHT,
  type City,
  type CityLight,
  type CityLot,
  type CityNeon,
  type CityPiece,
  type CityShape,
} from '@game/shared';
import { type Batch, MegaKit, ROOM_MATERIALS, ROOM_TEXTURES } from '../megakit';

// The city streams in square chunks round the player: built (rising out of the ground) when they
// come within BUILD_RADIUS, taken down again (sinking away) once they're past KEEP_RADIUS. The gap
// between the two stops a chunk on the edge flickering in and out.
const CHUNK = 120;
const BUILD_RADIUS = 260;
const KEEP_RADIUS = 360;
const RISE_SECONDS = 0.7;
const SINK_SECONDS = 0.5;
const POOL_RADIUS = 7; // metres of road lit under a street lamp
const POOL_Y = KERB_HEIGHT + 0.03; // just above the sidewalks, so the light pools never flicker into them

// The kit's triangles (and the ground's) wind counter-clockwise, glTF style; in this right-handed scene
// that's the front, as Babylon's own glTF loader sets it.
const FRONT_FACES = Constants.MATERIAL_CounterClockWiseSideOrientation;

// What lit windows glow at night: warm rooms, cool rooms (the two room pictures), the town's windows.
const TOWN_GLASS = 'ub-glass';
const ROOM_GLOW: Record<string, Color3> = {
  'room-lit-0': new Color3(1, 0.78, 0.5),
  'room-lit-1': new Color3(0.65, 0.85, 1),
  [TOWN_GLASS]: new Color3(1, 0.75, 0.42),
};


/** What a city mesh is, for callers that treat them differently (e.g. only neon in a glow layer). */
export type CityMeshKind = 'ground' | 'building' | 'neon' | 'lamp' | 'pool';

interface Chunk {
  key: string;
  /** Bounds of the chunk, metres. */
  x0: number;
  z0: number;
  pieces: CityPiece[];
  shapes: CityShape[];
  neon: Map<number, CityNeon[]>;
  lights: Map<number, CityLight[]>;
  state: 'empty' | 'loading' | 'rising' | 'built' | 'sinking';
  meshes: Mesh[];
  /** Progress of the current rise or sink, 0..1. */
  t: number;
}

export interface CityRendererOptions {
  /** Ground all round the city (off when the scene has its own ground there). */
  outsideGround?: boolean;
  /** Called for every mesh the city creates, e.g. to keep all but the neon out of a glow layer. */
  onMesh?: (mesh: Mesh, kind: CityMeshKind) => void;
}

/**
 * Draws a generated city from the MegaKit, streamed in chunks round a focus point (the player): call
 * update() every frame. A chunk's streets, buildings and props are welded into one mesh per material
 * (a dozen draw calls), so it costs the same however many pieces it took to build.
 *
 * Neon (shop-front tubes, blade signs, billboards, tower outlines) glows day and night. At night
 * (setNight) the lit rooms behind the windows glow, and street lamps throw pools of coloured light.
 */
export class CityRenderer {
  readonly root: TransformNode;
  /** The ground meshes plus every chunk mesh currently built. */
  readonly meshes = new Set<Mesh>();
  private readonly chunks: Chunk[] = [];
  private kit?: MegaKit;
  private readonly kitLoading: Promise<MegaKit>;
  private disposed = false;
  private night = false;
  /** Lamp heads and light pools: drawn only at night. */
  private readonly nightOnly = new Set<Mesh>();
  private readonly materials = new Map<string, PBRMaterial>();
  private readonly textures = new Map<string, Texture>();
  private readonly neonMaterials: StandardMaterial[];
  private readonly poolMaterials: StandardMaterial[];
  private readonly shapeMaterials = new Map<string, PBRMaterial>();

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
      material.emissiveColor = Color3.FromHexString(hex).scale(0.18); // faint, so it tints rather than whitens
      material.alphaMode = Constants.ALPHA_ADD;
      material.disableDepthWrite = true;
      material.freeze();
      return material;
    });
    this.kitLoading = MegaKit.load().then((kit) => (this.kit = kit));
  }

  static create(scene: Scene, city: City, { outsideGround = true, onMesh }: CityRendererOptions = {}): CityRenderer {
    const renderer = new CityRenderer(scene, onMesh);
    const chunks = new Map<string, Chunk>();
    const chunkAt = (x: number, z: number) => {
      const cx = Math.floor(x / CHUNK);
      const cz = Math.floor(z / CHUNK);
      const key = `${cx},${cz}`;
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { key, x0: cx * CHUNK, z0: cz * CHUNK, pieces: [], shapes: [], neon: new Map(), lights: new Map(), state: 'empty', meshes: [], t: 0 };
        chunks.set(key, chunk);
      }
      return chunk;
    };
    const addTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
      const list = map.get(key);
      if (list) list.push(value);
      else map.set(key, [value]);
    };
    for (const p of city.streets) chunkAt(p.x, p.z).pieces.push(p);
    for (const p of city.props) chunkAt(p.x, p.z).pieces.push(p);
    // A building goes with the chunk its middle is in.
    for (const b of city.buildings) chunkAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2).pieces.push(...b.pieces);
    for (const s of city.shapes) chunkAt(s.x, s.z).shapes.push(s);
    for (const n of city.neon) addTo(chunkAt(n.x, n.z).neon, n.color, n);
    for (const l of city.lights) addTo(chunkAt(l.x, l.z).lights, l.color, l);
    renderer.chunks.push(...chunks.values());
    void renderer.kitLoading.then(() => {
      if (!renderer.disposed) renderer.addGround(city, outsideGround);
    });
    return renderer;
  }

  /** Night: lit windows, glowing lamps and pools of light under them. Neon is on either way. */
  setNight(night: boolean) {
    this.night = night;
    for (const mesh of this.nightOnly) mesh.setEnabled(night);
    for (const key of [...ROOM_MATERIALS, TOWN_GLASS]) {
      const material = this.materials.get(key);
      if (material) this.applyRoom(key, material);
    }
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
    // One chunk per frame at most, so a frame never has to build half the city.
    if (next && this.kit) this.build(next, this.kit);
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
    // The mesh's own scale applies after its vertices are placed, so scaling Y squashes the whole
    // chunk down onto the ground (y = 0): it grows up out of the street, or sinks into it.
    const k = chunk.t * chunk.t * (3 - 2 * chunk.t);
    for (const mesh of chunk.meshes) mesh.scaling.y = Math.max(k, 0.001);
  }

  private build(chunk: Chunk, kit: MegaKit) {
    chunk.state = 'loading';
    for (const [key, batch] of kit.weld(chunk.pieces)) {
      this.addToChunk(chunk, this.batchMesh(`city-${key}-${chunk.key}`, batch, this.material(kit, key)), 'building');
    }
    // Tanks, chimneys, containers and lamp posts: one batch per shape and colour.
    const shapes = new Map<string, CityShape[]>();
    for (const s of chunk.shapes) {
      const key = `${s.kind}|${s.color}`;
      const list = shapes.get(key);
      if (list) list.push(s);
      else shapes.set(key, [s]);
    }
    for (const [key, list] of shapes) {
      const [kind, color] = key.split('|');
      const mesh =
        kind === 'box'
          ? MeshBuilder.CreateBox(`city-shape-${key}-${chunk.key}`, { size: 1 }, this.scene)
          : MeshBuilder.CreateCylinder(`city-shape-${key}-${chunk.key}`, { diameter: 1, height: 1, tessellation: 20 }, this.scene);
      mesh.material = this.shapeMaterial(color);
      // Unit shapes centred on the origin: lift by half their height so y is their base.
      this.setInstances(
        mesh,
        list.map((s) => ({ x: s.x, y: s.y + s.h / 2, z: s.z, sx: s.w, sy: s.h, sz: s.d, yaw: s.yaw })),
      );
      this.addToChunk(chunk, mesh, 'building');
    }
    // Neon tubes and signs, and at night the lamp heads, one batch per colour.
    for (const [color, boxes] of chunk.neon) {
      const mesh = MeshBuilder.CreateBox(`city-neon-${color}-${chunk.key}`, { size: 1 }, this.scene);
      mesh.material = this.neonMaterials[color];
      this.setInstances(mesh, boxes.map((b) => ({ x: b.x, y: b.y, z: b.z, sx: b.hx * 2, sy: b.hy * 2, sz: b.hz * 2, yaw: 0 })));
      this.addToChunk(chunk, mesh, 'neon');
    }
    for (const [color, lights] of chunk.lights) {
      const heads = MeshBuilder.CreateBox(`city-lamp-${color}-${chunk.key}`, { size: 1 }, this.scene);
      heads.material = this.neonMaterials[color];
      this.setInstances(heads, lights.map((l) => ({ x: l.x, y: l.y, z: l.z, sx: 0.6, sy: 0.12, sz: 0.6, yaw: 0 })));
      this.addToChunk(chunk, heads, 'lamp');
      const pool = MeshBuilder.CreateGround(`city-pool-${color}-${chunk.key}`, { width: 1, height: 1 }, this.scene);
      pool.material = this.poolMaterials[color];
      this.setInstances(pool, lights.map((l) => ({ x: l.x, y: POOL_Y, z: l.z, sx: POOL_RADIUS * 2, sy: 1, sz: POOL_RADIUS * 2, yaw: 0 })));
      this.addToChunk(chunk, pool, 'pool');
    }
    chunk.t = 0;
    chunk.state = 'rising';
  }

  private batchMesh(name: string, batch: Batch, material: PBRMaterial): Mesh {
    const mesh = new Mesh(name, this.scene);
    const data = new VertexData();
    data.positions = batch.positions;
    data.normals = batch.normals;
    data.uvs = batch.uvs;
    if (batch.colors) data.colors = batch.colors;
    data.indices = batch.indices;
    data.applyToMesh(mesh, false);
    mesh.material = material;
    return mesh;
  }

  private setInstances(mesh: Mesh, items: { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number }[]) {
    const matrices = new Float32Array(items.length * 16);
    const m = new Matrix();
    const rotation = new Quaternion();
    items.forEach((it, j) => {
      Quaternion.RotationYawPitchRollToRef(it.yaw, 0, 0, rotation);
      Matrix.ComposeToRef(new Vector3(it.sx, it.sy, it.sz), rotation, new Vector3(it.x, it.y, it.z), m);
      m.copyToArray(matrices, j * 16);
    });
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
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

  // ------------------------------------------------------------------ materials

  /** A texture by URL, made once. `pixel`: a tiny palette, sampled without blurring between cells. */
  private texture(url: string, pixel = false): Texture {
    let texture = this.textures.get(url);
    if (!texture) {
      // The packs' UVs are glTF's (not flipped).
      texture = pixel
        ? new Texture(url, this.scene, { invertY: false, noMipmap: true, samplingMode: Texture.NEAREST_SAMPLINGMODE })
        : new Texture(url, this.scene, { invertY: false });
      this.textures.set(url, texture);
    }
    return texture;
  }

  /** The PBR material for a kit material (or a window room) by name, made once. */
  private material(kit: MegaKit, key: string): PBRMaterial {
    let material = this.materials.get(key);
    if (material) return material;
    material = new PBRMaterial(`city-${key}`, this.scene);
    material.sideOrientation = FRONT_FACES;
    const room = (ROOM_MATERIALS as readonly string[]).includes(key);
    if (room) {
      // A photo of a room behind the glass: lit by the street by day, glowing by itself at night.
      material.albedoTexture = this.texture(ROOM_TEXTURES[key as keyof typeof ROOM_TEXTURES]);
      material.metallic = 0;
      material.roughness = 0.9;
      this.applyRoom(key, material);
    } else {
      // A building colour scheme: "ub#3" is material "ub" with its fourth palette.
      const [name, skin] = key.split('#');
      const k = kit.materials.get(name);
      const base = skin !== undefined && k?.skins ? k.skins[Number(skin)] : k?.base;
      if (k && base) material.albedoTexture = this.texture(kit.textureUrl(k, base), k.pixel);
      else if (k?.color) material.albedoColor = new Color3(k.color[0], k.color[1], k.color[2]);
      if (k?.normal) {
        material.bumpTexture = this.texture(kit.textureUrl(k, k.normal));
        // glTF normal maps in a right-handed scene (what Babylon's own glTF loader does).
        material.invertNormalMapY = true;
      }
      if (k?.orm) {
        material.metallicTexture = this.texture(kit.textureUrl(k, k.orm));
        material.useAmbientOcclusionFromMetallicTextureRed = true;
        material.useRoughnessFromMetallicTextureGreen = true;
        material.useMetallnessFromMetallicTextureBlue = true;
        material.metallic = 1;
        material.roughness = 1;
      } else {
        material.metallic = 0;
        material.roughness = k?.pixel || k?.dir.includes('/town/') ? 0.85 : 0.6;
      }
      if (k?.cutout) {
        // Leaves and petals: cut out where the texture is clear, both sides drawn.
        material.useAlphaFromAlbedoTexture = true;
        if (material.albedoTexture) material.albedoTexture.hasAlpha = true;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
        material.alphaCutOff = 0.5;
        material.backFaceCulling = false;
        material.twoSidedLighting = true;
      }
      if (k?.vertexColors) material.albedoColor = Color3.White(); // the colour is in the vertices
      if (key === TOWN_GLASS) {
        // The town's windows: glossy blue-grey glass that glows warm at night.
        material.roughness = 0.15;
        material.metallic = 0.1;
        this.materials.set(key, material);
        this.applyRoom(key, material);
        return material;
      }
      if (key === 'MI_Glass') {
        // Dark, glossy glass the rooms show through.
        material.alpha = k?.color?.[3] ?? 0.6;
        material.roughness = 0.05;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      } else if (k?.blend) {
        // Street markings: cut out where the decal texture is clear.
        material.useAlphaFromAlbedoTexture = true;
        if (material.albedoTexture) material.albedoTexture.hasAlpha = true;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
        material.alphaCutOff = 0.4;
        material.zOffset = -2; // painted on the asphalt at the same height: drawn just in front of it
      }
      material.freeze();
    }
    this.materials.set(key, material);
    return material;
  }

  private applyRoom(key: string, material: PBRMaterial) {
    material.unfreeze();
    const glow = ROOM_GLOW[key];
    if (this.night && glow) {
      material.emissiveTexture = material.albedoTexture;
      material.emissiveColor = glow;
    } else {
      material.emissiveTexture = null;
      material.emissiveColor = Color3.Black();
    }
    material.freeze();
  }

  private shapeMaterial(hex: string): PBRMaterial {
    let material = this.shapeMaterials.get(hex);
    if (!material) {
      material = new PBRMaterial(`city-paint-${hex}`, this.scene);
      material.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      material.metallic = 0.35;
      material.roughness = 0.55;
      material.freeze();
      this.shapeMaterials.set(hex, material);
    }
    return material;
  }

  // ------------------------------------------------------------------ ground

  /**
   * The ground between the streets, flush with the sidewalks: paving on every block, with parking lots
   * (asphalt and white bays), plazas, works yards and bare dirt laid on top. Cheap enough to keep whole.
   */
  private addGround(city: City, outside: boolean) {
    const kit = this.kit!;
    const surface = (key: string, texture: string, tile: number) => {
      const material = new PBRMaterial(`city-ground-${key}`, this.scene);
      material.sideOrientation = FRONT_FACES;
      material.albedoTexture = this.texture(texture);
      material.metallic = 0;
      material.roughness = 0.95;
      return { material, tile };
    };
    const url = (name: string) => {
      const m = kit.materials.get(name)!;
      return kit.textureUrl(m, m.base);
    };
    const surfaces = {
      paving: surface('paving', url('MI_Concrete'), 6),
      plaza: surface('plaza', url('MI_Concrete'), 3),
      path: surface('path', url('MI_Concrete'), 2),
      lawn: surface('lawn', url('town-lawn'), 5),
      asphalt: surface('asphalt', url('MI_Asphalt'), 8),
      dirt: surface('dirt', url('MI_Dirt'), 6),
    };
    const quads = new Map<keyof typeof surfaces, { x0: number; z0: number; x1: number; z1: number; y: number }[]>();
    const add = (key: keyof typeof surfaces, r: { x0: number; z0: number; x1: number; z1: number }, y: number) => {
      const list = quads.get(key) ?? [];
      list.push({ ...r, y });
      quads.set(key, list);
    };
    for (const b of city.blocks) add('paving', b, KERB_HEIGHT);
    // Laid in layers: lawn over the block's paving, then lots, then paths on top.
    const kinds: Record<CityLot['kind'], [keyof typeof surfaces, number]> = {
      lawn: ['lawn', 0.005],
      parking: ['asphalt', 0.01],
      yard: ['asphalt', 0.01],
      plaza: ['plaza', 0.01],
      dirt: ['dirt', 0.01],
      path: ['path', 0.015],
    };
    for (const lot of city.lots) add(kinds[lot.kind][0], lot, KERB_HEIGHT + kinds[lot.kind][1]);
    for (const [key, list] of quads) {
      const { material, tile } = surfaces[key];
      const mesh = this.quadMesh(`city-ground-${key}`, list, tile);
      mesh.material = material;
      this.addGroundMesh(mesh);
    }

    // White parking bays: 2.6 m apart, a row along each long side of the lot.
    const lines: { x0: number; z0: number; x1: number; z1: number; y: number }[] = [];
    for (const lot of city.lots) {
      if (lot.kind !== 'parking') continue;
      const alongX = lot.x1 - lot.x0 > lot.z1 - lot.z0;
      const length = alongX ? lot.x1 - lot.x0 : lot.z1 - lot.z0;
      for (let t = 0; t <= length + 0.01; t += 2.6) {
        for (const [from, to] of [
          [0.5, 5.5],
          [11.5, 16.5],
        ]) {
          lines.push(
            alongX
              ? { x0: lot.x0 + t - 0.06, x1: lot.x0 + t + 0.06, z0: lot.z0 + from, z1: lot.z0 + to, y: KERB_HEIGHT + 0.02 }
              : { z0: lot.z0 + t - 0.06, z1: lot.z0 + t + 0.06, x0: lot.x0 + from, x1: lot.x0 + to, y: KERB_HEIGHT + 0.02 },
          );
        }
      }
    }
    if (lines.length) {
      const paint = new StandardMaterial('city-bay-paint', this.scene);
      paint.diffuseColor = new Color3(0.85, 0.85, 0.82);
      paint.specularColor = Color3.Black();
      paint.sideOrientation = FRONT_FACES;
      const mesh = this.quadMesh('city-bays', lines, 1);
      mesh.material = paint;
      this.addGroundMesh(mesh);
    }

    if (outside) {
      const { x0, z0, x1, z1 } = city.bounds;
      const margin = 400;
      const ground = this.quadMesh('city-outside', [{ x0: x0 - margin, z0: z0 - margin, x1: x1 + margin, z1: z1 + margin, y: -0.03 }], 10);
      ground.material = surfaces.lawn.material;
      this.addGroundMesh(ground);
    }
  }

  /** Flat, upward-facing rectangles in one mesh, textured in world space (one repeat every `tile` m). */
  private quadMesh(name: string, quads: { x0: number; z0: number; x1: number; z1: number; y: number }[], tile: number): Mesh {
    const positions = new Float32Array(quads.length * 12);
    const normals = new Float32Array(quads.length * 12);
    const uvs = new Float32Array(quads.length * 8);
    const indices = new Uint32Array(quads.length * 6);
    quads.forEach((q, i) => {
      const corners = [
        [q.x0, q.z0],
        [q.x1, q.z0],
        [q.x1, q.z1],
        [q.x0, q.z1],
      ];
      corners.forEach(([x, z], c) => {
        positions.set([x, q.y, z], i * 12 + c * 3);
        normals.set([0, 1, 0], i * 12 + c * 3);
        uvs.set([x / tile, z / tile], i * 8 + c * 2);
      });
      // Counter-clockwise seen from above.
      indices.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    });
    const mesh = new Mesh(name, this.scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh, false);
    return mesh;
  }

  private addGroundMesh(mesh: Mesh) {
    mesh.parent = this.root;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    this.meshes.add(mesh);
    this.onMesh?.(mesh, 'ground');
  }

  dispose() {
    this.disposed = true;
    this.root.dispose(false, true);
    for (const texture of this.textures.values()) texture.dispose();
  }
}
