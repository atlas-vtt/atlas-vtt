/**
 * Map features (`MapFeature`): named areas of a battle map the GM reads on hover, some of them
 * difficult terrain or cover. The one place that reads them: a map file is kept as it came, and
 * what cannot be read here is passed over and saved back.
 */

import type { FeatureCover, FeatureTerrain, MapFeature } from '../types/mapFeatureTypes';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';
import { hasArea } from '../vision/polygonArea';

/** The corners a feature may have. */
export const MAX_FEATURE_CORNERS = 64;
/**
 * The features one level may have: a generated dungeon names every piece of furniture and terrain,
 * a few hundred on a large floor; a damaged file must not hold more for the index and the hover.
 */
export const MAX_MAP_FEATURES = 1024;
/** The longest name a feature keeps; a longer one is cut there. */
export const MAX_FEATURE_NAME = 120;

export const FEATURE_COVERS: readonly FeatureCover[] = ['half', 'three-quarters', 'total'];

const lists = new WeakMap<object, MapFeature[]>();
const NONE: MapFeature[] = [];

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/** What a file's `terrain` says: `difficult` only where it is `true`, a cover only of the three; none where it says nothing. */
export function readTerrain(value: unknown): FeatureTerrain | undefined {
  if (!isRecord(value)) return undefined;
  const cover = FEATURE_COVERS.find((kind) => kind === value.cover);
  const terrain: FeatureTerrain = { ...(value.difficult === true && { difficult: true }), ...(cover && { cover }) };
  return terrain.difficult || terrain.cover ? terrain : undefined;
}

/** A feature as it is read: `id` is its place in the record; a name that is no text reads as none. */
function readFeature(id: string, value: unknown): MapFeature | null {
  if (!isRecord(value)) return null;
  const { polygon, level, name } = value;
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > MAX_FEATURE_CORNERS || !polygon.every(isPoint) || !hasArea(polygon)) return null;
  const terrain = readTerrain(value.terrain);
  return {
    id,
    kind: 'map-feature',
    polygon,
    name: typeof name === 'string' ? name.trim().slice(0, MAX_FEATURE_NAME) : '',
    ...(typeof level === 'string' && { level }),
    ...(terrain && { terrain }),
  };
}

/**
 * The features of a record in the order they were added, a later one lying over an earlier one:
 * the first `MAX_MAP_FEATURES` that are areas. Hand it the features of one level (`levelObjects`).
 * The record itself stays as the file has it; the same list for the same record.
 */
export function mapFeatureList(features: Record<string, MapFeature> | undefined): MapFeature[] {
  if (!isRecord(features)) return NONE;
  let list = lists.get(features);
  if (!list) {
    list = [];
    for (const [id, value] of Object.entries(features)) {
      const feature = readFeature(id, value);
      if (feature) list.push(feature);
      if (list.length === MAX_MAP_FEATURES) break;
    }
    lists.set(features, list);
  }
  return list;
}

/** The features a map file holds, as the store keeps them: the file's record untouched, or none where it holds something else. */
export function mapFeaturesFromFile(value: unknown): Record<string, MapFeature> | undefined {
  return isRecord(value) ? (value as Record<string, MapFeature>) : undefined;
}

/** `terrain` with `changes` laid over it, a field given as undefined removed; undefined once nothing is left. */
export function terrainWith(terrain: FeatureTerrain | undefined, changes: FeatureTerrain): FeatureTerrain | undefined {
  const next: FeatureTerrain = { ...terrain, ...changes };
  if (!next.difficult) delete next.difficult;
  if (!next.cover) delete next.cover;
  return next.difficult || next.cover ? next : undefined;
}
