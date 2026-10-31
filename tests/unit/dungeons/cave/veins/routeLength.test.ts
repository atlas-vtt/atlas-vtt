import { describe, expect, it } from 'vitest';
import { MAX_ROUTE_DEPTH, routeDepth, routeTurns } from '../../../../../src/app/dungeons/layout/cavern/veins/routeLength';
import { rngFrom } from '../../../../../src/app/dungeons/rng';

describe('route length', () => {
  it('rolls 1d4 turns that explode on their highest face, through the d6, d8 and d10', () => {
    const rng = rngFrom(3);
    const turns = Array.from({ length: 20_000 }, () => routeTurns(rng));
    const share = (test: (t: number) => boolean): number => turns.filter(test).length / turns.length;
    for (const t of [1, 2, 3]) expect(Math.abs(share((x) => x === t) - 0.25)).toBeLessThan(0.015);
    // A 4 never stands alone: it rolls a d6 more.
    expect(share((t) => t === 4)).toBe(0);
    expect(Math.abs(share((t) => t >= 5) - 0.25)).toBeLessThan(0.015);
    // 4 + 6 rolls a d8, and 4 + 6 + 8 a d10: the tail runs past every die before it.
    expect(Math.abs(share((t) => t >= 11) - 0.25 / 6)).toBeLessThan(0.01);
    expect(Math.max(...turns)).toBeGreaterThan(18);
    expect(Math.max(...turns)).toBeLessThanOrEqual(28);
  });

  it('draws two cells a turn up to four turns, and a longer way longer still, never deeper than the cap', () => {
    const rng = rngFrom(5);
    const depths = Array.from({ length: 5_000 }, () => routeDepth(rng));
    const share = (test: (d: number) => boolean): number => depths.filter(test).length / depths.length;
    expect(Math.min(...depths)).toBe(4);
    for (const d of [4, 6, 8]) expect(Math.abs(share((x) => x === d) - 0.25)).toBeLessThan(0.02);
    // A way that exploded runs past every way of four turns, and the d8 and d10 make it longer yet.
    expect(share((d) => d > 8 && d < 11)).toBe(0);
    expect(Math.abs(share((d) => d >= 11) - 0.25)).toBeLessThan(0.02);
    expect(share((d) => d >= 14)).toBeGreaterThan(0);
    expect(Math.max(...depths)).toBeLessThanOrEqual(MAX_ROUTE_DEPTH);
  });
});
