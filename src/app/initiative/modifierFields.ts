/**
 * Where a field the initiative rules name lies in a statblock: its key in any spelling
 * (`Perception`, `perception`), else the field its template labels so ("Initiative", a score's
 * "Dex"), else, in a Fantasy Statblocks statblock, the score its `stats` list keeps under that
 * name (`dex`, `stats.dex`: the six scores in order, as the bundled SRD and layouts keep them).
 */

import { normalizedKey, resolveField } from '../resources/resourceFields';
import type { StatblockFields } from '../resources/statblockResourceSync';
import type { TemplateField } from '../statblocks/model/templateTypes';

/** A field's path by its label, written without case and spaces: whether it is one of a scores field's slots. */
export interface LabelledPath {
  path: string;
  score: boolean;
}

export type FieldLabels = Readonly<Record<string, LabelledPath>>;

/** A statblock as initiative reads it: its fields, meanings, labels and where it comes from. */
export interface ModifierStatblock extends StatblockFields {
  /** The labels of its template's fields (`labelsOf`); none for Fantasy Statblocks' statblocks. */
  labels?: FieldLabels;
  /** A Fantasy Statblocks statblock: `modifier` is its initiative modifier, `stats` its six scores. */
  fantasy?: boolean;
}

/** A value found for a field, and whether it was found as an ability score. */
export interface FoundValue {
  value: unknown;
  score: boolean;
}

/** The labels of a template's fields, and the names of its scores' slots, each to its path; the first field wins a label. */
export function labelsOf(fields: readonly TemplateField[]): FieldLabels {
  const labels: Record<string, LabelledPath> = {};
  const add = (label: string | undefined, path: string, score: boolean): void => {
    const key = label ? normalizedKey(label) : '';
    if (key && !(key in labels)) labels[key] = { path, score };
  };
  for (const field of fields) add(field.label, field.key, false);
  for (const field of fields) {
    if (field.type !== 'scores') continue;
    (field.slots ?? []).forEach((slot, index) => add(slot, `${field.key}.${index}`, true));
    (field.slotKeys ?? []).forEach((slot, index) => add(slot, `${field.key}.${index}`, true));
  }
  return labels;
}

/** The six scores of Fantasy Statblocks' `stats`, in their order, by short and long name. */
const FANTASY_SCORES: readonly (readonly string[])[] = [
  ['str', 'strength'], ['dex', 'dexterity'], ['con', 'constitution'],
  ['int', 'intelligence'], ['wis', 'wisdom'], ['cha', 'charisma'],
];

function fantasyScore(statblock: ModifierStatblock, name: string): unknown {
  const stats = resolveField(statblock.fields, 'stats');
  if (!statblock.fantasy || !Array.isArray(stats) || stats.length !== FANTASY_SCORES.length) return undefined;
  const index = FANTASY_SCORES.findIndex((names) => names.includes(normalizedKey(name)));
  return index < 0 ? undefined : stats[index];
}

/** The value of `field` in `statblock` (see the file's comment); undefined where none of the ways finds one. */
export function findModifierField(statblock: ModifierStatblock, field: string): FoundValue | undefined {
  const own = resolveField(statblock.fields, field, statblock.meanings);
  if (own !== undefined) return { value: own, score: false };

  const parts = field.split('.').map((part) => part.trim()).filter(Boolean);
  const [head, ...rest] = parts;
  if (head === undefined) return undefined;
  const labelled = statblock.labels?.[normalizedKey(head)];
  if (labelled) {
    const value = resolveField(statblock.fields, [labelled.path, ...rest].join('.'), statblock.meanings);
    if (value !== undefined) return { value, score: labelled.score && rest.length === 0 };
  }

  // `dex`, or `stats.dex` as people write it for the SRD's list of scores
  const scoreName = parts.length === 1 ? head : parts.length === 2 && normalizedKey(head) === 'stats' ? rest[0]! : null;
  const score = scoreName === null ? undefined : fantasyScore(statblock, scoreName);
  return score === undefined ? undefined : { value: score, score: true };
}
