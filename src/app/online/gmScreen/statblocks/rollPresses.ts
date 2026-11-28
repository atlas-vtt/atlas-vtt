import type { StatblockRollAnswer } from '../../protocol/index.ts';
import { DevicePresses } from './devicePresses.ts';
import type { StatblockRollOutcome } from './statblockRolls.ts';

/**
 * How many rolls a device may make at once, and how soon after it may make another: a GM rolls on purpose, and a
 * multiattack's to-hit and damage rolls, six or seven tapped half a second apart, all roll. A device that sends more is
 * refused, so no burst rolls, sounds, logs or is billed without bound.
 */
export const PRESS_BURST = 6;
export const PRESS_REFILL_MS = 1000;

/** Each device's presses on statblock rolls (`DevicePresses`), at a GM's pace of rolling. */
export class RollPresses extends DevicePresses<StatblockRollOutcome, StatblockRollAnswer> {
  constructor(now?: () => number) {
    super((id, outcome) => ({ t: 'statblock-roll-answer', id, ...outcome }), { burst: PRESS_BURST, refillMs: PRESS_REFILL_MS }, now);
  }
}
