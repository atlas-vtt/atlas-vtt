/**
 * A template's tracked numbers as resources of the character, beside its collection's: what the
 * DM screen lists, a rest restores and a player steps on their sheet. They have no socket and are
 * never drawn on the map; a number a collection resource already reads is that resource. Pure.
 */

import type { FieldKey, StatblockTemplate } from '../statblocks/model/templateTypes';
import { trackedNumbers, type TrackedNumber } from '../statblocks/values/trackedNumbers';
import { meaningsOf, NO_MEANINGS, type FieldMeanings } from '../statblocks/resolve/fieldMeanings';
import { matchingKey, normalizedKey } from './resourceFields';
import type { ResourceDefinition } from './resourceTypes';

export interface TrackedResource {
  readonly tracked: TrackedNumber;
  readonly definition: ResourceDefinition;
}

/** Tracked numbers have no colour of their own on a card; this is what a gauge of them takes where one is needed. */
const TRACKED_COLOR = '#8a8a8a';

/**
 * Whether a resource's field (a dotted path: `hp`, `stats.0`) is read from the template field
 * `key`, as a statblock key is resolved (`matchingKey`): without case, spaces, underscores or
 * hyphens, and for hit points the field the template's `meanings` name so (`pv`).
 */
export function readsTemplateField(resource: ResourceDefinition, key: FieldKey, meanings: FieldMeanings = NO_MEANINGS): boolean {
  const path = resource.field.trim();
  return normalizedKey(path) === normalizedKey(key) || matchingKey({ [key]: true }, path.split('.')[0] ?? '', meanings) !== undefined;
}

/** The resource of `resources` that is the tracked number of `key` read from `field`: one keeping its value under that key, or reading the field. */
export function collectionResourceOf(
  resources: readonly ResourceDefinition[], key: string, field: FieldKey, meanings: FieldMeanings = NO_MEANINGS,
): ResourceDefinition | undefined {
  return resources.find((resource) => resource.key === key || readsTemplateField(resource, field, meanings));
}

/** Whether one of `resources` is the tracked number of `key` read from `field`. */
export function isCollectionResource(
  resources: readonly ResourceDefinition[], key: string, field: FieldKey, meanings: FieldMeanings = NO_MEANINGS,
): boolean {
  return collectionResourceOf(resources, key, field, meanings) !== undefined;
}

/** A tracked number as a resource of no socket. */
function trackedDefinition(tracked: TrackedNumber): ResourceDefinition {
  return {
    key: tracked.key,
    name: tracked.field.label.trim() || tracked.field.key,
    field: tracked.maxField,
    direction: tracked.counts === 'down' ? 'drains' : 'fills',
    color: TRACKED_COLOR,
    // The character's own player sees them on their sheet; the table at large does not.
    visibleToPlayers: false,
  };
}

/** The template's tracked numbers no resource of `resources` reads or shares a key with, each as a resource. */
export function trackedResources(template: StatblockTemplate, resources: readonly ResourceDefinition[]): TrackedResource[] {
  const meanings = meaningsOf(template.fields);
  return trackedNumbers(template)
    .filter((tracked) => !isCollectionResource(resources, tracked.key, tracked.field.key, meanings))
    .map((tracked) => ({ tracked, definition: trackedDefinition(tracked) }));
}

/** The resources a recovery can restore: every one that counts, never a static value. */
export function recoverableResources(resources: readonly ResourceDefinition[]): ResourceDefinition[] {
  return resources.filter((resource) => resource.direction !== 'static' && resource.field.trim() !== '');
}

/**
 * The resource of the character a template field is, as a recovery rule names it. A field the
 * template tracks is the collection's resource that keeps its value or reads it
 * (`collectionResourceOf`: `hp` reading `hp_max`, a secondary bar reading none), else its own
 * tracked number. Any other field is the collection's resource that counts and reads it, by its key
 * or a key it had before (a renamed field keeps its resource). Undefined where it is none of these
 * (a number nothing tracks; a static value unless `staticToo`, which a rest names to say it changes
 * none).
 */
export function resourceOfField(
  template: StatblockTemplate, resources: readonly ResourceDefinition[], staticToo = false,
): (key: FieldKey) => ResourceDefinition | undefined {
  const meanings = meaningsOf(template.fields);
  const tracked = new Map(trackedNumbers(template).map((number) => [number.field.key, {
    definition: trackedDefinition(number),
    collection: collectionResourceOf(resources, number.key, number.field.key, meanings),
  }]));
  const counting = recoverableResources(resources);
  const keysOf = (key: FieldKey): FieldKey[] => [key, ...(template.fields.find((field) => field.key === key)?.formerKeys ?? [])];
  const readerIn = (list: readonly ResourceDefinition[], key: FieldKey): ResourceDefinition | undefined =>
    list.find((resource) => keysOf(key).some((each) => readsTemplateField(resource, each, meanings)));
  return (key) => {
    const number = tracked.get(key);
    if (!number) return readerIn(counting, key) ?? (staticToo ? readerIn(resources, key) : undefined);
    if (!number.collection) return number.definition;
    return staticToo || number.collection.direction !== 'static' ? number.collection : undefined;
  };
}
