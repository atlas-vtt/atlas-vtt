/** What tokens moved in the running turn (`turnMoves`) in the view store: undo-tracked, never saved. */

import { movementTurn, type TurnMovesState } from '../initiative/movedThisTurn';
import { turnMoveAfter, type TurnMove } from '../measure/turnMoves';

export interface TurnMovesSlice {
  /**
   * Counts `distance` (game units) as moved in the running turn by each of `tokenIds`. Call it in
   * the write or transaction that moves them, so the move's undo step takes the distance back
   * with it. Nothing is counted outside a fight; read the count with `movedThisTurn`.
   */
  countTurnMove: (tokenIds: readonly string[], distance: number) => void;
}

export type TurnMovesDraft = Partial<Pick<TurnMovesState, 'initiative' | 'fightsStarted'>> & { turnMoves?: Record<string, TurnMove> | undefined };

type ImmerSet = (fn: (draft: TurnMovesDraft) => void) => void;

/** `countTurnMove` inside a write already under way (an Immer draft), for writes that move tokens and count in one step. */
export function countTurnMoveIn(draft: TurnMovesDraft, tokenIds: readonly string[], distance: number): void {
  const turn = movementTurn({ initiative: draft.initiative, fightsStarted: draft.fightsStarted });
  for (const id of tokenIds) {
    const entry = turnMoveAfter(draft.turnMoves?.[id], turn, distance);
    if (entry) (draft.turnMoves ??= {})[id] = entry;
  }
}

export function createTurnMovesActions(set: ImmerSet): TurnMovesSlice {
  return {
    countTurnMove: (tokenIds, distance) => set((draft) => countTurnMoveIn(draft, tokenIds, distance)),
  };
}
