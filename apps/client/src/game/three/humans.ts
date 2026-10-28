import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  ANIMATION_LIBRARIES,
  DEFAULT_HUMAN_ANIMATION,
  HUMAN_ANIMATIONS,
  HUMAN_BODIES,
  fitScaleFactor,
  type AnimationLibrary,
  type HumanAnimation,
  type HumanBody,
} from '@game/shared';

const FADE_SECONDS = 0.2;

/** Three.js counterpart of the Babylon HumanLibrary: same bodies, same clips, same real-world scale. */
export class HumanLibrary {
  private constructor(
    private readonly bodies: Record<HumanBody, THREE.Object3D>,
    private readonly clips: Map<string, THREE.AnimationClip>,
  ) {}

  static async load(): Promise<HumanLibrary> {
    const loader = new GLTFLoader();
    const bodyNames = Object.keys(HUMAN_BODIES) as HumanBody[];
    const libraryNames = Object.keys(ANIMATION_LIBRARIES) as AnimationLibrary[];

    const [bodyGltfs, libraryGltfs] = await Promise.all([
      Promise.all(bodyNames.map((body) => loader.loadAsync(HUMAN_BODIES[body].url))),
      Promise.all(libraryNames.map((lib) => loader.loadAsync(ANIMATION_LIBRARIES[lib]))),
    ]);

    const bodies = Object.fromEntries(
      bodyNames.map((body, i) => [body, scaledBody(bodyGltfs[i].scene, body)]),
    ) as Record<HumanBody, THREE.Object3D>;

    // Tracks are bound by bone name ("pelvis.quaternion"), so these clips play on any UBC body. Clips only
    // rotate bones (plus the root and pelvis movement), so each body keeps its own proportions.
    const clips = new Map<string, THREE.AnimationClip>();
    libraryGltfs.forEach((gltf, i) => {
      for (const clip of gltf.animations) {
        clip.tracks = clip.tracks.filter((track) => !track.name.endsWith('.position') || /^(root|pelvis)\./.test(track.name));
        clips.set(`${libraryNames[i]}/${clip.name}`, clip);
      }
    });

    return new HumanLibrary(bodies, clips);
  }

  createHuman(body: HumanBody): HumanCharacter {
    const model = cloneSkinned(this.bodies[body]);
    const root = new THREE.Group();
    root.add(model);
    return new HumanCharacter(root, model, (animation) => {
      const { library, clip } = HUMAN_ANIMATIONS[animation];
      return this.clips.get(`${library}/${clip}`);
    });
  }

  dispose() {
    for (const body of Object.values(this.bodies)) {
      body.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const material of [object.material].flat()) material.dispose();
        }
      });
    }
  }
}

// Scales a body to its real-world height (1 unit = 1 metre) with its feet at y = 0.
function scaledBody(model: THREE.Object3D, body: HumanBody) {
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.multiplyScalar(fitScaleFactor(size, HUMAN_BODIES[body].size));
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
  return model;
}

/** One animated human. Position/rotate `root`, call update(dt) every frame and play() to change clips. */
export class HumanCharacter {
  private readonly mixer: THREE.AnimationMixer;
  private current?: { animation: HumanAnimation; action: THREE.AnimationAction; then: HumanAnimation };

  constructor(
    readonly root: THREE.Group,
    model: THREE.Object3D,
    private readonly sourceClip: (animation: HumanAnimation) => THREE.AnimationClip | undefined,
  ) {
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener('finished', (event) => {
      if (this.current && event.action === this.current.action) this.play(this.current.then);
    });
  }

  play(animation: HumanAnimation, { restart = false, then = DEFAULT_HUMAN_ANIMATION } = {}) {
    if (animation === this.current?.animation && !restart) return;
    const clip = this.sourceClip(animation);
    if (!clip) {
      console.warn(`Missing animation clip for "${animation}"`);
      return;
    }

    const action = this.mixer.clipAction(clip);
    const { loop } = HUMAN_ANIMATIONS[animation];
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;

    const previous = this.current?.action;
    action.reset().play();
    if (previous && previous !== action) action.crossFadeFrom(previous, FADE_SECONDS, false);
    this.current = { animation, action, then };
  }

  update(dtSeconds: number) {
    this.mixer.update(dtSeconds);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.root.removeFromParent();
  }
}
