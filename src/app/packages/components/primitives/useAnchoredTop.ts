import { useLayoutEffect } from 'react';
import { observeResize } from '../../../utils/observeResize';

/** The top a dialog opened with, from the top of the area its overlay centres it in. */
export const ANCHORED_TOP = '--atlas-anchored-top';

/**
 * Keeps a centred dialog's top where it opened. The dialog is centred by its auto margins until
 * this writes the top it was laid out at to `--atlas-anchored-top` (its stylesheet takes it as the
 * top margin), so content that grows or shrinks afterwards moves only what lies below it, never
 * the control just used. A window that changes size centres the dialog again, and so does anything
 * else that changes the area it is centred in: a tablet's keyboard rising under the overlay, or going.
 */
export function useAnchoredTop(element: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (!element) return undefined;
    const anchor = (): void => {
      element.style.removeProperty(ANCHORED_TOP);
      const area = element.parentElement;
      if (!area) return;
      const padding = parseFloat(getComputedStyle(area).paddingTop) || 0;
      const top = element.getBoundingClientRect().top - area.getBoundingClientRect().top - padding;
      element.style.setProperty(ANCHORED_TOP, `${Math.max(0, top)}px`);
    };
    anchor();
    const win = element.ownerDocument.defaultView;
    win?.addEventListener('resize', anchor);
    const area = element.parentElement;
    const stopObserving = area ? observeResize([area], anchor) : (): void => undefined;
    return (): void => {
      win?.removeEventListener('resize', anchor);
      stopObserving();
      element.style.removeProperty(ANCHORED_TOP);
    };
  }, [element]);
}
