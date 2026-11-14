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

type TurnMovesDraft = Pick<TurnMovesState, 'initiative' | 'fightsStarted'> & { turnMoves?: Record<string, TurnMove> | undefined };

type ImmerSet = (fn: (draft: TurnMovesDraft) => void) => void;

export function createTurnMovesActions(set: ImmerSet): TurnMovesSlice {
  return {
    countTurnMove: (tokenIds, distance) => set((draft) => {
      const turn = movementTurn(draft);
      for (const id of tokenIds) {
        const entry = turnMoveAfter(draft.turnMoves?.[id], turn, distance);
        if (entry) (draft.turnMoves ??= {})[id] = entry;
      }
    }),
  };
}
