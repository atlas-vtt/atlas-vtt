import { movedWithMap, NO_STRETCH, sameStretch, worldToImage } from '../../grid/mapStretch';
import type { MapStretch } from '../../grid/mapStretch';
import type { AlignmentPoint, AlignmentResult, MapBounds } from '../gridAlignmentMath';
import { IDENTITY } from './scanFrame';
import type { Affine, ScanLattice } from './scanFrame';

interface Size {
  width: number;
  height: number;
}

/** A grid whose type is known. */
type TypedGrid = AlignmentResult & { gridType: NonNullable<AlignmentResult['gridType']> };

/** The rows of a map of the plane that is affine, read off where it takes three points. */
export function affineOf(map: (point: AlignmentPoint) => AlignmentPoint): Affine {
  const origin = map({ x: 0, y: 0 });
  const right = map({ x: 1, y: 0 });
  const down = map({ x: 0, y: 1 });
  return [right.x - origin.x, down.x - origin.x, origin.x, right.y - origin.y, down.y - origin.y, origin.y];
}

/**
 * A grid a detection found, to draw over the map as it is drawn now. The grid is given in the
 * world its own `mapStretch` makes, which is this one only once the map is drawn that way.
 */
export function latticeOnMap(grid: TypedGrid, imageSize: Size, drawn: MapStretch): ScanLattice {
  const own = grid.mapStretch ?? NO_STRETCH;
  return {
    gridType: grid.gridType,
    cellSize: grid.cellSize,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    toLattice: sameStretch(own, drawn) ? IDENTITY : affineOf(movedWithMap(imageSize, drawn, own)),
  };
}

/** Takes the world of a map drawn with `drawn` to its image, as shares of the image's sides. */
export function worldToImageShare(imageSize: Size, drawn: MapStretch): Affine {
  return affineOf((point) => {
    const pixel = worldToImage(point, imageSize, drawn);
    return { x: pixel.x / imageSize.width, y: pixel.y / imageSize.height };
  });
}

/** The distance from `origin` to the corner of `rect` farthest from it. */
export function reachOf(origin: AlignmentPoint, rect: MapBounds): number {
  const farthestX = Math.max(origin.x - rect.x, rect.x + rect.width - origin.x);
  const farthestY = Math.max(origin.y - rect.y, rect.y + rect.height - origin.y);
  return Math.hypot(farthestX, farthestY);
}
