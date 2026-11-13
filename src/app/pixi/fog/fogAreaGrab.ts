/**
 * The selected fog area as the pointer holds it: by a corner, which is dragged, or by itself,
 * which moves it. What it becomes for where the pointer is, and what is refused.
 */
import { isAreaOutline, movedOutline, rectangleBetween, withCornerAt } from '../../fog/fogAreaEdit';
import type { FogArea } from '../../fog/fogAreas';
import type { FogAreaChanges } from '../../stores/fogSlice';
import type { Point } from '../../types/visionTypes';

export interface FogAreaGrab {
  readonly id: string;
  readonly what: 'corner' | 'move';
  /** The corner held, among `outline`. */
  readonly index: number;
  /** The area as it was before the gesture: what a cancel puts back. */
  readonly before: FogArea;
  /** Its outline when it was taken, with a corner the press added. */
  readonly outline: readonly Point[];
  /** A rectangle whose corners were neither added to nor taken from: it stays one. */
  readonly rectangle: boolean;
  readonly pressedAt: Point;
  readonly pressedOnScreen: Point;
  /** Where the pointer is now, on the map. */
  at: Point;
  /** The pointer left the place it was pressed at. */
  moved: boolean;
  /** A history transaction is open: the gesture has written. */
  open: boolean;
}

/**
 * What the held area becomes with the pointer at `world`; `cornerAt` says where a held corner
 * lands for it. Null where that would be no area: the outline would cross itself or enclose nothing.
 */
export function grabChanges(grab: FogAreaGrab, world: Point, cornerAt: (world: Point) => Point): FogAreaChanges | null {
  if (grab.what === 'move') {
    const dx = world.x - grab.pressedAt.x;
    const dy = world.y - grab.pressedAt.y;
    const corner = grab.outline[0];
    if (grab.rectangle && corner) return { x: corner.x + dx, y: corner.y + dy };
    return { points: movedOutline(grab.outline, dx, dy) };
  }
  const to = cornerAt(world);
  // A rectangle's corner takes the two edges that meet at it along: the corner opposite stays.
  const anchor = grab.rectangle ? grab.outline[(grab.index + 2) % 4] : undefined;
  if (anchor) return rectangleBetween(anchor, to);
  const points = withCornerAt(grab.outline, grab.index, to);
  return isAreaOutline(points) ? { points } : null;
}
