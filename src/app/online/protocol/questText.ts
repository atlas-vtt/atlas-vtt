import { ASSET_CAPS, isSide, parseAsset, type AssetRef } from './asset.ts';
import { bookText } from './bookText.ts';
import { isRecord } from './shape.ts';

/** The most images one quest's text shows. */
export const MAX_QUEST_IMAGES = 64;
/** The longest target of an image embed, as written, in characters. */
export const MAX_EMBED_TARGET = 512;

/** An image embed in a quest's text as written: what it names, and the size it asks for (null for none). */
export interface QuestEmbed {
  readonly target: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** An image a quest's text embeds: the embed as `questEmbeds` reads it, and the image by hash. */
export interface QuestImage extends QuestEmbed {
  readonly image: AssetRef;
}

/** `![[target]]`, `![[target|300]]`, `![[target|300x200]]`. */
const WIKI_EMBED = /!\[\[([^[\]\n]+)\]\]/g;
/** `![alt](target)`, `![alt|300](<target with spaces>)`, with or without a title. */
const MARKDOWN_EMBED = /!\[([^\]\n]*)\]\(\s*(<[^<>\n]+>|[^\s()<>]+)(?:\s+"[^"\n]*")?\s*\)/g;
const SIZE = /^(\d{1,5})(?:x(\d{1,5}))?$/;

/** The size an embed's last `|` part asks for; none where it is no size. */
function sizeOf(parts: readonly string[]): Pick<QuestEmbed, 'width' | 'height'> {
  const size = parts.length > 1 ? SIZE.exec(parts.at(-1)?.trim() ?? '') : null;
  const side = (value: string | undefined): number | null => (value !== undefined && isSide(Number(value)) ? Number(value) : null);
  return { width: side(size?.[1]), height: side(size?.[2]) };
}

/**
 * The image embeds of a quest's text, in the order they stand: Obsidian's `![[…]]` and Markdown's
 * `![…](…)`, each with its target as written (angle brackets taken off) and the size its last `|`
 * part asks for. Which of them name an image is the GM's to say (`QuestImage`); the page draws an
 * embed whose target and size match one, and shows any other as text.
 */
export function questEmbeds(text: string): QuestEmbed[] {
  const found: { readonly at: number; readonly embed: QuestEmbed }[] = [];
  const add = (at: number, target: string, parts: readonly string[]): void => {
    const trimmed = target.trim();
    if (trimmed !== '' && trimmed.length <= MAX_EMBED_TARGET) found.push({ at, embed: { target: trimmed, ...sizeOf(parts) } });
  };
  for (const match of text.matchAll(WIKI_EMBED)) {
    const parts = (match[1] ?? '').split('|');
    add(match.index, parts[0] ?? '', parts);
  }
  for (const match of text.matchAll(MARKDOWN_EMBED)) {
    const written = match[2] ?? '';
    add(match.index, written.startsWith('<') ? written.slice(1, -1) : written, (match[1] ?? '').split('|'));
  }
  return found.sort((a, b) => a.at - b.at).map(({ embed }) => embed);
}

const isTarget = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value !== '' && value.length <= MAX_EMBED_TARGET && !value.includes('\n');
const sideOrNone = (value: unknown): number | null | undefined => (value === null ? null : isSide(value) ? value : undefined);

/** An image of a quest's text, cleaned; null for anything malformed. */
export function parseQuestImage(value: unknown): QuestImage | null {
  if (!isRecord(value) || !isTarget(value.target)) return null;
  const image = parseAsset(value.image);
  const width = sideOrNone(value.width ?? null);
  const height = sideOrNone(value.height ?? null);
  return image === null || width === undefined || height === undefined ? null : { target: value.target, width, height, image };
}

/**
 * A quest's whole text from the bytes of its asset (`TEXT_MIME_TYPE`): UTF-8, cleaned as a book's
 * text is (`bookText`). Null for bytes that are no UTF-8 or more than an asset holds.
 */
export function readQuestText(bytes: Uint8Array): string | null {
  if (bytes.length > ASSET_CAPS.text) return null;
  try {
    return bookText(new TextDecoder('utf-8', { fatal: true }).decode(bytes), ASSET_CAPS.text);
  } catch {
    return null;
  }
}
