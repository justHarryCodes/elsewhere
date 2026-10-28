import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Box3, CityShape, EffectDef, HumanAppearance, HumanBody, Placement, SceneDef } from '@game/shared';
import { assetEntry } from '../../assets/assetManifest';
import { type HumanCharacter, HumanLibrary } from '../../game/three/humans';
import { type PlayerFrame, type RendererOptions, type SceneRenderer, type ScreenPoint, type View, fitFov, viewCamera } from '../sceneRenderer';

/** A placement the game asks about: picked, collided with or faded. */
interface Tracked {
  box: THREE.Box3;
  materials: THREE.MeshStandardMaterial[];
  placement: Placement;
}

/** Sun, sky and exposure for each mood (matching the Babylon renderer). */
const MOODS = {
  day: { sky: new THREE.Color(0.62, 0.78, 0.92), exposure: 1.2, ambient: 1.6, skyLight: 0xffffff, groundLight: 0x736b61, sun: 2.2, sunColor: 0xffffff, sunPosition: [40, 100, 60] },
  evening: { sky: new THREE.Color(0.86, 0.6, 0.5), exposure: 1.1, ambient: 1.1, skyLight: 0xb8adeb, groundLight: 0x473338, sun: 1.3, sunColor: 0xffb373, sunPosition: [75, 35, 55] },
  night: { sky: new THREE.Color(0.05, 0.04, 0.1), exposure: 1.15, ambient: 0.95, skyLight: 0x8c80e6, groundLight: 0x140f1f, sun: 0, sunColor: 0xffffff, sunPosition: [40, 100, 60] },
} as const;
const FADED = 0.22;

/**
 * Three.js renderer for world scenes. Each GLB is loaded once; placements are clones sharing its
 * geometry. The player is the plain Universal Base Character (no clothes yet: those are Babylon-only).
 */
export class ThreeWorld implements SceneRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.3, 2000);
  private readonly controls?: OrbitControls;
  private readonly sky = new THREE.HemisphereLight(0xffffff, 0x736b61, 1.6);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly loader = new GLTFLoader();
  private readonly models = new Map<string, Promise<GLTF>>();
  private readonly tracked = new Map<string, Tracked>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly clock = new THREE.Clock();
  /** Lamp glows, pools and lights. */
  private lamps: THREE.Object3D[] = [];
  private glowTexture?: THREE.Texture;
  private content?: THREE.Group;
  private highlighted: string | null = null;
  private humans?: Promise<HumanLibrary>;
  private player?: HumanCharacter;
  private readonly npcs = new Map<string, HumanCharacter>();
  private readonly cars = new Map<string, THREE.Group>();
  /** Door leaves by id: each turns about its hinge. */
  private readonly doors = new Map<string, { hinge: THREE.Group; swing: number; level: number }>();
  private readonly resize = new ResizeObserver(() => this.fit());

  constructor(private readonly canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Filmic tone mapping: bright light (lamps, neon, a low sun) rolls off instead of blowing out.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = MOODS.day.sky.clone();
    this.sun.position.set(40, 100, 60);
    this.scene.add(this.sky, this.sun);
    if (options.orbit) {
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
    }
    this.resize.observe(canvas);
    this.fit();
    this.renderer.setAnimationLoop(() => {
      const dt = this.clock.getDelta();
      this.player?.update(dt);
      for (const npc of this.npcs.values()) npc.update(dt);
      this.controls?.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  async loadScene(def: SceneDef) {
    // Geometry and the cached GLBs' materials are shared and stay; only tracked copies' own go.
    if (this.content) this.scene.remove(this.content);
    for (const { materials } of this.tracked.values()) for (const m of materials) m.dispose();
    this.tracked.clear();
    for (const npc of this.npcs.values()) npc.dispose();
    this.npcs.clear();
    this.cars.clear();
    this.highlighted = null;
    const content = new THREE.Group();
    content.name = def.id;
    this.content = content;
    if (def.ground) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(def.ground.size, def.ground.size).rotateX(-Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: def.ground.color }),
      );
      ground.position.y = -0.02;
      content.add(ground);
    }
    if (def.rooms) {
      for (const interior of def.rooms.interiors) content.add(this.shapeShell(interior.shapes.filter((s) => (s.level ?? 0) === 0)));
      content.add(this.shapeShell(def.rooms.shapes));
    }
    this.light(def);
    this.doors.clear();
    for (const door of def.doors ?? []) this.doors.set(door.id, this.doorLeaf(door, content));
    await Promise.all(def.placements.map((p, i) => this.place(p, i, content)));
    this.scene.add(content);
    this.setView(def.view);
  }

  setView(view: View) {
    const { position, target } = viewCamera(view);
    const fov = fitFov(view.fov ?? 45, this.camera.aspect);
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(position.x, position.y, position.z);
    if (this.controls) {
      this.controls.target.set(target.x, target.y, target.z);
      this.controls.update();
    } else {
      this.camera.lookAt(target.x, target.y, target.z);
    }
  }

  project(x: number, y: number, z: number): ScreenPoint | null {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    if (p.z < -1 || p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - p.y) / 2) * this.canvas.clientHeight };
  }

  pick(x: number, y: number): string | null {
    this.aim(x, y);
    const hit = new THREE.Vector3();
    let best: string | null = null;
    let nearest = Infinity;
    for (const [id, { box, placement }] of this.tracked) {
      if (!placement.pickable || !this.raycaster.ray.intersectBox(box, hit)) continue;
      const d = hit.distanceTo(this.raycaster.ray.origin);
      if (d < nearest) {
        nearest = d;
        best = id;
      }
    }
    return best;
  }

  groundPoint(x: number, y: number, floorY = 0) {
    this.aim(x, y);
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  highlight(id: string | null, color = '#ffffff') {
    if (this.highlighted) for (const m of this.tracked.get(this.highlighted)?.materials ?? []) m.emissive.setRGB(0, 0, 0);
    this.highlighted = id;
    if (id) for (const m of this.tracked.get(id)?.materials ?? []) m.emissive.set(color).multiplyScalar(0.35);
  }

  heightOf(id: string) {
    return this.tracked.get(id)?.box.max.y ?? 0;
  }

  boxes(kind: 'solid' | 'occluder'): Box3[] {
    return [...this.tracked].filter(([, t]) => t.placement[kind]).map(([id, { box }]) => ({ id, min: box.min, max: box.max }));
  }

  setFaded(ids: readonly string[]) {
    for (const [id, t] of this.tracked) {
      if (!t.placement.occluder) continue;
      const opacity = ids.includes(id) ? FADED : 1;
      for (const m of t.materials) {
        m.opacity += (opacity - m.opacity) * 0.25;
        m.transparent = m.opacity < 0.99;
        m.depthWrite = !m.transparent;
      }
    }
  }

  async spawnPlayer(body: HumanBody, _appearance?: HumanAppearance) {
    this.humans ??= HumanLibrary.load();
    const library = await this.humans;
    this.player?.dispose();
    this.player = library.createHuman(body);
    this.player.root.visible = false;
    this.scene.add(this.player.root);
  }

  setPlayer(frame: PlayerFrame | null) {
    if (!this.player) return;
    this.player.root.visible = !!frame;
    if (!frame) return;
    this.player.root.position.set(frame.x, frame.y ?? 0, frame.z);
    this.player.root.rotation.y = frame.rotY;
    this.player.play(frame.animation);
  }

  async spawnNpc(id: string, body: HumanBody, _appearance?: HumanAppearance) {
    this.humans ??= HumanLibrary.load();
    const library = await this.humans;
    this.npcs.get(id)?.dispose();
    const npc = library.createHuman(body);
    this.npcs.set(id, npc);
    this.scene.add(npc.root);
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
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    this.controls?.dispose();
    this.renderer.dispose();
  }

  // Rooms' floors, walls and fittings (or a roof terrace's) as plain coloured boxes and cylinders:
  // the furniture models and wallpaper patterns are drawn by the Babylon renderer.
  private shapeShell(shapes: readonly CityShape[]) {
    const group = new THREE.Group();
    const materials = new Map<string, THREE.MeshLambertMaterial>();
    for (const shape of shapes) {
      let material = materials.get(shape.color);
      if (!material) {
        material = new THREE.MeshLambertMaterial({ color: shape.color });
        materials.set(shape.color, material);
      }
      const geometry =
        shape.kind === 'box' ? new THREE.BoxGeometry(shape.w, shape.h, shape.d) : new THREE.CylinderGeometry(shape.w / 2, shape.w / 2, shape.h, 16);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(shape.x, shape.y + shape.h / 2, shape.z);
      mesh.rotation.y = shape.yaw;
      group.add(mesh);
    }
    return group;
  }

  ray(x: number, y: number) {
    this.aim(x, y);
    const { origin, direction } = this.raycaster.ray;
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: direction.x, y: direction.y, z: direction.z } };
  }

  setDoor(id: string, open: number) {
    const door = this.doors.get(id);
    if (door) door.hinge.rotation.y = door.swing * open * (Math.PI / 2);
  }

  setFloor(level: number) {
    for (const door of this.doors.values()) door.hinge.visible = door.level <= level;
  }

  // Water, steam and light effects are drawn by the Babylon renderer only, for now.
  playEffects(_group: string, _effects: readonly EffectDef[]) {}
  stopEffects(_group: string) {}

  // A wooden leaf hinged at one end of its doorway, shut along the wall; setDoor swings it into the room.
  private doorLeaf(door: NonNullable<SceneDef['doors']>[number], parent: THREE.Group) {
    const half = door.width / 2 - 0.03;
    const hinge = new THREE.Group();
    hinge.position.set(door.x - (door.along === 'x' ? half : 0), door.y, door.z - (door.along === 'z' ? half : 0));
    const material = new THREE.MeshLambertMaterial({ color: 0x9a6b47 });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(door.along === 'x' ? half * 2 : 0.05, 2.05, door.along === 'z' ? half * 2 : 0.05), material);
    leaf.position.set(door.along === 'x' ? half : 0, 1.025, door.along === 'z' ? half : 0);
    hinge.add(leaf);
    parent.add(hinge);
    return { hinge, swing: door.along === 'x' ? 1 : -1, level: door.level };
  }

  private aim(x: number, y: number) {
    this.raycaster.setFromCamera(new THREE.Vector2((x / this.canvas.clientWidth) * 2 - 1, 1 - (y / this.canvas.clientHeight) * 2), this.camera);
  }

  private fit() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Day: sky and sun. Night: a dim violet sky, no sun, and the scene's point lights.
  // The mood's sun and sky, then each lamp: a soft glow round the bulb and a faint pool on the ground
  // (both additive and kept dim, so they read as light without hiding what's under them), and real
  // light only where the scene asks for it. Tone mapping rolls bright light off instead of clipping.
  private light(def: SceneDef) {
    for (const lamp of this.lamps) lamp.removeFromParent();
    this.lamps = [];
    const mood = MOODS[def.lighting?.mood ?? 'day'];
    (this.scene.background as THREE.Color).copy(def.background ? new THREE.Color(def.background) : mood.sky);
    this.renderer.toneMappingExposure = mood.exposure;
    this.sky.intensity = mood.ambient;
    this.sky.color.set(mood.skyLight);
    this.sky.groundColor.set(mood.groundLight);
    this.sun.visible = mood.sun > 0;
    this.sun.intensity = mood.sun;
    this.sun.color.set(mood.sunColor);
    this.sun.position.set(mood.sunPosition[0], mood.sunPosition[1], mood.sunPosition[2]);
    this.glowTexture ??= softSpot();
    for (const lamp of def.lighting?.lamps ?? []) {
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTexture, color: new THREE.Color(lamp.color).multiplyScalar(0.85), blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.position.set(lamp.x, lamp.y, lamp.z);
      glow.scale.setScalar(1.5);
      this.scene.add(glow);
      this.lamps.push(glow);
      if (lamp.pool > 0) {
        const pool = new THREE.Mesh(
          new THREE.CircleGeometry(lamp.pool / 2, 24).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ map: this.glowTexture, color: new THREE.Color(lamp.color).multiplyScalar(0.28), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
        );
        pool.position.set(lamp.x, (lamp.groundY ?? 0) + 0.03, lamp.z);
        this.scene.add(pool);
        this.lamps.push(pool);
      }
      if (lamp.light) {
        // Three's point lights are physical (candela); this matches Babylon's look at a few metres.
        const light = new THREE.PointLight(lamp.color, lamp.light.intensity * 7, lamp.light.range, 1);
        light.position.set(lamp.x, lamp.y, lamp.z);
        this.scene.add(light);
        this.lamps.push(light);
      }
    }
  }

  private load(url: string) {
    let model = this.models.get(url);
    if (!model) {
      model = this.loader.loadAsync(url);
      this.models.set(url, model);
    }
    return model;
  }

  // Same rules as the Babylon renderer: face +Z, footprint centred, base on the ground, metres.
  // Pickable and fading ones get their own materials, so tinting or fading one doesn't touch the kit.
  private async place(placement: Placement, index: number, parent: THREE.Group) {
    const entry = assetEntry(placement.asset);
    const gltf = await this.load(entry.url);
    const model = gltf.scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    if (placement.pickable || placement.occluder) {
      model.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
          node.material = node.material.clone();
          materials.push(node.material);
        }
      });
    }
    model.rotation.y = entry.yaw ?? 0;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const scale = (entry.scale ?? (entry.height ?? 1) / Math.max(1e-6, box.max.y - box.min.y)) * (placement.scale ?? 1);
    model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const holder = new THREE.Group();
    holder.name = placement.id ?? placement.asset;
    holder.add(model);
    holder.scale.setScalar(scale);
    holder.rotation.y = placement.rotY ?? 0;
    holder.position.set(placement.x, placement.y ?? 0, placement.z);
    parent.add(holder);
    if (placement.pickable || placement.solid || placement.occluder) {
      holder.updateMatrixWorld(true);
      const id = placement.id ?? `${placement.asset}#${index}`;
      this.tracked.set(id, { box: new THREE.Box3().setFromObject(holder), materials, placement });
    }
    return holder;
  }
}

/** A soft round spot, bright in the middle and fading to nothing at the edge. */
function softSpot() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
