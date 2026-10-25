import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY_MODELS, CITY_UNIT, KERB_HEIGHT, type City, type CityModelKey, type CityObject, type CityZone } from '@game/shared';

// Same look and batching as the Babylon CityRenderer: one InstancedMesh per model part per chunk.
const CHUNK = 200;
const GROUND_COLOURS: Record<CityZone | 'outside', number> = {
  residential: 0x5c8c4d,
  commercial: 0x8a8a85,
  industrial: 0x70706b,
  outside: 0x668557,
};

/** Three.js counterpart of the Babylon CityRenderer. */
export class CityRenderer {
  readonly root = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  static async create(city: City): Promise<CityRenderer> {
    const renderer = new CityRenderer();
    renderer.root.name = 'city';
    renderer.addGround(city);
    const byModel = new Map<CityModelKey, CityObject[]>();
    for (const o of [...city.roads, ...city.objects]) {
      const list = byModel.get(o.model);
      if (list) list.push(o);
      else byModel.set(o.model, [o]);
    }
    const loader = new GLTFLoader();
    await Promise.all([...byModel].map(([model, objects]) => renderer.addModel(loader, model, objects)));
    return renderer;
  }

  private async addModel(loader: GLTFLoader, model: CityModelKey, objects: CityObject[]) {
    const gltf = await loader.loadAsync(CITY_MODELS[model].url);
    gltf.scene.updateMatrixWorld(true);
    const parts: THREE.Mesh[] = [];
    gltf.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) parts.push(node);
    });

    const chunks = new Map<string, CityObject[]>();
    for (const o of objects) {
      const key = `${Math.floor(o.x / CHUNK)},${Math.floor(o.z / CHUNK)}`;
      const list = chunks.get(key);
      if (list) list.push(o);
      else chunks.set(key, [o]);
    }
    const scale = new THREE.Vector3(CITY_UNIT, CITY_UNIT, CITY_UNIT);
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const placed = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    for (const part of parts) {
      // Bake the part's place in its model into the shared geometry.
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
      this.disposables.push(geometry);
      for (const list of chunks.values()) {
        const mesh = new THREE.InstancedMesh(geometry, part.material, list.length);
        list.forEach((o, i) => {
          rotation.setFromAxisAngle(up, o.yaw);
          placed.compose(new THREE.Vector3(o.x, o.y, o.z), rotation, scale);
          mesh.setMatrixAt(i, matrix.copy(placed));
        });
        mesh.computeBoundingSphere(); // so whole off-screen chunks are skipped
        mesh.receiveShadow = true;
        this.root.add(mesh);
      }
    }
  }

  private addGround(city: City) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(box);
    for (const zone of ['residential', 'commercial', 'industrial'] as const) {
      const blocks = city.blocks.filter((b) => b.zone === zone);
      const material = new THREE.MeshStandardMaterial({ color: GROUND_COLOURS[zone], roughness: 1 });
      this.disposables.push(material);
      const mesh = new THREE.InstancedMesh(box, material, blocks.length);
      const m = new THREE.Matrix4();
      blocks.forEach((b, i) => {
        m.compose(
          new THREE.Vector3((b.x0 + b.x1) / 2, KERB_HEIGHT / 2, (b.z0 + b.z1) / 2),
          new THREE.Quaternion(),
          new THREE.Vector3(b.x1 - b.x0, KERB_HEIGHT, b.z1 - b.z0),
        );
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    const { x0, z0, x1, z1 } = city.bounds;
    const margin = 400;
    const plane = new THREE.PlaneGeometry(x1 - x0 + 2 * margin, z1 - z0 + 2 * margin);
    const material = new THREE.MeshStandardMaterial({ color: GROUND_COLOURS.outside, roughness: 1 });
    this.disposables.push(plane, material);
    const ground = new THREE.Mesh(plane, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((x0 + x1) / 2, -0.03, (z0 + z1) / 2);
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.root.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) node.dispose();
    });
  }
}
