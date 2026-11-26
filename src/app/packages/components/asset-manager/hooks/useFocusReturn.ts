import { useEffect, useRef, useState, type RefObject } from 'react';
import { useIsPresent } from 'framer-motion';
import { getDomHost } from '../../../../host/dom';
import { focusSoon, landingAfterLeaving } from '../utils/cardFocus';

export interface FocusReturn {
  /** Focus goes to the card after `ids` in the grid (else before them, else `landingAfterLeaving`), which leave it, instead of the opener. */
  afterLeaving: (ids: readonly string[]) => void;
}

/** Whether focus can be put on `el`: a control, or an element with a tabindex (a card); a menu's anchor point is neither. */
function canHoldFocus(el: HTMLElement): boolean {
  return el.isConnected && (el.tabIndex >= 0 || el.hasAttribute('tabindex'));
}

/**
 * What opened a dialog, read as it first renders: the element focus is in, or for a row of a menu that is closing,
 * the menu's trigger. Null where focus was nowhere.
 */
function openerOf(doc: Document): HTMLElement | null {
  const active = doc.activeElement;
  if (!active?.instanceOf(HTMLElement) || active === doc.body) return null;
  if (!active.closest('[role="menu"]')) return active;
  const triggers = Array.from(doc.querySelectorAll<HTMLElement>('[aria-haspopup][aria-expanded="true"]'));
  return triggers.find((trigger) => !trigger.closest('[role="menu"]') && canHoldFocus(trigger)) ?? null;
}

/**
 * Gives focus back to what opened the dialog as it starts to close, however it closes (WAI-ARIA dialog pattern): a
 * closed dialog left focus on the page body, where the asset manager's keys reach nothing. Where the opener is gone (a
 * menu row), `fallback` names the element instead. Focus the user moved elsewhere meanwhile stays there. Call it in
 * the component an `AnimatePresence` mounts, so it acts as the exit begins.
 */
export function useFocusReturn(dialogRef: RefObject<HTMLElement | null>, fallback?: () => HTMLElement | null): FocusReturn {
  const [opener] = useState(() => openerOf(getDomHost().activeDocument()));
  const settled = useRef(false);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const present = useIsPresent();

  const docOf = (): Document => dialogRef.current?.ownerDocument ?? getDomHost().activeDocument();
  // Focus is still the dialog's: on it, on the body after its element went, or on nothing.
  const mayTake = (doc: Document): boolean => {
    const active = doc.activeElement;
    return !active || active === doc.body || !active.isConnected || (dialogRef.current?.contains(active) ?? false);
  };

  const restoreRef = useRef((): void => {});
  restoreRef.current = (): void => {
    if (settled.current) return;
    settled.current = true;
    const doc = docOf();
    focusSoon(doc, () => (opener && canHoldFocus(opener) ? opener : fallbackRef.current?.() ?? null), () => mayTake(doc));
  };

  useEffect(() => {
    if (!present) restoreRef.current();
  }, [present]);
  useEffect(() => () => restoreRef.current(), []);

  return {
    afterLeaving: (ids): void => {
      settled.current = true;
      const doc = docOf();
      focusSoon(doc, landingAfterLeaving(doc, ids), () => mayTake(doc));
    },
  };
}
