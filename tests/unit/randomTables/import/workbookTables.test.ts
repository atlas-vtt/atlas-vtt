// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { discoverWorkbookTables } from '../../../../src/app/randomTables/import/workbookTables';

const options = { resultHeader: 'Result', rollHeader: 'Roll' };
const textCell = (ref: string, text: string): string => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
const sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
  + `<row r="1">${textCell('A1', 'd6')}${textCell('B1', 'Find')}</row>`
  + `<row r="2"><c r="A2"><v>1</v></c>${textCell('B2', 'Coin')}</row>`
  + `<row r="3">${textCell('A3', '2-6')}${textCell('B3', 'Key')}</row>`
  + '</sheetData></worksheet>';

async function workbook(xml = sheet, extra: Record<string, string> = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Treasure" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', xml);
  for (const [name, content] of Object.entries(extra)) zip.file(name, content);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

describe('XLSX table import', () => {
  it('retains sheet names, exact text and roll ranges', async () => {
    const result = await discoverWorkbookTables(await workbook(), options);
    expect(result.tables[0]?.name).toBe('Treasure');
    expect(result.tables[0]?.sheet).toBe('Treasure');
    expect(result.tables[0]?.table.rows).toEqual([['1', 'Coin'], ['2-6', 'Key']]);
  });

  it('reads shared strings and rich text fragments', async () => {
    const xml = sheet.replace(textCell('B2', 'Coin'), '<c r="B2" t="s"><v>0</v></c>');
    const result = await discoverWorkbookTables(await workbook(xml, { 'xl/sharedStrings.xml': '<sst><si><r><t>Silver </t></r><r><t>coin</t></r></si></sst>' }), options);
    expect(result.tables[0]?.table.rows[0]).toEqual(['1', 'Silver coin']);
  });

  it('rejects formulas, merged cells, broken shared-string references and invalid coordinates', async () => {
    for (const xml of [
      sheet.replace('<v>1</v>', '<f>SUM(1)</f><v>1</v>'),
      sheet.replace('</worksheet>', '<mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>'),
      sheet.replace(textCell('B2', 'Coin'), '<c r="B2" t="s"><v>99</v></c>'),
      sheet.replace('r="B2"', 'r="ZZZ99999999"'),
    ]) await expect(discoverWorkbookTables(await workbook(xml), options)).rejects.toThrow();
  });

  it('rejects oversized XML before inflation and malformed ZIP input', async () => {
    await expect(discoverWorkbookTables(await workbook(sheet, { 'xl/sharedStrings.xml': 'x'.repeat(5 * 1024 * 1024) }), options)).rejects.toThrow();
    await expect(discoverWorkbookTables(new ArrayBuffer(50), options)).rejects.toThrow();
  });

  it('refuses XML entities', async () => {
    await expect(discoverWorkbookTables(await workbook('<!DOCTYPE worksheet [<!ENTITY x "coin">]>' + sheet), options)).rejects.toThrow();
  });
});
