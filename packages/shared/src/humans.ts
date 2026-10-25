// Every human in the world is a Universal Base Character animated by the Universal Animation
// Library (Quaternius). Both share one 65-bone skeleton, so any clip plays on any body by bone name.
//
// UAL2 is the primary library. It has no core locomotion (idle/walk/jog/sprint/jump), so those
// clips come from UAL1, which is the same rig.

import { HUMAN_METRICS, type SizeKey } from "./scale";

export const ANIMATION_LIBRARIES = {
  ual1: "/assets/animations/UAL1_Standard.glb",
  ual2: "/assets/animations/UAL2_Standard.glb",
} as const;
export type AnimationLibrary = keyof typeof ANIMATION_LIBRARIES;

const MALE_URL = "/assets/characters/base/Superhero_Male_FullBody.gltf";
const FEMALE_URL = "/assets/characters/base/Superhero_Female_FullBody.gltf";

/**
 * Body shapes, made from the two base bodies by thinning the mesh around each bone (see
 * reshapeSkinnedMesh in the renderers). Factors scale a bone's cross-section (its local X and Z;
 * every bone in this rig runs along its local Y), or all three axes when `uniform`. Bones that
 * aren't listed keep their shape. Matched against bone names in order; the first match wins.
 */
export interface BodyShape {
  bones: readonly { match: RegExp; scale: readonly [number, number, number] }[];
}

const SLIM_BONES: BodyShape["bones"] = [
  { match: /^(pelvis|spine_0[1-3])$/, scale: [0.85, 1, 0.85] },
  { match: /^clavicle_/, scale: [0.88, 1, 0.88] },
  { match: /^upperarm_/, scale: [0.8, 1, 0.8] },
  { match: /^lowerarm_/, scale: [0.84, 1, 0.84] },
  { match: /^thigh_/, scale: [0.86, 1, 0.86] },
  { match: /^calf_/, scale: [0.88, 1, 0.88] },
  { match: /^neck_/, scale: [0.88, 1, 0.88] },
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

export interface HumanAppearance {
  skin: SkinTone;
  hair: HairStyle;
  hairColor: HairColor;
  /** Male bodies only. */
  beard: boolean;
}

export function defaultAppearance(body: HumanBody): HumanAppearance {
  const male = HUMAN_BODIES[body].base === "male";
  return { skin: "medium", hair: male ? "parted" : "long", hairColor: "darkBrown", beard: false };
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

/** Game-facing animation names. Code refers to these keys, never to raw clip names. */
export const HUMAN_ANIMATIONS = {
  // Locomotion (UAL1)
  idle: ual1("Idle_Loop"),
  walk: ual1("Walk_Loop"),
  walkFormal: ual1("Walk_Formal_Loop"),
  jog: ual1("Jog_Fwd_Loop"),
  sprint: ual1("Sprint_Loop"),
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
