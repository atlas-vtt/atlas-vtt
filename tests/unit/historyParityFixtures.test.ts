import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/history/zundoTraces.json';
import { createParityRun, linesDigest, opsDigest, traceLines, type Implementation } from '../helpers/historyHarness';
import { TRACE_GENERATOR, traceOf } from '../oracles/historyBaseline/traceGenerator';

interface Trace { seed: number; opsDigest: string; digest: string }

const traces = fixture.traces as Trace[];

describe('the recorded undo history traces', () => {
  it('come from this generator, at least a thousand of them', () => {
    expect(fixture.generator).toBe(TRACE_GENERATOR);
    expect(traces.length).toBeGreaterThanOrEqual(1000);
  });

  it.each<Implementation>(['new', 'oracle'])('are replayed op for op by the %s implementation', async (implementation) => {
    for (const trace of traces) {
      const { ops } = traceOf(trace.seed);
      expect(opsDigest(ops), `ops of seed ${trace.seed}`).toBe(trace.opsDigest);
      const lines = await traceLines(createParityRun(implementation), ops);
      expect(linesDigest(lines), `trace of seed ${trace.seed}`).toBe(trace.digest);
    }
  }, 600_000);
});
