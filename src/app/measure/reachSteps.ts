/**
 * The steps a reach set by hand moves in: a token's height and its aura, which the token menu's
 * + and − change. A map that measures distances steps one cell at a time. A map that measures in
 * range bands steps from band to band, so a reach is always one its game names: Melee, Close, Far.
 */

import type { MeasurementSettings } from '../grid/measurementFormat';

/** What says how a map steps a reach. */
export type ReachSettings = Pick<MeasurementSettings, 'mode' | 'rangeBands'>;

/** A reach a map with range bands names: the band, and how far it reaches in cells. */
export interface BandReach {
  readonly name: string;
  readonly cells: number;
}

/**
 * The reaches a map with range bands names, nearest first; none where it steps by cells. Of bands
 * that end at the same cell the first is the reach's name, as a distance is named (`rangeBandName`).
 */
export function bandReachChoices({ mode, rangeBands }: ReachSettings): BandReach[] {
  if (mode !== 'abstract') return [];
  const reaches = new Map<number, string>();
  for (const { name, maxSquares } of rangeBands) {
    if (Number.isFinite(maxSquares) && maxSquares > 0 && !reaches.has(maxSquares)) reaches.set(maxSquares, name);
  }
  return [...reaches].map(([cells, name]) => ({ name, cells })).sort((a, b) => a.cells - b.cells);
}

/** The band a reach of `cells` is written as: the first that reaches as far, the farthest past them all; none where the map names no reaches. */
export function bandReachOf(cells: number, settings: ReachSettings): BandReach | undefined {
  const choices = bandReachChoices(settings);
  return choices.find((band) => Math.round(cells) <= band.cells) ?? choices[choices.length - 1];
}

/** The reaches a map with range bands names, in cells, nearest first; none where it steps by cells. */
function bandReaches(settings: ReachSettings): number[] {
  return bandReachChoices(settings).map((band) => band.cells);
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
