import { GM_AUTHOR, PLAYER_COLOURS, playerColourVariable, playerTone, type LogEntry, type LogReactionEmoji, type LogSpeaker } from '../protocol/index.ts';
import { sameAudience } from './audience.ts';

/** Rows of one author this close together read as one message block. */
const GROUP_WINDOW_MS = 7 * 60_000;

const sameSpeaker = (a: LogSpeaker | undefined, b: LogSpeaker | undefined): boolean => a?.name === b?.name && a?.token === b?.token;

/**
 * Whether a row continues the one above it: the same author's chat message within seven minutes,
 * said the same way (style and speaker) to the same people, and no reply. Such a row drops its
 * avatar and byline.
 */
export function continuesPrevious(prev: LogEntry | undefined, cur: LogEntry): boolean {
  if (prev === undefined || prev.kind !== 'chat' || cur.kind !== 'chat') return false;
  if (prev.who !== cur.who || cur.reply !== undefined) return false;
  if (prev.style !== cur.style || !sameSpeaker(prev.speaker, cur.speaker) || !sameAudience(prev.to, cur.to)) return false;
  return Math.abs(cur.at - prev.at) < GROUP_WINDOW_MS;
}

/** One reaction of an entry as a chip shows it. */
export interface ShownReaction {
  readonly emoji: LogReactionEmoji;
  readonly count: number;
  /** The viewer gave it. */
  readonly mine: boolean;
}

/** The reactions of an entry, in the order they were first given; none for a line about who came or left. */
export function reactionsFor(entry: LogEntry, self: string | null): readonly ShownReaction[] {
  if (entry.kind !== 'chat' && entry.kind !== 'roll' && entry.kind !== 'image' && entry.kind !== 'loot' && entry.kind !== 'found' && entry.kind !== 'rest') return [];
  return (entry.reactions ?? [])
    .filter((reaction) => reaction.by.length > 0)
    .map((reaction) => ({ emoji: reaction.emoji, count: reaction.by.length, mine: self !== null && reaction.by.includes(self) }));
}

/** Obsidian's colour variables a player's colour is picked from: the table's player colours. */
export const AUTHOR_COLOURS = PLAYER_COLOURS;
/** The GM's colour. */
export const GM_COLOUR = '--interactive-accent';

/** Which of `AUTHOR_COLOURS` an author has (`'gm'` for the GM): the player's colour everywhere at the table (`playerTone`). */
export function authorTone(who: string): number | 'gm' {
  return who === GM_AUTHOR ? 'gm' : playerTone(who);
}

/** The CSS variable that holds an author's colour. */
export function authorColour(who: string): string {
  return playerColourVariable(who);
}

/** The letter on an author's disc: the first character of the name, in upper case. */
export function monogram(name: string): string {
  const [first] = name.trim();
  return first === undefined ? '?' : first.toLocaleUpperCase();
}

/** An author's name as the viewer reads it: "You" for their own, "GM" for the GM's. */
export function shownName(who: string, name: string, self: string | null): string {
  if (self !== null && who === self) return 'You';
  return who === GM_AUTHOR ? 'GM' : name;
}
