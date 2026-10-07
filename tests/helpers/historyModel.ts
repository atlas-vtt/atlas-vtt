import { HISTORY_LIMIT } from '../../src/app/stores/history';

/**
 * A naive model of the undo history for the property tests, written from the rules of what a
 * step is and what undo and redo do, not from the implementation. A step's change is a list of
 * entity changes (key, value before or absent, value after or absent, place after), worked out
 * from its two sides whenever it is applied. Records carry an identity, so the model knows
 * where the store must give back the very same objects.
 */

/** An entity: a token or zone (compared by identity) or a widget's number. */
export type Value = object | number;
export type Entry = readonly [key: string, value: Value];
/** A record as the store holds it, with the identity its last write gave it. */
export interface Rec { readonly id: number; readonly entries: readonly Entry[] }
export interface ModelObjects { readonly id: number; readonly tokens: Rec; readonly zones: Rec | null }
/** The tracked state: `objects` (tokens, optional light zones), grid, background, widget values, memory edits. */
export interface ModelState {
  readonly objects: ModelObjects;
  readonly grid: object | null;
  readonly background: string | null;
  readonly widgets: Rec;
  readonly edits: number;
}
export interface ModelStep { readonly before: ModelState; readonly after: ModelState }
export type CollectionName = 'tokens' | 'zones' | 'widgets';

export const ABSENT = Symbol('absent');
type Slot = Value | typeof ABSENT;
/** What a step did to one entity: its value on the side undo or redo starts from, on the side it goes to, and its place there. */
export interface EntityChange { readonly key: string; readonly from: Slot; readonly to: Slot; readonly index: number }
export interface ChangeList { readonly changes: readonly EntityChange[]; readonly reordered: boolean }

let identities = 1;
export const newId = (): number => (identities += 1);
const EMPTY: Rec = { id: 0, entries: [] };

const isIndex = (key: string): boolean => /^(0|[1-9]\d*)$/.test(key) && Number(key) < 4294967295;
export const hasIndexKeys = (entries: readonly Entry[]): boolean => entries.some(([key]) => isIndex(key));
/** The order an object keeps its keys in: integer-like keys first, ascending, then the others as added. */
export function engineOrder(entries: readonly Entry[]): Entry[] {
  const indices = entries.filter(([key]) => isIndex(key)).sort((a, b) => Number(a[0]) - Number(b[0]));
  return [...indices, ...entries.filter(([key]) => !isIndex(key))];
}

export const slotOf = (entries: readonly Entry[], key: string): Slot => {
  const entry = entries.find(([k]) => k === key);
  return entry ? entry[1] : ABSENT;
};
const keysOf = (entries: readonly Entry[]): string[] => entries.map(([key]) => key);
const sameEntries = (a: readonly Entry[], b: readonly Entry[]): boolean => a.length === b.length && a.every(([k, v], i) => b[i]![0] === k && b[i]![1] === v);

/**
 * The entity changes between two sides of a step. When the keys both sides hold follow each
 * other differently (an entity deleted and added again), every key of either side counts.
 */
export function changeList(from: readonly Entry[], to: readonly Entry[]): ChangeList {
  const inBothFrom = keysOf(from).filter((key) => slotOf(to, key) !== ABSENT);
  const inBothTo = keysOf(to).filter((key) => slotOf(from, key) !== ABSENT);
  const reordered = inBothFrom.some((key, i) => inBothTo[i] !== key);
  const changes: EntityChange[] = [];
  for (const key of new Set([...keysOf(from), ...keysOf(to)])) {
    const change: EntityChange = { key, from: slotOf(from, key), to: slotOf(to, key), index: keysOf(to).indexOf(key) };
    if (reordered || change.from !== change.to) changes.push(change);
  }
  return { changes, reordered };
}

/**
 * `current` with a step's changes applied: an entity still there takes its new value where it is
 * (unless the step reordered), one missing is placed at its index (lowest first, clamped), one the
 * step removes goes, and the rest stay. An entity the step only moved that is gone stays gone.
 */
export function applyChanges(current: readonly Entry[], { changes, reordered }: ChangeList): Entry[] {
  let result = [...current];
  const placed: { key: string; index: number; value: Value }[] = [];
  for (const change of changes) {
    const now = slotOf(result, change.key);
    if (change.to === ABSENT) {
      result = result.filter(([key]) => key !== change.key);
      continue;
    }
    const onlyMoved = change.from === change.to;
    if (now !== ABSENT && !reordered) {
      result = result.map(([key, value]) => [key, key === change.key ? change.to as Value : value] as const);
    } else if (now !== ABSENT) {
      result = result.filter(([key]) => key !== change.key);
      placed.push({ key: change.key, index: change.index, value: onlyMoved ? now : change.to });
    } else if (!onlyMoved) {
      placed.push({ key: change.key, index: change.index, value: change.to });
    }
  }
  for (const { key, index, value } of placed.sort((a, b) => a.index - b.index)) {
    const at = Math.min(index, result.length);
    result = [...result.slice(0, at), [key, value] as const, ...result.slice(at)];
  }
  return engineOrder(result);
}

/** A record moved towards `to` by what changed between `from` and `to`. */
function towardsRec(current: Rec, from: Rec, to: Rec): Rec {
  if (from.id === to.id) return current;
  if (current.id === from.id) return to;
  const entries = applyChanges(current.entries, changeList(from.entries, to.entries));
  return sameEntries(entries, current.entries) ? current : { id: newId(), entries };
}

/** Whether a step changed a collection: its presence, or its record. */
export const changedRec = (from: Rec | null, to: Rec | null): boolean => (from === null) !== (to === null) || (from ?? EMPTY).id !== (to ?? EMPTY).id;

function towardsObjects(current: ModelObjects, from: ModelObjects, to: ModelObjects): ModelObjects {
  if (from.id === to.id) return current;
  if (current.id === from.id) return to;
  const tokens = towardsRec(current.tokens, from.tokens, to.tokens);
  let zones = current.zones;
  if (changedRec(from.zones, to.zones)) {
    // An absent collection counts as an empty one; one the step's target lacks goes once nothing added since is left.
    const merged = towardsRec(current.zones ?? EMPTY, from.zones ?? EMPTY, to.zones ?? EMPTY);
    zones = to.zones === null && (current.zones === null || merged.entries.length === 0) ? null : merged;
  }
  if (tokens === current.tokens && zones === current.zones) return current;
  return { id: newId(), tokens, zones };
}

/** The state moved towards `to` by what changed between `from` and `to`, branch by branch. */
export function restoreModel(current: ModelState, from: ModelState, to: ModelState): ModelState {
  const whole = <T>(now: T, a: T, b: T): T => (a === b ? now : b);
  return {
    objects: towardsObjects(current.objects, from.objects, to.objects),
    grid: whole(current.grid, from.grid, to.grid),
    background: whole(current.background, from.background, to.background),
    widgets: towardsRec(current.widgets, from.widgets, to.widgets),
    edits: whole(current.edits, from.edits, to.edits),
  };
}

export const sameState = (a: ModelState, b: ModelState): boolean =>
  a.objects.id === b.objects.id && a.grid === b.grid && a.background === b.background && a.widgets.id === b.widgets.id && a.edits === b.edits;

export const recOf = (state: ModelState, name: CollectionName): Rec | null =>
  name === 'tokens' ? state.objects.tokens : name === 'zones' ? state.objects.zones : state.widgets;

export const initialModel = (): ModelState => ({
  objects: { id: newId(), tokens: { id: newId(), entries: [] }, zones: null },
  grid: null,
  background: null,
  widgets: { id: newId(), entries: [] },
  edits: 0,
});

/** The history's rules as the plan states them: recording, transactions with their mark and fold, undo, redo. */
export class HistoryModel {
  state = initialModel();
  undoSteps: ModelStep[] = [];
  redoSteps: ModelStep[] = [];
  tracking = true;
  depth = 0;
  private start: ModelState | null = null;
  private mark: ModelState | null = null;

  /** A write of the GM (`gm`) or of Atlas itself. */
  write(next: ModelState, gm: boolean): void {
    const before = this.state;
    this.state = next;
    if (gm && this.tracking && this.depth === 0 && !sameState(before, next)) this.push({ before, after: next });
  }

  /** What was written since the mark goes into the two steps next to the present. */
  private fold(target: ModelState): void {
    if (this.mark === null || sameState(this.mark, target)) return;
    const last = this.undoSteps.at(-1);
    const next = this.redoSteps.at(-1);
    if (last) this.undoSteps = [...this.undoSteps.slice(0, -1), { before: last.before, after: restoreModel(last.after, this.mark, target) }];
    if (next) this.redoSteps = [...this.redoSteps.slice(0, -1), { before: restoreModel(next.before, this.mark, target), after: next.after }];
    this.mark = target;
  }

  private push(step: ModelStep): void {
    this.fold(step.before);
    this.undoSteps = [...this.undoSteps, step].slice(-HISTORY_LIMIT);
    this.redoSteps = [];
  }

  begin(): void {
    if (this.depth === 0) this.start = this.mark = this.state;
    this.depth += 1;
  }

  end(): void {
    if (this.depth === 0) return;
    this.depth -= 1;
    if (this.depth > 0) return;
    if (this.start && this.tracking && !sameState(this.start, this.state)) {
      // The step below is folded towards the new step's start, where the new step begins.
      this.push({ before: this.start, after: this.state });
      this.start = this.mark = null;
    } else {
      this.close();
    }
  }

  abandon(): void {
    if (this.depth === 0) return;
    this.depth -= 1;
    if (this.depth === 0) this.close();
  }

  discard(): void {
    if (this.depth === 0) return;
    this.depth = 0;
    this.close();
  }

  private close(): void {
    this.fold(this.state);
    this.start = this.mark = null;
  }

  clear(): void {
    this.undoSteps = [];
    this.redoSteps = [];
    this.depth = 0;
    this.start = this.mark = null;
  }

  /** Undo or redo. Returns the step as it was applied (after any fold), or null with nothing to travel. */
  travel(direction: 'undo' | 'redo'): ModelStep | null {
    if ((direction === 'undo' ? this.undoSteps : this.redoSteps).length === 0) return null;
    const found = this.state;
    this.fold(found);
    const source = direction === 'undo' ? this.undoSteps : this.redoSteps;
    const step = source.at(-1)!;
    if (direction === 'undo') this.undoSteps = this.undoSteps.slice(0, -1);
    else this.redoSteps = this.redoSteps.slice(0, -1);
    const written = direction === 'undo' ? restoreModel(found, step.after, step.before) : restoreModel(found, step.before, step.after);
    this.state = written;
    // The step goes to the other stack as this travel found and left the store.
    if (direction === 'undo') this.redoSteps = [...this.redoSteps, { before: written, after: found }];
    else this.undoSteps = [...this.undoSteps, { before: found, after: written }];
    if (this.mark !== null) this.mark = written;
    return step;
  }
}
