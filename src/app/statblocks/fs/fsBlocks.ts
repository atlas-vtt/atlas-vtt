/**
 * Walks the blocks of a Fantasy Statblocks layout (§6.2). Containers map to
 * the template's: group → Section, inline → Row, collapse → a collapsible
 * Section, layout → a Section of the included layout's blocks. The blocks
 * that show values are `fsLeafBlocks`'; JavaScript, `ifelse` and buttons are
 * kept as scripts, except buttons for a plugin Atlas stands in for
 * (`fsIntegrations.ts`), which are left out. A `hasRule` becomes a Divider
 * after its block. What each FS block became is tallied for the report.
 */

import { describeValue, isRecord, own } from '../format/jsonValues';
import { isCodeKey } from '../model/fsCodeKeys';
import type { TemplateBlock } from '../model/templateTypes';
import type { ImportContext } from './fsImportState';
import {
  asScript, flags, full, headingOf, keysOf, recordFields, textOf, type Converted, type FsRecord, type Leaf, type Place,
} from './fsBlockParts';
import { replacedIntegration } from './fsIntegrations';
import { LEAF_BLOCKS } from './fsLeafBlocks';
import { t } from '../../i18n';

/** Deeper FS blocks are left out: wrappers can add levels, and a template keeps 32. */
const MAX_DEPTH = 14;
/** A group inside a collapse that holds nothing but its blocks, so its blocks go straight into the collapsible Section. */
const PLAIN_GROUP_KEYS: ReadonlySet<string> = new Set(['id', 'type', 'properties', 'nested', 'conditioned']);

const dropped = (sentence: string): Converted => ({ blocks: [], outcome: 'dropped', sentence });

function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
}

/** Whether the block itself holds JavaScript, its children aside (§6.5). */
function carriesCode(record: FsRecord, type: string): boolean {
  if (type === 'javascript' || type === 'ifelse') return true;
  return Object.keys(record).some((key) => isCodeKey(key, { blockType: type }) && hasContent(record[key]));
}

/** Records the keys of the blocks a script holds (an `ifelse`'s branches), so their values stay editable. */
function recordWithin(list: unknown, ctx: ImportContext, depth: number): void {
  if (!Array.isArray(list) || depth > MAX_DEPTH) return;
  for (const item of list) {
    if (!isRecord(item)) continue;
    recordFields(item, ctx);
    recordWithin(own(item, 'nested'), ctx, depth + 1);
    const branches = own(item, 'conditions');
    if (!Array.isArray(branches)) continue;
    for (const branch of branches) if (isRecord(branch)) recordWithin(own(branch, 'nested'), ctx, depth + 1);
  }
}

const button: Leaf = (record, ctx, at) => {
  const replaced = replacedIntegration(record);
  return replaced === null ? asScript(record, ctx, at) : dropped(replaced);
};

const script: Leaf = (record, ctx, at) => {
  recordWithin(own(record, 'nested'), ctx, at.depth + 1);
  recordWithin(own(record, 'conditions'), ctx, at.depth + 1);
  return asScript(record, ctx, at);
};

function mentionKeys(record: FsRecord, ctx: ImportContext): void {
  for (const key of keysOf(record)) ctx.fields.mention(key);
}

const group: Leaf = (record, ctx, at) => {
  mentionKeys(record, ctx);
  const id = ctx.nextId();
  const head = headingOf(record, ctx);
  const blocks = convertBlocks(own(record, 'nested'), ctx, { depth: at.depth + 1, parent: 'section' });
  return full([{
    id, type: 'section', ...(head.heading ? { heading: head.heading } : {}), ...(head.headingField ? { headingField: head.headingField } : {}),
    blocks, ...flags(record, ['nested', ...head.read], at),
  }]);
};

const inline: Leaf = (record, ctx, at) => {
  mentionKeys(record, ctx);
  const head = headingOf(record, ctx);
  // A Row never holds a Row, and FS draws an inline group's heading above it
  const wrapped = head.heading !== undefined || head.headingField !== undefined || at.parent === 'row';
  const sectionId = wrapped ? ctx.nextId() : null;
  const id = ctx.nextId();
  const blocks = convertBlocks(own(record, 'nested'), ctx, { depth: at.depth + 1, parent: 'row' });
  const rowFlags = flags(record, ['nested', ...head.read], at);
  // A row of one block is that block, as the editor tidies it (`tidyRows`); its width is then the card's
  const [only] = blocks;
  // A row whose blocks were all left out (Initiative Tracker's buttons) and that has no heading leaves nothing behind
  if (!only && head.heading === undefined && head.headingField === undefined) return full([]);
  if (sectionId === null && only && blocks.length === 1 && !rowFlags.className) return full([only]);
  const row: TemplateBlock = { id, type: 'row', align: 'spread', blocks, ...rowFlags };
  if (sectionId === null) return full([row]);
  return full([{
    id: sectionId, type: 'section', ...(head.heading ? { heading: head.heading } : {}),
    ...(head.headingField ? { headingField: head.headingField } : {}), blocks: [row],
  }]);
};

function plainGroup(value: unknown): FsRecord | null {
  if (!isRecord(value) || own(value, 'type') !== 'group' || own(value, 'conditioned') === true) return null;
  return Object.keys(value).every((key) => PLAIN_GROUP_KEYS.has(key)) ? value : null;
}

const collapse: Leaf = (record, ctx, at) => {
  const id = ctx.nextId();
  const nested = own(record, 'nested');
  const only = Array.isArray(nested) && nested.length === 1 ? plainGroup(nested[0]) : null;
  if (only) {
    mentionKeys(only, ctx);
    ctx.tally.record('full', false);
  }
  const inner: Place = { depth: at.depth + (only ? 2 : 1), parent: 'section' };
  const blocks = convertBlocks(only ? own(only, 'nested') : nested, ctx, inner);
  const heading = textOf(record, 'heading')?.trim();
  return full([{
    id, type: 'section', ...(heading ? { heading } : {}), collapsible: own(record, 'open') === true ? 'open' : 'closed',
    blocks, ...flags(record, ['nested', 'heading', 'open'], at),
  }]);
};

const included: Leaf = (record, ctx, at) => {
  const ref = textOf(record, 'layout')?.trim();
  if (!ref) return dropped('A block that includes another layout names none, so it was left out.');
  const found: unknown = ctx.resolveLayout?.(ref) ?? null;
  if (!isRecord(found)) return dropped(t('statblockEditor.fs.includeMissing', { name: describeValue(ref) }));
  const names = [ref, textOf(found, 'id'), textOf(found, 'name')].filter((name): name is string => name !== undefined);
  const shown = describeValue(textOf(found, 'name') ?? ref);
  if (names.some((name) => ctx.including.includes(name))) return dropped(t('statblockEditor.fs.includesItself', { name: shown }));
  ctx.including.push(...names);
  const id = ctx.nextId();
  const blocks = convertBlocks(own(found, 'blocks'), ctx, { depth: at.depth + 1, parent: 'section' });
  ctx.including.splice(ctx.including.length - names.length, names.length);
  return full([{ id, type: 'section', blocks, ...flags(record, ['layout'], at) }]);
};

const OTHER_BLOCKS: ReadonlyMap<string, Leaf> = new Map(Object.entries({
  group, inline, collapse, layout: included, javascript: script, ifelse: script, action: button,
}));

function convertByType(record: FsRecord, type: string, ctx: ImportContext, at: Place): Converted {
  if (at.depth > MAX_DEPTH) return dropped(t('statblockEditor.fs.tooDeep', { depth: MAX_DEPTH }));
  const convert = LEAF_BLOCKS.get(type) ?? OTHER_BLOCKS.get(type);
  if (convert) return convert(record, ctx, at);
  return dropped(type ? `A block of the type ${describeValue(type)} was left out: Atlas does not know it.` : 'A block without a type was left out.');
}

function convertOne(raw: unknown, ctx: ImportContext, at: Place): TemplateBlock[] {
  if (!isRecord(raw)) {
    ctx.tally.record('dropped', false, t('statblockEditor.fs.notABlock'));
    return [];
  }
  const type = textOf(raw, 'type') ?? '';
  const code = carriesCode(raw, type);
  if (ctx.budget <= 0) {
    ctx.tally.record('dropped', code, t('statblockEditor.fs.tooLarge'));
    return [];
  }
  ctx.budget -= 1;
  const result = convertByType(raw, type, ctx, at);
  ctx.tally.record(result.outcome, code, result.sentence);
  // FS draws no rule inside an inline row
  if (own(raw, 'hasRule') !== true || at.parent === 'row' || result.blocks.length === 0) return result.blocks;
  // A conditioned block's rule hides with the block
  const follows = own(raw, 'conditioned') === true && result.shows !== undefined;
  const divider: TemplateBlock = {
    id: ctx.nextId(), type: 'divider', ...(follows && result.shows ? { showWhen: { field: result.shows, is: 'present' } } : {}),
  };
  return [...result.blocks, divider];
}

/** The template blocks for a list of FS blocks; anything that is not a list holds none. */
export function convertBlocks(list: unknown, ctx: ImportContext, at: Place): TemplateBlock[] {
  return Array.isArray(list) ? list.flatMap((item: unknown) => convertOne(item, ctx, at)) : [];
}
