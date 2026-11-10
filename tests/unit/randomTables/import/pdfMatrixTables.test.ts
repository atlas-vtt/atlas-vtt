import { describe, expect, it } from 'vitest';
import { discoverPdfTables } from '../../../../src/app/randomTables/import/pdfTables';
import type { PdfSpan } from '../../../../src/app/randomTables/import/pdfLayout';
import { tablesOfNote } from '../../../../src/app/randomTables/noteTables';
import { tableNoteText } from '../../../../src/app/randomTables/tableMarkdown';

/** A printed matrix: result labels on the left, centered independent roll ranges on the right. */
const span = (text: string, x: number, y: number, width = text.length * 4, height = 10): PdfSpan => ({ text, x, y, width, height });
const atCenter = (text: string, center: number, y: number): PdfSpan => span(text, center - text.length * 2, y);
const matrix = (): PdfSpan[] => [
  span('Wild encounters', 36, 40, 100, 14),
  span('Encounter', 40, 60), atCenter('Forest', 200, 60), atCenter('Sea', 290, 60),
  span('A very long encounter label', 40, 80, 142), atCenter('01–10', 200, 80), atCenter('—', 290, 80),
  span('Patrol', 40, 100), atCenter('11–50', 200, 100), atCenter('01–20', 290, 100),
  span('Birds', 40, 120), atCenter('—', 200, 120), atCenter('21–60', 290, 120),
  span('Travelers', 40, 140), atCenter('51–00', 200, 140), atCenter('61–00', 290, 140),
];

describe('PDF encounter matrices', () => {
  it('creates a named percentile table per terrain, preserving ranges and skipping unavailable encounters', () => {
    const result = discoverPdfTables(matrix(), 2);
    expect(result.tables.map((table) => table.name)).toEqual(['Wild encounters — Forest', 'Wild encounters — Sea']);
    expect(result.tables.every((table) => table.page === 2)).toBe(true);
    expect(result.tables[0]?.table).toEqual({
      headers: ['d100', 'Encounter'], numbered: true,
      rows: [['01–10', 'A very long encounter label'], ['11–50', 'Patrol'], ['51–00', 'Travelers']],
    });
    expect(result.tables[1]?.table.rows).toEqual([['01–20', 'Patrol'], ['21–60', 'Birds'], ['61–00', 'Travelers']]);
    for (const candidate of result.tables) {
      const model = tablesOfNote(tableNoteText(candidate.name, candidate.table), candidate.name).tables[0]!;
      expect(model.die?.label).toBe('d100');
      expect(model.problems).toEqual([]);
    }
  });

  it('rejects a column with gaps or overlaps without filling or repairing its ranges', () => {
    for (const value of ['12–50', '10–50', 'unreadable']) {
      const bad = matrix().map((item) => item.text === '11–50' ? { ...item, text: value } : item);
      const result = discoverPdfTables(bad, 2);
      expect(result.tables.map((table) => table.name)).toEqual(['Wild encounters — Sea']);
      expect(result.warnings).toContain('skippedTables');
    }
  });

  it('rejects missing cells and overlapping geometry instead of shifting ranges to a neighboring column', () => {
    expect(discoverPdfTables(matrix().filter((item) => !(item.y === 100 && item.text === '01–20')), 2).tables).toEqual([]);
    expect(discoverPdfTables([...matrix(), atCenter('99', 200, 100)], 2).tables).toEqual([]);
    const overlapping = matrix().map((item) => item.text === '01–10' ? { ...item, x: 120, width: 160 } : item);
    expect(discoverPdfTables(overlapping, 2).tables).toEqual([]);
  });

  it('does not turn ordinary numeric lookup columns into dice tables', () => {
    const priceList = matrix().map((item) => /^\d|^—$/.test(item.text) ? { ...item, text: item.y <= 100 ? '1' : '2' } : item);
    expect(discoverPdfTables(priceList, 2).tables).toEqual([]);
  });

  it('uses an explicit die in the caption rather than inferring a different die from the largest result', () => {
    const reaction = matrix().map((item) => ({ ...item, text: item.text === 'Wild encounters' ? 'Reaction (2d6)'
      : ({ '01–10': '2–4', '11–50': '5–8', '51–00': '9–12', '01–20': '2–5', '21–60': '6–9', '61–00': '10–12' } as Record<string, string>)[item.text] ?? item.text }));
    const result = discoverPdfTables(reaction, 2);
    expect(result.tables.map((table) => table.table.headers[0])).toEqual(['2d6', '2d6']);
    expect(result.tables[0]?.name).toBe('Reaction — Forest');
  });

  it('stops before following prose and uses printed column names when there is no caption', () => {
    const result = discoverPdfTables([...matrix().filter((item) => item.y !== 40), span('Text after the table.', 40, 190)], 2);
    expect(result.tables.map((table) => table.name)).toEqual(['Forest', 'Sea']);
    expect(result.tables[0]?.table.rows.at(-1)).toEqual(['51–00', 'Travelers']);
  });

  it('leaves a following ordinary dice table available for detection', () => {
    const result = discoverPdfTables([...matrix(),
      span('d4 Weather', 40, 152), span('1 Rain', 40, 172), span('2–4 Sun', 40, 192),
    ], 2);
    expect(result.tables).toHaveLength(3);
    expect(result.tables[0]?.table.rows.at(-1)).toEqual(['51–00', 'Travelers']);
    expect(result.tables[2]?.table.rows).toEqual([['1', 'Rain'], ['2–4', 'Sun']]);
  });

  it('rejects ambiguous close text instead of truncating or absorbing the final result label', () => {
    expect(discoverPdfTables([...matrix(), span('Unclear continuation or caption', 40, 152, 135)], 2).tables).toEqual([]);
  });
});
