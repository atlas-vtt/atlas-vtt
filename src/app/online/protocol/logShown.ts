import { isSide, parseAsset, parseTextAsset, type AssetRef } from './asset.ts';
import { MAX_QUEST_BODY, parseQuestImages } from './bookMap.ts';
import { bookText } from './bookText.ts';
import { shownLine } from './chat.ts';
import type { QuestImage } from './questText.ts';
import { isRecord } from './shape.ts';

/** The most properties a loot card carries, and the longest a name, a short value and a description may be. */
export const MAX_LOOT_PROPERTIES = 16;
export const MAX_LOOT_NAME = 120;
export const MAX_LOOT_VALUE = 200;
export const MAX_LOOT_DESCRIPTION = 1500;

/** An item the GM handed out, as players read it: the text of its card, never where it came from. */
export interface LootCard {
  readonly name: string;
  readonly rarity?: string;
  readonly type?: string;
  readonly price?: string;
  readonly description?: string;
  readonly properties: readonly { readonly label: string; readonly value: string }[];
}

/** The longest title of a found note. */
export const MAX_FOUND_TITLE = 120;

/**
 * A note a readable pin let the players read, as the GM sends it: its title (the note's name, or the
 * heading the pin links to), the opening of its Markdown text, the whole text by hash where the
 * opening is not all of it (`TEXT_MIME_TYPE`), and the images the text embeds, as a quest's.
 */
export interface FoundNote {
  readonly title: string;
  readonly body: string;
  readonly text?: AssetRef;
  readonly images?: readonly QuestImage[];
}

/** An image the GM showed the players: by hash with its size, never its file's name or path. */
export interface ShownImageRef {
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
}

/** An optional text of a card: undefined where it is absent, null where it cannot be read. */
function optionalText(value: unknown, max: number): string | null | undefined {
  return value === undefined ? undefined : shownLine(value, max);
}

/** A loot card as the client reads it, or null for anything malformed. */
export function parseLootCard(value: unknown): LootCard | null {
  if (!isRecord(value) || !Array.isArray(value.properties) || value.properties.length > MAX_LOOT_PROPERTIES) return null;
  const name = shownLine(value.name, MAX_LOOT_NAME);
  const rarity = optionalText(value.rarity, MAX_LOOT_VALUE);
  const type = optionalText(value.type, MAX_LOOT_VALUE);
  const price = optionalText(value.price, MAX_LOOT_VALUE);
  const description = optionalText(value.description, MAX_LOOT_DESCRIPTION);
  if (name === null || rarity === null || type === null || price === null || description === null) return null;
  const properties: { label: string; value: string }[] = [];
  for (const property of value.properties) {
    if (!isRecord(property)) return null;
    const label = shownLine(property.label, MAX_LOOT_NAME);
    const text = shownLine(property.value, MAX_LOOT_DESCRIPTION);
    if (label === null || text === null) return null;
    properties.push({ label, value: text });
  }
  return {
    name, properties,
    ...(rarity !== undefined && { rarity }),
    ...(type !== undefined && { type }),
    ...(price !== undefined && { price }),
    ...(description !== undefined && { description }),
  };
}

/** A shown image as a log entry carries it, or null for anything malformed. */
export function parseShownImageRef(value: Record<string, unknown>): ShownImageRef | null {
  const image = parseAsset(value.image);
  if (image === null || !isSide(value.width) || !isSide(value.height)) return null;
  return { image, width: value.width, height: value.height };
}

/** A found note as a log entry carries it, or null for anything malformed. */
export function parseFoundNote(value: Record<string, unknown>): FoundNote | null {
  const title = shownLine(value.title, MAX_FOUND_TITLE);
  const body = bookText(value.body, MAX_QUEST_BODY);
  const text = value.text === undefined ? undefined : parseTextAsset(value.text);
  const images = parseQuestImages(value.images);
  if (title === null || body === null || text === null || images === null) return null;
  return { title, body, ...(text !== undefined && { text }), ...(images !== undefined && images.length > 0 && { images }) };
}
