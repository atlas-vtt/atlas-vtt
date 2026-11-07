import type { StatblockTemplate } from '../statblocks/model/templateTypes';
import type { CreatureFilterDefinition } from '../types/creatureFilterTypes';
import { IGNORED_FIELDS } from './ignoredFields';
import { filterKind } from './templateFilterFields';

/** A field key as a filter id, which the search also takes as its keyword (`ac>=15`). */
function filterIdOf(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+|-+$/g, '');
}

/**
 * The filters the collection's statblock templates give: a range for every number and rating
 * field, options for every choice and list, and for text fields that hold a category by their
 * meaning (size, creature type, traits). A template declares what each field holds, so these
 * are never guessed from values. A field a filter of `existing` already reads gives none, nor does
 * one whose id `existing` holds; each field counts once, for the first template that has it.
 */
export function templateCreatureFilters(
  templates: readonly StatblockTemplate[],
  existing: readonly CreatureFilterDefinition[],
): CreatureFilterDefinition[] {
  const readFields = new Set(existing.flatMap((filter) => (filter.kind === 'range' ? [filter.field] : filter.fields)));
  const ids = new Set(existing.map((filter) => filter.id));
  const filters: CreatureFilterDefinition[] = [];
  for (const field of templates.flatMap((template) => template.fields)) {
    const kind = filterKind(field);
    const id = filterIdOf(field.key);
    if (!kind || !id || IGNORED_FIELDS.has(field.key) || readFields.has(field.key) || ids.has(id)) continue;
    readFields.add(field.key);
    ids.add(id);
    const label = field.label.trim() || field.key;
    filters.push(kind === 'range'
      ? { id, label, kind, field: field.key, origin: 'template' }
      : { id, label, kind, fields: [field.key], origin: 'template' });
  }
  return filters;
}
