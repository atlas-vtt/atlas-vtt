/**
 * Turning a selection as one rigid group, as pure geometry in world units. Angles are degrees and
 * turn clockwise on screen (y grows downwards), as a token's `rotation` does. A turn is rigid: the
 * tokens land where it shows them, so a formation that does not overlap never comes to.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A token as the turn found it. */
export interface TokenAtStart extends Point {
  readonly id: string;
  /** Degrees it faces; unset faces up. */
  readonly rotation: number | undefined;
}

/** Where a token stands and which way it faces after a turn. */
export interface TurnedToken extends Point {
  readonly id: string;
  readonly rotation: number;
}

/** The turn a press-and-drag snaps to, as a single token's turn does: 15°, or 45° with Shift. */
export const TURN_STEP = 15;
export const COARSE_TURN_STEP = 45;

/** `degrees` within (-180, 180]. */
function halfTurn(degrees: number): number {
  const turned = ((degrees % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
}

/** How far the pointer turned about `centre` from `from` to `to`, in (-180, 180]. */
export function pointerTurn(centre: Point, from: Point, to: Point): number {
  const start = Math.atan2(from.y - centre.y, from.x - centre.x);
  const now = Math.atan2(to.y - centre.y, to.x - centre.x);
  return halfTurn(((now - start) * 180) / Math.PI);
}

/** `degrees` snapped to the turn's step; never -0, never -180. */
export function snapTurn(degrees: number, coarse: boolean): number {
  const step = coarse ? COARSE_TURN_STEP : TURN_STEP;
  return halfTurn(Math.round(degrees / step) * step) || 0;
}

/** A sine or cosine without the rounding error a quarter turn leaves (6e-17 for 0), so a token turned 90° lands on whole pixels. */
function exact(value: number): number {
  const whole = Math.round(value);
  return Math.abs(value - whole) < 1e-12 ? whole : value;
}

/** `point` turned `degrees` about `centre`. */
export function orbit(point: Point, centre: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = exact(Math.cos(radians));
  const sin = exact(Math.sin(radians));
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

/** The facing `rotation` turned by `degrees`, within [0, 360). */
export function turnedFacing(rotation: number | undefined, degrees: number): number {
  return (((rotation ?? 0) + degrees) % 360 + 360) % 360;
}

/** Every token turned `degrees` about `centre`: its place orbits the centre and it faces as much further round. */
export function turnTokens(tokens: readonly TokenAtStart[], centre: Point, degrees: number): TurnedToken[] {
  return tokens.map((token) => ({ id: token.id, ...orbit(token, centre, degrees), rotation: turnedFacing(token.rotation, degrees) }));
}

/** Every point turned `degrees` about `centre`. */
export function turnPoints(points: readonly Point[], centre: Point, degrees: number): Point[] {
  return points.map((point) => orbit(point, centre, degrees));
}

/** A box in world units. */
export interface Footprint extends Point {
  readonly width: number;
  readonly height: number;
}

/** The middle of what is turned: of the box around every token's footprint and every drawing. */
export function formationMiddle(footprints: readonly Footprint[]): Point | null {
  if (footprints.length === 0) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const { x, y, width, height } of footprints) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/**
 * Where a group turns about on a grid, near `middle`, so that its clean turns map the grid onto
 * itself and a formation standing on cells lands on cells: on a square grid the nearer of the
 * closest cell centre and the closest cell corner (a quarter turn about either maps centres to
 * centres and corners to corners), on a hex grid the closest hex centre (a sixth of a turn about
 * it maps the grid onto itself). `snap` is where a token of a size snaps (`snapTokenCenter`):
 * size 1 a cell's centre, 1.5 (two cells across) a square grid's corner.
 */
export function gridPivot(middle: Point, hex: boolean, snap: (point: Point, size: number) => Point): Point {
  const centre = snap(middle, 1);
  if (hex) return centre;
  const corner = snap(middle, 1.5);
  const away = (point: Point): number => Math.hypot(point.x - middle.x, point.y - middle.y);
  return away(corner) < away(centre) ? corner : centre;
}

/** The angle as the turn shows it beside its handle: whole degrees, a minus sign for anticlockwise. */
export function turnLabel(degrees: number): string {
  const whole = Math.round(degrees);
  return whole < 0 ? `−${-whole}°` : `${whole}°`;
}
