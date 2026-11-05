import { useEffect, type RefObject } from 'react';
import type { Mood } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { isModHeld } from '../../../../keyboard/modKey';
import { shortcutText } from '../../../../statblocks/editor/template-editor/shortcutText';
import { arrowDirection, isControlTarget, isWithin, screenTakesKey } from '../screenKeys';

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
  moods: readonly Mood[];
  moveMood: (mood: Mood, index: number) => void;
}

/** The keys the page shows on its controls, where they are not drawn as keycaps. */
export const SOUND_KEYS = { pauseMusic: 'Space', skipTrack: shortcutText(['Mod'], '→'), search: '/', nextMood: '↵', playFirst: '↵', moveUp: shortcutText(['Alt'], '↑'), moveDown: shortcutText(['Alt'], '↓'), moodEarlier: shortcutText(['Alt'], '←'), moodLater: shortcutText(['Alt'], '→') } as const;

/**
 * The tab's keys, heard before everything else while no field has focus, and kept from the map: digits
 * press moods, Enter the next one, Mod+→ (⌘→ on macOS) skips to the next track as a media player's,
 * Space pauses the music and plays it on from there, / goes to the search and Backspace is Stop all (or Bring back). Enter and Space on a focused
 * control are that control's, as a row of the library is, whose list has the arrows and Space too.
 */
export function useSoundKeys({ active, rootRef, viewId, director, moods, moveMood }: SoundKeysOptions): void {
  useEffect(() => {
    if (!active) return undefined;
    const handle = (event: KeyboardEvent): void => {
      const root = rootRef.current;
      if (!root || !screenTakesKey(event, root, viewId)) return;
      const taken = (): void => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (event.key === 'ArrowRight' && isModHeld(event) && !event.shiftKey && !event.altKey) {
        if (event.repeat) return;
        taken();
        director.desk.skip();
        return;
      }
      if (event.ctrlKey || event.metaKey) return;
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
        // Arrows move no focus on this page (owner, 2026-11-03: it plays like a game): left and right
        // change the DM screen's page, up and down are a fader's or the library's own.
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
        if (mood) director.press(mood);
        return;
      }
      if (event.key === '/') {
        const search = root.querySelector<HTMLInputElement>('.atlas-sound-lib__search input');
        if (!search) return;
        taken();
        search.focus();
        search.select();
        return;
      }
      if (event.key === 'Enter' && !isControlTarget(target)) {
        if (event.shiftKey) return;
        taken();
        director.pressNext();
        return;
      }
      if (event.key === ' ' && !isControlTarget(target) && !isWithin(target, '.atlas-sound-lib')) {
        taken();
        director.desk.togglePause();
        return;
      }
      if (event.key === 'Backspace') {
        taken();
        director.desk.toggleSilence();
      }
    };
    // The tab may stand in a popout, whose keys its own window hears.
    const win = rootRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('keydown', handle, true);
    return () => win.removeEventListener('keydown', handle, true);
  }, [active, rootRef, viewId, director, moods, moveMood]);
}
