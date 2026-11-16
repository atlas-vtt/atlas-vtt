/**
 * What a view of one level shows at each place: the level itself, a level below it seen through
 * an opening, or nothing (VOID). One raster on a fixed grid of texels that the rule (`shownAt`,
 * perception of tokens below) and the picture (the composite, the eraser) both read, byte for
 * byte, so nothing below is ever drawn where the rule does not count it.
 */

import type { LevelSurface, SceneLevel } from '../types/sceneLevelTypes';
import type { Point } from '../types/visionTypes';
import type { ArtCells } from './artRaster';
import { paintPolygon, polygonBox, type TexelBox } from './surfaceRaster';

/** The levels below one that are drawn at most; the stack reads every other one as VOID. */
export const MAX_LEVELS_SHOWN_BELOW = 2;
/** The longest side of the stack's grid in texels: a larger map gets texels of more than one world pixel. */
export const STACK_MAX_SIDE = 2048;
/** The level the view shows. */
export const VIEWED = 0;
/** Nothing is shown: no level below is drawn there, or none has floor there. */
export const VOID = 255;

/**
 * The stack's texels from the world's origin, `texel` world pixels a side: over the viewed level's
 * map and those of the levels below it draws, so a level smaller than one below it (a tower over
 * open ground) sees what lies beyond its own map.
 */
export interface StackGrid {
  width: number;
  height: number;
  texel: number;
  columns: number;
  rows: number;
}

/** The grid over a map of `bounds`: square texels of one world pixel, larger on maps over `STACK_MAX_SIDE` px. */
export function stackGrid(bounds: { width: number; height: number }): StackGrid {
  const texel = Math.max(1, Math.max(bounds.width, bounds.height) / STACK_MAX_SIDE);
  return {
    width: bounds.width,
    height: bounds.height,
    texel,
    // Less a rounding error's worth: the longer side of a large map is 2,048 texels, not one more.
    columns: Math.max(1, Math.ceil(bounds.width / texel - 1e-9)),
    rows: Math.max(1, Math.ceil(bounds.height / texel - 1e-9)),
  };
}

/**
 * What the view shows, by texel. Outside `box` it is the viewed level; inside, `cells` holds the
 * index into `levels` (0 the viewed level, 1 and 2 the levels below drawn, nearest first) or `VOID`.
 */
export interface LevelStack {
  grid: StackGrid;
  /** The viewed level, then the levels below drawn, nearest first. */
  levels: readonly string[];
  /** The texels where the view shows anything but its own level; null where it shows only that. */
  box: TexelBox | null;
  cells: Uint8Array;
}

/** A level the stack reads: its surfaces, in order, and where its own map leaves its floor open. */
export interface StackLevel {
  id: string;
  surfaces: readonly LevelSurface[];
  /**
   * The level's map on the stack's grid (`artCells`): no floor where it is open (transparent, or
   * outside the image). Unset, the level has floor on every texel unless a surface opens it: its
   * map is not known yet, which fails closed.
   */
  art?: ArtCells | undefined;
}

/**
 * A level's floor on `box`: 1 where it is open, 0 where it has floor, by its map and then its
 * surfaces in order; null where it has floor on all of it.
 */
function openCells(level: StackLevel, grid: StackGrid, box: TexelBox): Uint8Array | null {
  let open: Uint8Array | null = null;
  const art = level.art;
  if (art?.box && intersect(art.box, box)) {
    open = new Uint8Array(box.columns * box.rows);
    for (let row = 0; row < box.rows; row++) {
      const from = (box.y + row) * grid.columns + box.x;
      open.set(art.open.subarray(from, from + box.columns), row * box.columns);
    }
  }
  for (const surface of level.surfaces) {
    const area = polygonBox(surface.polygon, grid.texel, grid.columns, grid.rows);
    const overlap = area && intersect(area, box);
    if (!overlap) continue;
    // A floor over floor changes nothing.
    if (!surface.open && !open) continue;
    open ??= new Uint8Array(box.columns * box.rows);
    paintPolygon(surface.polygon, grid.texel, overlap, surface.open, open, box);
  }
  return open;
}

function intersect(a: TexelBox, b: TexelBox): TexelBox | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.columns, b.x + b.columns);
  const bottom = Math.min(a.y + a.rows, b.y + b.rows);
  return right > x && bottom > y ? { x, y, columns: right - x, rows: bottom - y } : null;
}

/** The smallest box holding both. */
function union(a: TexelBox | null, b: TexelBox | null): TexelBox | null {
  if (!a || !b) return a ?? b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, columns: Math.max(a.x + a.columns, b.x + b.columns) - x, rows: Math.max(a.y + a.rows, b.y + b.rows) - y };
}

/** The texels of the grid the viewed level may be open on: the bounds of its map's open texels and of its open surfaces; null without any. */
export function openingsBox(level: StackLevel, grid: StackGrid): TexelBox | null {
  let box = level.art?.box ?? null;
  for (const surface of level.surfaces) {
    if (surface.open) box = union(box, polygonBox(surface.polygon, grid.texel, grid.columns, grid.rows));
  }
  return box;
}

/**
 * The stack of a view of `viewed`, whose levels below are `below`, nearest first. At each texel
 * the viewed level shows where it has floor; elsewhere the walk goes down to the first level with
 * floor there, which shows if it is one of `shown` (the levels below the view draws, nearest
 * first: their index in the stack is their place there, plus one), and is VOID otherwise. Where
 * no level below has floor (a chasm) it is VOID.
 */
export function levelStack(viewed: StackLevel, below: readonly StackLevel[], shown: readonly string[], grid: StackGrid): LevelStack {
  const levels = [viewed.id, ...shown];
  const openings = openingsBox(viewed, grid);
  const own = openings && openCells(viewed, grid, openings);
  if (!openings || !own) return { grid, levels, box: null, cells: new Uint8Array(0) };
  // What each level below shows where it has floor, nearest first; the walk stops at the first that has.
  const floors = below.map((level) => ({ open: openCells(level, grid, openings), value: shown.includes(level.id) ? shown.indexOf(level.id) + 1 : VOID }));
  const cells = new Uint8Array(own.length);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  // Only the open texels of the viewed level are looked at: the search for the next one is the array's own.
  for (let i = own.indexOf(1); i >= 0; i = own.indexOf(1, i + 1)) {
    let value = VOID;
    for (const floor of floors) {
      if (floor.open && floor.open[i]) continue;
      value = floor.value;
      break;
    }
    cells[i] = value;
    const row = Math.floor(i / openings.columns);
    const column = i - row * openings.columns;
    if (column < minX) minX = column;
    if (column > maxX) maxX = column;
    if (row < minY) minY = row;
    maxY = row;
  }
  if (minX === Infinity) return { grid, levels, box: null, cells: new Uint8Array(0) };
  // Cut to the texels that show anything but the viewed level.
  const box: TexelBox = { x: openings.x + minX, y: openings.y + minY, columns: maxX - minX + 1, rows: maxY - minY + 1 };
  const cut = new Uint8Array(box.columns * box.rows);
  for (let row = 0; row < box.rows; row++) {
    const from = (minY + row) * openings.columns + minX;
    cut.set(cells.subarray(from, from + box.columns), row * box.columns);
  }
  return { grid, levels, box, cells: cut };
}

/** What the stack shows at texel (`column`, `row`): an index into its levels, or VOID outside its grid. */
export function shownAtCell(stack: LevelStack, column: number, row: number): number {
  const { grid, box } = stack;
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return VOID;
  if (!box || column < box.x || row < box.y || column >= box.x + box.columns || row >= box.y + box.rows) return VIEWED;
  return stack.cells[(row - box.y) * box.columns + column - box.x]!;
}

/** What the stack shows at world point `p`: the texel holding it decides, as the picture's `texelFetch` does. */
export function shownAt(stack: LevelStack, p: Point): number {
  return shownAtCell(stack, Math.floor(p.x / stack.grid.texel), Math.floor(p.y / stack.grid.texel));
}

/** Whether the stack shows anything but the viewed level, and the level below at index `index` somewhere. */
export function showsBelow(stack: LevelStack, index: number): boolean {
  return stack.box !== null && stack.cells.includes(index);
}

/**
 * `stack` as a view draws it while only the levels below for which `drawn` holds can be shown (the
 * others' pictures are not ready): their texels show nothing. The same stack where all can.
 */
export function withDrawn(stack: LevelStack, drawn: (index: number) => boolean): LevelStack {
  if (!stack.box) return stack;
  const hidden = stack.levels.map((_, index) => index > 0 && !drawn(index));
  if (!hidden.some((isHidden, index) => isHidden && stack.cells.includes(index))) return stack;
  const cells = stack.cells.map((value) => (value !== VOID && hidden[value] ? VOID : value));
  return { ...stack, cells };
}

/**
 * The levels below `viewed` that its view draws, nearest first: those the level sees (`sees`;
 * unset, every level below), at most `MAX_LEVELS_SHOWN_BELOW`.
 */
export function levelsShownBelow(levels: readonly SceneLevel[], viewed: string): string[] {
  const at = levels.findIndex((level) => level.id === viewed);
  if (at <= 0) return [];
  const sees = levels[at]!.sees;
  const shown: string[] = [];
  for (let index = at - 1; index >= 0 && shown.length < MAX_LEVELS_SHOWN_BELOW; index--) {
    const id = levels[index]!.id;
    if (!sees || sees.includes(id)) shown.push(id);
  }
  return shown;
}

/** The levels below `viewed`, nearest first. */
export function levelsBelow(levels: readonly SceneLevel[], viewed: string): SceneLevel[] {
  const at = levels.findIndex((level) => level.id === viewed);
  return at <= 0 ? [] : levels.slice(0, at).reverse();
}
