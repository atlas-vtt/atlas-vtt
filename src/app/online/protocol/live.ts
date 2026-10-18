import type { MarkPoint } from './marks.ts';
import { isRecord } from './shape.ts';
import { MAX_COORDINATE, TOKEN_ID_PATTERN } from './tokens.ts';

/** How often the GM sends the places of the tokens being dragged: about 30 a second. */
export const LIVE_INTERVAL_MS = 33;
/** Tokens one live message may carry: those held at once. */
export const MAX_LIVE_TOKENS = 64;
/** The most points a drag's ruler carries: where the drag began, its waypoints and where the token would land. */
export const MAX_LIVE_PATH = 64;
/** The largest sender time a live message may carry (milliseconds since the sender's page started; about 34 years). */
const MAX_LIVE_TIME = 2 ** 40;

/**
 * Where a token being dragged is now; `end` once the drag let go of it, so the receiver hands it back
 * to the token list. `path` is the drag's ruler while it measures something: where the drag began,
 * each waypoint and the place the token would land on, snapped as Atlas's ruler snaps them (world
 * pixels). It comes only for a drag the players saw from its start; an older page reads none.
 */
export interface LivePlace {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly end?: true;
  readonly path?: readonly MarkPoint[];
}

/**
 * The places of the tokens being dragged in scene `scene` (by the GM or a player), as the GM has
 * them now: sent about 30 times a second while a drag lasts, never numbered, never kept; the latest
 * wins and a lost one is followed by the next. `at` is the GM's clock in milliseconds, so the
 * receiver can space the places as they were taken, whatever the network did to them. Only tokens
 * in the players' list that they see now are in it; the token list stays what the picture is.
 */
export interface LiveMessage {
  readonly t: 'live';
  readonly scene: string;
  readonly at: number;
  readonly tokens: readonly LivePlace[];
}

const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;

/** A ruler's path: two points or more, each a pair of coordinates; null for anything else. */
function parsePath(value: unknown): MarkPoint[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_LIVE_PATH) return null;
  const points: MarkPoint[] = [];
  for (const point of value as unknown[]) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const [x, y] = point as unknown[];
    if (!isCoordinate(x) || !isCoordinate(y)) return null;
    points.push([x, y]);
  }
  return points;
}

/** A live message's fields after its scene, or null for anything malformed. */
export function parseLive(value: Record<string, unknown>, scene: string): LiveMessage | null {
  const { at, tokens } = value;
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > MAX_LIVE_TIME) return null;
  if (!Array.isArray(tokens) || tokens.length > MAX_LIVE_TOKENS) return null;
  const places: LivePlace[] = [];
  for (const token of tokens as unknown[]) {
    if (!isRecord(token) || typeof token.id !== 'string' || !TOKEN_ID_PATTERN.test(token.id) || !isCoordinate(token.x) || !isCoordinate(token.y)) return null;
    if (token.end !== undefined && token.end !== true) return null;
    const path = token.path === undefined ? undefined : parsePath(token.path);
    if (path === null) return null;
    places.push({ id: token.id, x: token.x, y: token.y, ...(token.end === true && { end: true as const }), ...(path !== undefined && { path }) });
  }
  return { t: 'live', scene, at, tokens: places };
}
