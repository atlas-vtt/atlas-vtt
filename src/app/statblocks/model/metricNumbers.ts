/**
 * The numbers of a Metric block: added at its end up to six, removed down to
 * one (the block itself goes by deleting it). Pure; an edit that cannot be
 * made returns the very template, so a session records no step for it. A
 * removed number's field stays in the template, as a deleted block's does,
 * so no statblock loses what it wrote there.
 */

import { withChildren, spliced } from './treeEdit';
import { findBlock } from './treeQueries';
import type { FieldKey, MetricBlock, StatblockTemplate } from './templateTypes';

/** The most numbers one Metric holds. */
export const MAX_METRIC_NUMBERS = 6;

/** The Metric block `id`, or undefined where it is none. */
export function metricBlock(template: StatblockTemplate, id: string): MetricBlock | undefined {
  const block = findBlock(template.layout.blocks, id)?.block;
  return block?.type === 'metric' ? block : undefined;
}

/** The template with the Metric `id` holding `fields`; the very template where they are the ones it holds. */
export function withMetricFields(template: StatblockTemplate, id: string, fields: FieldKey[]): StatblockTemplate {
  const found = findBlock(template.layout.blocks, id);
  const block = found?.block;
  if (!found || block?.type !== 'metric') return template;
  if (fields.length === block.fields.length && fields.every((key, index) => key === block.fields[index])) return template;
  const layout = withChildren(template.layout, found.parentId, (children) => spliced(children, found.index, 1, { ...block, fields }));
  return layout === template.layout ? template : { ...template, layout };
}

/** Whether the Metric `id` takes another number. */
export function canAddMetricNumber(template: StatblockTemplate, id: string): boolean {
  const block = metricBlock(template, id);
  return block !== undefined && block.fields.length < MAX_METRIC_NUMBERS;
}

/** One more number at the Metric's end, not named yet. */
export function addMetricNumber(template: StatblockTemplate, id: string): StatblockTemplate {
  const block = metricBlock(template, id);
  if (!block || !canAddMetricNumber(template, id)) return template;
  return withMetricFields(template, id, [...block.fields, '']);
}

/** The Metric without its number at `index`; never its last one. */
export function removeMetricNumber(template: StatblockTemplate, id: string, index: number): StatblockTemplate {
  const block = metricBlock(template, id);
  if (!block || block.fields.length <= 1 || index < 0 || index >= block.fields.length) return template;
  return withMetricFields(template, id, block.fields.filter((_, at) => at !== index));
}
