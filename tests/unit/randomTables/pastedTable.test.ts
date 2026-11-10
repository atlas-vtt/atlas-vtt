import { describe, expect, it } from 'vitest';
import { readPastedTable, type PastedTable } from '../../../src/app/randomTables/pastedTable';
import { TABLE_LIMITS } from '../../../src/app/randomTables/tableModel';

const OPTIONS = { resultHeader: 'Result', rollHeader: 'Roll' };

const read = (text: string): PastedTable => {
  const table = readPastedTable(text, OPTIONS);
  expect(table).not.toBeNull();
  return table!;
};

describe('pasting nothing', () => {
  it.each(['', '   ', '\n\n \t \n', '| A | B |\n| --- | --- |\n'])('reads no table from %j', (text) => {
    expect(readPastedTable(text, OPTIONS)).toBeNull();
  });
});

describe('pasting the lines of a PDF', () => {
  it('reads a die and a header from the line above the numbers, joining wrapped lines and broken words', () => {
    const table = read([
      'd6 Encounter',
      '1 A band of goblins',
      '2 Wolves circle the camp at',
      'night, howling',
      '3 An old cis-',
      'tern full of rats',
      '4 A merchant and his Well-',
      'Kept mule',
      '5 A ghost',
      '6 Nothing',
    ].join('\n'));
    expect(table).toEqual({
      headers: ['d6', 'Encounter'],
      rows: [
        ['1', 'A band of goblins'],
        ['2', 'Wolves circle the camp at night, howling'],
        ['3', 'An old cistern full of rats'],
        ['4', 'A merchant and his Well- Kept mule'],
        ['5', 'A ghost'],
        ['6', 'Nothing'],
      ],
      numbered: true,
    });
  });

  it.each([
    ['1. Goblins', '1'],
    ['1) Goblins', '1'],
    ['1: Goblins', '1'],
    ['**1** Goblins', '1'],
    ['1–2 Goblins', '1–2'],
    ['1-2 Goblins', '1-2'],
    ['1 – 2 Goblins', '1 – 2'],
    ['1 to 2 Goblins', '1 to 2'],
    ['2 or less Goblins', '2 or less'],
    ['12+ Goblins', '12+'],
    ['13, 14 Goblins', '13, 14'],
  ])('reads the numbers of %j', (line, roll) => {
    expect(read(line).rows).toEqual([[roll, 'Goblins']]);
  });

  it('makes the roll header up from the numbers, and names the result column after the line above', () => {
    const table = read('Treasure\n01–05 A gem\n06–99 Coins\n00 A crown');
    expect(table.headers).toEqual(['d100', 'Treasure']);
    expect(table.rows.map((row) => row[0])).toEqual(['01–05', '06–99', '00']);
  });

  it('heads the roll column Roll where the numbers name no die', () => {
    expect(read('1 Goblins\n2 Wolves\n3 Bears').headers).toEqual(['Roll', 'Result']);
  });

  it('takes the last line with a die before the numbers for the header', () => {
    expect(read('Random encounters on the road\n2d6 Reaction\n2 Hostile').headers).toEqual(['2d6', 'Reaction']);
  });

  it('keeps a number alone on its line as a row whose text follows on the next', () => {
    expect(read('1\nGoblins\n2\nWolves').rows).toEqual([['1', 'Goblins'], ['2', 'Wolves']]);
  });

  it('reads words that only start with a digit as text', () => {
    expect(read('1 A sword\n1d6 goblins appear\n2 A shield').rows).toEqual([['1', 'A sword 1d6 goblins appear'], ['2', 'A shield']]);
  });

  it('reads Windows line ends, blank lines and non-breaking spaces', () => {
    expect(read('d4\u00a0Weather\r\n\r\n1\u00a0Rain\r\n\r\n2 Sun\r\n').rows).toEqual([['1', 'Rain'], ['2', 'Sun']]);
  });
});

describe('pasting lines without numbers', () => {
  it('makes every line a row under the result header', () => {
    expect(read('A brass key\n\nA bent coin\n')).toEqual({ headers: ['Result'], rows: [['A brass key'], ['A bent coin']], numbered: false });
  });

  it('takes a first line ending with a colon for the header', () => {
    expect(read('Trinkets:\nA brass key\nA bent coin')).toEqual({ headers: ['Trinkets'], rows: [['A brass key'], ['A bent coin']], numbered: false });
  });
});

describe('pasting tab-separated rows', () => {
  it('reads a header row above numbered rows', () => {
    expect(read('d6\tEncounter\tWhere\n1\tGoblins\tRoad\n2\tWolves')).toEqual({
      headers: ['d6', 'Encounter', 'Where'],
      rows: [['1', 'Goblins', 'Road'], ['2', 'Wolves', '']],
      numbered: true,
    });
  });

  it('makes the headers up where the first row is numbered too', () => {
    const table = read('1\tGoblins\tRoad\n2\tWolves\tForest\n3\tA\tB\n4\tC\tD');
    expect(table.headers).toEqual(['d4', 'Result', 'Result 2']);
    expect(table.rows).toHaveLength(4);
    expect(table.numbered).toBe(true);
  });

  it('reads a header row above rows without numbers', () => {
    expect(read('Name\tPrice\nRope\t1 gp\nTorch\t1 cp')).toEqual({
      headers: ['Name', 'Price'],
      rows: [['Rope', '1 gp'], ['Torch', '1 cp']],
      numbered: false,
    });
  });

  it('takes a single line for a row', () => {
    expect(read('Rope\t1 gp')).toEqual({ headers: ['Result', 'Result 2'], rows: [['Rope', '1 gp']], numbered: false });
  });
});

describe('pasting a Markdown table', () => {
  it('reads the first table as written', () => {
    const text = 'Some text\n\n| d4 | Weather |\n| :-- | --- |\n| 1 | Rain |\n| 2-4 | [[Sun\\|Sunshine]] |\n\n| A | B |\n| - | - |\n| x | y |\n';
    expect(read(text)).toEqual({
      headers: ['d4', 'Weather'],
      rows: [['1', 'Rain'], ['2-4', '[[Sun|Sunshine]]']],
      numbered: true,
    });
  });
});

describe('the paste is bounded', () => {
  it('reads 10,000 lines in under a second, keeping the first rows', () => {
    const lines = Array.from({ length: 10_000 }, (_, i) => `${i + 1} A result that is a little longer than most, line ${i}`);
    const started = performance.now();
    const table = read(lines.join('\n'));
    expect(performance.now() - started).toBeLessThan(1000);
    expect(table.rows).toHaveLength(TABLE_LIMITS.rows);
  });

  it.each([
    ['a line of text', 'x'.repeat(1_000_000)],
    ['a numbered line', `1 ${'x '.repeat(500_000)}`],
    ['a line of digits', '1'.repeat(1_000_000)],
    ['a line of tabs', '1\t'.repeat(500_000)],
    ['a line of pipes', `|${'a|'.repeat(500_000)}\n|${'-|'.repeat(500_000)}\n|${'1|'.repeat(500_000)}`],
    ['a line of brackets', `1 ${'[['.repeat(500_000)}`],
  ])('reads %s of a megabyte quickly', (_, text) => {
    const started = performance.now();
    const table = readPastedTable(text, OPTIONS);
    expect(performance.now() - started).toBeLessThan(1000);
    for (const cells of [table?.headers ?? [], ...(table?.rows ?? [])]) {
      expect(cells.length).toBeLessThanOrEqual(TABLE_LIMITS.columns);
      for (const text of cells) expect(text.length).toBeLessThanOrEqual(TABLE_LIMITS.cellCharacters);
    }
  });

  it('keeps every wrapped line within the cell limit', () => {
    const table = read(`1 Start\n${Array.from({ length: 5000 }, () => 'more text').join('\n')}`);
    expect(table.rows[0]![1]!.length).toBe(TABLE_LIMITS.cellCharacters);
  });
});
