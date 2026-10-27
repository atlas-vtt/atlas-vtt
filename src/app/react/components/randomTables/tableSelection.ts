import type { LootBase } from '../../../loot/LootBaseReader';
import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import type { RandomTablesLibrary } from './useRandomTables';

/** What the window rolls on: a loot base (its ticked views) or a table of a note. */
export type SelectedSource =
  | { kind: 'base'; id: string; base: LootBase }
  | { kind: 'table'; id: string; table: CollectionTable };

/** The groups of the library the window lists. */
export type ListedLibrary = Pick<RandomTablesLibrary, 'items' | 'text' | 'generators'>;

/** Every source of the library in the sidebar's order: generators, bases, Items tables, Text tables. */
export function librarySources(library: ListedLibrary): SelectedSource[] {
  return [
    ...library.generators.map((table): SelectedSource => ({ kind: 'table', id: table.id, table })),
    ...library.items.bases.map((base): SelectedSource => ({ kind: 'base', id: base.path, base })),
    ...[...library.items.tables, ...library.text].map((table): SelectedSource => ({ kind: 'table', id: table.id, table })),
  ];
}

/** The source `selected` names, else the first one; null for an empty library. */
export function selectedSource(library: ListedLibrary, selected: string | undefined): SelectedSource | null {
  const sources = librarySources(library);
  return sources.find((source) => source.id === selected) ?? sources[0] ?? null;
}

/** Whether a name matches what was typed in the search: every word, in any case. */
export function matchesSearch(name: string, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = name.toLowerCase();
  return words.every((word) => lower.includes(word));
}
