/**
 * Every roll Atlas logs, announced once to whoever follows them all (`dice.onRolled`). Atlas's own displays (the dice
 * log, toasts, sounds, the player window) never listen here: they follow their own map view's `dice-rolled` bus event
 * (#277), so a roll stays in the view that made it. Nothing is dispatched on `document`.
 */
import type { DiceRollResult } from '../types/diceTypes';

type RollListener = (result: DiceRollResult) => void;

const listeners = new Set<RollListener>();

/** Tells every follower about `result`; a follower that throws is logged and the others still hear it. */
export function announceRoll(result: DiceRollResult): void {
  for (const listener of [...listeners]) {
    try {
      listener(result);
    } catch (error) {
      console.error('[Atlas] A dice roll follower failed:', error);
    }
  }
}

/** Follows every roll Atlas logs from now on; returns the unsubscribe. */
export function followRolls(listener: RollListener): () => void {
  // A wrapper per call, so the same function followed twice is two followers, each undone by its own unsubscribe.
  const entry: RollListener = (result) => listener(result);
  listeners.add(entry);
  return () => { listeners.delete(entry); };
}
