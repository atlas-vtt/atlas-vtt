import { subtractShapes, unionShapes } from '../lighting/polygonClip';
import { shapeContains } from '../lighting/shapeContains';
import type { FogOperation } from '../types/fogTypes';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { fogOperationShape } from './fogOperationShape';

type Operations = Readonly<Record<string, FogOperation>>;
type Entry = readonly [string, FogOperation];

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
  ) {}

  covers(point: Point): boolean {
    return shapeContains(this.shape, point);
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
  if (appended && previous) return new Coverage(apply(previous.shape, appended), ops, entries, appended.timestamp);

  const ordered = entries.map(([, operation], index) => {
    if (!Number.isFinite(operation.timestamp)) throw new RangeError('Fog timestamp must be finite');
    return { operation, index };
  }).sort((a, b) => a.operation.timestamp - b.operation.timestamp || a.index - b.index);
  let shape: QShape = [];
  for (const { operation } of ordered) shape = apply(shape, operation);
  return new Coverage(shape, ops, entries, ordered[ordered.length - 1]?.operation.timestamp ?? -Infinity);
}
