import { describe, expect, it } from 'vitest';
import { AxisLock } from '../../src/app/tools/axisLock';

describe('AxisLock', () => {
  it('keeps a Shift-held stroke on the line it starts along, and lets go with Shift', () => {
    const lock = new AxisLock();
    const from = { x: 10, y: 10 };
    expect(lock.follow({ x: 12, y: 11 }, true, from, 5)).toEqual(from);
    expect(lock.follow({ x: 30, y: 14 }, true, from, 5)).toEqual({ x: 30, y: 10 });
    expect(lock.follow({ x: 40, y: 60 }, true, from, 5)).toEqual({ x: 40, y: 10 });
    expect(lock.follow({ x: 40, y: 60 }, false, from, 5)).toEqual({ x: 40, y: 60 });
    expect(lock.follow({ x: 41, y: 90 }, true, { x: 40, y: 60 }, 5)).toEqual({ x: 40, y: 90 });
  });
});
