import type { StrokeShape } from '../tools/shapeStroke';
import type { Point } from '../types/visionTypes';
import { strokePolygons } from './exploredEdits';
import { unionShapes } from './polygonClip';
import { areaOf, type RoomArea } from './rooms';

/**
 * The outline a brush stroke covers so far (the rooms brush's preview), grown by the stamps
 * added since the last call instead of unioned whole on every move: a 400-point stroke took
 * 140 ms to union whole. A stroke that is not the one before (another start, another size, fewer
 * points) begins anew.
 */
export class BrushOutline {
  private first: Point | null = null;
  private radius = 0;
  private count = 0;
  private area: RoomArea = [];

  /** The rings of the area `shape` covers, in eighth pixels (`ringPoints` gives their corners). */
  of(shape: Extract<StrokeShape, { type: 'brush' }>): RoomArea {
    const { points, brushRadius } = shape;
    const start = points[0];
    if (!start) return this.clear();
    const same = this.first !== null && this.first.x === start.x && this.first.y === start.y && this.radius === brushRadius && this.count > 0 && this.count <= points.length;
    if (!same) {
      this.clear();
      this.first = start;
      this.radius = brushRadius;
    }
    if (points.length === this.count) return this.area;
    // From the last point already in, so the capsule that joins it to the next is drawn too
    const tail = points.slice(Math.max(0, this.count - 1));
    this.area = unionShapes(this.area, areaOf(strokePolygons({ ...shape, points: tail }))) as RoomArea;
    this.count = points.length;
    return this.area;
  }

  clear(): RoomArea {
    this.first = null;
    this.count = 0;
    this.area = [];
    return this.area;
  }
}
