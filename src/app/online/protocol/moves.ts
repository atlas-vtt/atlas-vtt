import { isRecord } from './shape.ts';
import { MAX_COORDINATE, TOKEN_ID_PATTERN } from './tokens.ts';

/** The longest scene id a message carries. */
export const MAX_SCENE_ID = 64;

/** The grid players' tokens snap to on a drop, as Atlas's own drop snaps them. */
export interface SnapGrid {
  readonly type: 'square' | 'hex-horizontal' | 'hex-vertical';
  /** Cell size in world pixels: a square's side, a hex's flat-to-flat distance. */
  readonly size: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** A player puts one of their tokens down: its centre in world pixels. */
export interface PlayerMove {
  readonly t: 'move';
  readonly scene: string;
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/**
 * A player is dragging one of their tokens: its centre under the pointer now, in world pixels, not
 * snapped. Sent while the drag lasts (the latest wins); the drop follows as a `move`.
 */
export interface PlayerDrag {
  readonly t: 'drag';
  readonly scene: string;
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/**
 * A player lets go of a drag without putting the token down (a second finger took the map, the touch
 * was cancelled, or the drop lay where the drag began): the GM puts the token back where the drag
 * took it from, leaving no undo step.
 */
export interface PlayerDragCancel {
  readonly t: 'drag-cancel';
  readonly scene: string;
  readonly id: string;
}

/**
 * The GM did not take a player's move: the token stays where the GM has it, which is `x`, `y`
 * when the players see it, else the place in the last list.
 */
export interface MoveRefused {
  readonly t: 'move-refused';
  readonly scene: string;
  readonly id: string;
  readonly x: number | null;
  readonly y: number | null;
  /** Why, where it was the turn: the token may move only on its turn. Other refusals give none. Absent from older GMs. */
  readonly reason?: 'turn';
}

const GRID_TYPES: readonly string[] = ['square', 'hex-horizontal', 'hex-vertical'];
const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const isSceneId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_SCENE_ID;
const isTokenId = (value: unknown): value is string => typeof value === 'string' && TOKEN_ID_PATTERN.test(value);

/** A snap grid, null for none, or undefined for anything malformed. */
export function parseSnapGrid(value: unknown): SnapGrid | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.type !== 'string' || !GRID_TYPES.includes(value.type)) return undefined;
  const { size, offsetX, offsetY } = value;
  if (!isCoordinate(size) || !(size > 0) || !isCoordinate(offsetX) || !isCoordinate(offsetY)) return undefined;
  return { type: value.type as SnapGrid['type'], size, offsetX, offsetY };
}

/** A player's move or drag as the GM reads it, or null for anything malformed. */
export function parsePlayerMove<T extends 'move' | 'drag'>(value: Record<string, unknown>, t: T): { readonly t: T; readonly scene: string; readonly id: string; readonly x: number; readonly y: number } | null {
  const { scene, id, x, y } = value;
  return isSceneId(scene) && isTokenId(id) && isCoordinate(x) && isCoordinate(y) ? { t, scene, id, x, y } : null;
}

/** A drag cancel as the GM reads it, or null for anything malformed. */
export function parseDragCancel(value: Record<string, unknown>): PlayerDragCancel | null {
  const { scene, id } = value;
  return isSceneId(scene) && isTokenId(id) ? { t: 'drag-cancel', scene, id } : null;
}

/** A refused move as the client reads it, or null for anything malformed. */
export function parseMoveRefused(value: Record<string, unknown>): MoveRefused | null {
  const { scene, id, x, y } = value;
  if (!isSceneId(scene) || !isTokenId(id)) return null;
  // The reason is optional: anything but `turn` reads as none, so a page never fails on it
  const reason = value.reason === 'turn' ? { reason: 'turn' as const } : {};
  if (x === null && y === null) return { t: 'move-refused', scene, id, x: null, y: null, ...reason };
  return isCoordinate(x) && isCoordinate(y) ? { t: 'move-refused', scene, id, x, y, ...reason } : null;
}
