import { useEffect, useRef, type RefObject } from 'react';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { keysAbove, pressedAbove } from './layersAbove.ts';
import { focusAround } from './panelFocus.ts';
import { swallowPress } from './swallowPress.ts';

/** How the panel was closed: Escape and its own Close give focus back to the control, a press outside leaves it. */
export type CloseReason = 'escape' | 'outside' | 'close';

/**
 * While `on`, the panel is a light popover that owns the next gesture. Escape, wherever the focus is,
 * goes to the panel first (`escape` undoes its innermost state, else it closes) and to nothing else: it is
 * marked used (`handledByAnotherControl`) and no other listener on the window hears it, so one Escape
 * closes one thing and the DM screen closes on the next. An Escape another control took first is left to
 * it. Tab moves the focus through the panel's controls and round, and nothing else hears it either: on the
 * DM screen Tab is the key that closes the screen. A press anywhere outside the panel, with any button or pointer, closes it and is swallowed whole, so
 * it rolls, opens and presses nothing; the next press is the page's again. A layer over the panel that
 * takes keys (a modal, a menu, a suggestion list) keeps both for itself, and any layer its presses.
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
      const tab = event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
      if ((event.key !== 'Escape' && !tab) || event.isComposing || handledByAnotherControl(event) || keysAbove(panel)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (tab) focusAround(panel, event.shiftKey);
      else if (!latest.current.escape()) latest.current.close('escape');
    };
    const onPress = (event: PointerEvent): void => {
      // Not `instanceof Element`: an element of a popout window is none of this window's classes.
      const target = event.target as (Node & Partial<Pick<Element, 'closest'>>) | null;
      if (target === null || panel.contains(target) || keysAbove(panel) || pressedAbove(target)) return;
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
