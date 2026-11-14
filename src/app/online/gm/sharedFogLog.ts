import { MAX_FOG_OPERATIONS, MAX_FOG_POINTS, type SharedFog, type SharedFogOperation } from '../protocol/index.ts';
import { fogOperationShape } from '../../fog/fogOperationShape';
import { signedAreaTwice } from '../../lighting/canonicalForm';
import { shapeParts, subtractShapes, unionShapes } from '../../lighting/polygonClip';
import type { FogOperation } from '../../types/fogTypes';
import { Q_SCALE, type QPolygon, type QShape } from '../../types/shapeTypes';
import { hashText } from '../../utils/hashing';
import { orderedFog, sharedOperation } from './sceneInputs.ts';

/** How much may follow the last fold, one operation each, before it is folded in too: well within what one message carries. */
export const FOLD_AFTER = { operations: 500, points: 100_000 } as const;

interface Fold {
  /** The operations folded, in replay order. */
  readonly operations: readonly FogOperation[];
  readonly shape: QShape;
  readonly sent: readonly SharedFogOperation[];
}

const NOTHING: Fold = { operations: [], shape: [], sent: [] };

type Alias = (key: string) => string;

const pointCount = (operations: readonly object[]): number =>
  operations.reduce((sum, operation) => sum + ('points' in operation && Array.isArray(operation.points) ? operation.points.length : 0), 0);

/** The union of `shapes`, merged in pairs of neighbours (in log order) so that overlapping steps meet while their outlines are still simple. */
function unionAll(shapes: readonly QShape[]): QShape {
  let level = shapes;
  while (level.length > 1) {
    const next: QShape[] = [];
    for (let index = 0; index < level.length; index += 2) next.push(index + 1 < level.length ? unionShapes(level[index]!, level[index + 1]!) : level[index]!);
    level = next;
  }
  return level[0] ?? [];
}

/**
 * `shape` with `operations` replayed onto it, as `fogCoverage` replays them. Paints that follow
 * each other commute, as do erasures, so each run is one union of its shapes, applied once: a
 * long walk folds in a fraction of the time one clip per step takes. Crossings are rounded to the
 * eighth pixel in another order than a replay step by step, so the shape may differ from Atlas's
 * own by slivers thinner than a pixel.
 */
function replayed(shape: QShape, operations: readonly FogOperation[]): QShape {
  let result = shape;
  let run: QShape[] = [];
  let erasing = false;
  const flush = (): void => {
    if (run.length > 0) result = erasing ? subtractShapes(result, unionAll(run)) : unionShapes(result, unionAll(run));
    run = [];
  };
  for (const operation of operations) {
    if (operation.isErasing !== erasing) {
      flush();
      erasing = operation.isErasing;
    }
    run.push(fogOperationShape(operation));
  }
  flush();
  return result;
}

/** How many of `folded` lead `operations` unchanged; null where the fold is not where the fog begins (an undo reached it, or a folded operation changed). */
function foldedLead(folded: readonly FogOperation[], operations: readonly FogOperation[]): number | null {
  if (folded.length > operations.length) return null;
  return folded.every((operation, index) => operations[index] === operation) ? folded.length : null;
}

function lasso(ring: QPolygon, erase: boolean, alias: Alias): SharedFogOperation {
  const points = ring.map((q) => q / Q_SCALE);
  return { id: alias(`fold:${erase ? 'e' : 'p'}:${hashText(ring.join(','))}`), type: 'lasso', erase, points };
}

/**
 * `shape` as operations that replay to it exactly: each area painted, then its holes erased. Areas
 * go largest first, so an island inside a hole is painted after that hole is erased. Corners lie on
 * the eighths fog is told apart on, so players' replay lands on the very same shape.
 */
function operationsOf(shape: QShape, alias: Alias): SharedFogOperation[] {
  const size = (ring: QPolygon): bigint => { const twice = signedAreaTwice(ring); return twice < 0n ? -twice : twice; };
  return shapeParts(shape)
    .map((part) => ({ part, size: size(part.outline) }))
    .sort((a, b) => (a.size === b.size ? 0 : a.size > b.size ? -1 : 1))
    .flatMap(({ part }) => [lasso(part.outline, false, alias), ...part.holes.map((hole) => lasso(hole, true, alias))]);
}

/**
 * The scene's fog as players are sent it. Fog is a log of operations that only grows: a GM paints
 * stroke after stroke and party tokens that clear fog write one with every step. While the log is
 * short every operation goes out by itself, so a new stroke reaches players as a small delta. Once
 * more than `FOLD_AFTER` follows the last fold, everything up to now is folded into the outlines it
 * comes to, so what players get is as large as the fog's shape, never its history. Folding onto the
 * last fold replays only what came after it; an undo past the fold, or a folded operation that
 * changed, folds the whole log again.
 */
export class SharedFogLog {
  private fold: Fold = NOTHING;
  /** Whether the last fog given was more than one message may carry even folded: players then see the map covered. */
  tooMuch = false;

  reset(): void {
    this.fold = NOTHING;
    this.tooMuch = false;
  }

  shared(record: Readonly<Record<string, FogOperation>>, alias: Alias): SharedFog {
    this.tooMuch = false;
    const ordered = orderedFog(record);
    if (ordered === null) return null;
    const operations = ordered.map(([, operation]) => operation);
    let lead = foldedLead(this.fold.operations, operations);
    if (lead === null) {
      this.fold = NOTHING;
      lead = 0;
    }
    const after = operations.slice(lead);
    if (after.length > FOLD_AFTER.operations || pointCount(after) * 2 > FOLD_AFTER.points) {
      try {
        const shape = replayed(this.fold.shape, after);
        this.fold = { operations, shape, sent: operationsOf(shape, alias) };
        lead = operations.length;
      } catch {
        return null;
      }
    }
    const sent = [...this.fold.sent, ...ordered.slice(lead).map(([key, operation]) => sharedOperation(operation, alias(key)))];
    // ponytail: past this a page refuses the message, so players get the map covered; only fog of
    // thousands of separate specks reaches it once folded. Raster fog would lift the ceiling.
    this.tooMuch = sent.length > MAX_FOG_OPERATIONS || pointCount(sent) > MAX_FOG_POINTS;
    return this.tooMuch ? null : sent;
  }
}
