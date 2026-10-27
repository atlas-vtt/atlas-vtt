/**
 * Finding the map feature under a point without looking at every feature: the hover asks on every
 * pointer move and the drag ruler for every cell a path enters. Features are kept in buckets of the
 * world by their bounding boxes; a point reads one bucket and tests only the polygons there.
 */

import type { DifficultCells } from '../grid/movementCost';
import type { MapFeature } from '../types/mapFeatureTypes';
import type { Point } from '../types/visionTypes';
import { pointInPolygon } from '../vision/visibility';

/** The side of a bucket in world pixels: a few cells, so a bucket holds a room's furniture. */
const BUCKET = 256;
/** A feature spanning more buckets than this (a large hazard) is tested for every point instead of being filed everywhere. */
const MAX_BUCKETS_PER_FEATURE = 64;

interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface FeatureIndex {
  readonly features: readonly MapFeature[];
  /** Each feature's bounding box, by its place in `features`. */
  readonly boxes: readonly Box[];
  /** Places in `features` by bucket, each list in drawing order. */
  readonly buckets: ReadonlyMap<number, readonly number[]>;
  /** Places of the features too large to file, in drawing order. */
  readonly large: readonly number[];
}

const indexes = new WeakMap<readonly MapFeature[], FeatureIndex>();

/** A bucket's key: rows of 2^20 buckets are far more than any map (`MAX_COORDINATE`) needs. */
const bucketKey = (bx: number, by: number): number => by * 1_048_576 + bx;

function boxOf(polygon: readonly Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** The index of `features` (a `mapFeatureList`): the same object for the same list. */
export function featureIndex(features: readonly MapFeature[]): FeatureIndex {
  let index = indexes.get(features);
  if (index) return index;
  const boxes = features.map((feature) => boxOf(feature.polygon));
  const buckets = new Map<number, number[]>();
  const large: number[] = [];
  boxes.forEach((box, place) => {
    const x0 = Math.floor(box.minX / BUCKET);
    const x1 = Math.floor(box.maxX / BUCKET);
    const y0 = Math.floor(box.minY / BUCKET);
    const y1 = Math.floor(box.maxY / BUCKET);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_BUCKETS_PER_FEATURE) {
      large.push(place);
      return;
    }
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) {
        const key = bucketKey(bx, by);
        const list = buckets.get(key);
        if (list) list.push(place);
        else buckets.set(key, [place]);
      }
    }
  });
  index = { features, boxes, buckets, large };
  indexes.set(features, index);
  return index;
}

function holds(index: FeatureIndex, place: number, point: Point): boolean {
  const box = index.boxes[place]!;
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY
    && pointInPolygon(point, index.features[place]!.polygon);
}

/** The latest place in `list` (drawing order) above `above` whose feature holds `point` and is accepted, else `above`. */
function topmostIn(index: FeatureIndex, list: readonly number[] | undefined, point: Point, above: number, accepts: ((feature: MapFeature) => boolean) | undefined): number {
  if (!list) return above;
  for (let i = list.length - 1; i >= 0; i--) {
    const place = list[i]!;
    if (place <= above) return above;
    if (holds(index, place, point) && (!accepts || accepts(index.features[place]!))) return place;
  }
  return above;
}

/** The topmost feature (the one added last) whose area holds `point` and that `accepts` takes, or null. */
export function featureAt(index: FeatureIndex, point: Point, accepts?: (feature: MapFeature) => boolean): MapFeature | null {
  const bucket = index.buckets.get(bucketKey(Math.floor(point.x / BUCKET), Math.floor(point.y / BUCKET)));
  const best = topmostIn(index, index.large, point, topmostIn(index, bucket, point, -1, accepts), accepts);
  return best < 0 ? null : index.features[best]!;
}

const isDifficult = (feature: MapFeature): boolean => feature.terrain?.difficult === true;

/** Whether `point` lies in a feature that is difficult terrain. */
export function difficultAt(index: FeatureIndex, point: Point): boolean {
  return featureAt(index, point, isDifficult) !== null;
}

const lookups = new WeakMap<readonly MapFeature[], DifficultCells | null>();

/** Where `features` (a `mapFeatureList`) lie as difficult terrain, for the movement cost; null where none is. The same lookup for the same list. */
export function difficultCells(features: readonly MapFeature[]): DifficultCells | null {
  let lookup = lookups.get(features);
  if (lookup === undefined) {
    const index = featureIndex(features);
    lookup = features.some(isDifficult) ? (point: Point): boolean => difficultAt(index, point) : null;
    lookups.set(features, lookup);
  }
  return lookup;
}
