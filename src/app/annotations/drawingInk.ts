/**
 * What a drawing is drawn as, in points: the areas of its fill, the lines of its ink with their
 * dashes, and its arrowheads. Whoever draws strokes the lines round, and fills the rest. One rule
 * for the map and for every page that shows it, so a drawing looks the same wherever it is seen.
 */

import { normalizePolygon, subtractShapes } from '../lighting/polygonClip';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { DrawingAnnotation } from './annotationTypes';
import { isCleanFill } from './cleanFills';
import { keepInk, keptInk } from './inkMemo';
import { cleanFillAffordable, evenInkAffordable } from './inkWork';
import { CURVE_TOLERANCE, strokeCurve } from './penStroke';
import { filledParts, onClipGrid, pointsQ, type FilledPart } from './quantized';
import { arrowHead, dashes, inkShape, shaft } from './strokeLook';

/** A soft fill's share of its colour. */
export const SOFT_FILL = 0.25;

export interface DrawingInk {
  /** The inside: areas that do not overlap, filled at `alpha`. Null without a fill. */
  readonly fill: { readonly parts: readonly FilledPart[]; readonly alpha: number } | null;
  /**
   * The line's pieces, each stroked `width` wide with round ends and joins; a piece of one point
   * is a dot. Empty where `even` holds the ink, and for a fill without a line.
   */
  readonly lines: readonly (readonly Point[])[];
  /** The arrowheads, each an outline to fill; empty where `even` holds them. */
  readonly heads: readonly (readonly Point[])[];
  /**
   * A see-through line's ink, heads and dashes with it, as areas that do not overlap: filled
   * once at `alpha` they are one tone, also where the line crosses itself. Null for a line that
   * hides what it covers, which may overlap itself as it likes.
   */
  readonly even: readonly FilledPart[] | null;
  readonly width: number;
  /** The ink's share of its colour. */
  readonly alpha: number;
}

/**
 * How far a drawing's curve may round the corners of its points, world pixels: what the pen's
 * tolerance comes to at `zoom`, and never more than a quarter of the line's width, so a stroke
 * first drawn far out is not rounded past what its own ink hides.
 */
export function curveTolerance(zoom: number, width: number): number {
  const wide = Math.max(width, 1) / 4;
  return zoom > 0 && Number.isFinite(zoom) ? Math.min(CURVE_TOLERANCE / zoom, wide) : wide;
}

/** The line as it is drawn: a pen's stroke, an ellipse and a curved path are rounded, corners made with clicks stay corners. */
function drawnPath(drawing: DrawingAnnotation, tolerance: number): readonly Point[] {
  const rounded = drawing.shape === 'pen' || drawing.shape === 'ellipse' || drawing.anchors !== null;
  return rounded ? strokeCurve(drawing.points, tolerance) : drawing.points;
}

/** The fill of `outline` (closed: its last point is its first) less `holes`, by the nonzero rule, on the clipping grid; null beyond it. */
export function fillShape(outline: readonly Point[], holes: readonly (readonly Point[])[]): QShape | null {
  const ring = outline.slice(0, -1);
  if (!onClipGrid(ring) || !holes.every((hole) => onClipGrid(hole))) return null;
  const shape = normalizePolygon(pointsQ(ring));
  // Each hole is what its own ring winds around; cleaned one by one, all of them are cut out in one go.
  return holes.length === 0 ? shape : subtractShapes(shape, holes.flatMap((hole) => normalizePolygon(pointsQ(hole))));
}

/** A fill as it lies in the file: its outline and its holes as they are. For one that needs no cleaning, and where the grid cannot hold it. */
function plainFill(outline: readonly Point[], holes: readonly (readonly Point[])[]): FilledPart[] {
  return [{ outline: outline.slice(0, -1), holes: holes.map((hole) => [...hole]) }];
}

/**
 * What `drawing` (no stamp) is drawn as. `tolerance` is how far its curve may round the corners
 * of its points (`curveTolerance`).
 *
 * A fill is cleaned on the clipping grid, so an outline that crosses itself is filled by the same
 * rule a point is found in it by (`inFill`); a rectangle or an ellipse without holes crosses
 * nothing and is filled as it is, and so is what a cut left (`cleanFills.ts`). Under a see-through
 * line the fill ends where the ink begins, so the half of the line that lies on its inside is no
 * darker than the half outside.
 *
 * Both are worked out only within a budget (`inkWork.ts`). Past it, a see-through line is stroked
 * as any line and is darker where it crosses itself, and a fill is filled as its outline lies.
 * What was worked out for a see-through drawing is kept while only its place changes (`inkMemo.ts`).
 */
export function drawingInk(drawing: DrawingAnnotation, tolerance: number): DrawingInk {
  const seeThrough = drawing.width > 0 && drawing.opacity < 1;
  const known = seeThrough ? keptInk(drawing, tolerance) : null;
  if (known) return known;
  const ink = inkOf(drawing, tolerance);
  if (seeThrough) keepInk(drawing, tolerance, ink);
  return ink;
}

function inkOf(drawing: DrawingAnnotation, tolerance: number): DrawingInk {
  const { width, opacity } = drawing;
  const path = drawnPath(drawing, tolerance);
  const inked = width > 0;
  const heads: Point[][] = [];
  let lines: Point[][] = [];
  let line = path;
  if (inked) {
    if (drawing.ends) {
      const end = arrowHead(path, width, 'end');
      const start = drawing.ends === 'both' ? arrowHead(path, width, 'start') : null;
      if (end) heads.push(end);
      if (start) heads.push(start);
      line = shaft(path, width, drawing.ends);
    }
    lines = drawing.dash ? dashes(line, width, drawing.dash) : [line.map(({ x, y }) => ({ x, y }))];
  }
  const ink = inked && opacity < 1 && evenInkAffordable(line, lines) ? inkShape(lines, width, heads) : null;

  let fill: DrawingInk['fill'] = null;
  if (drawing.fill && drawing.closed) {
    const alpha = opacity * (drawing.fill === 'soft' ? SOFT_FILL : 1);
    const simple = (drawing.holes.length === 0 && (drawing.shape === 'rectangle' || drawing.shape === 'ellipse')) || isCleanFill(drawing);
    const shape = (simple && !ink) || !cleanFillAffordable(path, drawing.holes) ? null : fillShape(path, drawing.holes);
    fill = { parts: shape ? filledParts(ink ? subtractShapes(shape, ink) : shape) : plainFill(path, drawing.holes), alpha };
  }
  return ink
    ? { fill, lines: [], heads: [], even: filledParts(ink), width, alpha: opacity }
    : { fill, lines, heads, even: null, width, alpha: opacity };
}
