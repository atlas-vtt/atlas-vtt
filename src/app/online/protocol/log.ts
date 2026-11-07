import type { ChatStyle, LogSpeaker, RollMode, TablePerson } from './chat.ts';
import type { SharedRoll } from './dice.ts';
import type { FoundNote, LootCard, ShownImageRef } from './logShown.ts';
import { SHOWN, UNSEEN, UNSHOWN } from './relay.ts';

/** The reactions an entry of the log takes, in the order they are offered: the first three at once, the rest behind "more". */
export const LOG_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👎'] as const;
export type LogReactionEmoji = (typeof LOG_REACTIONS)[number];

/** The longest chat message, in characters, and the most lines it keeps. */
export const MAX_CHAT_TEXT = 500;
export const MAX_CHAT_LINES = 12;
/** The entries the GM keeps and a log message holds. */
export const MAX_LOG_ENTRIES = 200;
/** The most values a rest entry lists as changed or skipped, the longest label or name in it, and its longest roll. */
export const MAX_REST_CHANGES = 16;
export const MAX_REST_TEXT = 80;
export const MAX_REST_ROLL = 160;
/** The longest quote a reply carries of what it answers. */
export const MAX_REPLY_PREVIEW = 120;
/** An entry's id: made by the GM, 96 random bits in hex. */
export const LOG_ID_PATTERN = /^[0-9a-f]{24}$/;

/** One reaction on an entry and who gave it (`'gm'` or relay ids), in the order they did. */
export interface LogReaction {
  readonly emoji: LogReactionEmoji;
  readonly by: readonly string[];
}

/** What a reply shows of the entry it answers; `gone` once that entry was deleted (its quote is empty then). */
export interface LogReply {
  readonly id: string;
  readonly who: string;
  readonly name: string;
  readonly preview: string;
  readonly gone?: true;
}

interface EntryBase {
  readonly id: string;
  /** When it happened, by the GM's clock (milliseconds). */
  readonly at: number;
  /** Who it is by or about: `'gm'` or a player's relay id, and their name then, shown as text only. */
  readonly who: string;
  readonly name: string;
}

/**
 * A chat message: text shown as text only, `edited` (the GM's clock) once it was changed. Said in
 * character or as an emote (`style`) by a token (`speaker`); whispered to `to` (the author sees it
 * too, nobody else is sent it); `inline`: the rolls its text rolled when it was said, in order.
 */
export interface ChatEntry extends EntryBase {
  readonly kind: 'chat';
  readonly text: string;
  readonly reply?: LogReply;
  readonly edited?: number;
  readonly reactions?: readonly LogReaction[];
  readonly style?: ChatStyle;
  readonly speaker?: LogSpeaker;
  readonly to?: readonly string[];
  readonly inline?: readonly SharedRoll[];
}

/** The roll button of an entry a roll answers, and its label. */
export interface RollRequestRef {
  readonly id: string;
  readonly label: string;
}

/**
 * A roll, naming its token (by the id players know it by) when the players see it. A private roll
 * (`mode`) is sent as this only to `to`; everyone else gets a `secret` entry in its place.
 */
export interface RollEntry extends EntryBase {
  readonly kind: 'roll';
  readonly roll: SharedRoll;
  readonly token: string | null;
  readonly reactions?: readonly LogReaction[];
  readonly mode?: Exclude<RollMode, 'public'>;
  readonly to?: readonly string[];
  readonly flavor?: string;
  readonly speaker?: LogSpeaker;
  readonly request?: RollRequestRef;
}

/** That a private roll was made, for those not shown it (in a blind roll, the roller too). */
export interface SecretEntry extends EntryBase {
  readonly kind: 'secret';
  readonly mode: Exclude<RollMode, 'public'>;
  readonly speaker?: LogSpeaker;
}

/** A player came to the table or left it. */
export interface PresenceEntry extends EntryBase {
  readonly kind: 'joined' | 'left';
}

/** An image the GM showed every player ("Display on player view"), kept in the log to look at again. */
export interface ImageEntry extends EntryBase, ShownImageRef {
  readonly kind: 'image';
  readonly reactions?: readonly LogReaction[];
}

/** An item the GM handed out from the loot roller. */
export interface LootEntry extends EntryBase {
  readonly kind: 'loot';
  readonly item: LootCard;
  readonly reactions?: readonly LogReaction[];
}

/** A note a readable pin let the players read, found by the player the entry names: everyone may read it. */
export interface FoundEntry extends EntryBase, FoundNote {
  readonly kind: 'found';
  readonly reactions?: readonly LogReaction[];
}

/**
 * One value a rest changed: its label, what it was and became, and the roll that decided it ("2d8+2 = 9").
 * `character` names another character than the one resting, whom an action picked in the rest was taken for.
 */
export interface RestChange {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly roll?: string;
  readonly character?: string;
}

/**
 * A rest the GM's Atlas applied (a player's request the GM approved, or the GM's own): the character
 * by name, the button by name, the actions picked in its steps by name (`picks`), what it changed,
 * and the labels of what it could not change (`skipped`). Only the GM logs it. What changed is the
 * character's player's and the GM's alone, and a change made to another character also that
 * character's player's: everyone else gets the entry without `changes` and `skipped`, which reads
 * as the rest's title and its picks only.
 */
export interface RestEntry extends EntryBase {
  readonly kind: 'rest';
  readonly character: string;
  readonly button: string;
  readonly picks?: readonly string[];
  readonly changes?: readonly RestChange[];
  readonly skipped?: readonly string[];
  readonly reactions?: readonly LogReaction[];
}

export type LogEntry = ChatEntry | RollEntry | SecretEntry | PresenceEntry | ImageEntry | LootEntry | FoundEntry | RestEntry;

/**
 * Why the GM did not take a player's chat message, edit, deletion or reaction: too fast, no text,
 * gone, a whisper to someone unknown, a token not theirs to speak as, or a roll in the text that
 * does not roll (or an edit that changes one).
 */
export type ChatRefusal = 'rate' | 'text' | 'gone' | 'whisper' | 'speaker' | 'roll';

/**
 * The table's log as the GM tells it: all of it (`log`, to a player who joined and after the GM cleared
 * it), one entry added or changed (`log-entry`, by its id), one removed, and to a sender alone that
 * what they sent was not taken. A changed or removed message says nothing of the answers that quote
 * it: whoever holds them quotes the new text, or none (`quoting`), by the same rule.
 */
export type LogMessage =
  | { readonly t: 'log'; readonly entries: readonly LogEntry[] }
  | { readonly t: 'log-entry'; readonly entry: LogEntry }
  | { readonly t: 'log-remove'; readonly id: string }
  | { readonly t: 'chat-refused'; readonly reason: ChatRefusal }
  /** Who is at the table, for whispers. */
  | { readonly t: 'people'; readonly people: readonly TablePerson[] };

/** A message a player says: answering `reply`, in a style, as one of their tokens (`speaker`, by the id players know it by), whispered to `to`. */
export interface PlayerChat {
  readonly t: 'chat';
  readonly text: string;
  readonly reply?: string;
  readonly style?: ChatStyle;
  readonly speaker?: string;
  readonly to?: readonly string[];
}

/**
 * What a player sends to the log: a message, a new text for or the deletion of a message of their
 * own, and a reaction given (`on`) or taken back.
 */
export type PlayerLogMessage =
  | PlayerChat
  | { readonly t: 'chat-edit'; readonly id: string; readonly text: string }
  | { readonly t: 'chat-delete'; readonly id: string }
  | { readonly t: 'react'; readonly id: string; readonly emoji: LogReactionEmoji; readonly on: boolean };

export const LOG_REFUSALS: readonly string[] = ['rate', 'text', 'gone', 'whisper', 'speaker', 'roll'];
const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/;

export const isLogId = (value: unknown): value is string => typeof value === 'string' && LOG_ID_PATTERN.test(value);
export const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Whether an emoji is one of the log's reactions. */
export function isLogReaction(value: unknown): value is LogReactionEmoji {
  return typeof value === 'string' && (LOG_REACTIONS as readonly string[]).includes(value);
}

/**
 * A chat message as shown: each line cleaned as a name is (controls and direction marks removed,
 * white space collapsed), blank lines at most one in a row, at most `MAX_CHAT_LINES` lines (the rest
 * joins the last); null when nothing that shows or too much is left.
 */
export function chatText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_CHAT_TEXT * 4) return null;
  const lines = value.split(LINE_BREAK).map((line) => line.replace(UNSHOWN, ' ').replace(UNSEEN, '').replace(/\s+/g, ' ').trim());
  const kept: string[] = [];
  for (const line of lines) {
    if (line === '' && (kept.length === 0 || kept[kept.length - 1] === '')) continue;
    if (kept.length < MAX_CHAT_LINES) kept.push(line);
    else if (line !== '') kept[kept.length - 1] = `${kept[kept.length - 1]} ${line}`.trim();
  }
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  const text = kept.join('\n');
  return SHOWN.test(text) && [...text].length <= MAX_CHAT_TEXT ? text : null;
}

/** A reply as it stands once the entry it answers changed its text (`text`) or was deleted (null). */
export function quoting(reply: LogReply, text: string | null): LogReply {
  const { id, who, name } = reply;
  return text === null ? { id, who, name, preview: '', gone: true } : { id, who, name, preview: replyPreview(text) };
}

/** The one line a reply quotes of a text: its first `MAX_REPLY_PREVIEW` characters, line breaks as spaces. */
export function replyPreview(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const characters = [...line];
  return characters.length <= MAX_REPLY_PREVIEW ? line : `${characters.slice(0, MAX_REPLY_PREVIEW - 1).join('')}…`;
}
