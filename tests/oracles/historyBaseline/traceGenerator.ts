// Frozen trace generator for the undo history fixtures. A trace's operations are built from its
// seed alone, so the recorded traces can be replayed after the history implementation changed.
// Never change this file: `opsDigest` in the fixture proves that every replay builds the same ops.

/** Bumped only together with a newly recorded fixture. */
export const TRACE_GENERATOR = 'history-trace-generator/1';

export type Collection = 'tokens' | 'walls' | 'lightZones';
export const COLLECTIONS: readonly Collection[] = ['tokens', 'walls', 'lightZones'];
/** Integer-like ids among them: an object keeps those in ascending order before every other key. */
export const IDS: readonly string[] = ['a', 'b', 'c', '1', '2', '10'];

/** A write of tracked or untracked state, through the store's own `set` or through `setState`. */
export type WriteOp =
  | { readonly op: 'put'; readonly coll: Collection; readonly id: string; readonly v: number; readonly via: 'set' | 'setState' }
  | { readonly op: 'del'; readonly coll: Collection; readonly id: string; readonly via: 'set' | 'setState' }
  | { readonly op: 'readd'; readonly coll: Collection; readonly id: string; readonly v: number }
  | { readonly op: 'dropZones' }
  | { readonly op: 'copyBranch'; readonly coll: Collection }
  | { readonly op: 'grid'; readonly size: number | null }
  | { readonly op: 'background'; readonly value: string | null }
  | { readonly op: 'widget'; readonly id: string; readonly v: number | null }
  | { readonly op: 'edits'; readonly n: number }
  | { readonly op: 'note'; readonly n: number }
  | { readonly op: 'revert' };

/** What a listener does inside the notification of the write, undo or redo it was added for. */
export type ListenerKind =
  | 'note' | 'untracked' | 'cancel' | 'cancelDeferred' | 'discard' | 'end' | 'transaction' | 'begin' | 'forget';

export type HistoryOp =
  | WriteOp
  | { readonly op: 'untracked'; readonly write: WriteOp }
  | { readonly op: 'untrackedEnd' }
  | { readonly op: 'begin' } | { readonly op: 'end' } | { readonly op: 'abandon' } | { readonly op: 'discard' }
  | { readonly op: 'undo' } | { readonly op: 'redo' } | { readonly op: 'clear' }
  | { readonly op: 'pause' } | { readonly op: 'resume' }
  | { readonly op: 'notify'; readonly trigger: WriteOp | 'undo' | 'redo'; readonly listener: ListenerKind; readonly write: WriteOp };

export type Family = 'entities' | 'transactions' | 'undo' | 'notify' | 'mixed';
export const FAMILIES: readonly Family[] = ['entities', 'transactions', 'undo', 'notify', 'mixed'];

type Kind = HistoryOp['op'];
const WEIGHTS: Record<Family, Partial<Record<Kind, number>>> = {
  entities: { put: 12, del: 5, readd: 3, dropZones: 1, copyBranch: 2, grid: 2, background: 2, widget: 3, edits: 2, note: 2, revert: 1, untracked: 3, undo: 4, redo: 3, clear: 1, pause: 1, resume: 2 },
  transactions: { put: 10, del: 4, readd: 2, copyBranch: 1, widget: 2, edits: 1, note: 1, revert: 2, untracked: 3, untrackedEnd: 1, begin: 6, end: 5, abandon: 3, discard: 2, undo: 2, redo: 1, clear: 1, pause: 1, resume: 2 },
  undo: { put: 10, del: 4, readd: 2, dropZones: 1, copyBranch: 1, grid: 1, widget: 2, edits: 2, note: 1, revert: 2, untracked: 1, begin: 4, end: 3, abandon: 2, discard: 1, undo: 9, redo: 7, clear: 1, pause: 1, resume: 1 },
  notify: { put: 8, del: 3, readd: 1, copyBranch: 1, widget: 2, edits: 2, note: 1, revert: 1, begin: 4, end: 3, abandon: 2, discard: 1, undo: 4, redo: 3, notify: 10, pause: 1, resume: 1 },
  mixed: { put: 9, del: 4, readd: 2, dropZones: 1, copyBranch: 1, grid: 1, background: 1, widget: 2, edits: 2, note: 1, revert: 1, untracked: 2, untrackedEnd: 1, begin: 4, end: 3, abandon: 2, discard: 1, undo: 5, redo: 4, clear: 1, pause: 1, resume: 1, notify: 5 },
};

const WRITE_LISTENERS: readonly ListenerKind[] = ['note', 'untracked', 'cancel', 'cancelDeferred', 'discard', 'end', 'transaction', 'begin', 'forget'];
/** The listeners that act inside an undo's or redo's notification: those the plugin has. */
const UNDO_LISTENERS: readonly ListenerKind[] = ['note', 'cancelDeferred', 'forget'];

/** Reads small numbers from a stream of integers; an exhausted stream ends the trace. */
class Picker {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}

  get exhausted(): boolean {
    return this.index >= this.values.length;
  }

  below(n: number): number {
    const value = this.values[this.index++] ?? 0;
    return Math.abs(Math.trunc(value)) % n;
  }

  of<T>(choices: readonly T[]): T {
    return choices[this.below(choices.length)]!;
  }
}

function weighted(picker: Picker, family: Family): Kind {
  const table = Object.entries(WEIGHTS[family]) as [Kind, number][];
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = picker.below(total);
  for (const [kind, weight] of table) {
    if (roll < weight) return kind;
    roll -= weight;
  }
  return table[0]![0];
}

function writeOp(picker: Picker, kind: WriteOp['op']): WriteOp {
  const via = picker.below(4) === 0 ? 'setState' : 'set';
  switch (kind) {
    case 'put': return { op: 'put', coll: picker.of(COLLECTIONS), id: picker.of(IDS), v: picker.below(4), via };
    case 'del': return { op: 'del', coll: picker.of(COLLECTIONS), id: picker.of(IDS), via };
    case 'readd': return { op: 'readd', coll: picker.of(COLLECTIONS), id: picker.of(IDS), v: picker.below(4) };
    case 'dropZones': return { op: 'dropZones' };
    case 'copyBranch': return { op: 'copyBranch', coll: picker.of(COLLECTIONS) };
    case 'grid': return { op: 'grid', size: picker.below(3) === 0 ? null : 50 + picker.below(3) * 10 };
    case 'background': return { op: 'background', value: picker.below(3) === 0 ? null : `map-${picker.below(3)}.webp` };
    case 'widget': return { op: 'widget', id: picker.of(['w1', 'w2']), v: picker.below(4) === 0 ? null : picker.below(4) };
    case 'edits': return { op: 'edits', n: picker.below(4) };
    case 'note': return { op: 'note', n: picker.below(100) };
    case 'revert': return { op: 'revert' };
  }
}

const WRITE_KINDS: readonly WriteOp['op'][] = ['put', 'put', 'put', 'del', 'readd', 'copyBranch', 'widget', 'edits', 'note', 'grid'];

function nextOp(picker: Picker, family: Family): HistoryOp {
  const kind = weighted(picker, family);
  switch (kind) {
    case 'untracked': return { op: 'untracked', write: writeOp(picker, picker.of(WRITE_KINDS)) };
    case 'notify': {
      const onUndo = picker.below(4);
      const trigger = onUndo === 0 ? 'undo' : onUndo === 1 ? 'redo' : writeOp(picker, picker.of(WRITE_KINDS));
      const listener = picker.of(typeof trigger === 'string' ? UNDO_LISTENERS : WRITE_LISTENERS);
      return { op: 'notify', trigger, listener, write: writeOp(picker, 'put') };
    }
    case 'untrackedEnd': case 'begin': case 'end': case 'abandon': case 'discard': case 'undo': case 'redo': case 'clear': case 'pause': case 'resume':
      return { op: kind };
    default: return writeOp(picker, kind);
  }
}

/** The ops a stream of integers stands for: the first picks the family, the rest the ops, until the stream ends. */
export function decodeOps(values: readonly number[]): { family: Family; ops: HistoryOp[] } {
  const picker = new Picker(values);
  const family = picker.of(FAMILIES);
  const ops: HistoryOp[] = [];
  while (!picker.exhausted) ops.push(nextOp(picker, family));
  return { family, ops };
}

/** mulberry32: a small, fixed PRNG, so a seed always gives the same integers. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

/** The trace of a seed: 200 to 1,200 integers, decoded into ops. */
export function traceOf(seed: number): { family: Family; ops: HistoryOp[] } {
  const next = prng(seed);
  const length = 200 + (next() % 1001);
  const values: number[] = [];
  for (let i = 0; i < length; i++) values.push(next());
  return decodeOps(values);
}
