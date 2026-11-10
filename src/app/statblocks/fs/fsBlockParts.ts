/**
 * What converting any Fantasy Statblocks block needs: reading its untrusted
 * record, the flags every block shares (`conditioned`, `fallback`, `cls`,
 * and the keys kept for export in `fsExtras`), its heading, and keeping a
 * block whole as a script.
 */

import { escapePatternText } from '../expressions/patternParse';
import { describeValue, jsonRecordCopy, own } from '../format/jsonValues';
import type { BlockBase, FieldKey, FieldType, TemplateBlock } from '../model/templateTypes';
import { cleanLabel, type ImportContext, type Outcome } from './fsImportState';
import { scriptBlock } from './fsScripts';
import { t } from '../../i18n';

export type FsRecord = Readonly<Record<string, unknown>>;

/** Where a block lands: how deep, and what holds it (a Row cannot hold a Row). */
export interface Place {
  depth: number;
  parent: 'root' | 'section' | 'row';
}

export interface Converted {
  blocks: TemplateBlock[];
  outcome: Outcome;
  sentence?: string | undefined;
  /** The field whose emptiness hides the block, so the Divider of its `hasRule` hides with it. */
  shows?: FieldKey | undefined;
}

export type Base = Omit<BlockBase, 'id'>;
export type Leaf = (record: FsRecord, ctx: ImportContext, at: Place) => Converted;

/** What every FS block may hold that `flags` reads. */
const READ_BY_FLAGS = ['id', 'type', 'properties', 'conditioned', 'fallback', 'cls'];
/** FS shows `fallback` (default "-") for an empty property or text that is not conditioned. */
const SHOWS_FALLBACK: ReadonlySet<string> = new Set(['property', 'text']);
/** What a block shows its keys as, for blocks whose keys are recorded without converting them. */
const FIELD_TYPES: Readonly<Record<string, FieldType>> = {
  heading: 'text', subheading: 'text', property: 'text', table: 'scores', saves: 'pairs', traits: 'entries',
  spells: 'spells', text: 'markdown', image: 'image',
};

export function textOf(record: FsRecord, key: string): string | undefined {
  const value = own(record, key);
  return typeof value === 'string' ? value : undefined;
}

export function keysOf(record: FsRecord): string[] {
  const value = own(record, 'properties');
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** The block's callback, where it has one that says something. */
export function hasCallback(record: FsRecord): string | undefined {
  return textOf(record, 'callback')?.trim() || undefined;
}

export const full = (blocks: TemplateBlock[], shows?: FieldKey): Converted => ({ blocks, outcome: 'full', shows });

export function refused(key: string): Converted {
  return { blocks: [], outcome: 'dropped', sentence: t('statblockEditor.fs.reservedKey', { key: describeValue(key) }) };
}

/** The flags every block shares: `conditioned`, `fallback`, `cls`, and the keys no other part read, kept for export. */
export function flags(record: FsRecord, read: readonly string[], at: Place): Base {
  const base: Base = {};
  const type = textOf(record, 'type') ?? '';
  const fallback = textOf(record, 'fallback');
  // FS draws no conditioned block while it is empty; where a statblock is filled in, it waits as a chip
  if (own(record, 'conditioned') === true) base.whenEmpty = 'fold';
  else if (SHOWS_FALLBACK.has(type)) base.whenEmpty = 'fallback';
  if (base.whenEmpty === 'fallback' || fallback !== undefined) base.fallback = escapePatternText(fallback ?? '-');
  const cls = textOf(record, 'cls')?.trim();
  if (cls) base.className = cls;
  // Inside an FS inline row a rule is never drawn; it stays for export instead of becoming a Divider
  const consumed = new Set([...READ_BY_FLAGS, ...read, ...(at.parent === 'row' ? [] : ['hasRule'])]);
  const extras = jsonRecordCopy(Object.fromEntries(Object.entries(record).filter(([key]) => !consumed.has(key))));
  if (extras && Object.keys(extras).length > 0) base.fsExtras = extras;
  return base;
}

export interface Heading {
  heading?: string;
  headingField?: FieldKey;
  read: string[];
}

/** A static `heading`, or (`headingProp`) the key whose value is the heading. A blank heading stays for export. */
export function headingOf(record: FsRecord, ctx: ImportContext): Heading {
  const heading = textOf(record, 'heading');
  if (own(record, 'headingProp') === true) {
    return heading !== undefined && ctx.fields.mention(heading) ? { headingField: heading, read: ['heading', 'headingProp'] } : { read: [] };
  }
  if (heading?.trim()) return { heading: heading.trim(), read: ['heading', 'headingProp'] };
  // A heading of spaces draws an empty heading line in FS; it stays for export
  return { read: heading === '' ? ['heading', 'headingProp'] : ['headingProp'] };
}

/** What a block calls its value: a property's `display`, a list's static `heading`. */
function blockLabel(record: FsRecord): string | undefined {
  return textOf(record, 'display') ?? (own(record, 'headingProp') === true ? undefined : textOf(record, 'heading'));
}

/** Records the keys of a block that is not converted (it is kept in a script), each as its block shows it. */
export function recordFields(record: FsRecord, ctx: ImportContext): void {
  const blockType = textOf(record, 'type') ?? '';
  const type = Object.hasOwn(FIELD_TYPES, blockType) ? FIELD_TYPES[blockType] : undefined;
  const label = blockLabel(record);
  for (const key of keysOf(record)) {
    if (type) ctx.fields.use(key, type, { label });
    else ctx.fields.mention(key);
  }
}

/** The block kept whole as a script; its keys are fields all the same. */
export function asScript(record: FsRecord, ctx: ImportContext, at: Place): Converted {
  recordFields(record, ctx);
  const key = keysOf(record)[0];
  const label = cleanLabel(blockLabel(record)) ?? (key ? ctx.fields.labelOf(key) : undefined);
  const block = scriptBlock(record, label, at.parent !== 'row', ctx);
  if (!block) return { blocks: [], outcome: 'dropped', sentence: t('statblockEditor.fs.notCopied') };
  return { blocks: [block], outcome: 'script' };
}
