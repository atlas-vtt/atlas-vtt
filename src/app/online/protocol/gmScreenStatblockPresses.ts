import { isPressId } from './gmScreenKeys.ts';
import { isDrawing, isDrawnRoll } from './gmScreenStatblocks.ts';

/**
 * A press on a control of the statblock a device shows: a step of one of its tokens' resources (hit points), a box of
 * one, or the token's locate. The device names the control by the number Atlas gave it in that drawing
 * (`DrawnElement.press`) and the drawing by its own number, never by a token or a value: Atlas presses the control it
 * drew, as the GM's click on the DM screen does, and refuses where that drawing is no longer what the device was sent.
 */
export interface StatblockPress {
  readonly t: 'statblock-press';
  /** The device's own number for the press, which comes back in the answer. A number answered once is answered so again and never pressed twice. */
  readonly id: number;
  /** The statblock the device shows. */
  readonly statblock: string;
  readonly drawing: number;
  readonly press: number;
}

export interface StatblockPressAnswer {
  readonly t: 'statblock-press-answer';
  readonly id: number;
  /** Null where Atlas pressed it, else why not (`STATBLOCK_PRESS_REFUSALS`, or a reason a newer Atlas names). */
  readonly refused: string | null;
}

/**
 * Why Atlas did not press: no map in front; the statblock was drawn anew, left, or holds no such control since, or it may
 * not be pressed now (a step past the resource's end); or the device pressed faster than a GM presses on purpose.
 */
export const STATBLOCK_PRESS_REFUSALS = ['no-map', 'changed', 'too-fast'] as const;

const STATBLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const REFUSAL_PATTERN = /^[a-z][a-z-]{0,31}$/;

export function parseStatblockPress(value: Record<string, unknown>): StatblockPress | null {
  if (value.t !== 'statblock-press' || !isPressId(value.id) || typeof value.statblock !== 'string' || !STATBLOCK_ID_PATTERN.test(value.statblock)) return null;
  return isDrawing(value.drawing) && isDrawnRoll(value.press) ? { t: 'statblock-press', id: value.id, statblock: value.statblock, drawing: value.drawing, press: value.press } : null;
}

export function parseStatblockPressAnswer(value: Record<string, unknown>): StatblockPressAnswer | null {
  if (value.t !== 'statblock-press-answer' || !isPressId(value.id)) return null;
  if (!(value.refused === null || (typeof value.refused === 'string' && REFUSAL_PATTERN.test(value.refused)))) return null;
  return { t: 'statblock-press-answer', id: value.id, refused: value.refused };
}
