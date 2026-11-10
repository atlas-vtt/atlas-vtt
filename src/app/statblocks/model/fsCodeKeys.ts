import { BLOCK_CATALOGUE } from './blockCatalogue';
import type { BlockType, StatblockTemplate } from './templateTypes';

/**
 * A key under which Fantasy Statblocks keeps JavaScript. Without `blockType`
 * or `list` it is code wherever it sits.
 */
export interface CodeKeyRule {
  key: string;
  /** Code only in a block of this FS type; an Atlas block counts as the type it exports to. */
  blockType?: string;
  /** Code only in an item of the list held under this key. */
  list?: string;
}

/** The one list of FS code-bearing keys (§6.5); `fs/` and `bundles/` both read it. */
export const FS_CODE_KEYS: readonly CodeKeyRule[] = [
  { key: 'callback' }, // property, saves, traits, spells, action
  { key: 'diceCallback' },
  { key: 'diceParsing' }, // layout level: a list of `{ regex, parser }`
  { key: 'modifier', blockType: 'table' },
  { key: 'code', blockType: 'javascript' },
  { key: 'condition', list: 'conditions' }, // the branches of an `ifelse`
  { key: 'parser', list: 'diceParsing' },
];

/** Where a key sits. Without it only the keys that are code everywhere count. */
export interface CodeContext {
  blockType?: string | undefined;
  list?: string | undefined;
}

/** A path into a value: object keys and list indexes. */
export type CodePath = readonly (string | number)[];

/** Deeper than any template; a subtree past it cannot be checked, so it counts as code. */
const MAX_DEPTH = 64;
const DROP = Symbol('drop');

export function isCodeKey(key: string, context: CodeContext = {}): boolean {
  return FS_CODE_KEYS.some((rule) => rule.key === key
    && (rule.blockType === undefined || rule.blockType === context.blockType)
    && (rule.list === undefined || rule.list === context.list));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/** The FS type a record stands for: an Atlas block's export type, else its own `type`. */
function fsTypeOf(record: Record<string, unknown>): string | undefined {
  const type = record.type;
  if (typeof type !== 'string') return undefined;
  if (Object.hasOwn(BLOCK_CATALOGUE, type)) return BLOCK_CATALOGUE[type as BlockType].fsType ?? type;
  return type;
}

/** An Atlas `script` block: FS JavaScript kept whole, so it is code as a whole. */
function isScriptBlock(record: Record<string, unknown>): boolean {
  return record.type === 'script';
}

interface Place {
  /** The key of the list the value is an item of. */
  list: string | undefined;
  /** The block type an `fsExtras` record takes from its block. */
  blockType: string | undefined;
}

const NOWHERE: Place = { list: undefined, blockType: undefined };

function childPlace(key: string, blockType: string | undefined): Place {
  return { list: undefined, blockType: key === 'fsExtras' ? blockType : undefined };
}

function collect(value: unknown, path: CodePath, place: Place, depth: number, found: CodePath[]): void {
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) { found.push(path); return; }
    const list = typeof path[path.length - 1] === 'string' ? String(path[path.length - 1]) : undefined;
    value.forEach((item, index) => collect(item, [...path, index], { list, blockType: undefined }, depth + 1, found));
    return;
  }
  if (!isRecord(value)) return;
  if (depth >= MAX_DEPTH || isScriptBlock(value)) { found.push(path); return; }
  const blockType = fsTypeOf(value) ?? place.blockType;
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    if (isCodeKey(key, { blockType, list: place.list })) found.push([...path, key]);
    else collect(child, [...path, key], childPlace(key, blockType), depth + 1, found);
  }
}

/**
 * Every place code sits in a value, a template or anything inside one: code
 * keys in blocks, `fsExtras`, `importedFrom.extras` and unknown keys, and
 * whole `script` blocks. `stripCode` removes exactly these.
 */
export function findCode(value: unknown): CodePath[] {
  const found: CodePath[] = [];
  collect(value, [], NOWHERE, 0, found);
  return found;
}

function strip(value: unknown, key: string | undefined, place: Place, depth: number): unknown {
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return DROP;
    return value
      .map((item) => strip(item, undefined, { list: key, blockType: undefined }, depth + 1))
      .filter((item) => item !== DROP);
  }
  if (!isRecord(value)) return value;
  if (depth >= MAX_DEPTH || isScriptBlock(value)) return DROP;
  const blockType = fsTypeOf(value) ?? place.blockType;
  const copy: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(value)) {
    if (child !== undefined && isCodeKey(childKey, { blockType, list: place.list })) continue;
    const stripped = strip(child, childKey, childPlace(childKey, blockType), depth + 1);
    if (stripped !== DROP) copy[childKey] = stripped;
  }
  return copy;
}

/**
 * A deep copy without code: `script` blocks leave the lists that hold them and
 * every code-bearing key is removed. A script block given on its own leaves
 * nothing (undefined).
 */
export function stripCode(value: StatblockTemplate): StatblockTemplate;
export function stripCode(value: unknown): unknown;
export function stripCode(value: unknown): unknown {
  const stripped = strip(value, undefined, NOWHERE, 0);
  return stripped === DROP ? undefined : stripped;
}
