import { describe, expect, it } from 'vitest';
import { discoverTextTables } from '../../../../src/app/randomTables/import/textTables';
import { TABLE_LIMITS } from '../../../../src/app/randomTables/tableModel';
import { tablesOfNote } from '../../../../src/app/randomTables/noteTables';
import { tableNoteText } from '../../../../src/app/randomTables/tableMarkdown';

const options = { resultHeader: 'Result', rollHeader: 'Roll' };
const markdown = '## Weather (2d6)\n\n| Roll | Result |\n| --- | --- |\n| 2-5 | Rain |\n| 6-12 | Sun |\n\n## Treasure\n\n| d4 | Find |\n| --- | --- |\n| 1 | Coin |\n| 2-4 | Key |';

describe('discovering tables in text files', () => {
  it('keeps every Markdown table, its title and an explicitly stated die', () => {
    const result = discoverTextTables(markdown, 'md', options);
    expect(result.tables.map((candidate) => candidate.name)).toEqual(['Weather', 'Treasure']);
    expect(result.tables[0]?.table.headers).toEqual(['2d6', 'Result']);
    expect(result.tables[0]?.table.rows).toEqual([['2-5', 'Rain'], ['6-12', 'Sun']]);
    expect(tablesOfNote(tableNoteText(result.tables[0]!.name, result.tables[0]!.table), 'Weather').tables[0]?.die?.label).toBe('2d6');
  });

  it('keeps a first-column weight as a weight rather than a dice result', () => {
    const [candidate] = discoverTextTables('Weight,Item\n3,Rope\n1,Torch', 'csv', options).tables;
    const model = tablesOfNote(tableNoteText('Gear', candidate!.table), 'Gear').tables[0]!;
    expect(candidate?.table.numbered).toBe(false);
    expect(model.weighted).toBe(true);
    expect(model.hasRollColumn).toBe(false);
    expect(model.rows.map((row) => row.weight)).toEqual([3, 1]);
  });

  it('does not invent a title for an unnamed Markdown table', () => {
    expect(discoverTextTables('| d4 | Find |\n| --- | --- |\n| 1-4 | Key |', 'md', options).tables[0]?.name).toBe('');
  });

  it('reads quoted CSV cells, escaped quotes, embedded newlines and a title row', () => {
    const text = '\ufeffTreasure,,\r\nd6,Find,Value\r\n1,"Coin, silver",2\r\n2-6,"A ""golden""\r\nkey",4';
    const [candidate] = discoverTextTables(text, 'csv', options).tables;
    expect(candidate?.name).toBe('Treasure');
    expect(candidate?.table.headers).toEqual(['d6', 'Find', 'Value']);
    expect(candidate?.table.rows).toEqual([['1', 'Coin, silver', '2'], ['2-6', 'A "golden" key', '4']]);
  });

  it('finds separate titled regions in a spreadsheet export', () => {
    const result = discoverTextTables('Weather\t\nd4\tResult\n1-4\tRain\n\t\nTreasure\t\nd6\tFind\n1-6\tCoin', 'tsv', options);
    expect(result.tables.map((candidate) => candidate.name)).toEqual(['Weather', 'Treasure']);
  });

  it('keeps a text title separate from the result-column header', () => {
    const [candidate] = discoverTextTables('Road encounters\nd6 Encounter\n1 Goblins\n2-6 Wolves', 'txt', options).tables;
    expect(candidate?.name).toBe('Road encounters');
    expect(candidate?.table.headers).toEqual(['d6', 'Encounter']);
  });

  it('refuses malformed CSV rather than shifting cells', () => {
    expect(() => discoverTextTables('d6,Result\n1,"Unclosed', 'csv', options)).toThrow();
    expect(() => discoverTextTables('d6,Result\n1,"Text"junk', 'csv', options)).toThrow();
    expect(() => discoverTextTables('d6 Encounter\n1-6 Goblins\nd4 Weather\n1-4 Rain', 'txt', options)).toThrow();
  });

  it('refuses input that would be truncated by note limits', () => {
    expect(() => discoverTextTables('é'.repeat(TABLE_LIMITS.noteBytes / 2 + 1), 'txt', options)).toThrow();
    expect(() => discoverTextTables('d6,Result\n' + Array.from({ length: TABLE_LIMITS.rows + 1 }, () => '1,A').join('\n'), 'csv', options)).toThrow();
    expect(() => discoverTextTables('d6,Result\n1,' + 'x'.repeat(TABLE_LIMITS.cellCharacters + 1), 'csv', options)).toThrow();
    expect(() => discoverTextTables('d4 Result\n1 ' + 'x'.repeat(1500) + '\n' + 'y'.repeat(1000) + '\n2-4 Sun', 'txt', options)).toThrow();
    expect(() => discoverTextTables('d6,Result\n' + Array.from({ length: 325 }, (_, index) => `${index + 1},${'é'.repeat(400)}`).join('\n'), 'csv', options)).toThrow();
  });
});
