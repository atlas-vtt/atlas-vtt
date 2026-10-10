/**
 * How a map image is drawn so that a regular, level grid fits the grid printed on it. Many maps are
 * printed with cells that are not regular (hexes a few percent too tall, squares that are
 * rectangles), and scans lie a fraction of a degree askew. The grid stays regular and level; the
 * image is turned level about its centre and stretched along one axis. This belongs to the grid's
 * alignment (`GridState.mapStretch`); the world, the grid and everything measured on it stay as they are.
 */

export interface MapStretch {
  x: number;
  y: number;
  /** Degrees the image lies turned, clockwise on screen, which drawing it turns back; unset is level. */
  rotation?: number;
}

export const NO_STRETCH: MapStretch = { x: 1, y: 1 };

/** Stretches outside this range are not alignments of a printed grid; they read as none. */
const MIN_FACTOR = 1;
const MAX_FACTOR = 1.5;
/** A map turned further than this is no scan that lay askew. */
export const MAX_ROTATION_DEGREES = 5;

/** Whether cells of this aspect can be made regular by a stretch in range; a detector's fit outside it found no grid. */
export function isStretchableAspect(aspect: number): boolean {
  return aspect >= 1 / MAX_FACTOR && aspect <= MAX_FACTOR;
}

/**
 * How to draw a map whose rows lie `aspect` times as far apart as a regular grid's and which lies
 * turned by `rotation` radians. The image only ever grows, along the axis its cells are too short on,
 * so it keeps every pixel.
 */
export function stretchForAspect(aspect: number, rotation = 0): MapStretch {
  const round = (value: number): number => Math.round(value * 1e5) / 1e5;
  const degrees = round((rotation * 180) / Math.PI);
  const turned = degrees === 0 ? {} : { rotation: degrees };
  if (!(aspect > 0) || aspect === 1) return degrees === 0 ? NO_STRETCH : { x: 1, y: 1, ...turned };
  return aspect > 1 ? { x: round(aspect), y: 1, ...turned } : { x: 1, y: round(1 / aspect), ...turned };
}

/** A stored stretch as it is drawn: anything that is no pair of factors and angle in range reads as none. */
export function readMapStretch(value: unknown): MapStretch {
  if (typeof value !== 'object' || value === null) return NO_STRETCH;
  const { x, y, rotation } = value as { x?: unknown; y?: unknown; rotation?: unknown };
  const valid = (factor: unknown): factor is number => typeof factor === 'number' && factor >= MIN_FACTOR && factor <= MAX_FACTOR;
  const turned = typeof rotation === 'number' && rotation !== 0 && Math.abs(rotation) <= MAX_ROTATION_DEGREES;
  if (!valid(x) || !valid(y) || (rotation !== undefined && !turned && rotation !== 0)) return NO_STRETCH;
  if (x === 1 && y === 1 && !turned) return NO_STRETCH;
  return turned ? { x, y, rotation } : { x, y };
}

export function sameStretch(a: MapStretch, b: MapStretch): boolean {
  return a.x === b.x && a.y === b.y && (a.rotation ?? 0) === (b.rotation ?? 0);
}

/** Whether the image is drawn as it is: neither stretched nor turned. */
export function isPlain(stretch: MapStretch): boolean {
  return sameStretch(stretch, NO_STRETCH);
}

/**
 * Where a map image of `width` × `height` pixels lies once it is turned level: the image turns about
 * its centre, and the world begins at the corner of the box that then holds it. `box` is that box's
 * size and `corner` its corner, both in image pixels before the stretch.
 */
export function turnedBox(width: number, height: number, stretch: MapStretch): { cos: number; sin: number; box: { width: number; height: number }; corner: { x: number; y: number } } {
  const angle = ((stretch.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const box = { width: width * Math.abs(cos) + height * Math.abs(sin), height: width * Math.abs(sin) + height * Math.abs(cos) };
  return { cos, sin, box, corner: { x: (width - box.width) / 2, y: (height - box.height) / 2 } };
}
