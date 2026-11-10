import JSZip from 'jszip';
import type { PasteOptions } from '../pastedTable';
import { TABLE_LIMITS } from '../tableModel';
import { discoverCellTables } from './delimitedTables';
import { IMPORT_LIMITS, TableImportError, type ImportCandidate, type TableDiscovery } from './importModel';
import { readWorkbookPart, validateWorkbookZip } from './workbookZip';

const MAX_ROW = TABLE_LIMITS.rows * TABLE_LIMITS.tables;

function elements(node: Document | Element, name: string): Element[] {
  return [...node.getElementsByTagNameNS('*', name)];
}

function xml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TableImportError('workbookUnsupported');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (elements(doc, 'parsererror').length > 0) throw new TableImportError('malformed');
  return doc;
}

function textOf(node: Element): string {
  // Phonetic annotations are not the cell's displayed text.
  return elements(node, 't').filter((part) => part.parentElement?.localName !== 'rPh').map((part) => part.textContent ?? '').join('');
}

async function part(zip: JSZip, path: string, budget: { bytes: number }): Promise<Document> {
  const entry = zip.file(path);
  if (!entry) throw new TableImportError('malformed');
  return xml(await readWorkbookPart(entry, budget));
}

function readCell(cell: Element, strings: readonly string[]): string {
  const value = elements(cell, 'v')[0]?.textContent ?? '';
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') return textOf(cell);
  if (type === 's') {
    if (!/^\d{1,6}$/.test(value) || strings[Number(value)] === undefined) throw new TableImportError('malformed');
    return strings[Number(value)]!;
  }
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';
  if (type === 'e' || type === 'd') throw new TableImportError('workbookUnsupported');
  if (type !== null && !['n', 'str'].includes(type)) throw new TableImportError('workbookUnsupported');
  // Styled numbers may display dates, currencies or leading zeros. Do not import their raw values as text.
  if (value !== '' && (type === null || type === 'n') && cell.hasAttribute('s') && cell.getAttribute('s') !== '0') {
    throw new TableImportError('workbookUnsupported');
  }
  return value;
}

function sheetRows(doc: Document, strings: readonly string[]): string[][] {
  if (elements(doc, 'f').length > 0 || elements(doc, 'mergeCell').length > 0) throw new TableImportError('workbookUnsupported');
  const rows: string[][] = [];
  let previousRow = 0;
  const sourceRows = elements(doc, 'row');
  if (sourceRows.length > MAX_ROW) throw new TableImportError('tooLarge');
  for (const row of sourceRows) {
    const ref = row.getAttribute('r') ?? '';
    if (!/^\d{1,6}$/.test(ref)) throw new TableImportError('malformed');
    const rowNumber = Number(ref);
    if (rowNumber <= previousRow || rowNumber > MAX_ROW) throw new TableImportError('tooLarge');
    if (rowNumber > previousRow + 1) rows.push([]);
    const cells: string[] = [];
    const seen = new Set<number>();
    for (const cell of elements(row, 'c')) {
      const position = /^([A-Z]{1,3})(\d{1,6})$/.exec(cell.getAttribute('r') ?? '');
      if (!position || Number(position[2]) !== rowNumber) throw new TableImportError('malformed');
      let column = 0;
      for (const letter of position[1]!) column = column * 26 + letter.charCodeAt(0) - 64;
      if (column > TABLE_LIMITS.columns || seen.has(column)) throw new TableImportError('tooLarge');
      seen.add(column);
      while (cells.length < column) cells.push('');
      const value = readCell(cell, strings).replace(/\r\n|[\r\n]/g, ' ');
      if (value.length > TABLE_LIMITS.cellCharacters) throw new TableImportError('tooLarge');
      cells[column - 1] = value;
    }
    rows.push(cells);
    previousRow = rowNumber;
  }
  return rows;
}

/** Values-only XLSX regions. Formulas, merges and formatted numeric values need a CSV export first. */
export async function discoverWorkbookTables(bytes: ArrayBuffer, options: PasteOptions): Promise<TableDiscovery> {
  validateWorkbookZip(bytes);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { throw new TableImportError('malformed'); }
  const budget = { bytes: 0 };
  const workbook = await part(zip, 'xl/workbook.xml', budget);
  const relations = await part(zip, 'xl/_rels/workbook.xml.rels', budget);
  const stringsEntry = zip.file('xl/sharedStrings.xml');
  const strings = stringsEntry ? elements(xml(await readWorkbookPart(stringsEntry, budget)), 'si').map(textOf) : [];
  if (strings.length > MAX_ROW || strings.some((value) => value.length > TABLE_LIMITS.cellCharacters)) throw new TableImportError('tooLarge');
  const sheets = elements(workbook, 'sheet');
  if (sheets.length > TABLE_LIMITS.tables) throw new TableImportError('tooLarge');
  const tables: ImportCandidate[] = [];
  for (const sheet of sheets) {
    if (sheet.getAttribute('state') === 'hidden' || sheet.getAttribute('state') === 'veryHidden') continue;
    const name = sheet.getAttribute('name') ?? '';
    if (name.length > IMPORT_LIMITS.nameCharacters) throw new TableImportError('tooLarge');
    const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? sheet.getAttribute('r:id');
    const relation = elements(relations, 'Relationship').find((entry) => entry.getAttribute('Id') === id);
    const target = relation?.getAttribute('Target') ?? '';
    if (!relation || relation.getAttribute('TargetMode') === 'External' || !relation.getAttribute('Type')?.endsWith('/worksheet')) {
      throw new TableImportError('workbookUnsupported');
    }
    const path = target.startsWith('/xl/') ? target.slice(1) : `xl/${target}`;
    if (!/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(path)) throw new TableImportError('workbookUnsupported');
    tables.push(...discoverCellTables(sheetRows(await part(zip, path, budget), strings), options, name));
    if (tables.length > TABLE_LIMITS.tables) throw new TableImportError('tooLarge');
  }
  return { tables, warnings: [] };
}
