import { Q_SCALE, type QShape } from '../../types/shapeTypes';
import type { FogBounds } from '../../types/fogTypes';

/** All contours share one NonZero path, so opposite-winding holes stay clear. */
export function drawFogCoverage(ctx: CanvasRenderingContext2D, shape: QShape, bounds: FogBounds, scale: number): void {
  if (shape.length === 0) return;
  ctx.beginPath();
  for (const ring of shape) {
    ctx.moveTo((ring[0]! / Q_SCALE - bounds.x) * scale, (ring[1]! / Q_SCALE - bounds.y) * scale);
    for (let i = 2; i < ring.length; i += 2) {
      ctx.lineTo((ring[i]! / Q_SCALE - bounds.x) * scale, (ring[i + 1]! / Q_SCALE - bounds.y) * scale);
    }
    ctx.closePath();
  }
  ctx.fill('nonzero');
}
