/**
 * How a number shows on the card: as a number, or as a track of boxes to fill or a gauge (a Track block). A track
 * shows a tracked number's current value against its maximum, so a number shown as one is tracked: one that was not
 * starts counting down. Shown as a number again it stays tracked ("2 / 3"). A number of a Metric shown as a track
 * leaves the Metric for a tile of its own after the Metric's row, or takes the Metric's place where it was its only
 * number. Pure; an edit that cannot be made returns the very template, so a session records no step for it.
 */

import { createBlock } from './blockCatalogue';
import { fieldByKey } from './fieldKeys';
import { updateField } from './fieldOps';
import { withMetricFields } from './metricNumbers';
import { blockIdSource } from './templateIds';
import { spliced, withChildren, type TreeEdit } from './treeEdit';
import { insertBlock, updateBlock } from './treeOps';
import { turnInto } from './turnInto';
import { boundField, collectBlockIds, findBlock } from './treeQueries';
import type { FieldKey, FieldTracking, StatblockTemplate, TemplateBlock, TrackBlock } from './templateTypes';

export type TrackLook = TrackBlock['look'];
export type NumberLook = 'number' | TrackLook;

export const NUMBER_LOOKS: ReadonlyArray<{ value: NumberLook; label: string }> = [
  { value: 'number', label: 'Number' },
  { value: 'boxes', label: 'Boxes' },
  { value: 'gauge', label: 'Gauge' },
];

/** How a Value shows its number; null for a block that shows none this way. */
export function numberLookOf(block: TemplateBlock): NumberLook | null {
  if (block.type === 'track') return block.look;
  return block.type === 'stat' ? 'number' : null;
}

/** Whether `key` is a number of the template. */
const isNumber = (template: StatblockTemplate, key: FieldKey | undefined): key is FieldKey =>
  key !== undefined && key !== '' && fieldByKey(template.fields, key)?.type === 'number';

/** How the number is tracked: as its field says, else as the Track tile that tracks it by itself (an older template), else counting down. */
function trackingOf(template: StatblockTemplate, key: FieldKey, block?: TemplateBlock): FieldTracking {
  const own = fieldByKey(template.fields, key)?.tracks;
  if (own) return own;
  return block?.type === 'track' ? { counts: block.counts } : { counts: 'down' };
}

/** The template with the number tracked as `tracks`, where its field says nothing yet. */
function trackedAs(template: StatblockTemplate, key: FieldKey, tracks: FieldTracking): StatblockTemplate {
  return fieldByKey(template.fields, key)?.tracks ? template : updateField(template, key, { tracks });
}

const withEdit = (template: StatblockTemplate, edit: TreeEdit): StatblockTemplate | null =>
  edit.ok ? (edit.layout === template.layout ? template : { ...template, layout: edit.layout }) : null;

/**
 * The template with the Value `blockId` showing its number as `look`. A Track bound to a resource of the
 * collection shows the token's resource and is never tracked by its field.
 */
export function withNumberLook(template: StatblockTemplate, blockId: string, look: NumberLook): StatblockTemplate {
  const block = findBlock(template.layout.blocks, blockId)?.block;
  const key = block ? boundField(block) : undefined;
  const shown = block ? numberLookOf(block) : null;
  if (!block || shown === null || shown === look || !isNumber(template, key)) return template;
  const resource = block.type === 'track' && block.resource !== undefined;
  if (block.type === 'track' && look !== 'number') {
    return withEdit(template, updateBlock(template.layout, blockId, 'track', { look })) ?? template;
  }
  const tracks = trackingOf(template, key, block);
  const tracked = resource ? template : trackedAs(template, key, tracks);
  const turned = withEdit(tracked, turnInto(tracked.layout, blockId, look === 'number' ? 'stat' : 'track', tracked.fields));
  if (!turned || look === 'number') return turned ?? template;
  return withEdit(turned, updateBlock(turned.layout, blockId, 'track', { look, counts: tracks.counts })) ?? template;
}

/** A track of the number `key`, counting as it is tracked. */
function trackFor(key: FieldKey, look: TrackLook, tracks: FieldTracking, id: string): TrackBlock {
  return { ...createBlock('track', () => id, key), look, counts: tracks.counts };
}

/** The template with the number `key` of the Metric `metricId` shown as a track of its own. */
export function withMetricNumberLook(template: StatblockTemplate, metricId: string, key: FieldKey, look: TrackLook): StatblockTemplate {
  const found = findBlock(template.layout.blocks, metricId);
  const block = found?.block;
  if (!found || block?.type !== 'metric' || !block.fields.includes(key) || !isNumber(template, key)) return template;
  const tracks = trackingOf(template, key);
  const tracked = trackedAs(template, key, tracks);
  const rest = block.fields.filter((other) => other !== key);
  if (rest.length === 0) {
    const layout = withChildren(tracked.layout, found.parentId, (children) => spliced(children, found.index, 1, trackFor(key, look, tracks, metricId)));
    return { ...tracked, layout };
  }
  const id = blockIdSource(collectBlockIds(tracked.layout.blocks))();
  const left = withMetricFields(tracked, metricId, rest);
  // After the Metric's row: a Metric beside another tile stands in a Side by side, which takes no third
  const row = found.parentId === null ? -1 : left.layout.blocks.findIndex((top) => top.id === found.parentId && top.type === 'row');
  const target = row === -1 ? { parentId: found.parentId, index: found.index + 1 } : { parentId: null, index: row + 1 };
  return withEdit(left, insertBlock(left.layout, trackFor(key, look, tracks, id), target)) ?? template;
}
