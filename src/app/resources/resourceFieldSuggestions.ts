/**
 * The statblock fields the Resources tab offers as chips: what the
 * collection's role templates define first, then what its statblocks hold.
 */

import type { StatblockTemplate, TemplateField } from '../statblocks/model/templateTypes';
import { discoverResourceFields } from './resourceFields';

/** A statblock field a resource can read. */
export interface FieldSuggestion {
  /** Dotted path, as a resource definition names it (`hp`, `stats.0`). */
  path: string;
  /** The template's name for it ("Hit Points", "STR"); unset for a field found only in statblocks. */
  label?: string;
  /** What a statblock of the collection holds there, as the setting would read it ("+3"). */
  sample?: string;
  /** One of a scores field's slots: an ability score, read as one when picked. */
  score?: boolean;
}

/** The paths of a field that hold a quantity: each slot of a Scores field, a number, or the hit points whatever their type. */
function quantityPaths(field: TemplateField): FieldSuggestion[] {
  if (field.type === 'scores') return (field.slots ?? []).map((slot, index) => ({ path: `${field.key}.${index}`, label: slot }));
  return field.type === 'number' || field.meaning === 'hit-points' ? [{ path: field.key, label: field.label }] : [];
}

/**
 * The fields of the templates that hold a quantity, each path once (the first template names it):
 * every template's hit points first, as the resource most collections track, then its other
 * quantities in form order.
 */
export function templateResourceFields(templates: readonly StatblockTemplate[]): FieldSuggestion[] {
  const offered = new Map<string, FieldSuggestion>();
  const offer = (fields: readonly TemplateField[]): void => {
    for (const suggestion of fields.flatMap(quantityPaths)) if (!offered.has(suggestion.path)) offered.set(suggestion.path, suggestion);
  };
  offer(templates.flatMap((template) => template.fields.filter((field) => field.meaning === 'hit-points')));
  for (const template of templates) offer(template.fields);
  return [...offered.values()];
}

/** The chips of the Resources tab: the role templates' quantities, then the further fields the statblocks hold. */
export function resourceFieldSuggestions(
  templates: readonly StatblockTemplate[],
  records: readonly Readonly<Record<string, unknown>>[],
): FieldSuggestion[] {
  const offered = templateResourceFields(templates);
  const known = new Set(offered.map((suggestion) => suggestion.path));
  return [...offered, ...discoverResourceFields(records).filter((path) => !known.has(path)).map((path) => ({ path }))];
}
