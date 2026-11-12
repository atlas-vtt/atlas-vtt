/** A measurement's distances as its labels say them: the whole of it, and each leg of a ruler with corners. */

import { pathLengthInCells, type GridGeometry } from '../../grid/gridDistance';
import { formatDistance, type MeasurementSettings } from '../../grid/measurementFormat';
import { riseBetweenEnds, type HeightAt } from '../../measure/tokenHeight';
import type { Point } from '../../types/visionTypes';

/**
 * The length of the path through `points`, as the map's rules write it: diagonals are counted over
 * the whole path. With `heightAt` (a ruler's) the height between the tokens under its two ends is
 * counted with it, once over the whole path; the legs keep their length on the floor.
 */
export function pathDistance(grid: GridGeometry, points: readonly Point[], settings: MeasurementSettings, heightAt?: HeightAt | null): string {
  const rise = heightAt ? riseBetweenEnds(points, heightAt, settings) : 0;
  return formatDistance(pathLengthInCells(grid, points, settings.diagonalRule, rise), settings);
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
