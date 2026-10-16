import type { Timers } from '../companionTimers.ts';

/**
 * The shortest time between two whole books sent to one player in answer to what was refused of
 * them: the first refusal is answered at once, a flood of them with one book per this time.
 */
export const REFUSAL_BOOK_MS = 5_000;

/**
 * The whole books players are owed because a write of theirs was refused: each is sent at once,
 * or once `REFUSAL_BOOK_MS` have passed since that player's last book, so a flood of refusals is
 * answered with one book per that time.
 */
export class OwedBooks {
  /** When each player was last sent a whole book, and the timers of those who are owed one. */
  private readonly bookAt = new Map<string, number>();
  private readonly owed = new Map<string, number>();

  constructor(private readonly timers: Timers, private readonly sendBook: (player: string) => void) {}

  /** The player is owed their whole book: now, or once their last is long enough ago. */
  owe(player: string): void {
    if (this.owed.has(player)) return;
    const wait = (this.bookAt.get(player) ?? Number.NEGATIVE_INFINITY) + REFUSAL_BOOK_MS - this.timers.now();
    if (wait <= 0) return this.sendBook(player);
    this.owed.set(player, this.timers.setTimer(() => {
      this.owed.delete(player);
      this.sendBook(player);
    }, wait));
  }

  /** A whole book is about to go to the player: what they were owed is paid with it. */
  paying(player: string): void {
    const timer = this.owed.get(player);
    if (timer !== undefined) this.timers.clearTimer(timer);
    this.owed.delete(player);
  }

  /** The player was sent a whole book now. */
  sent(player: string): void {
    this.bookAt.set(player, this.timers.now());
  }

  /** The table stopped: no owed book goes out any more. */
  stop(): void {
    for (const timer of this.owed.values()) this.timers.clearTimer(timer);
    this.owed.clear();
  }
}
