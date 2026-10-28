import * as THREE from 'three';
import { KERB_HEIGHT, type City, type CityShape, type CitySign } from '@game/shared';
import { type Batch, MegaKit, ROOM_MATERIALS, ROOM_TEXTURES } from '../megakit';

/**
 * Three.js counterpart of the Babylon CityRenderer: the same city, welded into one mesh per material for
 * the whole city at once (no streaming, night look, wallpaper patterns or moving monorail here: Babylon
 * is the main renderer).
 */
export class CityRenderer {
  readonly root = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly loader = new THREE.TextureLoader();

  static async create(city: City): Promise<CityRenderer> {
    const renderer = new CityRenderer();
    renderer.root.name = 'city';
    const kit = await MegaKit.load();
    const pieces = [...city.streets, ...city.props, ...city.buildings.flatMap((b) => b.pieces), ...city.interiors.flatMap((r) => r.pieces)];
    for (const [key, batch] of kit.weld(pieces)) renderer.root.add(renderer.batchMesh(batch, renderer.material(kit, key)));
    renderer.addShapes([...city.shapes, ...city.interiors.flatMap((r) => r.shapes)]);
    renderer.addSigns(city.signs);
    renderer.addGround(city, kit);
    return renderer;
  }

  private texture(url: string, colour: boolean, repeat = false): THREE.Texture {
    const key = `${url}|${repeat}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = this.loader.load(url);
      texture.flipY = false; // the kit's UVs are glTF's
      if (colour) texture.colorSpace = THREE.SRGBColorSpace;
      if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      this.textures.set(key, texture);
      this.disposables.push(texture);
    }
    return texture;
  }

  private material(kit: MegaKit, key: string): THREE.Material {
    let material: THREE.MeshStandardMaterial;
    if ((ROOM_MATERIALS as readonly string[]).includes(key)) {
      material = new THREE.MeshStandardMaterial({ map: this.texture(ROOM_TEXTURES[key as keyof typeof ROOM_TEXTURES], true), roughness: 0.9 });
    } else {
      const [name, skin] = key.split('#');
      const k = kit.materials.get(name);
      material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
      const base = skin !== undefined && k?.skins ? k.skins[Number(skin)] : k?.base;
      if (k && base) {
        material.map = this.texture(kit.textureUrl(k, base), true);
        if (k.pixel) material.map.magFilter = material.map.minFilter = THREE.NearestFilter;
      } else if (k?.color) material.color.setRGB(k.color[0], k.color[1], k.color[2]);
      if (k?.normal) material.normalMap = this.texture(kit.textureUrl(k, k.normal), false);
      if (k?.orm) material.roughnessMap = material.metalnessMap = this.texture(kit.textureUrl(k, k.orm), false);
      else {
        material.metalness = 0;
        material.roughness = 0.85;
      }
      if (k?.vertexColors) material.vertexColors = true;
      if (k?.cutout) {
        material.alphaTest = 0.5;
        material.side = THREE.DoubleSide;
      }
      if (key === 'MI_Glass') {
        material.transparent = true;
        material.opacity = k?.color?.[3] ?? 0.6;
        material.roughness = 0.05;
      } else if (k?.blend) {
        material.alphaTest = 0.4;
        material.polygonOffset = true; // painted on the asphalt at the same height
        material.polygonOffsetFactor = -2;
      }
    }
    this.disposables.push(material);
    return material;
  }

  private batchMesh(batch: Batch, material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(batch.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(batch.uvs, 2));
    if (batch.colors) geometry.setAttribute('color', new THREE.BufferAttribute(batch.colors, 4));
    geometry.setIndex(new THREE.BufferAttribute(batch.indices, 1));
    this.disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private addShapes(shapes: CityShape[]) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    this.disposables.push(box, cylinder);
    const groups = new Map<string, CityShape[]>();
    for (const s of shapes) {
      const key = `${s.kind}|${s.color}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    const m = new THREE.Matrix4();
    for (const [key, list] of groups) {
      const [kind, color] = key.split('|');
      const material = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.55 });
      this.disposables.push(material);
      const mesh = new THREE.InstancedMesh(kind === 'box' ? box : cylinder, material, list.length);
      list.forEach((s, i) => {
        m.compose(new THREE.Vector3(s.x, s.y + s.h / 2, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(s.w, s.h, s.d));
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
  }

  /** The public buildings' name boards. */
  private addSigns(signs: CitySign[]) {
    for (const sign of signs) {
      const canvas = document.createElement('canvas');
      canvas.height = 128;
      canvas.width = Math.round((128 * sign.w) / sign.h);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = sign.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = sign.color;
      ctx.font = 'bold 72px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sign.text, canvas.width / 2, 69, canvas.width * 0.92);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, emissiveMap: texture, emissive: 0x595959 });
      const geometry = new THREE.PlaneGeometry(sign.w, sign.h);
      this.disposables.push(texture, material, geometry);
      const board = new THREE.Mesh(geometry, material);
      board.position.set(sign.x, sign.y, sign.z);
      board.rotation.y = sign.yaw; // the plane faces +Z
      this.root.add(board);
    }
  }

  /** Paving on the sidewalks, lawn, asphalt or dirt on the lots, lawn all round. */
  private addGround(city: City, kit: MegaKit) {
    const surface = (material: string, tile: number) => {
      const source = kit.materials.get(material)!;
      const map = this.texture(kit.textureUrl(source, source.base), true, true);
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
      this.disposables.push(m);
      return { m, tile };
    };
    const paving = surface('MI_Concrete', 6);
    const asphalt = surface('MI_Asphalt', 8);
    const dirt = surface('MI_Dirt', 6);
    const lawn = surface('town-lawn', 5);
    const path = surface('MI_Concrete', 2);
    const quad = (r: { x0: number; z0: number; x1: number; z1: number }, y: number, s: { m: THREE.Material; tile: number }) => {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const geometry = new THREE.PlaneGeometry(w, d);
      // World-space tiling: scale the plane's 0..1 UVs to metres / tile.
      const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / s.tile, (uv.getY(i) * d) / s.tile);
      this.disposables.push(geometry);
      const mesh = new THREE.Mesh(geometry, s.m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    for (const s of city.sidewalks) quad(s, KERB_HEIGHT, paving);
    const surfaces = { lawn: [lawn, 0.005], path: [path, 0.015], dirt: [dirt, 0.01], plaza: [paving, 0.01], parking: [asphalt, 0.01], yard: [asphalt, 0.01] } as const;
    for (const lot of city.lots) quad(lot, KERB_HEIGHT + surfaces[lot.kind][1], surfaces[lot.kind][0]);
    const margin = 400;
    const { x0, z0, x1, z1 } = city.bounds;
    quad({ x0: x0 - margin, z0: z0 - margin, x1: x1 + margin, z1: z1 + margin }, -0.03, { m: lawn.m, tile: 5 });
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.root.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) node.dispose();
    });
  }
}
