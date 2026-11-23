import type React from 'react';
import { useEffect, useRef } from 'react';
import { isTextEntryTarget } from '../../../keyboard/textEntry';

/** Keys the map's shortcuts also use: on a control of the tray they keep their native work and never reach the map. */
const MAP_KEYS = new Set([' ', 'Enter', 'Delete', 'Backspace']);

/** For the tray's root: Space on a die never opens the palette, Delete on a die never deletes the map's selection. Tab is left to the DM screen. */
export function stopMapKeys(event: React.KeyboardEvent): void {
  if (MAP_KEYS.has(event.key)) event.stopPropagation();
}

interface TrayKeys {
  /** Escape, anywhere in the tray's document. */
  onClose: () => void;
  /** Whether a key outside a text field may act as a map key would (the map view in front, no dialog over it). */
  mapKeys: (event: KeyboardEvent) => boolean;
  /** Enter pressed outside the tray; returns whether it rolled. */
  onEnter: () => boolean;
  /** One of the tray's own keys (`n`, `a`, `d`, `+`, `-`); returns whether it used it. */
  onShortcut: (key: string) => boolean;
}

/** Parts of the tray whose controls keep Enter for themselves: a saved roll's editor, a choice's menu, the save form. */
const OWNS_ENTER = '.atlas-dice-preset-editor, .atlas-ctx-menu, .atlas-dice-presets__form';

/** Whether a key's target lies in one of `selector`, in any window (a popout's elements are not `instanceof` this one's). */
const within = (target: EventTarget | null, selector: string): boolean => {
  const node = target as Node | null;
  return node?.instanceOf?.(Element) === true && node.closest(selector) !== null;
};

/** Enter in a text field, or in a part that keeps it, is that control's own; anywhere else in the tray it rolls. */
const ownsEnter = (target: EventTarget | null): boolean => isTextEntryTarget(target) || within(target, OWNS_ENTER);

/** Keys that are letters take no Shift; `+` does on most layouts. */
const takesShift = (key: string): boolean => key.length === 1 && !/[a-z]/i.test(key);

/**
 * While the tray is open, Escape closes it, Enter rolls it wherever focus is but in a text field, and the
 * tray's own keys work wherever focus is but in a text field. All are heard in the capture phase, before the
 * map's shortcuts and the toolbar editor; a key the tray uses is stopped there, so it never reaches the map.
 * Other keys on the tray's controls keep their native work (`stopMapKeys`).
 *
 * The tray plays like a game, not a form: a press on one of its controls never moves focus (and takes it out
 * of a field it was in), so a die clicked never keeps Enter for itself.
 */
export function useDiceTrayKeys(root: React.RefObject<HTMLElement | null>, keys: TrayKeys): void {
  const current = useRef(keys);
  current.current = keys;
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    // The tray and the panels beside it (`.atlas-dice-tray`).
    const surface = root.current?.closest<HTMLElement>('.atlas-dice-tray') ?? root.current;
    if (!doc || !surface) return undefined;
    const onMouseDown = (event: MouseEvent): void => {
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      const focused = doc.activeElement;
      if (focused?.instanceOf(HTMLElement) && surface.contains(focused)) focused.blur();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // In a saved roll's editor Escape is the editor's (it steps back through a die's fan, then closes the editor),
        // and in a menu one of its choices opened, the menu's.
        if (within(event.target, '.atlas-dice-preset-editor, .atlas-ctx-menu')) return;
        event.preventDefault();
        current.current.onClose();
        return;
      }
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Enter') {
        if (event.shiftKey) return;
        if (surface.contains(event.target as Node) ? ownsEnter(event.target) : !current.current.mapKeys(event)) return;
        if (current.current.onEnter()) event.preventDefault();
        return;
      }
      if ((event.shiftKey && !takesShift(event.key)) || isTextEntryTarget(event.target) || !current.current.mapKeys(event)) return;
      if (!current.current.onShortcut(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    doc.addEventListener('keydown', onKeyDown, true);
    surface.addEventListener('mousedown', onMouseDown, true);
    return () => {
      doc.removeEventListener('keydown', onKeyDown, true);
      surface.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [root]);
}
