// Constants and message contracts shared by the server and the client.

import type { HumanAnimation, HumanBody } from './humans';
import { HUMAN_METRICS } from './scale';

export * from './humans';
export * from './scale';
export * from './vehicles';
export * from './city';
export * from './traffic';
export * from './interiors';

export const ROOM_NAME = 'game';
export const SERVER_PORT = 3000;

export const TICK_RATE = 20;
export const PLAYER_SPEED = HUMAN_METRICS.runSpeed; // metres per second

export const Messages = {
  Input: 'input',
  Action: 'action',
  Teleport: 'teleport',
  Door: 'door',
} as const;

/** Movement direction on the ground plane, each axis in [-1, 1]. */
export interface InputMessage {
  x: number;
  z: number;
}

/** Ask the server to play an animation (emote, attack, ...). Moving cancels it. */
export interface ActionMessage {
  animation: HumanAnimation;
}

/** Go to the street nearest this point (from clicking the city map). */
export interface TeleportMessage {
  x: number;
  z: number;
}

/** Through the door the player is standing at (into a building's room or back out), or `home` to go home. */
export interface DoorMessage {
  home?: boolean;
}

export interface JoinOptions {
  name?: string;
  body?: HumanBody;
}

/** Shape of a player in the synced room state. */
export interface PlayerSnapshot {
  name: string;
  color: string;
  body: string;
  x: number;
  y: number;
  z: number;
  /** Facing angle around Y in radians; 0 faces +Z. */
  heading: number;
  animation: string;
  /** Bumped every time an action starts, so the same action can be replayed. */
  animationSeq: number;
}
