import { describe, expect, it } from 'vitest';
import { dieOdds } from '../../../src/app/randomTables/dieOdds';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import { TABLE_LIMITS, type RandomTable } from '../../../src/app/randomTables/tableModel';
import { rollTable } from '../../../src/app/randomTables/tableRoller';
import { REACTION_NOTE, d66Note } from '../../fixtures/tableNotes';
import { seededRandom } from '../library/fakeSync';

const ROLLS = 10_000;

const tableOf = (text: string): RandomTable => tablesOfNote(text, 'Note').tables[0]!;
const markdown = (header: string, rows: readonly string[]): RandomTable =>
  tableOf(`${header}\n${header.replace(/[^|]+/g, ' - ')}\n${rows.join('\n')}\n`);

/** How often each row came up in `ROLLS` single draws, by its first cell. */
function frequencies(table: RandomTable, seed = 7): Map<string, number> {
  const counts = new Map<string, number>();
  const random = seededRandom(seed);
  for (let i = 0; i < ROLLS; i++) {
    const [draw] = rollTable(table, { count: 1, random });
    const key = draw?.row?.cells[0] ?? '(none)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Each share within 0.02 of what it should be. */
function expectShares(counts: ReadonlyMap<string, number>, shares: Record<string, number>): void {
  for (const [key, share] of Object.entries(shares)) expect(Math.abs((counts.get(key) ?? 0) / ROLLS - share)).toBeLessThan(0.02);
}

describe('rolling a table', () => {
  it('rolls a d6 evenly and names the die and its number', () => {
    const table = markdown('| d6 | Result |', ['| 1 | a |', '| 2 | b |', '| 3 | c |', '| 4 | d |', '| 5 | e |', '| 6 | f |']);
    const [draw] = rollTable(table, { count: 1, random: seededRandom(1) });
    expect(draw!.roll?.die).toBe('d6');
    expect(draw!.row?.ranges[0]!.min).toBe(draw!.roll?.total);
    expectShares(frequencies(table), { a: 1 / 6, b: 1 / 6, c: 1 / 6, d: 1 / 6, e: 1 / 6, f: 1 / 6 });
  });

  it('rolls 2d6 on its bell curve, the open ends taking what passes them', () => {
    expectShares(frequencies(tableOf(REACTION_NOTE)), {
      Attacks: 1 / 36, Hostile: 9 / 36, Uncertain: 16 / 36, Indifferent: 9 / 36, Eager: 1 / 36,
    });
  });

  it('rolls a d66 as tens and ones', () => {
    const counts = frequencies(tableOf(d66Note()));
    expect(counts.size).toBe(36);
    expect(counts.has('(none)')).toBe(false);
    expectShares(counts, { 'Name 11': 1 / 36, 'Name 66': 1 / 36, 'Name 34': 1 / 36 });
  });

  it('picks by weight where the table has no die', () => {
    const table = markdown('| Item | Weight |', ['| Rope | 3 |', '| Torch | 1 |', '| Gem | nothing |']);
    expectShares(frequencies(table), { Rope: 0.75, Torch: 0.25, Gem: 0 });
    expect(rollTable(table, { count: 1, random: seededRandom(1) })[0]!.roll).toBeUndefined();
  });

  it('gives every row the same chance without a die or weights', () => {
    expectShares(frequencies(markdown('| Name |  |', ['| Ada | x |', '| Bo | x |', '| Cy | x |', '| Di | x |'])), {
      Ada: 0.25, Bo: 0.25, Cy: 0.25, Di: 0.25,
    });
  });

  it('gives no row for a number in a gap', () => {
    const table = markdown('| d6 | Result |', ['| 1–3 | low |']);
    const counts = frequencies(table);
    expectShares(counts, { low: 0.5, '(none)': 0.5 });
  });

  it('draws several, at most the results limit', () => {
    const table = markdown('| d6 | Result |', ['| 1–6 | x |']);
    expect(rollTable(table, { count: 3, random: seededRandom(2) })).toHaveLength(3);
    expect(rollTable(table, { count: 500, random: seededRandom(2) })).toHaveLength(TABLE_LIMITS.results);
  });
});

describe('rolling without repeats', () => {
  it('draws every row once and stops when the table is spent', () => {
    const table = markdown('| 2d6 | Result |', ['| 2 | rare |', '| 3–11 | common |', '| 12 | rare too |']);
    const draws = rollTable(table, { count: 10, noRepeats: true, random: seededRandom(3) });
    expect(draws.map((draw) => draw.row?.cells[0]).sort()).toEqual(['common', 'rare', 'rare too']);
    for (const draw of draws) expect(draw.row?.ranges.some((range) => draw.roll!.total >= range.min && draw.roll!.total <= range.max)).toBe(true);
  });

  it('keeps the die\'s odds among the rows still open', () => {
    const table = markdown('| 2d6 | Result |', ['| 2–6 | low |', '| 7 | seven |', '| 8–12 | high |']);
    const random = seededRandom(4);
    const second = new Map<string, number>();
    for (let i = 0; i < ROLLS; i++) {
      const draws = rollTable(table, { count: 2, noRepeats: true, random });
      if (draws[0]?.row?.cells[0] !== 'seven') continue;
      const key = draws[1]!.row!.cells[0]!;
      second.set(key, (second.get(key) ?? 0) + 1);
    }
    const total = [...second.values()].reduce((a, b) => a + b, 0);
    expect(Math.abs((second.get('low') ?? 0) / total - 0.5)).toBeLessThan(0.05);
  });

  it('draws weighted rows without repeats', () => {
    const table = markdown('| Item | Weight |', ['| Rope | 3 |', '| Torch | 1 |']);
    expect(rollTable(table, { count: 5, noRepeats: true, random: seededRandom(5) })).toHaveLength(2);
  });
});

describe('the odds of a die', () => {
  it('sums the faces of several dice', () => {
    const odds = dieOdds({ label: '2d6', count: 2, faces: 6, d66: false });
    expect(odds.get(7)).toBeCloseTo(6 / 36);
    expect(odds.get(2)).toBeCloseTo(1 / 36);
    expect([...odds.keys()]).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const big = dieOdds({ label: '10d1000', count: 10, faces: 1000, d66: false });
    expect([...big.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe('rows out of the table', () => {
  it('never draws an excluded row, and the others keep their odds among themselves', () => {
    const table = markdown('| d4 | Armor |', ['| 1 | Leather |', '| 2 | Chainmail |', '| 3 | Plate |', '| 4 | Mithral + reroll |']);
    const counts = new Map<string, number>();
    const random = seededRandom(11);
    const exclude = new Set([table.rows[3]!]);
    for (let i = 0; i < ROLLS; i++) {
      const [draw] = rollTable(table, { count: 1, exclude, random });
      const key = draw?.row?.cells[0] ?? '(none)';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.has('Mithral + reroll')).toBe(false);
    expectShares(counts, { Leather: 1 / 3, Chainmail: 1 / 3, Plate: 1 / 3 });
  });

  it('keeps the bell curve of the numbers that are left', () => {
    const table = markdown('| 2d6 | Type |', ['| 2-5 | Leather |', '| 6-7 | Chainmail |', '| 8-11 | Plate |', '| 12 | Mithral |']);
    const counts = new Map<string, number>();
    const random = seededRandom(5);
    for (let i = 0; i < ROLLS; i++) {
      const [draw] = rollTable(table, { count: 1, exclude: new Set([table.rows[3]!]), random });
      const key = draw?.row?.cells[0] ?? '(none)';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const left = 35 / 36;
    expectShares(counts, { Leather: 10 / 36 / left, Chainmail: 11 / 36 / left, Plate: 14 / 36 / left });
  });

  it('gives nothing when every row is excluded', () => {
    const table = markdown('| d2 | Result |', ['| 1 | a |', '| 2 | b |']);
    expect(rollTable(table, { count: 1, exclude: new Set(table.rows) })).toEqual([]);
  });
});
