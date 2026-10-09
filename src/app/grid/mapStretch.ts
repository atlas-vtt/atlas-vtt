/**
 * How a map image is stretched when it is drawn. Many maps are printed with cells that are not
 * regular (hexes a few percent too tall, squares that are rectangles), and a regular grid fits such a
 * map only once its image is stretched along one axis. The stretch belongs to the grid's alignment
 * (`GridState.mapStretch`); the world, the grid and everything measured on it stay regular.
 */

export interface MapStretch {
  x: number;
  y: number;
}

export const NO_STRETCH: MapStretch = { x: 1, y: 1 };

/** Stretches outside this range are not alignments of a printed grid; they read as none. */
const MIN_FACTOR = 1;
const MAX_FACTOR = 1.5;

/** Whether cells of this aspect can be made regular by a stretch in range; a detector's fit outside it found no grid. */
export function isStretchableAspect(aspect: number): boolean {
  return aspect >= 1 / MAX_FACTOR && aspect <= MAX_FACTOR;
}

/**
 * The stretch that makes cells regular whose rows lie `aspect` times as far apart as a regular
 * grid's. The image only ever grows, along the axis its cells are too short on, so it keeps every pixel.
 */
export function stretchForAspect(aspect: number): MapStretch {
  if (!(aspect > 0) || aspect === 1) return NO_STRETCH;
  const round = (value: number): number => Math.round(value * 1e5) / 1e5;
  return aspect > 1 ? { x: round(aspect), y: 1 } : { x: 1, y: round(1 / aspect) };
}

/** A stored stretch as it is drawn: anything that is no pair of factors in range reads as none. */
export function readMapStretch(value: unknown): MapStretch {
  if (typeof value !== 'object' || value === null) return NO_STRETCH;
  const { x, y } = value as { x?: unknown; y?: unknown };
  const valid = (factor: unknown): factor is number => typeof factor === 'number' && factor >= MIN_FACTOR && factor <= MAX_FACTOR;
  if (!valid(x) || !valid(y) || (x === 1 && y === 1)) return NO_STRETCH;
  return { x, y };
}

export function sameStretch(a: MapStretch, b: MapStretch): boolean {
  return a.x === b.x && a.y === b.y;
}
