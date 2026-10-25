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

export const HUMAN_BODIES = {
  male: {
    url: "/assets/characters/base/Superhero_Male_FullBody.gltf",
    size: "human.adultMale",
  },
  female: {
    url: "/assets/characters/base/Superhero_Female_FullBody.gltf",
    size: "human.adultFemale",
  },
} as const satisfies Record<string, { url: string; size: SizeKey }>;
export type HumanBody = keyof typeof HUMAN_BODIES;

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
