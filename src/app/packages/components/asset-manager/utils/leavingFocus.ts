import { getDomHost } from '../../../../host/dom';
import { cardIn, focusSoon, focusedCardId, landingAfterLeaving } from './cardFocus';

/** Where focus goes once cards may have left the grid (deleted, moved to another collection). */
export interface LeavingFocus {
  /** Back to the card focus was in: nothing left. */
  restore: () => void;
  /** To the card after the leaving ones in the grid, else the one before them (`landingAfterLeaving`): they are gone. */
  afterLeaving: () => void;
}

/**
 * Plans focus for cards that leave the grid, `leavingIds`, taken while they are still there: the card focus is in (the
 * ⋯ button's card too), else the first leaving card, and the mounted cards beside them in the grid's order.
 */
export function planLeavingFocus(leavingIds: readonly string[]): LeavingFocus {
  const doc = getDomHost().activeDocument();
  const opener = focusedCardId(doc) ?? leavingIds.find((id) => cardIn(doc, id)) ?? null;
  const landing = landingAfterLeaving(doc, leavingIds);
  return {
    restore: () => focusSoon(doc, () => cardIn(doc, opener)),
    afterLeaving: () => focusSoon(doc, landing),
  };
}
