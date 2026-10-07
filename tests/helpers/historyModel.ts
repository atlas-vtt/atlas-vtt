import { HISTORY_LIMIT } from '../../src/app/stores/history';

/**
 * A naive model of the undo history for the property tests: ordered arrays of entries, written
 * from the rules of what undo and redo do, without the implementation's code. Every record has
 * an identity, so the model knows where the store must give back the very same objects.
 */

export type Ref = { readonly v: number };
export type Entries = readonly (readonly [string, Ref])[];
export interface Branch { readonly id: number; readonly entries: Entries }
export interface ModelObjects { readonly id: number; readonly tokens: Branch; readonly zones: Branch | null }
export interface ModelState { readonly objects: ModelObjects; readonly grid: Ref | null }
export interface ModelStep { readonly before: ModelState; readonly after: ModelState }
export type CollectionName = 'tokens' | 'zones';

let identities = 1;
const nextId = (): number => (identities += 1);
const EMPTY: Branch = { id: 0, entries: [] };

const isIndex = (key: string): boolean => /^(0|[1-9]\d*)$/.test(key) && Number(key) < 4294967295;
/** The order an object keeps its keys in: integer-like keys first, ascending, then the others as added. */
export function engineOrder(entries: Entries): Entries {
  const indices = entries.filter(([key]) => isIndex(key)).sort((a, b) => Number(a[0]) - Number(b[0]));
  return [...indices, ...entries.filter(([key]) => !isIndex(key))];
}

const has = (entries: Entries, key: string): boolean => entries.some(([k]) => k === key);
const valueOf = (entries: Entries, key: string): Ref | undefined => entries.find(([k]) => k === key)?.[1];
const sameEntries = (a: Entries, b: Entries): boolean => a.length === b.length && a.every(([k, v], i) => b[i]![0] === k && b[i]![1] === v);

export const initialModel = (): ModelState => ({ objects: { id: nextId(), tokens: { id: nextId(), entries: [] }, zones: null }, grid: null });

/** A write the GM or Atlas makes: the collection's entries become `entries` (absent when null). */
export function written(state: ModelState, name: CollectionName, entries: Entries | null): ModelState {
  const branch = entries === null ? null : { id: nextId(), entries: engineOrder(entries) };
  const objects = name === 'tokens' ? { ...state.objects, tokens: branch! } : { ...state.objects, zones: branch };
  return { ...state, objects: { ...objects, id: nextId() } };
}

export const entriesOf = (state: ModelState, name: CollectionName): Entries | null => (name === 'tokens' ? state.objects.tokens.entries : state.objects.zones?.entries ?? null);

/** The entries of `current`, moved towards `to` by what changed between `from` and `to`. */
function towardsEntries(current: Entries, from: Entries, to: Entries): Entries {
  const kept = from.map(([k]) => k).filter((k) => has(to, k));
  const keptInTo = to.map(([k]) => k).filter((k) => has(from, k));
  const reordered = kept.join('\u0000') !== keptInTo.join('\u0000');
  const keys = [...new Set([...from.map(([k]) => k), ...to.map(([k]) => k)])];
  const changed = reordered ? keys : keys.filter((k) => has(from, k) !== has(to, k) || valueOf(from, k) !== valueOf(to, k));
  let result = [...current];
  const placed: [number, string, Ref][] = [];
  const index = (k: string): number => to.findIndex(([key]) => key === k);
  for (const key of changed) {
    const target = valueOf(to, key);
    const value = valueOf(from, key) === target && has(from, key) ? valueOf(current, key) : target;
    if (!has(to, key)) result = result.filter(([k]) => k !== key);
    else if (has(current, key) && !reordered) result = result.map(([k, v]) => [k, k === key ? value! : v] as const);
    else if (has(current, key)) {
      result = result.filter(([k]) => k !== key);
      placed.push([index(key), key, value!]);
    } else if (!(has(from, key) && valueOf(from, key) === target)) placed.push([index(key), key, target!]);
  }
  for (const [at, key, value] of placed.sort((a, b) => a[0] - b[0])) result.splice(Math.min(at, result.length), 0, [key, value]);
  return engineOrder(result);
}

function towardsBranch(current: Branch, from: Branch, to: Branch): Branch {
  if (from.id === to.id) return current;
  if (current.id === from.id) return to;
  const entries = towardsEntries(current.entries, from.entries, to.entries);
  return sameEntries(entries, current.entries) ? current : { id: nextId(), entries };
}

function towardsObjects(current: ModelObjects, from: ModelObjects, to: ModelObjects): ModelObjects {
  if (from.id === to.id) return current;
  if (current.id === from.id) return to;
  const tokens = from.tokens.id === to.tokens.id ? current.tokens : towardsBranch(current.tokens, from.tokens, to.tokens);
  let zones = current.zones;
  if ((from.zones?.id ?? null) !== (to.zones?.id ?? null)) {
    const merged = towardsBranch(current.zones ?? EMPTY, from.zones ?? EMPTY, to.zones ?? EMPTY);
    // A collection absent on the step's side goes only once nothing others added is left in it.
    zones = to.zones === null && (current.zones === null || merged.entries.length === 0) ? null : merged;
  }
  if (tokens === current.tokens && zones === current.zones) return current;
  return { id: nextId(), tokens, zones };
}

/** The state moved towards `to` by what changed between `from` and `to`. */
export function restoreModel(current: ModelState, from: ModelState, to: ModelState): ModelState {
  return { objects: towardsObjects(current.objects, from.objects, to.objects), grid: from.grid === to.grid ? current.grid : to.grid };
}

const sameState = (a: ModelState, b: ModelState): boolean => a.objects.id === b.objects.id && a.grid === b.grid;

/** The history's rules, step by step, as the model keeps them. */
export class HistoryModel {
  state = initialModel();
  past: ModelStep[] = [];
  future: ModelStep[] = [];
  tracking = true;
  depth = 0;
  private start: ModelState | null = null;
  private mark: ModelState | null = null;

  write(next: ModelState, gm: boolean): void {
    const before = this.state;
    this.state = next;
    if (gm && this.tracking && this.depth === 0 && !sameState(before, next)) this.push({ before, after: next });
  }

  private fold(target: ModelState): void {
    if (!this.mark || sameState(this.mark, target)) return;
    const last = this.past[this.past.length - 1];
    const next = this.future[this.future.length - 1];
    if (last) this.past[this.past.length - 1] = { before: last.before, after: restoreModel(last.after, this.mark, target) };
    if (next) this.future[this.future.length - 1] = { before: restoreModel(next.before, this.mark, target), after: next.after };
    this.mark = target;
  }

  private push(step: ModelStep): void {
    this.fold(step.before);
    this.past = [...this.past, step].slice(-HISTORY_LIMIT);
    this.future = [];
    if (this.mark) this.mark = step.after;
  }

  begin(): void {
    if (this.depth === 0) this.start = this.mark = this.state;
    this.depth += 1;
  }

  end(): void {
    if (this.depth === 0) return;
    this.depth -= 1;
    if (this.depth > 0) return;
    const begun = this.start;
    this.start = null;
    if (begun && this.tracking && !sameState(begun, this.state)) this.push({ before: begun, after: this.state });
    this.close();
  }

  abandon(): void {
    if (this.depth === 0) return;
    this.depth -= 1;
    if (this.depth > 0) return;
    this.start = null;
    this.close();
  }

  discard(): void {
    if (this.depth === 0) return;
    this.depth = 0;
    this.start = null;
    this.close();
  }

  private close(): void {
    this.fold(this.state);
    this.mark = null;
  }

  /** Whether the next undo or redo starts from its step's own side: nothing else wrote since. */
  startsFromStep(direction: 'undo' | 'redo'): boolean {
    this.fold(this.state);
    const step = (direction === 'undo' ? this.past : this.future).at(-1);
    return !!step && sameState(this.state, direction === 'undo' ? step.after : step.before);
  }

  /** Undo or redo; returns the step as it was applied, after any fold. */
  travel(direction: 'undo' | 'redo'): ModelStep | null {
    const source = direction === 'undo' ? this.past : this.future;
    if (source.length === 0) return null;
    this.fold(this.state);
    const step = (direction === 'undo' ? this.past : this.future).pop()!;
    this.state = direction === 'undo' ? restoreModel(this.state, step.after, step.before) : restoreModel(this.state, step.before, step.after);
    (direction === 'undo' ? this.future : this.past).push(step);
    if (this.mark) this.mark = this.state;
    return step;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.depth = 0;
    this.start = this.mark = null;
  }
}
