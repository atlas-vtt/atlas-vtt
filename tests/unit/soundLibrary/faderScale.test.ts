import { describe, expect, it } from 'vitest';
import { faderDb, faderPosition } from '@/app/react/components/dm-screen/sound/faderScale';

describe("the fader's scale", () => {
  it('gives the top third of the travel from 0 dB to small trims, and keeps the ends', () => {
    expect(faderPosition(6)).toBe(1);
    expect(faderPosition(-60)).toBe(0);
    expect(faderPosition(0) - faderPosition(-12)).toBeCloseTo(0.33, 5);
    // A 44 px drag down a 121 px rail from 0 dB (the cold run's −24 dB on the straight scale).
    expect(faderDb(faderPosition(0) - 44 / 121)).toBeGreaterThan(-15);
  });

  it('reads back the level it places, and rises with it', () => {
    for (const db of [-60, -50, -40, -30, -24, -18, -12, -6, -3, 0, 3, 6]) expect(faderDb(faderPosition(db))).toBeCloseTo(db, 6);
    const positions = [-60, -40, -24, -12, -6, 0, 6].map(faderPosition);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
