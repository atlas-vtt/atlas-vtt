/**
 * Fog that clears as the party moves: a scene option, and the rule it goes by. Around a party token
 * that is put down, fog is revealed as far as the option's distance, and no farther than the walls
 * that stop sight let it. What is revealed is written as plain erasing fog, so every reader of fog
 * shows it. Nothing here knows which tokens are the party's or when one is put down
 * (`stores/fogExploreWatch.ts`).
 */

import { unitScaleOf } from '../lighting/lightingUnits';
import { intersectShapes, normalizePolygon, shapeParts, unionShapes } from '../lighting/polygonClip';
import { quantizeCoordinate } from '../lighting/quantizedPoint';
import { Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { FogExplore, FogOperationInput } from '../types/fogTypes';
import type { GridState } from '../types/gridTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { isFiniteNumber, isRecord } from '../utils/guards';
import { computeVisibility, wallsInReach } from '../vision/visibility';
import type { FogCoverage } from './fogCoverage';

/** The distance in cells: what a scene may hold, what the bar offers, and what switching it on starts with. */
export const FOG_EXPLORE_DISTANCE = { min: 1, max: 50, offered: 20, initial: 4 } as const;

/** The corners of the disc revealed where no wall is near: enough to look round at any zoom a map is played at. */
const DISC_CORNERS = 48;

/**
 * A scene's `fogExplore`, which arrives unchecked: unset, and so off, unless its distance is a
 * finite number of cells within the range. A key of a later version stays.
 */
export function readFogExplore(value: unknown): FogExplore | undefined {
  if (!isRecord(value)) return undefined;
  const { distance } = value;
  if (!isFiniteNumber(distance) || distance < FOG_EXPLORE_DISTANCE.min || distance > FOG_EXPLORE_DISTANCE.max) return undefined;
  return { ...value, distance };
}

/** How far the option reveals, in world pixels: its cells on the scene's grid, or cells of the size a scene starts with where it has none. */
export function exploreReach(explore: FogExplore, grid: Pick<GridState, 'size'> | null): number {
  return explore.distance * unitScaleOf(null, grid).cellSize;
}

function disc(centre: Point, radius: number): Point[] {
  return Array.from({ length: DISC_CORNERS }, (_, index) => {
    const angle = (index / DISC_CORNERS) * 2 * Math.PI;
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

/**
 * What is revealed around each of `centres`, the places party tokens were put down at: a disc of
 * `reach` world pixels, or, where walls that stop sight come within it, what can be seen from the
 * place within that distance. `walls` are the level's as sight reads them (`sealedWalls`). A place
 * or a reach that is no finite number reveals nothing.
 */
export function exploredShapes(centres: readonly Point[], reach: number, walls: readonly WallSegment[]): Point[][] {
  if (!Number.isFinite(reach) || reach <= 0) return [];
  return centres.filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)).map((centre) => (
    wallsInReach(walls, centre, reach, 'sight').length > 0 ? computeVisibility(centre, reach, walls, undefined, 'sight') : disc(centre, reach)
  ));
}

/** A shape on the grid fog is told apart on; null where a corner lies outside what that grid holds. */
function quantized(shape: readonly Point[]): QShape | null {
  try {
    return normalizePolygon(shape.flatMap(({ x, y }) => [quantizeCoordinate(x), quantizeCoordinate(y)]));
  } catch {
    return null;
  }
}

const outlineOf = (ring: QPolygon): Point[] => Array.from({ length: ring.length / 2 }, (_, index) => ({ x: ring[index * 2]! / Q_SCALE, y: ring[index * 2 + 1]! / Q_SCALE }));

/**
 * The outlines to reveal of `shapes`: those that meet fog, so a token put down on ground that lies
 * open writes nothing. Shapes that overlap come back as one outline, with corners on the eighths
 * of a pixel fog is told apart on; where joining them would leave a hole, which one outline cannot
 * hold, each comes back by itself.
 */
export function revealsOf(shapes: readonly (readonly Point[])[], coverage: FogCoverage): Point[][] {
  if (coverage.shape.length === 0) return [];
  const meeting = shapes.flatMap((shape) => {
    const q = quantized(shape);
    return q && q.length > 0 && intersectShapes(q, coverage.shape).length > 0 ? [q] : [];
  });
  if (meeting.length === 0) return [];
  const joined = shapeParts(meeting.reduce((all, shape) => unionShapes(all, shape)));
  const parts = joined.every((part) => part.holes.length === 0) ? joined : meeting.flatMap((shape) => shapeParts(shape));
  return parts.map((part) => outlineOf(part.outline));
}

/** The fog operations that reveal `outlines`: one each, erasing. */
export function revealOperations(outlines: readonly Point[][]): FogOperationInput[] {
  return outlines.map((points) => ({ type: 'lasso', isErasing: true, points }));
}
