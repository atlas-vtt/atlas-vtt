/** What the strip's buttons do to the tokens in hand (`TokenPlacer` hands it over for as long as a placement lasts). */
export interface PlacementControls {
  /** Keeps the tokens queued, one put down per press, as Shift does while it is held. */
  keepQueue(kept: boolean): void;
  /** Moves the queue `steps` on, as Shift and the wheel do. */
  cycle(steps: number): void;
  /** Puts away what is still in hand. */
  cancel(): void;
}

/**
 * The spawned tokens in the GM's hand as the UI knows them: how many there are, for what tells the GM how to place
 * them (`PlacementHint`), and whether they are put down one by one, which a finger chooses in the hint's strip
 * where a keyboard holds Shift. One per view, made with the view's renderer so the hint can follow it before the
 * first placement makes a `TokenPlacer`. The choice of one by one stays for the next placement in the view.
 */
export class PlacementHand {
  private count = 0;
  private queued = false;
  private controls: PlacementControls | null = null;
  private readonly listeners = new Set<() => void>();

  /** The tokens in hand; 0 while none are. */
  get size(): number {
    return this.count;
  }

  /** Whether the tokens are put down one by one without Shift. */
  get oneByOne(): boolean {
    return this.queued;
  }

  /** Called by the placer as the hand fills, shrinks and empties. */
  set(count: number): void {
    if (count === this.count) return;
    this.count = count;
    this.changed();
  }

  /** Called by the placer when a placement begins (its controls) and ends (null). */
  bind(controls: PlacementControls | null): void {
    this.controls = controls;
    controls?.keepQueue(this.queued);
  }

  setOneByOne(on: boolean): void {
    if (on === this.queued) return;
    this.queued = on;
    this.controls?.keepQueue(on);
    this.changed();
  }

  /** The next token of the queue comes to the pointer (`steps` 1), or the one before (-1). */
  cycle(steps: number): void {
    this.controls?.cycle(steps);
  }

  /** Puts away what is still in hand. */
  done(): void {
    this.controls?.cancel();
  }

  /** Calls `listener` after every change of the hand; returns the call that stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
