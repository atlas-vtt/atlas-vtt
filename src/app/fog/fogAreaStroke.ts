/**
 * What a shape drawn to hide leaves (a rectangle, a polygon, a lasso, cells, a room; never the
 * brush, which is plain paint): fog that is remembered as one piece (an area, `fogAreas.ts`).
 * Where it starts decides. Begun inside a remembered piece that is hidden it is added to that
 * piece; anywhere else it is a piece of its own, fitted to the hidden pieces beside it so that
 * revealing one never opens a strip of the other. What was drawn is fog afterwards, all of it:
 * where it lies over a hidden piece whose fog was cleared since, plain fog fills the gap.
 */

import { intersectShapes, shapeParts, subtractShapes, unionShapes } from '../lighting/polygonClip';
import type { StrokeShape } from '../tools/shapeStroke';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { areaIsHidden, areaOutline, type FogArea, type FogAreaShape } from './fogAreas';
import { fittedArea, joinedArea } from './fogAreaShapes';
import { hiddenGround, outlinesOf } from './fogBody';
import { shapeOf } from './fogOutlineShape';

export interface HideStrokePlan {
  /** The pieces the shapes add. */
  readonly add: readonly FogAreaShape[];
  /** The piece that takes the shapes in, with the outline it then has; null where none does. */
  readonly join: { readonly id: string; readonly points: Point[] } | null;
  /** Outlines to paint as plain fog: what was drawn over hidden pieces where their fog had been cleared. */
  readonly paint: readonly Point[][];
}

const NOTHING: HideStrokePlan = { add: [], join: null, paint: [] };

/** The corners of a stroke's shape; none for a brush stroke, which has no outline. */
function cornersOf(shape: StrokeShape): Point[] {
  if (shape.type === 'lasso') return shape.points;
  if (shape.type !== 'rectangle') return [];
  const { x, y, width, height } = shape;
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

const sameCorners = (a: readonly Point[], b: readonly Point[]): boolean =>
  a.length === b.length && a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y);

/**
 * The outlines of what several shapes cover together, one per piece: shapes that touch are one
 * piece, and ground they enclose without covering it stays a hole in it. Shapes that lie apart,
 * each one outline, come back as they were given, to the last bit.
 */
function piecesOf(outlines: ReadonlyArray<readonly Point[]>): Point[][] {
  const given = outlines.map((outline) => outline.map(({ x, y }) => ({ x, y })));
  const all = drawnShape(outlines);
  if (!all) return given;
  const parts = shapeParts(all);
  return parts.length === given.length && parts.every((part) => part.holes.length === 0) ? given : outlinesOf(all);
}

/** New pieces of `shapes`, each fitted to the hidden pieces there are and to those made before it. A rectangle nothing cut stays one. */
function added(shapes: readonly StrokeShape[], hidden: readonly FogArea[]): FogAreaShape[] {
  const others = hidden.map(areaOutline).filter((outline) => outline.length >= 3);
  const [only] = shapes;
  // Several shapes are the pieces of one drag over cells: what hangs together is one piece.
  const outlines = shapes.length === 1 && only ? [cornersOf(only)] : piecesOf(shapes.map(cornersOf));
  const made: FogAreaShape[] = [];
  for (const outline of outlines) {
    if (outline.length < 3) continue;
    const fitted = fittedArea(outline, others);
    others.push(fitted);
    made.push(only?.type === 'rectangle' && sameCorners(fitted, outline) ? { ...only } : { type: 'lasso', points: fitted });
  }
  return made;
}

/** What `outlines` cover together; null where one of them cannot be read. */
function drawnShape(outlines: ReadonlyArray<readonly Point[]>): QShape | null {
  let all: QShape = [];
  for (const outline of outlines) {
    const shape = shapeOf(outline);
    if (!shape) return null;
    all = unionShapes(all, shape);
  }
  return all;
}

/** What of `drawn`, the shape of `outlines`, lies over the hidden pieces among `areas` and is no fog in `coverage`. */
function gaps(drawn: QShape, outlines: ReadonlyArray<readonly Point[]>, areas: readonly FogArea[], coverage: QShape | null): Point[][] {
  if (!coverage) return [];
  const kept = hiddenGround(areas, outlines.flat());
  if (kept.length === 0) return [];
  return outlinesOf(subtractShapes(intersectShapes(drawn, kept), coverage));
}

/**
 * What `shapes`, the shapes of one stroke that hides, leave among `areas`, the remembered pieces
 * of the level shown. `startsIn` is the hidden piece the stroke began in (null: none, or one
 * that is gone or revealed since) and `coverage` the level's fog as it is (null where it cannot
 * be worked out: no gap is filled then).
 */
export function planHideStroke(shapes: readonly StrokeShape[], areas: readonly FogArea[], startsIn: string | null, coverage: QShape | null): HideStrokePlan {
  const outlines = shapes.map(cornersOf).filter((outline) => outline.length >= 3);
  const drawn = outlines.length > 0 ? drawnShape(outlines) : null;
  if (!drawn || drawn.length === 0) return NOTHING;
  const target = startsIn === null ? undefined : areas.find((area) => area.id === startsIn && areaIsHidden(area));
  if (target) {
    const own = shapeOf(areaOutline(target));
    // Drawn inside the piece, it changes no outline: only what was cleared there is fog again.
    if (own && subtractShapes(drawn, own).length === 0) return { add: [], join: null, paint: gaps(drawn, outlines, areas, coverage) };
    const points = joinedArea(areaOutline(target), ...outlines);
    // The piece is hidden anew with what it takes in, so nothing of the shape is left open.
    if (points) return { add: [], join: { id: target.id, points }, paint: [] };
  }
  return { add: added(shapes, areas.filter(areaIsHidden)), join: null, paint: gaps(drawn, outlines, areas, coverage) };
}
