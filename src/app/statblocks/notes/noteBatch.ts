/**
 * The loop of a batch that writes notes one after another (a template switch, a key rename):
 * progress after each note, Cancel before the next, and the browser gets a frame between them.
 */

import { workSlices } from '../../utils/workSlices';

export interface NoteBatchOptions {
  /** After each note: how many are done of how many. */
  onProgress?: (done: number, total: number) => void;
  /** Cancels the notes not written yet. */
  signal?: AbortSignal;
}

/** Runs `step` for each note in turn; returns the notes a cancel kept from being reached. */
export async function eachNote<T>(notes: readonly T[], step: (note: T) => Promise<void>, options: NoteBatchOptions = {}): Promise<T[]> {
  const pause = workSlices();
  for (const [index, note] of notes.entries()) {
    if (options.signal?.aborted) return notes.slice(index);
    await step(note);
    options.onProgress?.(index + 1, notes.length);
    await pause();
  }
  return [];
}
