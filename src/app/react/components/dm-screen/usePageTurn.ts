import { useEffect, useState } from 'react';
import type { DMScreenPage } from '../../../types/viewUIState';

/** The pages in the order the page control and the arrow keys go through them. */
const ORDER: readonly DMScreenPage[] = ['statblocks', 'sound'];

/** How long a page that is turned away stays drawn: its slide out (`dm-screen.scss`, `$page-turn`). */
export const PAGE_TURN_MS = 340;

export type PageSide = 'before' | 'after';

/** Which side of `of` a page lies on: the side it slides out to, and in from. */
export const sideOf = (page: DMScreenPage, of: DMScreenPage): PageSide => (ORDER.indexOf(page) < ORDER.indexOf(of) ? 'before' : 'after');

/**
 * The page still turning away after a change, until its slide has ended; null at rest. A change while
 * one turns makes the page just left the one turning away, and the CSS transitions take both from where
 * they are, so pressing ← → quickly never jumps.
 */
export function usePageTurn(page: DMScreenPage, isOpen: boolean): DMScreenPage | null {
  const [current, setCurrent] = useState(page);
  const [leaving, setLeaving] = useState<DMScreenPage | null>(null);
  if (page !== current) {
    setCurrent(page);
    setLeaving(isOpen ? current : null);
  }
  if (!isOpen && leaving !== null) setLeaving(null);

  useEffect(() => {
    if (leaving === null) return undefined;
    const id = window.setTimeout(() => setLeaving(null), PAGE_TURN_MS);
    return () => window.clearTimeout(id);
  }, [leaving, page]);

  return leaving;
}
