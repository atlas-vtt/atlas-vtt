import { ASSET_CAPS, bookText, MAX_QUEST_BODY, questEmbeds, TEXT_MIME_TYPE, type QuestEmbed } from '../../protocol/index.ts';
import type { HashedRef } from '../assets/assetUses.ts';
import { sha256Hex } from '../assetServe.ts';
import { openingOf } from './bookTexts.ts';

/** A quest's whole text as it is stored for players: its reference by hash, and its bytes. */
export interface QuestTextAsset {
  readonly ref: HashedRef;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** What players are sent of a quest's text: its opening, the whole text where the opening is not all of it, and the embeds of what they get. */
export interface QuestTextParts {
  readonly opening: string;
  /** Null where the opening is the whole text, or where the whole text is more than an asset holds. */
  readonly whole: QuestTextAsset | null;
  readonly embeds: readonly QuestEmbed[];
}

/**
 * A quest's text (`questBody`, the GM's comments already taken out) as players are sent it: cleaned
 * as a book's text (`bookText`), its opening within `MAX_QUEST_BODY`, and, where that is not all of
 * it, the whole text as UTF-8 Markdown by hash. A text of more than `ASSET_CAPS.text` bytes is sent
 * as its opening alone. The embeds are those of what players get.
 */
export async function questTextParts(body: string): Promise<QuestTextParts> {
  const tooLong = body.length > ASSET_CAPS.text;
  const text = bookText(tooLong ? body.slice(0, ASSET_CAPS.text).replace(/[\ud800-\udbff]$/, '') : body, ASSET_CAPS.text) ?? '';
  const opening = openingOf(text, MAX_QUEST_BODY);
  if (opening === text) return { opening, whole: null, embeds: questEmbeds(opening) };
  // A copy the hash can take: `encode` names no particular buffer type.
  const bytes = new TextEncoder().encode(text).slice();
  if (tooLong || bytes.length > ASSET_CAPS.text) return { opening, whole: null, embeds: questEmbeds(opening) };
  const ref = { hash: await sha256Hex(bytes), size: bytes.length, mime: TEXT_MIME_TYPE };
  return { opening, whole: { ref, bytes }, embeds: questEmbeds(text) };
}
