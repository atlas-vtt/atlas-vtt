/**
 * The stack of 3D rolls on screen. Rolls are not queued one after another: at
 * the table an attack and its damage are two rolls in the same motion. The
 * newest stands large at the bottom; older ones shrink to a row above it and
 * lay their dice down at once, since two rolls clattering together sound like
 * one noise.
 *
 * A panel leaves in two steps: `closeRoll` fades it out and `dismissRoll`
 * removes it once its fade time has passed. Removal hangs on a timer and never
 * on an animation reporting that it finished: rolling faster than a fade lasts
 * otherwise piled up panels, each with its own frame loop and WebGL context.
 */

import type { DiceRollResult } from '../../../types/diceTypes';
import type { DiceScene } from '../../../dice3d/diceScene';
import type { ThrowStyle } from '../../../dice3d/diceDisplay';

export interface StackedRoll {
  result: DiceRollResult;
  scene: DiceScene;
  /** Speed and wall hits of the throw; fixed when the roll arrives. */
  style: ThrowStyle;
  /** Fading out; it no longer holds one of the places. */
  leaving?: true;
}

/**
 * Three at once, no more. Whoever rolls four times wants to see the fourth,
 * and a stack growing over half the map would be a log, which the dice log
 * already is.
 */
const MAX_ROLLS = 3;

function leave(entry: StackedRoll): StackedRoll {
  return { ...entry, leaving: true };
}

/** Adds a roll; the oldest standing rolls beyond the limit start leaving. */
export function pushRoll(rolls: readonly StackedRoll[], roll: StackedRoll): StackedRoll[] {
  const standing = rolls.filter((entry) => !entry.leaving);
  const displaced = new Set(standing.slice(0, Math.max(0, standing.length + 1 - MAX_ROLLS)).map((entry) => entry.result.id));
  return [
    ...rolls.map((entry) => (displaced.has(entry.result.id) ? leave(entry) : entry)),
    roll,
  ];
}

/** Lets the roll fade out; it stays in the stack until it is dismissed. */
export function closeRoll(rolls: readonly StackedRoll[], id: string): readonly StackedRoll[] {
  if (!rolls.some((entry) => entry.result.id === id && !entry.leaving)) return rolls;
  return rolls.map((entry) => (entry.result.id === id ? leave(entry) : entry));
}

/** Lets every standing roll fade out, e.g. on Escape. */
export function closeAllRolls(rolls: readonly StackedRoll[]): readonly StackedRoll[] {
  if (rolls.every((entry) => entry.leaving)) return rolls;
  return rolls.map((entry) => (entry.leaving ? entry : leave(entry)));
}

/** Removes only this roll, so the end of an old roll never takes a newer one with it. */
export function dismissRoll(rolls: readonly StackedRoll[], id: string): readonly StackedRoll[] {
  const rest = rolls.filter((entry) => entry.result.id !== id);
  return rest.length === rolls.length ? rolls : rest;
}

/**
 * Which roll stands large: the newest one still standing. When the last one
 * leaves it keeps the large place, since a panel changing size while it
 * disappears reads as a twitch, not an exit.
 */
export function largeRollIndex(rolls: readonly StackedRoll[]): number {
  const standing = rolls.reduce((found, entry, i) => (entry.leaving ? found : i), -1);
  return standing === -1 ? rolls.length - 1 : standing;
}
