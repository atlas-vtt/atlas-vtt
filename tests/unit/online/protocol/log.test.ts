import { describe, expect, it } from 'vitest';
import { chatText, inlineMarks, MAX_CHAT_LINES, MAX_CHAT_TEXT, MAX_LOG_ENTRIES, MAX_REPLY_PREVIEW, parseGmMessage, parseLogEntry, parseLogMessage, parsePlayerLog, parsePlayerMessage, quoting, replyPreview, rolledFormulas, type ChatEntry, type LogEntry, type SharedRoll } from '../../../../src/app/online/protocol/index.ts';

const ID = '0123456789abcdef01234567';
const OTHER = 'fedcba9876543210fedcba98';
const PLAYER = 'abcdefghijklmnopqrst';
const ALIAS = 'a1'.repeat(12);
const ROLL: SharedRoll = { id: 'roll_1', timestamp: 1_700_000_000_000, formula: '1d20 + 2', modifiers: 2, total: 22, crit: 'high', rolls: [{ die: 'd20', value: 20, max: 20 }] };
const CHAT: ChatEntry = { id: ID, at: 1_700_000_000_000, who: PLAYER, name: 'Mira', kind: 'chat', text: 'I check the door.' };

describe('chat text', () => {
  it('keeps letters, emoji and line breaks, and collapses white space', () => {
    expect(chatText('  Hello   there \r\n  second\tline  ')).toBe('Hello there\nsecond line');
    expect(chatText('Grüße 👩\u200d👩\u200d👧 مرحبا')).toBe('Grüße 👩\u200d👩\u200d👧 مرحبا');
  });

  it('removes controls, direction overrides and unseen characters', () => {
    expect(chatText('a\u0000b\u202ec\u200bd\u2066e')).toBe('a b cd e');
  });

  it('keeps at most one blank line in a row and none at the ends', () => {
    expect(chatText('\n\none\n\n\n\ntwo\n\n')).toBe('one\n\ntwo');
  });

  it('joins lines past the limit to the last one', () => {
    const lines = Array.from({ length: MAX_CHAT_LINES + 3 }, (_, index) => `line ${index}`);
    const text = chatText(lines.join('\n'));
    expect(text?.split('\n')).toHaveLength(MAX_CHAT_LINES);
    expect(text?.endsWith(`line ${MAX_CHAT_LINES - 1} line ${MAX_CHAT_LINES} line ${MAX_CHAT_LINES + 1} line ${MAX_CHAT_LINES + 2}`)).toBe(true);
  });

  it('refuses nothing that shows, too much and what is no string', () => {
    for (const value of ['', '   ', '\n\n', '\u200b\u2060', '\u3164', 'x'.repeat(MAX_CHAT_TEXT + 1), 7, null, ['hi']]) expect(chatText(value), JSON.stringify(value)).toBeNull();
    expect(chatText('x'.repeat(MAX_CHAT_TEXT))).toHaveLength(MAX_CHAT_TEXT);
    // Characters, not UTF-16 units.
    expect(chatText('🎲'.repeat(MAX_CHAT_TEXT))).not.toBeNull();
  });
});

describe('reply previews', () => {
  it('are one line of at most the limit', () => {
    expect(replyPreview('one\ntwo')).toBe('one two');
    const long = replyPreview('🎲'.repeat(MAX_REPLY_PREVIEW + 5));
    expect([...long]).toHaveLength(MAX_REPLY_PREVIEW);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('what a reply quotes once its original changed', () => {
  it('is the new text, or nothing with the word that it is gone', () => {
    const reply = { id: OTHER, who: 'gm', name: 'GM', preview: 'old' };
    expect(quoting(reply, 'new\ntext')).toEqual({ ...reply, preview: 'new text' });
    expect(quoting({ ...reply, preview: '', gone: true }, 'back')).toEqual({ ...reply, preview: 'back' });
    expect(quoting(reply, null)).toEqual({ ...reply, preview: '', gone: true });
    expect(parseLogEntry({ ...CHAT, reply: quoting(reply, null) })).not.toBeNull();
  });
});

describe('log entries', () => {
  it('read a chat message with a reply, an edit time and reactions', () => {
    const entry: LogEntry = {
      ...CHAT, edited: 1_700_000_005_000,
      reply: { id: OTHER, who: 'gm', name: 'GM', preview: 'The door is locked.' },
      reactions: [{ emoji: '👍', by: ['gm', PLAYER] }, { emoji: '😂', by: [PLAYER] }],
    };
    expect(parseLogEntry(entry)).toEqual(entry);
    expect(parseLogEntry({ ...CHAT, reply: { id: OTHER, who: PLAYER, name: 'Mira', preview: '', gone: true } })).toEqual({ ...CHAT, reply: { id: OTHER, who: PLAYER, name: 'Mira', preview: '', gone: true } });
  });

  it('read a roll with or without a token, and who came and went', () => {
    const roll: LogEntry = { id: ID, at: 5, who: 'gm', name: 'GM', kind: 'roll', roll: ROLL, token: ALIAS };
    expect(parseLogEntry(roll)).toEqual(roll);
    expect(parseLogEntry({ ...roll, token: null })).toEqual({ ...roll, token: null });
    expect(parseLogEntry({ id: ID, at: 5, who: PLAYER, name: 'Mira', kind: 'joined' })).toEqual({ id: ID, at: 5, who: PLAYER, name: 'Mira', kind: 'joined' });
    expect(parseLogEntry({ id: ID, at: 5, who: PLAYER, name: 'Mira', kind: 'left', text: 'x', reactions: [] })).toEqual({ id: ID, at: 5, who: PLAYER, name: 'Mira', kind: 'left' });
  });

  it('drop empty reaction lists and fields no client is meant to read', () => {
    expect(parseLogEntry({ ...CHAT, reactions: [], hidden: true, source: { tokenId: 'gm-id' } })).toEqual(CHAT);
  });

  it('refuse anything malformed', () => {
    const bad: unknown[] = [
      null, [], 'chat',
      { ...CHAT, id: 'short' }, { ...CHAT, id: ID.toUpperCase() },
      { ...CHAT, at: -1 }, { ...CHAT, at: Number.NaN }, { ...CHAT, at: '5' },
      { ...CHAT, who: 'admin' }, { ...CHAT, who: PLAYER.slice(1) },
      { ...CHAT, name: '' }, { ...CHAT, name: 'x'.repeat(40) },
      { ...CHAT, kind: 'system' },
      { ...CHAT, text: '' }, { ...CHAT, text: ' padded ' }, { ...CHAT, text: 'a\u202eb' }, { ...CHAT, text: 'x'.repeat(MAX_CHAT_TEXT + 1) },
      { ...CHAT, edited: 'now' },
      { ...CHAT, reply: { id: 'x', who: 'gm', name: 'GM', preview: '' } },
      { ...CHAT, reply: { id: OTHER, who: 'gm', name: 'GM', preview: 'x'.repeat(MAX_REPLY_PREVIEW + 1) } },
      { ...CHAT, reply: { id: OTHER, who: 'gm', name: 'GM', preview: '', gone: false } },
      { ...CHAT, reactions: [{ emoji: '🍆', by: ['gm'] }] },
      { ...CHAT, reactions: [{ emoji: '👍', by: [] }] },
      { ...CHAT, reactions: [{ emoji: '👍', by: ['gm', 'gm'] }] },
      { ...CHAT, reactions: [{ emoji: '👍', by: ['nobody'] }] },
      { ...CHAT, reactions: [{ emoji: '👍', by: ['gm'] }, { emoji: '👍', by: [PLAYER] }] },
      { ...CHAT, reactions: 'none' },
      { id: ID, at: 5, who: 'gm', name: 'GM', kind: 'joined' },
      { id: ID, at: 5, who: 'gm', name: 'GM', kind: 'roll', roll: { ...ROLL, total: 'many' }, token: null },
      { id: ID, at: 5, who: 'gm', name: 'GM', kind: 'roll', roll: ROLL, token: 'gm-hero-id' },
      { id: ID, at: 5, who: 'gm', name: 'GM', kind: 'roll', roll: ROLL },
    ];
    for (const value of bad) expect(parseLogEntry(value), JSON.stringify(value)).toBeNull();
  });
});

describe('the GM\'s log messages', () => {
  it('read the whole log, one entry, a removal and a refusal', () => {
    expect(parseGmMessage({ t: 'log', entries: [CHAT] })).toEqual({ t: 'log', entries: [CHAT] });
    expect(parseGmMessage({ t: 'log', entries: [] })).toEqual({ t: 'log', entries: [] });
    expect(parseGmMessage({ t: 'log-entry', entry: CHAT })).toEqual({ t: 'log-entry', entry: CHAT });
    expect(parseGmMessage({ t: 'log-remove', id: ID })).toEqual({ t: 'log-remove', id: ID });
    for (const reason of ['rate', 'text', 'gone']) expect(parseGmMessage({ t: 'chat-refused', reason })).toEqual({ t: 'chat-refused', reason });
  });

  it('leave an entry they cannot read out of a log and keep the rest', () => {
    expect(parseGmMessage({ t: 'log', entries: [{ ...CHAT, id: 'x' }, CHAT, null, { ...CHAT, id: OTHER, reactions: [{ emoji: '👍', by: [] }] }] })).toEqual({ t: 'log', entries: [CHAT] });
  });

  it('refuse a log that is none or too long, a single bad entry, and unknown reasons', () => {
    expect(parseGmMessage({ t: 'log', entries: Array.from({ length: MAX_LOG_ENTRIES + 1 }, () => CHAT) })).toBeNull();
    expect(parseGmMessage({ t: 'log', entries: 'all' })).toBeNull();
    expect(parseGmMessage({ t: 'log-entry', entry: null })).toBeNull();
    expect(parseGmMessage({ t: 'log-remove', id: 7 })).toBeNull();
    expect(parseGmMessage({ t: 'chat-refused', reason: 'mood' })).toBeNull();
  });
});

describe('what a player sends to the log', () => {
  it('reads a message, cleaned, with or without the entry it answers', () => {
    expect(parsePlayerMessage({ t: 'chat', text: '  hi\u202e  there ' })).toEqual({ t: 'chat', text: 'hi there' });
    expect(parsePlayerMessage({ t: 'chat', text: 'hi', reply: ID })).toEqual({ t: 'chat', text: 'hi', reply: ID });
  });

  it('reads an edit, a deletion and a reaction', () => {
    expect(parsePlayerMessage({ t: 'chat-edit', id: ID, text: 'better' })).toEqual({ t: 'chat-edit', id: ID, text: 'better' });
    expect(parsePlayerMessage({ t: 'chat-delete', id: ID })).toEqual({ t: 'chat-delete', id: ID });
    expect(parsePlayerMessage({ t: 'react', id: ID, emoji: '❤️', on: true })).toEqual({ t: 'react', id: ID, emoji: '❤️', on: true });
    expect(parsePlayerMessage({ t: 'react', id: ID, emoji: '❤️', on: false })).toEqual({ t: 'react', id: ID, emoji: '❤️', on: false });
  });

  it('never takes an author, a name or a time from a player', () => {
    expect(parsePlayerMessage({ t: 'chat', text: 'hi', who: 'gm', name: 'GM', at: 1, id: ID })).toEqual({ t: 'chat', text: 'hi' });
  });

  it('refuses anything malformed', () => {
    for (const body of [
      { t: 'chat' }, { t: 'chat', text: '' }, { t: 'chat', text: 'x'.repeat(MAX_CHAT_TEXT + 1) }, { t: 'chat', text: 'hi', reply: 'that one' },
      { t: 'chat-edit', id: ID }, { t: 'chat-edit', id: 'x', text: 'hi' }, { t: 'chat-edit', id: ID, text: ' ' },
      { t: 'chat-delete' }, { t: 'chat-delete', id: 5 },
      { t: 'react', id: ID, emoji: '🍆', on: true }, { t: 'react', id: ID, emoji: '👍' }, { t: 'react', id: ID, emoji: '👍', on: 'yes' }, { t: 'react', id: 'x', emoji: '👍', on: true },
    ]) expect(parsePlayerMessage(body), JSON.stringify(body)).toBeNull();
  });
});

describe('the table chat\'s fields', () => {
  const ID = '0'.repeat(24);
  const MIRA = 'a'.repeat(20);
  const base = { id: ID, at: 1, who: 'gm', name: 'GM' };
  const ROLLED = { id: 'r1', timestamp: 1, formula: '1d20', modifiers: 0, total: 7, rolls: [{ die: 'd20', value: 7, max: 20 }] };
  const SPEAKER = { name: 'Goblin', token: null, art: { hash: 'f'.repeat(64), size: 3, mime: 'image/png' }, ring: '#ff0000' };

  it('reads whispers, speakers, styles and the rolls a text rolled', () => {
    const entry = { ...base, kind: 'chat', text: 'Hit [[1d20]] then [[/br 1d20+2]]{Perception}', style: 'ic', speaker: SPEAKER, to: [MIRA], inline: [ROLLED] };
    expect(parseLogEntry(entry)).toEqual(entry);
    expect(parseLogEntry({ ...entry, inline: [] })).toBeNull();
    expect(parseLogEntry({ ...entry, inline: [ROLLED, ROLLED] })).toBeNull();
    expect(parseLogEntry({ ...entry, to: [] })).toBeNull();
    expect(parseLogEntry({ ...entry, to: [MIRA, MIRA] })).toBeNull();
    expect(parseLogEntry({ ...entry, style: 'shout' })).toBeNull();
    expect(parseLogEntry({ ...entry, speaker: { ...SPEAKER, name: '‮' } })).toBeNull();
    expect(parseLogEntry({ ...entry, speaker: { ...SPEAKER, ring: 'red' } })).toBeNull();
  });

  it('reads private rolls whole or as the line that one was made', () => {
    const roll = { ...base, kind: 'roll', roll: ROLLED, token: null, mode: 'blind', to: ['gm'], flavor: 'Perception', request: { id: ID, label: 'Perception' } };
    expect(parseLogEntry(roll)).toEqual(roll);
    expect(parseLogEntry({ ...roll, to: undefined })).toBeNull();
    expect(parseLogEntry({ ...roll, mode: 'public' })).toBeNull();
    const secret = { ...base, kind: 'secret', mode: 'gm' };
    expect(parseLogEntry(secret)).toEqual(secret);
    expect(parseLogEntry({ ...secret, mode: 'loud' })).toBeNull();
  });

  it('reads who is at the table', () => {
    expect(parseLogMessage({ t: 'people', people: [{ id: MIRA, name: ' Mira ' }] })).toEqual({ t: 'people', people: [{ id: MIRA, name: 'Mira' }] });
    expect(parseLogMessage({ t: 'people', people: [{ id: 'gm', name: 'GM' }] })).toBeNull();
  });

  it('reads what a player says: a whisper, a style and a token of theirs', () => {
    expect(parsePlayerLog({ t: 'chat', text: 'hi', to: ['gm'], style: 'emote', speaker: ID })).toEqual({ t: 'chat', text: 'hi', to: ['gm'], style: 'emote', speaker: ID });
    expect(parsePlayerLog({ t: 'chat', text: 'hi', speaker: 'gm-token' })).toBeNull();
    expect(parsePlayerLog({ t: 'chat', text: 'hi', to: 'gm' })).toBeNull();
  });
});

describe('rolls written into a text', () => {
  it('are found in order, rolled or as buttons with a mode and a label', () => {
    expect(inlineMarks('a [[1d20+5]] b [[/gmr 2d6]]{Damage} [[/BR d20]]')?.map(({ formula, mode, label }) => [formula, mode, label]))
      .toEqual([['1d20+5', null, null], ['2d6', 'gm', 'Damage'], ['d20', 'blind', null]]);
    expect(inlineMarks('no rolls [ [1d6] ]')).toEqual([]);
    expect(inlineMarks('[[/shout 1d6]]')).toBeNull();
    expect(inlineMarks('[[1d4]]'.repeat(6))).toBeNull();
    expect(rolledFormulas('[[1d4]] [[/r 1d6]] [[2d8]]')).toEqual(['1d4', '2d8']);
    expect(inlineMarks('hit for [[1d8+3[piercing]]] and [[/r 2d6[fire] + 1]]{Burn}')?.map(({ formula, label }) => [formula, label])).toEqual([['1d8+3[piercing]', null], ['2d6[fire] + 1', 'Burn']]);
  });
});
