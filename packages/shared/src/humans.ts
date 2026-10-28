// Every human in the world is a Universal Base Character animated by the Universal Animation
// Library (Quaternius). Both share one 65-bone skeleton, so any clip plays on any body by bone name.
//
// UAL2 is the primary library. It has no core locomotion (idle/walk/jog/sprint/jump), so those
// clips come from UAL1, which is the same rig; walk, jog and sprint are calmer copies of UAL1's
// (scripts/characters/relax_clips.mjs).
//
// The bodies are Quaternius' "Superhero" bases rebuilt slimmer and softer
// (scripts/characters/reshape_bodies.mjs), and clothes are skinned to the same skeleton
// (scripts/characters/build_clothes.py).

import { HUMAN_METRICS, type SizeKey } from "./scale";

export const ANIMATION_LIBRARIES = {
  ual1: "/assets/animations/UAL1_Standard.glb",
  ual2: "/assets/animations/UAL2_Standard.glb",
  relaxed: "/assets/animations/UAL_Relaxed.glb",
  actions: "/assets/animations/UAL_Actions.glb",
} as const;
export type AnimationLibrary = keyof typeof ANIMATION_LIBRARIES;

const MALE_URL = "/assets/characters/base/Body_Male.gltf";
const FEMALE_URL = "/assets/characters/base/Body_Female.gltf";

/**
 * Body shapes, made from the two base bodies by thinning the mesh around each bone (see
 * reshapeSkinnedMesh in the renderers). Factors scale a bone's cross-section (its local X and Z;
 * every bone in this rig runs along its local Y), or all three axes when `uniform`. Bones that
 * aren't listed keep their shape. Matched against bone names in order; the first match wins.
 */
export interface BodyShape {
  bones: readonly { match: RegExp; scale: readonly [number, number, number] }[];
}

// The bases are already lean, so slim is a gentle step further.
const SLIM_BONES: BodyShape["bones"] = [
  { match: /^(pelvis|spine_0[1-3])$/, scale: [0.92, 1, 0.92] },
  { match: /^clavicle_/, scale: [0.94, 1, 0.94] },
  { match: /^upperarm_/, scale: [0.9, 1, 0.9] },
  { match: /^lowerarm_/, scale: [0.92, 1, 0.92] },
  { match: /^thigh_/, scale: [0.92, 1, 0.92] },
  { match: /^calf_/, scale: [0.94, 1, 0.94] },
  { match: /^neck_/, scale: [0.94, 1, 0.94] },
];

export const BODY_SHAPES = {
  regular: { bones: [] },
  slim: { bones: SLIM_BONES },
  // Teens: a slim build, and a slightly larger head for their height (the whole body is then
  // scaled down to teen height, so the head ends up a little bigger in proportion).
  teen: { bones: [{ match: /^head$/i, scale: [1.08, 1.08, 1.08] }, ...SLIM_BONES] },
} as const satisfies Record<string, BodyShape>;
export type BodyShapeKey = keyof typeof BODY_SHAPES;

export const HUMAN_BODIES = {
  male: { label: "Man", base: "male", url: MALE_URL, size: "human.adultMale", shape: "regular" },
  female: { label: "Woman", base: "female", url: FEMALE_URL, size: "human.adultFemale", shape: "regular" },
  maleSlim: { label: "Slim man", base: "male", url: MALE_URL, size: "human.adultMale", shape: "slim" },
  femaleSlim: { label: "Slim woman", base: "female", url: FEMALE_URL, size: "human.adultFemale", shape: "slim" },
  teenBoy: { label: "Teen boy", base: "male", url: MALE_URL, size: "human.teen", shape: "teen" },
  teenGirl: { label: "Teen girl", base: "female", url: FEMALE_URL, size: "human.teen", shape: "teen" },
} as const satisfies Record<
  string,
  { label: string; base: "male" | "female"; url: string; size: SizeKey; shape: BodyShapeKey }
>;
export type HumanBody = keyof typeof HUMAN_BODIES;

// ------------------------------------------------------------------ appearance

/** Skin tones: a tint over the base skin texture (a mid tan), so >1 lightens and <1 darkens. */
export const SKIN_TONES = {
  porcelain: { label: "Porcelain", tint: [1.38, 1.28, 1.22] },
  fair: { label: "Fair", tint: [1.24, 1.12, 1.04] },
  light: { label: "Light", tint: [1.1, 1.0, 0.94] },
  medium: { label: "Medium", tint: [1, 1, 1] },
  tan: { label: "Tan", tint: [0.86, 0.78, 0.72] },
  brown: { label: "Brown", tint: [0.66, 0.55, 0.49] },
  dark: { label: "Dark", tint: [0.47, 0.37, 0.33] },
  deep: { label: "Deep", tint: [0.32, 0.25, 0.22] },
} as const satisfies Record<string, { label: string; tint: readonly [number, number, number] }>;
export type SkinTone = keyof typeof SKIN_TONES;

/** Hairstyles from the Universal Base Characters pack, skinned to the same skeleton as the bodies. */
export const HAIR_STYLES = {
  none: { label: "Bald", url: null },
  buzzed: { label: "Buzz cut", url: "/assets/characters/hairstyles/Hair_Buzzed.gltf" },
  buzzedFemale: { label: "Pixie", url: "/assets/characters/hairstyles/Hair_BuzzedFemale.gltf" },
  parted: { label: "Side part", url: "/assets/characters/hairstyles/Hair_SimpleParted.gltf" },
  long: { label: "Long", url: "/assets/characters/hairstyles/Hair_Long.gltf" },
  buns: { label: "Buns", url: "/assets/characters/hairstyles/Hair_Buns.gltf" },
} as const satisfies Record<string, { label: string; url: string | null }>;
export type HairStyle = keyof typeof HAIR_STYLES;
export const BEARD_URL = "/assets/characters/hairstyles/Hair_Beard.gltf";

/** Hair colours: the hair textures are neutral grey, so these tint them directly. */
export const HAIR_COLORS = {
  black: { label: "Black", hex: "#1c1714" },
  darkBrown: { label: "Dark brown", hex: "#3b2516" },
  brown: { label: "Brown", hex: "#6b4226" },
  auburn: { label: "Auburn", hex: "#8a3b1e" },
  ginger: { label: "Ginger", hex: "#b8572a" },
  blonde: { label: "Blonde", hex: "#d9b46a" },
  platinum: { label: "Platinum", hex: "#e8e0d0" },
  grey: { label: "Grey", hex: "#9a9690" },
} as const satisfies Record<string, { label: string; hex: string }>;
export type HairColor = keyof typeof HAIR_COLORS;

// ------------------------------------------------------------------ clothing

/** One GLB of clothes per base body, plus which body vertices each piece covers (that skin is hidden). */
export const CLOTHES_URLS = {
  male: { model: "/assets/characters/clothes/Clothes_Male.glb", cover: "/assets/characters/clothes/Clothes_Male.json" },
  female: { model: "/assets/characters/clothes/Clothes_Female.glb", cover: "/assets/characters/clothes/Clothes_Female.json" },
} as const;

/** Where a piece is worn: one piece per slot; a full outfit (dress) takes the top and bottom slots. */
export type ClothingSlot = "top" | "bottom" | "full" | "shoes" | "hands" | "knees" | "back" | "head" | "waist" | "wrists" | "neck";

/** Three colour zones per piece: main fabric, trim (hems, panels, soles), detail (pockets, zips, buckles). */
export type ClothingColors = readonly [main: string, trim: string, detail: string];

export const CLOTHING = {
  tee: { label: "T-shirt", slot: "top", colors: ["#2b2b30", "#1b1b1f", "#c9c9c9"] },
  tank: { label: "Tank top", slot: "top", colors: ["#f2f2ee", "#d8d8d2", "#d8d8d2"] },
  crop: { label: "Crop top", slot: "top", colors: ["#7b3fc4", "#f2f2f2", "#1b1b1f"] },
  track: { label: "Track jacket", slot: "top", colors: ["#2459c9", "#86b6ff", "#e8eef7"] },
  tactical: { label: "Field shirt", slot: "top", colors: ["#5f6b3a", "#4b5530", "#3e4628"] },
  hoodie: { label: "Hoodie", slot: "top", colors: ["#d9d4c7", "#c4bfb1", "#8c877a"] },
  cargo: { label: "Cargo joggers", slot: "bottom", colors: ["#3d3f45", "#2b2d31", "#2b2d31"] },
  trackpants: { label: "Track pants", slot: "bottom", colors: ["#1f3f9e", "#e8eef7", "#86b6ff"] },
  shorts: { label: "Cargo shorts", slot: "bottom", colors: ["#7a7048", "#5f5735", "#5f5735"] },
  ripped: { label: "Ripped jeans", slot: "bottom", colors: ["#1c1c22", "#d9d4c7", "#d9d4c7"] },
  skirt: { label: "Pleated skirt", slot: "bottom", colors: ["#2b2b33", "#c43a5a", "#22222a"] },
  dress: { label: "Sundress", slot: "full", colors: ["#2f9a52", "#1f6e3a", "#e9d9a6"] },
  sneakers: { label: "Sneakers", slot: "shoes", colors: ["#f4f4f2", "#f4f4f2", "#d0d0cc"] },
  hightops: { label: "High-tops", slot: "shoes", colors: ["#1d1d22", "#f4f4f2", "#c43a5a"] },
  boots: { label: "Boots", slot: "shoes", colors: ["#3b3326", "#1d1a15", "#5c513d"] },
  gloves: { label: "Fingerless gloves", slot: "hands", colors: ["#1d1d22", "#3a3a42", "#3a3a42"] },
  kneepads: { label: "Knee pads", slot: "knees", colors: ["#f2f2f2", "#2b2b30", "#2b2b30"] },
  backpack: { label: "Backpack", slot: "back", colors: ["#26272c", "#3a3b42", "#b8b8b8"] },
  headband: { label: "Headband", slot: "head", colors: ["#f2f2f2", "#c43a5a", "#c43a5a"] },
  belt: { label: "Belt", slot: "waist", colors: ["#2a221b", "#c9a24a", "#c9a24a"] },
  wristbands: { label: "Wristbands", slot: "wrists", colors: ["#1d1d22", "#c0c0c8", "#c0c0c8"] },
  choker: { label: "Choker", slot: "neck", colors: ["#141418", "#c0c0c8", "#c0c0c8"] },
} as const satisfies Record<string, { label: string; slot: ClothingSlot; colors: ClothingColors }>;
export type ClothingItem = keyof typeof CLOTHING;

export interface ClothingPick {
  item: ClothingItem;
  /** Overrides the piece's own colours. */
  colors?: ClothingColors;
}

/** Bold, clean fabric colours for recolouring pieces. */
export const CLOTH_COLORS = [
  "#1b1b1f", "#3d3f45", "#f2f2ee", "#c9c9c9", "#2459c9", "#86b6ff", "#1f3f9e", "#2f9a52",
  "#5f6b3a", "#7a7048", "#c43a5a", "#e8553f", "#f2b33d", "#7b3fc4", "#e86fb0", "#2a9d9a",
] as const;

/** Ready-made looks (the first five follow the reference sheet). */
export const OUTFITS = {
  street: { label: "Street", clothes: ["tee", "cargo", "sneakers", "backpack", "gloves"] },
  athlete: { label: "Track suit", clothes: ["track", "trackpants", "sneakers", "kneepads", "gloves"] },
  sundress: { label: "Sundress", clothes: ["dress", "sneakers"] },
  field: { label: "Field", clothes: ["tactical", "shorts", "boots", "headband", "kneepads"] },
  punk: { label: "Punk", clothes: ["crop", "ripped", "hightops", "choker", "wristbands"] },
  cosy: { label: "Cosy", clothes: ["hoodie", "trackpants", "sneakers"] },
  casual: { label: "Casual", clothes: ["tank", "cargo", "boots", "belt"] },
  skater: { label: "Skater", clothes: ["hoodie", "shorts", "hightops", "backpack"] },
} as const satisfies Record<string, { label: string; clothes: readonly ClothingItem[] }>;
export type Outfit = keyof typeof OUTFITS;

export const outfitClothes = (outfit: Outfit): ClothingPick[] => OUTFITS[outfit].clothes.map((item) => ({ item }));

/** Puts a piece on, taking off whatever shared its slot (a dress replaces top and bottom, and back). */
export function wearClothing(clothes: readonly ClothingPick[], pick: ClothingPick): ClothingPick[] {
  const slot = CLOTHING[pick.item].slot;
  const clashes = (other: ClothingSlot) =>
    other === slot || (slot === "full" && (other === "top" || other === "bottom")) || (other === "full" && (slot === "top" || slot === "bottom"));
  return [...clothes.filter((c) => !clashes(CLOTHING[c.item].slot)), pick];
}

export interface HumanAppearance {
  skin: SkinTone;
  hair: HairStyle;
  hairColor: HairColor;
  /** Male bodies only. */
  beard: boolean;
  clothes: ClothingPick[];
}

export function defaultAppearance(body: HumanBody): HumanAppearance {
  const male = HUMAN_BODIES[body].base === "male";
  return {
    skin: "medium",
    hair: male ? "parted" : "long",
    hairColor: "darkBrown",
    beard: false,
    clothes: outfitClothes(male ? "street" : "sundress"),
  };
}

/** A varied, repeatable look for a seed (an id): skin, hair, an outfit and sometimes recoloured pieces. */
export function randomAppearance(body: HumanBody, seed: number): HumanAppearance {
  let s = (seed >>> 0) || 1;
  const next = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length) % list.length];
  const male = HUMAN_BODIES[body].base === "male";
  const outfits = (Object.keys(OUTFITS) as Outfit[]).filter((o) => !male || o !== "sundress");
  const clothes = outfitClothes(pick(outfits)).map((c) =>
    next() < 0.45 && CLOTHING[c.item].slot !== "shoes" ? { ...c, colors: [pick(CLOTH_COLORS), pick(CLOTH_COLORS), CLOTHING[c.item].colors[2]] as const } : c,
  );
  const hairs: HairStyle[] = male ? ["buzzed", "parted", "parted", "none", "long"] : ["long", "long", "buns", "buzzedFemale", "parted"];
  return {
    skin: pick(Object.keys(SKIN_TONES) as SkinTone[]),
    hair: pick(hairs),
    hairColor: pick(Object.keys(HAIR_COLORS) as HairColor[]),
    beard: male && next() < 0.3,
    clothes,
  };
}

/** A stable number for a string id (for randomAppearance). */
export function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface HumanClip {
  library: AnimationLibrary;
  /** Animation name inside the library file. */
  clip: string;
  loop: boolean;
}

const ual1 = (clip: string, loop = clip.endsWith("_Loop")): HumanClip => ({
  library: "ual1",
  clip,
  loop,
});
const ual2 = (clip: string, loop = clip.endsWith("_Loop")): HumanClip => ({
  library: "ual2",
  clip,
  loop,
});
const relaxed = (clip: string): HumanClip => ({ library: "relaxed", clip, loop: true });
/** Furniture actions authored on the same rig (scripts/characters/pose_clips.mjs). */
const action = (clip: string): HumanClip => ({ library: "actions", clip, loop: true });

/** Game-facing animation names. Code refers to these keys, never to raw clip names. */
export const HUMAN_ANIMATIONS = {
  // Locomotion (UAL1; idle, walk, jog and sprint calmed down)
  idle: relaxed("Idle_Loop"),
  walk: relaxed("Walk_Loop"),
  walkFormal: ual1("Walk_Formal_Loop"),
  jog: relaxed("Jog_Fwd_Loop"),
  sprint: relaxed("Sprint_Loop"),
  crouchIdle: ual1("Crouch_Idle_Loop"),
  crouchWalk: ual1("Crouch_Fwd_Loop"),
  jumpStart: ual1("Jump_Start"),
  jumpLoop: ual1("Jump_Loop"),
  jumpLand: ual1("Jump_Land"),
  roll: ual1("Roll"),
  swimIdle: ual1("Swim_Idle_Loop"),
  swim: ual1("Swim_Fwd_Loop"),

  // Traversal (UAL2)
  climbUp: ual2("ClimbUp_1m"),
  slideStart: ual2("Slide_Start"),
  slideLoop: ual2("Slide_Loop"),
  slideExit: ual2("Slide_Exit"),
  ninjaJumpStart: ual2("NinjaJump_Start"),
  ninjaJumpIdle: ual2("NinjaJump_Idle_Loop"),
  ninjaJumpLand: ual2("NinjaJump_Land"),
  layToIdle: ual2("LayToIdle"),

  // Idles & social (UAL2)
  idleFoldArms: ual2("Idle_FoldArms_Loop"),
  idleLantern: ual2("Idle_Lantern_Loop"),
  idleNo: ual2("Idle_No_Loop"),
  idleRail: ual2("Idle_Rail_Loop"),
  idleRailCall: ual2("Idle_Rail_Call"),
  talkOnPhone: ual2("Idle_TalkingPhone_Loop"),
  yes: ual2("Yes"),

  // Idles & social (UAL1)
  idleTalking: ual1("Idle_Talking_Loop"),
  idleTorch: ual1("Idle_Torch_Loop"),
  dance: ual1("Dance_Loop"),
  sitDown: ual1("Sitting_Enter"),
  sitIdle: ual1("Sitting_Idle_Loop"),
  sitTalking: ual1("Sitting_Talking_Loop"),
  standUp: ual1("Sitting_Exit"),
  driving: ual1("Driving_Loop"),

  // Using furniture (lying on a bed, in a bath, showering, at a desk, a worktop, a game)
  lieDown: action("Lie_Loop"),
  bathSoak: action("Bath_Loop"),
  shower: action("Shower_Loop"),
  typing: action("Type_Loop"),
  counterWork: action("Counter_Loop"),
  playGame: action("Play_Loop"),

  // Interaction & work (UAL2)
  openChest: ual2("Chest_Open"),
  consume: ual2("Consume"),
  farmHarvest: ual2("Farm_Harvest"),
  farmPlantSeed: ual2("Farm_PlantSeed"),
  farmWatering: ual2("Farm_Watering"),
  chopTree: ual2("TreeChopping_Loop"),
  walkCarry: ual2("Walk_Carry_Loop"),
  overhandThrow: ual2("OverhandThrow"),

  // Interaction & work (UAL1)
  interact: ual1("Interact"),
  pickUp: ual1("PickUp_Table"),
  push: ual1("Push_Loop"),
  fixKneeling: ual1("Fixing_Kneeling"),

  // Melee (UAL2)
  meleeHook: ual2("Melee_Hook"),
  meleeHookRecover: ual2("Melee_Hook_Rec"),
  swordA: ual2("Sword_Regular_A"),
  swordARecover: ual2("Sword_Regular_A_Rec"),
  swordB: ual2("Sword_Regular_B"),
  swordBRecover: ual2("Sword_Regular_B_Rec"),
  swordC: ual2("Sword_Regular_C"),
  swordCombo: ual2("Sword_Regular_Combo"),
  swordHeavyCombo: ual2("Sword_Heavy_Combo"),
  swordBlock: ual2("Sword_Block"),
  swordDash: ual2("Sword_Dash"),
  shieldIdle: ual2("Idle_Shield_Loop"),
  shieldBreak: ual2("Idle_Shield_Break"),
  shieldBash: ual2("Shield_OneShot"),
  shieldDash: ual2("Shield_Dash"),

  // Melee (UAL1)
  punchJab: ual1("Punch_Jab"),
  punchCross: ual1("Punch_Cross"),
  swordIdle: ual1("Sword_Idle", true),
  swordAttack: ual1("Sword_Attack"),

  // Ranged & magic (UAL1)
  pistolIdle: ual1("Pistol_Idle_Loop"),
  pistolAimUp: ual1("Pistol_Aim_Up"),
  pistolAim: ual1("Pistol_Aim_Neutral"),
  pistolAimDown: ual1("Pistol_Aim_Down"),
  pistolShoot: ual1("Pistol_Shoot"),
  pistolReload: ual1("Pistol_Reload"),
  spellEnter: ual1("Spell_Simple_Enter"),
  spellIdle: ual1("Spell_Simple_Idle_Loop"),
  spellCast: ual1("Spell_Simple_Shoot"),
  spellExit: ual1("Spell_Simple_Exit"),

  // Damage
  hitKnockback: ual2("Hit_Knockback"),
  hitChest: ual1("Hit_Chest"),
  hitHead: ual1("Hit_Head"),
  death: ual1("Death01"),

  // Zombie (UAL2)
  zombieIdle: ual2("Zombie_Idle_Loop"),
  zombieWalk: ual2("Zombie_Walk_Fwd_Loop"),
  zombieScratch: ual2("Zombie_Scratch"),
} as const satisfies Record<string, HumanClip>;

export type HumanAnimation = keyof typeof HUMAN_ANIMATIONS;

export const DEFAULT_HUMAN_ANIMATION: HumanAnimation = "idle";
export const DEFAULT_HUMAN_BODY: HumanBody = "male";

export const isHumanAnimation = (value: unknown): value is HumanAnimation =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(HUMAN_ANIMATIONS, value);

export const isHumanBody = (value: unknown): value is HumanBody =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(HUMAN_BODIES, value);

export const toHumanAnimation = (value: unknown): HumanAnimation =>
  isHumanAnimation(value) ? value : DEFAULT_HUMAN_ANIMATION;

export const toHumanBody = (value: unknown): HumanBody =>
  isHumanBody(value) ? value : DEFAULT_HUMAN_BODY;

/** Picks the locomotion clip that matches a ground speed in metres per second. */
export function locomotionForSpeed(speed: number): HumanAnimation {
  if (speed < 0.1) return "idle";
  if (speed <= HUMAN_METRICS.walkSpeed * 1.5) return "walk";
  if (speed <= HUMAN_METRICS.runSpeed * 1.2) return "jog";
  return "sprint";
}
