/**
 * What a block's label is in the template editor (§7.6): the words the
 * template writes beside the values, edited in place. A block that binds a
 * field but has none yet takes its first label as the name of a new field.
 * A Metric has a label per number and its group's heading: which one is its
 * `part`. A Table has none on the card once it is named: its column names are
 * typed in its header row (`editor/table/`).
 */

import { fieldByKey } from '../../model/fieldKeys';
import { kindName } from '../../model/templateGrid';
import { headerPartOf, templateBlock } from '../../model/templateHeader';
import { boundField } from '../../model/treeQueries';
import { isUnboundBlock } from '../../render/blockDisplay';
import { METRIC_INDEX_ATTRIBUTE, UNNAMED_NUMBER } from '../../render/blocks/MetricView';
import { TAB_FOR_ATTRIBUTE } from '../../render/tabs/TabStrip';
import type { MetricBlock, StatblockTemplate, TemplateBlock, TemplateField } from '../../model/templateTypes';

export type LabelKind =
  /** A Stat's, Tags', Pairs' or Track's label: the field's, or the block's own. */
  | 'label'
  /** The heading of a Section, Tabs, Entries, Spells or Text block. */
  | 'heading'
  /** A Heading block's text. */
  | 'text'
  /** A block not bound yet: the label names the field it gets. */
  | 'new-field';

/** Which of a Metric's labels: the group's heading, or the name of the number at that place. */
export type LabelPart = 'heading' | number;

export interface LabelTarget {
  kind: LabelKind;
  /** What the input starts with; selected, so typing replaces it. */
  text: string;
  /** A Metric's label: which one. */
  part?: LabelPart | undefined;
}

/** The labels of a Metric in reading order: its heading where it has two numbers or more, then each number's name. */
export function metricLabelParts(block: MetricBlock): LabelPart[] {
  const numbers = block.fields.map((_, index) => index);
  return block.fields.length > 1 ? ['heading', ...numbers] : numbers;
}

/** A Metric's label `part`; unset, its first (the heading, or the one number's name). */
function metricTarget(block: MetricBlock, fields: readonly TemplateField[], part: LabelPart | undefined): LabelTarget | null {
  const chosen = part ?? metricLabelParts(block)[0];
  if (chosen === 'heading') return block.fields.length > 1 ? { kind: 'heading', text: block.heading ?? '', part: chosen } : null;
  if (chosen === undefined || chosen < 0 || chosen >= block.fields.length) return null;
  const key = block.fields[chosen];
  if (!key) return { kind: 'new-field', text: UNNAMED_NUMBER, part: chosen };
  return { kind: 'label', text: fieldByKey(fields, key)?.label ?? key, part: chosen };
}

/** The label a block offers to edit, or null where it has none (a Row, a Divider, a bound Title or Table); `part` picks one of a Metric's. */
export function labelTargetOf(block: TemplateBlock, fields: readonly TemplateField[], part?: LabelPart): LabelTarget | null {
  if (block.type === 'metric') return metricTarget(block, fields, part);
  if (isUnboundBlock(block)) return { kind: 'new-field', text: kindName(block) };
  if (block.type === 'scores') return null;
  if (block.type === 'heading') return { kind: 'text', text: block.text };
  if (block.type === 'section') return block.headingField ? null : { kind: 'heading', text: block.heading ?? '' };
  if (block.type === 'tabs' || block.type === 'entries' || block.type === 'spells' || block.type === 'text') return { kind: 'heading', text: block.heading ?? '' };
  if (block.type === 'stat' || block.type === 'tags' || block.type === 'pairs' || block.type === 'track' || block.type === 'counters') {
    const key = boundField(block);
    const field = key ? fieldByKey(fields, key) : undefined;
    return { kind: 'label', text: block.label ?? field?.label ?? key ?? '' };
  }
  return null;
}

/**
 * The label a block of the card offers to edit: a part of the header its
 * field's label (its name, which never changes its key), else the block's own
 * (`labelTargetOf`); null where it has none or the id names no block.
 */
export function labelTargetIn(template: StatblockTemplate, id: string, part?: LabelPart): LabelTarget | null {
  const header = headerPartOf(template, id);
  if (header) return { kind: 'label', text: header.label };
  const block = templateBlock(template, id);
  return block ? labelTargetOf(block, template.fields, part) : null;
}

/** Where the label's text stands in the card, for each kind; the first match is used. */
const LABEL_SELECTORS: Readonly<Record<LabelKind, readonly string[]>> = {
  label: ['.atlas-sb-label', '.atlas-sb-prompt'],
  heading: ['.atlas-sb-section-heading', '.atlas-sb-metric__heading'],
  text: ['.atlas-sb-section-heading'],
  'new-field': ['.atlas-sb-placeholder', '.atlas-sb-prompt', '.atlas-sb-label', '.atlas-sb-value'],
};

/** An element of the block's own, not of a block nested in it. */
function ownElement(frame: HTMLElement, selector: string): HTMLElement | null {
  for (const element of frame.querySelectorAll<HTMLElement>(selector)) {
    if (element.closest('[data-block-id]') === frame) return element;
  }
  return null;
}

/** The tab a tab's Section is headed with: its heading stands there, not in the panel. */
function tabOf(frame: HTMLElement): HTMLElement | null {
  const id = frame.getAttribute('data-block-id');
  const strip = frame.parentElement?.closest('[data-block="tabs"]');
  if (!id || !strip) return null;
  for (const tab of strip.querySelectorAll<HTMLElement>(`[${TAB_FOR_ATTRIBUTE}]`)) {
    if (tab.getAttribute(TAB_FOR_ATTRIBUTE) === id && tab.closest('[data-block-id]') === strip) return tab;
  }
  return null;
}

/** The number of a Metric at `index`: its labels are looked for there alone. */
function partElement(frame: HTMLElement, index: number): HTMLElement | null {
  return ownElement(frame, `[${METRIC_INDEX_ATTRIBUTE}="${index}"]`);
}

/** The element the label input stands over; the frame itself where the label is not drawn (an empty heading). */
export function labelElement(frame: HTMLElement, kind: LabelKind, part?: LabelPart): HTMLElement {
  const scope = typeof part === 'number' ? partElement(frame, part) : null;
  for (const selector of LABEL_SELECTORS[kind]) {
    const element = scope ? scope.querySelector<HTMLElement>(selector) : ownElement(frame, selector);
    if (element) return element;
  }
  return scope ?? (kind === 'heading' ? tabOf(frame) : null) ?? frame;
}

/** The number of a Metric a click landed on, by its place; undefined elsewhere (its heading, its box, another block). */
export function labelPartAt(target: EventTarget | null, frame: HTMLElement): number | undefined {
  const node = target as { closest?: (selector: string) => Element | null } | null;
  const part = typeof node?.closest === 'function' ? node.closest(`[${METRIC_INDEX_ATTRIBUTE}]`) : null;
  if (!part || part.closest('[data-block-id]') !== frame) return undefined;
  const index = Number(part.getAttribute(METRIC_INDEX_ATTRIBUTE));
  return Number.isInteger(index) ? index : undefined;
}
