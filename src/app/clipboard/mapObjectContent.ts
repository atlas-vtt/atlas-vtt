import type { DrawingStroke, NotePin, TextElement, TokenEntity } from '../types';
import type { LevelLink } from '../types/sceneLevelTypes';
import { copiedLevelLink, type CopiedLevelLink } from '../levels/levelLinkCopies';
import { levelLinkList } from '../levels/levelLinks';
import { viewedLevelId, type LevelView } from '../levels/sceneLevels';
import { mapTokens } from '../tokens/offMap';

export interface Point {
  x: number;
  y: number;
}

/** The object collections that copy, paste and duplicate work on. */
export interface CopyableCollections {
  tokens: Record<string, TokenEntity>;
  drawings: Record<string, DrawingStroke>;
  texts: Record<string, TextElement>;
  pins: Record<string, NotePin>;
  /** Stairs, which the stairs tool copies; a scene from an older version has none. */
  levelLinks?: Record<string, LevelLink> | undefined;
}

/** Detached copies of map objects, as held on the clipboard or inserted by paste and duplicate. */
export interface MapObjectContent {
  tokens: TokenEntity[];
  drawings: DrawingStroke[];
  texts: TextElement[];
  pins: NotePin[];
  levelLinks: CopiedLevelLink[];
}

/**
 * Deep copies of the objects with the given ids, in selection order.
 * Ids of objects that cannot be copied (fog, walls) are ignored. Stairs are copied only with the
 * view they are copied in (`view`), whose level shown their levels are counted from.
 */
export function collectMapObjects(objects: CopyableCollections, ids: readonly string[], view?: LevelView): MapObjectContent {
  const pick = <T>(collection: Record<string, T>): T[] =>
    ids.flatMap((id) => (collection[id] ? [structuredClone(collection[id])] : []));
  const links = view ? levelLinkList(objects.levelLinks) : [];
  const from = view ? viewedLevelId(view) : null;
  return {
    tokens: pick(mapTokens(objects)),
    drawings: pick(objects.drawings),
    texts: pick(objects.texts),
    pins: pick(objects.pins),
    levelLinks: ids.flatMap((id) => {
      const link = links.find((candidate) => candidate.id === id);
      const copy = link && copiedLevelLink(link, from, view?.levels);
      return copy ? [copy] : [];
    }),
  };
}

export function countMapObjects(content: MapObjectContent): number {
  return content.tokens.length + content.drawings.length + content.texts.length + content.pins.length + content.levelLinks.length;
}

/** Every position that defines where the content sits on the map. */
function referencePoints(content: MapObjectContent): Point[] {
  return [
    ...content.tokens,
    ...content.texts,
    ...content.pins,
    ...content.drawings.flatMap((drawing) => drawing.points),
    ...content.levelLinks.flatMap((link) => link.polygon),
  ].map(({ x, y }) => ({ x, y }));
}

/** Centre of the bounding box around the content's reference points. */
export function contentCenter(content: MapObjectContent): Point {
  const points = referencePoints(content);
  if (points.length === 0) return { x: 0, y: 0 };
  // A loop rather than Math.min(...xs): long pen strokes can exceed the engine's argument limit.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Fresh copies of the content moved by `offset`. Token positions then pass through
 * `placeToken`, which lets callers snap them to the grid.
 */
export function translateMapObjects(
  content: MapObjectContent,
  offset: Point,
  placeToken: (position: Point, tokenSize: number) => Point = (position) => position,
): MapObjectContent {
  const shift = (point: Point): Point => ({ x: point.x + offset.x, y: point.y + offset.y });
  const move = <T extends Point>(object: T): T => ({ ...structuredClone(object), ...shift(object) });
  return {
    tokens: content.tokens.map((token) => ({ ...structuredClone(token), ...placeToken(shift(token), token.size || 1) })),
    drawings: content.drawings.map((drawing) => ({
      ...structuredClone(drawing),
      points: drawing.points.map(shift),
    })),
    texts: content.texts.map(move),
    pins: content.pins.map(move),
    levelLinks: content.levelLinks.map((link) => ({ ...structuredClone(link), polygon: link.polygon.map(shift) })),
  };
}

/** Where an object sits, qualified by what it is; two identical objects with the same anchor stack exactly. */
export interface ObjectAnchor {
  kind: string;
  point: Point;
  /** Size of a token, which snaps to the grid when placed; unset for other objects, which keep their exact offset. */
  tokenSize?: number;
}

export function anchorKey(kind: string, point: Point): string {
  return `${kind}:${Math.round(point.x)},${Math.round(point.y)}`;
}

/** Whether `source` is copied content (lists) rather than a scene's collections (records). */
function isCopiedContent(source: CopyableCollections | MapObjectContent): source is MapObjectContent {
  return Array.isArray(source.tokens);
}

/** The anchor of every object: tokens by image, texts and pins by position, drawings and stairs by their first point. */
export function objectAnchors(source: CopyableCollections | MapObjectContent): ObjectAnchor[] {
  const values = <T>(collection: Record<string, T> | T[]): T[] => (Array.isArray(collection) ? collection : Object.values(collection));
  const anchors: ObjectAnchor[] = [];
  const add = (kind: string, point: Point | undefined, tokenSize?: number): void => {
    if (point) anchors.push({ kind, point: { x: point.x, y: point.y }, ...(tokenSize !== undefined && { tokenSize }) });
  };
  // Of a scene only the tokens on the map stand where a copy is put down
  const tokens = isCopiedContent(source) ? source.tokens : mapTokens(source);
  values(tokens).forEach((token) => add(`token:${token.imagePath}`, token, token.size || 1));
  values(source.texts).forEach((text) => add('text', text));
  values(source.pins).forEach((pin) => add('pin', pin));
  values(source.drawings).forEach((drawing) => add('drawing', drawing.points[0]));
  const links = Array.isArray(source.levelLinks) ? source.levelLinks : levelLinkList(source.levelLinks);
  links.forEach((link) => add('stairs', link.polygon[0]));
  return anchors;
}
