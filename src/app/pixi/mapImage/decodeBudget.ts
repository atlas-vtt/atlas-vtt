/**
 * Bytes of decoded pyramid levels that builds may hold together (decision 10
 * of the tiled map images plan). A build that does not fit waits until
 * earlier ones release theirs; one larger than the budget runs alone.
 */

/** Decoded levels all builds of a worker may hold together. */
export const DECODED_LEVELS_BUDGET = 1024 ** 3;

interface Waiter {
  cost: number;
  grant: () => void;
}

export class DecodeBudget {
  private used = 0;
  private holders = 0;
  private readonly waiting: Waiter[] = [];

  /**
   * @param onPressure called when a request has to wait, so the owner can stop
   *   work nobody is waiting for and free its share.
   */
  constructor(
    private readonly limit: number = DECODED_LEVELS_BUDGET,
    private readonly onPressure: () => void = () => undefined,
  ) {}

  /** Resolves once `bytes` may be held; call the returned function once to give them back. */
  acquire(bytes: number): Promise<() => void> {
    // Larger or unknown costs hold the whole budget, so they run alone.
    const cost = Math.min(bytes, this.limit);
    return new Promise((resolve) => {
      const waiter: Waiter = { cost, grant: () => resolve(this.releaser(cost)) };
      if (this.waiting.length === 0 && this.fits(cost)) {
        this.take(waiter);
        return;
      }
      this.waiting.push(waiter);
      this.onPressure();
    });
  }

  /** Whether anything waits for bytes now. */
  get pressured(): boolean {
    return this.waiting.length > 0;
  }

  private fits(cost: number): boolean {
    return this.holders === 0 || this.used + cost <= this.limit;
  }

  private take(waiter: Waiter): void {
    this.used += waiter.cost;
    this.holders += 1;
    waiter.grant();
  }

  private releaser(cost: number): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.used -= cost;
      this.holders -= 1;
      while (this.waiting.length > 0 && this.fits(this.waiting[0]!.cost)) this.take(this.waiting.shift()!);
    };
  }
}
