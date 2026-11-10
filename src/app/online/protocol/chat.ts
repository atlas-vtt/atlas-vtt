import { parseAsset, type AssetRef } from './asset.ts';
import { MAX_PLAYERS, PLAYER_ID_PATTERN, playerName, SHOWN, UNSEEN, UNSHOWN } from './relay.ts';
import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, TOKEN_ID_PATTERN } from './tokens.ts';

/** Who a log entry is by: the GM. */
export const GM_AUTHOR = 'gm';

/**
 * Who sees a roll: everyone, the roller and the GM (`gm`), the GM alone while the roller learns only
 * that they rolled (`blind`), or the roller alone (`self`). Everyone else sees that a roll was made.
 */
export type RollMode = 'public' | 'gm' | 'blind' | 'self';
export const ROLL_MODES: readonly RollMode[] = ['public', 'gm', 'blind', 'self'];

/** How a chat message is said: in character, as an emote, or out of character (none). */
export type ChatStyle = 'ic' | 'emote';

/** The longest name a speaker has, and the longest flavor a roll carries. */
export const MAX_SPEAKER_NAME = 60;
export const MAX_FLAVOR = 120;
/** The most rolls a message holds inline, rolled or offered as buttons. */
export const MAX_INLINE_ROLLS = 5;
/** The longest label a roll button has. */
export const MAX_INLINE_LABEL = 40;
/** The most people a whisper or a private roll is for: everyone a table seats and the GM. */
export const MAX_AUDIENCE = MAX_PLAYERS + 1;

/** A token speaking in the log, as its viewers may know it: its name, its id in the players' list when it is there, its art by hash and its ring. */
export interface LogSpeaker {
  readonly name: string;
  readonly token: string | null;
  readonly art: AssetRef | null;
  readonly ring: string | null;
}

/** Someone at the table, as players are told: for whispers; `away` once they left, so a whisper they had still names them. */
export interface TablePerson {
  readonly id: string;
  readonly name: string;
  readonly away?: true;
}

export const isAuthor = (value: unknown): value is string => value === GM_AUTHOR || (typeof value === 'string' && PLAYER_ID_PATTERN.test(value));
export const isRollMode = (value: unknown): value is RollMode => typeof value === 'string' && (ROLL_MODES as readonly string[]).includes(value);

/** A line of text as a name or a flavor is shown: controls and direction marks removed, white space collapsed; null for nothing or too long. */
export function shownLine(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length > max * 4) return null;
  const line = value.replace(UNSHOWN, ' ').replace(UNSEEN, '').replace(/\s+/g, ' ').trim();
  return SHOWN.test(line) && [...line].length <= max ? line : null;
}

/** A speaker as the client reads it, or null for anything malformed. */
export function parseSpeaker(value: unknown): LogSpeaker | null {
  if (!isRecord(value)) return null;
  const name = shownLine(value.name, MAX_SPEAKER_NAME);
  if (name === null || name !== value.name) return null;
  if (value.token !== null && (typeof value.token !== 'string' || !TOKEN_ID_PATTERN.test(value.token))) return null;
  const art = value.art === null ? null : parseAsset(value.art);
  if (art === null && value.art !== null) return null;
  if (value.ring !== null && (typeof value.ring !== 'string' || !COLOUR_PATTERN.test(value.ring))) return null;
  return { name, token: value.token, art, ring: value.ring };
}

/** An audience as the client reads it: distinct authors, at least one; null for anything else. */
export function parseAudience(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_AUDIENCE || !value.every(isAuthor)) return null;
  return new Set(value).size === value.length ? value : null;
}

/** The people at the table as the GM tells players, or null for anything malformed. */
export function parsePeople(value: unknown): readonly TablePerson[] | null {
  if (!Array.isArray(value) || value.length > MAX_PLAYERS * 4) return null;
  const people: TablePerson[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !PLAYER_ID_PATTERN.test(item.id)) return null;
    const name = playerName(item.name);
    if (name === null || (item.away !== undefined && item.away !== true)) return null;
    people.push({ id: item.id, name, ...(item.away === true && { away: true as const }) });
  }
  return people;
}

/** A roll written into a message: rolled when it is said (`mode` null), or a button that rolls it in `mode` for whoever presses it. */
export interface InlineMark {
  readonly start: number;
  readonly end: number;
  readonly formula: string;
  readonly mode: RollMode | null;
  readonly label: string | null;
}

// A formula may hold labels in brackets (`1d8+3[fire]`), so its end is the first `]]` outside them.
const INLINE = /\[\[(?:\/([a-z]+)\s+)?((?:[^[\]]|\[[^[\]]{0,24}\]){1,100}?)\]\](?:\{([^{}\n]{1,40})\})?/gi;

const COMMAND_MODES: Readonly<Record<string, RollMode>> = {
  r: 'public', roll: 'public', pr: 'public', publicroll: 'public',
  gmr: 'gm', gmroll: 'gm',
  br: 'blind', broll: 'blind', blindr: 'blind', blindroll: 'blind',
  sr: 'self', selfroll: 'self',
};

/** The roll mode a roll command names (`r`, `gmr`, `br`, `sr`, `pr` and their long forms), or null. */
export function commandMode(command: string): RollMode | null {
  return COMMAND_MODES[command.toLowerCase()] ?? null;
}

/**
 * The rolls written into a text, in order: `[[1d20+5]]` is rolled when the message is said,
 * `[[/r 1d20+2]]{Dex save}` (also `/gmr`, `/br`, `/sr`) is a button. Null for more than
 * `MAX_INLINE_ROLLS` or a command that is no roll command. Formulas are checked where they are rolled.
 */
export function inlineMarks(text: string): readonly InlineMark[] | null {
  const marks: InlineMark[] = [];
  for (const match of text.matchAll(INLINE)) {
    const [whole, command, body, rawLabel] = match;
    const mode = command === undefined ? null : commandMode(command);
    if (command !== undefined && mode === null) return null;
    const formula = (body ?? '').trim();
    if (formula === '') return null;
    const label = rawLabel === undefined ? null : shownLine(rawLabel, MAX_INLINE_LABEL);
    marks.push({ start: match.index, end: match.index + whole.length, formula, mode, label });
    if (marks.length > MAX_INLINE_ROLLS) return null;
  }
  return marks;
}

/** The formulas a text rolls when it is said, in order: what an edit must keep. */
export function rolledFormulas(text: string): readonly string[] | null {
  return inlineMarks(text)?.filter((mark) => mark.mode === null).map((mark) => mark.formula) ?? null;
}
