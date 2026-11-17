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

/** Keys that are letters take no Shift; `+` does on most layouts. */
const takesShift = (key: string): boolean => key.length === 1 && !/[a-z]/i.test(key);

/**
 * While the tray is open, Escape closes it, Enter outside it rolls it and the tray's own keys work wherever
 * focus is but in a text field. All are heard in the capture phase, before the map's shortcuts and the
 * toolbar editor; a key the tray uses is stopped there, so it never reaches the map. Keys on the tray's own
 * controls keep their native work (`stopMapKeys`).
 */
export function useDiceTrayKeys(root: React.RefObject<HTMLElement | null>, keys: TrayKeys): void {
  const current = useRef(keys);
  current.current = keys;
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!doc) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        current.current.onClose();
        return;
      }
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Enter') {
        if (event.shiftKey || root.current?.contains(event.target as Node) || !current.current.mapKeys(event)) return;
        if (current.current.onEnter()) event.preventDefault();
        return;
      }
      if ((event.shiftKey && !takesShift(event.key)) || isTextEntryTarget(event.target) || !current.current.mapKeys(event)) return;
      if (!current.current.onShortcut(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, [root]);
}
