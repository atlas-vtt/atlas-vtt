import { IGNORED_FIELDS } from '../creatures/creatureFieldDiscovery';
import { NO_MEANINGS, type FieldMeanings } from '../statblocks/resolve/fieldMeanings';
import { clampValue } from './resourceValues';
import type { ResourceValue } from './resourceTypes';

/** A statblock key without case, spaces, underscores and hyphens: `Max Stress` and `max_stress` are one field. */
export const normalizedKey = (key: string): string => key.toLowerCase().replace(/[\s_-]/g, '');

/** The usual names of hit points, without case or separators. */
export const HIT_POINT_KEYS: readonly string[] = ['hp', 'health', 'hitpoints'];

/** Whether a statblock key or label ("hp", "Hit Points:", "Health") names hit points. */
export function isHitPointsKey(key: string): boolean {
  return HIT_POINT_KEYS.includes(normalizedKey(key.replace(/:\s*$/, '')));
}

/** The key that holds hit points under another name: the template's `hit-points` field, else one of their usual names. */
function hitPointsKey(keys: readonly string[], meanings: FieldMeanings): string | undefined {
  const meant = meanings['hit-points'];
  return meant !== undefined && keys.includes(meant) ? meant : keys.find(isHitPointsKey);
}

/**
 * The key of `record` that `key` reads: the exact key, else one spelled differently
 * (`Max Stress` for `max_stress`), else, for hit points, the field the
 * statblock's template means as its hit points or any of their usual names.
 */
export function matchingKey(record: Readonly<Record<string, unknown>>, key: string, meanings: FieldMeanings = NO_MEANINGS): string | undefined {
  if (key in record) return key;
  const wanted = normalizedKey(key);
  const keys = Object.keys(record);
  return keys.find((candidate) => normalizedKey(candidate) === wanted)
    ?? (isHitPointsKey(key) ? hitPointsKey(keys, meanings) : undefined);
}

/** The value under the key `key` reads (`matchingKey`). */
function lookup(record: Record<string, unknown>, key: string, meanings: FieldMeanings): unknown {
  const match = matchingKey(record, key, meanings);
  return match === undefined ? undefined : record[match];
}

/**
 * Reads a dotted path (`stats.0`, `resources.mana`) from a statblock record.
 * `meanings` are those of the record's template (`ResolvedStatblock.meanings`);
 * they apply to the record's own keys, not to keys inside its values.
 */
export function resolveField(record: Readonly<Record<string, unknown>>, path: string, meanings: FieldMeanings = NO_MEANINGS): unknown {
  const parts = path.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  let value: unknown = record;
  for (const [index, part] of parts.entries()) {
    if (Array.isArray(value)) value = /^\d+$/.test(part) ? value[Number(part)] : undefined;
    else if (value !== null && typeof value === 'object') value = lookup(value as Record<string, unknown>, part, index === 0 ? meanings : NO_MEANINGS);
    else return undefined;
  }
  return value;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Only concrete quantities: never rolls a dice expression or guesses from prose. */
export function parseResourceValue(value: unknown, spent = false): ResourceValue | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const max = numeric(record.max);
    const current = numeric(record.current ?? record.value ?? (spent ? 0 : max));
    return max !== null && current !== null ? clampValue({ current, max }) : null;
  }
  if (typeof value === 'string') {
    const fraction = value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fraction) return parseResourceValue({ current: fraction[1], max: fraction[2] });
    // A number with a note in brackets: hit points and their hit dice ("45 (6d10+12)"), an armour class and its armour ("15 (natural armor)").
    const noted = value.trim().match(/^(\d+(?:\.\d+)?)\s*\([^()]*\)$/);
    if (noted) value = noted[1];
  }
  const max = numeric(value);
  return max === null ? null : { current: spent ? 0 : max, max };
}

/** How deep `discoverFields` looks: a field, a list entry (`stats.0`), a record inside a record. */
const DISCOVERY_DEPTH = 2;

/**
 * The fields of the given statblocks whose values `accepts`, as dotted paths a setting can
 * name. Fields that identify or render a statblock (`mtime`, `columns`) are left out.
 */
export function discoverFields(records: readonly Readonly<Record<string, unknown>>[], accepts: (value: unknown) => boolean): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, path: string, depth: number): void => {
    if (path && accepts(value)) found.add(path);
    if (depth >= DISCOVERY_DEPTH) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, path ? `${path}.${index}` : String(index), depth + 1));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (path || !IGNORED_FIELDS.has(key)) visit(item, path ? `${path}.${key}` : key, depth + 1);
      }
    }
  };
  for (const record of records) visit(record, '', 0);
  return [...found].sort();
}

/** The fields of the given statblocks that hold a quantity, as paths a resource definition can name. */
export function discoverResourceFields(records: readonly Readonly<Record<string, unknown>>[]): string[] {
  return discoverFields(records, (value) => parseResourceValue(value) !== null);
}
