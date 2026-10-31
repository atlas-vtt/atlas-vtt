import { describe, expect, it } from 'vitest';
import { MAX_CLIMB_DEPTH, MAX_ROUTE_CELLS, SEGMENT_CELLS, climbDepth, routeSegments, routeTurns } from '../../../../../src/app/dungeons/layout/cavern/veins/routeLength';
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

  it('lays two cells a turn, one passage as long as one holds, and a longer way as a chain of passages', () => {
    for (const turns of [1, 2, 3, 4, 5]) expect(routeSegments(turns)).toEqual([2 * turns]);
    for (let turns = 6; turns <= 28; turns++) {
      const segments = routeSegments(turns);
      const cells = segments.reduce((a, b) => a + b, 0);
      // A long way bends at least once, and no passage of it runs longer than a segment.
      expect(segments.length, `${turns} turns`).toBeGreaterThanOrEqual(2);
      // Every passage but the last runs a whole segment.
      expect(segments.slice(0, -1).every((cells) => cells === SEGMENT_CELLS)).toBe(true);
      expect(Math.max(...segments)).toBeLessThanOrEqual(SEGMENT_CELLS);
      expect(cells).toBe(Math.min(MAX_ROUTE_CELLS, 2 * turns));
    }
    const rng = rngFrom(5);
    const lengths = Array.from({ length: 5_000 }, () => routeSegments(routeTurns(rng)).reduce((a, b) => a + b, 0));
    const share = (test: (d: number) => boolean): number => lengths.filter(test).length / lengths.length;
    for (const d of [2, 4, 6]) expect(Math.abs(share((x) => x === d) - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(share((d) => d > 15) - 1 / 8)).toBeLessThan(0.02);
    expect(Math.max(...lengths)).toBe(MAX_ROUTE_CELLS);
  });

  it('climbs or drops ten or twenty feet within a floor, mostly twenty', () => {
    const rng = rngFrom(9);
    const depths = Array.from({ length: 4_000 }, () => climbDepth(rng));
    expect(new Set(depths)).toEqual(new Set([10, MAX_CLIMB_DEPTH]));
    expect(Math.abs(depths.filter((d) => d === 10).length / depths.length - 0.25)).toBeLessThan(0.03);
  });
});
