import { describe, expect, it } from 'vitest';
import { clockOffset, estimateClockOffset, roundTrip } from '@/app/sound/engine/clockMath';

describe('the clock exchange', () => {
  it('takes the middle of the exchange as the moment of the answer', () => {
    expect(clockOffset({ t1: 100, t2: 5060, t4: 120 })).toBe(4950);
    expect(roundTrip({ t1: 100, t2: 5060, t4: 120 })).toBe(20);
  });

  it('prefers the lowest round trips, and takes their median', () => {
    const samples = [
      { t1: 0, t2: 1010, t4: 20 },
      { t1: 100, t2: 1112, t4: 120 },
      { t1: 200, t2: 1708, t4: 1000 },
      { t1: 1100, t2: 2108, t4: 1120 },
      { t1: 2000, t2: 2900, t4: 2900 },
    ];
    expect(estimateClockOffset(samples)).toBe(1000);
  });

  it('has nothing to say without samples, or with a clock that ran backwards', () => {
    expect(estimateClockOffset([])).toBeNull();
    expect(estimateClockOffset([{ t1: 50, t2: 60, t4: 10 }])).toBeNull();
  });
});
