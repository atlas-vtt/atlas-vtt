import { dropPlace, movementWalls, reaches, stopAtWalls, type MoveWalls, type Point } from '../movement/index.ts';
import { MAX_COORDINATE, type PlayerMove, type SnapGrid } from '../protocol/index.ts';
import type { TokenEntity } from '../../types';
import type { WallSegment } from '../../types/wallTypes';
import { wallList } from '../../vision/wallList';
import { gridSnap } from './gridSnap.ts';
import { tokenCells } from './scenePicture.ts';
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
  /** The grid a dropped token snaps to, as players are sent it (`snapGridOf`); none where it does not snap. */
  readonly snap?: SnapGrid | null;
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

/**
 * Where a player's token `tokenId` moving from `from` towards `to` comes to rest: at `to`, or just
 * before the first wall in its way (on a lit scene) or side of walked stairs on its level (on any
 * scene: `stairSides`, so it steps on and off stairs only at their ground end), slid along it (`stopAtWalls`).
 */
export function landing(context: Pick<MoveContext, 'walls' | 'map'>, state: StairsOfTokens, tokenId: string, from: Point, to: Point): Point {
  const walls = tokenWalls(context, state, tokenId);
  return walls === null ? to : stopAtWalls(walls, from, to);
}

/** The walls and stair sides a player's token `tokenId` stops at (`landing`), or null for none. */
function tokenWalls(context: Pick<MoveContext, 'walls' | 'map'>, state: StairsOfTokens, tokenId: string): MoveWalls | null {
  return withStairSides(context.walls, stairSides(state, tokenId, context.map));
}

/** How far a place may lie from the place it snaps to and still stand on it: token places reach players to a hundredth of a pixel. */
const ON_PLACE = 0.01;

/**
 * Where a player's token comes to rest when they put it down: where it lands (`landing`), and where a
 * wall cut the move short (this one, or a step of the drag it ends: `walled`) on a scene whose grid
 * snaps, on the nearest place the grid snaps it to that it reaches from there (`dropPlace`, the
 * page's own rule), so a token pushed into a wall rests in the cell before it and never half across
 * it, whatever the page sent.
 */
export function droppedLanding(context: Pick<MoveContext, 'walls' | 'map' | 'snap'>, state: StairsOfTokens, tokenId: string, from: Point & { readonly size?: number }, to: Point, walled = false): Point {
  const walls = tokenWalls(context, state, tokenId);
  const at = walls === null ? to : stopAtWalls(walls, from, to);
  const grid = context.snap ?? null;
  if (grid === null || walls === null || (!walled && at.x === to.x && at.y === to.y)) return at;
  const snap = gridSnap(grid, tokenCells(from));
  const own = snap(at);
  if (Math.abs(own.x - at.x) <= ON_PLACE && Math.abs(own.y - at.y) <= ON_PLACE) return at;
  return dropPlace(at, snap, grid.size, (a, b) => reaches(walls, a, b));
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
