import { vi } from 'vitest';

/**
 * Waiting for the companion's reads that run on no timer: hashes and asset ids (`crypto.subtle`) and image
 * headers (`Blob.arrayBuffer`). Both are wrapped once per test worker to note the work they start, so
 * `settled` waits until all of it and what follows from it is done, however loaded the machine is,
 * instead of guessing how long it takes.
 */

const WATCHED = Symbol.for('atlas-online:settled');

/** The reads under way, shared by every copy of this module in the worker (test files load their own). */
const inFlight: Set<Promise<unknown>> = watch();

function watch(): Set<Promise<unknown>> {
  const shared = globalThis as { [WATCHED]?: Set<Promise<unknown>> };
  const known = shared[WATCHED];
  if (known !== undefined) return known;
  const reads = new Set<Promise<unknown>>();
  shared[WATCHED] = reads;
  const watched = <T>(work: Promise<T>): Promise<T> => {
    reads.add(work);
    const done = (): void => void reads.delete(work);
    work.then(done, done);
    return work;
  };
  const subtle = globalThis.crypto.subtle;
  const digest = subtle.digest.bind(subtle);
  subtle.digest = (...args: Parameters<SubtleCrypto['digest']>): Promise<ArrayBuffer> => watched(digest(...args));
  // Asset ids are HMACs: a key imported, then a signature.
  const sign = subtle.sign.bind(subtle);
  subtle.sign = (...args: Parameters<SubtleCrypto['sign']>): Promise<ArrayBuffer> => watched(sign(...args));
  const importKey = subtle.importKey.bind(subtle) as (...args: unknown[]) => Promise<CryptoKey>;
  (subtle as { importKey: unknown }).importKey = (...args: unknown[]): Promise<CryptoKey> => watched(importKey(...args));
  const read = Object.getOwnPropertyDescriptor(Blob.prototype, 'arrayBuffer')?.value as ((this: Blob) => Promise<ArrayBuffer>) | undefined;
  if (read !== undefined) {
    Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
      return watched(read.call(this));
    };
  }
  return reads;
}

/** Resolves once no hash or image read is under way and everything waiting on them has run. */
export async function settled(): Promise<void> {
  for (;;) {
    // A macrotask turn runs every microtask queued so far, which may start further reads.
    await new Promise((resolve) => setImmediate(resolve));
    if (inFlight.size === 0) return;
    await Promise.allSettled([...inFlight]);
  }
}

/** The fake clock's step between two waits in `advanceSettled`: reads finish within it, as they take milliseconds in Obsidian. */
const STEP_MS = 10;

/**
 * Moves Vitest's fake clock on by `ms`, letting reads settle after every step, so work a timer starts
 * and the timers that work sets in turn run at the times they would.
 */
export async function advanceSettled(ms: number): Promise<void> {
  await settled();
  for (let passed = 0; passed < ms; passed += STEP_MS) {
    await vi.advanceTimersByTimeAsync(Math.min(STEP_MS, ms - passed));
    await settled();
  }
}
