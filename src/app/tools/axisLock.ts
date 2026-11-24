import type { Point } from '../types/visionTypes';

type Axis = 'x' | 'y';

/**
 * Shift held during a freehand stroke keeps it on the level or upright line through the point
 * where Shift took hold, for straight edges by hand. The line runs the way the pointer moves first;
 * letting go of Shift frees the stroke, and pressing it again starts a new line from there.
 */
export class AxisLock {
  private anchor: Point | null = null;
  private axis: Axis | null = null;

  /**
   * Where the stroke goes for a pointer at `point`. `from` is where the stroke is now, `slack` how
   * far (world px) the pointer moves before the line's way is chosen; until then the stroke waits.
   */
  follow(point: Point, held: boolean, from: Point, slack: number): Point {
    if (!held) {
      this.reset();
      return point;
    }
    const anchor = (this.anchor ??= from);
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    if (!this.axis) {
      if (Math.hypot(dx, dy) < slack) return anchor;
      this.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    return this.axis === 'x' ? { x: point.x, y: anchor.y } : { x: anchor.x, y: point.y };
  }

  reset(): void {
    this.anchor = null;
    this.axis = null;
  }
}
