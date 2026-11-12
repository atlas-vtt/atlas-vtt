/** A measurement's distances as its labels say them: the whole of it, and each leg of a ruler with corners. */

import { pathLengthInCells, type GridGeometry } from '../../grid/gridDistance';
import { formatDistance, type MeasurementSettings } from '../../grid/measurementFormat';
import { measureLabelText } from '../../measure/measureLabelText';
import type { Measurement } from '../../measure/measureTypes';
import { riseBetweenEnds, type HeightAt } from '../../measure/tokenHeight';
import type { Point } from '../../types/visionTypes';

/**
 * What `measurement` measures, as its label and its popover say it (`measureLabelText`): a ruler's
 * length along its path, diagonals counted over the whole of it, and with `heightAt` the height
 * between the tokens under its two ends counted once with it (its legs keep their length on the
 * floor); an area's size, with the number of `tokens` in it.
 */
export function measureDistance(grid: GridGeometry, measurement: Measurement, settings: MeasurementSettings, heightAt?: HeightAt | null, tokens = 0): string {
  const rise = measurement.shape === 'ruler' && heightAt ? riseBetweenEnds(measurement.points, heightAt, settings) : 0;
  return measureLabelText(measurement, grid, settings, tokens, rise);
}

/**
 * What each leg of the path adds to its length, in cells: the legs add up to the whole, also where
 * the rule prices a diagonal by how many came before it.
 */
export function legLengthsInCells(grid: GridGeometry, points: readonly Point[], settings: MeasurementSettings): number[] {
  const lengths: number[] = [];
  let before = 0;
  for (let end = 2; end <= points.length; end++) {
    const upTo = pathLengthInCells(grid, points.slice(0, end), settings.diagonalRule);
    lengths.push(upTo - before);
    before = upTo;
  }
  return lengths;
}

/** The legs of a path with corners, each with its length as its label says it; none for a path of one leg. */
export function legDistances(grid: GridGeometry, points: readonly Point[], settings: MeasurementSettings): { readonly from: Point; readonly to: Point; readonly distance: string }[] {
  if (points.length < 3) return [];
  return legLengthsInCells(grid, points, settings).map((cells, index) => ({ from: points[index]!, to: points[index + 1]!, distance: formatDistance(cells, settings) }));
}
