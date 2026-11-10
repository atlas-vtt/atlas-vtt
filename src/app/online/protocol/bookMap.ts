import { parseTextAsset, type AssetRef } from './asset.ts';
import { bookLine, bookText } from './bookText.ts';
import { MAX_QUEST_IMAGES, parseQuestImage, type QuestImage } from './questText.ts';
import { isRecord } from './shape.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

/** What a book holds of the world map at most: the player's own pins, the quests the GM gave, a quest's rewards. */
export const MAX_BOOK_PINS = 120;
export const MAX_BOOK_QUESTS = 60;
export const MAX_QUEST_REWARDS = 8;
/** The longest texts of a pin and of a quest's opening, in characters: as long as a note's. A quest's whole text comes as an asset. */
export const MAX_PIN_BODY = 2000;
export const MAX_QUEST_BODY = 2000;
/** The longest title of a pin, a quest or a reward. */
export const MAX_MAP_TITLE = 80;
/** An id on the world map: 96 random bits in hex, made by whoever made the thing. */
const ID = /^[0-9a-f]{24}$/;

/** What a pin on the world map marks, in the order the page offers them. */
export const PIN_KINDS = ['treasure', 'danger', 'dungeon', 'person', 'note'] as const;
export type PinKind = (typeof PIN_KINDS)[number];
/** Kinds an older book wrote, read as the kind that took their place. */
const OLDER_PIN_KINDS: Readonly<Record<string, PinKind>> = { place: 'dungeon' };

/** A main quest leads, a side quest waits beside it. */
export const QUEST_KINDS = ['main', 'side'] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];
/** How far a quest has got: told, taken up, done, or failed. The last two are behind the party. */
export const QUEST_STATES = ['open', 'active', 'done', 'failed'] as const;
export type QuestState = (typeof QUEST_STATES)[number];

/** A place on the world map: shares of the image's width and height. */
export interface MapPlace {
  readonly x: number;
  readonly y: number;
}

/** A player's own pin on the world map, or on a map it leads into. */
export interface BookPin extends MapPlace {
  readonly id: string;
  /** The map it stands on (`BookNestedMap.id`); none for the world map itself. */
  readonly map?: string;
  readonly kind: PinKind;
  readonly title: string;
  readonly body: string;
}

/** A quest the GM gave the character: where it leads (or nowhere), what it pays, and how far it has got. */
export interface BookQuest {
  readonly id: string;
  readonly kind: QuestKind;
  readonly state: QuestState;
  readonly title: string;
  /** The opening of its Markdown text, cut at a line or a word; the whole text where that is short enough. */
  readonly body: string;
  /** The whole text, fetched by hash (`TEXT_MIME_TYPE`, read with `readQuestText`), where `body` is only its opening. */
  readonly text?: AssetRef;
  /** The images its text embeds (`questEmbeds`), each fetched by hash; none where it embeds none. */
  readonly images?: readonly QuestImage[];
  readonly place: MapPlace | null;
  /** Experience it brings; 0 for none named. */
  readonly xp: number;
  /** What else it brings, as text. */
  readonly rewards: readonly string[];
}

/** Whether a quest is behind the party: done or failed. */
export const isQuestDone = (quest: Pick<BookQuest, 'state'>): boolean => quest.state === 'done' || quest.state === 'failed';

const isShare = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value);

function pinKind(value: unknown): PinKind | null {
  if (oneOf(PIN_KINDS, value)) return value;
  return typeof value === 'string' && Object.hasOwn(OLDER_PIN_KINDS, value) ? (OLDER_PIN_KINDS[value] ?? null) : null;
}

/** A pin, cleaned; a kind an older book wrote is read as the one that took its place. */
export function parseBookPin(value: unknown): BookPin | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !ID.test(value.id) || !isShare(value.x) || !isShare(value.y)) return null;
  const kind = pinKind(value.kind);
  const title = bookLine(value.title, MAX_MAP_TITLE, true);
  const body = bookText(value.body, MAX_PIN_BODY);
  if (kind === null || title === null || body === null || (value.map !== undefined && (typeof value.map !== 'string' || !ID.test(value.map)))) return null;
  return { id: value.id, ...(value.map !== undefined && { map: value.map }), x: value.x, y: value.y, kind, title, body };
}

function parsePlace(value: unknown): MapPlace | null | undefined {
  if (value === null || value === undefined) return null;
  return isRecord(value) && isShare(value.x) && isShare(value.y) ? { x: value.x, y: value.y } : undefined;
}

function parseRewards(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_QUEST_REWARDS) return null;
  const rewards: string[] = [];
  for (const entry of value) {
    const reward = bookLine(entry, MAX_MAP_TITLE);
    if (reward === null) return null;
    rewards.push(reward);
  }
  return rewards;
}

/** The images a text embeds (a quest's, a found note's); undefined for none named, null for a list that is malformed or too long. */
export function parseQuestImages(value: unknown): QuestImage[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_QUEST_IMAGES) return null;
  const images: QuestImage[] = [];
  for (const entry of value) {
    const image = parseQuestImage(entry);
    if (image === null) return null;
    images.push(image);
  }
  return images;
}

/** A quest, cleaned; what it does not name (place, experience, rewards, whole text, images) is none. */
export function parseBookQuest(value: unknown): BookQuest | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !ID.test(value.id) || !oneOf(QUEST_KINDS, value.kind) || !oneOf(QUEST_STATES, value.state)) return null;
  const title = bookLine(value.title, MAX_MAP_TITLE);
  const body = bookText(value.body ?? '', MAX_QUEST_BODY);
  const text = value.text === undefined ? undefined : parseTextAsset(value.text);
  const images = parseQuestImages(value.images);
  const place = parsePlace(value.place);
  const xp = value.xp ?? 0;
  const rewards = parseRewards(value.rewards);
  if (title === null || body === null || text === null || images === null || place === undefined || rewards === null) return null;
  if (typeof xp !== 'number' || !Number.isInteger(xp) || xp < 0 || xp > MAX_TOKEN_VALUE) return null;
  return { id: value.id, kind: value.kind, state: value.state, title, body, ...(text !== undefined && { text }), ...(images !== undefined && images.length > 0 && { images }), place, xp, rewards };
}
