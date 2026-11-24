import { imageToWorld, worldToImage, type MapStretch } from '../../grid/mapStretch';
import { BUCKET_GAP_SHARE, pourBucket, TUNED_CELL } from '../../lighting/bucketFill/bucketFill';
import type { Point } from '../../types/visionTypes';
import type { DetectableMap } from '../mosaicCanvas/mosaicCanvasView';

/** A grid cell in world units where the scene has no grid. */
export const DEFAULT_CELL = 70;

/** What the bucket reads of the map shown: its pixels, its size and how it is drawn (`MosaicCanvas`). */
export interface BucketMap extends DetectableMap {
  readonly mapStretch: MapStretch;
  /** Which picture is shown: a bucket that answers after another was put up is dropped. */
  readonly imageKey: string | null;
}

export interface BucketOptions {
  /** How far the bucket reaches, in world units (`BUCKET_RADIUS`). */
  radius: number;
  /** A grid cell in world units. */
  cell: number;
  sensitivity: number;
}

/** How far apart the points a dragged bucket pours from lie, in grid cells: closer adds nothing but time. */
const DROP_SPACING = 0.5;

/** The points a bucket pours from: `points` (a click, or the path of a drag) without those closer than `DROP_SPACING` to the last one kept. */
export function pourPoints(points: readonly Point[], cell: number): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= DROP_SPACING * cell) kept.push(point);
  }
  return kept;
}

/**
 * The floor a bucket poured at `points` (world: a click, or the path of a drag) fills, as an
 * outline in world units: the part of the map around them is read at about `TUNED_CELL` pixels a
 * cell (`window`: the finest level that shows it so) and handed to `pourBucket`. Null without an
 * image or where the bucket fills nothing.
 */
export async function pouredFloor(map: BucketMap, points: readonly Point[], { radius: reachWorld, cell, sensitivity }: BucketOptions): Promise<Point[] | null> {
  const size = map.imageSize;
  const world = map.worldRect;
  if (!size || !world || !(cell > 0) || points.length === 0) return null;
  const stretch = map.mapStretch;
  // Image pixels to a world unit, the same both ways for a regular grid's stretch.
  const perWorld = Math.sqrt((size.width * size.height) / (world.width * world.height));
  const cellPx = cell * perWorld;
  const radius = reachWorld * perWorld;
  const seeds = pourPoints(points, cell).map((point) => worldToImage(point, size, stretch));
  const reach = radius + cellPx;
  const xs = seeds.map((seed) => seed.x);
  const ys = seeds.map((seed) => seed.y);
  const x = Math.max(0, Math.floor(Math.min(...xs) - reach));
  const y = Math.max(0, Math.floor(Math.min(...ys) - reach));
  const rect = { x, y, width: Math.min(size.width, Math.ceil(Math.max(...xs) + reach)) - x, height: Math.min(size.height, Math.ceil(Math.max(...ys) + reach)) - y };
  if (rect.width <= 0 || rect.height <= 0) return null;

  const bitmap = await map.window(rect, Math.ceil(Math.max(rect.width, rect.height) * TUNED_CELL / cellPx));
  if (!bitmap) return null;
  let image: ImageData;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
  // The window is a cut of one level of the map's pyramid (`rectAtLevel`): halved `factor` times, its corner rounded down to that level's pixels.
  const factor = 2 ** Math.max(0, Math.round(Math.log2(rect.width / image.width)));
  const origin = { x: Math.floor(rect.x / factor) * factor, y: Math.floor(rect.y / factor) * factor };
  // ponytail: runs on the main thread (tens of ms at 8 cells, more for a long drag); move to the image workers if it stutters
  const outline = pourBucket({
    image,
    seeds: seeds.map((seed) => ({ x: (seed.x - origin.x) / factor, y: (seed.y - origin.y) / factor })),
    radius: radius / factor,
    cell: cellPx / factor,
    sensitivity,
    gap: (reachWorld * BUCKET_GAP_SHARE) / cell,
  });
  return outline?.map((p) => imageToWorld({ x: origin.x + p.x * factor, y: origin.y + p.y * factor }, size, stretch)) ?? null;
}
