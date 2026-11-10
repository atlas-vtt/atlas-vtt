/** A place in world pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The walls a player's token may not cross, ready for sweeps. */
export interface MoveWalls {
  /** Centre lines, four numbers each: `x1, y1, x2, y2`. */
  readonly lines: Float64Array;
  /** How close to a wall's centre line a token's centre may come: each wall is a capsule this wide. */
  readonly gap: number;
}

/** After running into a wall, the rest of a move slides along walls at most this many times. */
export const MAX_SLIDES = 2;
/** A place rounded to 0.01 px may lie this much deeper in a capsule than the place it was rounded from. */
const ROUND_SLACK = 0.01;
/** A path that starts inside a capsule heads in when its share towards the centre line is more than this. */
const ALONG = 1e-9;
/** Shorter than this, in world pixels, a path or a slide is no move. */
const NO_MOVE = 1e-6;

/** Walls as sweeps read them: their centre lines, each wall a capsule `gap` wide around its line. */
export function moveWallsOf(segments: readonly (readonly [number, number, number, number])[], gap: number): MoveWalls {
  const lines = new Float64Array(segments.length * 4);
  segments.forEach((segment, index) => lines.set(segment, index * 4));
  return { lines, gap };
}

interface Hit {
  /** Where along the path the token's centre meets the capsule, from 0 at its start to 1 at its end. */
  readonly t: number;
  /** The capsule's outward normal there, a unit vector. */
  readonly nx: number;
  readonly ny: number;
}

/** Where a path from `(px, py)` along `(dx, dy)` enters the disc of radius `r` around `(cx, cy)`, from outside. */
function discEntry(px: number, py: number, dx: number, dy: number, cx: number, cy: number, r: number): Hit | null {
  const ox = px - cx, oy = py - cy;
  const a = dx * dx + dy * dy;
  const b = ox * dx + oy * dy;
  if (b >= 0) return null;
  const root = b * b - a * (ox * ox + oy * oy - r * r);
  if (root < 0) return null;
  const t = Math.max(0, (-b - Math.sqrt(root)) / a);
  const hx = ox + dx * t, hy = oy + dy * t;
  const length = Math.hypot(hx, hy);
  // A path that only grazes the disc passes it.
  return length > 0 && hx * dx + hy * dy < -ALONG * length * Math.sqrt(a) ? { t, nx: hx / length, ny: hy / length } : null;
}

/**
 * Where a path from `p` along `(dx, dy)` meets the capsule of radius `r` around the segment
 * `a`–`b`, or null. A path that starts inside the capsule meets it at once when it heads closer to the
 * centre line, and never when it heads away or along it (the distance to a segment only grows once it
 * stops shrinking), so a token inside a capsule can leave it but never get deeper in.
 */
function capsuleHit(px: number, py: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number, r: number): Hit | null {
  const sx = bx - ax, sy = by - ay;
  const length2 = sx * sx + sy * sy;
  const u = length2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * sx + (py - ay) * sy) / length2)) : 0;
  const ox = px - (ax + sx * u), oy = py - (ay + sy * u);
  const distance = Math.hypot(ox, oy);
  if (distance < r) {
    // On the centre line itself the token may leave to either side; along the capsule's edge, rounding
    // must not count as heading in.
    if (distance === 0 || ox * dx + oy * dy >= -ALONG * distance * Math.hypot(dx, dy)) return null;
    return { t: 0, nx: ox / distance, ny: oy / distance };
  }
  let best: Hit | null = null;
  const take = (hit: Hit | null): void => {
    if (hit !== null && hit.t <= 1 && (best === null || hit.t < best.t)) best = hit;
  };
  if (length2 > 0) {
    const length = Math.sqrt(length2);
    const side = Math.sign((px - ax) * -sy + (py - ay) * sx);
    const nx = (-sy / length) * side, ny = (sx / length) * side;
    const height = (px - ax) * nx + (py - ay) * ny;
    const closing = dx * nx + dy * ny;
    // Outside the capsule `height` is at least `r` but for rounding, which must not let the path in.
    if (closing < -ALONG * Math.hypot(dx, dy)) {
      const t = Math.max(0, (height - r) / -closing);
      const along = ((px + dx * t - ax) * sx + (py + dy * t - ay) * sy) / length2;
      if (along >= 0 && along <= 1) take({ t, nx, ny });
    }
    take(discEntry(px, py, dx, dy, bx, by, r));
  }
  take(discEntry(px, py, dx, dy, ax, ay, r));
  return best;
}

/** The first capsule of radius `r` the straight path from `from` to `to` meets, or null. */
function firstHit({ lines }: MoveWalls, from: Point, to: Point, r: number): Hit | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!(Math.hypot(dx, dy) > NO_MOVE)) return null;
  const minX = Math.min(from.x, to.x) - r, maxX = Math.max(from.x, to.x) + r;
  const minY = Math.min(from.y, to.y) - r, maxY = Math.max(from.y, to.y) + r;
  let best: Hit | null = null;
  for (let at = 0; at < lines.length; at += 4) {
    const ax = lines[at]!, ay = lines[at + 1]!, bx = lines[at + 2]!, by = lines[at + 3]!;
    if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX || Math.max(ay, by) < minY || Math.min(ay, by) > maxY) continue;
    const hit = capsuleHit(from.x, from.y, dx, dy, ax, ay, bx, by, r);
    if (hit !== null && (best === null || hit.t < best.t)) best = hit;
  }
  return best;
}

/** Whether a token's centre goes from `from` to `to` in a straight line without coming nearer a wall than `gap`. */
export function reaches(walls: MoveWalls, from: Point, to: Point): boolean {
  return firstHit(walls, from, to, walls.gap) === null;
}

/** `to` rounded to 0.01 px, as token places reach players, where that keeps the way from `from` clear. */
function rounded(walls: MoveWalls, from: Point, to: Point): Point {
  const near = { x: Math.round(to.x * 100) / 100, y: Math.round(to.y * 100) / 100 };
  return firstHit(walls, from, near, walls.gap - ROUND_SLACK) === null ? near : to;
}

/**
 * The way a token's centre goes moving from `from` towards `to`, as the places it passes, `from`
 * first and where it comes to rest last. Each wall is a capsule `gap` wide around its centre line:
 * the token goes straight to `to` when the way is clear, else to where it meets the first capsule in
 * its way, from where the rest of the move slides along it (its part along the capsule's edge), and
 * so on up to `MAX_SLIDES` times. Every leg is swept against every wall, so no leg crosses a centre
 * line, and the token never comes nearer one than `gap` (less the rounding) unless it started nearer.
 */
export function movePath(walls: MoveWalls, from: Point, to: Point): Point[] {
  const path = [from];
  let target = to;
  for (let slide = 0; ; slide += 1) {
    const start = path.at(-1)!;
    const hit = firstHit(walls, start, target, walls.gap);
    if (hit === null) {
      path.push(slide === 0 ? to : rounded(walls, start, target));
      return path;
    }
    const stop = hit.t > 0 ? rounded(walls, start, { x: start.x + (target.x - start.x) * hit.t, y: start.y + (target.y - start.y) * hit.t }) : start;
    if (stop !== start) path.push(stop);
    const rx = target.x - stop.x, ry = target.y - stop.y;
    const into = Math.min(0, rx * hit.nx + ry * hit.ny);
    target = { x: stop.x + rx - into * hit.nx, y: stop.y + ry - into * hit.ny };
    if (slide === MAX_SLIDES || !(Math.hypot(target.x - stop.x, target.y - stop.y) > NO_MOVE)) return path;
  }
}

/** Where a token's centre comes to rest moving from `from` towards `to` (`movePath`). */
export function stopAtWalls(walls: MoveWalls, from: Point, to: Point): Point {
  return movePath(walls, from, to).at(-1)!;
}
