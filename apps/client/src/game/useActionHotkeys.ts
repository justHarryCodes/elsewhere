import { useEffect } from 'react';
import type { HumanAnimation } from '@game/shared';

/** Number-key emotes. Any HumanAnimation key can be bound here. */
export const ACTION_HOTKEYS: { code: string; label: string; animation: HumanAnimation }[] = [
  { code: 'Digit1', label: '1', animation: 'yes' },
  { code: 'Digit2', label: '2', animation: 'dance' },
  { code: 'Digit3', label: '3', animation: 'talkOnPhone' },
  { code: 'Digit4', label: '4', animation: 'swordCombo' },
  { code: 'Digit5', label: '5', animation: 'chopTree' },
];

export function useActionHotkeys(sendAction: (animation: HumanAnimation) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const hotkey = ACTION_HOTKEYS.find((entry) => entry.code === event.code);
      if (hotkey) sendAction(hotkey.animation);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendAction]);
}
