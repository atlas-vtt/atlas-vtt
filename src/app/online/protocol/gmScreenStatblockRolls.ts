import { isPressId } from './gmScreenKeys.ts';
import { isDrawing, isDrawnRoll } from './gmScreenStatblocks.ts';

/**
 * A press on a roll of the statblock a device shows. The device names the roll by the number Atlas gave it in that
 * drawing (`DrawnElement.roll`) and the drawing by its own number (`statblock.drawing`), never by a formula: Atlas
 * rolls the roll it drew, as a click on it on the DM screen does, and refuses where that drawing is no longer what
 * the device was sent.
 */
export interface StatblockRollPress {
  readonly t: 'statblock-roll';
  /** The device's own number for the press, which comes back in the answer. */
  readonly id: number;
  /** The statblock the device shows. */
  readonly statblock: string;
  readonly drawing: number;
  readonly roll: number;
}

export interface StatblockRollAnswer {
  readonly t: 'statblock-roll-answer';
  readonly id: number;
  /** Null where Atlas rolled it, else why not (`STATBLOCK_ROLL_REFUSALS`, or a reason a newer Atlas names). */
  readonly refused: string | null;
}

/** Why Atlas did not roll: no map in front, or the statblock was drawn anew, left, or holds no such roll since. */
export const STATBLOCK_ROLL_REFUSALS = ['no-map', 'changed'] as const;

const STATBLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const REFUSAL_PATTERN = /^[a-z][a-z-]{0,31}$/;

export function parseStatblockRollPress(value: Record<string, unknown>): StatblockRollPress | null {
  if (value.t !== 'statblock-roll' || !isPressId(value.id) || typeof value.statblock !== 'string' || !STATBLOCK_ID_PATTERN.test(value.statblock)) return null;
  return isDrawing(value.drawing) && isDrawnRoll(value.roll) ? { t: 'statblock-roll', id: value.id, statblock: value.statblock, drawing: value.drawing, roll: value.roll } : null;
}

export function parseStatblockRollAnswer(value: Record<string, unknown>): StatblockRollAnswer | null {
  if (value.t !== 'statblock-roll-answer' || !isPressId(value.id)) return null;
  return value.refused === null || (typeof value.refused === 'string' && REFUSAL_PATTERN.test(value.refused)) ? { t: 'statblock-roll-answer', id: value.id, refused: value.refused } : null;
}
