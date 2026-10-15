/**
 * The random tables a collection's settings name, which arrive unchecked: read
 * only through `readRandomTables`, written through `withRandomTable` and its
 * siblings, which keep every entry they do not change as it was, fields of a
 * newer Atlas included.
 */

import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { RandomTableKind, RandomTableSource } from '../types/randomTableTypes';
import { isRecord } from '../utils/guards';
import { TABLE_LIMITS } from './tableModel';

type TableSettings = Pick<CollectionSettings, 'randomTables'>;

const KINDS: readonly RandomTableKind[] = ['text', 'items'];
/** Fields this Atlas reads; any other field of an entry belongs to a newer one and is kept. */
const KNOWN_FIELDS = new Set(['path', 'table', 'index', 'kind', 'label', 'hiddenColumns', 'noRepeats']);
/** Longest name the GM may give a table, as long as a heading is read. */
export const MAX_TABLE_LABEL = 200;
const MAX_HIDDEN_COLUMNS = TABLE_LIMITS.columns;

function isKind(value: unknown): value is RandomTableKind {
  return KINDS.some((kind) => kind === value);
}

function readSource(value: unknown): RandomTableSource | null {
  if (!isRecord(value)) return null;
  const { path, table, index, kind, label, hiddenColumns, noRepeats } = value;
  if (typeof path !== 'string' || !path.trim() || !isKind(kind)) return null;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= TABLE_LIMITS.tables) return null;
  const hidden = Array.isArray(hiddenColumns)
    ? [...new Set(hiddenColumns.filter((column): column is string => typeof column === 'string'))].slice(0, MAX_HIDDEN_COLUMNS)
    : [];
  return {
    path,
    ...(typeof table === 'string' && table.trim() && { table }),
    index,
    kind,
    ...(typeof label === 'string' && label.trim() && { label: label.trim().slice(0, MAX_TABLE_LABEL) }),
    ...(hidden.length > 0 && { hiddenColumns: hidden }),
    ...(noRepeats === true && { noRepeats: true }),
  };
}

/** The entries as stored, whatever they hold. */
function storedEntries(settings: TableSettings): unknown[] {
  const stored: unknown = settings.randomTables;
  return Array.isArray(stored) ? stored : [];
}

const sameTable = (entry: unknown, path: string, index: number): boolean =>
  isRecord(entry) && entry.path === path && entry.index === index;

/** The tables the collection rolls on; unusable entries are left out, and a table only once. */
export function readRandomTables(settings: TableSettings): RandomTableSource[] {
  const seen = new Set<string>();
  return storedEntries(settings).flatMap((entry) => {
    const source = readSource(entry);
    if (!source) return [];
    const key = `${source.path}#${source.index}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [source];
  });
}

/** `source` written over what the stored entry holds of this Atlas' fields, the entry's other fields kept. */
function merged(stored: unknown, source: RandomTableSource): RandomTableSource {
  const kept = isRecord(stored) ? Object.fromEntries(Object.entries(stored).filter(([key]) => !KNOWN_FIELDS.has(key))) : {};
  return { ...kept, ...source };
}

/**
 * The stored list with `source` in it: the entry for its note and table changed to it, else
 * added at the end. Every other entry stays as stored.
 */
export function withRandomTable(settings: TableSettings, source: RandomTableSource): RandomTableSource[] {
  const entries = storedEntries(settings);
  const at = entries.findIndex((entry) => sameTable(entry, source.path, source.index));
  const next = [...entries];
  if (at >= 0) next[at] = merged(entries[at], source);
  else next.push({ ...source });
  return next as RandomTableSource[];
}

/**
 * The stored list with the entry for this note and table changed by `change`, which is handed
 * the entry as stored now (not as some view last saw it); null when the list holds no such entry,
 * so a change never brings back a table removed meanwhile.
 */
export function withRandomTableChanged(
  settings: TableSettings, path: string, index: number, change: (source: RandomTableSource) => RandomTableSource,
): RandomTableSource[] | null {
  const current = readRandomTables(settings).find((source) => source.path === path && source.index === index);
  return current ? withRandomTable(settings, change(current)) : null;
}

/** The stored list without the entry for this note and table. */
export function withoutRandomTable(settings: TableSettings, path: string, index: number): RandomTableSource[] {
  return storedEntries(settings).filter((entry) => !sameTable(entry, path, index)) as RandomTableSource[];
}

/** The entry for this note and table as stored, every field kept, and its place in the list; null without one. */
export function storedRandomTable(settings: TableSettings, path: string, index: number): { entry: unknown; at: number } | null {
  const entries = storedEntries(settings);
  const at = entries.findIndex((entry) => sameTable(entry, path, index));
  return at < 0 ? null : { entry: entries[at], at };
}

/** The stored list with `entry` back at `at` (or the end), unless it holds that table again already. */
export function withRestoredRandomTable(settings: TableSettings, entry: unknown, at: number): RandomTableSource[] {
  const entries = storedEntries(settings);
  if (!isRecord(entry) || entries.some((stored) => sameTable(stored, String(entry.path), Number(entry.index)))) {
    return entries as RandomTableSource[];
  }
  const next = [...entries];
  next.splice(Math.min(at, next.length), 0, entry);
  return next as RandomTableSource[];
}

/**
 * The stored list with the notes `moved` gives a new path for following it, or null when it
 * names none of them. Every field of an entry stays.
 */
export function withMovedTableNotes(settings: TableSettings, moved: (path: string) => string | null): RandomTableSource[] | null {
  let changed = false;
  const next = storedEntries(settings).map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== 'string') return entry;
    const to = moved(entry.path);
    if (to === null) return entry;
    changed = true;
    return { ...entry, path: to };
  });
  return changed ? next as RandomTableSource[] : null;
}
