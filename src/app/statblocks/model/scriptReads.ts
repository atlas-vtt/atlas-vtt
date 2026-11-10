/**
 * What a `script` block reads of a statblock. Atlas never runs Fantasy Statblocks' JavaScript
 * (§6.5), so the card shows a script's part as the values it reads that no other part of the card
 * shows for that statblock, each in the block the auto template gives its field: no value of a
 * statblock is hidden behind code. Pure: no React, no Obsidian.
 */

import { isPlainRecord } from '../values/fieldValueOf';
import { blockFor } from './autoTemplate';
import { createBlock } from './blockCatalogue';
import { fieldByKey, labelFromKey } from './fieldKeys';
import { findCode, type CodePath } from './fsCodeKeys';
import { keysShownBy } from './fieldOps';
import { isReservedKey } from './reservedKeys';
import { shownHeaderParts } from './templateHeader';
import type { FieldKey, ScriptBlock, StatblockTemplate, TemplateBlock } from './templateTypes';
import { flattenReadingOrder } from './treeQueries';

const READ_KEY = /\bmonster\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)|\bmonster\s*\[\s*(["'])([^"'\n]{1,64})\2\s*\]/g;
/** Deeper than any layout; what lies past it is not read. */
const MAX_DEPTH = 32;

/** The keys code reads from the creature (`monster.hp`, `monster["hit_dice"]`), in order of first use. */
export function codeFieldRefs(code: string): FieldKey[] {
  const keys: FieldKey[] = [];
  for (const match of code.matchAll(READ_KEY)) {
    const key = match[1] ?? match[3];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function valueAt(root: unknown, path: CodePath): unknown {
  return path.reduce<unknown>((value, step) => {
    if (typeof step === 'number') return Array.isArray(value) ? value[step] : undefined;
    return isPlainRecord(value) && Object.hasOwn(value, step) ? value[step] : undefined;
  }, root);
}

/** The keys the blocks inside a kept FS block show (`properties`), it included. */
function shownKeys(value: unknown, depth: number, keys: Set<FieldKey>): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(value)) {
    for (const item of value) shownKeys(item, depth + 1, keys);
    return;
  }
  if (!isPlainRecord(value)) return;
  const properties = Object.hasOwn(value, 'properties') ? value.properties : undefined;
  if (Array.isArray(properties)) {
    for (const key of properties) {
      if (typeof key === 'string' && key !== '') keys.add(key);
    }
  }
  for (const child of Object.values(value)) shownKeys(child, depth + 1, keys);
}

/** The keys a Fantasy Statblocks block kept in a script reads: those its code reads, then those it and the blocks inside it show. */
export function scriptFieldRefs(fs: Readonly<Record<string, unknown>>): FieldKey[] {
  const keys = new Set<FieldKey>();
  for (const path of findCode(fs)) {
    const code = valueAt(fs, path);
    if (typeof code === 'string') for (const key of codeFieldRefs(code)) keys.add(key);
  }
  shownKeys(fs, 0, keys);
  return [...keys];
}

/** The block a script shows a key in: the auto template's for its field, else a labelled line. */
function readBlock(template: StatblockTemplate, key: FieldKey, id: string): TemplateBlock {
  const field = fieldByKey(template.fields, key);
  return field ? blockFor(field, () => id) : { ...createBlock('stat', () => id, key), label: labelFromKey(key) };
}

/** A value a script reads, in the block it shows in, and the other blocks of the card that show it too. */
export interface ScriptRead {
  block: TemplateBlock;
  /** The script shows the value only while none of these shows. */
  shownBy: readonly TemplateBlock[];
}

const NONE: ReadonlyMap<string, readonly ScriptRead[]> = new Map();
const READS = new WeakMap<StatblockTemplate, ReadonlyMap<string, readonly ScriptRead[]>>();

/**
 * For each script block of the template, by its id, a block for every key it reads, in the order
 * it reads them, with the other blocks of the card that show that key: a statblock shows the value
 * in the script's place only where none of those shows. A key two scripts read is the first's.
 * Their ids are the script's with the key's place (`b6scrip0~0`), so they never meet the layout's.
 */
export function scriptReads(template: StatblockTemplate): ReadonlyMap<string, readonly ScriptRead[]> {
  const known = READS.get(template);
  if (known) return known;
  const blocks = flattenReadingOrder(template.layout.blocks);
  const scripts = blocks.filter((block): block is ScriptBlock => block.type === 'script');
  if (scripts.length === 0) return NONE;
  const others = [...shownHeaderParts(template).map((part) => part.block), ...blocks.filter((block) => block.type !== 'script')];
  const showing = new Map<FieldKey, TemplateBlock[]>();
  for (const block of others) for (const key of keysShownBy(block)) showing.set(key, [...(showing.get(key) ?? []), block]);
  const taken = new Set<FieldKey>();
  const reads = new Map<string, readonly ScriptRead[]>();
  for (const script of scripts) {
    const keys = scriptFieldRefs(script.fs).filter((key) => !taken.has(key) && !isReservedKey(key));
    for (const key of keys) taken.add(key);
    reads.set(script.id, keys.map((key, index) => ({ block: readBlock(template, key, `${script.id}~${index}`), shownBy: showing.get(key) ?? [] })));
  }
  READS.set(template, reads);
  return reads;
}
