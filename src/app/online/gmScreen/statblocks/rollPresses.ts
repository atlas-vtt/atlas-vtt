import type { StatblockRollAnswer } from '../../protocol/index.ts';
import { MAX_DEVICES } from '../gmScreenRecord.ts';
import type { StatblockRollOutcome } from './statblockRolls.ts';

/**
 * How many rolls a device may make at once, and how soon after it may make another: a GM rolls on purpose, and a
 * multiattack's to-hit and damage rolls, six or seven tapped half a second apart, all roll. A device that sends more (a
 * bouncing finger, a page in a loop) is refused, so no burst rolls, sounds, logs or is billed without bound: at most
 * `PRESS_BURST` at once and one more for every `PRESS_REFILL_MS` after.
 */
export const PRESS_BURST = 6;
export const PRESS_REFILL_MS = 1000;
/** How many answers are kept per device, by press id, so a press sent again is answered as it was. */
export const KEPT_ANSWERS = 64;
/** How many devices' presses are kept: as many as a link allows, since a device removed is forgotten anyway. */
export const KEPT_DEVICES = MAX_DEVICES;

interface Ledger {
  readonly answers: Map<number, StatblockRollAnswer>;
  /** Rolls the device may make now, refilled with time. */
  room: number;
  at: number;
}

/**
 * Each device's presses on statblock rolls: a press id it sent before is answered as it was and never rolled again, and
 * its rolls are paced. Kept for the device as Atlas knows it, through its leaving and coming back and through Atlas's
 * own connection dropping, so a press sent again after either is not rolled twice; forgotten when the device is removed
 * or Sidekick stops. A page loaded anew numbers its presses past the old ones.
 */
export class RollPresses {
  private readonly ledgers = new Map<string, Ledger>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** The answer to `device`'s press `id`: the one it was given before, else what `press` makes of it, handed whether the device may roll now. */
  answer(device: string, id: number, press: (pace: () => boolean) => StatblockRollOutcome): StatblockRollAnswer {
    const ledger: Ledger = this.ledgers.get(device) ?? { answers: new Map<number, StatblockRollAnswer>(), room: PRESS_BURST, at: this.now() };
    // Kept in the order devices were last heard from, so the one heard from longest ago goes first.
    this.ledgers.delete(device);
    this.ledgers.set(device, ledger);
    const [stalest] = this.ledgers.keys();
    if (this.ledgers.size > KEPT_DEVICES && stalest !== undefined) this.ledgers.delete(stalest);
    const known = ledger.answers.get(id);
    if (known) return known;
    const answer: StatblockRollAnswer = { t: 'statblock-roll-answer', id, ...press(() => this.spend(ledger)) };
    ledger.answers.set(id, answer);
    const [oldest] = ledger.answers.keys();
    if (ledger.answers.size > KEPT_ANSWERS && oldest !== undefined) ledger.answers.delete(oldest);
    return answer;
  }

  /** Forgets `device`'s presses, or every device's. */
  forget(device?: string): void {
    if (device === undefined) this.ledgers.clear();
    else this.ledgers.delete(device);
  }

  private spend(ledger: Ledger): boolean {
    const now = this.now();
    ledger.room = Math.min(PRESS_BURST, ledger.room + Math.max(0, now - ledger.at) / PRESS_REFILL_MS);
    ledger.at = now;
    if (ledger.room < 1) return false;
    ledger.room -= 1;
    return true;
  }
}
