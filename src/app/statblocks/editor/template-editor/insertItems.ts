/**
 * What the Add bar and the insert menu offer: the seven kinds a statblock is
 * built from in the grid (a value, a metric of key numbers, a list of
 * abilities, a table, counters of limited uses, text and a divider), each with one line saying what it makes, and the small template
 * each one is previewed with: the tile it places, as it looks before it is named.
 */

import { createBlock, type AuthorableBlockType } from '../../model/blockCatalogue';
import type { BlockIdSource } from '../../model/templateIds';
import { TEMPLATE_FORMAT, TEMPLATE_VERSION, type StatblockTemplate } from '../../model/templateTypes';

export interface InsertItem {
  /** The block type it puts in. */
  type: AuthorableBlockType;
  label: string;
  /** One line saying what it makes. */
  example: string;
  /** Words it is also found by. */
  keywords: readonly string[];
}

const ITEMS: readonly InsertItem[] = [
  { type: 'stat', label: 'Value', example: 'A label and its value: Speed 30', keywords: ['stat', 'number', 'property', 'words', 'tags', 'choice'] },
  { type: 'metric', label: 'Metric', example: 'Key numbers in a box: Major 8 | Severe 15', keywords: ['numbers', 'thresholds', 'attributes', 'boxed', 'strip', 'stat'] },
  { type: 'entries', label: 'Abilities', example: 'Names with text: actions, traits, spells', keywords: ['actions', 'traits', 'features', 'list', 'spells'] },
  { type: 'scores', label: 'Table', example: 'Rows and columns, as a note\'s table', keywords: ['ability scores', 'scores', 'attributes', 'stats', 'columns', 'rows', 'grid'] },
  { type: 'counters', label: 'Counters', example: 'Limited uses as pips: spell slots, ki', keywords: ['spell slots', 'slots', 'uses', 'charges', 'ki', 'points', 'rest', 'pips', 'resources'] },
  { type: 'text', label: 'Text', example: 'A paragraph', keywords: ['description', 'notes', 'paragraph'] },
  { type: 'divider', label: 'Divider', example: 'A line across', keywords: ['rule', 'separator'] },
];

/** The item that puts a block of `type` in; a type the grid offers no kind for is offered as a Value. */
export function insertItemFor(type: AuthorableBlockType): InsertItem {
  return ITEMS.find((item) => item.type === type) ?? ITEMS[0]!;
}

export function itemKey(item: InsertItem): string {
  return `block:${item.type}`;
}

/** The seven kinds, in the order the Add bar shows them. */
export function insertItems(): readonly InsertItem[] {
  return ITEMS;
}

/** The items whose name, line or other words hold every word typed, in any case ("score" finds Table). */
export function findItems(items: readonly InsertItem[], query: string): InsertItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = `${item.label} ${item.example} ${item.keywords.join(' ')}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/**
 * Which of the items found the keys start on: one named exactly what was typed ("text" is Text, not Heading),
 * else the first whose name starts with it, else the first.
 */
export function bestMatch(items: readonly InsertItem[], query: string): number {
  const typed = query.trim().toLowerCase();
  if (!typed) return 0;
  const exact = items.findIndex((item) => item.label.toLowerCase() === typed);
  if (exact !== -1) return exact;
  return Math.max(items.findIndex((item) => item.label.toLowerCase().startsWith(typed)), 0);
}

function previewIds(): BlockIdSource {
  let next = 0;
  return () => `preview${(next++).toString(36)}`;
}

/** A one-column template holding just the tile the item places, as it is placed: not named yet. */
export function previewTemplate(item: InsertItem): StatblockTemplate {
  return { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'preview', fields: [], layout: { maxColumns: 1, blocks: [createBlock(item.type, previewIds())] } };
}
