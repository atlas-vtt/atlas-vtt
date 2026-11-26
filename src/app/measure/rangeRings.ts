/**
 * The rings the measure tool's Ranges mode draws around a token or a point: the collection's
 * range bands where it measures in bands, else the steps of the token's movement (its speed
 * times each step's multiple). A ring says how far something reaches, never what walls leave of it.
 */

import { formatGameUnits, isValidRangeBandThreshold, type MeasurementSettings } from '../grid/measurementFormat';
import type { RangeBand } from '../types/collectionSettingsTypes';
import type { MovementRules } from './movementRules';

/** One ring: everything within its reach of what it is drawn around. */
export interface RangeRing {
  /** The band's or step's name. */
  readonly name: string;
  /** What its label says: a band's name, a step's name with how far it reaches ("Dash · 60ft"). */
  readonly label: string;
  /** The farthest a distance in cells may be and still lie in the ring. */
  readonly reach: number;
  /** A step's colour, '#rrggbb'; null for a band, which takes the theme's accent. */
  readonly color: string | null;
}

/** The most rings drawn around one place: more would cover the map. */
export const MAX_RANGE_RINGS = 8;

/** How far a distance may pass a step's end and still lie in it, in cells: six cells worked out as 6.0000001 are six. */
const REACH_TOLERANCE = 1e-6;

/** What the rings read of how a map measures. */
export type RangeSettings = Pick<MeasurementSettings, 'mode' | 'unitType' | 'unitName' | 'unitDistance' | 'rangeBands'>;

/**
 * A ring per band that ends somewhere. A distance is named by the first band whose threshold its
 * rounded cells do not pass (`rangeBandName`), so a band reaches half a cell past its threshold;
 * the last band names every longer distance and has no ring, and neither has a band an earlier
 * one already covers.
 */
export function bandRings(bands: readonly RangeBand[]): RangeRing[] {
  const rings: RangeRing[] = [];
  let covered = 0;
  for (const band of bands.slice(0, -1)) {
    if (rings.length >= MAX_RANGE_RINGS) break;
    if (!isValidRangeBandThreshold(band.maxSquares) || band.maxSquares <= covered) continue;
    covered = band.maxSquares;
    rings.push({ name: band.name, label: band.name, reach: band.maxSquares + 0.5 - REACH_TOLERANCE, color: null });
  }
  return rings;
}

/** A ring per movement step of a token that moves `speed` game units: as far as the step reaches, in its colour. */
export function stepRings(speed: number, movement: MovementRules, settings: RangeSettings): RangeRing[] {
  if (!(speed > 0) || !Number.isFinite(speed) || !(settings.unitDistance > 0)) return [];
  return movement.steps.slice(0, MAX_RANGE_RINGS).map((step) => {
    const distance = speed * step.multiple;
    return {
      name: step.name,
      label: `${step.name} · ${formatGameUnits(distance, settings)}`,
      reach: distance / settings.unitDistance + REACH_TOLERANCE,
      color: step.color,
    };
  });
}

/**
 * The rings around a place of a map that measures by `settings` and moves by `movement`: its
 * bands, or the steps of a token of `speed` (null for a point, and for a token whose speed is
 * not known). None where there is nothing to draw.
 */
export function rangeRings(settings: RangeSettings, movement: MovementRules, speed: number | null): RangeRing[] {
  if (settings.mode === 'abstract') return bandRings(settings.rangeBands);
  return speed === null ? [] : stepRings(speed, movement, settings);
}

/** Whether a map has rings to show at all: bands that end somewhere, or movement steps where it measures distances. */
export function rangesOffered(settings: RangeSettings, movement: MovementRules): boolean {
  if (settings.mode === 'abstract') return bandRings(settings.rangeBands).length > 0;
  return movement.steps.length > 0 && settings.unitDistance > 0;
}
