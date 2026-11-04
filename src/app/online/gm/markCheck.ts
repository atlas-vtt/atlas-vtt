import { MAX_COORDINATE, type CursorState, type LaserState, type MarkPoint, type MeasureState, type PlayerCursor, type PlayerLaser, type PlayerMeasure, type SharedMeasure } from '../protocol/index.ts';
import { LASER_COLOR_SWATCHES, resolveLaserPointerSettings } from '../../tools/laserPointerSettings';
import { MoveRate, type MapSize } from './moveCheck.ts';

/** What a player's marks are checked against. */
export interface MarkContext {
  /** The shared scene, or null while none is. */
  readonly scene: string | null;
  /** The map's size, or null when it is unknown. */
  readonly map: MapSize | null;
}

/** Laser and measure messages a player may send a second, each: the client sends one every `MARKS_INTERVAL_MS`, about 30. */
export const MARKS_PER_SECOND = 40;

/** A rate per player for one kind of mark: anything above `MARKS_PER_SECOND` is dropped. */
export const markRate = (): MoveRate => new MoveRate(MARKS_PER_SECOND, MARKS_PER_SECOND);

const SWATCHES: readonly string[] = LASER_COLOR_SWATCHES.map((swatch) => swatch.value);

/** A colour of Atlas's laser swatches, as the swatch writes it, or null for any other. */
export function swatchColour(colour: string): string | null {
  return SWATCHES.find((swatch) => swatch === colour.toLowerCase()) ?? null;
}

/**
 * Whether a mark's point is near the map: on it, or no further off it than the map is large (a laser
 * or ruler held just past the edge is fine; numbers far away are not). Without a known size, within
 * the coordinates the protocol allows.
 */
export function nearMap([x, y]: MarkPoint, map: MapSize | null): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (map === null) return Math.abs(x) <= MAX_COORDINATE && Math.abs(y) <= MAX_COORDINATE;
  return x >= -map.width && x <= 2 * map.width && y >= -map.height && y <= 2 * map.height;
}

/**
 * A player's laser as the GM takes it, or null when it is refused: another scene, or a colour that is
 * not a swatch. The size is clamped as Atlas clamps its own; a pointer and trail points off the map are
 * left out.
 */
export function checkLaser(message: PlayerLaser, context: MarkContext): LaserState | null {
  if (context.scene === null || message.scene !== context.scene) return null;
  const color = swatchColour(message.color);
  if (color === null) return null;
  const { size } = resolveLaserPointerSettings({ size: message.size });
  const at = message.at !== null && nearMap(message.at, context.map) ? message.at : null;
  const pts: number[] = [];
  for (let index = 0; index + 1 < message.pts.length; index += 2) {
    const point: MarkPoint = [message.pts[index] ?? Number.NaN, message.pts[index + 1] ?? Number.NaN];
    if (nearMap(point, context.map)) pts.push(...point);
  }
  return { color, size, at, pts, on: message.on, ...(message.span !== undefined && { span: message.span }) };
}

const measureNearMap = (measure: SharedMeasure, map: MapSize | null): boolean => nearMap(measure.a, map) && nearMap(measure.b, map);

/**
 * A player's measurements as the GM takes them, or null when they are refused: another scene, or a
 * colour that is not a swatch. Measurements off the map are left out, and with the one being drawn its span.
 */
export function checkMeasure(message: PlayerMeasure, context: MarkContext): MeasureState | null {
  if (context.scene === null || message.scene !== context.scene) return null;
  const color = swatchColour(message.color);
  if (color === null) return null;
  const live = message.live !== null && measureNearMap(message.live, context.map) ? message.live : null;
  const kept = message.kept.filter((measure) => measureNearMap(measure, context.map));
  return { color, live, kept, ...(live !== null && message.span !== undefined && { span: message.span }) };
}

/**
 * A player's cursor as the GM takes it, or null when it is refused: another scene. A pointer and
 * places off the map are left out.
 */
export function checkCursor(message: PlayerCursor, context: MarkContext): CursorState | null {
  if (context.scene === null || message.scene !== context.scene) return null;
  const at = message.at !== null && nearMap(message.at, context.map) ? message.at : null;
  const pts: number[] = [];
  for (let index = 0; index + 1 < message.pts.length; index += 2) {
    const point: MarkPoint = [message.pts[index] ?? Number.NaN, message.pts[index + 1] ?? Number.NaN];
    if (nearMap(point, context.map)) pts.push(...point);
  }
  return { at, pts, ...(message.span !== undefined && { span: message.span }) };
}
