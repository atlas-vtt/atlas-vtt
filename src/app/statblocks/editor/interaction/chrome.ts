/**
 * Chrome is the editing furniture around the card: handles, toolbar and dock
 * buttons, chips (spec §3.4). It never takes focus, so pressing it never ends
 * the edit under way and never unmounts what was pressed (the audit's P0: a
 * handle that took focus closed the editor holding it, mid-press).
 */

import type { MouseEvent } from 'react';

/** Marks an element as chrome; `focusStaysIn` treats it like a menu of the surface. */
export const CHROME_ATTRIBUTE = 'data-atlas-chrome';
/** Marks a menu's content with the surface that opened it, so the surface's key scope stays while it is open. */
export const OWNER_ATTRIBUTE = 'data-atlas-owner';

export interface ChromeButtonProps {
  type: 'button';
  tabIndex: -1;
  'data-atlas-chrome': '';
  onMouseDown: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * The props every chrome button carries: out of the tab order (everything it
 * does has a key), and focus stays where it is on a press. Only the mouse
 * event's default is prevented: preventing `pointerdown` would suppress the
 * compatibility mouse events pointer sensors rely on.
 */
export function chromeButtonProps(): ChromeButtonProps {
  return {
    type: 'button',
    tabIndex: -1,
    [CHROME_ATTRIBUTE]: '',
    onMouseDown: (event) => event.preventDefault(),
  };
}

/**
 * Where focus is when a press on chrome opens a menu: chrome takes no focus,
 * so this is where it goes back once the menu closes with nothing chosen that
 * moved it (an input being typed, a focused block). Null on the body.
 */
export function focusToReturn(node: Element): HTMLElement | null {
  const active = node.doc.activeElement;
  return active && active !== node.doc.body && active.instanceOf(HTMLElement) ? active : null;
}
