/** What a drag of a kept measurement's handle changes of it: pure, so the pointer code only follows the pointer. */

import type { GridGeometry } from '../../grid/gridDistance';
import { auraCellsDragged, auraDirection, auraOfCells, auraPoints, type PlacedAura } from '../../measure/auraArea';
import { isAura } from '../../measure/keptMeasures';
import { areaResizedBy, measureMovedBy } from '../../measure/measureMove';
import type { KeptMeasure, MeasureChanges } from '../../measure/measureTypes';
import type { TokenGrid } from '../../measure/tokenDistance';
import type { Point } from '../../types/visionTypes';
import type { MeasureHandlePart } from './measureHandle';

/** What the far handle of an aura is dragged by: where the aura lies, and what its reach is counted in. */
export interface AuraDragSetting {
  readonly placed: PlacedAura;
  /** The grid its token stands on, with its Snap setting. */
  readonly grid: TokenGrid;
  /** Game units one cell spans. */
  readonly unitDistance: number;
}

export interface HandleDrag {
  /** The measurement's fields once the pointer has moved `by` (world pixels) since it grabbed the handle; `free` places freely. */
  changes(by: Point, free: boolean): MeasureChanges;
  /** The same fields as they were: what a cancelled drag puts back. */
  readonly restore: MeasureChanges;
}

const samePoints = (a: readonly Point[] | undefined, b: readonly Point[] | undefined): boolean =>
  a === b || (!!a && !!b && a.length === b.length && a.every((point, index) => point.x === b[index]?.x && point.y === b[index]?.y));

/** Whether two sets of changes a drag made say the same: snapped, most moves of the pointer change nothing. */
export function sameDragChanges(a: MeasureChanges, b: MeasureChanges): boolean {
  return a.aura === b.aura && samePoints(a.points, b.points);
}

/**
 * The drag of `part` of `measure`. The handle at its origin moves the whole measurement, its first
 * point snapping to `snapGrid` as a new one's start would; the handle at an area's far end resizes
 * and turns it, its size snapping as a new area's would. An aura lies where its token stands: its
 * far handle changes how far it reaches (`aura` says by what), and its badge moves nothing, so
 * there is no drag of it (null).
 */
export function handleDrag(measure: KeptMeasure, part: MeasureHandlePart, snapGrid: () => GridGeometry | null, aura: AuraDragSetting | null): HandleDrag | null {
  const origin = measure.points.map(({ x, y }) => ({ x, y }));
  if (isAura(measure)) {
    if (part === 'origin' || !aura) return null;
    const { placed, grid, unitDistance } = aura;
    const direction = auraDirection(measure);
    return {
      changes: (by, free) => {
        const cells = auraCellsDragged(placed.cells, by, direction, grid, free);
        return { aura: auraOfCells(cells, unitDistance), points: auraPoints(placed.token, cells, grid, direction) };
      },
      restore: { aura: measure.aura, points: origin },
    };
  }
  return {
    changes: (by, free) => ({ points: part === 'end' ? areaResizedBy(origin, by, snapGrid(), free) : measureMovedBy(measure.shape, origin, by, snapGrid(), free) }),
    restore: { points: origin },
  };
}
