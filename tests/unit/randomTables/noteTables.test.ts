import { describe, expect, it } from 'vitest';
import { dieOfHeader, readRollCell, readWeight } from '../../../src/app/randomTables/dieRanges';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import type { RandomTable } from '../../../src/app/randomTables/tableModel';
import { AURIFEX_NOTE, BREW_NOTE, D100_NOTE, DICE_ROLLER_NOTE, REACTION_NOTE, d66Note } from '../../fixtures/tableNotes';

const only = (text: string, name = 'Note'): RandomTable => {
  const { tables } = tablesOfNote(text, name);
  expect(tables).toHaveLength(1);
  return tables[0]!;
};

const table = (header: string, rows: readonly string[], above = ''): RandomTable =>
  only(`${above}\n\n${header}\n${header.replace(/[^|]+/g, ' - ')}\n${rows.join('\n')}\n`);

describe('reading a roll cell', () => {
  it.each([
    ['1', [{ min: 1, max: 1 }]],
    ['1–2', [{ min: 1, max: 2 }]],
    ['1-2', [{ min: 1, max: 2 }]],
    ['1 to 2', [{ min: 1, max: 2 }]],
    ['01–05', [{ min: 1, max: 5 }]],
    ['00', [{ min: 100, max: 100 }]],
    ['96–00', [{ min: 96, max: 100 }]],
    ['**3**', [{ min: 3, max: 3 }]],
    ['66', [{ min: 66, max: 66 }]],
    ['13,14', [{ min: 13, max: 13 }, { min: 14, max: 14 }]],
    ['2 or less', [{ min: -Infinity, max: 2 }]],
    ['2-', [{ min: -Infinity, max: 2 }]],
    ['12+', [{ min: 12, max: Infinity }]],
    ['12 or more', [{ min: 12, max: Infinity }]],
  ])('reads %s', (cell, ranges) => {
    expect(readRollCell(cell)).toEqual(ranges);
  });

  it.each(['5–3', 'one', '1––', '3 and 4', '', '1234567'])('refuses %s', (cell) => {
    expect(readRollCell(cell)).toBeNull();
  });
});

describe('reading a die from a header', () => {
  it.each([
    ['d6', 'd6'], ['1d6', 'd6'], ['2d6', '2d6'], ['3d6', '3d6'], ['d66', 'd66'], ['d100', 'd100'], ['d%', 'd100'],
    ['dice: 1d20', 'd20'], ['**D8**', 'd8'],
  ])('reads %s as %s', (header, label) => {
    expect(dieOfHeader(header)?.label).toBe(label);
  });

  it.each(['Roll', 'd1', '11d6', '2d66', 'd2000'])('reads no die in %s', (header) => {
    expect(dieOfHeader(header)).toBeNull();
  });
});

describe('the tables of a note', () => {
  it('reads the Cairn background tables: empty headers, bold numbers, a die in the heading', () => {
    const [wrong, marvel] = tablesOfNote(AURIFEX_NOTE, 'Aurifex').tables;
    expect(wrong!.die?.label).toBe('d6');
    expect(wrong!.hasRollColumn).toBe(true);
    expect(wrong!.columns).toEqual(['']);
    expect(wrong!.rows[3]).toMatchObject({ roll: '**4**', ranges: [{ min: 4, max: 4 }] });
    expect(wrong!.problems).toEqual([]);
    expect(marvel!.columns).toEqual(['', '']);
    expect(marvel!.rows[0]!.cells).toEqual(['**Pyrophoric Gel**', 'A sticky green fluid (1 use).']);
  });

  it('reads the adventure tables with links and an emoji column', () => {
    const [encounters, rumours] = tablesOfNote(BREW_NOTE, 'A Most Potent Brew').tables;
    expect(encounters!.die?.label).toBe('d6');
    expect(encounters!.rows[2]!.cells[0]).toContain('[[Bestiary/5e SRD/Creatures/Swarm of Rats|Swarm of Rats]]');
    expect(rumours!.columns).toEqual(['Rumour', 'True?']);
    expect(rumours!.rows[5]!.cells).toEqual(['"Whatever\'s down there spits flame."', '✅ (partly)']);
  });

  it('reads a d100 table with 01–05 and 00', () => {
    const trinkets = only(D100_NOTE);
    expect(trinkets.die?.label).toBe('d100');
    expect(trinkets.rows.map((row) => row.ranges)).toEqual([
      [{ min: 1, max: 5 }], [{ min: 6, max: 50 }], [{ min: 51, max: 99 }], [{ min: 100, max: 100 }],
    ]);
    expect(trinkets.problems).toEqual([]);
  });

  it('reads a 2d6 table with open ends', () => {
    const reaction = only(REACTION_NOTE);
    expect(reaction.die).toEqual({ label: '2d6', count: 2, faces: 6, d66: false });
    expect(reaction.problems).toEqual([]);
  });

  it('reads 36 rows numbered 11 to 66 as a d66 table', () => {
    const names = only(d66Note());
    expect(names.die).toMatchObject({ label: 'd66', d66: true });
    expect(names.problems).toEqual([]);
  });

  it('reads Dice Roller\'s lookup table with a list row', () => {
    const weather = only(DICE_ROLLER_NOTE, 'Weather');
    expect(weather.name).toBe('Weather');
    expect(weather.die?.label).toBe('d20');
    expect(weather.rows[1]!.ranges).toEqual([{ min: 13, max: 13 }, { min: 14, max: 14 }]);
    expect(weather.problems).toEqual([]);
  });

  it('reads the die from the highest number when nothing names it', () => {
    expect(table('| # | Result |', ['| 1–3 | a |', '| 4–8 | b |']).die?.label).toBe('d8');
    expect(table('| # | Result |', ['| 1–3 | a |', '| 4–7 | b |']).die).toBeNull();
  });

  it('reads "Roll 1d6" in the line above the table', () => {
    expect(table('| # | Result |', ['| 1–3 | a |', '| 4–6 | b |'], 'Roll 2d6 for the weather:').die?.label).toBe('2d6');
  });

  it('reads a table without a roll column: every row the same chance', () => {
    const plain = table('| Name | Price |', ['| Rope | 1 gp |', '| Torch | 1 cp |']);
    expect(plain.hasRollColumn).toBe(false);
    expect(plain.die).toBeNull();
    expect(plain.columns).toEqual(['Name', 'Price']);
    expect(plain.rows.map((row) => row.weight)).toEqual([1, 1]);
    expect(plain.problems).toEqual([]);
  });

  it('weighs a table without a die by its weight column, and reports a weight that is none', () => {
    const weighted = table('| Item | Weight |', ['| Rope | 3 |', '| Torch | 0.5 |', '| Gem | lots |']);
    expect(weighted.weighted).toBe(true);
    expect(weighted.columns).toEqual(['Item']);
    expect(weighted.rows.map((row) => row.weight)).toEqual([3, 0.5, 0]);
    expect(weighted.problems).toEqual([{ kind: 'unreadable', row: 2, column: 'weight', text: 'lots' }]);
    expect(readWeight('0')).toBeNull();
  });

  it('lets a die decide over a weight column', () => {
    const rolled = table('| d4 | Item | Wt |', ['| 1–2 | Rope | 3 |', '| 3–4 | Torch | 1 |']);
    expect(rolled.weighted).toBe(false);
    expect(rolled.columns).toEqual(['Item']);
    expect(rolled.rows.map((row) => row.weight)).toEqual([1, 1]);
  });
});

describe('the problems of a table', () => {
  it('reports gaps and overlaps', () => {
    const broken = table('| d10 | Result |', ['| 1–3 | a |', '| 3–5 | b |', '| 8–10 | c |']);
    expect(broken.problems).toEqual([
      { kind: 'overlap', from: 3, to: 3 },
      { kind: 'gap', from: 6, to: 7 },
    ]);
  });

  it('reports a number the die cannot roll', () => {
    const bell = table('| 2d6 | Result |', ['| 2–6 | a |', '| 7–13 | b |']);
    expect(bell.problems).toEqual([{ kind: 'unreachable', row: 1, value: 13 }]);
  });

  it('reports a range that is no range, and still rolls the rows it can read', () => {
    const odd = table('| d4 | Result |', ['| 1–2 | a |', '| 4–3 | b |', '| 4 | c |']);
    expect(odd.problems).toEqual([
      { kind: 'unreadable', row: 1, column: 'roll', text: '4–3' },
      { kind: 'gap', from: 3, to: 3 },
    ]);
    expect(odd.rows[2]!.ranges).toEqual([{ min: 4, max: 4 }]);
  });

  it('checks a d66 table only on the numbers two d6 roll', () => {
    const short = table('| d66 | Result |', ['| 11–16 | a |', '| 21–36 | b |', '| 41–66 | c |', '| 67 | d |']);
    expect(short.problems).toEqual([{ kind: 'unreachable', row: 3, value: 67 }]);
  });

  it('checks gaps between the numbers written when no die is known', () => {
    expect(table('| # | Result |', ['| 1–3 | a |', '| 6–7 | b |']).problems).toEqual([{ kind: 'gap', from: 4, to: 5 }]);
  });

  it('reports the limits a table reached', () => {
    const row = `| 1 | ${'x'.repeat(2100)} |`;
    expect(table('| d6 | Result |', [row]).problems).toContainEqual({ kind: 'limit', limit: 'cell' });
  });
});
