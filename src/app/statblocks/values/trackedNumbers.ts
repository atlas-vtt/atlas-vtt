/**
 * Tracked numbers: values a character spends and gets back (Luck, Ki, Hit Dice, Stress) that a
 * template declares on a number field (`tracks`), or draws as a Track block bound to no token
 * resource. The note holds the maximum; the current value is the character's, kept where its
 * resources are (`key`). Pure.
 */

import { quantityKey } from '../../resources/quantityLooks';
import type { ResourceValue } from '../../resources/resourceTypes';
import { headerParts } from '../model/templateHeader';
import type { FieldKey, FieldTracking, FieldValue, StatblockTemplate, TemplateField } from '../model/templateTypes';
import { flattenReadingOrder } from '../model/treeQueries';
import { numericValue } from './numberText';

export interface TrackedNumber {
  /** Where tokens and the played campaign keep its current value, as the DM screen names the quantity. */
  readonly key: string;
  readonly field: TemplateField;
  readonly counts: FieldTracking['counts'];
  /** The field whose value is its maximum. */
  readonly maxField: FieldKey;
}

/** The key a tracked field's current value is kept under. */
export const trackedKey = (field: FieldKey): string => quantityKey(field);

/** How a number field is tracked: its own `tracks`, else the first Track block bound to no resource that draws it. */
function trackingOf(field: TemplateField, unboundTracks: ReadonlyMap<FieldKey, FieldTracking['counts']>): FieldTracking | null {
  if (field.type !== 'number') return null;
  if (field.tracks) return field.tracks;
  const counts = unboundTracks.get(field.key);
  return counts ? { counts } : null;
}

/** The fields Track blocks draw without a resource, each with the direction of the first such block. */
function unboundTracks(template: StatblockTemplate): Map<FieldKey, FieldTracking['counts']> {
  const blocks = [...headerParts(template).map((part) => part.block), ...flattenReadingOrder(template.layout.blocks)];
  const tracks = new Map<FieldKey, FieldTracking['counts']>();
  for (const block of blocks) {
    if (block.type === 'track' && !block.resource && !tracks.has(block.field)) tracks.set(block.field, block.counts);
  }
  return tracks;
}

/** The template's tracked numbers, in field order. A `max` naming no number field reads the field's own value. */
export function trackedNumbers(template: StatblockTemplate): TrackedNumber[] {
  const numbers = new Set(template.fields.filter((field) => field.type === 'number').map((field) => field.key));
  const tracks = unboundTracks(template);
  return template.fields.flatMap((field): TrackedNumber[] => {
    const tracking = trackingOf(field, tracks);
    if (!tracking) return [];
    const maxField = tracking.max !== undefined && numbers.has(tracking.max) ? tracking.max : field.key;
    return [{ key: trackedKey(field.key), field, counts: tracking.counts, maxField }];
  });
}

/** The maximum the note gives a tracked number: a whole number above 0, else null (nothing to track). */
export function trackedMax(tracked: TrackedNumber, read: (key: FieldKey) => FieldValue | undefined): number | null {
  const max = numericValue(read(tracked.maxField));
  return max === null || max < 1 ? null : Math.floor(max);
}

/**
 * A tracked number's value: the note's maximum, and the current value held (kept within it), else
 * where it starts, full when it counts down and empty when it counts up. `current` counts in its
 * direction, as a resource's does.
 */
export function trackedValue(tracked: TrackedNumber, max: number, held: ResourceValue | undefined): ResourceValue {
  const start = tracked.counts === 'down' ? max : 0;
  const current = held?.current ?? start;
  return { current: Math.max(0, Math.min(max, current)), max };
}
