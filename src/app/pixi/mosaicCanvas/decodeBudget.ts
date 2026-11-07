/**
 * Bytes of decoded pyramid levels that builds may hold together (decision 10
 * of the tiled map images plan). A build that does not fit waits until
 * earlier ones release theirs; one larger than the budget runs alone.
 *
 * Opens (a view waits for them) go before background work, and never wait
 * for builds that will not give way: when every holder is a map a view shows,
 * an open is let in over the budget, so switching between two large maps
 * cannot deadlock.
 */

/** Decoded levels all builds of a worker may hold together. */
export const DECODED_LEVELS_BUDGET = 1024 ** 3;

export interface BudgetRequest {
  bytes: number;
  /** Asked again whenever the queue moves: a background request becomes urgent once a view opens its map. */
  urgent: () => boolean;
}

export interface DecodeBudgetOptions {
  /** Called when a request has to wait, so the owner can stop work nobody waits for and free its share. */
  onPressure?: () => void;
  /** Whether some holder is giving way and will release its share soon; an urgent request waits only for those. */
  yielding?: () => boolean;
}

interface Waiter {
  cost: number;
  urgent: () => boolean;
  grant: () => void;
}

export class DecodeBudget {
  private used = 0;
  private holders = 0;
  private readonly waiting: Waiter[] = [];
  private readonly onPressure: () => void;
  private readonly yielding: () => boolean;

  constructor(
    private readonly limit: number = DECODED_LEVELS_BUDGET,
    options: DecodeBudgetOptions = {},
  ) {
    this.onPressure = options.onPressure ?? ((): void => undefined);
    this.yielding = options.yielding ?? ((): boolean => false);
  }

  /** Resolves once `request.bytes` may be held; call the returned function once to give them back. */
  acquire(request: BudgetRequest): Promise<() => void> {
    // An unknown cost (a format whose header gives no size) holds the whole budget, so it runs alone.
    const cost = Number.isFinite(request.bytes) ? request.bytes : this.limit;
    return new Promise((resolve) => {
      this.waiting.push({ cost, urgent: request.urgent, grant: () => resolve(this.releaser(cost)) });
      if (this.pump()) return;
      this.onPressure();
      // Nothing gave way: an urgent request goes ahead over the budget.
      this.pump();
    });
  }

  /** Whether anything waits for bytes, or more is held than the budget: background work should give way. */
  get pressured(): boolean {
    return this.waiting.length > 0 || this.used > this.limit;
  }

  /** Grants what may go now; call when a waiter may have become urgent or a holder stopped giving way. */
  reconsider(): void {
    this.pump();
  }

  /** Grants waiters in turn, urgent ones first; answers whether none is left waiting. */
  private pump(): boolean {
    while (this.waiting.length > 0) {
      const urgentIndex = this.waiting.findIndex((waiter) => waiter.urgent());
      const index = Math.max(urgentIndex, 0);
      const next = this.waiting[index]!;
      const goesAhead = urgentIndex >= 0 && !this.yielding();
      if (!this.fits(next.cost) && !goesAhead) return false;
      this.waiting.splice(index, 1);
      this.used += next.cost;
      this.holders += 1;
      next.grant();
    }
    return true;
  }

  private fits(cost: number): boolean {
    return this.holders === 0 || this.used + cost <= this.limit;
  }

  private releaser(cost: number): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.used -= cost;
      this.holders -= 1;
      this.pump();
    };
  }
}
