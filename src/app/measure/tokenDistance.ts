/**
 * How far two tokens are apart, and which token stands at a point.
 *
 * On a grid a token stands on whole cells (its footprint, as token placement reads it), and the
 * distance is counted from the nearest cell of one to the nearest cell of the other: tokens side
 * by side are one cell apart, as a reach of one cell reads, a large token is measured from its
 * edge, and tokens that share a cell are 0 apart. The grid's diagonal rule prices the way, with
 * the difference in height as a third axis under the same rule (`cellsByRule` says how each rule
 * counts it; hexes count their steps and price a step that climbs as the diagonal it is).
 *
 * Where tokens stand anywhere (the grid's Snap is off) there are no cells to count: the distance
 * is the straight line from one token's edge to the other's, with the height.
 */

import { cellsByRule, flatCells, type GridGeometry } from '../grid/gridDistance';
import type { MeasurementSettings } from '../grid/measurementFormat';
import { levelById, resolveLevel, type SceneLevels } from '../levels/sceneLevels';
import { tokenDiameterInCells } from '../pixi/token-renderer/tokenSizing';
import type { Point } from '../types/visionTypes';
import { cellKeyAt, lengthInCells } from './measureGrid';
import { cellsStoodOn, placementGridOf } from './measureTokens';
import { riseInCells, tokenHeight, type HasHeight } from './tokenHeight';

/** The grid tokens stand on, with its Snap setting: off, a token stands anywhere and covers a circle. */
export type TokenGrid = GridGeometry & { readonly snapToGrid?: boolean | undefined };

/** What the rules read of a token: where it stands, its size, its height and its level. */
export interface PlacedToken extends HasHeight {
  readonly x: number;
  readonly y: number;
  readonly size?: number | undefined;
  readonly level?: string | undefined;
  /** Its place in the pile (`raiseTokens`); unset is 0. */
  readonly layer?: number | undefined;
}

/** Whether tokens stand on whole cells of `grid`, which distances then count; else they stand anywhere. */
export const countsCells = (grid: TokenGrid): boolean => grid.snapToGrid !== false && grid.size > 0;

/** Half the width of the space a token takes up, in world pixels. */
export function spaceRadius(token: Pick<PlacedToken, 'size'>, grid: Pick<TokenGrid, 'size'>): number {
  return (Math.max(1, tokenDiameterInCells(token.size || 1)) * grid.size) / 2;
}

/** What a token's floor adds to its height: its level's, where the scene's levels are given and have one. */
function floorOf(token: PlacedToken, levels: SceneLevels): number {
  const bottom = levelById(levels, resolveLevel(levels, token.level))?.elevation.bottom;
  return typeof bottom === 'number' && Number.isFinite(bottom) ? bottom : 0;
}

/**
 * The distance between two tokens in cells (see the top of this file), by the map's `settings`.
 * `levels` are the scene's, given only by a caller that shows tokens of several levels together:
 * a token then stands as high as its level's floor and its own height above it. Without them
 * both tokens stand on one floor.
 */
export function distanceBetweenTokens(
  a: PlacedToken,
  b: PlacedToken,
  grid: TokenGrid,
  settings: Pick<MeasurementSettings, 'mode' | 'unitDistance' | 'diagonalRule'>,
  levels?: SceneLevels,
): number {
  const rise = riseInCells(tokenHeight(a) + floorOf(a, levels) - tokenHeight(b) - floorOf(b, levels), settings);
  if (!countsCells(grid)) {
    const gap = Math.max(0, Math.hypot(b.x - a.x, b.y - a.y) - spaceRadius(a, grid) - spaceRadius(b, grid));
    const flat = grid.size > 0 ? lengthInCells(gap, grid.size) : 0;
    return rise === 0 ? flat : Math.hypot(flat, rise);
  }
  const placement = placementGridOf(grid);
  const cellsOfB = cellsStoodOn(b, b.size || 1, placement);
  let nearest = Infinity;
  for (const from of cellsStoodOn(a, a.size || 1, placement)) {
    for (const to of cellsOfB) nearest = Math.min(nearest, cellsByRule(flatCells(grid, [from, to]), settings.diagonalRule, rise));
  }
  return nearest;
}

/**
 * The token standing at `point`, the one lying on top where several do (the last of the highest
 * `layer`, as a click picks it); null where none stands. On a grid a token stands at every point
 * of the cells of its footprint, so a point snapped to a cell of a large token is on it; where
 * tokens stand anywhere, within the circle of its space.
 */
export function tokenStandingAt<T extends PlacedToken>(point: Point, tokens: Iterable<T>, grid: TokenGrid): T | null {
  const cells = countsCells(grid);
  const placement = cells ? placementGridOf(grid) : null;
  const key = cells ? cellKeyAt(grid, point) : null;
  let top: T | null = null;
  for (const token of tokens) {
    if (!Number.isFinite(token.x) || !Number.isFinite(token.y)) continue;
    if (top && (token.layer ?? 0) < (top.layer ?? 0)) continue;
    const dx = point.x - token.x;
    const dy = point.y - token.y;
    const radius = spaceRadius(token, grid);
    if (placement) {
      // A footprint lies within its space, and a freely placed token's cell within a cell of it.
      if (Math.abs(dx) > radius + grid.size || Math.abs(dy) > radius + grid.size) continue;
      if (!cellsStoodOn(token, token.size || 1, placement).some((cell) => cellKeyAt(grid, cell) === key)) continue;
    } else if (dx * dx + dy * dy > radius * radius) continue;
    top = token;
  }
  return top;
}
