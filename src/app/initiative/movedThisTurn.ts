/**
 * What a token has moved in the running turn, read from a view's state. The distances are kept
 * in `turnMoves`, which undo follows: each is added in the step that moves its token, so taking
 * the move back gives the distance back. Nothing is ever reset: a distance counts only while the
 * turn it was moved in is the turn that runs (`movementTurn`).
 */

import { movedInTurn, type TurnMoves } from '../measure/turnMoves';
import type { InitiativeState } from '../types/initiativeTypes';
import { currentTurn, turnKey } from './turnHolders';

/** What the count reads of a view's state. */
export interface TurnMovesState {
  readonly initiative: Pick<InitiativeState, 'isActive' | 'round' | 'entries' | 'sides'> | undefined;
  readonly turnMoves?: TurnMoves | undefined;
  /** How many fights the view has started; unset reads as none. */
  readonly fightsStarted?: number | undefined;
}

/**
 * The turn movement is counted in: the running fight's round and who holds the turn (a combatant,
 * or by sides the sides that act), with the number of the fight, since round 1 of the next fight
 * names the same combatants. It changes whenever the turn passes on, so every token starts a turn
 * at 0, its own turn included. Null outside a fight and while nobody holds the turn.
 */
export function movementTurn(state: Pick<TurnMovesState, 'initiative' | 'fightsStarted'>): string | null {
  const turn = currentTurn(state.initiative);
  return turn ? `${state.fightsStarted ?? 0}|${turnKey(turn)}` : null;
}

/**
 * How far `tokenId` has moved in the running turn, in the map's game units: what `countTurnMove`
 * added up for it since the turn began, less what undo took back. 0 outside a fight.
 */
export function movedThisTurn(state: TurnMovesState, tokenId: string): number {
  return movedInTurn(state.turnMoves, movementTurn(state), tokenId);
}
