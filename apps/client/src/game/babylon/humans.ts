import {
  AnimationGroup,
  type AssetContainer,
  LoadAssetContainerAsync,
  type Node,
  type Scene,
  TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  ANIMATION_LIBRARIES,
  DEFAULT_HUMAN_ANIMATION,
  HUMAN_ANIMATIONS,
  HUMAN_BODIES,
  type AnimationLibrary,
  type HumanAnimation,
  type HumanBody,
} from '@game/shared';
import { scaleToRealSize } from './realScale';

const BLEND_SPEED = 0.08;

/** Loads every human body and animation library once; creates any number of characters from them. */
export class HumanLibrary {
  private constructor(
    private readonly scene: Scene,
    private readonly bodies: Record<HumanBody, AssetContainer>,
    private readonly clips: Map<string, AnimationGroup>,
  ) {}

  static async load(scene: Scene): Promise<HumanLibrary> {
    const bodyNames = Object.keys(HUMAN_BODIES) as HumanBody[];
    const libraryNames = Object.keys(ANIMATION_LIBRARIES) as AnimationLibrary[];

    const [bodyContainers, libraryContainers] = await Promise.all([
      Promise.all(bodyNames.map((body) => LoadAssetContainerAsync(HUMAN_BODIES[body].url, scene))),
      Promise.all(libraryNames.map((lib) => LoadAssetContainerAsync(ANIMATION_LIBRARIES[lib], scene))),
    ]);

    const bodies = Object.fromEntries(bodyNames.map((body, i) => [body, bodyContainers[i]])) as Record<
      HumanBody,
      AssetContainer
    >;

    // Source clips keyed "library/clip". They stay in their containers and are only read from.
    const clips = new Map<string, AnimationGroup>();
    libraryContainers.forEach((container, i) => {
      for (const group of container.animationGroups) {
        group.stop();
        clips.set(`${libraryNames[i]}/${group.name}`, group);
      }
    });

    return new HumanLibrary(scene, bodies, clips);
  }

  createHuman(body: HumanBody, name: string): HumanCharacter {
    const entries = this.bodies[body].instantiateModelsToScene((sourceName) => sourceName, false, {
      doNotInstantiate: true,
    });
    entries.animationGroups.forEach((group) => group.dispose());

    const root = new TransformNode(`human-${name}`, this.scene);
    for (const node of entries.rootNodes) node.parent = root;
    // Real-world height from the scale catalog (1 unit = 1 metre), feet on the holder's origin.
    scaleToRealSize(entries.rootNodes[0] as TransformNode, HUMAN_BODIES[body].size);

    return new HumanCharacter(this.scene, root, (animation) => this.clips.get(clipKey(animation)));
  }
}

const clipKey = (animation: HumanAnimation) => {
  const { library, clip } = HUMAN_ANIMATIONS[animation];
  return `${library}/${clip}`;
};

/** One animated human. Position/rotate `root`; call play() to change animation. */
export class HumanCharacter {
  private readonly bones = new Map<string, Node>();
  private readonly groups = new Map<HumanAnimation, AnimationGroup>();
  private current?: HumanAnimation;
  private speedRatio = 1;

  constructor(
    private readonly scene: Scene,
    readonly root: TransformNode,
    private readonly sourceClip: (animation: HumanAnimation) => AnimationGroup | undefined,
  ) {
    for (const node of root.getDescendants(false)) this.bones.set(node.name, node);
  }

  get animation() {
    return this.current;
  }

  /** Plays an animation, blending from the current one. One-shot clips fall back to `then` when done. */
  play(animation: HumanAnimation, { restart = false, then = DEFAULT_HUMAN_ANIMATION } = {}) {
    if (animation === this.current && !restart) return;
    const group = this.group(animation);
    if (!group) return;

    // Switch `current` first so the stopped clip's end observer can't trigger a fallback.
    const previous = this.current ? this.groups.get(this.current) : undefined;
    this.current = animation;
    if (previous) {
      previous.onAnimationGroupEndObservable.clear();
      previous.stop();
    }

    const { loop } = HUMAN_ANIMATIONS[animation];
    if (!loop) {
      group.onAnimationGroupEndObservable.addOnce(() => {
        if (this.current === animation) this.play(then);
      });
    }
    // Blending eases each bone from its current pose into the new clip.
    group.start(loop);
  }

  /** Playback speed for every clip on this character (1 = authored speed). */
  setSpeedRatio(ratio: number) {
    this.speedRatio = ratio;
    this.groups.forEach((group) => (group.speedRatio = ratio));
  }

  dispose() {
    this.groups.forEach((group) => group.dispose());
    this.groups.clear();
    this.root.dispose(false, true);
  }

  // Retargets a library clip onto this character's bones the first time it is needed.
  private group(animation: HumanAnimation): AnimationGroup | undefined {
    const existing = this.groups.get(animation);
    if (existing) return existing;

    const source = this.sourceClip(animation);
    if (!source) {
      console.warn(`Missing animation clip for "${animation}"`);
      return undefined;
    }

    const group = new AnimationGroup(`${this.root.name}-${animation}`, this.scene);
    for (const { animation: track, target } of source.targetedAnimations) {
      const bone = this.bones.get(target.name);
      if (bone) group.addTargetedAnimation(track, bone);
    }
    group.enableBlending = true;
    group.blendingSpeed = BLEND_SPEED;
    group.speedRatio = this.speedRatio;
    this.groups.set(animation, group);
    return group;
  }
}
