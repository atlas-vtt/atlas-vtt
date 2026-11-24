import type { Point } from '../types/visionTypes';

/**
 * Stabilization: the brush hangs on a rope behind the pointer (a "lazy mouse", Krita's stabilizer,
 * Procreate's StreamLine). Within the rope's length the pointer moves nothing, so a shaking hand
 * draws a steady line; once the rope is taut the brush follows straight towards the pointer,
 * always the rope's length behind it.
 */
export function pulled(brush: Point, pointer: Point, rope: number): Point {
  const dx = pointer.x - brush.x;
  const dy = pointer.y - brush.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= rope) return brush;
  const share = (distance - rope) / distance;
  return { x: brush.x + dx * share, y: brush.y + dy * share };
}
