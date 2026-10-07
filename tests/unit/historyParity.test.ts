import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createParityRun, traceLines } from '../helpers/historyHarness';
import { decodeOps, FAMILIES } from '../oracles/historyBaseline/traceGenerator';

// Undo and redo hold to the former implementation wherever nothing else changed the scene in between.
const RUNS = Number(process.env.VITE_HISTORY_RUNS ?? 200);
const SEED = process.env.VITE_HISTORY_SEED === undefined ? undefined : Number(process.env.VITE_HISTORY_SEED);

describe.each(FAMILIES.map((family, index) => ({ family, index })))('the undo history, $family', ({ index }) => {
  it('leaves what the former implementation leaves after every operation', async () => {
    await fc.assert(fc.asyncProperty(fc.array(fc.nat(), { minLength: 1, maxLength: 900, size: 'max' }), async (values) => {
      const { ops } = decodeOps([index, ...values]);
      const expected = await traceLines(createParityRun('oracle'), ops);
      const actual = await traceLines(createParityRun('new'), ops);
      for (let i = 0; i < ops.length; i++) {
        if (actual[i] !== expected[i]) {
          expect({ op: i, ran: JSON.stringify(ops.slice(Math.max(0, i - 12), i + 1)), actual: actual[i] }).toEqual({ op: i, ran: JSON.stringify(ops.slice(Math.max(0, i - 12), i + 1)), actual: expected[i] });
        }
      }
    }), { numRuns: RUNS, ...(SEED === undefined ? {} : { seed: SEED }) });
  }, 600_000);
});
