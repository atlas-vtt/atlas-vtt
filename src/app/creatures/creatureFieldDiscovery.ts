import type { CreatureFilterKind } from '../types/creatureFilterTypes';
import type { IndexedCreature } from './CreatureIndex';
import { formatRating, optionKey, parseOptions, parseRating } from './creatureValues';
import { IGNORED_FIELDS } from './ignoredFields';

/** A statblock field worth filtering by, as found in a collection's statblocks. */
export interface DiscoveredField {
  field: string;
  /** The name a role template gives the field; unset for a field found only in statblocks. */
  label?: string;
  /** Statblocks with a value for it. */
  count: number;
  /** A scale when nearly every value is a number, otherwise categories. */
  kind: CreatureFilterKind;
  /** A few values it holds, as the filter will show them. */
  samples: string[];
}

export { IGNORED_FIELDS };

/** Values that are a rating and nothing else: "3", "1/4", "½", "Creature 3", "3+1*", "7 (2d6)", "+2". */
const RATING_ONLY = /^\s*(?:\p{L}+\s+)?(?:[-−+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])(?:\s*[+\-−]\s*\d+)?\**(?:\s*\([^)]*\))?\s*$/u;
/** Share of values that must be ratings for a field to be a scale. */
const RANGE_SHARE = 0.8;
/** More distinct values than this are free text, not categories. */
const MAX_CATEGORIES = 60;
const SAMPLE_COUNT = 3;

function looksLikeRating(value: unknown): boolean {
  return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && RATING_ONLY.test(value));
}

/** Objects and lists of objects are structured blocks (actions, traits); lists of numbers are stat arrays. */
function isStructured(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => typeof item === 'object' && item !== null) || (value.length > 1 && value.every((item) => typeof item === 'number'));
  return typeof value === 'object' && value !== null;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function describe(field: string, values: readonly unknown[]): DiscoveredField | null {
  if (values.some(isStructured)) return null;

  if (values.filter(looksLikeRating).length >= values.length * RANGE_SHARE) {
    const ratings = [...new Set(values.map(parseRating).filter((rating): rating is number => rating !== null))].sort((a, b) => a - b);
    const samples = ratings.length <= SAMPLE_COUNT ? ratings : [ratings[0]!, ratings[Math.floor(ratings.length / 2)]!, ratings.at(-1)!];
    return { field, count: values.length, kind: 'range', samples: samples.map(formatRating) };
  }

  const counts = new Map<string, { label: string; count: number }>();
  for (const label of values.flatMap(parseOptions)) {
    const key = optionKey(label);
    const entry = counts.get(key) ?? { label, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  if (counts.size === 0 || counts.size > MAX_CATEGORIES) return null;
  const samples = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, SAMPLE_COUNT).map((entry) => entry.label);
  return { field, count: values.length, kind: 'options', samples };
}

/**
 * The fields of `creatures` that make useful filters, the most common first:
 * numeric scales (CR, level, tier) and short categories (type, role, source).
 * Structured blocks, stat arrays and free text are left out.
 */
export function discoverCreatureFields(creatures: readonly IndexedCreature[]): DiscoveredField[] {
  const valuesByField = new Map<string, unknown[]>();
  for (const creature of creatures) {
    for (const [field, value] of Object.entries(creature.fields)) {
      if (IGNORED_FIELDS.has(field) || isEmpty(value)) continue;
      const values = valuesByField.get(field) ?? [];
      values.push(value);
      valuesByField.set(field, values);
    }
  }
  return [...valuesByField.entries()]
    .map(([field, values]) => describe(field, values))
    .filter((field): field is DiscoveredField => field !== null)
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
}

/** How many of `creatures` have a value in any of `fields`. */
export function countCreaturesWith(creatures: readonly IndexedCreature[], fields: readonly string[]): number {
  return creatures.filter((creature) => fields.some((field) => !isEmpty(creature.fields[field]))).length;
}
