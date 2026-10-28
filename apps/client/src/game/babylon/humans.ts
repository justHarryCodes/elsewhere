import {
  AnimationGroup,
  type AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  type Material,
  Matrix,
  Mesh,
  type Node,
  PBRMaterial,
  type Scene,
  type Skeleton,
  TransformNode,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  ANIMATION_LIBRARIES,
  BEARD_URL,
  BODY_SHAPES,
  CLOTHES_URLS,
  CLOTHING,
  DEFAULT_HUMAN_ANIMATION,
  HAIR_COLORS,
  HAIR_STYLES,
  HUMAN_ANIMATIONS,
  HUMAN_BODIES,
  SKIN_TONES,
  defaultAppearance,
  type AnimationLibrary,
  type BodyShape,
  type ClothingItem,
  type ClothingPick,
  type HairStyle,
  type HumanAnimation,
  type HumanAppearance,
  type HumanBody,
} from '@game/shared';
import { scaleToRealSize } from './realScale';

const BLEND_SPEED = 0.08;
const SKIN_MATERIAL = /^MI_Superhero_/;
const BROW_MATERIAL = /^MI_Hair_/;
/** Clips only rotate bones; these two also move (the walk's bob and sway). Every other bone keeps
 * the body's own rest position, so the narrower shoulders stay narrow. */
const MOVING_BONES = new Set(['root', 'pelvis']);
/** Stylised look: matte skin and clothes with a thin dark outline. */
const OUTLINE = new Color3(0.07, 0.06, 0.08);
const OUTLINE_WIDTH = 0.0035;
const ZONES = ['main', 'trim', 'detail'] as const;

type Base = 'male' | 'female';

/** A clothes file: its meshes by piece, and which body vertices each piece covers. */
interface Wardrobe {
  container: AssetContainer;
  pieces: Map<ClothingItem, Mesh[]>;
  cover: Map<ClothingItem, Uint8Array>;
}

/**
 * Loads the two base bodies, every hairstyle, the clothes and the animation libraries once, and
 * creates any number of characters from them: six body types (reshaped from the two bases), each
 * with its own skin tone, hairstyle, hair colour, beard and clothes.
 */
export class HumanLibrary {
  /** Reshaped vertex positions per body type and mesh, computed on first use. */
  private readonly shapedPositions = new Map<string, Float32Array>();
  /** Each base body's full triangle list, before covered skin is hidden. */
  private readonly bodyIndices = new Map<Base, Int32Array>();

  private constructor(
    private readonly scene: Scene,
    private readonly bases: Record<Base, AssetContainer>,
    private readonly hair: Map<string, AssetContainer>,
    private readonly wardrobes: Record<Base, Wardrobe>,
    private readonly clips: Map<string, AnimationGroup>,
  ) {}

  static async load(scene: Scene): Promise<HumanLibrary> {
    const libraryNames = Object.keys(ANIMATION_LIBRARIES) as AnimationLibrary[];
    const hairUrls = [...new Set([BEARD_URL, ...Object.values(HAIR_STYLES).flatMap((h) => (h.url ? [h.url] : []))])];

    const [male, female, libraryContainers, hairContainers, maleClothes, femaleClothes] = await Promise.all([
      LoadAssetContainerAsync(HUMAN_BODIES.male.url, scene),
      LoadAssetContainerAsync(HUMAN_BODIES.female.url, scene),
      Promise.all(libraryNames.map((lib) => LoadAssetContainerAsync(ANIMATION_LIBRARIES[lib], scene))),
      Promise.all(hairUrls.map((url) => LoadAssetContainerAsync(url, scene))),
      loadWardrobe(scene, 'male'),
      loadWardrobe(scene, 'female'),
    ]);

    // Source clips keyed "library/clip". They stay in their containers and are only read from.
    const clips = new Map<string, AnimationGroup>();
    libraryContainers.forEach((container, i) => {
      for (const group of container.animationGroups) {
        group.stop();
        clips.set(`${libraryNames[i]}/${group.name}`, group);
      }
    });
    const hair = new Map(hairUrls.map((url, i) => [url, hairContainers[i]]));
    // Clothes are skinned by bone name: point their joint indices at the body's bones once, here.
    bindWardrobe(maleClothes, male.skeletons[0]);
    bindWardrobe(femaleClothes, female.skeletons[0]);
    return new HumanLibrary(scene, { male, female }, hair, { male: maleClothes, female: femaleClothes }, clips);
  }

  createHuman(body: HumanBody, name: string, appearance: HumanAppearance = defaultAppearance(body)): HumanCharacter {
    const spec = HUMAN_BODIES[body];
    // Materials are cloned so each character has its own skin and hair tint.
    const entries = this.bases[spec.base].instantiateModelsToScene((sourceName) => sourceName, true, {
      doNotInstantiate: true,
    });
    entries.animationGroups.forEach((group) => group.dispose());
    const skeleton = entries.skeletons[0];

    const root = new TransformNode(`human-${name}`, this.scene);
    for (const node of entries.rootNodes) node.parent = root;
    const shape: BodyShape = BODY_SHAPES[spec.shape];
    const skinned = root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && !!m.skeleton);
    if (shape.bones.length) for (const mesh of skinned) this.applyShape(`${body}/${mesh.name}`, mesh, skeleton, shape);
    // Real-world height from the scale catalog (1 unit = 1 metre), feet on the holder's origin.
    scaleToRealSize(entries.rootNodes[0] as TransformNode, spec.size);

    const anchor = skinned.reduce((a, b) => (vertexCount(b) > vertexCount(a) ? b : a));
    // The body hides the skin under clothes, so it needs its own triangle list.
    anchor.makeGeometryUnique();
    if (!this.bodyIndices.has(spec.base)) this.bodyIndices.set(spec.base, Int32Array.from(anchor.getIndices() ?? []));
    for (const mesh of skinned) {
      if (mesh.material instanceof PBRMaterial && SKIN_MATERIAL.test(mesh.material.name)) matte(mesh.material, 0.25);
      outline(mesh);
    }

    const character = new HumanCharacter(this.scene, root, (animation) => this.clips.get(clipKey(animation)));
    character.attach = { library: this, body, skeleton, anchor };
    this.setAppearance(character, appearance);
    return character;
  }

  /** Changes skin tone, hairstyle, hair colour, beard and clothes in place. */
  setAppearance(character: HumanCharacter, appearance: HumanAppearance) {
    const attach = character.attach!;
    const spec = HUMAN_BODIES[attach.body];
    const previous = character.appearance;
    character.appearance = appearance;

    const skin = Color3.FromArray(SKIN_TONES[appearance.skin].tint as unknown as number[]);
    const hairColour = Color3.FromHexString(HAIR_COLORS[appearance.hairColor].hex).toLinearSpace();
    for (const material of character.materials()) {
      if (material instanceof PBRMaterial && SKIN_MATERIAL.test(material.name)) material.albedoColor = skin;
    }
    if (!previous || !sameClothes(previous.clothes, appearance.clothes)) this.dress(character, appearance.clothes);

    const beard = appearance.beard && spec.base === 'male';
    if (!previous || previous.hair !== appearance.hair || (previous.beard && spec.base === 'male') !== beard) {
      for (const mesh of character.hairMeshes) mesh.dispose(false, true);
      character.hairMeshes = [];
      const urls = [HAIR_STYLES[appearance.hair].url, beard ? BEARD_URL : null].filter((u): u is string => !!u);
      for (const url of urls) character.hairMeshes.push(...this.attachHair(url, attach));
    }
    // Hair, beard and eyebrows share the hair colour.
    for (const material of [...character.hairMeshes.map((m) => m.material), ...character.materials()]) {
      if (material instanceof PBRMaterial && (BROW_MATERIAL.test(material.name) || character.hairMeshes.some((m) => m.material === material))) {
        material.albedoColor = hairColour;
      }
    }
  }

  // Swaps the clothes: copies of the wardrobe's pieces bound to this character's skeleton, slimmed
  // like the body, in their own colours; skin they fully cover is left out of the body's triangles.
  private dress(character: HumanCharacter, clothes: readonly ClothingPick[]) {
    const attach = character.attach!;
    const spec = HUMAN_BODIES[attach.body];
    const wardrobe = this.wardrobes[spec.base];
    for (const mesh of character.clothMeshes) {
      mesh.material?.dispose();
      mesh.dispose();
    }
    character.clothMeshes = [];
    const shape: BodyShape = BODY_SHAPES[spec.shape];
    const hidden = new Uint8Array(Math.ceil(attach.anchor.getTotalVertices() / 8));

    for (const pick of clothes) {
      const colours = pick.colors ?? CLOTHING[pick.item].colors;
      for (const source of wardrobe.pieces.get(pick.item) ?? []) {
        const mesh = source.clone(`${character.root.name}-${source.name}`, null, true)!;
        mesh.setEnabled(true);
        mesh.skeleton = attach.skeleton;
        mesh.parent = attach.anchor.parent;
        mesh.position.copyFrom(attach.anchor.position);
        mesh.rotationQuaternion = attach.anchor.rotationQuaternion?.clone() ?? null;
        mesh.scaling.copyFrom(attach.anchor.scaling);
        const zone = Math.max(0, ZONES.findIndex((z) => source.material?.name.endsWith(`.${z}`)));
        mesh.material = clothMaterial(`${mesh.name}-cloth`, colours[zone], this.scene);
        if (shape.bones.length) this.applyShape(`${attach.body}/cloth/${source.name}`, mesh, attach.skeleton, shape);
        outline(mesh);
        mesh.receiveShadows = attach.anchor.receiveShadows;
        character.clothMeshes.push(mesh);
      }
      const cover = wardrobe.cover.get(pick.item);
      if (cover) for (let i = 0; i < hidden.length; i++) hidden[i] |= cover[i];
    }

    const all = this.bodyIndices.get(spec.base)!;
    const covered = (v: number) => (hidden[v >> 3] >> (v & 7)) & 1;
    const kept: number[] = [];
    for (let t = 0; t < all.length; t += 3) {
      if (covered(all[t]) && covered(all[t + 1]) && covered(all[t + 2])) continue;
      kept.push(all[t], all[t + 1], all[t + 2]);
    }
    attach.anchor.setIndices(kept);
    character.onClothesChanged?.(character.clothMeshes);
  }

  // Hair models carry the same 65-bone skeleton as the bodies: bind their meshes to the character's
  // skeleton so they follow every animation, and reshape them like the body (a teen's larger head).
  private attachHair(url: string, attach: NonNullable<HumanCharacter['attach']>): Mesh[] {
    const container = this.hair.get(url);
    if (!container) return [];
    const entries = container.instantiateModelsToScene((sourceName) => `hair-${sourceName}`, true, { doNotInstantiate: true });
    entries.animationGroups.forEach((group) => group.dispose());
    const meshes = entries.rootNodes
      .flatMap((n) => n.getChildMeshes(false))
      .filter((m): m is Mesh => m instanceof Mesh && !!m.skeleton);
    const own = entries.skeletons[0];
    if (own && !sameBones(own, attach.skeleton)) {
      console.warn(`Hair ${url}: skeleton doesn't match the body; skipped`);
      entries.rootNodes.forEach((n) => n.dispose());
      return [];
    }
    const shape: BodyShape = BODY_SHAPES[HUMAN_BODIES[attach.body].shape];
    for (const mesh of meshes) {
      mesh.skeleton = attach.skeleton;
      mesh.parent = attach.anchor.parent;
      mesh.position.copyFrom(attach.anchor.position);
      mesh.rotationQuaternion = attach.anchor.rotationQuaternion?.clone() ?? null;
      mesh.scaling.copyFrom(attach.anchor.scaling);
      if (shape.bones.length) this.applyShape(`${attach.body}/${url}/${mesh.name}`, mesh, attach.skeleton, shape);
      outline(mesh);
    }
    entries.skeletons.forEach((s) => s.dispose());
    entries.rootNodes.forEach((n) => n.dispose());
    return meshes;
  }

  private applyShape(key: string, mesh: Mesh, skeleton: Skeleton, shape: BodyShape) {
    let positions = this.shapedPositions.get(key);
    if (!positions) {
      positions = reshapeSkinnedMesh(mesh, skeleton, shape);
      this.shapedPositions.set(key, positions);
    }
    mesh.makeGeometryUnique();
    mesh.setVerticesData('position', positions, false);
    mesh.refreshBoundingInfo({ applySkeleton: false });
  }
}

/**
 * Thins (or grows) a skinned mesh around its bones, in its bind pose. Each vertex is moved into the
 * bind space of every bone that influences it, scaled there (bone cross-section = local X and Z),
 * moved back, and the results are blended by the skin weights, so joints stay smooth. The mesh then
 * animates normally; no animation track has to change.
 */
function reshapeSkinnedMesh(mesh: Mesh, skeleton: Skeleton, shape: BodyShape): Float32Array {
  const source = mesh.getVerticesData('position')!;
  const out = new Float32Array(source);
  const indices = mesh.getVerticesData('matricesIndices');
  const weights = mesh.getVerticesData('matricesWeights');
  if (!indices || !weights) return out;
  const indicesExtra = mesh.getVerticesData('matricesIndicesExtra');
  const weightsExtra = mesh.getVerticesData('matricesWeightsExtra');

  // Per bone: inverse bind, scale, bind; null when the bone keeps its shape.
  const transforms = skeleton.bones.map((bone) => {
    const rule = shape.bones.find((b) => b.match.test(bone.name));
    if (!rule) return null;
    const inverseBind = bone.getAbsoluteInverseBindMatrix().clone();
    const [sx, sy, sz] = rule.scale;
    return inverseBind.multiply(Matrix.Scaling(sx, sy, sz)).multiply(Matrix.Invert(inverseBind));
  });

  const v = new Vector3();
  const moved = new Vector3();
  const sum = new Vector3();
  for (let i = 0; i < source.length / 3; i++) {
    v.set(source[i * 3], source[i * 3 + 1], source[i * 3 + 2]);
    sum.setAll(0);
    let touched = false;
    const influence = (bone: number, weight: number) => {
      if (weight <= 0) return;
      const m = transforms[bone];
      if (m) {
        Vector3.TransformCoordinatesToRef(v, m, moved);
        touched = true;
      } else {
        moved.copyFrom(v);
      }
      sum.addInPlace(moved.scaleInPlace(weight));
    };
    for (let k = 0; k < 4; k++) influence(indices[i * 4 + k], weights[i * 4 + k]);
    if (indicesExtra && weightsExtra) for (let k = 0; k < 4; k++) influence(indicesExtra[i * 4 + k], weightsExtra[i * 4 + k]);
    if (!touched) continue;
    out[i * 3] = sum.x;
    out[i * 3 + 1] = sum.y;
    out[i * 3 + 2] = sum.z;
  }
  return out;
}

const vertexCount = (mesh: Mesh) => mesh.getTotalVertices();

/** Stylised matte: no shine or reflections (a faint sheen on skin), lit by the scene like everything else. */
function matte(material: PBRMaterial, sheen = 0) {
  material.metallic = 0;
  material.roughness = 1;
  material.metallicTexture = null;
  material.metallicF0Factor = sheen;
  return material;
}

function clothMaterial(name: string, hex: string, scene: Scene) {
  const material = matte(new PBRMaterial(name, scene));
  material.albedoColor = Color3.FromHexString(hex).toLinearSpace();
  return material;
}

function outline(mesh: Mesh) {
  mesh.renderOutline = true;
  mesh.outlineColor = OUTLINE;
  mesh.outlineWidth = OUTLINE_WIDTH;
}

const sameClothes = (a: readonly ClothingPick[], b: readonly ClothingPick[]) =>
  a.length === b.length && a.every((p, i) => p.item === b[i].item && String(p.colors) === String(b[i].colors));

async function loadWardrobe(scene: Scene, base: Base): Promise<Wardrobe> {
  const urls = CLOTHES_URLS[base];
  const [container, cover] = await Promise.all([
    LoadAssetContainerAsync(urls.model, scene),
    fetch(urls.cover).then((r) => r.json() as Promise<{ cover: Record<string, string> }>),
  ]);
  const pieces = new Map<ClothingItem, Mesh[]>();
  for (const mesh of container.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
    // One glTF mesh per piece; a piece with several colour zones arrives as "<id>_primitive<n>".
    const item = mesh.name.replace(/_primitive\d+$/, '') as ClothingItem;
    if (!(item in CLOTHING)) continue;
    pieces.set(item, [...(pieces.get(item) ?? []), mesh]);
  }
  const decoded = new Map<ClothingItem, Uint8Array>();
  for (const [item, bits] of Object.entries(cover.cover)) {
    decoded.set(item as ClothingItem, Uint8Array.from(atob(bits), (c) => c.charCodeAt(0)));
  }
  return { container, pieces, cover: decoded };
}

/** Rewrites the clothes' joint indices from their own skeleton's bone order to the body's. */
function bindWardrobe(wardrobe: Wardrobe, body: Skeleton) {
  const own = wardrobe.container.skeletons[0];
  if (!own) return;
  const byName = new Map(body.bones.map((bone) => [bone.name, bone.getIndex()]));
  // Babylon numbers bones by their index in the skin (bone.getIndex()), which vertex data refers to.
  const index = new Map(own.bones.map((bone) => [bone.getIndex(), byName.get(bone.name) ?? 0]));
  for (const meshes of wardrobe.pieces.values()) {
    for (const mesh of meshes) {
      for (const kind of [VertexBuffer.MatricesIndicesKind, VertexBuffer.MatricesIndicesExtraKind]) {
        const data = mesh.getVerticesData(kind);
        if (data) mesh.setVerticesData(kind, Array.from(data, (j) => index.get(j) ?? 0), false);
      }
    }
  }
}

function sameBones(a: Skeleton, b: Skeleton) {
  return a.bones.length === b.bones.length && a.bones.every((bone, i) => bone.name.replace(/^hair-/, '') === b.bones[i].name);
}

const clipKey = (animation: HumanAnimation) => {
  const { library, clip } = HUMAN_ANIMATIONS[animation];
  return `${library}/${clip}`;
};

/** One animated human. Position/rotate `root`; call play() to change animation. */
export class HumanCharacter {
  /** Set by HumanLibrary: what hair attaches to. */
  attach?: { library: HumanLibrary; body: HumanBody; skeleton: Skeleton; anchor: Mesh };
  appearance?: HumanAppearance;
  hairMeshes: Mesh[] = [];
  clothMeshes: Mesh[] = [];
  /** Called with the new clothes after they change (e.g. to add them to a shadow map). */
  onClothesChanged?: (meshes: Mesh[]) => void;
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

  /** This character's own (cloned) materials. */
  materials(): Material[] {
    const found = new Set<Material>();
    for (const mesh of this.root.getChildMeshes(false)) if (mesh.material) found.add(mesh.material);
    return [...found];
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

  /** Seconds the animation takes at the current playback speed (0 if the clip is missing). */
  duration(animation: HumanAnimation): number {
    const group = this.group(animation);
    return group ? group.getLength() / this.speedRatio : 0;
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

  setAppearance(appearance: HumanAppearance) {
    this.attach?.library.setAppearance(this, appearance);
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
      if (track.targetProperty === 'position' && !MOVING_BONES.has(target.name)) continue;
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
