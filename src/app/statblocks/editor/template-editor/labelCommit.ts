/**
 * Committing a label typed in the canvas (§7.6), as a pure edit of the
 * template. The first label of a block without a field gives it one: a field
 * of the template or a key the collection's notes use when the label names
 * it, else a new field whose key is derived from the label (`labelToKey`).
 * A Metric's numbers are named so one by one; renaming one later changes its
 * field's label and keeps its key, as everywhere else. The new field is the one
 * the tile was drawn with before it was named (`newFieldFor`): a Table's starts
 * with the table a new one has; its columns are named in its header row.
 */

import { addField, updateField } from '../../model/fieldOps';
import { bindsFieldType } from '../../model/blockCatalogue';
import { fieldByKey, fieldKeysOf, labelToKey } from '../../model/fieldKeys';
import { newFieldFor } from '../../model/newFields';
import { spliced, withChildren } from '../../model/treeEdit';
import { updateBlock } from '../../model/treeOps';
import { bindHeaderPart, fieldNamedBy } from '../../model/headerBinding';
import { HEADER_PARTS, headerPartOf } from '../../model/templateHeader';
import { findBlock } from '../../model/treeQueries';
import {
  wordsStandAlone, type FieldKey, type MetricBlock, type StatblockTemplate, type TemplateBlock,
} from '../../model/templateTypes';
import { labelTargetOf, type LabelPart } from './labelTargets';

export interface LabelCommit {
  template: StatblockTemplate;
  /** The field a block without one was bound to. */
  bound?: { key: FieldKey; created: boolean; fromCollection: boolean } | undefined;
}

function replaceBlock(template: StatblockTemplate, id: string, next: TemplateBlock): StatblockTemplate {
  const found = findBlock(template.layout.blocks, id);
  if (!found) return template;
  const layout = withChildren(template.layout, found.parentId, (children) => spliced(children, found.index, 1, next));
  return layout === template.layout ? template : { ...template, layout };
}

/** The block showing `key`, with the label it was given where the block keeps one. */
function bindBlock(block: TemplateBlock, key: FieldKey, label: string, ownLabel: boolean): TemplateBlock {
  switch (block.type) {
    case 'line': return { ...block, fields: [key] };
    case 'entries': case 'spells': case 'text': return { ...block, field: key, heading: label };
    case 'stat': case 'tags': case 'pairs': case 'track': case 'counters':
      return ownLabel ? { ...block, field: key, label } : { ...block, field: key };
    case 'title': case 'scores': case 'image': return { ...block, field: key };
    default: return block;
  }
}

/** The collection's own spelling of a key, matched without regard to case. */
function collectionKey(keys: Iterable<FieldKey>, wanted: FieldKey): FieldKey | null {
  const lower = wanted.toLowerCase();
  for (const key of keys) if (key.toLowerCase() === lower) return key;
  return null;
}

/** How a block shows the field its label named: `ownLabel` where the field's label is not the one typed. */
type Bind = (key: FieldKey, ownLabel: boolean) => TemplateBlock;

/**
 * Binds `block` through `bind` to the field `label` names, else to a new one. A field the block
 * shows already (another number of a Metric) is never named twice: the label gets a field of its own.
 */
function bindNewField(
  template: StatblockTemplate, block: TemplateBlock, label: string, collectionKeys: Iterable<FieldKey>, bind: Bind, shown: readonly FieldKey[] = [],
): LabelCommit {
  if (!newFieldFor(block, '', label)) return { template };
  const wanted = labelToKey(label, []);
  const existing = fieldByKey(template.fields, wanted);
  if (existing && bindsFieldType(block.type, existing.type) && !shown.includes(existing.key)) {
    const next = replaceBlock(template, block.id, bind(existing.key, existing.label !== label));
    return { template: next, bound: { key: existing.key, created: false, fromCollection: false } };
  }
  const known = [...collectionKeys];
  const used = existing ? null : collectionKey(known, wanted);
  const key = used ?? labelToKey(label, [...fieldKeysOf(template.fields), ...known]);
  const field = newFieldFor(block, key, label);
  const withField = field ? addField(template, field) : template;
  if (withField === template) return { template };
  const next = replaceBlock(withField, block.id, bind(key, false));
  return { template: next, bound: { key, created: true, fromCollection: used !== null } };
}

/** The Metric with its number at `index` showing `key`. */
function bindNumber(block: MetricBlock, index: number, key: FieldKey): MetricBlock {
  return { ...block, fields: block.fields.map((each, at) => (at === index ? key : each)) };
}

/** A bound block's label: its own where it keeps one (words standing on their own show only their own), else its field's. */
function relabel(template: StatblockTemplate, block: TemplateBlock, label: string): StatblockTemplate {
  if (block.type !== 'stat' && block.type !== 'tags' && block.type !== 'pairs' && block.type !== 'track' && block.type !== 'counters') return template;
  const field = fieldByKey(template.fields, block.field);
  const ownLabel = block.label !== undefined || wordsStandAlone(block);
  if (field && !ownLabel) return updateField(template, field.key, { label });
  return block.label === label ? template : replaceBlock(template, block.id, { ...block, label });
}

function reheading(template: StatblockTemplate, block: TemplateBlock, heading: string): StatblockTemplate {
  if (block.type !== 'section' && block.type !== 'tabs' && block.type !== 'entries' && block.type !== 'spells' && block.type !== 'text'
    && block.type !== 'metric') return template;
  const edit = updateBlock(template.layout, block.id, block.type, { heading: heading || undefined });
  return edit.ok && edit.layout !== template.layout ? { ...template, layout: edit.layout } : template;
}

/**
 * A part of the header renamed: its field's label, never its key; the field comes with it where the template had none.
 * A name another field of the template has points the part at that field instead (a level the system calls by another
 * name, kept under its own key), where the part can show it (`bindHeaderPart`).
 */
function renameHeaderPart(template: StatblockTemplate, id: string, label: string): StatblockTemplate {
  const part = headerPartOf(template, id);
  if (!part || !label) return template;
  const named = fieldNamedBy(template.fields, label, part.key);
  const bound = named ? bindHeaderPart(template, part.id, named.key) : template;
  if (bound !== template) return bound;
  const field = fieldByKey(template.fields, part.key);
  return field ? updateField(template, field.key, { label }) : addField(template, { ...HEADER_PARTS[part.id].field, label });
}

/**
 * The template with the label of block `id` set to `text`. An empty label
 * keeps the old one, except a heading, which an empty one removes. Returns
 * the very template where nothing changes, so no undo step is made.
 */
export function commitLabel(
  template: StatblockTemplate, id: string, text: string, collectionKeys: Iterable<FieldKey> = [], part?: LabelPart,
): LabelCommit {
  if (headerPartOf(template, id)) return { template: renameHeaderPart(template, id, text.trim()) };
  const block = findBlock(template.layout.blocks, id)?.block;
  const target = block ? labelTargetOf(block, template.fields, part) : null;
  if (!block || !target) return { template };
  const label = text.trim();
  const number = block.type === 'metric' && typeof target.part === 'number' ? { block, index: target.part } : null;
  switch (target.kind) {
    case 'new-field':
      if (!label) return { template };
      if (number) {
        return bindNewField(template, block, label, collectionKeys, (key) => bindNumber(number.block, number.index, key), number.block.fields);
      }
      return bindNewField(template, block, label, collectionKeys, (key, ownLabel) => bindBlock(block, key, label, ownLabel));
    case 'label': {
      const key = number?.block.fields[number.index];
      if (key) return { template: label ? updateField(template, key, { label }) : template };
      return { template: label ? relabel(template, block, label) : template };
    }
    case 'heading': return { template: reheading(template, block, label) };
    case 'text':
      return { template: label && block.type === 'heading' && block.text !== label ? replaceBlock(template, id, { ...block, text: label }) : template };
  }
}
