/**
 * The creature filters of a collection: Atlas' own filters on the common
 * statblock fields (`CATALOG_CREATURE_FILTERS`) minus those the collection
 * switched off, then the collection's filters on fields of its own.
 */

import { isRecord } from '../utils/guards';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { CreatureFilterDefinition, CreatureFilterKind } from '../types/creatureFilterTypes';
import { CATALOG_CREATURE_FILTERS } from './creatureFieldCatalog';

function fieldName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseFilter(raw: unknown): CreatureFilterDefinition | null {
  if (!isRecord(raw)) return null;
  const id = fieldName(raw.id);
  if (!id || typeof raw.label !== 'string') return null;
  const label = raw.label.trim();
  if (raw.kind === 'range') {
    const field = fieldName(raw.field);
    return field ? { id, label: label || field, kind: 'range', field } : null;
  }
  if (raw.kind !== 'options' || !Array.isArray(raw.fields)) return null;
  const fields = [...new Set(raw.fields.map(fieldName).filter((field): field is string => field !== null))];
  return fields.length > 0 ? { id, label: label || fields[0]!, kind: 'options', fields } : null;
}

/**
 * Filters stored by any Atlas version, in a collection or a bundle:
 * entries that cannot be used (an unknown kind from a newer version, no field)
 * are left out, and a repeated id keeps its first entry.
 */
export function parseCreatureFilters(raw: unknown): CreatureFilterDefinition[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const filter = parseFilter(entry);
    if (!filter || seen.has(filter.id)) return [];
    seen.add(filter.id);
    return [filter];
  });
}

/** A new filter id, unique among `existing`. */
export function newCreatureFilterId(existing: readonly CreatureFilterDefinition[], base: string): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'filter';
  const taken = new Set(existing.map((filter) => filter.id));
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/** A label for a statblock field: short keys are abbreviations ("cr" is "CR"), others read as words ("hit_dice" is "Hit dice"). */
export function fieldLabel(field: string): string {
  const words = field.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (words.length <= 3) return words.toUpperCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A filter on one statblock field, labelled after it. */
export function filterForField(
  existing: readonly CreatureFilterDefinition[],
  field: string,
  kind: CreatureFilterKind,
): CreatureFilterDefinition {
  const id = newCreatureFilterId(existing, field);
  const label = fieldLabel(field);
  return kind === 'range' ? { id, label, kind, field } : { id, label, kind, fields: [field] };
}

/** The filter as the other kind, keeping its (first) field. */
export function withFilterKind(filter: CreatureFilterDefinition, kind: CreatureFilterKind): CreatureFilterDefinition {
  if (filter.kind === kind) return filter;
  const { id, label } = filter;
  return filter.kind === 'range'
    ? { id, label, kind: 'options', fields: [filter.field] }
    : { id, label, kind: 'range', field: filter.fields[0] ?? '' };
}

/** The statblock fields a filter reads. */
export function filterFields(filter: CreatureFilterDefinition): readonly string[] {
  return filter.kind === 'range' ? [filter.field] : filter.fields;
}

/** Whether a filter names a field to read; one without cannot be saved. */
export function isCompleteCreatureFilter(filter: CreatureFilterDefinition): boolean {
  return filterFields(filter).some((field) => field.trim() !== '');
}

const CATALOG_IDS = new Set(CATALOG_CREATURE_FILTERS.map((filter) => filter.id));

/** The ids of catalog filters a collection switched off, as stored by any Atlas version. */
export function parseHiddenCreatureFilters(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === 'string' && CATALOG_IDS.has(id)))] : [];
}

/** The filters a collection offers: the catalog's that it keeps on, then its own. */
export function collectionCreatureFilters(
  settings: Pick<CollectionSettings, 'customCreatureFilters' | 'hiddenCreatureFilters'>,
): CreatureFilterDefinition[] {
  const hidden = new Set(parseHiddenCreatureFilters(settings.hiddenCreatureFilters));
  const custom = parseCreatureFilters(settings.customCreatureFilters).filter((filter) => !CATALOG_IDS.has(filter.id));
  return [...CATALOG_CREATURE_FILTERS.filter((filter) => !hidden.has(filter.id)), ...custom];
}
