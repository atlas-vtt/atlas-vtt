import { MAX_MOVE_DISTANCE, MAX_MOVE_MULTIPLE, MAX_MOVE_STEP_NAME, MAX_MOVE_STEPS, type SharedMoveStep, type SharedTokenMove } from '../protocol/index.ts';
import { movedThisTurn, type TurnMovesState } from '../../initiative/movedThisTurn';
import type { MovementRules } from '../../measure/movementRules';
import type { TokenEntity } from '../../types';
import { call } from './atlasView.ts';
import { hexColour } from './scenePicture.ts';
import type { TurnShareState } from './turnShare.ts';

/** What a token's move reads of a tab's store: its fight, and what its tokens moved in the running turn. */
export type MoveShareState = Pick<TurnShareState, 'initiative'> & Partial<Pick<TurnMovesState, 'turnMoves' | 'fightsStarted'>>;

/** How the tab's tokens move, as its own drag ruler reads it (`TokenRenderer.tokenMovement`). */
export interface TokenMoves {
  rules(): MovementRules;
  /** A token's speed in game units; null without one and while its statblock is unread. */
  speedOf(token: TokenEntity): number | null;
  /** Has the statblocks of these tokens read, so their speeds are known. */
  prepare(tokens: Iterable<TokenEntity>): void;
}

/** The movement of an Atlas tab's renderer, or null where it has none (another Atlas version, no renderer). */
export function tokenMovesOf(renderer: unknown): TokenMoves | null {
  const moves = call(call(renderer, 'getTokenRenderer'), 'tokenMovement');
  if (typeof moves !== 'object' || moves === null) return null;
  const has = (method: string): boolean => method in moves && typeof (moves as Record<string, unknown>)[method] === 'function';
  return has('rules') && has('speedOf') && has('prepare') ? (moves as TokenMoves) : null;
}

/**
 * The map's movement steps as players are sent them, or null for none: steps a page could not
 * read (a colour that is none, multiples that do not rise) send none, and a drag then reads as
 * its distance alone, for the GM's steps would not be the players'.
 */
export function sharedMoveSteps(rules: MovementRules | undefined): SharedMoveStep[] | null {
  if (!rules || rules.steps.length === 0 || rules.steps.length > MAX_MOVE_STEPS) return null;
  const steps: SharedMoveStep[] = [];
  for (const { name, multiple, color } of rules.steps) {
    const colour = hexColour(color);
    if (colour === null || !(multiple > (steps.at(-1)?.multiple ?? 0)) || multiple > MAX_MOVE_MULTIPLE) return null;
    steps.push({ name: name.slice(0, MAX_MOVE_STEP_NAME), multiple, colour });
  }
  return steps;
}

/**
 * A token's speed and what it moved in the running turn, as the GM's drag ruler reads them
 * (`DragRuler.moveOf`); null where the map names no step or the token has no speed.
 */
export function sharedTokenMove(state: MoveShareState, moves: TokenMoves | null, token: TokenEntity): SharedTokenMove | null {
  const rules = moves?.rules();
  if (!moves || !rules || rules.steps.length === 0) return null;
  const speed = moves.speedOf(token);
  if (speed === null || !(speed > 0) || speed > MAX_MOVE_DISTANCE) return null;
  const moved = rules.countPerTurn ? movedThisTurn({ initiative: state.initiative, turnMoves: state.turnMoves, fightsStarted: state.fightsStarted }, token.id) : 0;
  return { speed, ...(moved > 0 && moved <= MAX_MOVE_DISTANCE && { moved }) };
}
