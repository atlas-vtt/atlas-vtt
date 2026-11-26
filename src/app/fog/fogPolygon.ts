/** A fog shape drawn corner by corner: which corners make one, and the corners placed so far. */

import type { Point } from '../types/visionTypes';
import { hasArea } from '../vision/polygonArea';

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/**
 * The outline `corners` close to, or null where they make none: fewer than three places, or all
 * of them on one line. A corner placed twice in a row counts once, as does a last one on the first.
 */
export function closedPolygon(corners: readonly Point[]): Point[] | null {
  const outline = corners.filter((corner, index) => index === 0 || !same(corner, corners[index - 1]!)).map((corner) => ({ x: corner.x, y: corner.y }));
  if (outline.length > 1 && same(outline[0]!, outline[outline.length - 1]!)) outline.pop();
  return outline.length >= 3 && hasArea(outline) ? outline : null;
}

/** The corners of a polygon under way, in the order they were placed. */
export class PolygonDraft {
  private placed: Point[] = [];

  get corners(): readonly Point[] {
    return this.placed;
  }

  /** A polygon is under way: it has a corner. */
  get active(): boolean {
    return this.placed.length > 0;
  }

  get first(): Point | null {
    return this.placed[0] ?? null;
  }

  get last(): Point | null {
    return this.placed[this.placed.length - 1] ?? null;
  }

  /** Places a corner; false, and nothing placed, where it lies on the last one or is no place. */
  add(point: Point): boolean {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const last = this.last;
    if (last && same(last, point)) return false;
    this.placed.push({ x: point.x, y: point.y });
    return true;
  }

  /** Takes the last corner back; a polygon that loses its only corner is none any more. */
  takeBack(): void {
    this.placed.pop();
  }

  /** The outline the corners make with one more at `cursor` (null: as they are), or null while that is no area. */
  outlineWith(cursor: Point | null): Point[] | null {
    return closedPolygon(cursor ? [...this.placed, cursor] : this.placed);
  }

  /**
   * Closes the polygon and hands over its outline. Corners that make no area yet (`closedPolygon`)
   * close nothing: null, and the polygon goes on.
   */
  close(): Point[] | null {
    const outline = closedPolygon(this.placed);
    if (outline) this.placed = [];
    return outline;
  }

  drop(): void {
    this.placed = [];
  }
}
