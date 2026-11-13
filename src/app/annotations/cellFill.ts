/**
 * What the Cells mode makes of the cells a drag passed (`cellGrid.ts`). Filled cells that touch
 * are one drawing: a closed line without a width whose inside is filled, with `holes` where cells
 * inside it stay open, marked `cells`. A drag's cells join every cell fill of their colour, layer
 * and look they touch; islands that touch nothing stay drawings of their own. A cell filled anew
 * loses the fill it had: painting a red cell blue leaves it blue. Unfilling takes the cells out of
 * every cell fill they meet, whatever its colour: one that is emptied goes, one that falls apart
 * becomes several.
 *
 * A locked cell fill is neither joined nor cleared. Everything else about a cell fill is an
 * ordinary drawing.
 */

import { intersectShapes, subtractShapes, unionShapes, type QShapePart } from '../lighting/polygonClip';
import type { QPolygon, QShape } from '../types/shapeTypes';
import type { Box } from '../vision/polygonBounds';
import { annotationBounds } from './annotationBounds';
import { isLocked } from './annotationLock';
import { MAX_HOLES, MAX_STROKE_POINTS, type Annotation, type DrawingAnnotation, type DrawingInput, type DrawLayer } from './annotationTypes';
import type { GridCell } from './cellGrid';
import { fillShape } from './drawingInk';
import { fillPiece, keptFields } from './eraseCut';
import { onClipGrid, pointsQ, ringPoints, type FilledPart } from './quantized';
import { partHolds, pointInPart, ringArea, simpleParts } from './simpleRings';

/**
 * How much of its colour a filled cell shows. Enough to tell every colour of the palette from the
 * others on a light map and on a dark one, and little enough that the map's own drawing and the
 * grid's lines read through it.
 */
export const CELL_FILL_OPACITY = 0.4;

/** What the Cells mode's tools say of the cells filled next. */
export interface CellFillLook {
  /** '#rrggbb'. */
  readonly color: string;
  readonly layer: DrawLayer;
  /** Only the GM sees them. */
  readonly hidden: boolean;
}

/** One write to the store (`replaceDrawings`): the drawings that go and those that take their place. */
export interface CellFillChange {
  readonly removed: string[];
  readonly added: DrawingInput[];
}

const shapes = new WeakMap<DrawingAnnotation, QShape | null>();

/** A fill's area on the clipping grid, worked out once for each read drawing; null beyond the grid. */
function shapeOf(fill: DrawingAnnotation): QShape | null {
  let shape = shapes.get(fill);
  if (shape === undefined) shapes.set(fill, shape = fillShape(fill.points, fill.holes));
  return shape;
}

/** Twice the area of a shape whose rings do not overlap: its outer rings less its holes. */
const shapeArea = (shape: QShape): number => Math.abs(shape.reduce((sum, ring) => sum + ringArea(ring), 0));
const partArea = (part: QShapePart): number => Math.abs(ringArea(part.outline)) - part.holes.reduce((sum, hole) => sum + Math.abs(ringArea(hole)), 0);
const worldPart = (part: QShapePart): FilledPart => ({ outline: ringPoints(part.outline), holes: part.holes.map(ringPoints) });

/** Whether a drawing of this outline and these holes is read whole (`annotationList`). */
function readable({ outline, holes }: FilledPart): boolean {
  return outline.length < MAX_STROKE_POINTS && holes.length <= MAX_HOLES && holes.reduce((sum, hole) => sum + hole.length, 0) <= MAX_STROKE_POINTS;
}

/** How far apart two boxes may lie and still count as touching: a fill's corners lie on the clipping grid, a cell's where the grid's lines put them. */
const NEAR = 1;

const overlap = (a: Box, b: Box): boolean => a.minX <= b.maxX + NEAR && a.maxX >= b.minX - NEAR && a.minY <= b.maxY + NEAR && a.maxY >= b.minY - NEAR;

function boxOf(cells: readonly GridCell[]): Box {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { outline } of cells) {
    for (const { x, y } of outline) {
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
    }
  }
  return box;
}

/** The area `cells` cover, as one shape of the clipping grid; cells beyond the grid are left out. */
export function cellsShape(cells: Iterable<GridCell>): QShape {
  const rings: QPolygon[] = [];
  for (const { outline } of cells) {
    if (outline.length >= 3 && onClipGrid(outline)) rings.push(pointsQ(outline));
  }
  return rings.length > 0 ? unionShapes(rings, []) : [];
}

/** `shape` within `bounds` (the map: a cell its edge cuts is filled up to the edge); all of it for null. */
export function shapeWithin(shape: QShape, bounds: Box | null): QShape {
  if (!bounds || shape.length === 0) return shape;
  const corners = [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY }];
  return onClipGrid(corners) ? intersectShapes(shape, [pointsQ(corners)]) : shape;
}

/** An unlocked cell fill, whatever its colour and wherever it lies. */
const isOpenFill = (annotation: Annotation): annotation is DrawingAnnotation => annotation.kind === 'drawing' && annotation.cells && !isLocked(annotation);

/** Whether cells of `look` filled now join `annotation` where they touch it: an unlocked cell fill of their colour, layer and look. */
function joins(annotation: Annotation, look: CellFillLook): annotation is DrawingAnnotation {
  return isOpenFill(annotation) && annotation.layer === look.layer && annotation.hidden === look.hidden
    && annotation.color.toLowerCase() === look.color.toLowerCase() && annotation.fill === 'solid' && annotation.width === 0 && annotation.opacity === CELL_FILL_OPACITY;
}

/**
 * The area the cell fills of `look` in `list` cover already: what cells filled now would join.
 * Cells shown while a drag lasts are drawn less this, so nothing is darker under the pointer than
 * it will be once the drag is written.
 */
export function coveredByFills(look: CellFillLook, list: readonly Annotation[]): QShape {
  const rings = list.flatMap((annotation) => (joins(annotation, look) ? shapeOf(annotation) ?? [] : []));
  return rings.length > 0 ? unionShapes(rings, []) : [];
}

/** What a fill of `fresh` adds to what `covered` shows already, as areas to draw. */
export function addedParts(fresh: QShape, covered: QShape): FilledPart[] {
  return simpleParts(covered.length > 0 ? subtractShapes(fresh, covered) : fresh).map(worldPart);
}

function newFill(part: FilledPart, look: CellFillLook, order: number): DrawingInput {
  return {
    type: 'line',
    points: [...part.outline, { ...part.outline[0]! }],
    color: look.color,
    width: 0,
    opacity: CELL_FILL_OPACITY,
    fill: 'solid',
    cells: true,
    ...(part.holes.length > 0 && { holes: part.holes }),
    ...(look.hidden && { hidden: true as const }),
    ...(look.layer === 'map' && { layer: 'map' as const }),
    order,
  };
}

/** `fresh` joined with `fills` where they touch; null where a drawing of it could not be read whole. */
function joined(fresh: QShape, fills: readonly DrawingAnnotation[], look: CellFillLook, top: number): CellFillChange | null {
  const members = fills.flatMap((fill) => {
    const shape = shapeOf(fill);
    const first = shape ? simpleParts(shape)[0] : undefined;
    const inside = first ? pointInPart(first) : null;
    return shape && inside ? [{ fill, shape, inside }] : [];
  });
  const freshPoints = simpleParts(fresh).flatMap((part) => pointInPart(part) ?? []);
  const all = members.length > 0 ? unionShapes(fresh, members.flatMap(({ shape }) => shape)) : fresh;
  const change: CellFillChange = { removed: [], added: [] };
  let order = top;
  for (const part of simpleParts(all)) {
    // A fill no new cell touches stays the drawing it is.
    if (!freshPoints.some(({ x, y }) => partHolds(part, x, y))) continue;
    const within = members.filter(({ inside }) => partHolds(part, inside.x, inside.y));
    // Cells that were all filled already change nothing.
    if (within.length === 1 && partArea(part) === shapeArea(within[0]!.shape)) continue;
    const world = worldPart(part);
    if (!readable(world)) return null;
    change.removed.push(...within.map(({ fill }) => fill.id));
    const base = within[0];
    // The fill that was there first stays where it lay among the drawings, and keeps what else its record says.
    change.added.push(base ? fillPiece(keptFields(base.fill.record), world) : newFill(world, look, order++));
  }
  return change;
}

/**
 * What taking the area `gone` out of `fills` changes: a fill that has none of it stays, one left
 * with nothing goes, one that falls apart is a drawing for each part, and each part keeps what its
 * fill's record says. A fill whose rest could not be read whole stays as it is.
 */
function takenOut(gone: QShape, fills: readonly DrawingAnnotation[]): CellFillChange {
  const change: CellFillChange = { removed: [], added: [] };
  for (const fill of fills) {
    const shape = shapeOf(fill);
    if (!shape) continue;
    const left = subtractShapes(shape, gone);
    if (shapeArea(left) === shapeArea(shape)) continue;
    const parts = simpleParts(left).map(worldPart);
    if (!parts.every(readable)) continue;
    change.removed.push(fill.id);
    const kept = keptFields(fill.record);
    for (const part of parts) change.added.push(fillPiece(kept, part));
  }
  return change;
}

/**
 * What filling `cells` in `look` changes among the annotations `list` (one level's, in drawing
 * order); null where it changes nothing, as where every cell had the look already.
 *
 * A cell has one fill where its fills lie together: the cells are first taken out of every other
 * unlocked cell fill of their layer and of who sees them, whatever its colour or look, as
 * `cellsUnfilled` takes them. Then they and every cell fill of their look they touch become one
 * drawing, which takes the place of the lowest of those fills; cells that touch none are new
 * drawings, the first with the order `top`. Fills on the other layer, hidden ones under shown ones
 * (and the reverse) and locked ones keep their cells, and the new fill lies with them.
 * `bounds` is the map, at whose edge a cell ends.
 *
 * Where a joined drawing would have more points or holes than a drawing may, the cells are
 * drawings of their own beside the fills they touch.
 */
export function cellsFilled(cells: readonly GridCell[], look: CellFillLook, list: readonly Annotation[], top: number, bounds: Box | null = null): CellFillChange | null {
  const fresh = shapeWithin(cellsShape(cells), bounds);
  if (fresh.length === 0) return null;
  const box = boxOf(cells);
  const near = list.filter((annotation): annotation is DrawingAnnotation => isOpenFill(annotation) && overlap(annotationBounds(annotation), box));
  const alike = near.filter((fill) => joins(fill, look));
  const replaced = takenOut(fresh, near.filter((fill) => fill.layer === look.layer && fill.hidden === look.hidden && !joins(fill, look)));
  const added = joined(fresh, alike, look, top) ?? joined(fresh, [], look, top) ?? { removed: [], added: [] };
  const change: CellFillChange = { removed: [...replaced.removed, ...added.removed], added: [...replaced.added, ...added.added] };
  return change.removed.length > 0 || change.added.length > 0 ? change : null;
}

/**
 * What clearing `cells` changes among the annotations `list`; null where no cell fill has any of
 * them. Every unlocked cell fill loses the cells, whatever its colour and wherever it lies
 * (`takenOut`).
 */
export function cellsUnfilled(cells: readonly GridCell[], list: readonly Annotation[]): CellFillChange | null {
  const gone = cellsShape(cells);
  if (gone.length === 0) return null;
  const box = boxOf(cells);
  const change = takenOut(gone, list.filter((annotation): annotation is DrawingAnnotation => isOpenFill(annotation) && overlap(annotationBounds(annotation), box)));
  return change.removed.length > 0 ? change : null;
}
