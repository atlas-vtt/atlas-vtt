import type { ChatEntry, LogEntry, RollEntry } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { AUTHOR_COLOURS, authorColour, authorTone, continuesPrevious, dayLabel, monogram, reactionsFor, relativeTime, sameDay, shownName } from '../../../../src/app/online/tableLog/index.ts';

const ME = 'abcdefghijklmnopqrst';
const MIRA = 'mmmmmmmmmmmmmmmmmmmm';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const chat = (who: string, at: number, extra: Partial<ChatEntry> = {}): ChatEntry => ({ id: 'a'.repeat(24), at, who, name: 'Mira', kind: 'chat', text: 'hello', ...extra });
const roll = (who: string, at: number, extra: Partial<RollEntry> = {}): RollEntry => ({
  id: 'b'.repeat(24), at, who, name: 'Mira', kind: 'roll', token: null,
  roll: { id: 'r1', timestamp: at, formula: '1d20', rolls: [{ die: 'd20', value: 7, max: 20 }], modifiers: 0, total: 7 }, ...extra,
});
const REPLY = { id: 'c'.repeat(24), who: 'gm', name: 'GM', preview: 'Roll for it' };

describe('rows that continue the one above', () => {
  it('are chat messages of one author within seven minutes', () => {
    expect(continuesPrevious(chat(MIRA, 0), chat(MIRA, 6 * MINUTE + 59_000))).toBe(true);
    expect(continuesPrevious(chat(MIRA, 0), chat(MIRA, 7 * MINUTE))).toBe(false);
    expect(continuesPrevious(chat(MIRA, 0), chat(ME, MINUTE))).toBe(false);
    expect(continuesPrevious(undefined, chat(MIRA, 0))).toBe(false);
  });

  it('are never replies, rolls or lines about who came, nor follow one', () => {
    expect(continuesPrevious(chat(MIRA, 0), chat(MIRA, MINUTE, { reply: REPLY }))).toBe(false);
    expect(continuesPrevious(chat(MIRA, 0, { reply: REPLY }), chat(MIRA, MINUTE))).toBe(true);
    expect(continuesPrevious(roll(MIRA, 0), chat(MIRA, MINUTE))).toBe(false);
    expect(continuesPrevious(chat(MIRA, 0), roll(MIRA, MINUTE))).toBe(false);
    const left: LogEntry = { id: 'd'.repeat(24), at: 0, who: MIRA, name: 'Mira', kind: 'left' };
    expect(continuesPrevious(left, chat(MIRA, MINUTE))).toBe(false);
  });
});

describe('times', () => {
  const now = new Date(2026, 9, 9, 21, 30).getTime();

  it('read as how long ago, then as a short date', () => {
    expect(relativeTime(now - 20_000, now)).toBe('just now');
    expect(relativeTime(now + 5000, now)).toBe('just now');
    expect(relativeTime(now - 5 * MINUTE - 30_000, now)).toBe('5m ago');
    expect(relativeTime(now - 59 * MINUTE, now)).toBe('59m ago');
    expect(relativeTime(now - 3 * HOUR - 10 * MINUTE, now)).toBe('3h ago');
    expect(relativeTime(now - 23 * HOUR, now)).toBe('23h ago');
    expect(relativeTime(new Date(2026, 9, 7, 12).getTime(), now, 'en-GB')).toBe('7 Oct');
    expect(relativeTime(new Date(2025, 11, 24, 12).getTime(), now, 'en-GB')).toBe('24 Dec 2025');
  });

  it('name the day for the line between two days', () => {
    expect(dayLabel(new Date(2026, 9, 9, 0, 1).getTime(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 8, 23, 59).getTime(), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 7, 23, 59).getTime(), now, 'en-GB')).toBe('7 Oct');
    expect(dayLabel(new Date(2025, 9, 9, 12).getTime(), now, 'en-GB')).toBe('9 Oct 2025');
    // The first of a month: yesterday is in the month before.
    expect(dayLabel(new Date(2026, 8, 30, 12).getTime(), new Date(2026, 9, 1, 0, 5).getTime())).toBe('Yesterday');
  });

  it('tell whether two moments share a day', () => {
    expect(sameDay(new Date(2026, 9, 9, 0, 0).getTime(), new Date(2026, 9, 9, 23, 59).getTime())).toBe(true);
    expect(sameDay(new Date(2026, 9, 9, 23, 59).getTime(), new Date(2026, 9, 10, 0, 0).getTime())).toBe(false);
  });
});

describe('reactions', () => {
  it('are counted per emoji, the viewer\'s own marked, in the order given', () => {
    const entry = chat(MIRA, 0, { reactions: [{ emoji: '❤️', by: ['gm', ME] }, { emoji: '👍', by: [MIRA] }] });
    expect(reactionsFor(entry, ME)).toEqual([{ emoji: '❤️', count: 2, mine: true }, { emoji: '👍', count: 1, mine: false }]);
    expect(reactionsFor(entry, 'gm')[0]).toEqual({ emoji: '❤️', count: 2, mine: true });
    expect(reactionsFor(entry, null).some((reaction) => reaction.mine)).toBe(false);
  });

  it('are there for rolls, and none where an entry has none or nobody gave one', () => {
    expect(reactionsFor(roll(MIRA, 0, { reactions: [{ emoji: '😮', by: [ME] }] }), ME)).toEqual([{ emoji: '😮', count: 1, mine: true }]);
    expect(reactionsFor(chat(MIRA, 0), ME)).toEqual([]);
    expect(reactionsFor(chat(MIRA, 0, { reactions: [{ emoji: '😢', by: [] }] }), ME)).toEqual([]);
    expect(reactionsFor({ id: 'd'.repeat(24), at: 0, who: MIRA, name: 'Mira', kind: 'joined' }, ME)).toEqual([]);
  });
});

describe('authors', () => {
  it('have a letter', () => {
    expect(monogram('mira')).toBe('M');
    expect(monogram('  élan ')).toBe('É');
    expect(monogram('😀 Joy')).toBe('😀');
    expect(monogram('   ')).toBe('?');
  });

  it('have a colour that never changes, the GM the accent', () => {
    expect(authorTone('gm')).toBe('gm');
    expect(authorColour('gm')).toBe('--interactive-accent');
    const tone = authorTone(MIRA);
    expect(authorTone(MIRA)).toBe(tone);
    expect(AUTHOR_COLOURS).toContain(authorColour(MIRA));
    const tones = new Set(Array.from({ length: 64 }, (_, n) => authorTone(String.fromCharCode(97 + (n % 26)).repeat(19) + String.fromCharCode(97 + ((n * 7) % 26)))));
    expect(tones.size).toBe(AUTHOR_COLOURS.length);
    for (const picked of tones) expect(typeof picked === 'number' && picked >= 0 && picked < AUTHOR_COLOURS.length).toBe(true);
  });

  it('are named as the viewer reads them', () => {
    expect(shownName(ME, 'Fabian', ME)).toBe('You');
    expect(shownName('gm', 'Game master', ME)).toBe('GM');
    expect(shownName('gm', 'Game master', 'gm')).toBe('You');
    expect(shownName(MIRA, 'Mira', ME)).toBe('Mira');
    expect(shownName(MIRA, 'Mira', null)).toBe('Mira');
  });
});
