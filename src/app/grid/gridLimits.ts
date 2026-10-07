/**
 * What a grid must be for Atlas to draw it in reasonable time. The drawers step across the map one cell at a
 * time, so a size of 0 or less never ends and a tiny size on a large map takes millions of steps. Grids from
 * outside Atlas (an extension's scene or saved map) are checked against these limits before anything is written;
 * the grid system draws no grid at all for one that breaks them.
 */

/** The smallest cell size, in pixels, a grid from outside Atlas may have. */
export const MIN_GRID_CELL_SIZE = 4;
/** The most cells a grid may have along one side of its map. */
export const MAX_GRID_CELLS_PER_SIDE = 2000;
/** The farthest a grid's origin may lie from the map's, in pixels: far beyond any map's side. */
export const MAX_GRID_OFFSET = 100_000;

const GRID_TYPES: readonly unknown[] = ['square', 'hex-horizontal', 'hex-vertical'];
const GRID_LINE_TYPES: readonly unknown[] = ['solid', 'dashed', 'dotted'];
/** Numeric fields of a grid besides `size`; each must be finite when it is set (a saved grid may leave any out). */
const OPTIONAL_NUMBERS = ['offsetX', 'offsetY', 'opacity', 'scale', 'mapScale', 'unitDistance', 'unitDistanceOverride', 'lineWidth', 'cellNumberOpacity'] as const;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Whether a grid of cell `size` can be drawn over a map of `width` × `height` pixels. */
export function isDrawableGrid(size: number, width: number, height: number): boolean {
  return isFiniteNumber(size) && size > 0 && Math.max(width, height) / size <= MAX_GRID_CELLS_PER_SIDE;
}

/**
 * What is wrong with `grid`, a grid from outside Atlas, in English for the extension's author; null when Atlas can
 * draw it. Only what drawing depends on is checked: the size, the numbers that are set, and the known kinds. `mapSize`
 * is the map it overlays, when known; without it the cells per side are not checked here (the grid system still draws
 * no grid past the limit).
 */
export function gridProblem(grid: unknown, mapSize: { width: number; height: number } | null): string | null {
  if (typeof grid !== 'object' || grid === null || Array.isArray(grid)) return 'the grid must be a GridState, or null';
  const fields = grid as Record<string, unknown>;
  if (!isFiniteNumber(fields.size) || fields.size < MIN_GRID_CELL_SIZE) return `"grid.size" must be a number of at least ${MIN_GRID_CELL_SIZE}`;
  const notFinite = OPTIONAL_NUMBERS.find((key) => fields[key] !== undefined && !isFiniteNumber(fields[key]));
  if (notFinite) return `"grid.${notFinite}" must be a finite number when set`;
  const far = (['offsetX', 'offsetY'] as const).find((key) => fields[key] !== undefined && Math.abs(fields[key] as number) > MAX_GRID_OFFSET);
  if (far) return `"grid.${far}" must be from -${MAX_GRID_OFFSET} to ${MAX_GRID_OFFSET}`;
  if (fields.type !== undefined && !GRID_TYPES.includes(fields.type)) return '"grid.type" must be square, hex-horizontal or hex-vertical';
  if (fields.lineType !== undefined && !GRID_LINE_TYPES.includes(fields.lineType)) return '"grid.lineType" must be solid, dashed or dotted';
  if (mapSize && !isDrawableGrid(fields.size, mapSize.width, mapSize.height)) {
    return `"grid.size" gives more than ${MAX_GRID_CELLS_PER_SIDE} cells along a side of the map`;
  }
  return null;
}
