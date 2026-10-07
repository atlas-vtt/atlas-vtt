import type { Disposer } from './types/common';

function runSafely(cleanup: () => void): void {
  try {
    cleanup();
  } catch (error) {
    console.error('[Atlas API] A cleanup failed:', error);
  }
}

/** One extension's registrations. Every disposer runs its cleanup once; after `disposeAll`, new cleanups run at once. */
export class DisposerSet {
  private readonly pending = new Set<() => void>();
  private closed = false;

  add(cleanup: () => void): Disposer {
    let done = false;
    const dispose = (): void => {
      if (done) return;
      done = true;
      this.pending.delete(dispose);
      runSafely(cleanup);
    };
    if (this.closed) {
      dispose();
      return dispose;
    }
    this.pending.add(dispose);
    return dispose;
  }

  get size(): number {
    return this.pending.size;
  }

  disposeAll(): void {
    this.closed = true;
    for (const dispose of [...this.pending]) dispose();
  }
}
