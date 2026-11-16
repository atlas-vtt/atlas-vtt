/**
 * The range check: with one token selected, the distance to the token under the pointer. Nothing
 * is pressed and nothing is kept; the rules here say between which two tokens it runs, where its
 * line is drawn and what it reads.
 */

import { formatDistance, type MeasurementSettings } from '../grid/measurementFormat';
import type { Point } from '../types/visionTypes';
import { distanceBetweenTokens, spaceRadius, type PlacedToken, type TokenGrid } from './tokenDistance';

/**
 * The two tokens a range check runs between: the selected one and the hovered one. None unless
 * the selection is exactly one token of `tokens` (the level shown) and another of them is hovered.
 */
export function rangeCheckPair<Token>(
  selectedIds: readonly string[],
  hoveredId: string | null,
  tokens: Readonly<Record<string, Token>>,
): { readonly from: Token; readonly to: Token } | null {
  const [selectedId] = selectedIds;
  if (selectedIds.length !== 1 || selectedId === undefined || hoveredId === null || hoveredId === selectedId) return null;
  const from = tokens[selectedId];
  const to = tokens[hoveredId];
  return from && to ? { from, to } : null;
}

/**
 * Where the check's line runs: along the line between the two centres, from the edge of one
 * token's space to the edge of the other's (tokens are drawn round, so these are their nearest
 * points). Null where the spaces touch or overlap and no line fits between them.
 */
export function rangeCheckLine(from: PlacedToken, to: PlacedToken, grid: Pick<TokenGrid, 'size'>): { readonly from: Point; readonly to: Point } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const apart = Math.hypot(dx, dy);
  const fromRadius = spaceRadius(from, grid);
  const toRadius = spaceRadius(to, grid);
  if (!Number.isFinite(apart) || !(apart > fromRadius + toRadius)) return null;
  const ux = dx / apart;
  const uy = dy / apart;
  return {
    from: { x: from.x + ux * fromRadius, y: from.y + uy * fromRadius },
    to: { x: to.x - ux * toRadius, y: to.y - uy * toRadius },
  };
}

/** What the check reads: the distance between the two tokens as the map counts and writes it (`distanceBetweenTokens`), a band's name where it measures in bands. */
export function rangeCheckText(from: PlacedToken, to: PlacedToken, grid: TokenGrid, settings: MeasurementSettings): string {
  return formatDistance(distanceBetweenTokens(from, to, grid, settings), settings);
}
