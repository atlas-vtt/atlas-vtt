import { isSide, parseAsset, type AssetRef } from './asset.ts';
import { MAX_MAP_TITLE, type MapPlace } from './bookMap.ts';
import { bookLine } from './bookText.ts';
import { pinIconField, pinLabelField } from './mapLayers.ts';
import { isRecord } from './shape.ts';

/** The most maps the world map leads into, however deep, and the most entrances and signs one map shows. */
export const MAX_BOOK_MAPS = 32;
export const MAX_MAP_ENTRANCES = 24;
export const MAX_MAP_SIGNS = 60;

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

/**
 * A pin the GM made readable on a map of the world map, as a table's readable pin is shared: where it
 * stands (shares of its map's sides), the face of the GM's pin, and the log entry that tells who found
 * it (null until someone did). `id` is an alias, never the pin's id in the GM's scene, and nothing of
 * its note comes with it: a player opens it with `sign-found`, and its note is read in that entry. An
 * older GM sends none.
 */
export interface MapSign extends MapPlace {
  readonly id: string;
  readonly icon?: string;
  readonly label?: string;
  readonly found: string | null;
}

/** A player opens a sign of the world map (`MapSign.id`): the first time, that finds it, as `pin-found` does at the table. */
export interface PlayerSignFound {
  readonly t: 'sign-found';
  readonly sign: string;
}

/** A map the world map leads into through the GM's pins: an image by hash, its size in pixels, its name, its own entrances and its signs (none from an older GM). */
export interface BookNestedMap {
  readonly id: string;
  readonly title: string;
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
  readonly entrances: readonly MapEntrance[];
  readonly signs?: readonly MapSign[];
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

/** A sign's id and the log entry it names: 96 random bits in hex. */
const isSignId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);

export function parseMapSign(value: unknown): MapSign | null {
  if (!isRecord(value) || !isSignId(value.id) || !isShare(value.x) || !isShare(value.y) || (value.found !== null && !isSignId(value.found))) return null;
  return { id: value.id, x: value.x, y: value.y, ...pinIconField(value.icon), ...pinLabelField(value.label), found: value.found };
}

/** A map's signs: none named is none, one that cannot be read is left out, an id twice keeps the first; null for a list that is no list or too long. */
export function parseMapSigns(value: unknown): MapSign[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MAP_SIGNS) return null;
  const signs = new Map<string, MapSign>();
  for (const entry of value) {
    const sign = parseMapSign(entry);
    if (sign !== null && !signs.has(sign.id)) signs.set(sign.id, sign);
  }
  return [...signs.values()];
}

/** A player's `sign-found` message, or null for anything malformed. */
export const parseSignFound = (value: Record<string, unknown>): PlayerSignFound | null => (isSignId(value.sign) ? { t: 'sign-found', sign: value.sign } : null);

export function parseNestedMap(value: unknown): BookNestedMap | null {
  if (!isRecord(value) || !isMapId(value.id) || !isSide(value.width) || !isSide(value.height)) return null;
  const image = parseAsset(value.image);
  const title = bookLine(value.title, MAX_MAP_TITLE);
  const entrances = parseEntrances(value.entrances);
  const signs = parseMapSigns(value.signs);
  if (image === null || title === null || entrances === null || signs === null) return null;
  return { id: value.id, title, image, width: value.width, height: value.height, entrances, ...(signs.length > 0 && { signs }) };
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
