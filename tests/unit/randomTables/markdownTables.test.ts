import { describe, expect, it } from 'vitest';
import { headingName, readMarkdownTables } from '../../../src/app/randomTables/markdownTables';
import { splitTableLine } from '../../../src/app/randomTables/tableCells';
import { TABLE_LIMITS } from '../../../src/app/randomTables/tableModel';
import { AURIFEX_NOTE, BREW_NOTE } from '../../fixtures/tableNotes';

describe('splitting a table line', () => {
  it('keeps escaped pipes and the alias pipes of links in their cell', () => {
    expect(splitTableLine('| 1 | 2 [[Giant Rat\\|Giant Rats]] and [[Swarm|a swarm]] | a \\| b |').cells)
      .toEqual(['1', '2 [[Giant Rat|Giant Rats]] and [[Swarm|a swarm]]', 'a | b']);
  });

  it('reads rows without their outer pipes', () => {
    expect(splitTableLine('a | b').cells).toEqual(['a', 'b']);
    expect(splitTableLine('plain text').pipes).toBe(0);
  });

  it('takes an unclosed link as text', () => {
    expect(splitTableLine('| [[open | b |').cells).toEqual(['[[open', 'b']);
  });
});

describe('finding the tables of a note', () => {
  it('names a table by its heading without "Roll 1d6:" and skips the frontmatter', () => {
    const { tables } = readMarkdownTables(AURIFEX_NOTE, 'Aurifex');
    expect(tables.map((table) => table.name)).toEqual([
      'What went horribly wrong?',
      'What alchemical marvel is the product of your latest ingenuity?',
    ]);
    expect(tables[0]!.heading).toBe('What went horribly wrong? Roll 1d6:');
    expect(tables[0]!.headers).toEqual(['', '']);
    expect(tables[0]!.rows).toHaveLength(6);
    expect(tables[1]!.rows[0]).toEqual(['**1**', '**Pyrophoric Gel**', 'A sticky green fluid (1 use).']);
  });

  it('reads both tables of a note with emoji headings and linked creatures', () => {
    const { tables } = readMarkdownTables(BREW_NOTE, 'A Most Potent Brew');
    expect(tables.map((table) => [table.name, table.index])).toEqual([
      ['🎲 Random Tunnel Encounters', 0],
      ['🗣️ Rumours in the Taproom', 1],
    ]);
    expect(tables[0]!.rows[0]![1]).toBe('2 [[Bestiary/5e SRD/Creatures/Giant Rat|Giant Rats]] fighting over a dead centipede');
    expect(tables[0]!.context).toEqual(['🎲 Random Tunnel Encounters', '![[Blue Mouth Caves.atlasmap#]]']);
    expect(tables[1]!.headers).toEqual(['d6', 'Rumour', 'True?']);
  });

  it('names tables without a heading after the note, numbered from the second', () => {
    const text = '| a | b |\n| - | - |\n| 1 | x |\n\ntext\n\n| a | b |\n| - | - |\n| 1 | y |\n';
    expect(readMarkdownTables(text, 'Loot').tables.map((table) => table.name)).toEqual(['Loot', 'Loot 2']);
  });

  it('reads a table in a callout and none in a code fence', () => {
    const text = '```\n| a | b |\n| - | - |\n| 1 | x |\n```\n\n> [!note] Weather\n> | d4 | Sky |\n> | --- | --- |\n> | 1 | Clear |\n> | 2 | Rain |\n';
    const { tables } = readMarkdownTables(text, 'Weather');
    expect(tables).toHaveLength(1);
    expect(tables[0]!.rows).toEqual([['1', 'Clear'], ['2', 'Rain']]);
  });

  it('ends a table at a blank line or a line without pipes', () => {
    const text = '| a | b |\n| - | - |\n| 1 | x |\nprose\n| 2 | y |\n';
    expect(readMarkdownTables(text, 'Note').tables[0]!.rows).toEqual([['1', 'x']]);
  });

  it('needs a delimiter row with as many cells as the header', () => {
    expect(readMarkdownTables('| a | b |\n| - |\n| 1 | x |\n', 'Note').tables).toEqual([]);
  });

  it('strips the other forms of a die from a heading', () => {
    expect(headingName('Weather (d6)')).toBe('Weather');
    expect(headingName('**Loot** Roll d20')).toBe('Loot');
    expect(headingName('Roll 1d6')).toBe('Roll 1d6');
  });
});

describe('the limits of a note', () => {
  it('skips a note over the size limit', () => {
    const text = `| a | b |\n| - | - |\n${'| 1 | x |\n'.repeat(TABLE_LIMITS.noteBytes / 10 + 1)}`;
    expect(readMarkdownTables(text, 'Big')).toEqual({ tables: [], tooLarge: true, moreTables: false });
  });

  it('counts bytes, not characters', () => {
    const text = `| a | b |\n| - | - |\n| 1 | ${'é'.repeat(TABLE_LIMITS.noteBytes / 2)} |`;
    expect(text.length).toBeLessThan(TABLE_LIMITS.noteBytes);
    expect(readMarkdownTables(text, 'Big').tooLarge).toBe(true);
  });

  it('reads at most 64 tables', () => {
    const text = Array.from({ length: TABLE_LIMITS.tables + 2 }, (_, i) => `## T${i}\n| a | b |\n| - | - |\n| 1 | x |\n`).join('\n');
    const read = readMarkdownTables(text, 'Many');
    expect(read.tables).toHaveLength(TABLE_LIMITS.tables);
    expect(read.moreTables).toBe(true);
  });

  it('cuts rows, columns and cells and says so', () => {
    const header = `| ${Array.from({ length: 20 }, (_, i) => `c${i}`).join(' | ')} |`;
    const delimiter = `| ${Array.from({ length: 20 }, () => '-').join(' | ')} |`;
    const row = (first: string): string => `| ${first} | ${Array.from({ length: 19 }, () => 'y').join(' | ')} |`;
    const rows = Array.from({ length: TABLE_LIMITS.rows + 3 }, (_, i) => row(i === 0 ? 'x'.repeat(TABLE_LIMITS.cellCharacters + 5) : 'x'));
    const text = [header, delimiter, ...rows].join('\n');
    const [table] = readMarkdownTables(text, 'Wide').tables;
    expect(table!.headers).toHaveLength(TABLE_LIMITS.columns);
    expect(table!.rows).toHaveLength(TABLE_LIMITS.rows);
    expect(table!.rows[0]![0]).toHaveLength(TABLE_LIMITS.cellCharacters);
    expect(table!.limits.sort()).toEqual(['cell', 'columns', 'rows']);
  });

  it('reads a hostile note in time', () => {
    const brackets = `| ${'[['.repeat(20_000)} | ${'\\|'.repeat(10_000)} | ${'|'.repeat(5_000)}\n`;
    const heading = `#${' '.repeat(50_000)}x${' '.repeat(50_000)}#\n`;
    const rows = `| a | b |\n| - | - |\n${'| 1 | [[a|b]] [[c\n'.repeat(10_000)}`;
    const started = performance.now();
    readMarkdownTables(`${brackets}${heading}${rows}`.slice(0, TABLE_LIMITS.noteBytes), 'Hostile');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
