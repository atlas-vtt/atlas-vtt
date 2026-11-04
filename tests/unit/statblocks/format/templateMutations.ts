/**
 * Seeded mutations of template files for the property and fuzz tests. Every
 * random choice comes from `mulberry32`, so a failing seed reproduces.
 */

import { expect } from 'vitest';
import { isBlockId } from '../../../../src/app/statblocks/format/blockIds';
import { isReservedKey } from '../../../../src/app/statblocks/model/reservedKeys';
import {
  FIELD_MEANINGS,
  FIELD_TYPES,
  type StatblockTemplate,
  type TemplateBlock,
} from '../../../../src/app/statblocks/model/templateTypes';

export type Random = () => number;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function int(random: Random, max: number): number {
  return Math.floor(random() * max);
}

export function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[int(random, items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

const STRINGS = [
  '', 'text', 'run-in', 'stacked', 'section', 'row', 'title', 'opaque', 'builtin:generic', 'hp', 'tags', 'statblock',
  '{hp}', '[', 'ÄÖÜ ✓', '0', '__proto__', 'constructor', 'aaaaaaaa', 'UPPERCASE', 'callback', 'diceCallback',
];
const KEYS = [
  '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'blocks', 'type', 'id', 'field', 'fields', 'key', 'raw',
  'level', 'look', '', '0', '7', 'future', 'callback', 'layout', 'version', 'format', 'showWhen', 'columns',
];
const BLOCK_TYPES = ['tabs', 'carousel', 'chart', 'opaque', 'Section', '', 'section', 'row', 'script', 'stat'];

/** A random JSON value; deeper calls build smaller containers. */
export function randomValue(random: Random, depth = 0): Json {
  const roll = int(random, depth > 2 ? 6 : 9);
  switch (roll) {
    case 0: return null;
    case 1: return random() < 0.5;
    case 2: return int(random, 2000) - 1000;
    case 3: return random() * 1e6 - 5e5;
    case 4: return pick(random, STRINGS);
    case 5: return pick(random, [0, 1, 2, 3, 4, -1, 1.5]);
    case 6: return Array.from({ length: int(random, 4) }, () => randomValue(random, depth + 1));
    case 7: return Object.fromEntries(Array.from({ length: int(random, 4) }, () => [pick(random, KEYS), randomValue(random, depth + 1)]));
    default: return pick(random, STRINGS) + String(int(random, 100));
  }
}

function isObject(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every object and list inside `root`, the root included. */
function containers(root: Json): (Json[] | { [key: string]: Json })[] {
  const found: (Json[] | { [key: string]: Json })[] = [];
  const stack: Json[] = [root];
  while (stack.length > 0 && found.length < 5000) {
    const value = stack.pop();
    if (value === undefined || value === null || typeof value !== 'object') continue;
    found.push(value);
    stack.push(...(Array.isArray(value) ? value : Object.values(value)));
  }
  return found;
}

function nested(random: Random, depth: number): Json {
  let value: Json = randomValue(random, 3);
  for (let level = 0; level < depth; level += 1) value = random() < 0.5 ? [value] : { blocks: [value], type: 'section' };
  return value;
}

function nestedSections(depth: number): Json {
  let block: Json = { type: 'title', field: 'name' };
  for (let level = 0; level < depth; level += 1) block = { type: level % 2 ? 'row' : 'section', blocks: [block] };
  return block;
}

function setSomewhere(random: Random, root: Json, value: (random: Random) => Json): void {
  const target = pick(random, containers(root));
  if (Array.isArray(target)) {
    if (target.length === 0 || random() < 0.3) target.push(value(random));
    else target[int(random, target.length)] = value(random);
    return;
  }
  const keys = Object.keys(target);
  const key = keys.length > 0 && random() < 0.6 ? pick(random, keys) : pick(random, KEYS);
  Object.defineProperty(target, key, { value: value(random), enumerable: true, writable: true, configurable: true });
}

const MUTATIONS: ((random: Random, root: Json) => void)[] = [
  // Delete a key or a list entry.
  (random, root) => {
    const target = pick(random, containers(root));
    if (Array.isArray(target)) target.splice(int(random, target.length + 1), 1);
    else if (Object.keys(target).length > 0) delete target[pick(random, Object.keys(target))];
  },
  // Change a value's type, or insert garbage under a known or unknown key.
  (random, root) => setSomewhere(random, root, (r) => randomValue(r)),
  (random, root) => setSomewhere(random, root, (r) => randomValue(r)),
  // A block type this Atlas does not know.
  (random, root) => {
    const blocks = containers(root).filter((value): value is { [key: string]: Json } => isObject(value) && 'type' in value);
    if (blocks.length > 0) pick(random, blocks).type = pick(random, BLOCK_TYPES);
  },
  // Deep nesting: plain JSON, or blocks nested far past the depth limit.
  (random, root) => setSomewhere(random, root, (r) => nested(r, 20 + int(r, 300))),
  (random, root) => setSomewhere(random, root, (r) => nestedSections(10 + int(r, 120))),
  // A huge string.
  (random, root) => setSomewhere(random, root, (r) => 'x'.repeat(50_000 + int(r, 200_000))),
  // Wrong, duplicate and reserved ids.
  (random, root) => {
    const withIds = containers(root).filter((value): value is { [key: string]: Json } => isObject(value) && 'id' in value);
    if (withIds.length === 0) return;
    const ids = withIds.map((value) => value.id ?? null);
    pick(random, withIds).id = pick(random, [...ids, 'builtin:x', 'UPPER-123456', '', 12, null, 'zz', 'k7m2qa00', 'x'.repeat(300)]);
  },
  // Duplicate a list entry (duplicate field keys and block ids).
  (random, root) => {
    const lists = containers(root).filter((value): value is Json[] => Array.isArray(value) && value.length > 0);
    if (lists.length === 0) return;
    const list = pick(random, lists);
    list.splice(int(random, list.length), 0, structuredClone(pick(random, list)));
  },
  // Version and format.
  (random, root) => {
    if (isObject(root)) root.version = pick(random, [0, -1, 1.5, '1', 2, 999, null, 1, 1]);
  },
  (random, root) => {
    if (isObject(root) && random() < 0.3) root.format = pick(random, ['atlas-statblock', '', null, 1]);
  },
];

/** A copy of `file` with 1–4 random mutations. */
export function mutated(random: Random, file: Json): Json {
  const root = structuredClone(file);
  const count = 1 + int(random, 4);
  for (let step = 0; step < count; step += 1) pick(random, MUTATIONS)(random, root);
  return root;
}

export function fileOf(text: string): Json {
  const value: Json = JSON.parse(text) as Json;
  return value;
}

/** `value` as JSON sees it: without the symbol that carries kept file values. */
export function plain(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function blocksOf(blocks: readonly TemplateBlock[]): TemplateBlock[] {
  return blocks.flatMap((block) => (block.type === 'section' || block.type === 'row' ? [block, ...blocksOf(block.blocks)] : [block]));
}

/** What every parsed template guarantees, however broken its file was. */
export function expectSound(template: StatblockTemplate): void {
  const ids = blocksOf(template.layout.blocks).map((block) => block.id);
  expect(ids.every(isBlockId)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  const keys = template.fields.map((field) => field.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const field of template.fields) {
    expect(field.key.length).toBeGreaterThan(0);
    expect(isReservedKey(field.key)).toBe(false);
    expect(FIELD_TYPES).toContain(field.type);
    if (field.meaning !== undefined) expect(FIELD_MEANINGS).toContain(field.meaning);
  }
  expect([1, 2, 3]).toContain(template.layout.maxColumns);
}
