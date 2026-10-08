import { subtractShapes, unionShapes } from '../lighting/polygonClip';
import { shapeContains } from '../lighting/shapeContains';
import type { FogOperation } from '../types/fogTypes';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { fogOperationShape } from './fogOperationShape';

type Operations = Readonly<Record<string, FogOperation>>;
type Entry = readonly [string, FogOperation];
/** See `Coverage.beforeLast`; `latestIndex` is the position of the operation that set `latestTimestamp` (-1 for none). */
interface BeforeLast { readonly shape: QShape; readonly index: number; readonly latestTimestamp: number; readonly latestIndex: number }

export interface FogCoverage {
  readonly shape: QShape;
  covers(point: Point): boolean;
}

class Coverage implements FogCoverage {
  constructor(
    readonly shape: QShape,
    private readonly record: Operations,
    private readonly entries: readonly Entry[],
    private readonly latestTimestamp: number,
    /** The position among the entries of the operation applied last (-1 for none). */
    private readonly latestIndex: number,
    /**
     * The shape before the operation applied last, that operation's position among the entries, and the latest
     * timestamp before it. Lets a record that replaces only that operation (a remote view's fed darkness, which
     * changes on its own) be applied to this shape instead of replaying every operation.
     */
    private readonly beforeLast: BeforeLast | null = null,
  ) {}

  covers(point: Point): boolean {
    return shapeContains(this.shape, point);
  }

  /** What a coverage grown from this one by the operation at `index` keeps of it. */
  before(index: number): BeforeLast {
    return { shape: this.shape, index, latestTimestamp: this.latestTimestamp, latestIndex: this.latestIndex };
  }

  matches(record: Operations): boolean {
    return record === this.record;
  }

  appended(entries: readonly Entry[]): FogOperation | null {
    if (entries.length !== this.entries.length + 1) return null;
    for (let i = 0; i < this.entries.length; i++) {
      if (entries[i]![0] !== this.entries[i]![0] || entries[i]![1] !== this.entries[i]![1]) return null;
    }
    const operation = entries[entries.length - 1]![1];
    return operation.timestamp >= this.latestTimestamp ? operation : null;
  }

  /** The new coverage when `entries` differ from this one's only in the operation applied last, which still comes last. */
  replacedLast(record: Operations, entries: readonly Entry[]): Coverage | null {
    const before = this.beforeLast;
    if (!before || entries.length !== this.entries.length) return null;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i]![0] !== this.entries[i]![0]) return null;
      if (i !== before.index && entries[i]![1] !== this.entries[i]![1]) return null;
    }
    const operation = entries[before.index]![1];
    if (!Number.isFinite(operation.timestamp)) return null;
    // Ties go by position, as the replay orders them: an earlier position must come strictly later.
    const last = operation.timestamp > before.latestTimestamp
      || (operation.timestamp === before.latestTimestamp && before.index > before.latestIndex);
    if (!last) return null;
    return new Coverage(apply(before.shape, operation), record, entries, operation.timestamp, before.index, before);
  }
}

function apply(shape: QShape, operation: FogOperation): QShape {
  const changed = fogOperationShape(operation);
  return operation.isErasing ? subtractShapes(shape, changed) : unionShapes(shape, changed);
}

/** Replay immutable operations in timestamp order, preserving enumeration order for ties. */
export function fogCoverage(ops: Operations, previous?: FogCoverage): FogCoverage {
  if (previous instanceof Coverage && previous.matches(ops)) return previous;
  const entries = Object.entries(ops);
  const appended = previous instanceof Coverage ? previous.appended(entries) : null;
  if (appended && previous instanceof Coverage) {
    return new Coverage(apply(previous.shape, appended), ops, entries, appended.timestamp, entries.length - 1, previous.before(entries.length - 1));
  }
  const replaced = previous instanceof Coverage ? previous.replacedLast(ops, entries) : null;
  if (replaced) return replaced;

  const ordered = entries.map(([, operation], index) => {
    if (!Number.isFinite(operation.timestamp)) throw new RangeError('Fog timestamp must be finite');
    return { operation, index };
  }).sort((a, b) => a.operation.timestamp - b.operation.timestamp || a.index - b.index);
  let shape: QShape = [];
  let beforeLast: BeforeLast | null = null;
  ordered.forEach(({ operation, index }, at) => {
    if (at === ordered.length - 1) {
      const previous = ordered[at - 1];
      beforeLast = { shape, index, latestTimestamp: previous?.operation.timestamp ?? -Infinity, latestIndex: previous?.index ?? -1 };
    }
    shape = apply(shape, operation);
  });
  const latest = ordered[ordered.length - 1];
  return new Coverage(shape, ops, entries, latest?.operation.timestamp ?? -Infinity, latest?.index ?? -1, beforeLast);
}
