import { describe, expect, it } from 'vitest';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import { readPastedTable } from '../../../src/app/randomTables/pastedTable';
import { tableNoteText } from '../../../src/app/randomTables/tableMarkdown';
import type { RandomTable } from '../../../src/app/randomTables/tableModel';

const OPTIONS = { resultHeader: 'Result', rollHeader: 'Roll' };

/** Pasted text written as a note and read back as the note reader reads it. */
const roundTrip = (name: string, text: string): RandomTable => {
  const pasted = readPastedTable(text, OPTIONS);
  expect(pasted).not.toBeNull();
  const { tables, tooLarge, moreTables } = tablesOfNote(tableNoteText(name, pasted!), name);
  expect({ tooLarge, moreTables, count: tables.length }).toEqual({ tooLarge: false, moreTables: false, count: 1 });
  return tables[0]!;
};

describe('the note written for a pasted table', () => {
  it('is a heading, a blank line and the table', () => {
    const text = tableNoteText('Weather', { headers: ['d4', 'Weather'], rows: [['1', 'Rain'], ['2-4', 'Sun']], numbered: true });
    expect(text).toBe('## Weather\n\n| d4 | Weather |\n| --- | --- |\n| 1 | Rain |\n| 2-4 | Sun |\n');
  });

  it('writes an empty cell as a space between pipes', () => {
    expect(tableNoteText('T', { headers: ['', 'Result'], rows: [['1', '']], numbered: true }))
      .toBe('## T\n\n| | Result |\n| --- | --- |\n| 1 | |\n');
  });

  it('escapes pipes, keeps escaped ones, and writes line breaks as spaces', () => {
    const text = tableNoteText('Two\nlines ', { headers: ['A'], rows: [['x | y'], ['a \\| b'], ['[[Note|Alias]]'], ['one\r\ntwo\nthree']], numbered: false });
    expect(text).toBe('## Two lines\n\n| A |\n| --- |\n| x \\| y |\n| a \\| b |\n| [[Note\\|Alias]] |\n| one two three |\n');
  });
});

describe('a pasted table read back from its note', () => {
  it('reads a PDF paste with a header line, a wrapped line and a broken word as the same rows and die', () => {
    const table = roundTrip('Road encounters', [
      'd6 Encounter',
      '1 Goblins',
      '2 Wolves circle the camp at',
      'night',
      '3 An old cis-',
      'tern',
      '4 A merchant',
      '5 A ghost',
      '6 Nothing',
    ].join('\n'));
    expect(table.name).toBe('Road encounters');
    expect(table.die?.label).toBe('d6');
    expect(table.columns).toEqual(['Encounter']);
    expect(table.rows.map((row) => [row.roll, ...row.cells])).toEqual([
      ['1', 'Goblins'], ['2', 'Wolves circle the camp at night'], ['3', 'An old cistern'],
      ['4', 'A merchant'], ['5', 'A ghost'], ['6', 'Nothing'],
    ]);
    expect(table.problems).toEqual([]);
  });

  it('reads a d100 written 01–05 to 00', () => {
    const table = roundTrip('Treasure', '01–05 A gem\n06–50 Coins\n51–99 Nothing\n00 A crown');
    expect(table.die?.label).toBe('d100');
    expect(table.rows.map((row) => row.ranges)).toEqual([
      [{ min: 1, max: 5 }], [{ min: 6, max: 50 }], [{ min: 51, max: 99 }], [{ min: 100, max: 100 }],
    ]);
    expect(table.problems).toEqual([]);
  });

  it('reads a 2d6 table with open ends', () => {
    const table = roundTrip('Reaction', '2d6 Reaction\n2 or less Attacks\n3–5 Hostile\n6–8 Uncertain\n9–11 Indifferent\n12+ Eager');
    expect(table.die?.label).toBe('2d6');
    expect(table.rows).toHaveLength(5);
    expect(table.problems).toEqual([]);
  });

  it('reports a gap and never fills it', () => {
    const table = roundTrip('Gappy', '1 A\n2 B\n4 C\n5 D\n6 E');
    expect(table.die?.label).toBe('d6');
    expect(table.rows.map((row) => row.roll)).toEqual(['1', '2', '4', '5', '6']);
    expect(table.problems).toEqual([{ kind: 'gap', from: 3, to: 3 }]);
  });

  it('keeps pipes and link aliases in their cells', () => {
    const table = roundTrip('Links', '1\tA | B\t[[Note|Alias]]\n2\t[[Other#Heading|Shown]]\tC\\|D');
    expect(table.rows.map((row) => row.cells)).toEqual([['A | B', '[[Note|Alias]]'], ['[[Other#Heading|Shown]]', 'C|D']]);
  });

  it('reads a pasted Markdown table as written', () => {
    const table = roundTrip('Weather', '| d4 | Weather |\n| --- | --- |\n| 1 | [[Rain\\|Showers]] |\n| 2-4 | Sun |');
    expect(table.die?.label).toBe('d4');
    expect(table.rows.map((row) => row.cells)).toEqual([['[[Rain|Showers]]'], ['Sun']]);
  });

  it('reads lines without numbers as a table without a roll column', () => {
    const table = roundTrip('Trinkets', 'A brass key\nA bent coin');
    expect(table.hasRollColumn).toBe(false);
    expect(table.die).toBeNull();
    expect(table.rows.map((row) => row.cells)).toEqual([['A brass key'], ['A bent coin']]);
  });
});
