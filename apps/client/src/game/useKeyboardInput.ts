import { useEffect } from 'react';
import type { InputMessage } from '@game/shared';

const KEY_DIRECTIONS: Record<string, InputMessage> = {
  KeyW: { x: 0, z: -1 },
  ArrowUp: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 },
  ArrowDown: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 },
  ArrowLeft: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

/** Tracks held movement keys and sends the combined direction whenever it changes. */
export function useKeyboardInput(sendInput: (input: InputMessage) => void) {
  useEffect(() => {
    const held = new Set<string>();

    const emit = () => {
      let x = 0;
      let z = 0;
      for (const code of held) {
        x += KEY_DIRECTIONS[code].x;
        z += KEY_DIRECTIONS[code].z;
      }
      sendInput({ x: Math.sign(x), z: Math.sign(z) });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!KEY_DIRECTIONS[event.code] || held.has(event.code)) return;
      held.add(event.code);
      emit();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!held.delete(event.code)) return;
      emit();
    };
    const onBlur = () => {
      held.clear();
      emit();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [sendInput]);
}
