import { describe, expect, it } from 'vitest';
import { SPECIAL_WAYS } from '../../../../../src/app/dungeons/caveModel';
import { type CaveExit, PLAIN_EXITS, exitWidths, rollExits, rollLoopWay, verticalExits, wayOfWidth } from '../../../../../src/app/dungeons/layout/cavern/veins/caveExits';
import { rngFrom } from '../../../../../src/app/dungeons/rng';

const ROLLS = 10_000;

function rolls(seed: number, rules = PLAIN_EXITS): CaveExit[][] {
  const rng = rngFrom(seed);
  return Array.from({ length: ROLLS }, () => rollExits(rng, rules));
}

describe('a chamber’s exits', () => {
  it('make the largest the dice’s sum and the others each half the one before, rounded up', () => {
    expect(exitWidths(6, 1)).toEqual([7, 4, 2, 1]);
    expect(exitWidths(1, 2)).toEqual([3, 2]);
    expect(exitWidths(3, 3)).toEqual([6]);
    expect(exitWidths(5, 2)).toEqual([7, 4, 2, 1]);
    // An exit of 1 ft is kept once, as a letterbox after one of 2 ft; never a second.
    expect(exitWidths(1, 6).filter((w) => w === 1)).toHaveLength(1);
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) expect(exitWidths(a, b).length).toBeLessThanOrEqual(1 + Math.abs(a - b));
  });

  it('pass a way by its size: walk from 5 ft, crawl at 3 to 4, squeeze at 2, letterbox at 1', () => {
    expect([12, 5, 4, 3, 2, 1].map(wayOfWidth)).toEqual(['walk', 'walk', 'crawl', 'crawl', 'squeeze', 'letterbox']);
  });

  it('make the largest exit special on a double, one roll in six, straight on and never up or down', () => {
    const all = rolls(11);
    const special = all.filter((exits) => exits[0]?.special);
    expect(Math.abs(special.length / ROLLS - 1 / 6)).toBeLessThan(0.015);
    for (const exits of special) {
      expect(SPECIAL_WAYS).toContain(exits[0]!.way);
      expect(exits[0]!.vertical).toBeUndefined();
      expect(exits).toHaveLength(1);
    }
    expect(all.flatMap((exits) => exits.slice(1)).filter((exit) => exit.special)).toHaveLength(0);
  });

  it('lead a third of the exits up or down, half each', () => {
    const exits = rolls(13).flat().filter((exit) => !exit.special);
    const up = exits.filter((exit) => exit.vertical === 'up').length / exits.length;
    const down = exits.filter((exit) => exit.vertical === 'down').length / exits.length;
    expect(Math.abs(up + down - 1 / 3)).toBeLessThan(0.02);
    expect(Math.abs(up - down)).toBeLessThan(0.02);
  });

  it('bend as the character says: all down, all up, roofs low, no walks, more squeezes', () => {
    expect(rolls(17, { ...PLAIN_EXITS, vertical: 'down' }).flat().some((exit) => exit.vertical === 'up')).toBe(false);
    expect(rolls(17, { ...PLAIN_EXITS, vertical: 'up' }).flat().some((exit) => exit.vertical === 'down')).toBe(false);
    const plain = rolls(19).flat();
    const low = rolls(19, { ...PLAIN_EXITS, shrink: 2 }).flat();
    low.forEach((exit, k) => expect(exit.width).toBe(Math.max(1, plain[k]!.width - 2)));
    expect(rolls(19, { ...PLAIN_EXITS, noWalk: true }).flat().every((exit) => exit.width <= 4 && exit.way !== 'walk')).toBe(true);
    const squeezes = (list: CaveExit[]): number => list.filter((exit) => exit.way === 'squeeze').length;
    expect(squeezes(rolls(19, { ...PLAIN_EXITS, squeezes: true }).flat())).toBeGreaterThan(squeezes(plain) * 1.8);
  });

  it('roll a loop’s way as one exit, 2d6 ft', () => {
    const rng = rngFrom(23);
    const ways = Array.from({ length: 2_000 }, () => rollLoopWay(rng));
    expect(ways.every((w) => w.width >= 2 && w.width <= 12 && w.way === wayOfWidth(w.width))).toBe(true);
  });

  it('record the roof and floor exits by width, none where none was rolled', () => {
    expect(verticalExits([{ width: 7, way: 'walk' }])).toBeUndefined();
    expect(verticalExits([{ width: 7, way: 'walk', vertical: 'down' }, { width: 4, way: 'crawl', vertical: 'up' }, { width: 2, way: 'squeeze', vertical: 'down' }])).toEqual({ up: [4], down: [7, 2] });
  });
});
