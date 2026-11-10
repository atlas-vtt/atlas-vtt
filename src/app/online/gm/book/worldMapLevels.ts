import { MAX_BOOK_MAPS, MAX_MAP_ENTRANCES, MAX_MAP_TITLE, type BookNestedMap, type BookWorldMap, type MapEntrance, type MapPlace } from '../../protocol/index.ts';
import { worldToImage } from '../../../grid/mapStretch';
import { clippedLine } from './bookTexts.ts';
import type { MapImage } from './mapImages.ts';
import type { WorldMapLevel, WorldMapTree } from './worldMapGate.ts';

/** What a map is called where its name has nothing to show. */
const UNNAMED_MAP = 'Map';

/** A world map as players are sent it, and the files its images are: the paths are the GM's and never sent. */
export interface WorldMapFile {
  readonly map: BookWorldMap;
  /** The vault path of each image it shows, by hash. */
  readonly paths: ReadonlyMap<string, string>;
  /** Where the GM's pins place quests on the world map, by quest id: the first pin of each that lies on the image. Never sent as such. */
  readonly questPlaces: ReadonlyMap<string, MapPlace>;
}

/** The levels players reach from the world map, nearest first: only through maps that have an image, `MAX_BOOK_MAPS` of them besides the world map. */
function reachable(tree: WorldMapTree, images: ReadonlyMap<string, MapImage | null>): WorldMapLevel[] {
  const byKey = new Map(tree.levels.map((level) => [level.key, level]));
  const hasImage = (level: WorldMapLevel | undefined): level is WorldMapLevel => level !== undefined && (images.get(level.image) ?? null) !== null;
  const root = byKey.get(tree.root);
  if (!hasImage(root)) return [];
  const found = [root];
  const seen = new Set([root.key]);
  for (let index = 0; index < found.length && found.length <= MAX_BOOK_MAPS; index++) {
    for (const entrance of found[index]!.entrances) {
      const next = byKey.get(entrance.to);
      if (seen.has(entrance.to) || !hasImage(next) || found.length > MAX_BOOK_MAPS) continue;
      seen.add(next.key);
      found.push(next);
    }
  }
  return found;
}

/** A point of a level's world as shares of its image, or null where it lies off the image. */
function shareOf(point: { readonly x: number; readonly y: number }, level: WorldMapLevel, image: MapImage): MapPlace | null {
  const size = { width: image.width, height: image.height };
  const pixel = worldToImage(point, size, level.stretch);
  const x = pixel.x / size.width;
  const y = pixel.y / size.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

/** Where a level's pins place quests, as shares of its image, by quest id: each quest at its first pin on the image. */
function questPlacesOf(level: WorldMapLevel, image: MapImage): Map<string, MapPlace> {
  const places = new Map<string, MapPlace>();
  for (const quest of level.quests ?? []) {
    if (places.has(quest.id)) continue;
    const place = shareOf(quest, level, image);
    if (place !== null) places.set(quest.id, place);
  }
  return places;
}

/** A level's entrances as shares of its image, to maps players reach, each once on its place and never to itself. */
function entrancesOf(level: WorldMapLevel, image: MapImage, shown: ReadonlyMap<string, { readonly id: string; readonly title: string }>): MapEntrance[] {
  const entrances: MapEntrance[] = [];
  for (const entrance of level.entrances) {
    const target = shown.get(entrance.to);
    if (target === undefined || entrance.to === level.key) continue;
    const place = shareOf(entrance, level, image);
    if (place === null) continue;
    const { x, y } = place;
    if (entrances.some((known) => known.to === target.id && known.x === x && known.y === y)) continue;
    entrances.push({ x, y, to: target.id, title: target.title, ...(entrance.icon !== undefined && { icon: entrance.icon }), ...(entrance.label !== undefined && { label: entrance.label }) });
    if (entrances.length === MAX_MAP_ENTRANCES) break;
  }
  return entrances;
}

/**
 * The world map players are sent, with every map its GM's pins lead into: each map once, by the id
 * `ids` names for its asset, however many entrances lead to it, so a pin back to a map the path
 * already holds leads back. A map without an image is left out with every entrance into it; null
 * when the world map itself has none.
 */
export function worldMapOf(tree: WorldMapTree, ids: ReadonlyMap<string, string>, images: ReadonlyMap<string, MapImage | null>): WorldMapFile | null {
  const levels = reachable(tree, images);
  const shown = new Map(levels.flatMap((level) => {
    const id = ids.get(level.key);
    return id === undefined ? [] : [[level.key, { id, title: clippedLine(level.title, MAX_MAP_TITLE) ?? UNNAMED_MAP }] as const];
  }));
  const [root, ...nested] = levels;
  const rootImage = root === undefined ? null : (images.get(root.image) ?? null);
  const rootId = root === undefined ? undefined : shown.get(root.key)?.id;
  if (root === undefined || rootImage === null || rootId === undefined) return null;
  const paths = new Map([[rootImage.image.hash, root.image]]);
  const maps: BookNestedMap[] = [];
  for (const level of nested) {
    const image = images.get(level.image) ?? null;
    const named = shown.get(level.key);
    if (image === null || named === undefined) continue;
    paths.set(image.image.hash, level.image);
    maps.push({ id: named.id, title: named.title, image: image.image, width: image.width, height: image.height, entrances: entrancesOf(level, image, shown) });
  }
  const entrances = entrancesOf(root, rootImage, shown);
  const map: BookWorldMap = { image: rootImage.image, width: rootImage.width, height: rootImage.height, ...(maps.length > 0 && { id: rootId, entrances, maps }) };
  return { map, paths, questPlaces: questPlacesOf(root, rootImage) };
}
