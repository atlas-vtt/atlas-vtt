/**
 * The parts every ability of an Abilities component has besides its name and
 * text ("Range", "Cost", a type picked from a list). One component has one set
 * of parts: split into tabs, every tab's list shows a property of its own, and
 * each of them holds the same parts. Pure.
 */

import { fieldByKey } from './fieldKeys';
import { updateField } from './fieldOps';
import { isAbilityTabs } from './templateGrid';
import type { EntryExtraShape, EntryShape, FieldKey, StatblockTemplate, TemplateBlock } from './templateTypes';

/** The properties an Abilities component's lists show, in tab order, each once; empty for any other block. */
export function abilityFieldKeys(block: TemplateBlock): FieldKey[] {
  if (block.type === 'entries') return [block.field];
  if (block.type !== 'tabs' || !isAbilityTabs(block)) return [];
  const keys = block.blocks.flatMap((tab) => (tab.type === 'section' && tab.blocks[0]?.type === 'entries' ? [tab.blocks[0].field] : []));
  return [...new Set(keys)];
}

function sameExtras(a: readonly EntryExtraShape[] | undefined, b: readonly EntryExtraShape[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b);
}

/**
 * The template with the parts of every property of `keys` set to the parts of
 * the first that the template has, as `edit` changes them. A property that
 * already holds them is left as it is; where nothing changes, the very
 * template comes back, so no undo step is made.
 */
export function withAbilityParts(
  template: StatblockTemplate, keys: readonly FieldKey[], edit: (extras: EntryExtraShape[]) => EntryExtraShape[],
): StatblockTemplate {
  const source = keys.map((key) => fieldByKey(template.fields, key)).find((field) => field !== undefined);
  if (!source) return template;
  const extras = edit([...(source.entry?.extras ?? [])]);
  return keys.reduce((current, key) => {
    const field = fieldByKey(current.fields, key);
    if (!field || field.type !== 'entries' || sameExtras(field.entry?.extras, extras)) return current;
    const entry: EntryShape = { ...field.entry };
    if (extras.length > 0) entry.extras = extras;
    else delete entry.extras;
    return updateField(current, field.key, { entry: Object.keys(entry).length > 0 ? entry : undefined });
  }, template);
}
