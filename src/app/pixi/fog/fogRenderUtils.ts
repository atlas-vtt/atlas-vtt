/**
 * Shared rendering functions for fog operations on Canvas 2D.
 *
 * Used by both FogCanvasCompositor (full-canvas preview) and
 * FogOperationCanvas (per-operation sprite rendering).
 */
import type { FogBounds, FogOperation, FogBrushStroke, FogLassoFill, FogRectangleFill } from '../../types/fogTypes';

import { Q_SCALE } from '../../types/shapeTypes';

export const FOG_COLOR = 'rgba(0, 0, 0, 1)';

/**
 * Draws `area` of `source` onto `ctx`, whose canvas is `source` grown by `pad` on every side, in its
 * place there, with the area's outermost pixels repeated out to `ctx`'s edges.
 */
export function drawWithSpreadEdges(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, area: FogBounds, pad: number): void {
  const { x, y, width, height } = area;
  const { width: fullWidth, height: fullHeight } = ctx.canvas;
  const left = x + pad;
  const top = y + pad;
  const right = left + width;
  const bottom = top + height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, width, height, left, top, width, height);
  ctx.drawImage(source, x, y, 1, height, 0, top, left, height);
  ctx.drawImage(source, x + width - 1, y, 1, height, right, top, fullWidth - right, height);
  // The rows above and below repeat what is drawn so far, the corners with them
  ctx.drawImage(ctx.canvas, 0, top, fullWidth, 1, 0, 0, fullWidth, top);
  ctx.drawImage(ctx.canvas, 0, bottom - 1, fullWidth, 1, 0, bottom, fullWidth, fullHeight - bottom);
}

/**
 * Render a brush stroke as one stroked path with round caps and joins: the area
 * within the brush radius of the polyline, the shape `fogOperationShape` commits.
 * Stamping a disc per step instead left a lattice of half-covered pixels inside
 * dense strokes, since Canvas anti-aliases every overlapping contour edge.
 */
export function renderBrush(
  ctx: CanvasRenderingContext2D,
  op: FogBrushStroke,
  bounds: FogBounds,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  const { points, brushRadius } = op;
  if (points.length === 0 || Math.round(brushRadius * Q_SCALE) === 0) return;

  const first = points[0]!;
  const fx = (first.x + offsetX - bounds.x) * scale;
  const fy = (first.y + offsetY - bounds.y) * scale;
  ctx.beginPath();
  // Canvas strokes no cap on a path of zero length, so a dab is its disc.
  if (points.every((p) => p.x === first.x && p.y === first.y)) {
    ctx.arc(fx, fy, brushRadius * scale, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(fx, fy);
  for (const p of points) ctx.lineTo((p.x + offsetX - bounds.x) * scale, (p.y + offsetY - bounds.y) * scale);
  ctx.lineWidth = 2 * brushRadius * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Render a filled lasso polygon. */
export function renderLasso(
  ctx: CanvasRenderingContext2D,
  op: FogLassoFill,
  bounds: FogBounds,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  const { points } = op;
  if (points.length < 3) return;

  ctx.beginPath();
  const p0 = points[0]!;
  ctx.moveTo(
    (p0.x + offsetX - bounds.x) * scale,
    (p0.y + offsetY - bounds.y) * scale
  );

  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    ctx.lineTo(
      (p.x + offsetX - bounds.x) * scale,
      (p.y + offsetY - bounds.y) * scale
    );
  }

  ctx.closePath();
  ctx.fill();
}

/** Render a filled rectangle. */
export function renderRectangle(
  ctx: CanvasRenderingContext2D,
  op: FogRectangleFill,
  bounds: FogBounds,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  const sx = (op.x + offsetX - bounds.x) * scale;
  const sy = (op.y + offsetY - bounds.y) * scale;
  const sw = op.width * scale;
  const sh = op.height * scale;
  ctx.fillRect(sx, sy, sw, sh);
}

/** Dispatch to the correct renderer based on operation type. */
export function renderOperation(
  ctx: CanvasRenderingContext2D,
  op: FogOperation,
  bounds: FogBounds,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  ctx.save();
  try {
    ctx.globalCompositeOperation = op.isErasing ? 'destination-out' : 'source-over';
    ctx.fillStyle = FOG_COLOR;
    ctx.strokeStyle = FOG_COLOR;
    switch (op.type) {
      case 'brush':
        renderBrush(ctx, op, bounds, scale, offsetX, offsetY);
        break;
      case 'lasso':
        renderLasso(ctx, op, bounds, scale, offsetX, offsetY);
        break;
      case 'rectangle':
        renderRectangle(ctx, op, bounds, scale, offsetX, offsetY);
        break;
    }
  } finally {
    ctx.restore();
  }
}

/** Calculate the world-space bounding box of a single operation. */
export function calculateOperationBounds(op: FogOperation): FogBounds {
  const ox = op.offsetX ?? 0;
  const oy = op.offsetY ?? 0;

  switch (op.type) {
    case 'brush': {
      if (!op.points || op.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of op.points) {
        minX = Math.min(minX, p.x - op.brushRadius);
        minY = Math.min(minY, p.y - op.brushRadius);
        maxX = Math.max(maxX, p.x + op.brushRadius);
        maxY = Math.max(maxY, p.y + op.brushRadius);
      }
      return {
        x: minX + ox,
        y: minY + oy,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    case 'lasso': {
      if (!op.points || op.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of op.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return {
        x: minX + ox,
        y: minY + oy,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    case 'rectangle':
      return {
        x: (op.x ?? 0) + ox,
        y: (op.y ?? 0) + oy,
        width: op.width ?? 0,
        height: op.height ?? 0,
      };
    default: {
      // Unreachable for typed data; map files from a newer version may carry other types
      const unknownOp: { type?: unknown } = op;
      console.warn('[FogRenderUtils] Unknown fog operation type:', unknownOp.type);
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }
}
