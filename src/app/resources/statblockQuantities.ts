import type { StatblockItem, StatblockLayout, StatblockMonster } from '../react/components/statblock/statblockTypes';
import { isRecord } from '../utils/guards';
import { isHitPointsKey, normalizedKey, parseResourceValue } from './resourceFields';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';
import { visibleResources } from './visibleResources';

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
/** The resources a Daggerheart statblock draws as tracks of boxes. */
const TRACKS = new Set(['hp', 'stress']);
/** What a token holds of these is listed though neither the collection nor the statblock names it. */
const KEPT = ['hp', 'stress', 'hope'];

const canonical = (key: string): string => (isHitPointsKey(key) ? 'hp' : normalizedKey(key));
const labelOf = (name: string): string => (canonical(name) === 'hp' ? 'HP' : name.replace(/[_-]/g, ' ').replace(/^./, (first) => first.toUpperCase()));
const fitsBoxes = (max: number): boolean => Number.isInteger(max) && max <= MAX_BOXES;

function layoutItems(items: StatblockItem[]): StatblockItem[] {
  return items.flatMap((item) => [
    item,
    ...layoutItems(item.nested ?? []),
    ...(item.conditions ?? []).flatMap((condition) => layoutItems(condition.nested)),
  ]);
}

function isBounded(value: unknown): boolean {
  return value !== null && typeof value === 'object' && 'max' in value && ('current' in value || 'value' in value);
}

/**
 * What the DM screen lists for a token: the resources of its collection, then every further
 * quantity its statblock names (mana, luck, a `resources` map, Fate stress tracks). Fantasy
 * Statblocks has no schema for those, so only concrete quantities count, never combat
 * statistics. The token's own number wins over the statblock's; a quantity a resource of
 * the collection already reads is listed once.
 */
export function tokenQuantities(
  monster: StatblockMonster,
  layout: StatblockLayout,
  token: ResourceHolder,
  definitions: readonly ResourceDefinition[],
): TokenQuantity[] {
  const items = layoutItems(layout.blocks);
  // A Daggerheart layout under another id is known by the script that draws the name and the checkbox tracks
  const drawsTracks = layout.id === 'daggerheart-adversary' || items.some((item) =>
    item.type === 'javascript' && item.code?.includes('adversary-name') && item.code.includes('checkbox'));
  const quantities = new Map<string, TokenQuantity>();

  for (const { definition, value } of visibleResources(token, definitions, 'dm')) {
    // Nothing to spend or to mark off
    if (definition.direction === 'static') continue;
    quantities.set(definition.key, {
      key: definition.key, label: definition.name, value,
      fills: definition.direction === 'fills',
      boxes: drawsTracks && TRACKS.has(definition.key) && fitsBoxes(value.max),
    });
  }

  const isDefined = (key: string, field: string): boolean =>
    definitions.some((definition) => definition.key === key || normalizedKey(definition.field) === normalizedKey(field));

  const add = (key: string, field: string, raw: unknown, label: string, boxes = drawsTracks && TRACKS.has(key)): void => {
    if (quantities.has(key) || isDefined(key, field)) return;
    const fills = COUNTING_UP.has(key.split('.')[0]!);
    const value = token.resources?.[key] ?? parseResourceValue(raw, fills);
    if (value) quantities.set(key, { key, label, value, fills, boxes: boxes && fitsBoxes(value.max) });
  };

  for (const [field, raw] of Object.entries(monster)) {
    const key = canonical(field);
    if (key === 'stress' && Array.isArray(raw)) {
      const headers = items.find((item) => item.type === 'table' && item.properties?.includes(field))?.headers;
      raw.forEach((track: unknown, index) => add(`stress.${index}`, `${field}.${index}`, track, `${headers?.[index] ?? index + 1} stress`, true));
    } else if (QUANTITY_NAMES.has(key) || isBounded(raw)) {
      const display = items.find((item) => item.type === 'property' && item.properties?.includes(field))?.display;
      add(key, field, raw, display ? display.replace(/:\s*$/, '') : labelOf(field));
    } else if (key === 'resources' && isRecord(raw)) {
      for (const [name, entry] of Object.entries(raw)) add(`resources.${name}`, `${field}.${name}`, entry, labelOf(name));
    }
  }
  for (const key of KEPT) add(key, key, undefined, labelOf(key));
  return [...quantities.values()];
}
