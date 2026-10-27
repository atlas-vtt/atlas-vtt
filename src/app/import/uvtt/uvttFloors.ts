import { t } from '../../i18n';
import { UVTT_LIMITS, type UvttMap, type UvttPoint } from './uvttTypes';

/** What deciding whether files can be the floors of one scene reads of each. */
export interface FloorCandidate {
  fileName: string;
  bytes: number;
  map: Pick<UvttMap, 'origin' | 'polylines' | 'portals' | 'lights'>;
  /** Pixels of the file's image a cell spans. */
  cellSize: number;
}

/**
 * Pixels by which the cells of two floors may differ and still be one grid: an exporter rounds an
 * image's sides to whole pixels, and a floor exported at another resolution is another map.
 */
export const FLOOR_CELL_TOLERANCE = 2;

const megabytes = (bytes: number): number => Math.round(bytes / 1024 / 1024);

function segmentsOf(map: FloorCandidate['map']): number {
  return map.polylines.reduce((sum, line) => sum + Math.max(0, line.length - 1), 0) + map.portals.length;
}

/** Why files of these sizes cannot be the floors of one scene, in a sentence; known before any is read. */
export function floorFilesProblem(files: readonly Pick<FloorCandidate, 'bytes'>[]): string | null {
  if (files.length > UVTT_LIMITS.floors) return t('uvttFloors.tooMany', { count: UVTT_LIMITS.floors });
  if (files.reduce((sum, file) => sum + file.bytes, 0) > UVTT_LIMITS.floorsBytes) return t('uvttFloors.tooLarge', { size: megabytes(UVTT_LIMITS.floorsBytes) });
  return null;
}

/**
 * Why `files` cannot be the floors of one scene, in a sentence; null where they can. They need a
 * grid in common (cells of the same size in pixels), and together they stay within what one file
 * may hold (`UVTT_LIMITS`), since one scene holds all of them. Where they differ in size or origin
 * they still can: each floor is placed by its origin.
 */
export function floorsProblem(files: readonly FloorCandidate[]): string | null {
  if (files.length < 2) return null;
  const sizes = floorFilesProblem(files);
  if (sizes) return sizes;
  const bySize = [...files].sort((a, b) => a.cellSize - b.cellSize);
  const [finest, coarsest] = [bySize[0]!, bySize[bySize.length - 1]!];
  if (coarsest.cellSize - finest.cellSize > FLOOR_CELL_TOLERANCE) {
    return t('uvttFloors.otherGrid', { file: coarsest.fileName, size: Math.round(coarsest.cellSize), other: finest.fileName, otherSize: Math.round(finest.cellSize) });
  }
  if (files.reduce((sum, file) => sum + segmentsOf(file.map), 0) > UVTT_LIMITS.wallSegments) return t('uvttFloors.tooManyWalls', { count: UVTT_LIMITS.wallSegments });
  if (files.reduce((sum, file) => sum + file.map.lights.length, 0) > UVTT_LIMITS.lights) return t('uvttFloors.tooManyLights', { count: UVTT_LIMITS.lights });
  return null;
}

/** Where floors lie in their scene. */
export interface FloorPlacement {
  /** The cell of the files' coordinates at the scene's top-left corner: the least origin on each axis. */
  origin: UvttPoint;
  /** For each floor, the scene cell its image's top-left corner lies at; never negative. */
  at: UvttPoint[];
}

/**
 * Places floors by their origins, as the files count their cells in one space: a floor whose image
 * begins further in (a tower smaller than its ground floor) lies that many cells further in. The
 * scene begins at the least origin, so every floor lies at or after its corner, as a level's
 * alignment requires.
 */
export function floorPlacement(maps: readonly Pick<UvttMap, 'origin'>[]): FloorPlacement {
  const origin = {
    x: Math.min(...maps.map((map) => map.origin.x)),
    y: Math.min(...maps.map((map) => map.origin.y)),
  };
  return { origin, at: maps.map((map) => ({ x: map.origin.x - origin.x, y: map.origin.y - origin.y })) };
}
