/**
 * Finding the tables a collection names in the notes that hold them: by the
 * table's name, else by its place in the note (its heading was renamed), else
 * not at all. And the table a link names: `[[Note]]` for a note's only table,
 * `[[Note#Heading]]` for the table under that heading. Pure.
 */

import type { RandomTableSource } from '../types/randomTableTypes';
import type { NoteTables, RandomTable } from './tableModel';

/**
 * Where a listed table stands: found by its name, found by its place after its heading was
 * renamed, gone from its note, or the note itself is gone, too large or not read yet.
 */
export type TableStatus = 'found' | 'renamed' | 'table-missing' | 'note-missing' | 'note-too-large' | 'loading';

export interface FoundTable {
  status: TableStatus;
  table: RandomTable | null;
}

/** What is known of a note: its tables, or that it is gone or not read yet. */
export type NoteState = { kind: 'read'; tables: NoteTables } | { kind: 'missing' } | { kind: 'loading' };

/** A table's id among the collection's tables: its note and its place there, as listed. */
export const tableSourceId = (source: Pick<RandomTableSource, 'path' | 'index'>): string => `${source.path}#${source.index}`;

/**
 * The tables of one note for the sources that name it, in their order. A source finds its table
 * by name first; only then do the others take a table by its place, and never one another
 * source of the note found by name, so a table deleted above another does not hand its
 * settings to the one that moved up.
 */
export function findNoteTables(sources: readonly RandomTableSource[], note: NoteState): FoundTable[] {
  if (note.kind === 'loading') return sources.map(() => ({ status: 'loading', table: null }));
  if (note.kind === 'missing') return sources.map(() => ({ status: 'note-missing', table: null }));
  if (note.tables.tooLarge) return sources.map(() => ({ status: 'note-too-large', table: null }));
  const { tables } = note.tables;
  const byName = sources.map((source) => (source.table === undefined ? undefined : tables.find((table) => table.name === source.table)));
  const claimed = new Set(byName.filter((table) => table !== undefined));
  return sources.map((source, i) => {
    const named = byName[i];
    if (named) return { status: 'found', table: named };
    const placed = tables[source.index];
    if (!placed || claimed.has(placed)) return { status: 'table-missing', table: null };
    claimed.add(placed);
    return { status: source.table === undefined ? 'found' : 'renamed', table: placed };
  });
}

/** A heading as links name it: case and runs of spaces do not count. */
function headingKey(heading: string): string {
  return heading.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The table a link names in a note: the table under `heading`, else the note's only table;
 * null for a note with several tables and no heading named.
 */
export function linkedTable(tables: NoteTables, heading: string | undefined): RandomTable | null {
  if (tables.tooLarge) return null;
  if (heading === undefined || !heading.trim()) return tables.tables.length === 1 ? tables.tables[0]! : null;
  const key = headingKey(heading);
  return tables.tables.find((table) => (table.heading !== undefined && headingKey(table.heading) === key) || headingKey(table.name) === key) ?? null;
}

/**
 * A link's note and heading: `Treasure#Gems` → Treasure, Gems; of nested headings
 * (`Treasure#Hoards#Gems`) the last. A block link names no table.
 */
export function splitLink(link: string): { note: string; heading?: string } | null {
  const hash = link.indexOf('#');
  if (hash < 0) return { note: link.trim() };
  const heading = link.slice(link.lastIndexOf('#') + 1);
  if (heading.startsWith('^')) return null;
  return { note: link.slice(0, hash).trim(), heading };
}
