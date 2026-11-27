import { MAX_ROLL_FORMULA } from './dice.ts';
import { isPressId } from './gmScreenKeys.ts';
import { isDrawing, isDrawnRoll } from './gmScreenStatblocks.ts';
import { isRecord } from './shape.ts';

/**
 * A press on a roll of the statblock a device shows. The device names the roll by the number Atlas gave it in that
 * drawing (`DrawnElement.roll`) and the drawing by its own number (`statblock.drawing`), never by a formula: Atlas
 * rolls the roll it drew, as a click on it on the DM screen does, and refuses where that drawing is no longer what
 * the device was sent.
 */
export interface StatblockRollPress {
  readonly t: 'statblock-roll';
  /** The device's own number for the press, which comes back in the answer. A number answered once is answered so again and never rolls twice. */
  readonly id: number;
  /** The statblock the device shows. */
  readonly statblock: string;
  readonly drawing: number;
  readonly roll: number;
}

/** What a roll Atlas made came to, read from the roll itself. */
export interface StatblockRollResult {
  /** The formula thrown, with the values armed for it; absent where it is longer than `MAX_ROLL_FORMULA`. */
  readonly formula?: string;
  readonly total: number;
  /** The game's critical rule's call on the roll; absent for neither. */
  readonly crit?: 'high' | 'low';
}

export interface StatblockRollAnswer {
  readonly t: 'statblock-roll-answer';
  readonly id: number;
  /** Null where Atlas rolled it, else why not (`STATBLOCK_ROLL_REFUSALS`, or a reason a newer Atlas names). */
  readonly refused: string | null;
  /** What the roll came to, only beside `refused` null; absent from an Atlas that does not say. */
  readonly result?: StatblockRollResult;
}

/**
 * Why Atlas did not roll: no map in front; the statblock was drawn anew, left, or holds no such roll since; the press
 * reached the roll and nothing rolled; or the device pressed faster than a GM rolls on purpose.
 */
export const STATBLOCK_ROLL_REFUSALS = ['no-map', 'changed', 'not-rolled', 'too-fast'] as const;

/** The largest total a roll's result may say, as for the table's rolls. */
const MAX_TOTAL = 1_000_000_000;

const STATBLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const REFUSAL_PATTERN = /^[a-z][a-z-]{0,31}$/;
const FORMULA_PATTERN = new RegExp(`^[^\\p{Cc}]{1,${MAX_ROLL_FORMULA}}$`, 'u');

export function parseStatblockRollPress(value: Record<string, unknown>): StatblockRollPress | null {
  if (value.t !== 'statblock-roll' || !isPressId(value.id) || typeof value.statblock !== 'string' || !STATBLOCK_ID_PATTERN.test(value.statblock)) return null;
  return isDrawing(value.drawing) && isDrawnRoll(value.roll) ? { t: 'statblock-roll', id: value.id, statblock: value.statblock, drawing: value.drawing, roll: value.roll } : null;
}

/** A roll's result, within its bounds (a formula past them is left out); undefined for a malformed one, which leaves the answer standing without it. */
export function parseStatblockRollResult(value: unknown): StatblockRollResult | undefined {
  if (!isRecord(value) || typeof value.total !== 'number' || !Number.isFinite(value.total) || Math.abs(value.total) > MAX_TOTAL) return undefined;
  const { formula, crit } = value;
  return {
    ...(typeof formula === 'string' && FORMULA_PATTERN.test(formula) && { formula }),
    total: value.total,
    ...((crit === 'high' || crit === 'low') && { crit }),
  };
}

export function parseStatblockRollAnswer(value: Record<string, unknown>): StatblockRollAnswer | null {
  if (value.t !== 'statblock-roll-answer' || !isPressId(value.id)) return null;
  if (!(value.refused === null || (typeof value.refused === 'string' && REFUSAL_PATTERN.test(value.refused)))) return null;
  const result = value.refused === null ? parseStatblockRollResult(value.result) : undefined;
  return { t: 'statblock-roll-answer', id: value.id, refused: value.refused, ...(result && { result }) };
}
