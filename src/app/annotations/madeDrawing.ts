/**
 * The drawing a finished gesture leaves: what the pointer made, in the look the Draw tool is set
 * to. The same rule gives the drawing shown while the gesture lasts (`liveDrawing`), so what is
 * seen under the pointer is what stays.
 */

import type { Point } from '../types/visionTypes';
import { MAX_STROKE_POINTS, type DrawingInput, type DrawToolChoices } from './annotationTypes';
import { stampSize, strokeWidth } from './drawSizes';
import { THIN_TOLERANCE, thinned } from './penStroke';
import { curvedPath, ellipsePoints, rectanglePoints } from './shapeOutlines';

/** What a gesture made, before it has a look. */
export interface MadeShape {
  readonly mode: 'pen' | 'line' | 'rectangle' | 'ellipse';
  /**
   * World pixels. A pen: the points the pointer left. A line: its corners. A rectangle or an
   * ellipse: two opposite corners of its box.
   */
  readonly points: readonly Point[];
  /** A line that ends where it began (its first corner is not repeated in `points`). */
  readonly closed: boolean;
}

/** The opacity of see-through ink. */
export const SEE_THROUGH = 0.5;

const copy = ({ x, y }: Point): Point => ({ x, y });

/** A pen's points, thinned to what its line needs at `zoom`, and further where a stroke would still hold more than a drawing may. */
function penPoints(points: readonly Point[], zoom: number): Point[] {
  let tolerance = THIN_TOLERANCE / (zoom > 0 && Number.isFinite(zoom) ? zoom : 1);
  let kept = thinned(points, tolerance);
  while (kept.length > MAX_STROKE_POINTS) {
    tolerance *= 2;
    kept = thinned(points, tolerance);
  }
  return kept;
}

/** What every drawing takes from the tool: its colour, its line's width, who sees it and where it lies. */
function common(tool: DrawToolChoices, cell: number, seeThrough: boolean): Pick<DrawingInput, 'color' | 'width' | 'opacity' | 'hidden' | 'layer'> {
  return {
    color: tool.color,
    width: strokeWidth(tool.size, cell),
    opacity: seeThrough ? SEE_THROUGH : 1,
    ...(!tool.players && { hidden: true as const }),
    ...(tool.layer === 'map' && { layer: 'map' as const }),
  };
}

/**
 * The stamp of the tool's symbol with its centre at `at`, on a map whose cells are `cell` wide:
 * in the tool's colour, as wide as its size says (M is one cell), seen by whom the tool says and
 * lying where it says. A stamp hides what it covers, whatever the tool's ink.
 */
export function madeStamp(at: Point, tool: DrawToolChoices, cell: number): DrawingInput {
  return { type: 'icon', icon: tool.icon, points: [copy(at)], ...common(tool, cell, false), width: stampSize(tool.size, cell) };
}

/** A drawing whose points may be another's list: what is drawn while a gesture lasts, never what is stored. */
export type LiveDrawing = Omit<DrawingInput, 'points'> & { readonly points: readonly Point[] };

/** A pen's stroke in the tool's look, through `points`. */
function penDrawing<Points extends readonly Point[]>(points: Points, tool: DrawToolChoices, cell: number): Omit<DrawingInput, 'points'> & { points: Points } {
  return { type: 'pen', points, ...common(tool, cell, tool.seeThrough) };
}

/** A line, a rectangle or an ellipse in the tool's look; null for what has no size. */
function shapeDrawing(made: MadeShape, tool: DrawToolChoices, cell: number): DrawingInput | null {
  const [first, second] = made.points;
  if (!first || !second) return null;
  if (made.mode === 'line') {
    const closed = made.closed && made.points.length >= 3;
    const look: Partial<DrawingInput> = {
      ...(tool.dash && { dash: tool.dash }),
      ...(closed ? tool.fill && { fill: tool.fill } : tool.ends && { ends: tool.ends }),
    };
    const base = common(tool, cell, tool.seeThrough);
    if (tool.curved && made.points.length >= 3) {
      const anchors = made.points.map(copy);
      return { type: 'line', points: curvedPath(anchors, closed), anchors, ...base, ...look };
    }
    const corners = made.points.map(copy);
    if (closed) corners.push(copy(first));
    return { type: 'line', points: corners, ...base, ...look };
  }
  if (first.x === second.x || first.y === second.y) return null;
  const look: Partial<DrawingInput> = { ...(tool.dash && { dash: tool.dash }), ...(tool.fill && { fill: tool.fill }) };
  const base = common(tool, cell, false);
  return made.mode === 'rectangle'
    ? { type: 'rectangle', points: rectanglePoints(first, second), ...base, ...look }
    : { type: 'circle', points: ellipsePoints(first, second), ...base, ...look };
}

/**
 * The drawing `made` is with the tool's choices, on a map whose cells are `cell` wide, drawn at
 * `zoom`. Null for what has no size: a line of one point, a box without a width or a height. A
 * pen's single point is a dot.
 *
 * Each mode takes the choices its tools offer: the pen see-through ink; a line its dashes, its
 * arrowheads (open), its fill (closed), its curve and see-through ink; a rectangle and an ellipse
 * their dashes and their fill. A pen's points are thinned to what its line needs at `zoom`.
 */
export function madeDrawing(made: MadeShape, tool: DrawToolChoices, cell: number, zoom: number): DrawingInput | null {
  if (made.mode !== 'pen') return shapeDrawing(made, tool, cell);
  return made.points.length > 0 ? penDrawing(penPoints(made.points, zoom), tool, cell) : null;
}

/**
 * The same drawing while its gesture lasts. A pen's points are the gesture's own list, as they
 * are: thinning is the release's, and a stroke under way must not be copied with every move.
 */
export function liveDrawing(made: MadeShape, tool: DrawToolChoices, cell: number): LiveDrawing | null {
  if (made.mode !== 'pen') return shapeDrawing(made, tool, cell);
  return made.points.length > 0 ? penDrawing(made.points, tool, cell) : null;
}
