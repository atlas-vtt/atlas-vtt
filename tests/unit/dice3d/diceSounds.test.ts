// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { POOLS, warmDiceSounds } from '../../../src/app/dice3d/audio/diceSamples';
import { bank, ratchet, rattle, reveal, rollEnd, rollStart } from '../../../src/app/dice3d/audio/diceSounds';

describe('dice sounds', () => {
  it('has samples in every pool', () => {
    for (const [name, pool] of Object.entries(POOLS)) {
      expect(pool.length, name).toBeGreaterThan(0);
      for (const sample of pool) expect(sample, name).toMatch(/^data:audio\//);
    }
  });

  it('stays silent without an AudioContext', () => {
    expect(typeof window.AudioContext).toBe('undefined');
    expect(() => {
      warmDiceSounds();
      bank(0.8, -0.4);
      rollEnd(rollStart());
      rollEnd();
      rattle();
      reveal('high');
      reveal('low');
      reveal(null);
      ratchet();
      ratchet(9);
    }).not.toThrow();
  });
});
