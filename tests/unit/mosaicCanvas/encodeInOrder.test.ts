import { describe, expect, it } from 'vitest';
import { encodeInOrder, TESSERA_BATCH, type EncodeSteps } from '../../../src/app/pixi/mosaicCanvas/encodeInOrder';
import type { TesseraRef } from '../../../src/app/pixi/mosaicCanvas/pyramid';
import type { StoredTessera } from '../../../src/app/pixi/mosaicCanvas/tesseraStore';

const refs = (count: number): TesseraRef[] => Array.from({ length: count }, (_, col) => ({ level: 0, col, row: 0 }));

/** Encodes that end in the order `finish` releases them, recording how many ran at once. */
function harness(slots: number, overrides: Partial<EncodeSteps> = {}) {
  const writes: StoredTessera[][] = [];
  const log: string[] = [];
  let running = 0;
  let mostRunning = 0;
  const steps: EncodeSteps = {
    slots,
    proceed: () => Promise.resolve(true),
    encode: async (ref) => {
      running += 1;
      mostRunning = Math.max(mostRunning, running);
      log.push(`start ${ref.col}`);
      // Later tesserae end first: the order written must not follow the order ended.
      await new Promise((resolve) => setTimeout(resolve, 2 - (ref.col % 3)));
      running -= 1;
      log.push(`end ${ref.col}`);
      return new Blob([String(ref.col)]);
    },
    write: (batch) => {
      writes.push(batch);
      return Promise.resolve(true);
    },
    ...overrides,
  };
  return { steps, writes, log, mostRunning: () => mostRunning, running: () => running };
}

describe('encodeInOrder', () => {
  it('writes every tessera once, in order, a batch at a time, with up to its slots encoding', async () => {
    const h = harness(4);
    expect(await encodeInOrder(refs(40), h.steps)).toBe('done');
    expect(h.writes.map((batch) => batch.length)).toEqual([TESSERA_BATCH, TESSERA_BATCH, 40 - 2 * TESSERA_BATCH]);
    expect(h.writes.flat().map((tessera) => tessera.ref.col)).toEqual(refs(40).map((ref) => ref.col));
    expect(h.mostRunning()).toBe(4);
  });

  it('with one slot encodes each tessera before it asks for the next', async () => {
    const h = harness(1);
    h.steps.proceed = () => {
      h.log.push('proceed');
      return Promise.resolve(true);
    };
    await encodeInOrder(refs(3), h.steps);
    expect(h.log).toEqual(['proceed', 'start 0', 'end 0', 'proceed', 'start 1', 'end 1', 'proceed', 'start 2', 'end 2']);
  });

  it('stops before the next tessera, writes no part batch and waits for the encodes under way', async () => {
    const h = harness(4);
    let asked = 0;
    h.steps.proceed = () => Promise.resolve(++asked <= 6);
    expect(await encodeInOrder(refs(40), h.steps)).toBe('stopped');
    expect(h.writes).toEqual([]);
    expect(h.running()).toBe(0);
  });

  it('stops when a source is gone and reports a write the cache refused as lost', async () => {
    expect(await encodeInOrder(refs(3), harness(2, { encode: () => Promise.resolve(null) }).steps)).toBe('stopped');
    expect(await encodeInOrder(refs(3), harness(2, { write: () => Promise.resolve(false) }).steps)).toBe('lost');
  });

  it('rejects with a failed encode once the others ended', async () => {
    const h = harness(4);
    const encode = h.steps.encode;
    h.steps.encode = (ref) => (ref.col === 1 ? Promise.reject(new Error('no codec')) : encode(ref));
    await expect(encodeInOrder(refs(8), h.steps)).rejects.toThrow('no codec');
    expect(h.running()).toBe(0);
  });
});
