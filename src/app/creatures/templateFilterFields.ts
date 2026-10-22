/**
 * The statblock fields the Creature Filters tab suggests: what the
 * collection's role templates define first, under the templates' names, then
 * what its statblocks hold (`discoverCreatureFields`).
 */

import type { FieldMeaning, StatblockTemplate, TemplateField } from '../statblocks/model/templateTypes';
import type { CreatureFilterKind } from '../types/creatureFilterTypes';
import type { IndexedCreature } from './CreatureIndex';
import { countCreaturesWith, discoverCreatureFields, IGNORED_FIELDS, type DiscoveredField } from './creatureFieldDiscovery';

const SAMPLE_COUNT = 3;
/** Text fields that hold a category, by what the template says they mean. */
const CATEGORY_MEANINGS: ReadonlySet<FieldMeaning> = new Set(['creature-type', 'size', 'traits']);

/** How a template field filters: a scale for ratings and numbers, options for choices, lists and categories; null for the rest. */
export function filterKind(field: TemplateField): CreatureFilterKind | null {
  if (field.type === 'rating' || field.type === 'number') return 'range';
  if (field.type === 'choice' || field.type === 'list') return 'options';
  return field.type === 'text' && field.meaning && CATEGORY_MEANINGS.has(field.meaning) ? 'options' : null;
}

/**
 * A template field as a suggestion: its kind from the template, its values from the statblocks
 * where they have it, else a choice's own options.
 */
function suggestion(field: TemplateField, kind: CreatureFilterKind, found: DiscoveredField | undefined, creatures: readonly IndexedCreature[]): DiscoveredField {
  const samples = found?.kind === kind ? found.samples : field.type === 'choice' ? (field.options ?? []).slice(0, SAMPLE_COUNT) : [];
  return { field: field.key, label: field.label, count: countCreaturesWith(creatures, [field.key]), kind, samples };
}

/**
 * The fields worth filtering the collection's characters by: those of its role templates (each
 * key once, the first template naming it), then the further fields its statblocks hold.
 */
export function suggestedFilterFields(templates: readonly StatblockTemplate[], creatures: readonly IndexedCreature[]): DiscoveredField[] {
  const discovered = discoverCreatureFields(creatures);
  const byField = new Map(discovered.map((field) => [field.field, field]));
  const suggested = new Map<string, DiscoveredField>();
  for (const field of templates.flatMap((template) => template.fields)) {
    const kind = filterKind(field);
    if (!kind || IGNORED_FIELDS.has(field.key) || suggested.has(field.key)) continue;
    suggested.set(field.key, suggestion(field, kind, byField.get(field.key), creatures));
  }
  return [...suggested.values(), ...discovered.filter((field) => !suggested.has(field.field))];
}
