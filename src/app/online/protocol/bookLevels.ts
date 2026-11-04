import { isSide, parseAsset, type AssetRef } from './asset.ts';
import { MAX_MAP_TITLE, type MapPlace } from './bookMap.ts';
import { bookLine } from './bookText.ts';
import { pinIconField, pinLabelField } from './mapLayers.ts';
import { isRecord } from './shape.ts';

/** The most maps the world map leads into, however deep, and the most entrances one map shows. */
export const MAX_BOOK_MAPS = 32;
export const MAX_MAP_ENTRANCES = 24;

/** A map's id: 96 bits in hex, made by the GM for each map the world map leads into. */
export const isMapId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);

/**
 * A way from one map into another: where it stands (shares of its map's sides), the map it opens and
 * that map's name, and the face of the GM's pin it stands for (its icon as Atlas names it, the label of
 * a numbered or lettered pin), so players see the pin the GM placed.
 */
export interface MapEntrance extends MapPlace {
  readonly to: string;
  readonly title: string;
  readonly icon?: string;
  readonly label?: string;
}

/** A map the world map leads into through the GM's pins: an image by hash, its size in pixels, its name and its own entrances. */
export interface BookNestedMap {
  readonly id: string;
  readonly title: string;
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
  readonly entrances: readonly MapEntrance[];
}

const isShare = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

export function parseMapEntrance(value: unknown): MapEntrance | null {
  if (!isRecord(value) || !isShare(value.x) || !isShare(value.y) || !isMapId(value.to)) return null;
  const title = bookLine(value.title, MAX_MAP_TITLE);
  return title === null ? null : { x: value.x, y: value.y, to: value.to, title, ...pinIconField(value.icon), ...pinLabelField(value.label) };
}

/** A map's entrances: none named is none, one that cannot be read is left out; null for a list that is no list or too long. */
export function parseEntrances(value: unknown): MapEntrance[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MAP_ENTRANCES) return null;
  return value.map(parseMapEntrance).filter((entrance): entrance is MapEntrance => entrance !== null);
}

export function parseNestedMap(value: unknown): BookNestedMap | null {
  if (!isRecord(value) || !isMapId(value.id) || !isSide(value.width) || !isSide(value.height)) return null;
  const image = parseAsset(value.image);
  const title = bookLine(value.title, MAX_MAP_TITLE);
  const entrances = parseEntrances(value.entrances);
  return image === null || title === null || entrances === null ? null : { id: value.id, title, image, width: value.width, height: value.height, entrances };
}

/**
 * The maps a world map leads into, each id once; one that cannot be read is left out, and so is every
 * entrance to a map that is neither among them nor the world map itself (`rootId`). None named is
 * none; null for a list that is no list or longer than a book holds.
 */
export function parseNestedMaps(value: unknown, rootId: string | undefined): BookNestedMap[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_BOOK_MAPS) return null;
  const maps = new Map<string, BookNestedMap>();
  for (const entry of value) {
    const map = parseNestedMap(entry);
    if (map !== null && map.id !== rootId && !maps.has(map.id)) maps.set(map.id, map);
  }
  const known = (id: string): boolean => id === rootId || maps.has(id);
  return [...maps.values()].map((map) => ({ ...map, entrances: map.entrances.filter((entrance) => known(entrance.to)) }));
}

/** The entrances of the world map itself, of those `parseNestedMaps` kept: each leads to one of `maps`. */
export function rootEntrances(value: unknown, maps: readonly BookNestedMap[]): MapEntrance[] | null {
  const entrances = parseEntrances(value);
  return entrances === null ? null : entrances.filter((entrance) => maps.some((map) => map.id === entrance.to));
}
