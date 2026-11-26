import type { Point } from '../../types/visionTypes';

/**
 * The outer outline of a 4-connected set of pixels, along the pixels' edges: corners on the pixel
 * grid (a pixel `(x, y)` spans `x..x+1`, `y..y+1`), one at every turn, going round with the set
 * on the right. Holes are left out. Null for an empty set.
 */
export function maskOutline(inside: (x: number, y: number) => boolean, width: number, height: number): Point[] | null {
  let start: { x: number; y: number } | null = null;
  for (let y = 0; y < height && !start; y++) for (let x = 0; x < width && !start; x++) if (inside(x, y)) start = { x, y };
  if (!start) return null;
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && inside(x, y);
  // The topmost row's first pixel has its top edge on the outline: walk it eastwards.
  let [vx, vy, dx, dy] = [start.x, start.y, 1, 0];
  const corners: Point[] = [];
  do {
    vx += dx;
    vy += dy;
    // The two pixels ahead of the corner, to the right and the left of the way: their centres lie half a step ahead and aside.
    const [rx, ry] = [-dy, dx];
    const right = at(Math.floor(vx + (dx + rx) / 2), Math.floor(vy + (dy + ry) / 2));
    const left = at(Math.floor(vx + (dx - rx) / 2), Math.floor(vy + (dy - ry) / 2));
    // 4-connected: pixels that touch only at a corner are not joined there.
    const [ndx, ndy] = !right ? [rx, ry] : left ? [-rx, -ry] : [dx, dy];
    if (ndx !== dx || ndy !== dy) corners.push({ x: vx, y: vy });
    [dx, dy] = [ndx, ndy];
  } while (vx !== start.x || vy !== start.y || dx !== 1 || dy !== 0);
  return corners;
}
