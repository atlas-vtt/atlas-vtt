import { chatText, GM_AUTHOR, inlineMarks, replyPreview, rolledFormulas, type ChatRefusal, type ChatStyle, type LogReply, type LogSpeaker, type RollMode, type SharedRoll } from '../../protocol/index.ts';
import { rollableFormula } from '../PlayerRolls.ts';
import { seesWhole, type GmLogEntry } from './logEntries.ts';

/** A message as its author wrote it: answering `reply`, in a style, as a token (`speaker`: its key for the author), whispered to `to`. */
export interface ChatDraft {
  readonly text: string;
  readonly reply?: string;
  readonly style?: ChatStyle;
  readonly speaker?: string;
  readonly to?: readonly string[];
}

/**
 * A roll button of the log as its presser may roll it: its formula, the mode its author set, and
 * its label; `to`: the people of the whisper it stands in, who alone are shown its roll.
 */
export interface RollRequest {
  readonly formula: string;
  readonly mode: RollMode;
  readonly label: string;
  readonly to?: readonly string[];
}

/** A token an author may speak as: as its viewers know it, and its artwork's vault path. */
export interface SpokenAs {
  readonly speaker: LogSpeaker;
  readonly art: string | null;
}

/** What a message is checked against, for its author. */
export interface ChatContext {
  readonly who: string;
  /** Whether someone may be whispered to: the GM, or a player the log knows by name. */
  known(id: string): boolean;
  /** An entry the author sees whole, by id. */
  answered(id: string): GmLogEntry | undefined;
  /** A formula rolled now by the shared map's rules, or null where it does not roll. */
  rollInline(formula: string): SharedRoll | null;
}

/** What a chat entry holds beyond its stamp. */
export type ChatFields = Pick<Extract<GmLogEntry, { kind: 'chat' }>, 'text' | 'reply' | 'style' | 'speaker' | 'to' | 'inline' | 'speakerArt'>;

/** Everyone an entry is for: its author and its audience; null for an entry everyone sees. */
export function audienceOf(entry: GmLogEntry): readonly string[] | null {
  if ((entry.kind !== 'chat' && entry.kind !== 'roll') || entry.to === undefined) return null;
  return [...new Set([entry.who, ...entry.to])];
}

/** The line an answer quotes of an entry. */
function quotedText(entry: GmLogEntry): string {
  switch (entry.kind) {
    case 'chat':
      return replyPreview(entry.text);
    case 'roll':
      return replyPreview(`${entry.roll.formula} = ${entry.roll.total}`);
    case 'loot':
      return replyPreview(entry.item.name);
    case 'rest':
      return replyPreview(`${entry.character} · ${entry.button}`);
    case 'image':
      return 'An image';
    default:
      return '';
  }
}

/**
 * What an answer shows of the entry it answers: its text or result only where everyone the answer
 * reaches (`readers`, null for everyone) was shown it whole; a blind roll answered to its roller
 * names the roll and quotes nothing.
 */
export function replyTo(entry: GmLogEntry, readers: readonly string[] | null = null): LogReply {
  const shown = readers === null ? audienceOf(entry) === null && entry.hidden !== true : readers.every((reader) => seesWhole(entry, reader));
  const preview = !shown ? '' : quotedText(entry);
  return { id: entry.id, who: entry.who, name: entry.name, preview };
}

/**
 * Whom a message goes to: an answer to a whisper or a private roll goes to the people that one is
 * for, whatever else was asked, so a quote never reaches someone who was not shown what it quotes;
 * otherwise the people asked for. The author is never among them. As in Foundry, a whisper between
 * players is not the GM's to read: the GM's device keeps it with the log and sends it on, and shows
 * it to nobody else. Null where someone asked for is unknown or nobody is left.
 */
function audience(draft: ChatDraft, answered: GmLogEntry | undefined, context: ChatContext): readonly string[] | null | undefined {
  const inherited = answered === undefined ? null : audienceOf(answered);
  const asked = inherited ?? draft.to;
  if (asked === undefined) return undefined;
  // The GM's note to themselves: the log keeps it as the GM's alone.
  if (inherited === null && context.who === GM_AUTHOR && asked.length === 1 && asked[0] === GM_AUTHOR) return [GM_AUTHOR];
  if (inherited === null && !asked.every((id) => context.known(id))) return null;
  const to = new Set(asked.filter((id) => id !== context.who));
  return to.size === 0 ? null : [...to];
}

/** The rolls a text holds checked, and those it rolls now rolled; null when one does not roll. */
function inlineRolls(text: string, context: ChatContext): readonly SharedRoll[] | null {
  const marks = inlineMarks(text);
  if (marks === null || marks.some((mark) => !rollableFormula(mark.formula))) return null;
  const rolled: SharedRoll[] = [];
  for (const mark of marks) {
    if (mark.mode !== null) continue;
    const roll = context.rollInline(mark.formula);
    if (roll === null) return null;
    rolled.push(roll);
  }
  return rolled;
}

/**
 * A message as the log takes it, or why not: its text cleaned, its answer quoted, its audience
 * checked and its inline rolls rolled, said as `spoken` (the token its speaker key names, looked up
 * before; null where it names none). In character needs a token to speak as; without one the
 * message is said out of character.
 */
export function chatFields(draft: ChatDraft, spoken: SpokenAs | null, context: ChatContext): ChatFields | ChatRefusal {
  const text = chatText(draft.text);
  if (text === null) return 'text';
  // An answer to an entry that is gone by now is still said, as a message of its own.
  const answered = draft.reply === undefined ? undefined : context.answered(draft.reply);
  const to = audience(draft, answered, context);
  if (to === null) return 'whisper';
  const inline = inlineRolls(text, context);
  if (inline === null) return 'roll';
  if (draft.speaker !== undefined && spoken === null) return 'speaker';
  const style = draft.style === 'emote' || (draft.style === 'ic' && spoken !== null) ? draft.style : undefined;
  return {
    text,
    ...(answered !== undefined && { reply: replyTo(answered, to === undefined ? null : [context.who, ...to]) }),
    ...(style !== undefined && { style }),
    ...(spoken !== null && { speaker: spoken.speaker }),
    ...(spoken !== null && spoken.art !== null && { speakerArt: spoken.art }),
    ...(to !== undefined && { to }),
    ...(inline.length > 0 && { inline }),
  };
}

/** Whether a new text of a message keeps its rolls: the same rolled formulas in order, and buttons that roll. */
export function keepsRolls(before: string, after: string): boolean {
  const rolled = rolledFormulas(before);
  const now = rolledFormulas(after);
  if (rolled === null || now === null || rolled.length !== now.length || rolled.some((formula, i) => formula !== now[i])) return false;
  return (inlineMarks(after) ?? []).every((mark) => rollableFormula(mark.formula));
}

/** The roll button `index` of a message as its presser may roll it, or null where there is none there. */
export function rollButton(entry: Extract<GmLogEntry, { kind: 'chat' }>, index: number): RollRequest | null {
  const mark = inlineMarks(entry.text)?.[index];
  if (mark === undefined || mark.mode === null) return null;
  // A button in a note only the GM has is rolled for the GM alone.
  const to = entry.hidden === true ? [GM_AUTHOR] : audienceOf(entry);
  return { formula: mark.formula, mode: mark.mode, label: mark.label ?? mark.formula, ...(to !== null && { to }) };
}
