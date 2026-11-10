import type { FieldKey, FieldValue } from '../model/templateTypes';
import { deepEqual, findItemIndex, isFieldMap, matchingIndexes } from './listIdentity';
import type { FieldPath, NotePatch } from './patchTypes';
import type { FrontmatterModel } from './yamlDocument';

/**
 * What a patch means for the values a frontmatter holds, decided on plain values before any
 * text is touched. A patch whose goal already holds is `unchanged` (so every patch can be applied
 * twice); one whose base no longer holds is a `conflict`.
 *
 * Index paths (`['actions', 2, 'desc']`): the item is found by the value at the path. If index 2
 * still holds `base` there, that item is written. Otherwise the one other item holding `base` at
 * the same place is (the list was reordered); none or several is a conflict, as is an absent
 * `base`, which tells no item from another. A path that ends at the item (`['actions', 2]`)
 * compares the whole item and takes the nearest equal one.
 */
export type PatchPlan =
  | { kind: 'conflict' }
  | { kind: 'unchanged' }
  | { kind: 'set'; path: FieldPath; value: FieldValue; model: FrontmatterModel }
  | { kind: 'delete'; path: FieldPath; model: FrontmatterModel }
  | { kind: 'insert'; list: FieldKey; index: number; item: FieldValue; model: FrontmatterModel }
  | { kind: 'remove'; list: FieldKey; index: number; model: FrontmatterModel }
  | { kind: 'move'; list: FieldKey; from: number; to: number; model: FrontmatterModel }
  | { kind: 'rename'; from: FieldKey; to: FieldKey; dropFrom: boolean; model: FrontmatterModel };

/** What a path holds: a value, nothing (`absent`), or a value of the wrong kind on the way (`blocked`). */
export type Lookup = { kind: 'value'; value: FieldValue } | { kind: 'absent'; at: number } | { kind: 'blocked' };

const CONFLICT: PatchPlan = { kind: 'conflict' };
const UNCHANGED: PatchPlan = { kind: 'unchanged' };

export function planPatch(model: FrontmatterModel, patch: NotePatch): PatchPlan {
  switch (patch.op) {
    case 'set': return planSet(model, patch.path, patch.base, patch.next);
    case 'delete': return planDelete(model, patch.path, patch.base);
    case 'insert': return planInsert(model, patch.list, patch.after, patch.item);
    case 'remove': return planRemove(model, patch.list, patch.item);
    case 'move': return planMove(model, patch.list, patch.item, patch.after);
    case 'renameKey': return planRename(model, patch.from, patch.to);
  }
}

export function lookup(model: FrontmatterModel, path: FieldPath): Lookup {
  let current: FieldValue = model;
  for (let depth = 0; depth < path.length; depth++) {
    const segment = path[depth];
    let next: FieldValue | undefined;
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return { kind: 'blocked' };
      next = current[segment];
    } else {
      if (!isFieldMap(current) || segment === undefined) return { kind: 'blocked' };
      next = Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined;
    }
    if (next === undefined) return { kind: 'absent', at: depth };
    current = next;
  }
  return { kind: 'value', value: current };
}

function planSet(model: FrontmatterModel, path: FieldPath, base: FieldValue | undefined, next: FieldValue): PatchPlan {
  if (!isValidPath(path)) return CONFLICT;
  const target = locate(model, path, base);
  if (!target) return holds(lookup(model, path), next) ? UNCHANGED : CONFLICT;
  const found = lookup(model, target);
  if (holds(found, next)) return UNCHANGED;
  if (!isWritable(found, target)) return CONFLICT;
  return { kind: 'set', path: target, value: next, model: withValue(model, target, next) };
}

function planDelete(model: FrontmatterModel, path: FieldPath, base: FieldValue): PatchPlan {
  if (!isValidPath(path)) return CONFLICT;
  const target = locate(model, path, base);
  if (target) return { kind: 'delete', path: target, model: withoutValue(model, target) };
  return lookup(model, path).kind === 'absent' ? UNCHANGED : CONFLICT;
}

function planInsert(model: FrontmatterModel, list: FieldKey, after: FieldValue | null, item: FieldValue): PatchPlan {
  const found = topLevel(model, list);
  if (found.kind === 'absent' && after === null) return { kind: 'insert', list, index: 0, item, model: withValue(model, [list], [item]) };
  if (found.kind !== 'value' || !Array.isArray(found.value)) return CONFLICT;
  const items = found.value;
  const index = after === null ? 0 : findItemIndex(items, after) + 1;
  if (index === 0 && after !== null) return CONFLICT;
  if (deepEqual(items[index], item)) return UNCHANGED;
  return { kind: 'insert', list, index, item, model: withValue(model, [list], spliced(items, index, 0, item)) };
}

function planRemove(model: FrontmatterModel, list: FieldKey, item: FieldValue): PatchPlan {
  const found = topLevel(model, list);
  if (found.kind === 'absent') return UNCHANGED;
  if (found.kind !== 'value' || !Array.isArray(found.value)) return CONFLICT;
  const index = findItemIndex(found.value, item);
  if (index < 0) return UNCHANGED;
  return { kind: 'remove', list, index, model: withValue(model, [list], spliced(found.value, index, 1)) };
}

function planMove(model: FrontmatterModel, list: FieldKey, item: FieldValue, after: FieldValue | null): PatchPlan {
  const found = topLevel(model, list);
  if (found.kind !== 'value' || !Array.isArray(found.value)) return CONFLICT;
  const items = found.value;
  const from = findItemIndex(items, item);
  const moved = items[from];
  if (moved === undefined) return CONFLICT;
  const rest = spliced(items, from, 1);
  const to = after === null ? 0 : findItemIndex(rest, after) + 1;
  if (to === 0 && after !== null) return CONFLICT;
  const reordered = spliced(rest, to, 0, moved);
  if (deepEqual(reordered, items)) return UNCHANGED;
  return { kind: 'move', list, from, to, model: withValue(model, [list], reordered) };
}

function planRename(model: FrontmatterModel, from: FieldKey, to: FieldKey): PatchPlan {
  const source = topLevel(model, from);
  if (from === to || source.kind === 'absent') return UNCHANGED;
  const target = topLevel(model, to);
  if (source.kind !== 'value' || target.kind === 'blocked') return CONFLICT;
  if (target.kind === 'value') {
    if (!deepEqual(target.value, source.value)) return CONFLICT;
    return { kind: 'rename', from, to, dropFrom: true, model: withoutValue(model, [from]) };
  }
  return { kind: 'rename', from, to, dropFrom: false, model: withValue(withoutValue(model, [from]), [to], source.value) };
}

/** The concrete path whose value is `base`, by the identity rule above; null if none is. */
function locate(model: FrontmatterModel, path: FieldPath, base: FieldValue | undefined): FieldPath | null {
  if (matchesBase(lookup(model, path), base)) return path;
  const at = path.findIndex((segment) => typeof segment === 'number');
  const preferred = path[at];
  if (base === undefined || typeof preferred !== 'number') return null;
  const list = lookup(model, path.slice(0, at));
  if (list.kind !== 'value' || !Array.isArray(list.value)) return null;
  const pathWith = (index: number): FieldPath => [...path.slice(0, at), index, ...path.slice(at + 1)];
  if (at === path.length - 1) {
    const index = findItemIndex(list.value, base, preferred);
    return index < 0 ? null : pathWith(index);
  }
  const candidates = matchingIndexes(list.value, (index) => matchesBase(lookup(model, pathWith(index)), base));
  const [only] = candidates;
  return candidates.length === 1 && only !== undefined ? pathWith(only) : null;
}

function matchesBase(found: Lookup, base: FieldValue | undefined): boolean {
  if (base === undefined) return found.kind === 'absent';
  return found.kind === 'value' && deepEqual(found.value, base);
}

function holds(found: Lookup, value: FieldValue): boolean {
  return found.kind === 'value' && deepEqual(found.value, value);
}

/**
 * A value may replace another, fill a key missing from an existing map, or create a missing
 * top-level key together with the maps a longer path runs through. Lists never grow by `set`.
 */
function isWritable(found: Lookup, path: FieldPath): boolean {
  if (found.kind !== 'absent') return found.kind === 'value';
  if (found.at === 0) return path.every((segment) => typeof segment === 'string');
  return found.at === path.length - 1 && typeof path[found.at] === 'string';
}

function isValidPath(path: FieldPath): boolean {
  return typeof path[0] === 'string' && path.every((segment) =>
    typeof segment === 'string' ? segment !== '__proto__' : Number.isInteger(segment) && segment >= 0);
}

function topLevel(model: FrontmatterModel, key: FieldKey): Lookup {
  return key === '__proto__' ? { kind: 'blocked' } : lookup(model, [key]);
}

function withValue(model: FrontmatterModel, path: FieldPath, value: FieldValue): FrontmatterModel {
  const updated = setIn(model, path, value);
  return isFieldMap(updated) ? updated : model;
}

function withoutValue(model: FrontmatterModel, path: FieldPath): FrontmatterModel {
  const updated = deleteIn(model, path);
  return isFieldMap(updated) ? updated : model;
}

function setIn(container: FieldValue | undefined, path: FieldPath, value: FieldValue): FieldValue {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (typeof head === 'number') {
    const list = Array.isArray(container) ? container : [];
    return spliced(list, head, 1, setIn(list[head], rest, value));
  }
  const map = isFieldMap(container) ? container : {};
  return { ...map, [head]: setIn(map[head], rest, value) };
}

function deleteIn(container: FieldValue, path: FieldPath): FieldValue {
  const [head, ...rest] = path;
  if (head === undefined) return container;
  if (typeof head === 'number') {
    if (!Array.isArray(container)) return container;
    const item = container[head];
    if (item === undefined) return container;
    return rest.length === 0 ? spliced(container, head, 1) : spliced(container, head, 1, deleteIn(item, rest));
  }
  if (!isFieldMap(container)) return container;
  const entries = Object.entries(container);
  if (rest.length === 0) return Object.fromEntries(entries.filter(([key]) => key !== head));
  return Object.fromEntries(entries.map(([key, item]) => [key, key === head ? deleteIn(item, rest) : item]));
}

function spliced(list: readonly FieldValue[], start: number, remove: number, ...insert: FieldValue[]): FieldValue[] {
  return [...list.slice(0, start), ...insert, ...list.slice(start + remove)];
}
