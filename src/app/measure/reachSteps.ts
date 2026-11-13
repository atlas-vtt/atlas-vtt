/**
 * The steps a reach set by hand moves in: a token's height and its aura, which the token menu's
 * + and − change. A map that measures distances steps one cell at a time. A map that measures in
 * range bands steps from band to band, so a reach is always one its game names: Melee, Close, Far.
 */

import type { MeasurementSettings } from '../grid/measurementFormat';

/** What says how a map steps a reach. */
export type ReachSettings = Pick<MeasurementSettings, 'mode' | 'rangeBands'>;

/** The reaches a map with range bands names, in cells, nearest first; none where it steps by cells. */
function bandReaches({ mode, rangeBands }: ReachSettings): number[] {
  if (mode !== 'abstract') return [];
  const reaches = rangeBands.map((band) => band.maxSquares).filter((squares) => Number.isFinite(squares) && squares > 0);
  return [...new Set(reaches)].sort((a, b) => a - b);
}

/** Whether the map names its reaches: it measures in range bands and has some. */
export function stepsByBands(settings: ReachSettings): boolean {
  return bandReaches(settings).length > 0;
}

/**
 * `cells` after `steps` steps up or down. By cells: one cell a step. By bands: to the next band's
 * reach, through none (0) and on to the bands of the other side, which a height below the floor
 * has; past the farthest band it stays there.
 */
export function steppedReach(cells: number, steps: number, settings: ReachSettings): number {
  const reaches = bandReaches(settings);
  if (reaches.length === 0) return cells + steps;
  const stops = [...reaches.map((reach) => -reach).reverse(), 0, ...reaches];
  let at = cells;
  for (let taken = 0; taken < Math.abs(steps); taken += 1) {
    const next = steps > 0 ? stops.find((stop) => stop > at) : stops.findLast((stop) => stop < at);
    if (next === undefined) break;
    at = next;
  }
  return at;
}
