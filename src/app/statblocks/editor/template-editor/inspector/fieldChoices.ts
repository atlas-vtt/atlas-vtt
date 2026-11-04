/**
 * What the inspector's field picker offers (§7.4), as pure functions: this
 * template's fields, the keys the collection's statblocks use that the
 * template has not taken, and a new field named as typed. Choosing one of the
 * last two adds the field, so binding to a key the notes already use is how
 * imported statblocks keep their data.
 */

import { fieldKeysOf, keyProblem, labelFromKey, labelToKey } from '../../../model/fieldKeys';
import { addField } from '../../../model/fieldOps';
import type { FieldKey, FieldType, StatblockTemplate } from '../../../model/templateTypes';
import type { CollectionFieldKeys } from '../useCollectionFieldKeys';
import { t } from '../../../../i18n';

export type FieldChoice =
  | { kind: 'field'; key: FieldKey; label: string; type: FieldType }
  | { kind: 'collection'; key: FieldKey; label: string; count: number }
  | { kind: 'new'; key: FieldKey; label: string };

export interface FieldChoiceGroup {
  id: 'template' | 'collection' | 'new';
  /** The group's heading; the new field's row stands alone. */
  label: string | null;
  choices: FieldChoice[];
}

/** The collection's keys the list offers at most, the most used first. */
const COLLECTION_SHOWN = 30;

function matches(query: string, ...texts: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = texts.join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The collection's own spelling of a key, matched without regard to case. */
function inCollection(keys: CollectionFieldKeys, wanted: FieldKey): FieldKey | null {
  const lower = wanted.toLowerCase();
  for (const key of keys.keys()) if (key.toLowerCase() === lower) return key;
  return null;
}

/**
 * The key a new field named `label` gets: the collection's key where the
 * label names one the template has not taken, else a key free in both.
 */
export function newFieldKey(template: StatblockTemplate, label: string, collectionKeys: CollectionFieldKeys): FieldKey {
  const taken = fieldKeysOf(template.fields);
  const known = inCollection(collectionKeys, labelToKey(label, []));
  if (known && keyProblem(known, taken) === null) return known;
  return labelToKey(label, [...taken, ...collectionKeys.keys()]);
}

/**
 * The picker's groups for what has been typed. `accepts` limits this
 * template's fields to the types the place takes (null: any); `allowNew`
 * offers fields the template does not have yet.
 */
export function fieldChoiceGroups(
  template: StatblockTemplate, query: string, accepts: readonly FieldType[] | null,
  collectionKeys: CollectionFieldKeys, allowNew: boolean,
): FieldChoiceGroup[] {
  const own: FieldChoice[] = template.fields
    .filter((field) => (accepts === null || accepts.includes(field.type)) && matches(query, field.label, field.key))
    .map((field) => ({ kind: 'field', key: field.key, label: field.label || field.key, type: field.type }));
  const taken = new Set([...fieldKeysOf(template.fields)].map((key) => key.toLowerCase()));
  const used: FieldChoice[] = allowNew
    ? [...collectionKeys]
      .filter(([key]) => !taken.has(key.toLowerCase()) && keyProblem(key, []) === null && matches(query, key, labelFromKey(key)))
      .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
      .slice(0, COLLECTION_SHOWN)
      .map(([key, count]) => ({ kind: 'collection', key, label: labelFromKey(key), count }))
    : [];
  const typed = query.trim();
  const named = template.fields.some((field) => field.label.toLowerCase() === typed.toLowerCase());
  const fresh: FieldChoice[] = allowNew && typed && !named
    ? [{ kind: 'new', key: newFieldKey(template, typed, collectionKeys), label: typed }]
    : [];
  const groups: FieldChoiceGroup[] = [
    { id: 'template', label: t('templateEditor.thisTemplate'), choices: own },
    { id: 'collection', label: t('templateEditor.usedInCollection'), choices: used },
    { id: 'new', label: null, choices: fresh },
  ];
  return groups.filter((group) => group.choices.length > 0);
}

/**
 * The template holding the chosen field, and its key: a new field of `type`
 * is added for a key of the collection or a typed label. Null where the
 * template cannot take it (a reserved or malformed key).
 */
export function withChosenField(
  template: StatblockTemplate, choice: FieldChoice, type: FieldType,
): { template: StatblockTemplate; key: FieldKey } | null {
  if (template.fields.some((field) => field.key === choice.key)) return { template, key: choice.key };
  if (choice.kind === 'field') return null;
  const next = addField(template, { key: choice.key, label: choice.label, type });
  return next === template ? null : { template: next, key: choice.key };
}
