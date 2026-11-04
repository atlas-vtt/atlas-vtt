import { dieOfHeader } from '../dieRanges';
import { readMarkdownTables } from '../markdownTables';
import { toRandomTable } from '../noteTables';
import { readPastedTable, type PasteOptions } from '../pastedTable';
import { TABLE_LIMITS } from '../tableModel';
import { discoverCellTables, readDelimited } from './delimitedTables';
import { TableImportError, validateImportTable, type TableDiscovery } from './importModel';

export type TextTableFormat = 'md' | 'csv' | 'tsv' | 'txt';

/** Structured sources retain every table and its context; input is never silently clipped. */
export function discoverTextTables(text: string, format: TextTableFormat, options: PasteOptions): TableDiscovery {
  if (text.length > TABLE_LIMITS.noteBytes || new TextEncoder().encode(text).length > TABLE_LIMITS.noteBytes) {
    throw new TableImportError('tooLarge');
  }
  const clean = text.replace(/^\ufeff/, '').replace(/\r\n|\r/g, '\n');
  if (format === 'csv' || format === 'tsv') {
    return { tables: discoverCellTables(readDelimited(clean, format === 'csv' ? ',' : '\t'), options), warnings: [] };
  }
  const markdown = readMarkdownTables(clean, '');
  if (markdown.moreTables) throw new TableImportError('tooLarge');
  if (markdown.tables.length > 0 || format === 'md') {
    const tables = markdown.tables.filter((source) => source.rows.length > 0).map((source) => {
      if (source.limits.length > 0) throw new TableImportError('tooLarge');
      const model = toRandomTable(source);
      const headers = [...source.headers];
      // A die supplied by context must survive writing the standalone note.
      if (model.hasRollColumn && model.die) headers[0] = model.die.label;
      const table = { headers, rows: source.rows, numbered: model.hasRollColumn };
      const name = source.heading === undefined ? '' : source.name;
      validateImportTable(table, name);
      return { name, table, line: source.line + 1 };
    });
    return { tables, warnings: [] };
  }
  if (clean.includes('\t')) return { tables: discoverCellTables(readDelimited(clean, '\t'), options), warnings: [] };
  const lines = clean.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > TABLE_LIMITS.rows + 2 || lines.some((line) => line.length > TABLE_LIMITS.cellCharacters)) throw new TableImportError('tooLarge');
  if (lines.filter((line) => dieOfHeader(line.split(/\s/, 1)[0] ?? '') !== null).length > 1) throw new TableImportError('malformed');
  const secondWord = lines[1]?.split(/\s/, 1)[0] ?? '';
  const title = lines.length > 2 && dieOfHeader(secondWord) !== null;
  const name = title ? lines.shift()! : '';
  const table = readPastedTable(lines.join('\n'), { ...options, onLimit: () => { throw new TableImportError('tooLarge'); } });
  if (!table) return { tables: [], warnings: [] };
  validateImportTable(table, name);
  return { tables: [{ name, table }], warnings: [] };
}
