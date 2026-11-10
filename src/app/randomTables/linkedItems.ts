/**
 * The items of an Items table's rows. Headers map to Name, Type, Rarity, Price
 * and Description as a loot base's properties do (`toLootItems`), the other
 * columns become properties. A Name cell that is only a link to a note
 * (`[[Rope of Climbing]]`) makes the row that note's item: its frontmatter is
 * read like a base entry's properties, and the row's own cells win where both
 * have a value. Pure: the frontmatter comes in already read.
 */

import { boundedFields, valueText } from '../creatures/statblockValues';
import { roleProperties, toLootItems, type LootItem, type LootQueryEntry } from '../loot/lootItem';
import { plainCell } from './dieRanges';
import type { RandomTable, TableRow } from './tableModel';

/** What a row's item note holds, read through Obsidian's metadata cache. */
export interface LinkedItemNote {
  path: string;
  /** The note's name. */
  name: string;
  /** Its frontmatter as the cache holds it, unchecked. */
  frontmatter: unknown;
}

/** Properties an item carries, as the player page takes them. */
const MAX_PROPERTIES = 16;
const NAME_LINK = /^\[\[([^[\]|#\n]{1,500})(?:#[^[\]|\n]*)?(?:\|([^[\]\n]{1,500}))?\]\]$/;

/** The note a Name cell names when it holds nothing but a link, and the alias it shows. */
export function nameLink(cell: string): { link: string; alias?: string } | null {
  const match = NAME_LINK.exec(cell.trim());
  if (!match) return null;
  const alias = match[2]?.trim();
  return { link: match[1]!.trim(), ...(alias && { alias }) };
}

/** A row column's property id: unique per column, its key the header so roles are read by name. */
const columnId = (column: number, header: string): string => `column${column}.${header}`;
const noteId = (key: string): string => `note.${key}`;

/** The frontmatter's values as text, bounded as statblock values are. */
function noteValues(frontmatter: unknown): [string, string][] {
  return Object.entries(boundedFields(frontmatter)).flatMap(([key, value]) => {
    const text = valueText(value).trim();
    return text ? [[key, text]] : [];
  });
}

/**
 * The item a row of an Items table stands for. `notePath` is the table's note, `source` the
 * note's and the table's name as results show them; `linked` the note its Name cell links to,
 * when that note was found.
 */
export function tableRowItem(table: RandomTable, row: TableRow, notePath: string, source: readonly [string, string], linked: LinkedItemNote | null): LootItem {
  const nameCell = row.cells[0] ?? '';
  const link = nameLink(nameCell);
  const name = linked ? link?.alias ?? linked.name : plainCell(nameCell.replace(/\*\*|__/g, ''));

  const values: Record<string, string> = {};
  const displayNames: Record<string, string> = {};
  const rowIds: string[] = [];
  const headers = new Set<string>();
  table.columns.forEach((header, column) => {
    const cell = row.cells[column]?.trim();
    if (column === 0 || !cell) return;
    const id = columnId(column, header);
    rowIds.push(id);
    values[id] = cell;
    displayNames[id] = header;
    headers.add(header.trim().toLowerCase());
  });
  const rowRoles = new Set(Object.keys(roleProperties(rowIds)));
  // A note value the row gives too, by its column or its role, is the row's.
  const noteIds = (linked ? noteValues(linked.frontmatter) : []).flatMap(([key, text]) => {
    const id = noteId(key);
    const roles = Object.keys(roleProperties([id]));
    if (headers.has(key.toLowerCase()) || roles.some((role) => rowRoles.has(role))) return [];
    values[id] = text;
    displayNames[id] = key;
    return [id];
  });

  const entry: LootQueryEntry = { path: linked?.path ?? notePath, name, values };
  const [item] = toLootItems({ entries: [entry], order: [...rowIds, ...noteIds], displayNames }, [...source]);
  return { ...item!, properties: item!.properties.slice(0, MAX_PROPERTIES) };
}
