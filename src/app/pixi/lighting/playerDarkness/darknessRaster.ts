/**
 * Where the players' window of a lit scene shows the map, on a coarse cell grid, by the
 * window's own rules, sampled at the centres of cells of at least `DARKNESS_MIN_CELL`: a cell
 * shows only when every sample within it does, so a coarse cell hides more, never shows more
 * (`DARKNESS_SAMPLES_PER_SIDE`). The map shows
 * - where a precise sense of a vision token that shows the map perceives it, in the light
 *   there (`perceivingRegion`, `lightLevelAt`); with no vision token, or token vision off,
 *   wherever normal sight sees by the light (`perceive` of `SEES_ALL`);
 * - within the footprint of a token seen where the map around it is dark (`seenSpots`);
 * - where the explored memory the window shows holds it, while some token has vision.
 * Everything else is dark for players. Before the window's sight belongs to the scene
 * (`PlayerLighting.ready`), all of it is.
 *
 * The rules are applied cell by cell but their areas are scanned, not looked up per cell: the
 * light level of every cell first (the ambient light by zone, then each light's polygon,
 * `lightLevelAt` itself inside magical darkness), then each sense's polygon.
 */
import { NORMAL_SIGHT } from '../../../gameSystems/senses/generic';
import { perceivedLevel, showsMap } from '../../../gameSystems/senseRules';
import type { PlayerLighting } from '../playerLightingLayers';
import type { LightLevel } from '../../../types/senseTypes';
import { ambientLevel, lightLevelAt } from '../../../vision/lightLevels';
import type { AmbientLight, LightReach } from '../../../vision/sight';
import type { Polygon } from '../../../vision/visibility';
import type { MapSize } from '../../../services/viewMapSize';
import { insideSpans } from './spans';

/** The smallest darkness cell, in world pixels. */
export const DARKNESS_MIN_CELL = 8;
/** By default the map's long side holds at most this many cells; the cells double in size until it does. */
export const MAX_DARKNESS_CELLS_PER_SIDE = 384;
/** The window's rules are sampled on cells this many to the map's long side at most (8 px cells up to 4096 px maps). */
export const DARKNESS_SAMPLES_PER_SIDE = 512;
/** A texel of the explored memory counts as explored from this coverage (0–255) on: more than half. */
export const EXPLORED_COVERAGE = 128;

/** The scene's explored memory as saved (`exploredMask`), one coverage byte per texel, over the map. */
export interface ExploredImage {
  width: number;
  height: number;
  coverage: Uint8Array;
}

/** Dark cells (1) over the map, `cellSize` world pixels square from the map's top-left corner. */
export interface DarknessRaster {
  cols: number;
  rows: number;
  cellSize: number;
  map: MapSize;
  dark: Uint8Array;
}

/** A power of two times `DARKNESS_MIN_CELL`, so a fog on cells of that size holds the darkness exactly. */
export function darknessCellSize(map: MapSize, maxCellsPerSide = MAX_DARKNESS_CELLS_PER_SIDE): number {
  let size = DARKNESS_MIN_CELL;
  while (Math.max(map.width, map.height) / size > maxCellsPerSide) size *= 2;
  return size;
}

export function darknessRaster(
  lighting: PlayerLighting,
  explored: ExploredImage | null,
  map: MapSize,
  maxCellsPerSide = MAX_DARKNESS_CELLS_PER_SIDE,
): DarknessRaster {
  const cellSize = darknessCellSize(map, maxCellsPerSide);
  const samples = sampledRaster(lighting, explored, map, Math.min(cellSize, darknessCellSize(map, DARKNESS_SAMPLES_PER_SIDE)));
  return samples.cellSize === cellSize ? samples : coarsened(samples, cellSize);
}

function emptyRaster(map: MapSize, cellSize: number): DarknessRaster {
  const cols = Math.max(1, Math.ceil(map.width / cellSize));
  const rows = Math.max(1, Math.ceil(map.height / cellSize));
  return { cols, rows, cellSize, map, dark: new Uint8Array(cols * rows).fill(1) };
}

/** Each cell shows when its centre does. */
function sampledRaster(lighting: PlayerLighting, explored: ExploredImage | null, map: MapSize, cellSize: number): DarknessRaster {
  const grid = emptyRaster(map, cellSize);
  if (lighting.ready) showMap(lighting, explored, grid);
  return grid;
}

/** Cells `cellSize` square (a power of two times the samples' size): dark where any sample within is dark. */
function coarsened(samples: DarknessRaster, cellSize: number): DarknessRaster {
  const grid = emptyRaster(samples.map, cellSize);
  grid.dark.fill(0);
  const per = cellSize / samples.cellSize;
  for (let row = 0; row < samples.rows; row++) {
    for (let col = 0; col < samples.cols; col++) {
      if (samples.dark[row * samples.cols + col]) grid.dark[Math.floor(row / per) * grid.cols + Math.floor(col / per)] = 1;
    }
  }
  return grid;
}

/** Light levels by index, darkest first: brighter ones replace darker ones (`LEVELS[a] < LEVELS[b]`). */
const LEVELS: readonly LightLevel[] = ['dark', 'dim', 'bright'];
const MAGICAL_DARK = 3;
const levelOf = (code: number): LightLevel => (code === MAGICAL_DARK ? 'magical-dark' : LEVELS[code]!);
const codeOf = (level: LightLevel): number => (level === 'magical-dark' ? MAGICAL_DARK : LEVELS.indexOf(level));

function showMap(lighting: PlayerLighting, explored: ExploredImage | null, grid: DarknessRaster): void {
  const { sight, ambient, reaches, spots } = lighting;
  const levels = lightLevels(grid, ambient, reaches);
  const show = (index: number): void => { grid.dark[index] = 0; };
  if (sight.all) {
    for (let index = 0; index < levels.length; index++) if (perceivedLevel(NORMAL_SIGHT, levelOf(levels[index]!)) !== null) show(index);
    return;
  }
  // `perceivingRegion`: a point is seen when a precise sense perceives it, within its radius and polygon, in the light there.
  for (const region of sight.regions) {
    const { sense, polygon, origin, radius } = region;
    if (!polygon || !showsMap(sense) || !sense.precise) continue;
    forCentresInside(grid, polygon, (index, x, y) => {
      if (Math.hypot(x - origin.x, y - origin.y) <= radius && perceivedLevel(sense, levelOf(levels[index]!)) !== null) show(index);
    });
  }
  for (const spot of spots) forCentresInside(grid, spot.polygon, show);
  if (lighting.showsExplored && explored) {
    forEveryCentre(grid, (index, x, y) => {
      if (isExplored(explored, grid.map, x, y)) show(index);
    });
  }
}

/** The light level of every cell centre, as `lightLevelAt` gives it. */
function lightLevels(grid: DarknessRaster, ambient: AmbientLight, reaches: readonly LightReach[]): Uint8Array {
  const levels = new Uint8Array(grid.cols * grid.rows).fill(codeOf(ambientLevel(ambient)));
  // The topmost zone holding a centre decides its ambient light: later zones are scanned over earlier ones.
  for (const zone of ambient.zones ?? []) {
    const code = codeOf(ambientLevel({ ...ambient, ambient: zone.ambient }));
    forCentresInside(grid, zone.polygon, (index) => { levels[index] = code; });
  }
  // Without darkness, a centre takes the brightest of its ambient light and every light reaching it.
  for (const reach of reaches) {
    if (reach.darkness) continue;
    forCentresInside(grid, reach.polygon, (index, x, y) => {
      const distance = Math.hypot(x - reach.origin.x, y - reach.origin.y);
      if (distance > reach.dim) return;
      levels[index] = Math.max(levels[index]!, codeOf(distance <= reach.bright ? 'bright' : 'dim'));
    });
  }
  // Inside magical darkness priorities decide: the rule itself, centre by centre.
  for (const reach of reaches) {
    if (!reach.darkness) continue;
    forCentresInside(grid, reach.polygon, (index, x, y) => {
      if (Math.hypot(x - reach.origin.x, y - reach.origin.y) <= reach.dim) levels[index] = codeOf(lightLevelAt({ x, y }, ambient, reaches));
    });
  }
  return levels;
}

type CellVisit = (index: number, x: number, y: number) => void;

function forEveryCentre({ cols, rows, cellSize }: DarknessRaster, visit: CellVisit): void {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) visit(row * cols + col, (col + 0.5) * cellSize, (row + 0.5) * cellSize);
  }
}

/** The cells whose centre lies inside `polygon` (nonzero winding, `insideSpans`). */
function forCentresInside({ cols, rows, cellSize }: DarknessRaster, polygon: Polygon, visit: CellVisit): void {
  if (polygon.length < 3) return;
  let top = Infinity;
  let bottom = -Infinity;
  for (const point of polygon) {
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  const lastRow = Math.min(rows - 1, Math.floor(bottom / cellSize));
  for (let row = Math.max(0, Math.floor(top / cellSize)); row <= lastRow; row++) {
    const y = (row + 0.5) * cellSize;
    for (const [from, to] of insideSpans(polygon, y)) {
      const last = Math.min(cols - 1, Math.floor(to / cellSize - 0.5));
      for (let col = Math.max(0, Math.ceil(from / cellSize - 0.5)); col <= last; col++) visit(row * cols + col, (col + 0.5) * cellSize, y);
    }
  }
}

function isExplored(explored: ExploredImage, map: MapSize, x: number, y: number): boolean {
  if (!(map.width > 0) || !(map.height > 0)) return false;
  const tx = Math.min(explored.width - 1, Math.floor((x / map.width) * explored.width));
  const ty = Math.min(explored.height - 1, Math.floor((y / map.height) * explored.height));
  return tx >= 0 && ty >= 0 && (explored.coverage[ty * explored.width + tx] ?? 0) >= EXPLORED_COVERAGE;
}
