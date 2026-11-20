import { useEffect, useRef, type RefObject } from 'react';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import type { SettingsService } from '../../../services/SettingsService';
import { useAtlasStore } from '../../ViewStoreContext';
import { useToolbarPeek } from './useToolbarPeek';
import './chrome-auto-hide.scss';

/** How near the pointer must come to a hidden bar, in CSS pixels, for it to show. */
const REACH_PX = 72;

/**
 * The bars that hide, each with what shows together with it: the main toolbar brings the
 * active tool's bars that hang from it, and they keep it. Looked up inside the view, so a
 * second map beside it is never touched.
 */
const UNITS: readonly (readonly string[])[] = [
  ['.atlas-bottom-toolbar-row__lead'],
  ['.atlas-bottom-toolbar-row__start'],
  ['.atlas-main-toolbar', '.atlas-bottom-toolbar-row__options'],
  ['.atlas-bottom-toolbar-row__end'],
  ['.atlas-level-switcher'],
];

const NEAR = 'data-near';
const AUTO_HIDE = 'data-chrome-auto-hide';

type Box = Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

export interface Pointer {
  x: number;
  y: number;
  /** A button is held: a drag (a token, a pan) that passes a bar does not bring it up. */
  pressed: boolean;
}

/** Whether a point lies within `REACH_PX` of a laid-out box; a box without size is nowhere. */
export function isNear(rect: Box, x: number, y: number): boolean {
  if (rect.width === 0 || rect.height === 0) return false;
  return x >= rect.left - REACH_PX && x <= rect.right + REACH_PX && y >= rect.top - REACH_PX && y <= rect.bottom + REACH_PX;
}

/**
 * Whether a bar (its boxes) shows for the pointer: near one of them, unless a held button
 * brought the pointer there; a bar already shown stays while the drag goes on near it.
 */
export function unitIsNear(rects: readonly Box[], shown: boolean, pointer: Pointer): boolean {
  return (shown || !pointer.pressed) && rects.some(rect => isNear(rect, pointer.x, pointer.y));
}

function unitsIn(root: HTMLElement): Element[][] {
  return UNITS.map(selectors => selectors.flatMap(selector => root.querySelector(selector) ?? []));
}

/**
 * The GM's "show the toolbar on hover": while it is on, the bars along the bottom of the map and
 * the level switcher show only while the pointer is near them (`data-near`); the stylesheet hides
 * the rest, keeps a bar whose menu is open, shows the toolbar for a moment when the tool changes
 * (`useToolbarPeek`), and never hides anything where no mouse or trackpad can hover.
 * Off in the player view and while the toolbar editor is open.
 */
export function useChromeAutoHide(rootRef: RefObject<HTMLElement | null>, playerView: boolean, explicitSettings: SettingsService | undefined): void {
  // Passed in: UIRoot, which calls this, is where the view's context is provided, so none reaches it.
  const settings = useAtlasSettings(explicitSettings);
  const editing = useAtlasStore(state => state.isToolbarEditing);
  const on = !playerView && !editing && settings?.isToolbarAutoHide() === true;
  useToolbarPeek(rootRef, on);
  // The palette takes a hidden toolbar's place: while it is open the bars stay as they were.
  const paletteOpen = useRef(false);
  paletteOpen.current = useAtlasStore(state => state.isCommandPaletteOpen);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !on) return undefined;
    const { doc, win } = root;
    const pointer: Pointer = { x: -Infinity, y: -Infinity, pressed: false };
    let frame = 0;

    const update = (): void => {
      frame = 0;
      if (paletteOpen.current) return;
      const view = root.getBoundingClientRect();
      const inView = pointer.x >= view.left && pointer.x <= view.right && pointer.y >= view.top && pointer.y <= view.bottom;
      for (const unit of unitsIn(root)) {
        const shown = unit.some(element => element.hasAttribute(NEAR));
        const near = inView && unitIsNear(unit.map(element => element.getBoundingClientRect()), shown, pointer);
        for (const element of unit) element.toggleAttribute(NEAR, near);
      }
    };
    const schedule = (): void => {
      if (frame === 0) frame = win.requestAnimationFrame(update);
    };
    const onPointer = (event: PointerEvent): void => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      // A press counts as a hover at its point (a touch), a move with a button held as a drag.
      pointer.pressed = event.type === 'pointermove' && event.buttons !== 0;
      schedule();
    };
    const onLeave = (): void => {
      pointer.x = -Infinity;
      pointer.y = -Infinity;
      schedule();
    };

    root.setAttribute(AUTO_HIDE, '');
    doc.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    doc.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    doc.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      win.cancelAnimationFrame(frame);
      doc.removeEventListener('pointermove', onPointer, { capture: true });
      doc.removeEventListener('pointerdown', onPointer, { capture: true });
      doc.documentElement.removeEventListener('pointerleave', onLeave);
      root.removeAttribute(AUTO_HIDE);
      for (const element of unitsIn(root).flat()) element.removeAttribute(NEAR);
    };
  }, [rootRef, on]);
}
