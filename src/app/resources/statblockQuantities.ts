import type { StatblockMonster } from '../react/components/statblock/statblockTypes';
import { isRecord } from '../utils/guards';
import { normalizedKey, parseResourceValue } from './resourceFields';
import { quantityKey, type QuantityLook } from './quantityLooks';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';
import { visibleResources } from './visibleResources';
import { trackedMax, trackedValue } from '../statblocks/values/trackedNumbers';
import { isCollectionResource } from './trackedResources';

/** One row of a token in the DM screen. */
export interface TokenQuantity {
  /** Where the token keeps the value in its `resources`. */
  key: string;
  label: string;
  value: ResourceValue;
  /** Counts what is used up (stress, wounds) instead of what is left. */
  fills: boolean;
  /** One box per point, like the tracks the statblock draws, instead of a gauge. */
  boxes: boolean;
}

/** More boxes than this are a gauge. */
const MAX_BOXES = 40;
/** Fields that name a quantity in the statblocks of most systems. */
const QUANTITY_NAMES = new Set(['hp', 'stress', 'hope', 'mana', 'mp', 'stamina', 'energy', 'shield', 'shields', 'resolve', 'luck', 'focus', 'strain', 'wounds', 'ammo', 'charges']);
const COUNTING_UP = new Set(['stress', 'strain', 'wounds']);
/** What a token holds of these is listed though neither the collection nor the statblock names it. */
const KEPT = ['hp', 'stress', 'hope'];

const labelOf = (name: string): string => (quantityKey(name) === 'hp' ? 'HP' : name.replace(/[_-]/g, ' ').replace(/^./, (first) => first.toUpperCase()));
/** A statblock value as a tracked number's maximum reads it: a number or its text. */
const fieldNumber = (raw: unknown): number | string | undefined => (typeof raw === 'number' || typeof raw === 'string' ? raw : undefined);
const fitsBoxes = (max: number): boolean => Number.isInteger(max) && max <= MAX_BOXES;

function isBounded(value: unknown): boolean {
  return value !== null && typeof value === 'object' && 'max' in value && ('current' in value || 'value' in value);
}

/**
 * What the DM screen lists for a token: the resources of its collection, then every further
 * quantity its statblock names (mana, luck, a `resources` map, Fate stress tracks). Fantasy
 * Statblocks has no schema for those, so only concrete quantities count, never combat
 * statistics. The token's own number wins over the statblock's; a quantity a resource of
 * the collection already reads is listed once. `look` says which the statblock draws as
 * tracks of boxes and what it calls them (`fsQuantityLook`, `templateQuantityLook`).
 */
export function tokenQuantities(
  monster: StatblockMonster,
  look: QuantityLook,
  token: ResourceHolder,
  definitions: readonly ResourceDefinition[],
): TokenQuantity[] {
  const quantities = new Map<string, TokenQuantity>();

  for (const { definition, value } of visibleResources(token, definitions, 'dm')) {
    // Nothing to spend or to mark off
    if (definition.direction === 'static') continue;
    const tracked = look.tracks.has(definition.key) || look.tracks.has(quantityKey(definition.field));
    quantities.set(definition.key, {
      key: definition.key, label: definition.name, value,
      fills: definition.direction === 'fills',
      boxes: tracked && fitsBoxes(value.max),
    });
  }

  const isDefined = (key: string, field: string): boolean =>
    definitions.some((definition) => definition.key === key || normalizedKey(definition.field) === normalizedKey(field));

  for (const tracked of look.tracked ?? []) {
    if (quantities.has(tracked.key) || isCollectionResource(definitions, tracked.key, tracked.field.key)) continue;
    const max = trackedMax(tracked, (key) => fieldNumber(monster[key]));
    if (max === null) continue;
    quantities.set(tracked.key, {
      key: tracked.key,
      label: look.labels.get(tracked.field.key) || tracked.field.label || labelOf(tracked.field.key),
      value: trackedValue(tracked, max, token.resources?.[tracked.key]),
      fills: tracked.counts === 'up',
      boxes: look.tracks.has(tracked.key) && fitsBoxes(max),
    });
  }

  const add = (key: string, field: string, raw: unknown, label: string, boxes = look.tracks.has(key)): void => {
    if (quantities.has(key) || isDefined(key, field)) return;
    const fills = COUNTING_UP.has(key.split('.')[0]!);
    const value = token.resources?.[key] ?? parseResourceValue(raw, fills);
    if (value) quantities.set(key, { key, label, value, fills, boxes: boxes && fitsBoxes(value.max) });
  };

  for (const [field, raw] of Object.entries(monster)) {
    const key = quantityKey(field);
    if (key === 'stress' && Array.isArray(raw)) {
      raw.forEach((track: unknown, index) => add(`stress.${index}`, `${field}.${index}`, track, `${look.labels.get(`${field}.${index}`) ?? index + 1} stress`, true));
    } else if (QUANTITY_NAMES.has(key) || isBounded(raw)) {
      add(key, field, raw, look.labels.get(field) ?? labelOf(field));
    } else if (key === 'resources' && isRecord(raw)) {
      for (const [name, entry] of Object.entries(raw)) add(`resources.${name}`, `${field}.${name}`, entry, labelOf(name));
    }
  }
  for (const key of KEPT) add(key, key, undefined, labelOf(key));
  return [...quantities.values()];
}
