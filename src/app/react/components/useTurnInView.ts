import { useEffect, type RefObject } from 'react';
import { scrollWithin } from '../../utils/scrollWithin';

interface TurnInView {
  fightRuns: boolean;
  /** Whose turn it is: a combatant's entry or a side. */
  turnOf: string | undefined;
  round: number;
  /** The list starts at the turn: its top is brought into view. */
  fromTurn: boolean;
}

/**
 * Keeps the turn in view when it moves: the top of the side whose turn it is, else the
 * combatant's card with the next two below it where they fit, or the card at the top of a
 * list that starts at the turn. `scrollWithin` scrolls the list alone.
 */
export function useTurnInView(contentRef: RefObject<HTMLElement | null>, { fightRuns, turnOf, round, fromTurn }: TurnInView): void {
  useEffect(() => {
    const content = contentRef.current;
    if (!fightRuns || !content) return;
    const side = content.querySelector('.atlas-initiative-side--active');
    const card = content.querySelector('.atlas-initiative-card--active');
    if (side) scrollWithin(content, side, 'start');
    else if (card && fromTurn) scrollWithin(content, card, 'start');
    else if (card) scrollWithin(content, card, 'nearest', 2);
  }, [contentRef, fightRuns, turnOf, round, fromTurn]);
}
