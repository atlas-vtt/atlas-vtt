/**
 * What a measurement's label says: a ruler its length along its path, a circle or cone its size,
 * a line and a square their length and width, and an area with tokens in it their number.
 */

import { pathLengthInCells, type GridGeometry } from '../grid/gridDistance';
import { formatDistance, type MeasurementSettings } from '../grid/measurementFormat';
import { lengthInCells } from './measureGrid';
import type { Measurement } from './measureTypes';

/** A written distance as its number and what follows it: "20" and "ft", "7.5" and " mi". */
const NUMBER_THEN_UNIT = /^(\d+(?:\.\d+)?)(.*)$/;

/** Length and width as one text, the unit written once where both have the same: "20 × 5ft". */
function lengthByWidth(length: number, width: number, settings: MeasurementSettings): string {
  const long = formatDistance(length, settings);
  // Range bands name how far something is; a width has no band.
  if (settings.mode === 'abstract') return long;
  const wide = formatDistance(width, settings);
  const [, longNumber, longUnit] = NUMBER_THEN_UNIT.exec(long) ?? [];
  const [, wideNumber, wideUnit] = NUMBER_THEN_UNIT.exec(wide) ?? [];
  if (longNumber === undefined || wideNumber === undefined || longUnit !== wideUnit) return `${long} × ${wide}`;
  return `${longNumber} × ${wideNumber}${wideUnit ?? ''}`;
}

/**
 * The label of `measurement` on `grid`. An area's size is the straight distance of its drag in
 * cells, whatever the diagonal rule, so a circle of four cells reads the same in every direction;
 * a ruler's is its path by the rule. `tokens` is the number of tokens in an area; `rise` the height
 * between a ruler's two ends in cells (`riseBetweenEnds`), which an area never counts.
 */
export function measureLabelText(measurement: Measurement, grid: GridGeometry, settings: MeasurementSettings, tokens = 0, rise = 0): string {
  const { shape, points } = measurement;
  if (shape === 'ruler') return formatDistance(pathLengthInCells(grid, points, settings.diagonalRule, rise), settings);
  const [origin, end] = points;
  const length = origin && end ? lengthInCells(Math.hypot(end.x - origin.x, end.y - origin.y), grid.size) : 0;
  let size: string;
  if (shape === 'square') size = lengthByWidth(length, length, settings);
  else if (shape === 'line') size = lengthByWidth(length, lengthInCells(measurement.width ?? grid.size, grid.size), settings);
  else size = formatDistance(length, settings);
  return tokens > 0 ? `${size} · ${tokens}` : size;
}

/** An aura's label: how far it reaches from its token's space, and the number of `tokens` in it. */
export function auraLabelText(cells: number, settings: MeasurementSettings, tokens = 0): string {
  const size = formatDistance(cells, settings);
  return tokens > 0 ? `${size} · ${tokens}` : size;
}
