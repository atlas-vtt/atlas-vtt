/**
 * How many spawned tokens are in the GM's hand, for what tells the GM how to place them (`PlacementHint`). One per
 * view, made with the view's renderer so the hint can follow it before the first placement makes a `TokenPlacer`.
 */
export class PlacementHand {
  private count = 0;
  private readonly listeners = new Set<() => void>();

  /** The tokens in hand; 0 while none are. */
  get size(): number {
    return this.count;
  }

  /** Called by the placer as the hand fills, shrinks and empties. */
  set(count: number): void {
    if (count === this.count) return;
    this.count = count;
    for (const listener of [...this.listeners]) listener();
  }

  /** Calls `listener` after every change of the hand; returns the call that stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
