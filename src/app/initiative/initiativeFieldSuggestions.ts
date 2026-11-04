/**
 * The statblock fields the initiative settings offer for the modifier, each with what a statblock
 * of the collection holds there: what the templates mean as initiative first, then their numbers,
 * then their other fields that hold a modifier in a statblock (Perception kept as entries), then
 * the slots of their scores and the SRD's DEX (read as ability scores), then the further fields
 * the statblocks hold that read as a modifier.
 */

import { discoverFields } from '../resources/resourceFields';
import type { FieldSuggestion } from '../resources/resourceFieldSuggestions';
import type { StatblockTemplate, TemplateField } from '../statblocks/model/templateTypes';
import { t } from '../i18n';
import { findModifierField, type ModifierStatblock } from './modifierFields';
import { holdsModifier, statblockModifierValue } from './modifierValue';

/** Fantasy Statblocks' `stats` hold the six scores in order: DEX is the second. */
const FANTASY_DEX = 'stats.1';

const signed = (modifier: number): string => (modifier < 0 ? `−${-modifier}` : `+${modifier}`);

/** The modifier the first statblock holding one gives at `path`, written signed. */
function sampleAt(statblocks: readonly ModifierStatblock[], path: string, score: boolean): string | undefined {
  for (const statblock of statblocks) {
    const found = findModifierField(statblock, path);
    const modifier = found ? statblockModifierValue(found.value, score || found.score) : null;
    if (modifier !== null) return signed(modifier);
  }
  return undefined;
}

const holdsSixScores = (statblock: ModifierStatblock): boolean =>
  statblock.fantasy === true && Array.isArray(statblock.fields.stats) && statblock.fields.stats.length === 6;

export function initiativeFieldSuggestions(
  templates: readonly StatblockTemplate[],
  statblocks: readonly ModifierStatblock[],
): FieldSuggestion[] {
  const fields = templates.flatMap((template) => template.fields);
  const offered = new Map<string, FieldSuggestion>();
  const offer = (path: string, label: string | undefined, score = false): void => {
    if (offered.has(path)) return;
    const sample = sampleAt(statblocks, path, score);
    offered.set(path, { path, ...(label && { label }), ...(score && { score: true }), ...(sample && { sample }) });
  };
  const ofField = (field: TemplateField): void => offer(field.key, field.label);

  fields.filter((field) => field.meaning === 'initiative').forEach(ofField);
  fields.filter((field) => field.type === 'number').forEach(ofField);
  const holdsSomewhere = (field: TemplateField): boolean => statblocks.some((statblock) => {
    const found = findModifierField(statblock, field.key);
    return found !== undefined && holdsModifier(found.value);
  });
  fields.filter((field) => field.type !== 'scores' && holdsSomewhere(field)).forEach(ofField);
  const scores = new Set<string>();
  for (const field of fields) {
    if (field.type !== 'scores') continue;
    scores.add(field.key);
    (field.slots ?? []).forEach((slot, index) => offer(`${field.key}.${index}`, slot, true));
  }
  if (statblocks.some(holdsSixScores)) {
    scores.add('stats');
    offer(FANTASY_DEX, t('initiative.fantasyDex'), true);
  }

  // A field found holds what lies inside it: its entries and their texts are not offered again
  const found = discoverFields(statblocks.map((statblock) => statblock.fields), holdsModifier);
  const within = (path: string, parent: string): boolean => path.startsWith(`${parent}.`);
  const kept: string[] = [];
  for (const path of found) {
    if ([...scores].some((parent) => within(path, parent)) || kept.some((parent) => within(path, parent))) continue;
    kept.push(path);
    offer(path, undefined);
  }
  return [...offered.values()];
}
