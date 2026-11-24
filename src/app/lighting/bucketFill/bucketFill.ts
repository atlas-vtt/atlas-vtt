import { simplifyStroke } from '../../pixi/lighting/wallEdits';
import type { Point } from '../../types/visionTypes';
import { blurredLab, calmestNear, edgeStrength, floodCost, type Rgba } from './bucketCost';
import { closedOff, squaredDistanceTo } from './closeGaps';
import { maskOutline } from './maskOutline';
import { straightened } from './straightened';
import { watershed } from './watershed';

/**
 * A bucket poured on a painted map: the floor around the drop, up to the walls the art draws, as
 * an outline. The drop and everything beyond the bucket's radius flood the map together
 * (`watershed`), so they meet on the strongest edge between them: a wall where one encloses the
 * drop, else a fence on the radius. The fence is set from the map's own contrast, and the
 * sensitivity moves it: a sensitive bucket stops at faint edges and fills less, a dull one spills
 * through weak spots in walls. A bucket dragged along a path pours from every point of it at
 * once, its radius measured from the nearest. Tuned on painted maps at `TUNED_CELL` pixels a grid cell.
 */

/** Sensitivity 1 (spills) to 10 (stops at faint edges); 5 is the map's own contrast as it is. */
export const BUCKET_SENSITIVITY = { min: 1, max: 10, default: 5 } as const;
/** The bucket's radius in map pixels, as the brush's size. */
export const BUCKET_RADIUS = { min: 50, max: 1500, step: 10, default: 320 } as const;
/** The widest gap the bucket closes against a spill (`closedOff`), as a share of its radius. */
export const BUCKET_GAP_SHARE = 1 / 6;
/** Pixels a grid cell takes in the image the bucket is poured on: enough for walls, little enough to be quick. */
export const TUNED_CELL = 24;

/** Of the edges within the radius, the share weaker than the fence at sensitivity 5. */
const FENCE_PERCENTILE = 0.55;
/** The lowest fence: a map with almost no texture would otherwise have none. */
const FENCE_FLOOR = 2;

export interface BucketPour {
  image: Rgba;
  /** Where the bucket is poured (one point, or the points of a drag), in the image's pixels. */
  seeds: readonly Point[];
  /** How far it reaches, and a grid cell, in the image's pixels. */
  radius: number;
  cell: number;
  /** `BUCKET_SENSITIVITY`. */
  sensitivity: number;
  /** The widest gap to close against a spill, in grid cells. */
  gap: number;
}

/** The fence's height: `FENCE_PERCENTILE` of the edges within the radius, moved by the sensitivity. */
function fenceLevel(grad: Float32Array, inside: (i: number) => boolean, sensitivity: number): number {
  let count = 0;
  const edges = new Float32Array(grad.length);
  for (let i = 0; i < grad.length; i++) if (inside(i)) edges[count++] = grad[i]!;
  const within = edges.subarray(0, count).sort();
  const level = Math.max(FENCE_FLOOR, within[Math.floor(count * FENCE_PERCENTILE)] ?? FENCE_FLOOR);
  return level * 2 ** ((BUCKET_SENSITIVITY.default - sensitivity) / 2);
}

/** The outline of the floor the bucket fills, in the image's pixels; null where it fills nothing. */
export function pourBucket({ image, seeds, radius, cell, sensitivity, gap }: BucketPour): Point[] | null {
  const { width, height } = image;
  if (width < 8 || height < 8 || !(cell > 0) || !(radius > 0)) return null;
  const scale = cell / TUNED_CELL;
  const drops = seeds.map((seed) => ({ x: Math.round(seed.x), y: Math.round(seed.y) })).filter((drop) => drop.x >= 0 && drop.y >= 0 && drop.x < width && drop.y < height);
  if (drops.length === 0) return null;
  // Costs count within 2 px past the radius of where the bucket pours from (`calmestNear` moves that up to 0.6 cell from the drop), and the floor's colour is read up to 1.3 cells from it.
  const atDrop = new Uint8Array(width * height);
  for (const drop of drops) atDrop[drop.y * width + drop.x] = 1;
  const toSeed = squaredDistanceTo((i) => atDrop[i] === 1, width, height);
  const counts = Math.max(radius + 2 + 0.6 * cell, 1.4 * cell) + 3;
  const lab = blurredLab(image, 1.5 * scale, { toSeed, limit: counts + 8 });
  const grad = edgeStrength(lab, width, height, { toSeed, limit: counts });
  const from = drops.map((drop) => calmestNear(grad, width, height, drop, Math.round(0.4 * cell)));
  const cost = floodCost(lab, grad, width, height, from, Math.max(2, Math.round(0.5 * cell)));
  const at = new Uint8Array(width * height);
  for (const drop of from) at[drop.y * width + drop.x] = 1;
  const toDrop = squaredDistanceTo((i) => at[i] === 1, width, height);
  const distance = (i: number): number => Math.sqrt(toDrop[i]!);

  const fence = fenceLevel(grad, (i) => distance(i) <= radius, sensitivity);
  const labels = new Uint8Array(width * height);
  const pour = Math.max(2, cell / 6);
  for (let i = 0; i < labels.length; i++) {
    const d = distance(i);
    if (Math.abs(d - radius) <= 1) cost[i] = Math.max(cost[i]!, fence);
    else if (d > radius + 1) labels[i] = 2;
    else if (d <= pour) labels[i] = 1;
  }
  watershed(cost, labels, width, height);

  const filled = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) filled[i] = labels[i] === 1 ? 1 : 0;
  const floor = closedOff(filled, { width, height, from, toDrop, radius, maxGap: gap * cell, leastArea: cell * cell });
  const outline = maskOutline((x, y) => floor[y * width + x] === 1, width, height);
  if (!outline || outline.length < 3) return null;
  const simpler = straightened(simplifyStroke([...outline, outline[0]!], 0.06 * cell).slice(0, -1), cell);
  return simpler.length >= 3 ? simpler : null;
}
