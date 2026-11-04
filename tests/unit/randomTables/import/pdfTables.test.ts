import { describe, expect, it } from 'vitest';
import { discoverPdfTables } from '../../../../src/app/randomTables/import/pdfTables';
import type { PdfSpan } from '../../../../src/app/randomTables/import/pdfLayout';

const span = (text: string, x: number, y: number, size = 10): PdfSpan => ({ text, x, y, width: text.length * size * 0.45, height: size });
const table = (x: number, title: string): PdfSpan[] => [
  span(title, x, 40, 14), span('d6', x, 60), span('Encounter', x + 40, 60),
  span('1-2', x, 80), span('Goblins', x + 40, 80),
  span('3', x, 100), span('Wolves circle', x + 40, 100), span('the camp', x + 40, 112),
  span('4-6', x, 132), span('Nothing', x + 40, 132),
];

describe('conservative PDF table detection', () => {
  it('finds two side-by-side tables with the right titles and wrapped results', () => {
    const result = discoverPdfTables([...table(40, 'Road encounters'), ...table(330, 'Forest encounters')], 1);
    expect(result.tables.map((candidate) => candidate.name)).toEqual(['Road encounters', 'Forest encounters']);
    expect(result.tables[0]?.table.rows).toEqual([['1-2', 'Goblins'], ['3', 'Wolves circle the camp'], ['4-6', 'Nothing']]);
    expect(result.tables.every((candidate) => candidate.page === 1)).toBe(true);
  });

  it('reconstructs a header and numbered rows stored as whole text spans', () => {
    const result = discoverPdfTables([
      span('Weather', 40, 40, 14), span('d4 Weather', 40, 60),
      span('1 Rain', 40, 80), span('2-4 Sun', 40, 100),
    ], 2);
    expect(result.tables[0]?.table.rows).toEqual([['1', 'Rain'], ['2-4', 'Sun']]);
  });

  it('keeps multiple result columns separate', () => {
    const spans = table(40, 'Travel');
    spans.push(span('Place', 210, 60), span('Road', 210, 80), span('Wood', 210, 100), span('Hill', 210, 132));
    const result = discoverPdfTables(spans, 1);
    expect(result.tables[0]?.table.headers).toEqual(['d6', 'Encounter', 'Place']);
    expect(result.tables[0]?.table.rows[1]).toEqual(['3', 'Wolves circle the camp', 'Wood']);
  });

  it('rejects incomplete, overlapping or ambiguous tables', () => {
    expect(discoverPdfTables(table(40, 'Road').filter((item) => item.text !== '4-6'), 1).tables).toEqual([]);
    expect(discoverPdfTables(table(40, 'Road').map((item) => item.text === '4-6' ? { ...item, text: '3-6' } : item), 1).tables).toEqual([]);
    expect(discoverPdfTables([...table(40, 'Road'), span('X', 40, 100)], 1).tables).toEqual([]);
  });

  it('does not add following prose to the final result or make lists into tables', () => {
    const result = discoverPdfTables([...table(40, 'Road'), span('Read the next chapter for more advice.', 80, 170)], 1);
    expect(result.tables[0]?.table.rows.at(-1)).toEqual(['4-6', 'Nothing']);
    expect(discoverPdfTables([span('1 Goblins', 40, 50), span('2 Wolves', 40, 70)], 1).tables).toEqual([]);
  });

  it('requires naming when the text above the table is prose or absent', () => {
    const spans = table(40, 'Road').filter((item) => item.y !== 40);
    expect(discoverPdfTables(spans, 1).tables[0]?.name).toBe('');
    expect(discoverPdfTables([span('A paragraph about travel in the wilderness.', 40, 40), ...spans], 1).tables[0]?.name).toBe('');
    const shared = span('Shared title for both tables', 250, 40, 14);
    const adjacent = [...table(40, 'Road').filter((item) => item.y !== 40), ...table(330, 'Forest').filter((item) => item.y !== 40)];
    expect(discoverPdfTables([shared, ...adjacent], 1).tables.every((candidate) => candidate.name === '')).toBe(true);
  });

  it('rejects unreadable extraction and overlong cells', () => {
    expect(discoverPdfTables(table(40, 'Road').map((item) => item.text === 'Nothing' ? { ...item, text: '�' } : item), 1).tables).toEqual([]);
    expect(discoverPdfTables(table(40, 'Road').map((item) => item.text === 'Nothing' ? { ...item, text: 'x'.repeat(2100) } : item), 1).tables).toEqual([]);
  });

  it('ends a table at a new dice header rather than absorbing it as a wrapped cell', () => {
    const first = [span('d4 Weather', 40, 40), span('1 Rain', 40, 60), span('2-4 Sun', 40, 80)];
    const second = [span('d4 Treasure', 40, 100), span('1 Coin', 40, 120), span('2-4 Key', 40, 140)];
    expect(discoverPdfTables([...first, ...second], 1).tables.map((candidate) => candidate.table.rows))
      .toEqual([[['1', 'Rain'], ['2-4', 'Sun']], [['1', 'Coin'], ['2-4', 'Key']]]);
  });

  it('rejects repeated result headings that may require independent rolls', () => {
    const spans = table(40, 'Travel').map((item) => item.text === 'Encounter' ? { ...item, text: 'Description' } : item);
    spans.push(span('Description', 210, 60), span('Road', 210, 80), span('Wood', 210, 100), span('Hill', 210, 132));
    expect(discoverPdfTables(spans, 1).tables).toEqual([]);
  });
});
