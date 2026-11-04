import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { int, pick } from './patchTestKit';
import type { NoteEntry } from './randomNotes';

/**
 * Random patches against a model, each made to apply (`fresh`), to already hold (`noop`) or to
 * be stale (`stale`), with the model a fresh patch leaves. The expectations are decided here,
 * independently of the patcher's own planning.
 */

export type Model = Record<string, FieldValue>;
export type Expectation = 'fresh' | 'noop' | 'stale';

export interface PlannedPatch {
  patch: NotePatch;
  expect: Expectation;
  /** Top-level keys whose lines the patch may change. */
  touches: string[];
  /** The model after the patch (the same model unless fresh). */
  model: Model;
}

const NEXT_VALUES: FieldValue[] = [
  'Hobgoblin', 'yes', 'no', 'on', '2024-05-01', '1:30', '12', '', ' padded ', 'a: b', '# not a comment', '- dash',
  '[[Other note]]', 'Ünïcödé ✓', 'two\nlines', 'trailing newline\n', 'tab\tinside', 'quote " and \' marks', 'x'.repeat(130),
  'line\r\nbreak', 42, -7, 3.25, 0, true, false, null, ['a', 'b'], [1, 2, 3], [], {}, { walk: 30, swim: 10 },
  [{ name: 'Slam', desc: 'Hits hard' }], { nested: { deeper: ['x'] } },
];

let unique = 0;

/** Restarts the numbering of new keys and items, so a case replays the same from its seed alone. */
export function resetUniqueNames(): void {
  unique = 0;
}

export function randomPatch(random: () => number, model: Model, entries: readonly NoteEntry[]): PlannedPatch {
  const kinds = new Map(entries.map((entry) => [entry.key, entry.kind]));
  const keys = Object.keys(model).filter((key) => kinds.get(key) !== 'frozen');
  const lists = keys.filter((key) => hasDistinctItems(model[key]));
  const choice = pick(random, ['set', 'set', 'setNew', 'setNested', 'delete', 'insert', 'remove', 'move', 'rename', 'stale', 'noop']);
  if (choice === 'setNew' || keys.length === 0) return setNew(random, model);
  if (choice === 'setNested') return setNested(random, model, keys) ?? setTop(random, model, keys);
  if ((choice === 'insert' || choice === 'remove' || choice === 'move') && lists.length > 0) return listPatch(random, model, choice, lists);
  if (choice === 'delete') return deleteTop(random, model, keys);
  if (choice === 'rename') return rename(random, model, keys);
  if (choice === 'stale') return stale(random, model, keys);
  if (choice === 'noop') return noop(random, model, keys);
  return setTop(random, model, keys);
}

function setTop(random: () => number, model: Model, keys: string[]): PlannedPatch {
  const key = pick(random, keys);
  const base = model[key];
  const next = nextValue(random, base);
  return { patch: { op: 'set', path: [key], base, next }, expect: 'fresh', touches: [key], model: { ...model, [key]: next } };
}

function setNew(random: () => number, model: Model): PlannedPatch {
  const key = `new-key ${unique++}`;
  const next = nextValue(random, undefined);
  return { patch: { op: 'set', path: [key], base: undefined, next }, expect: 'fresh', touches: [key], model: { ...model, [key]: next } };
}

function setNested(random: () => number, model: Model, keys: string[]): PlannedPatch | null {
  const key = pick(random, keys);
  const value = model[key];
  if (Array.isArray(value) && value.length > 0) {
    const index = int(random, value.length);
    const item = value[index];
    const isEntry = typeof item === 'object' && item !== null && !Array.isArray(item) && typeof item.desc === 'string';
    if (isEntry) {
      const next = `${item.desc} (edited ${unique++})`;
      const list = value.map((other, i) => (i === index ? { ...item, desc: next } : other));
      return { patch: { op: 'set', path: [key, index, 'desc'], base: item.desc, next }, expect: 'fresh', touches: [key], model: { ...model, [key]: list } };
    }
    const next = typeof item === 'number' ? item + 100 + unique++ : `item ${unique++}`;
    const list = value.map((other, i) => (i === index ? next : other));
    return { patch: { op: 'set', path: [key, index], base: item, next }, expect: 'fresh', touches: [key], model: { ...model, [key]: list } };
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const leaf = random() < 0.5 ? pick(random, [...Object.keys(value), 'added']) : 'added';
    const next = nextValue(random, value[leaf]);
    return { patch: { op: 'set', path: [key, leaf], base: value[leaf], next }, expect: 'fresh', touches: [key], model: { ...model, [key]: { ...value, [leaf]: next } } };
  }
  return null;
}

function deleteTop(random: () => number, model: Model, keys: string[]): PlannedPatch {
  const key = pick(random, keys);
  const base = model[key];
  if (base === undefined) throw new Error('missing key');
  const rest = { ...model };
  delete rest[key];
  return { patch: { op: 'delete', path: [key], base }, expect: 'fresh', touches: [key], model: rest };
}

function listPatch(random: () => number, model: Model, kind: 'insert' | 'remove' | 'move', lists: string[]): PlannedPatch {
  const list = pick(random, lists);
  const items = model[list];
  if (!Array.isArray(items)) throw new Error('not a list');
  const touched = (next: FieldValue[]): PlannedPatch['model'] => ({ ...model, [list]: next });
  if (kind === 'insert' || items.length === 0) {
    const item = random() < 0.5 ? `inserted ${unique++}` : { name: `New ${unique++}`, desc: 'Fresh' };
    const at = int(random, items.length + 1);
    const after = at === 0 ? null : items[at - 1] ?? null;
    const next = [...items.slice(0, at), item, ...items.slice(at)];
    return { patch: { op: 'insert', list, after, item }, expect: 'fresh', touches: [list], model: touched(next) };
  }
  const from = int(random, items.length);
  const item = items[from] ?? null;
  const rest = items.filter((_, i) => i !== from);
  if (kind === 'remove') return { patch: { op: 'remove', list, item }, expect: 'fresh', touches: [list], model: touched(rest) };
  const to = int(random, rest.length + 1);
  const next = [...rest.slice(0, to), item, ...rest.slice(to)];
  const moved = JSON.stringify(next) !== JSON.stringify(items);
  return {
    patch: { op: 'move', list, item, after: to === 0 ? null : rest[to - 1] ?? null },
    expect: moved ? 'fresh' : 'noop',
    touches: [list],
    model: touched(next),
  };
}

function rename(random: () => number, model: Model, keys: string[]): PlannedPatch {
  const from = pick(random, keys);
  const to = `renamed ${unique++}`;
  const value = model[from];
  if (value === undefined) throw new Error('missing key');
  const rest = { ...model, [to]: value };
  delete rest[from];
  return { patch: { op: 'renameKey', from, to }, expect: 'fresh', touches: [from, to], model: rest };
}

/** Patches whose base no longer holds, or whose anchor is gone: each must conflict and write nothing. */
function stale(random: () => number, model: Model, keys: string[]): PlannedPatch {
  const key = pick(random, keys);
  const current = model[key];
  const wrong = staleBase(current);
  const next = nextValue(random, current);
  const others = keys.filter((other) => other !== key && JSON.stringify(model[other]) !== JSON.stringify(current));
  const patches: NotePatch[] = [
    { op: 'set', path: [key], base: wrong, next },
    { op: 'set', path: [key], base: undefined, next },
    { op: 'delete', path: [key], base: wrong },
    { op: 'insert', list: key, after: 'no such item', item: 'x' },
    { op: 'move', list: key, item: 'no such item', after: null },
  ];
  if (others.length > 0) patches.push({ op: 'renameKey', from: key, to: pick(random, others) });
  return { patch: pick(random, patches), expect: 'stale', touches: [], model };
}

function hasDistinctItems(value: FieldValue | undefined): boolean {
  return Array.isArray(value) && new Set(value.map((item) => JSON.stringify(item))).size === value.length;
}

/** Patches whose goal already holds: each is applied and writes nothing. */
function noop(random: () => number, model: Model, keys: string[]): PlannedPatch {
  const key = pick(random, keys);
  const current = model[key] ?? null;
  const patches: NotePatch[] = [
    { op: 'set', path: [key], base: staleBase(current), next: current },
    { op: 'delete', path: [`absent ${unique++}`], base: 1 },
    { op: 'renameKey', from: `absent ${unique++}`, to: key },
    { op: 'remove', list: Array.isArray(current) ? key : `absent ${unique++}`, item: 'no such item' },
  ];
  return { patch: pick(random, patches), expect: 'noop', touches: [], model };
}

function staleBase(current: FieldValue | undefined): FieldValue {
  if (typeof current === 'number') return current + 1000;
  if (typeof current === 'string') return `${current} (old)`;
  if (typeof current === 'boolean') return !current;
  if (current === null) return 'was set';
  return 'stale';
}

function nextValue(random: () => number, current: FieldValue | undefined): FieldValue {
  for (;;) {
    const next = pick(random, NEXT_VALUES);
    if (JSON.stringify(next) !== JSON.stringify(current)) return next;
  }
}
