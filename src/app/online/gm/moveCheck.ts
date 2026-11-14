import { movementWalls, reaches, stopAtWalls, type MoveWalls, type Point } from '../movement/index.ts';
import { MAX_COORDINATE, type PlayerMove } from '../protocol/index.ts';
import { snapTokenCenter } from '../../grid/gridPlacement';
import { cellCentreAt } from '../../measure/measureGrid';
import type { TokenEntity } from '../../types';
import type { GridState } from '../../types/gridTypes';
import type { WallSegment } from '../../types/wallTypes';
import { wallList } from '../../vision/wallList';
import { snapGridOf } from './scenePicture.ts';
import { stairSides, withStairSides, type StairsOfTokens } from './stairSides.ts';

/** The map's size in world pixels, from (0, 0): its image's own size, or the box Atlas draws it into turned, stretched and placed (`floorWorldSize`). */
export interface MapSize {
  readonly width: number;
  readonly height: number;
}

/** What a player's move is checked against. */
export interface MoveContext {
  /** The shared scene whose token list players were last sent, or null while none is. */
  readonly scene: string | null;
  /** The GM id of a token in that list, by the id players know it by. */
  listedToken(alias: string): string | undefined;
  ownerOf(tokenId: string): string | undefined;
  readonly tokens: Readonly<Record<string, TokenEntity>>;
  /** The map's size, or null when it is unknown (no image, or one whose header cannot be read). */
  readonly map: MapSize | null;
  /** The walls players' tokens stop at, or null where none do: a scene players do not see lit. */
  readonly walls: MoveWalls | null;
  /** Whether a token that fights may not move now, for it does not hold the turn (`movesOutOfTurn`); none are without. */
  outOfTurn?(tokenId: string): boolean;
}

export type MoveVerdict =
  | { readonly ok: true; readonly tokenId: string; readonly x: number; readonly y: number }
  | { readonly ok: false; readonly reason: 'scene' | 'token' | 'owner' | 'turn' | 'place' };

const within = (value: number, max: number): boolean => Number.isFinite(value) && value >= 0 && value <= max;

/** Whether a token's centre may stand at a place: inside the map, or near the origin when its size is unknown. */
export function insideMap(x: number, y: number, map: MapSize | null): boolean {
  if (map === null) return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= MAX_COORDINATE && Math.abs(y) <= MAX_COORDINATE;
  return within(x, map.width) && within(y, map.height);
}

/**
 * Whether the GM takes a player's move: the move names the shared scene and a token of the list
 * players see (so not hidden, not under fog), the token is not hidden now, it is the sender's
 * (by the id the relay stamped), it is not out of its turn where the GM chose that players move
 * only on their turn, and its centre lands inside the map.
 */
export function checkMove(from: string, move: Omit<PlayerMove, 't'>, context: MoveContext): MoveVerdict {
  if (context.scene === null || move.scene !== context.scene) return { ok: false, reason: 'scene' };
  const tokenId = context.listedToken(move.id);
  const token = tokenId === undefined ? undefined : context.tokens[tokenId];
  if (tokenId === undefined || token === undefined || token.isHidden === true) return { ok: false, reason: 'token' };
  if (context.ownerOf(tokenId) !== from) return { ok: false, reason: 'owner' };
  if (context.outOfTurn?.(tokenId) === true) return { ok: false, reason: 'turn' };
  if (!insideMap(move.x, move.y, context.map)) return { ok: false, reason: 'place' };
  return { ok: true, tokenId, x: move.x, y: move.y };
}

/** The walls players' tokens stop at on a scene players see lit (`movementWalls`), null on any other. */
export function sceneWalls(walls: Record<string, WallSegment>, lit: boolean, map: MapSize | null): MoveWalls | null {
  return lit ? movementWalls(wallList(walls), map) : null;
}

/** The walls a player's token `tokenId` stops at: the scene's (on a lit scene) and the sides of walked stairs on its level (on any scene: `stairSides`). */
function wallsOf(context: Pick<MoveContext, 'walls' | 'map'>, state: StairsOfTokens, tokenId: string): MoveWalls | null {
  return withStairSides(context.walls, stairSides(state, tokenId, context.map));
}

/**
 * Where a player's token `tokenId` moving from `from` towards `to` comes to rest: at `to`, or just
 * before the first wall in its way (on a lit scene) or side of walked stairs on its level (on any
 * scene: `stairSides`, so it steps on and off stairs only at their ground end), slid along it (`stopAtWalls`).
 */
export function landing(context: Pick<MoveContext, 'walls' | 'map'>, state: StairsOfTokens, tokenId: string, from: Point, to: Point): Point {
  const walls = wallsOf(context, state, tokenId);
  return walls === null ? to : stopAtWalls(walls, from, to);
}

/** What a drop reads of the store: the stairs, and the grid tokens snap to. */
export type DropState = StairsOfTokens & { readonly grid?: GridState | null };

/** Around a place no drop can end on, the places a drop snaps to are looked for one cell away in this many directions (a hex grid's six and a square grid's four among them). */
const NEIGHBOUR_DIRECTIONS = 12;

/**
 * Where a player's token put down at `to` ends, having stood at its own place: where the GM's own
 * drop would put it. The move comes to rest as any move does (`landing`), and from there the token
 * goes to the place a drop snaps it to (`snapTokenCenter`, on the grid players are sent,
 * `snapGridOf`) when no wall lies between; else to the nearest place a drop snaps to around it that
 * it reaches, so it never stays pressed against a wall off its cell; a place off the map is none it
 * reaches. Null when it reaches none. On a scene whose grid does not snap it ends where it came to rest.
 */
export function dropPlace(context: Pick<MoveContext, 'walls' | 'map'>, state: DropState, token: Pick<TokenEntity, 'id' | 'x' | 'y' | 'size'>, to: Point): Point | null {
  const walls = wallsOf(context, state, token.id);
  const rest = walls === null ? to : stopAtWalls(walls, token, to);
  const grid = snapGridOf(state.grid ?? null);
  if (grid === null) return rest;
  const snap = (point: Point): Point => snapTokenCenter(point, token.size || 1, grid.type, grid.size, (at) => cellCentreAt(grid, at));
  const reached = (place: Point): boolean => insideMap(place.x, place.y, context.map) && (walls === null || reaches(walls, rest, place));
  const snapped = snap(rest);
  if (reached(snapped)) return snapped;
  let nearest: Point | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (let direction = 0; direction < NEIGHBOUR_DIRECTIONS; direction += 1) {
    const angle = (direction / NEIGHBOUR_DIRECTIONS) * 2 * Math.PI;
    const place = snap({ x: rest.x + Math.cos(angle) * grid.size, y: rest.y + Math.sin(angle) * grid.size });
    const away = Math.hypot(place.x - rest.x, place.y - rest.y);
    if (away < distance && reached(place)) {
      nearest = place;
      distance = away;
    }
  }
  return nearest;
}

/** Whether two places are one to the players, whose places come rounded to a hundredth of a pixel: a place the player's page snapped itself may be a rounding off the GM's. */
export function samePlace(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

/** Moves a player may make: a burst of `MOVE_BURST`, then `MOVES_PER_SECOND` (a held movement key steps 5 times a second). */
export const MOVE_BURST = 8;
export const MOVES_PER_SECOND = 6;

/** A token bucket per player for their moves (or, with other limits, their drag messages). */
export class MoveRate {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly burst: number;
  private readonly perSecond: number;

  constructor(burst = MOVE_BURST, perSecond = MOVES_PER_SECOND) {
    this.burst = burst;
    this.perSecond = perSecond;
  }

  /** Takes one move of the player's; false when they are over their rate. */
  take(player: string, now: number): boolean {
    const bucket = this.buckets.get(player) ?? { tokens: this.burst, at: now };
    bucket.tokens = Math.min(this.burst, bucket.tokens + ((now - bucket.at) / 1000) * this.perSecond);
    bucket.at = now;
    this.buckets.set(player, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
