import type { TesseraRef } from './pyramid';
import type { StoredTessera } from './tesseraStore';

/** Tesserae per write transaction. */
export const TESSERA_BATCH = 16;

export type EncodeRun = 'done' | 'stopped' | 'lost';

export interface EncodeSteps {
  /** Up to how many tesserae are encoded at once; 1 encodes each before the next is asked for. */
  slots: number;
  /** Before each tessera: false ends the run as stopped. Lets pending requests go first. */
  proceed: () => Promise<boolean>;
  /** The tessera's bytes, or null when its source is gone (the run ends as stopped). */
  encode: (ref: TesseraRef) => Promise<Blob | null>;
  /** Writes one batch; false ends the run as lost. */
  write: (batch: StoredTessera[]) => Promise<boolean>;
}

/**
 * Encodes `refs` with up to `slots` under way and writes them in their order, `TESSERA_BATCH` at
 * a time. Resolves only once no encode it started is still running, so a source it reads can be
 * released after; a failed encode rejects.
 */
export async function encodeInOrder(refs: readonly TesseraRef[], steps: EncodeSteps): Promise<EncodeRun> {
  const running: Promise<StoredTessera | null>[] = [];
  let batch: StoredTessera[] = [];
  const settleOldest = async (): Promise<EncodeRun | null> => {
    const tessera = await running.shift()!;
    if (!tessera) return 'stopped';
    batch.push(tessera);
    if (batch.length < TESSERA_BATCH) return null;
    const written = await steps.write(batch);
    batch = [];
    return written ? null : 'lost';
  };
  try {
    for (const ref of refs) {
      if (!(await steps.proceed())) return 'stopped';
      const encoded = steps.encode(ref).then((bytes) => (bytes ? { ref, bytes } : null));
      // Awaited in turn by `settleOldest`; one that fails before its turn is not reported unhandled meanwhile.
      encoded.catch(() => undefined);
      running.push(encoded);
      if (running.length >= steps.slots) {
        const ended = await settleOldest();
        if (ended) return ended;
      }
    }
    while (running.length > 0) {
      const ended = await settleOldest();
      if (ended) return ended;
    }
    if (batch.length === 0) return 'done';
    return (await steps.write(batch)) ? 'done' : 'lost';
  } finally {
    await Promise.allSettled(running);
  }
}
