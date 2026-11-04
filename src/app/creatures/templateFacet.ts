/**
 * The creature filters' "Template" facet (id `LAYOUT_FACET`): the template or
 * Fantasy Statblocks layout a token's statblock renders with.
 */

import type { OptionValue, TokenFacts } from './creatureFacts';

/** Prefix of the key of a native template's option; a Fantasy Statblocks layout's key is its name. */
const NATIVE_TEMPLATE_KEY = 'atlas-template:';

/**
 * A token's option in the facet: the name its statblock's template or layout has (`lookName`),
 * keyed by source and name, so a layout and a native template of one name are two options.
 */
export function templateOptions(facts: TokenFacts): readonly OptionValue[] {
  const name = facts.creature?.lookName;
  if (!name) return [];
  return [{ key: facts.creature?.templateId ? `${NATIVE_TEMPLATE_KEY}${name}` : name, label: name }];
}

/** The label of a picked option no token in view has: its key, a native template's without the prefix. */
export function pickedOptionLabel(key: string): string {
  return key.startsWith(NATIVE_TEMPLATE_KEY) ? key.slice(NATIVE_TEMPLATE_KEY.length) : key;
}
