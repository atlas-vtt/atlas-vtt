/**
 * What stands or lies in a floor's rooms besides their terrain and the pieces of their recipes
 * (placed with the terrain, `terrain/typeTerrain.ts`): columns, rubble and cracks. Stairwells, the
 * rows they are reached from, the cells before doors, every cell terrain fills and every cell a
 * piece stands on stay clear. Each room draws from a stream of its own, so one room's things
 * never move another's.
 */

import { type FloorStack, stairEnd } from './floors/floorStack';
import type { DungeonColumn, DungeonCrack, DungeonDoor, DungeonRoom, DungeonRubble, DungeonStair, DungeonTerrain } from './model';
import type { DungeonParams } from './params';
import { cellKey, cellsOf, maskOf } from './geometry';
import { approachCells, doorApproaches, spotRect } from './floors/stairSpots';
import { columnStyle, colonnadeOf } from './props/columns';
import { frameOf } from './props/roomFrame';
import { cracksIn, rubbleIn } from './props/scatter';
import { roomSpace } from './props/space';
import { chance, floorStream, stream } from './rng';

export interface ScatterResult {
  rubble: DungeonRubble[];
  cracks: DungeonCrack[];
}

export interface ScatterInput {
  seed: number;
  /** The floor's index. */
  floor: number;
  /** Which floor lies over which, for the end of each stairwell on this floor. */
  stack: FloorStack;
  rooms: readonly DungeonRoom[];
  doors: readonly DungeonDoor[];
  stairs: readonly DungeonStair[];
  columns: readonly DungeonColumn[];
  terrain: readonly DungeonTerrain[];
  params: DungeonParams;
  /** The cells that pieces stand on, by key. */
  furnished: ReadonlySet<string>;
}

/** Rooms that get a few more stones in a crumbling dungeon. */
const CRUMBLED_SHARE = 1 / 3;
const CRUMBLED_RUBBLE = 3;

/** The cells a floor keeps clear: its stairwells, the rows they are reached from, the cells before its doors and its terrain. */
function clearCells(input: ScatterInput): Set<string> {
  const { floor, rooms, doors, stairs, terrain } = input;
  const cells = [
    ...stairs.flatMap((s) => [...cellsOf(spotRect(s)), ...approachCells(s, stairEnd(input.stack, floor, s.to))]),
    ...rooms.flatMap((room) => doorApproaches(room, doors)),
    ...terrain.flatMap((piece) => piece.cells),
  ];
  return new Set(cells.map((c) => cellKey(c.x, c.y)));
}

/** How near a stone may lie to the middle of a cell something stands on, in cells. */
const KEEP_OFF = 0.75;

/** The middle of a stone. */
function middleOf(stone: DungeonRubble): { x: number; y: number } {
  const n = stone.points.length;
  return { x: stone.points.reduce((sum, p) => sum + p.x, 0) / n, y: stone.points.reduce((sum, p) => sum + p.y, 0) / n };
}

/** Whether a column stands on or against a stairwell. */
function inStairs(column: DungeonColumn, stairs: readonly DungeonStair[]): boolean {
  return stairs.some((s) => column.x >= s.x - column.radius && column.x <= s.x + s.w + column.radius && column.y >= s.y - column.radius && column.y <= s.y + s.h + column.radius);
}

/** A floor's columns: colonnades in the rooms that have them, off its stairwells. */
export function floorColumns(seed: number, floor: number, rooms: readonly DungeonRoom[], stairs: readonly DungeonStair[], params: DungeonParams): DungeonColumn[] {
  // A cave has no columns: its stone columns are formations, pieces of their own.
  if (params.cave) return [];
  const style = columnStyle(stream(seed, 'props', 'style'), params.shatteredChance);
  return rooms.flatMap((room) => colonnadeOf(floorStream(seed, 'props', floor, `columns:${room.id}`), room, style).filter((c) => !inStairs(c, stairs)));
}

/**
 * Rubble on the floors and cracks running from the walls, off everything that stands there. Stones
 * are strewn as if no piece stood in the room and those that would lie under one are left out, so
 * which pieces are drawn never moves a stone.
 */
export function placeScatter(input: ScatterInput): ScatterResult {
  const { seed, floor, rooms, doors, stairs, columns, terrain, params } = input;
  const clear = clearCells(input);
  const keepOff = [...stairs.flatMap((s) => cellsOf(spotRect(s))), ...terrain.flatMap((p) => p.cells)].map((c) => ({ x: c.x + 0.5, y: c.y + 0.5, radius: KEEP_OFF }));
  const furnished = [...input.furnished].map((k) => k.split(',').map(Number) as [number, number]);
  const underPiece = (stone: DungeonRubble): boolean => {
    const at = middleOf(stone);
    return furnished.some(([x, y]) => Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y) < KEEP_OFF);
  };
  const result: ScatterResult = { rubble: [], cracks: [] };
  for (const room of rooms) {
    const rng = floorStream(seed, 'props', floor, room.id);
    const frame = frameOf(room);
    const space = roomSpace(frame, clear, columns, maskOf(room));
    const extra = params.tags.has('crumbling') && chance(rng, CRUMBLED_SHARE) ? CRUMBLED_RUBBLE : 0;
    result.rubble.push(...rubbleIn(rng, frame, params.rubbleArea, extra, [...space.taken, ...keepOff]).filter((stone) => !underPiece(stone)));
    result.cracks.push(...cracksIn(rng, frame, doors, params.crackChance));
  }
  return result;
}
