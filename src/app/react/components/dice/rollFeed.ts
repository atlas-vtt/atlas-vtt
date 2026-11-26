import type { DiceRollResult } from '../../../types/diceTypes';
import type { DiceRollSubscription, RollOptions } from './DiceRollDisplay';

type RollListener = Parameters<DiceRollSubscription>[0];

interface WaitingRoll {
  result: DiceRollResult;
  options: RollOptions;
}

/**
 * The rolls of a dice display outside a map, which mounts with its first roll (dice stages hold
 * graphics memory, and most surfaces are read without rolling): a roll shown before the display
 * listens waits for it.
 */
export class RollFeed {
  private readonly listeners = new Set<RollListener>();
  private waiting: WaitingRoll[] = [];

  readonly subscribe: DiceRollSubscription = (listener) => {
    this.listeners.add(listener);
    for (const { result, options } of this.waiting.splice(0)) listener(result, options);
    return () => { this.listeners.delete(listener); };
  };

  /** Hands a roll to the display; false while none listens yet, the roll then waiting for it. */
  show(result: DiceRollResult, muted: boolean): boolean {
    const options = { muted };
    if (this.listeners.size === 0) {
      this.waiting.push({ result, options });
      return false;
    }
    for (const listener of this.listeners) listener(result, options);
    return true;
  }
}
