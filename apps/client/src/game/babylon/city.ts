import {
  Color3,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CITY_MODELS, CITY_UNIT, KERB_HEIGHT, type City, type CityModelKey, type CityObject, type CityZone } from '@game/shared';

// The city is cut into square chunks so the camera only draws the ones in view.
const CHUNK = 200;

const GROUND_COLOURS: Record<CityZone | 'outside', Color3> = {
  residential: new Color3(0.36, 0.55, 0.3),
  commercial: new Color3(0.54, 0.54, 0.52),
  industrial: new Color3(0.44, 0.44, 0.42),
  outside: new Color3(0.4, 0.52, 0.34),
};

/**
 * Draws a generated city. Every model is loaded once and merged into one mesh; each copy of it is a
 * thin instance of that mesh, one batch per model per 200 m chunk, so the city costs a few hundred
 * draw calls (fewer for what's off screen) rather than one per building.
 */
export class CityRenderer {
  readonly root: TransformNode;
  readonly meshes: Mesh[] = [];

  private constructor(private readonly scene: Scene) {
    this.root = new TransformNode('city', scene);
  }

  static async create(scene: Scene, city: City, { outsideGround = true } = {}): Promise<CityRenderer> {
    const renderer = new CityRenderer(scene);
    renderer.addGround(city, outsideGround);
    const byModel = new Map<CityModelKey, CityObject[]>();
    for (const o of [...city.roads, ...city.objects]) {
      const list = byModel.get(o.model);
      if (list) list.push(o);
      else byModel.set(o.model, [o]);
    }
    await Promise.all([...byModel].map(([model, objects]) => renderer.addModel(model, objects)));
    return renderer;
  }

  private async addModel(model: CityModelKey, objects: CityObject[]) {
    const container = await LoadAssetContainerAsync(CITY_MODELS[model].url, this.scene);
    const parts = container.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
    container.addAllToScene();
    for (const part of parts) part.computeWorldMatrix(true);
    const merged = parts.length === 1 ? parts[0] : Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    if (!merged) return;
    // Bake the model's own placement into the vertices, then drop the loader's root node.
    merged.setParent(null);
    merged.bakeCurrentTransformIntoVertices();
    for (const node of container.rootNodes) if (node !== merged) node.dispose();
    merged.name = `city-${model}`;
    merged.parent = this.root;
    merged.material?.freeze();
    merged.setEnabled(false); // the source; each chunk draws a copy of it

    const chunks = new Map<string, CityObject[]>();
    for (const o of objects) {
      const key = `${Math.floor(o.x / CHUNK)},${Math.floor(o.z / CHUNK)}`;
      const list = chunks.get(key);
      if (list) list.push(o);
      else chunks.set(key, [o]);
    }
    const scale = new Vector3(CITY_UNIT, CITY_UNIT, CITY_UNIT);
    const rotation = new Quaternion();
    const position = new Vector3();
    const m = new Matrix();
    for (const [key, list] of chunks) {
      const mesh = merged.clone(`city-${model}-${key}`, this.root);
      // Its own geometry: meshes sharing one mix up their thin-instance buffers (Babylon caches
      // the vertex array object on the geometry), and all but one batch draw garbage.
      mesh.makeGeometryUnique();
      mesh.setEnabled(true);
      const matrices = new Float32Array(list.length * 16);
      list.forEach((o, i) => {
        Quaternion.RotationYawPitchRollToRef(o.yaw, 0, 0, rotation);
        position.set(o.x, o.y, o.z);
        Matrix.ComposeToRef(scale, rotation, position, m);
        m.copyToArray(matrices, i * 16);
      });
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
      mesh.thinInstanceRefreshBoundingInfo(false);
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      this.meshes.push(mesh);
    }
    merged.dispose(false, false); // keep the material: the copies use it
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
      this.meshes.push(box);
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
      this.meshes.push(ground);
    }
  }

  dispose() {
    this.root.dispose(false, true);
  }
}
