/**
 * What a drawing is drawn as, in points: the areas of its fill, the lines of its ink with their
 * dashes, and its arrowheads. Whoever draws strokes the lines round, and fills the rest. One rule
 * for the map and for every page that shows it, so a drawing looks the same wherever it is seen.
 */

import { normalizePolygon, subtractShapes } from '../lighting/polygonClip';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { DrawingAnnotation } from './annotationTypes';
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
function fillShape(outline: readonly Point[], holes: readonly (readonly Point[])[]): QShape | null {
  const ring = outline.slice(0, -1);
  if (!onClipGrid(ring) || !holes.every((hole) => onClipGrid(hole))) return null;
  let shape = normalizePolygon(pointsQ(ring));
  for (const hole of holes) shape = subtractShapes(shape, normalizePolygon(pointsQ(hole)));
  return shape;
}

/** A fill as it lies in the file, where the grid cannot hold it: its outline and its holes as they are. */
function plainFill(outline: readonly Point[], holes: readonly (readonly Point[])[]): FilledPart[] {
  return [{ outline: outline.slice(0, -1).map(({ x, y }) => ({ x, y })), holes: holes.map((hole) => hole.map(({ x, y }) => ({ x, y }))) }];
}

/**
 * What `drawing` (no stamp) is drawn as. `tolerance` is how far its curve may round the corners
 * of its points (`curveTolerance`).
 *
 * A fill is cleaned on the clipping grid, so an outline that crosses itself is filled by the same
 * rule a point is found in it by (`inFill`); a rectangle or an ellipse without holes crosses
 * nothing and is filled as it is. Under a see-through line the fill ends where the ink begins, so
 * the half of the line that lies on its inside is no darker than the half outside.
 */
export function drawingInk(drawing: DrawingAnnotation, tolerance: number): DrawingInk {
  const { width, opacity } = drawing;
  const path = drawnPath(drawing, tolerance);
  const inked = width > 0;
  const heads: Point[][] = [];
  let lines: Point[][] = [];
  if (inked) {
    let line = path;
    if (drawing.ends) {
      const end = arrowHead(path, width, 'end');
      const start = drawing.ends === 'both' ? arrowHead(path, width, 'start') : null;
      if (end) heads.push(end);
      if (start) heads.push(start);
      line = shaft(path, width, drawing.ends);
    }
    lines = drawing.dash ? dashes(line, width, drawing.dash) : [line.map(({ x, y }) => ({ x, y }))];
  }
  const ink = inked && opacity < 1 ? inkShape(lines, width, heads) : null;

  let fill: DrawingInk['fill'] = null;
  if (drawing.fill && drawing.closed) {
    const alpha = opacity * (drawing.fill === 'soft' ? SOFT_FILL : 1);
    const simple = drawing.holes.length === 0 && (drawing.shape === 'rectangle' || drawing.shape === 'ellipse');
    const shape = simple && !ink ? null : fillShape(path, drawing.holes);
    fill = { parts: shape ? filledParts(ink ? subtractShapes(shape, ink) : shape) : plainFill(path, drawing.holes), alpha };
  }
  return ink
    ? { fill, lines: [], heads: [], even: filledParts(ink), width, alpha: opacity }
    : { fill, lines, heads, even: null, width, alpha: opacity };
}
