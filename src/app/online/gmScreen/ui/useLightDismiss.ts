import { useEffect, useRef, type RefObject } from 'react';
import { coveredByModal } from '../../tableLog/usePanelDismissal.ts';
import { swallowPress } from './swallowPress.ts';

/** Layers that stand over the DM screen (Obsidian's modals and menus, the notices): a press there is theirs, not one outside the panel. */
const ABOVE_THE_SCREEN = '.modal-container, .menu, .notice-container';

/** How the panel was closed: Escape and its own Close give focus back to the control, a press outside leaves it. */
export type CloseReason = 'escape' | 'outside' | 'close';

/**
 * While `on`, the panel is a light popover that owns the next gesture. Escape, wherever the focus is,
 * goes to the panel first (`escape` undoes its innermost state, else it closes) and to nothing under it:
 * the DM screen closes on the next one. A press anywhere outside the panel, with any button or pointer,
 * closes it and is swallowed whole, so it rolls, opens and presses nothing; the next press is the page's
 * again. A modal layer over the panel keeps both for itself, and a layer over the DM screen its presses.
 */
export function useLightDismiss(root: RefObject<HTMLElement | null>, on: boolean, escape: () => boolean, close: (reason: CloseReason) => void): void {
  const latest = useRef({ escape, close });
  useEffect(() => {
    latest.current = { escape, close };
  });

  useEffect(() => {
    const panel = root.current;
    const view = panel?.ownerDocument.defaultView;
    if (!on || panel === null || view === null || view === undefined) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || coveredByModal(panel)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!latest.current.escape()) latest.current.close('escape');
    };
    const onPress = (event: PointerEvent): void => {
      // Not `instanceof Element`: an element of a popout window is none of this window's classes.
      const target = event.target as (Node & Partial<Pick<Element, 'closest'>>) | null;
      if (target === null || panel.contains(target) || coveredByModal(panel) || target.closest?.(ABOVE_THE_SCREEN)) return;
      swallowPress(view, event);
      latest.current.close('outside');
    };
    view.addEventListener('keydown', onKey, true);
    view.addEventListener('pointerdown', onPress, true);
    return () => {
      view.removeEventListener('keydown', onKey, true);
      view.removeEventListener('pointerdown', onPress, true);
    };
  }, [root, on]);
}
