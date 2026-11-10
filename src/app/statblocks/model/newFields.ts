/**
 * The property a block gets when it is first named: its type follows the
 * block, and a Table's starts with the table a new one has (`newTable`). The
 * template editor makes it when a tile is named (`labelCommit.ts`), and the
 * card draws a tile not named yet as if it showed one already
 * (`render/provisionalSheet.ts`), so naming changes the tile's words and
 * nothing of its shape. Pure.
 */

import { newTable } from './tableColumns';
import type { FieldKey, FieldType, TemplateBlock, TemplateField } from './templateTypes';

/** The type a new field gets from the block that names it; the tile's Kind of value changes it. */
const NEW_FIELD_TYPES: Partial<Record<TemplateBlock['type'], FieldType>> = {
  stat: 'text', metric: 'number', line: 'text', title: 'text', tags: 'list', pairs: 'pairs', track: 'number',
  counters: 'counters', scores: 'scores', entries: 'entries', spells: 'spells', text: 'markdown', image: 'image',
};

/** The field `block` gets when it is named `label` under `key`; null for a block that shows no field. */
export function newFieldFor(block: TemplateBlock, key: FieldKey, label: string): TemplateField | null {
  const type = NEW_FIELD_TYPES[block.type];
  if (!type) return null;
  return { key, label, type, ...(type === 'scores' && newTable()) };
}
