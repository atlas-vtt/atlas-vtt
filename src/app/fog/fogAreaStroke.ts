/**
 * What a shape drawn in the fog tool's Areas mode does: where it starts decides. Begun outside
 * every area it is a new area, fitted to its neighbours; begun inside an area it is added to that
 * area, or with Alt taken away from every area it covers. The plan is what the preview shows
 * while the shape is drawn and what the store is given when it ends.
 */

import type { StrokeShape } from '../tools/shapeStroke';
import type { Point } from '../types/visionTypes';
import { pointInPolygon } from '../vision/visibility';
import { areaOutline, type FogArea, type FogAreaShape } from './fogAreas';
import { fittedArea, joinedArea, outerOutlines, trimmedAreas } from './fogAreaShapes';

/** What a shape becomes: an area of its own, part of the area it began in, or a piece taken off areas. */
export type AreaStrokeKind = 'new' | 'join' | 'trim';

export interface AreaStrokePlan {
  readonly kind: AreaStrokeKind;
  /** The areas the shape adds. */
  readonly add: readonly FogAreaShape[];
  /** The areas that get another outline. */
  readonly reshape: ReadonlyArray<{ readonly id: string; readonly points: Point[] }>;
  /** The areas left as they are because the shape would leave them in pieces, with a hole or gone; for a join, 1 where it makes no single outline. */
  readonly refused: number;
}

/** What a shape begun in the area `startsIn` (null: outside every area) becomes; `alt` is whether Alt is held. */
export function areaStrokeKind(startsIn: string | null, alt: boolean): AreaStrokeKind {
  if (startsIn === null) return 'new';
  return alt ? 'trim' : 'join';
}

function twiceArea(outline: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice);
}

/** Whether `point` lies inside the closed `outline`. */
export function insideOutline(point: Point, outline: readonly Point[]): boolean {
  return outline.length >= 3 && pointInPolygon(point, outline as Point[]);
}

/** The area `point` lies in: the smallest of them where areas overlap, so one inside another can be reached. Null outside every area. */
export function areaAtPoint(areas: readonly FogArea[], point: Point): FogArea | null {
  let found: FogArea | null = null;
  let size = Infinity;
  for (const area of areas) {
    const outline = areaOutline(area);
    if (!insideOutline(point, outline)) continue;
    const own = twiceArea(outline);
    if (own < size) {
      size = own;
      found = area;
    }
  }
  return found;
}

/** The corners of a stroke's shape; none for a brush stroke, which has no outline. */
function cornersOf(shape: StrokeShape): Point[] {
  if (shape.type === 'lasso') return shape.points;
  if (shape.type !== 'rectangle') return [];
  const { x, y, width, height } = shape;
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

const sameCorners = (a: readonly Point[], b: readonly Point[]): boolean =>
  a.length === b.length && a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y);

/** New areas of `shapes`, each fitted to the areas there are and to those made before it. A rectangle nothing cut stays one. */
function added(shapes: readonly StrokeShape[], areas: readonly FogArea[]): FogAreaShape[] {
  const others = areas.map(areaOutline).filter((outline) => outline.length >= 3);
  const [only] = shapes;
  // Several shapes are the pieces of one drag over cells: what hangs together is one area.
  const outlines = shapes.length === 1 && only ? [cornersOf(only)] : outerOutlines(shapes.map(cornersOf));
  const made: FogAreaShape[] = [];
  for (const outline of outlines) {
    if (outline.length < 3) continue;
    const fitted = fittedArea(outline, others);
    others.push(fitted);
    made.push(only?.type === 'rectangle' && sameCorners(fitted, outline) ? { ...only } : { type: 'lasso', points: fitted });
  }
  return made;
}

/**
 * What `shapes`, the shapes of one stroke, do to `areas`, the areas of the level shown. `startsIn`
 * is the area the stroke began in (null: none, or one that is gone) and `alt` whether Alt is held.
 */
export function planAreaStroke(shapes: readonly StrokeShape[], areas: readonly FogArea[], startsIn: string | null, alt: boolean): AreaStrokePlan {
  const target = startsIn === null ? undefined : areas.find((area) => area.id === startsIn);
  const kind = areaStrokeKind(target ? target.id : null, alt);
  const outlines = shapes.map(cornersOf).filter((outline) => outline.length >= 3);
  if (outlines.length === 0) return { kind, add: [], reshape: [], refused: 0 };
  if (kind === 'new') return { kind, add: added(shapes, areas), reshape: [], refused: 0 };
  if (kind === 'join' && target) {
    const points = joinedArea(areaOutline(target), ...outlines);
    return { kind, add: [], reshape: points ? [{ id: target.id, points }] : [], refused: points ? 0 : 1 };
  }
  const reshape: { id: string; points: Point[] }[] = [];
  let refused = 0;
  trimmedAreas(areas.map(areaOutline), outlines).forEach((points, index) => {
    if (points) reshape.push({ id: areas[index]!.id, points });
    else if (points === null) refused++;
  });
  return { kind, add: [], reshape, refused };
}
