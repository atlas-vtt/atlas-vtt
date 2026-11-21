import { simplifyStroke } from '../pixi/lighting/wallEdits';
import type { StrokeMode, StrokeShape } from '../tools/shapeStroke';
import type { Point } from '../types/visionTypes';
import { filledPieces } from './polygonFill';

/** What an edit does to the explored memory where it lands: marks it explored, or takes the memory away. */
export type ExploredEditMode = 'reveal' | 'forget';

/** An edit of the explored memory by hand: what a stroke covers, or the whole map. */
export interface ExploredEdit {
  mode: ExploredEditMode;
  area: StrokeShape | 'everything';
}

/** What the lighting tool's explored-memory mode does with a stroke, and with which shape. */
export interface ExploredBrushOptions {
  mode: ExploredEditMode;
  shape: StrokeMode;
  /** Radius of the brush in map pixels, as the fog tool's. */
  brushSize: number;
}

export const DEFAULT_EXPLORED_BRUSH: ExploredBrushOptions = { mode: 'reveal', shape: 'brush', brushSize: 50 };

/** Corners of half a circle at a brush stroke's ends: a 24-gon is round at any brush size the memory resolves. */
const CAP_STEPS = 12;
/** Points of a brush stroke closer to the last than this share of the radius add nothing the memory resolves. */
const THINNING = 0.1;
/** How far, in map pixels, a lasso's outline may stray from the pointer's path: less than the memory resolves. */
const LASSO_TOLERANCE = 0.5;
/** The most corners a lasso keeps; its outline is checked corner against corner for crossings. */
const MAX_LASSO_CORNERS = 400;

/** A lasso's outline with the fewest corners that keep its shape, and no more than `MAX_LASSO_CORNERS`. */
function lassoOutline(points: readonly Point[]): Point[] {
  let tolerance = LASSO_TOLERANCE;
  let outline = simplifyStroke(points, tolerance);
  while (outline.length > MAX_LASSO_CORNERS) outline = simplifyStroke(points, tolerance *= 2);
  return outline;
}

/** The outline of everything within `radius` of the segment from `a` to `b`; a circle when they are one point. */
function capsule(a: Point, b: Point, radius: number): Point[] {
  const along = Math.atan2(b.y - a.y, b.x - a.x);
  const outline: Point[] = [];
  for (const [centre, from] of [[b, along - Math.PI / 2], [a, along + Math.PI / 2]] as const) {
    for (let step = 0; step <= CAP_STEPS; step++) {
      const angle = from + (step / CAP_STEPS) * Math.PI;
      outline.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
    }
  }
  return outline;
}

/**
 * Whether a brush stroke keeps `point` after `last`, the point it kept before: only when it lies
 * a share of the radius away (`THINNING`). The stroke's last point is kept whatever this says.
 */
export function countsInBrushStroke(last: Point, point: Point, radius: number): boolean {
  return (point.x - last.x) ** 2 + (point.y - last.y) ** 2 >= (radius * THINNING) ** 2;
}

/** A brush stroke's points without those too close to the one kept before (`countsInBrushStroke`); the last is always kept. */
function thinned(points: readonly Point[], radius: number): Point[] {
  const kept: Point[] = [];
  points.forEach((point, index) => {
    const last = kept[kept.length - 1];
    if (!last || index === points.length - 1 || countsInBrushStroke(last, point, radius)) kept.push(point);
  });
  return kept;
}

/**
 * The polygons a stroke covers, which together are its area: a rectangle, the pieces a lasso's
 * outline fills (it may cross itself: `filledPieces`), or one capsule for every stretch of a
 * brush stroke (they overlap).
 */
export function strokePolygons(shape: StrokeShape): Point[][] {
  if (shape.type === 'rectangle') {
    const { x, y, width, height } = shape;
    return [[{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]];
  }
  if (shape.type === 'lasso') return shape.points.length >= 3 ? filledPieces(lassoOutline(shape.points)) : [];
  const points = thinned(shape.points, shape.brushRadius);
  if (points.length === 0 || !(shape.brushRadius > 0)) return [];
  if (points.length === 1) return [capsule(points[0]!, points[0]!, shape.brushRadius)];
  return points.slice(1).map((point, index) => capsule(points[index]!, point, shape.brushRadius));
}

/** The polygons an edit covers on a map of `bounds`. */
export function editPolygons({ area }: ExploredEdit, bounds: { width: number; height: number }): Point[][] {
  return area === 'everything' ? strokePolygons({ type: 'rectangle', x: 0, y: 0, width: bounds.width, height: bounds.height }) : strokePolygons(area);
}

/**
 * Coverage bytes as runs of equal values (count, value; a run longer than 255 goes on in the
 * next pair). The memory is flat but for its edges, so a snapshot of it shrinks to a small
 * share of its size.
 */
export function packCoverage(coverage: Uint8Array): Uint8Array {
  const runs: number[] = [];
  let at = 0;
  while (at < coverage.length) {
    const value = coverage[at]!;
    let length = 1;
    while (length < 255 && at + length < coverage.length && coverage[at + length] === value) length++;
    runs.push(length, value);
    at += length;
  }
  return Uint8Array.from(runs);
}

/** The coverage bytes `packCoverage` made runs of. */
export function unpackCoverage(packed: Uint8Array, length: number): Uint8Array {
  const coverage = new Uint8Array(length);
  let at = 0;
  for (let i = 0; i + 1 < packed.length && at < length; i += 2) {
    const end = Math.min(length, at + packed[i]!);
    coverage.fill(packed[i + 1]!, at, end);
    at = end;
  }
  return coverage;
}

/** The most edits one count of sight's records can tell apart (`ExploredStep.serial`): a byte, 0 being "never". */
export const MAX_STEP_SERIAL = 255;

/**
 * One edit of the memory as an undo step: the texels of its region before and after it, packed.
 * Only those that differ are the edit's own; the others are left alone when it is taken back.
 */
export interface ExploredStep<Region> {
  region: Region;
  before: Uint8Array;
  after: Uint8Array;
  /** Which edit of the scene this was, counted from 1 and never reused: what sight records afterwards is marked with the newest. */
  serial: number;
}

/**
 * A region's coverage after one of its steps is undone or redone.
 *
 * - A texel the step did not change keeps what it holds now, whatever was recorded there since.
 * - Where the step is taken in the direction that gives memory (a Forget undone, a Reveal
 *   redone), the texel gets the step's value, or keeps what it holds if that is more.
 * - Where it is taken in the direction that takes memory away (a Reveal undone, a Forget
 *   redone), the texel gets the step's value, unless the party has really seen it since the
 *   step was first made: `seen` holds, per texel, the serial of the newest step at the time
 *   sight last recorded it (0 for never), so `seen >= step.serial` is "seen since".
 */
export function travelledCoverage(step: { before: Uint8Array; after: Uint8Array; serial: number }, current: Uint8Array, seen: Uint8Array | null, undone: boolean): Uint8Array {
  const [target, other] = undone ? [step.before, step.after] : [step.after, step.before];
  const coverage = new Uint8Array(current);
  for (let i = 0; i < coverage.length; i++) {
    const to = target[i]!;
    const from = other[i]!;
    if (to > from) coverage[i] = Math.max(to, current[i]!);
    else if (to < from && !(seen && seen[i]! >= step.serial)) coverage[i] = to;
  }
  return coverage;
}

/**
 * The edits made to a scene's explored memory by hand, each kept as what undo and redo need to put
 * the memory back (the texels of its region before and after, `ExploredStep`; the other floors'
 * memories a Forget took, `ForgottenFloors`). Steps are numbered as the store
 * counts them (`exploredEdits`): step n leads from the memory after n − 1 edits to the memory
 * after n. It holds as many steps as the undo history holds (`limit`), so no step the history
 * can reach is missing here.
 */
export class ExploredEditStack<Step> {
  private readonly steps = new Map<number, Step>();

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.steps.size;
  }

  /** Records step `revision`; the steps after it were undone and are gone, as in the history. */
  record(revision: number, step: Step): void {
    for (const known of [...this.steps.keys()]) {
      if (known >= revision || known <= revision - this.limit) this.steps.delete(known);
    }
    this.steps.set(revision, step);
  }

  /**
   * The steps to take, in order, to bring the memory from `from` edits to `to`: undone from the
   * newest back when `to` is less, redone from the oldest on otherwise. A step that is not kept
   * is left out.
   */
  path(from: number, to: number): Step[] {
    const steps: Step[] = [];
    const undone = to < from;
    for (let revision = undone ? from : from + 1; undone ? revision > to : revision <= to; revision += undone ? -1 : 1) {
      const step = this.steps.get(revision);
      if (step) steps.push(step);
    }
    return steps;
  }

  clear(): void {
    this.steps.clear();
  }
}
