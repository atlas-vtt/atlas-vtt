import { describe, expect, it } from 'vitest';
import { MAX_ROUTE_DEPTH, MOST_TURNS, routeDepth, routeTurns } from '../../../../../src/app/dungeons/layout/cavern/veins/routeLength';
import { rngFrom } from '../../../../../src/app/dungeons/rng';

describe('route length', () => {
  it('rolls 1d4 turns that explode on their highest face, at most twelve', () => {
    const rng = rngFrom(3);
    const turns = Array.from({ length: 20_000 }, () => routeTurns(rng));
    const share = (test: (t: number) => boolean): number => turns.filter(test).length / turns.length;
    for (const t of [1, 2, 3]) expect(Math.abs(share((x) => x === t) - 0.25)).toBeLessThan(0.015);
    // A 4 never stands alone: it rolls a d6 more.
    expect(share((t) => t === 4)).toBe(0);
    expect(Math.abs(share((t) => t >= 5) - 0.25)).toBeLessThan(0.015);
    // 4 + 6 + 8 + a d10 is the most before the cap: some ways run as long as the cap allows.
    expect(Math.max(...turns)).toBe(MOST_TURNS);
    expect(Math.abs(share((t) => t >= 10) - 0.25 / 6)).toBeLessThan(0.01);
  });

  it('draws two cells a turn, walls included, never deeper than the cap', () => {
    const rng = rngFrom(5);
    const depths = Array.from({ length: 5_000 }, () => routeDepth(rng));
    expect(Math.min(...depths)).toBe(4);
    expect(Math.max(...depths)).toBe(MAX_ROUTE_DEPTH);
    expect(depths.every((d) => d % 2 === 0)).toBe(true);
    expect(depths.filter((d) => d <= 8).length / depths.length).toBeGreaterThan(0.7);
  });
});
