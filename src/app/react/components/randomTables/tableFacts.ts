import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import type { RandomTable, TableProblem } from '../../../randomTables/tableModel';
import { generatorShape } from '../../../randomTables/generatorParts';
import { t } from '../../../i18n';

/** How a table is rolled, as short as the sidebar shows it: its die, else "Weighted", else its number of rows. */
export function rollFact(table: RandomTable): string {
  if (table.die && table.hasRollColumn) return table.die.label;
  if (table.weighted) return t('tables.weighted');
  return String(table.rows.length);
}

/** How a table is rolled, as a sentence for a tooltip or a chip. */
export function rollFactLong(table: RandomTable): string {
  if (table.die && table.hasRollColumn) return t('tables.die', { die: table.die.label });
  if (table.weighted) return t('tables.weightedLong', { count: table.rows.length });
  return t('tables.even', { count: table.rows.length });
}

/** How a listed table is rolled, short: a generator's number of parts, else as `rollFact` says. */
export function tableFact(found: CollectionTable): string {
  if (!found.table) return '';
  return found.source.kind === 'generator' ? String(generatorShape(found.table).parts.length) : rollFact(found.table);
}

/** How a listed table is rolled, as a sentence: a generator's parts, else as `rollFactLong` says. */
export function tableFactLong(found: CollectionTable): string {
  if (!found.table) return '';
  return found.source.kind === 'generator'
    ? t('tables.generator.parts', { count: generatorShape(found.table).parts.length })
    : rollFactLong(found.table);
}

/** Each kind of problem once, counted: "2 gaps", "1 overlap". */
export function problemLines(problems: readonly TableProblem[]): string[] {
  const counts = new Map<TableProblem['kind'], number>();
  for (const problem of problems) counts.set(problem.kind, (counts.get(problem.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => t(`tables.problems.${kind}`, { count }));
}

/** What keeps a listed table from being rolled, or a word on how it was found; null when it is simply there. */
export function statusLine(found: CollectionTable): string | null {
  switch (found.status) {
    case 'note-missing': return t('tables.noteGone');
    case 'table-missing': return t('tables.tableGone');
    case 'note-too-large': return t('tables.tooLarge');
    case 'renamed': return t('tables.tableRenamed', { name: found.table?.name ?? '' });
    default: return null;
  }
}

/** The table's own name: as its note holds it now, else as the settings named it, else its note's. */
export function ownTableName(found: CollectionTable): string {
  return found.table?.name ?? found.source.table ?? found.noteName;
}

/** The name a listed table shows: the one the GM gave it in Atlas, else its own. */
export function tableName(found: CollectionTable): string {
  return found.source.label ?? ownTableName(found);
}

/** The source entry with `label` as the name Atlas shows: none when it is blank or the table's own. */
export function withLabel(found: CollectionTable, source: CollectionTable['source'], label: string): CollectionTable['source'] {
  const { label: _was, ...rest } = source;
  const name = label.trim();
  return name && name !== ownTableName(found) ? { ...rest, label: name } : rest;
}
