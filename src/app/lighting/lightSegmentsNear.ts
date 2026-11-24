import type { WallSegment } from '../types/wallTypes';
import { forCellRows, wallGridOf } from '../vision/wallGrid';
import type { SegmentsNear } from './lightPlacement';
import { blocksNothing, concerns, type Seg } from './segments';

/** Per wall array: 1 for each wall a light's tile is traced against (`solidSegments` of `splitBlocking(walls, 'light')`). */
const solidMasks = new WeakMap<readonly WallSegment[], Uint8Array>();

function solidMask(walls: readonly WallSegment[]): Uint8Array {
  let mask = solidMasks.get(walls);
  if (!mask) {
    mask = Uint8Array.from(walls, (wall) => (blocksNothing(wall) || !concerns(wall, 'light') || wall.limited ? 0 : 1));
    solidMasks.set(walls, mask);
  }
  return mask;
}

/**
 * The walls of `walls` a light's placement asks about (`placeLight`), read from the cells of the
 * walls' grid that come near a question: a wall lies in every cell it passes, so a wall nearer than
 * the margin lies in one of them. Undefined where the walls have no grid: then every wall is asked.
 */
export function lightSegmentsNear(walls: readonly WallSegment[]): SegmentsNear | undefined {
  const grid = wallGridOf(walls);
  if (!grid) return undefined;
  const mask = solidMask(walls);
  const { coords, cols, starts, items } = grid;
  return (x0, y0, x1, y1, margin) => {
    const found: Seg[] = [];
    forCellRows(grid, x0, y0, x1, y1, margin, (row, first, last) => {
      for (let c = row * cols + first; c <= row * cols + last; c++) {
        for (let k = starts[c]!; k < starts[c + 1]!; k++) {
          const i = items[k]!;
          if (mask[i]) found.push([coords[i * 4]!, coords[i * 4 + 1]!, coords[i * 4 + 2]!, coords[i * 4 + 3]!]);
        }
      }
    });
    return found;
  };
}
