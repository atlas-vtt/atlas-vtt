import { useEffect, useRef, type RefObject } from 'react';

/** What a host marks its button for the log with: a press on it is no press outside the panel. */
export const LOG_TOGGLE = '.atlas-online-log-button';

/**
 * Whether a modal layer stands over the panel: an element marked `aria-modal` that is neither the
 * panel's nor around it (an image opened from the log, a dialog). Its own Escape and presses are its.
 */
function covered(panel: HTMLElement): boolean {
  return Array.from(panel.ownerDocument.querySelectorAll('[aria-modal="true"]')).some((layer) => !layer.contains(panel) && !panel.contains(layer));
}

/**
 * While `on` (the floating panel, not pinned): Escape, wherever the focus is, goes to the panel
 * (`escape`, which undoes its innermost state or closes it), and a press outside the panel closes
 * it, as Atlas's dice log does (not a press on the host's own button for the log, `LOG_TOGGLE`).
 * While a modal layer stands over it, neither reaches the panel: Escape and a press close that first.
 */
export function usePanelDismissal(root: RefObject<HTMLElement | null>, on: boolean, escape: () => boolean, close: () => void): void {
  const latest = useRef({ escape, close });
  useEffect(() => {
    latest.current = { escape, close };
  });

  useEffect(() => {
    const panel = root.current;
    const doc = panel?.ownerDocument;
    const view = doc?.defaultView;
    if (!on || panel === null || doc === undefined || view === null || view === undefined) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || covered(panel) || !latest.current.escape()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onPress = (event: PointerEvent): void => {
      // Not `instanceof Element`: an element of a popout window is none of this window's classes.
      const target = event.target as Partial<Element> | null;
      if (event.button !== 0 || typeof target?.closest !== 'function' || covered(panel)) return;
      // The host's button that opens and closes the log does that itself: closing here would open it again.
      if (target.closest(`.atlas-online-log, ${LOG_TOGGLE}`) === null) latest.current.close();
    };
    view.addEventListener('keydown', onKey, true);
    doc.addEventListener('pointerdown', onPress, true);
    return () => {
      view.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('pointerdown', onPress, true);
    };
  }, [root, on]);
}
