import { inflatePolyline, normalizePolygon } from '../lighting/polygonClip';
import { assertQ, quantizeCoordinate } from '../lighting/quantizedPoint';
import type { FogOperation } from '../types/fogTypes';
import type { QShape } from '../types/shapeTypes';

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`Fog ${name} must be finite`);
}

/** Checks saved and temporary geometry without performing polygon operations. */
export function validateFogOperation(op: FogOperation): void {
  finite(op.timestamp, 'timestamp');
  const ox = op.offsetX === undefined ? 0 : op.offsetX;
  const oy = op.offsetY === undefined ? 0 : op.offsetY;
  finite(ox, 'horizontal offset');
  finite(oy, 'vertical offset');
  if (op.type === 'rectangle') {
    finite(op.x, 'rectangle x');
    finite(op.y, 'rectangle y');
    finite(op.width, 'rectangle width');
    finite(op.height, 'rectangle height');
    quantizeCoordinate(op.x + ox);
    quantizeCoordinate(op.y + oy);
    quantizeCoordinate(op.x + op.width + ox);
    quantizeCoordinate(op.y + op.height + oy);
    return;
  }
  if (op.type !== 'brush' && op.type !== 'lasso') throw new RangeError('Unknown fog shape');
  let radius = 0;
  if (op.type === 'brush') {
    finite(op.brushRadius, 'brush radius');
    if (op.brushRadius < 0) throw new RangeError('A fog brush radius cannot be negative');
    radius = quantizeCoordinate(op.brushRadius);
  }
  for (const point of op.points) {
    finite(point.x, 'point x');
    finite(point.y, 'point y');
    const x = quantizeCoordinate(point.x + ox);
    const y = quantizeCoordinate(point.y + oy);
    assertQ(x - radius);
    assertQ(x + radius);
    assertQ(y - radius);
    assertQ(y + radius);
  }
}

/** The normalized filled shape of one operation, before paint/erase replay. */
export function fogOperationShape(op: FogOperation): QShape {
  validateFogOperation(op);
  const ox = op.offsetX ?? 0;
  const oy = op.offsetY ?? 0;
  if (op.type === 'rectangle') {
    const x1 = quantizeCoordinate(op.x + ox);
    const y1 = quantizeCoordinate(op.y + oy);
    const x2 = quantizeCoordinate(op.x + op.width + ox);
    const y2 = quantizeCoordinate(op.y + op.height + oy);
    return normalizePolygon([x1, y1, x2, y1, x2, y2, x1, y2]);
  }
  const points = op.points.flatMap(point => [quantizeCoordinate(point.x + ox), quantizeCoordinate(point.y + oy)]);
  return op.type === 'brush' ? inflatePolyline(points, quantizeCoordinate(op.brushRadius)) : normalizePolygon(points);
}
