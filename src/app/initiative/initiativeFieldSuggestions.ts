/**
 * The statblock fields the initiative settings offer for the modifier, never one a template means
 * as hit points, armour or a rating: what the templates mean as initiative first (`recommended`),
 * then their numbers, then their other fields that hold a modifier in a statblock (Perception kept as entries), then
 * the slots of their scores and the SRD's DEX (read as ability scores), then the further fields
 * the statblocks hold that read as a modifier.
 */

import { discoverFields } from '../resources/resourceFields';
import type { FieldSuggestion } from '../resources/resourceFieldSuggestions';
import type { FieldMeaning, StatblockTemplate, TemplateField } from '../statblocks/model/templateTypes';
import { t } from '../i18n';
import { findModifierField, type ModifierStatblock } from './modifierFields';
import { holdsModifier } from './modifierValue';

/** Fantasy Statblocks' `stats` hold the six scores in order: DEX is the second. */
const FANTASY_DEX = 'stats.1';

/** What a template means by these fields is never a modifier, whatever number a statblock holds there. */
const NOT_A_MODIFIER: ReadonlySet<FieldMeaning> = new Set(['hit-points', 'armor', 'rating']);

const holdsSixScores = (statblock: ModifierStatblock): boolean =>
  statblock.fantasy === true && Array.isArray(statblock.fields.stats) && statblock.fields.stats.length === 6;

export function initiativeFieldSuggestions(
  templates: readonly StatblockTemplate[],
  statblocks: readonly ModifierStatblock[],
): FieldSuggestion[] {
  const fields = templates.flatMap((template) => template.fields);
  const notModifiers = new Set(fields.filter(({ meaning }) => meaning !== undefined && NOT_A_MODIFIER.has(meaning)).map(({ key }) => key));
  const offered = new Map<string, FieldSuggestion>();
  const offer = (path: string, label: string | undefined, score = false, recommended = false): void => {
    if (offered.has(path) || notModifiers.has(path)) return;
    offered.set(path, { path, ...(label && { label }), ...(score && { score: true }), ...(recommended && { recommended: true as const }) });
  };
  const ofField = (field: TemplateField): void => offer(field.key, field.label);

  fields.filter((field) => field.meaning === 'initiative').forEach((field) => offer(field.key, field.label, false, true));
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
