import { isSide, parseAsset, type AssetRef } from './asset.ts';
import { isMapId, parseNestedMaps, rootEntrances, type BookNestedMap, type MapEntrance } from './bookLevels.ts';
import { MAX_BOOK_QUESTS, parseBookQuest, type BookQuest } from './bookMap.ts';
import { isRecord } from './shape.ts';

/**
 * The campaign's world map: an image by hash and its own size in pixels. It never names its file. Its
 * entrances lead into the maps the GM's pins open, and theirs further (`maps`, each once however
 * often it is entered); an older GM names neither.
 */
export interface BookWorldMap {
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
  /** Its id, where an entrance leads back to it. */
  readonly id?: string;
  readonly entrances?: readonly MapEntrance[];
  readonly maps?: readonly BookNestedMap[];
}

/**
 * Sent to one player whose page reads its book in parts (`book-parts`): the world map or the quests
 * alone, once only that part changed. A page that never said so gets its whole book instead.
 */
export type BookPartMessage =
  | { readonly t: 'book-map'; readonly worldMap: BookWorldMap | null }
  | { readonly t: 'book-quests'; readonly quests: readonly BookQuest[] };

/** A page tells the GM that it reads its book in parts, on every reach of the GM. */
export interface PlayerBookParts {
  readonly t: 'book-parts';
}

export const isBookPartType = (t: unknown): t is BookPartMessage['t'] => t === 'book-map' || t === 'book-quests';

/** A world map as sent: null for none, undefined when it is malformed. */
export function parseWorldMap(value: unknown): BookWorldMap | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isSide(value.width) || !isSide(value.height)) return undefined;
  const image = parseAsset(value.image);
  const id = isMapId(value.id) ? value.id : undefined;
  const maps = parseNestedMaps(value.maps, id);
  const entrances = maps === null ? null : rootEntrances(value.entrances, maps);
  if (image === null || maps === null || entrances === null) return undefined;
  return { image, width: value.width, height: value.height, ...(id !== undefined && { id }), ...(entrances.length > 0 && { entrances }), ...(maps.length > 0 && { maps }) };
}

/**
 * A book's quests: the GM's text, which the player only reads, so a quest the page cannot read (of a
 * newer GM, say) is left out and the rest of the book still shown; an id twice keeps the first.
 * None for a GM that gives none; null for a list that is no list or longer than a book holds.
 */
export function parseQuests(value: unknown): BookQuest[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_BOOK_QUESTS) return null;
  const quests = new Map<string, BookQuest>();
  for (const entry of value) {
    const quest = parseBookQuest(entry);
    if (quest !== null && !quests.has(quest.id)) quests.set(quest.id, quest);
  }
  return [...quests.values()];
}

/** A part of a book as the page reads it, or null for anything malformed. */
export function parseBookPart(value: Record<string, unknown>): BookPartMessage | null {
  if (value.t === 'book-map') {
    const worldMap = parseWorldMap(value.worldMap);
    return worldMap === undefined ? null : { t: 'book-map', worldMap };
  }
  const quests = value.t === 'book-quests' && value.quests !== undefined ? parseQuests(value.quests) : null;
  return quests === null ? null : { t: 'book-quests', quests };
}
