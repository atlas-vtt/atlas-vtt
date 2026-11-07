import type { AlignmentResult } from '../gridAlignmentMath';
import type { PixelRect } from '../mosaicCanvas/pyramid';
import { MAX_ANALYSIS_SIDE, pictureOf, type DetectableMap, type ImageSize, type MapPicture } from './detectGrid';
import { NO_GRID, type DetectionOutcome, type LineEnergy } from './detectionJob';
import type { MapPixels as MapReader } from '../mosaicCanvas/mosaicCanvasView';
import type { DetectOptions, MapPixels } from './SpectralEngineClient';

/**
 * Grid detection on a map too large to see whole: the picture of the whole map fit within
 * `MAX_ANALYSIS_SIDE` shrinks a huge map's cells to a few pixels and averages its lines away, so
 * such a map is searched again in windows read at the pyramid's finest level, where cells and
 * lines are their real size. The windows go where the whole-map pass found the most line
 * evidence, anywhere on the map, spread so that no two look at the same place: a grid drawn on
 * one quarter of the map alone is found there, not estimated from the middle.
 */

/** Pixels of the map a window spans: the detector's own largest picture, so a 70 px cell is seen 58 times across. */
export const WINDOW_SIDE = MAX_ANALYSIS_SIDE;
/** A map the whole-map picture reduces by more than this is searched in windows too. */
export const WINDOW_REDUCTION = 2;
/** Windows looked at most. */
export const MAX_WINDOWS = 6;
/** Blocks with less line evidence than this share of the strongest get no window: blank paper and plain floors. */
const MIN_ENERGY_SHARE = 0.2;

/**
 * Where to look closer: a window of `windowSide` map pixels around each of the blocks with the
 * most line evidence, strongest first, skipping blocks a chosen window already covers; at most
 * `MAX_WINDOWS`, and none for a block below `MIN_ENERGY_SHARE` of the strongest. Windows are
 * clamped to the map, and a map smaller than a window is one window.
 */
export function chooseWindows(energy: LineEnergy, size: ImageSize, windowSide = WINDOW_SIDE): PixelRect[] {
  const side = Math.min(windowSide, Math.max(size.width, size.height));
  const width = Math.min(side, size.width);
  const height = Math.min(side, size.height);
  const blockWidth = size.width / energy.cols;
  const blockHeight = size.height / energy.rows;
  const strongest = Math.max(0, ...energy.data);
  if (strongest <= 0) return [];
  const order = [...energy.data.keys()].sort((a, b) => energy.data[b]! - energy.data[a]!);
  const chosen: PixelRect[] = [];
  for (const at of order) {
    if (chosen.length >= MAX_WINDOWS || energy.data[at]! < strongest * MIN_ENERGY_SHARE) break;
    const centreX = ((at % energy.cols) + 0.5) * blockWidth;
    const centreY = (Math.floor(at / energy.cols) + 0.5) * blockHeight;
    if (chosen.some((rect) => centreX >= rect.x && centreX < rect.x + rect.width && centreY >= rect.y && centreY < rect.y + rect.height)) continue;
    const x = Math.round(Math.min(Math.max(0, centreX - width / 2), size.width - width));
    const y = Math.round(Math.min(Math.max(0, centreY - height / 2), size.height - height));
    chosen.push({ x, y, width, height });
  }
  return chosen;
}

/** `outcome` of a window at `rect` of the map, in the map's own coordinates; null where the window's grid cannot be placed on the map. */
export function windowOutcomeOnMap(outcome: DetectionOutcome, rect: PixelRect): DetectionOutcome | null {
  const { result, hits } = outcome;
  if (!result) return null;
  // A window's stretch or turn describes the window: on the map it would turn about another centre.
  if (result.mapStretch) return null;
  const moved: AlignmentResult = { ...result, offsetX: result.offsetX + rect.x, offsetY: result.offsetY + rect.y };
  const movedHits = hits ? hits.map((value, index) => value + (index % 2 === 0 ? rect.x : rect.y)) : null;
  return { result: moved, hits: movedHits };
}

/** Whether a map is searched in windows: its whole picture reduces it more than `WINDOW_REDUCTION`. */
export function searchedInWindows(size: ImageSize): boolean {
  return Math.max(size.width, size.height) / MAX_ANALYSIS_SIDE > WINDOW_REDUCTION;
}

/** The picture of `rect` of the map at the pyramid's finest level that shows it within `WINDOW_SIDE`. */
function windowPicture(map: MapReader, rect: PixelRect): MapPicture {
  return { size: { width: rect.width, height: rect.height }, bitmap: () => map.window(rect, WINDOW_SIDE) };
}

/**
 * Detects a map's grid, in windows where the map is too large to see whole: the whole-map pass
 * first (its events show the search), then each window the line evidence chooses, and the window
 * whose grid the lines support best wins; the whole-map answer stands where no window finds one.
 * `detect` runs one detection on one picture.
 */
export async function detectGridInWindows(
  map: DetectableMap,
  options: DetectOptions,
  detect: (pixels: MapPixels, options: DetectOptions) => Promise<DetectionOutcome>,
): Promise<DetectionOutcome> {
  const picture = pictureOf(map);
  if (!picture) return NO_GRID;
  if (!searchedInWindows(picture.size)) return detect(picture, options);
  const coarse = await detect(picture, { ...options, lines: true });
  if (!coarse.lines) return coarse;
  const windows = chooseWindows(coarse.lines, picture.size);
  let best: DetectionOutcome | null = null;
  for (const rect of windows) {
    options.signal?.throwIfAborted();
    const found = windowOutcomeOnMap(await detect(windowPicture(map, rect), { ...(options.signal ? { signal: options.signal } : {}) }), rect);
    if (found && (!best || (found.result!.confidence ?? 0) > (best.result!.confidence ?? 0))) best = found;
  }
  return best ?? { result: coarse.result, hits: coarse.hits };
}
