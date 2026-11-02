import { useEffect, type RefObject } from 'react';
import type { Mood } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { arrowDirection, isControlTarget, isWithin, moveFocus, screenTakesKey } from '../screenKeys';

/** The mood a key of the digit row or the keypad presses: by its place, so a layout's symbols change nothing. 0 is the tenth. */
export function moodIndexOfCode(code: string): number | null {
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code)?.[1];
  if (digit === undefined) return null;
  return digit === '0' ? 9 : Number(digit) - 1;
}

interface SoundKeysOptions {
  active: boolean;
  rootRef: RefObject<HTMLElement | null>;
  viewId: string | undefined;
  director: SoundDirector;
  collectionId: string | null;
  moods: readonly Mood[];
  moveMood: (mood: Mood, index: number) => void;
}

/**
 * The tab's keys, heard before everything else while no field has focus, and kept from the map: digits
 * press moods, Enter the next one, Backspace is Silence, and the arrows go round the tab. Enter on a
 * focused control is that control's, as a row of the library is, whose list has the arrows too.
 */
export function useSoundKeys({ active, rootRef, viewId, director, collectionId, moods, moveMood }: SoundKeysOptions): void {
  useEffect(() => {
    if (!active) return undefined;
    const handle = (event: KeyboardEvent): void => {
      const root = rootRef.current;
      if (!root || !screenTakesKey(event, root, viewId) || event.ctrlKey || event.metaKey) return;
      const taken = (): void => {
        event.preventDefault();
        event.stopPropagation();
      };
      const target = event.target as HTMLElement | null;
      const direction = arrowDirection(event.key);
      if (direction) {
        if (isWithin(target, '.atlas-sound-lib') || target?.closest?.('[aria-expanded="true"], [role="listbox"]')) return;
        const moodId = target?.dataset?.soundMood;
        if (event.altKey) {
          const from = moods.findIndex((mood) => mood.id === moodId);
          const step = direction === 'left' || direction === 'up' ? -1 : 1;
          const mood = moods[from];
          if (mood && moods[from + step]) {
            taken();
            moveMood(mood, from + step);
          }
          return;
        }
        // A fader's own keys are up and down; left and right leave it.
        if (target?.getAttribute?.('role') === 'slider' && (direction === 'up' || direction === 'down')) return;
        const screen = root.closest('.atlas-dm-screen') ?? root;
        if (isControlTarget(target) && !target?.closest('.atlas-dm-screen-pages')) {
          taken();
          moveFocus(screen, target as Element, direction);
          return;
        }
        if (direction === 'down') {
          taken();
          root.querySelector<HTMLElement>('[data-sound-mood]')?.focus();
        } else if (direction === 'up') {
          taken();
          screen.querySelector<HTMLElement>('.atlas-dm-screen-pages .atlas-active')?.focus();
        }
        return;
      }
      if (event.altKey || event.repeat) return;
      if (target?.dataset?.soundMood && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
        taken();
        target.closest('.atlas-sound-mood')?.querySelector<HTMLElement>('.atlas-sound-mood__menu')?.click();
        return;
      }
      const index = moodIndexOfCode(event.code);
      if (index !== null && !event.shiftKey) {
        const mood = moods[index];
        taken();
        if (mood && collectionId !== null) director.press(collectionId, mood);
        return;
      }
      if (event.key === 'Enter' && !isControlTarget(target)) {
        taken();
        if (collectionId !== null) director.pressNext(collectionId);
        return;
      }
      if (event.key === 'Backspace') {
        taken();
        director.desk.toggleSilence();
      }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [active, rootRef, viewId, director, collectionId, moods, moveMood]);
}
