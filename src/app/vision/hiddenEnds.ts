import { anyHitBefore, occluder, stopsOn, type RayQuery } from './gridRays';

/** How much nearer than a wall end a hit must be to hide it: far more than the rounding of a ray that meets the end itself. */
const HIDDEN_SLACK = 1e-9;
const SECTORS = 64;
const SECTOR = (2 * Math.PI) / SECTORS;

/**
 * Walls likely to hide the ends in each 64th of the turn: the walls the boundary rays on either
 * side of it stop on, and the wall that hid the last end there. Testing them first changes no
 * decision, only how soon a hiding wall is found.
 */
export interface EndHints {
  /** Per boundary ray, the wall it stops on, or −1. */
  boundary: Int32Array;
  /** Per 64th of the turn, the wall that last hid an end there, or −1. */
  last: Int32Array;
}

export function endHints(boundary: Int32Array): EndHints {
  return { boundary, last: new Int32Array(SECTORS).fill(-1) };
}

/**
 * Whether the full sweep's ray towards the wall end at (`x`, `y`), at its bearing `angle`, stops
 * on a wall before reaching it and within the radius. Such an end lies on no corner of the
 * polygon, so the sweep casts no ray for it; an end the polygon's outline reaches is never hidden.
 */
export function isEndHidden(query: RayQuery, x: number, y: number, angle: number, hints?: EndHints): boolean {
  const { origin, radius } = query;
  const limit = Math.min(radius, Math.hypot(x - origin.x, y - origin.y) * (1 - HIDDEN_SLACK));
  if (!hints) return anyHitBefore(query, angle, limit);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const sector = Math.min(SECTORS - 1, Math.max(0, Math.floor((angle + Math.PI) / SECTOR)));
  for (const wall of [hints.boundary[sector]!, hints.boundary[(sector + 1) % SECTORS]!, hints.last[sector]!]) {
    if (wall >= 0 && stopsOn(query, wall, angle, dx, dy, limit)) return true;
  }
  const found = occluder(query, angle, limit, dx, dy);
  if (found >= 0) hints.last[sector] = found;
  return found >= 0;
}
