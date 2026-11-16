import { dashPattern } from './gridDash';
import type { Point } from './hexGeometry';

/** The subset of the PIXI Graphics path API the grid drawers use; any recorder with the same shape works. */
export interface GridPath {
  moveTo(x: number, y: number): GridPath;
  lineTo(x: number, y: number): GridPath;
  poly(points: number[], close?: boolean): GridPath;
}

export type GridLineType = 'solid' | 'dashed' | 'dotted';

export interface GridBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Arm length of the markers drawn at grid vertices for the "dotted" style. */
export function gridMarkerArmLength(cellSize: number): number {
  return Math.max(3, cellSize * 0.08);
}

/**
 * Draws a segment as two centered dashes (or one when the segment is short),
 * so every cell edge shows the same dash rhythm regardless of its length (`dashPattern`).
 */
export function drawDashedSegment(graphics: GridPath, x1: number, y1: number, x2: number, y2: number): void {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length <= 1e-3) return;

  const dx = (x2 - x1) / length;
  const dy = (y2 - y1) / length;
  const { count, dash, gap } = dashPattern(length);
  let cursor = gap;
  for (let i = 0; i < count; i++) {
    graphics
      .moveTo(x1 + dx * cursor, y1 + dy * cursor)
      .lineTo(x1 + dx * (cursor + dash), y1 + dy * (cursor + dash));
    cursor += dash + gap;
  }
}

/** Draws a cell edge in the solid or dashed style. Dotted grids draw vertex markers instead of edges. */
export function drawStyledSegment(
  graphics: GridPath,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineType: GridLineType,
): void {
  if (lineType === 'dashed') {
    drawDashedSegment(graphics, x1, y1, x2, y2);
  } else {
    graphics.moveTo(x1, y1).lineTo(x2, y2);
  }
}

/**
 * Adds a single filled marker polygon at a grid vertex: one arm per incident
 * edge direction, joined at the centre. Drawing the marker as one shape (rather
 * than overlapping strokes) keeps the centre crisp at any opacity.
 * The caller fills the accumulated path afterwards.
 */
export function drawVertexMarker(
  graphics: GridPath,
  cx: number,
  cy: number,
  armDirections: Point[],
  armLength: number,
  thickness: number,
): void {
  const arms = armDirections
    .map((d) => {
      const length = Math.hypot(d.x, d.y);
      return { x: d.x / length, y: d.y / length, angle: Math.atan2(d.y, d.x) };
    })
    .sort((a, b) => a.angle - b.angle);
  if (arms.length < 2) return;

  const half = thickness / 2;
  const points: number[] = [];

  arms.forEach((arm, index) => {
    const next = arms[(index + 1) % arms.length]!;
    const normalX = -arm.y;
    const normalY = arm.x;
    const tipX = cx + arm.x * armLength;
    const tipY = cy + arm.y * armLength;

    points.push(tipX - normalX * half, tipY - normalY * half);
    points.push(tipX + normalX * half, tipY + normalY * half);

    // Inner corner where this arm's edge meets the next arm's edge.
    let sweep = next.angle - arm.angle;
    if (sweep <= 0) sweep += Math.PI * 2;
    const bisector = arm.angle + sweep / 2;
    const cornerDistance = half / Math.sin(sweep / 2);
    points.push(cx + Math.cos(bisector) * cornerDistance, cy + Math.sin(bisector) * cornerDistance);
  });

  graphics.poly(points, true);
}
