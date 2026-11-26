import { describe, expect, it } from 'vitest';
import { loopText, parseLoopText, withLoopIn, withLoopOut } from '@/app/soundLibrary/loopPoints';

const RATE = 48_000;
const TRACK = 120 * RATE;

describe('loop points', () => {
  it('read as typed, with any dash, and write back the same', () => {
    expect(parseLoopText('0:10 – 1:40.5', TRACK)).toEqual({ startFrame: 10 * RATE, endFrame: 100.5 * RATE });
    expect(parseLoopText('10-20', TRACK)).toEqual({ startFrame: 10 * RATE, endFrame: 20 * RATE });
    expect(parseLoopText('0:05,5 to 0:30', TRACK)).toEqual({ startFrame: 5.5 * RATE, endFrame: 30 * RATE });
    expect(loopText({ startFrame: 10 * RATE, endFrame: 100.5 * RATE })).toBe('0:10.0 – 1:40.5');
  });

  it('clear when empty, and refuse what names no loop inside the track', () => {
    expect(parseLoopText('  ', TRACK)).toBeNull();
    expect(parseLoopText('0:30 – 0:20', TRACK)).toBe('invalid');
    expect(parseLoopText('0:10 – 0:10.5', TRACK)).toBe('invalid');
    expect(parseLoopText('0:10 – 3:00', TRACK)).toBe('invalid');
    expect(parseLoopText('soon', TRACK)).toBe('invalid');
  });

  it('take an in or an out alone, the other end at the track\'s, and never a loop under a second', () => {
    expect(withLoopIn(undefined, 30 * RATE, TRACK)).toEqual({ startFrame: 30 * RATE, endFrame: TRACK });
    expect(withLoopOut({ startFrame: 30 * RATE, endFrame: TRACK }, 90 * RATE, TRACK)).toEqual({ startFrame: 30 * RATE, endFrame: 90 * RATE });
    // An in past the out lets the out go back to the end.
    expect(withLoopIn({ startFrame: 30 * RATE, endFrame: 90 * RATE }, 100 * RATE, TRACK)).toEqual({ startFrame: 100 * RATE, endFrame: TRACK });
    expect(withLoopOut({ startFrame: 30 * RATE, endFrame: 90 * RATE }, 10 * RATE, TRACK)).toEqual({ startFrame: 0, endFrame: 10 * RATE });
    expect(withLoopIn(undefined, TRACK - 100, TRACK)).toBeNull();
  });
});
