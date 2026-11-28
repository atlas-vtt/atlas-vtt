import { MAX_DEVICES } from '../gmScreenRecord.ts';

/** How many answers are kept per device, by press id, so a press sent again is answered as it was. */
export const KEPT_ANSWERS = 64;
/** How many devices' presses are kept: as many as a link allows, since a device removed is forgotten anyway. */
export const KEPT_DEVICES = MAX_DEVICES;

/** How fast a device may press: `burst` at once, and one more for every `refillMs` after. */
export interface PressPace {
  readonly burst: number;
  readonly refillMs: number;
}

interface Ledger<A> {
  readonly answers: Map<number, A>;
  /** Presses the device may make now, refilled with time. */
  room: number;
  at: number;
}

/**
 * Each device's presses of one kind on a statblock: a press id it sent before is answered as it was and never pressed
 * again, and its presses are paced (`PressPace`), so no burst from a bouncing finger or a page in a loop reaches Atlas
 * without bound. Kept for the device as Atlas knows it, through its leaving and coming back and through Atlas's own
 * connection dropping, so a press sent again after either is not done twice; forgotten when the device is removed or
 * Sidekick stops. A page loaded anew numbers its presses past the old ones.
 */
export class DevicePresses<O, A> {
  private readonly ledgers = new Map<string, Ledger<A>>();

  constructor(
    private readonly answerOf: (id: number, outcome: O) => A,
    private readonly pace: PressPace,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** The answer to `device`'s press `id`: the one it was given before, else what `press` makes of it, handed whether the device may press now. */
  answer(device: string, id: number, press: (pace: () => boolean) => O): A {
    const ledger: Ledger<A> = this.ledgers.get(device) ?? { answers: new Map<number, A>(), room: this.pace.burst, at: this.now() };
    // Kept in the order devices were last heard from, so the one heard from longest ago goes first.
    this.ledgers.delete(device);
    this.ledgers.set(device, ledger);
    const [stalest] = this.ledgers.keys();
    if (this.ledgers.size > KEPT_DEVICES && stalest !== undefined) this.ledgers.delete(stalest);
    const known = ledger.answers.get(id);
    if (known) return known;
    const answer = this.answerOf(id, press(() => this.spend(ledger)));
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

  private spend(ledger: Ledger<A>): boolean {
    const now = this.now();
    ledger.room = Math.min(this.pace.burst, ledger.room + Math.max(0, now - ledger.at) / this.pace.refillMs);
    ledger.at = now;
    if (ledger.room < 1) return false;
    ledger.room -= 1;
    return true;
  }
}
