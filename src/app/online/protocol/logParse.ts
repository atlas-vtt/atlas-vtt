import { GM_AUTHOR, inlineMarks, isAuthor, MAX_FLAVOR, parseAudience, parsePeople, parseSpeaker, shownLine, type ChatStyle, type LogSpeaker } from './chat.ts';
import { parseSharedRoll, type SharedRoll } from './dice.ts';
import {
  chatText, isLogId, isLogReaction, isTime, LOG_REACTIONS, LOG_REFUSALS, MAX_LOG_ENTRIES, MAX_REPLY_PREVIEW, MAX_REST_CHANGES, MAX_REST_ROLL, MAX_REST_TEXT,
  type ChatRefusal, type LogEntry, type LogMessage, type LogReaction, type LogReply, type PlayerChat, type PlayerLogMessage, type RestChange, type RollRequestRef,
} from './log.ts';
import { MAX_REST_PICKS } from './bookRest.ts';
import { parseFoundNote, parseLootCard, parseShownImageRef } from './logShown.ts';
import { MAX_PLAYERS, playerName, UNSEEN, UNSHOWN } from './relay.ts';
import { isRecord } from './shape.ts';
import { TOKEN_ID_PATTERN } from './tokens.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

function parseReactions(value: unknown): readonly LogReaction[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > LOG_REACTIONS.length) return null;
  const seen = new Set<string>();
  const reactions: LogReaction[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isLogReaction(item.emoji) || seen.has(item.emoji)) return null;
    const { by } = item;
    if (!Array.isArray(by) || by.length === 0 || by.length > MAX_PLAYERS + 1 || !by.every(isAuthor) || new Set(by).size !== by.length) return null;
    seen.add(item.emoji);
    reactions.push({ emoji: item.emoji, by });
  }
  return reactions.length === 0 ? undefined : reactions;
}

function parseReply(value: unknown): LogReply | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isLogId(value.id) || !isAuthor(value.who)) return null;
  const name = playerName(value.name);
  if (name === null || typeof value.preview !== 'string' || [...value.preview].length > MAX_REPLY_PREVIEW) return null;
  if (value.gone !== undefined && value.gone !== true) return null;
  const preview = value.preview.replace(UNSHOWN, ' ').replace(UNSEEN, '');
  return { id: value.id, who: value.who, name, preview, ...(value.gone === true && { gone: true as const }) };
}

/** An optional field: undefined where it is absent, null where it is there and malformed. */
function optional<T>(value: unknown, parse: (value: unknown) => T | null): T | null | undefined {
  return value === undefined ? undefined : parse(value);
}

const parseStyle = (value: unknown): ChatStyle | null => (value === 'ic' || value === 'emote' ? value : null);
const parsePrivateMode = (value: unknown): 'gm' | 'blind' | 'self' | null => (value === 'gm' || value === 'blind' || value === 'self' ? value : null);
/** A line taken only as it is shown: one the sender had not cleaned is refused. */
const exactLine = (value: unknown, max: number): string | null => {
  const line = shownLine(value, max);
  return line !== null && line === value ? line : null;
};
const parseFlavor = (value: unknown): string | null => exactLine(value, MAX_FLAVOR);

function parseRequestRef(value: unknown): RollRequestRef | null {
  if (!isRecord(value) || !isLogId(value.id)) return null;
  const label = parseFlavor(value.label);
  return label === null ? null : { id: value.id, label };
}

function parseInlineRolls(value: unknown): readonly SharedRoll[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rolls = value.map(parseSharedRoll);
  return rolls.every((roll) => roll !== null) ? rolls : null;
}

/** The fields a speaking entry may carry; null when one is malformed. */
function speakerField(value: Record<string, unknown>): { readonly speaker?: LogSpeaker } | null {
  const speaker = optional(value.speaker, parseSpeaker);
  return speaker === null ? null : speaker === undefined ? {} : { speaker };
}

function parseChatEntry(value: Record<string, unknown>, base: Pick<LogEntry, 'id' | 'at' | 'who' | 'name'>, reactions: readonly LogReaction[] | undefined): LogEntry | null {
  const text = chatText(value.text);
  const reply = parseReply(value.reply);
  if (text === null || text !== value.text || reply === null) return null;
  if (value.edited !== undefined && !isTime(value.edited)) return null;
  const style = optional(value.style, parseStyle);
  const to = optional(value.to, parseAudience);
  const inline = optional(value.inline, parseInlineRolls);
  const speaker = speakerField(value);
  const marks = inlineMarks(text);
  if (style === null || to === null || inline === null || speaker === null || marks === null) return null;
  // The rolls a text rolled are its marks without a command, one result each.
  if ((inline?.length ?? 0) !== marks.filter((mark) => mark.mode === null).length) return null;
  return {
    ...base, kind: 'chat', text, ...speaker,
    ...(reply !== undefined && { reply }),
    ...(value.edited !== undefined && { edited: value.edited }),
    ...(reactions !== undefined && { reactions }),
    ...(style !== undefined && { style }),
    ...(to !== undefined && { to }),
    ...(inline !== undefined && { inline }),
  };
}

function parseRollEntry(value: Record<string, unknown>, base: Pick<LogEntry, 'id' | 'at' | 'who' | 'name'>, reactions: readonly LogReaction[] | undefined): LogEntry | null {
  const roll = parseSharedRoll(value.roll);
  if (roll === null || (value.token !== null && (typeof value.token !== 'string' || !TOKEN_ID_PATTERN.test(value.token)))) return null;
  const mode = optional(value.mode, parsePrivateMode);
  const to = optional(value.to, parseAudience);
  const flavor = optional(value.flavor, parseFlavor);
  const request = optional(value.request, parseRequestRef);
  const speaker = speakerField(value);
  if (mode === null || to === null || flavor === null || request === null || speaker === null || (mode === undefined) !== (to === undefined)) return null;
  return {
    ...base, kind: 'roll', roll, token: value.token, ...speaker,
    ...(reactions !== undefined && { reactions }),
    ...(mode !== undefined && to !== undefined && { mode, to }),
    ...(flavor !== undefined && { flavor }),
    ...(request !== undefined && { request }),
  };
}

const isRestValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE;

function parseRestChange(value: unknown): RestChange | null {
  if (!isRecord(value) || !isRestValue(value.from) || !isRestValue(value.to)) return null;
  const label = exactLine(value.label, MAX_REST_TEXT);
  const roll = optional(value.roll, (held) => exactLine(held, MAX_REST_ROLL));
  const character = optional(value.character, (held) => exactLine(held, MAX_REST_TEXT));
  if (label === null || roll === null || character === null) return null;
  return { label, from: value.from, to: value.to, ...(roll !== undefined && { roll }), ...(character !== undefined && { character }) };
}

function parseRestEntry(value: Record<string, unknown>, base: Pick<LogEntry, 'id' | 'at' | 'who' | 'name'>, reactions: readonly LogReaction[] | undefined): LogEntry | null {
  // A rest is the GM's to apply, and so to log.
  if (value.who !== GM_AUTHOR) return null;
  const character = exactLine(value.character, MAX_REST_TEXT);
  const button = exactLine(value.button, MAX_REST_TEXT);
  // Without changes the entry is for someone who may not see what the rest changed.
  const changes = optional(value.changes, (list) => (Array.isArray(list) && list.length <= MAX_REST_CHANGES ? list.map(parseRestChange) : null));
  const skipped = optional(value.skipped, (list) => (Array.isArray(list) && list.length > 0 && list.length <= MAX_REST_CHANGES ? list.map((label) => exactLine(label, MAX_REST_TEXT)) : null));
  const picks = optional(value.picks, (list) => (Array.isArray(list) && list.length > 0 && list.length <= MAX_REST_PICKS ? list.map((name) => exactLine(name, MAX_REST_TEXT)) : null));
  if (character === null || button === null || changes === null || changes?.some((change) => change === null) || skipped === null || skipped?.some((label) => label === null)) return null;
  if (picks === null || picks?.some((name) => name === null)) return null;
  return {
    ...base, kind: 'rest', character, button,
    ...(picks !== undefined && { picks: picks as string[] }),
    ...(changes !== undefined && { changes: changes as RestChange[] }),
    ...(skipped !== undefined && { skipped: skipped as string[] }),
    ...(reactions !== undefined && { reactions }),
  };
}

/** A log entry as the client reads it, or null for anything malformed: nothing else reaches the panel. */
export function parseLogEntry(value: unknown): LogEntry | null {
  if (!isRecord(value) || !isLogId(value.id) || !isTime(value.at) || !isAuthor(value.who)) return null;
  const name = playerName(value.name);
  if (name === null) return null;
  const base = { id: value.id, at: value.at, who: value.who, name };
  if (value.kind === 'joined' || value.kind === 'left') return value.who === GM_AUTHOR ? null : { ...base, kind: value.kind };
  if (value.kind === 'secret') {
    const mode = parsePrivateMode(value.mode);
    const speaker = speakerField(value);
    return mode === null || speaker === null ? null : { ...base, kind: 'secret', mode, ...speaker };
  }
  const reactions = parseReactions(value.reactions);
  if (reactions === null) return null;
  if (value.kind === 'roll') return parseRollEntry(value, base, reactions);
  if (value.kind === 'rest') return parseRestEntry(value, base, reactions);
  // What the GM showed or handed out is the GM's alone to log.
  if ((value.kind === 'image' || value.kind === 'loot') && value.who !== GM_AUTHOR) return null;
  if (value.kind === 'image') {
    const shown = parseShownImageRef(value);
    return shown === null ? null : { ...base, kind: 'image', ...shown, ...(reactions !== undefined && { reactions }) };
  }
  if (value.kind === 'loot') {
    const item = parseLootCard(value.item);
    return item === null ? null : { ...base, kind: 'loot', item, ...(reactions !== undefined && { reactions }) };
  }
  if (value.kind === 'found') {
    // A pin is found by a player at the table, never by the GM.
    const note = value.who === GM_AUTHOR ? null : parseFoundNote(value);
    return note === null ? null : { ...base, kind: 'found', ...note, ...(reactions !== undefined && { reactions }) };
  }
  return value.kind === 'chat' ? parseChatEntry(value, base, reactions) : null;
}

/** A message about the log as the client reads it, or null for anything malformed. */
export function parseLogMessage(value: Record<string, unknown>): LogMessage | null {
  switch (value.t) {
    case 'log': {
      if (!Array.isArray(value.entries) || value.entries.length > MAX_LOG_ENTRIES) return null;
      // An entry this client cannot read (a newer GM's, a character its tables do not know) is left out: the rest of the log still shows.
      return { t: 'log', entries: value.entries.map(parseLogEntry).filter((entry) => entry !== null) };
    }
    case 'log-entry': {
      const entry = parseLogEntry(value.entry);
      return entry === null ? null : { t: 'log-entry', entry };
    }
    case 'log-remove':
      return isLogId(value.id) ? { t: 'log-remove', id: value.id } : null;
    case 'chat-refused':
      return typeof value.reason === 'string' && LOG_REFUSALS.includes(value.reason) ? { t: 'chat-refused', reason: value.reason as ChatRefusal } : null;
    case 'people': {
      const people = parsePeople(value.people);
      return people === null ? null : { t: 'people', people };
    }
    default:
      return null;
  }
}

/** Whether a player message's type is one of the log's. */
export function isPlayerLogType(t: unknown): t is PlayerLogMessage['t'] {
  return t === 'chat' || t === 'chat-edit' || t === 'chat-delete' || t === 'react';
}

function parsePlayerChat(value: Record<string, unknown>): PlayerChat | null {
  const text = chatText(value.text);
  const style = optional(value.style, parseStyle);
  const to = optional(value.to, parseAudience);
  const speaker = optional(value.speaker, (alias) => (typeof alias === 'string' && TOKEN_ID_PATTERN.test(alias) ? alias : null));
  if (text === null || style === null || to === null || speaker === null || (value.reply !== undefined && !isLogId(value.reply))) return null;
  return {
    t: 'chat', text,
    ...(value.reply !== undefined && { reply: value.reply }),
    ...(style !== undefined && { style }),
    ...(speaker !== undefined && { speaker }),
    ...(to !== undefined && { to }),
  };
}

/**
 * What a player sent to the log as the GM reads it, or null for anything malformed. A text is taken
 * as cleaned (`chatText`): the GM never shows or sends on what a player typed as it came.
 */
export function parsePlayerLog(value: Record<string, unknown>): PlayerLogMessage | null {
  if (value.t === 'chat') return parsePlayerChat(value);
  if (!isLogId(value.id)) return null;
  if (value.t === 'chat-delete') return { t: 'chat-delete', id: value.id };
  if (value.t === 'chat-edit') {
    const text = chatText(value.text);
    return text === null ? null : { t: 'chat-edit', id: value.id, text };
  }
  if (value.t === 'react') return isLogReaction(value.emoji) && typeof value.on === 'boolean' ? { t: 'react', id: value.id, emoji: value.emoji, on: value.on } : null;
  return null;
}
