/**
 * What a statblock draws of a creature's quantities, as the DM screen lists
 * them beside it (`tokenQuantities`): which it shows as tracks of boxes, and
 * the names it gives them. A native template says so in its Track blocks and
 * Scores slots; a Fantasy Statblocks layout has no schema for it, so its
 * blocks are read for the Daggerheart tracks and for labels.
 */

import type { StatblockItem, StatblockLayout } from '../react/components/statblock/statblockTypes';
import type { StatblockTemplate } from '../statblocks/model/templateTypes';
import { flattenReadingOrder } from '../statblocks/model/treeQueries';
import { isHitPointsKey, normalizedKey } from './resourceFields';
import { trackedNumbers, type TrackedNumber } from '../statblocks/values/trackedNumbers';

export interface QuantityLook {
  /** Quantities drawn as tracks of boxes: resource keys, and field keys as the DM screen names them (`hp`, `stress`). */
  tracks: ReadonlySet<string>;
  /** Labels the statblock gives quantities, by field key or dotted path (`stress.0`: "Physical"). */
  labels: ReadonlyMap<string, string>;
  /** The numbers a native template tracks (`trackedNumbers`): listed with the note's maximum. */
  tracked?: readonly TrackedNumber[];
}

/** A statblock that draws no tracks and names nothing: every quantity is a gauge under its field's name. */
export const PLAIN_QUANTITY_LOOK: QuantityLook = Object.freeze({ tracks: new Set<string>(), labels: new Map<string, string>() });

/** How the DM screen names a field's quantity: `hp` for any name of hit points, else the key without case or separators. */
export function quantityKey(field: string): string {
  return isHitPointsKey(field) ? 'hp' : normalizedKey(field);
}

/** The resources a Daggerheart statblock draws as tracks of boxes. */
const DAGGERHEART_TRACKS: ReadonlySet<string> = new Set(['hp', 'stress']);

function layoutItems(items: readonly StatblockItem[]): StatblockItem[] {
  return items.flatMap((item) => [
    item,
    ...layoutItems(item.nested ?? []),
    ...(item.conditions ?? []).flatMap((condition) => layoutItems(condition.nested)),
  ]);
}

function setOnce(labels: Map<string, string>, key: string, label: string): void {
  if (!labels.has(key) && label.trim() !== '') labels.set(key, label);
}

/**
 * A Fantasy Statblocks layout: the Daggerheart layout (by id, or under another id by the script
 * that draws the name and the checkbox tracks) draws hit points and stress as boxes; a property's
 * `display` names its field, a table's headers name the entries of its field (Fate stress tracks).
 */
export function fsQuantityLook(layout: StatblockLayout): QuantityLook {
  const items = layoutItems(layout.blocks);
  const drawsTracks = layout.id === 'daggerheart-adversary' || items.some((item) =>
    item.type === 'javascript' && item.code?.includes('adversary-name') && item.code.includes('checkbox'));
  const labels = new Map<string, string>();
  for (const item of items) {
    for (const field of item.properties ?? []) {
      if (item.type === 'property' && item.display) setOnce(labels, field, item.display.replace(/:\s*$/, ''));
      if (item.type === 'table') item.headers?.forEach((header, index) => setOnce(labels, `${field}.${index}`, header));
    }
  }
  return { tracks: drawsTracks ? DAGGERHEART_TRACKS : new Set(), labels };
}

/**
 * A native template: a Track block drawn as boxes makes its field (and the resource it shows)
 * a track, under the Track's label; a Scores field names each entry after its slot; the numbers
 * it tracks are listed by it.
 */
export function templateQuantityLook(template: StatblockTemplate): QuantityLook {
  const tracks = new Set<string>();
  const labels = new Map<string, string>();
  for (const field of template.fields) {
    if (field.type === 'scores') field.slots?.forEach((slot, index) => setOnce(labels, `${field.key}.${index}`, slot));
  }
  for (const block of flattenReadingOrder(template.layout.blocks)) {
    if (block.type !== 'track') continue;
    setOnce(labels, block.field, block.label ?? template.fields.find((field) => field.key === block.field)?.label ?? '');
    if (block.look !== 'boxes') continue;
    tracks.add(quantityKey(block.field));
    if (block.resource) tracks.add(block.resource);
  }
  return { tracks, labels, tracked: trackedNumbers(template) };
}
