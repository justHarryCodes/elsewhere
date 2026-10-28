// Which screen the player is on and what they've picked, as plain data with pure updates, so it
// survives scene changes and both renderers share it. The client keeps one copy (e.g. in useReducer).

import type { HumanAppearance, HumanBody } from '../humans';
import { locationById } from './locations';

export type WorldScene =
  | { kind: 'map' }
  | { kind: 'district'; locationId: string }
  /** Inside; `from` says where you came in (the front door, or down from the roof). */
  | { kind: 'interior'; locationId: string; from?: 'door' | 'roof' }
  | { kind: 'roof'; locationId: string };

export interface PlayerState {
  body: HumanBody;
  /** Unset until the player customises their look (renderers then pick a default). */
  appearance?: HumanAppearance;
  /** Where the player last stood in the current district (district coordinates). */
  position?: { x: number; z: number; rotY: number };
}

export interface WorldState {
  scene: WorldScene;
  /** The building highlighted on the map, if any. */
  selectedId: string | null;
  player: PlayerState;
}

export type WorldAction =
  | { type: 'select'; id: string | null }
  | { type: 'travel'; locationId: string }
  | { type: 'backToMap' }
  | { type: 'enter' }
  | { type: 'leave' }
  | { type: 'goUp' }
  | { type: 'goDown' }
  | { type: 'setPlayer'; player: Partial<PlayerState> };

export function createWorldState(body: HumanBody = 'male'): WorldState {
  return { scene: { kind: 'map' }, selectedId: null, player: { body } };
}

export function worldReducer(state: WorldState, action: WorldAction): WorldState {
  switch (action.type) {
    case 'select':
      return { ...state, selectedId: action.id && locationById(action.id) ? action.id : null };
    case 'travel': {
      const location = locationById(action.locationId);
      if (!location) return state;
      const { spawn } = location.district;
      return {
        ...state,
        scene: { kind: 'district', locationId: location.id },
        selectedId: null,
        player: { ...state.player, position: { ...spawn } },
      };
    }
    case 'backToMap':
      return { ...state, scene: { kind: 'map' }, selectedId: state.scene.kind === 'map' ? state.selectedId : null };
    case 'enter':
      return state.scene.kind === 'district' ? { ...state, scene: { kind: 'interior', locationId: state.scene.locationId, from: 'door' } } : state;
    case 'goUp':
      return state.scene.kind === 'interior' ? { ...state, scene: { kind: 'roof', locationId: state.scene.locationId } } : state;
    case 'goDown':
      return state.scene.kind === 'roof' ? { ...state, scene: { kind: 'interior', locationId: state.scene.locationId, from: 'roof' } } : state;
    case 'leave': {
      // Back outside at the district's spawn, just outside the door.
      if (state.scene.kind !== 'interior') return state;
      const location = locationById(state.scene.locationId);
      return {
        ...state,
        scene: { kind: 'district', locationId: state.scene.locationId },
        player: { ...state.player, position: location ? { ...location.district.spawn } : state.player.position },
      };
    }
    case 'setPlayer':
      return { ...state, player: { ...state.player, ...action.player } };
  }
}
