import { movementWalls, stopAtWalls, type MoveWalls, type Point } from '../movement/index.ts';
import { MAX_COORDINATE, type PlayerMove } from '../protocol/index.ts';
import type { TokenEntity } from '../../types';
import type { WallSegment } from '../../types/wallTypes';
import { wallList } from '../../vision/wallList';

/** The map's size in world pixels: the image lies at (0, 0) at its natural size. */
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

/**
 * Where a player's token moving from `from` towards `to` comes to rest: at `to`, or on a lit scene
 * just before the first wall in its way, slid along it (`stopAtWalls`).
 */
export function landing(context: Pick<MoveContext, 'walls'>, from: Point, to: Point): Point {
  return context.walls === null ? to : stopAtWalls(context.walls, from, to);
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
