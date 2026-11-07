import { MAX_LOG_ENTRIES, type ChatEntry, type LogEntry, type PresenceEntry, type RollEntry } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { LogState, type ShownEntry } from '../../../../src/app/online/tableLog/index.ts';

const ME = 'abcdefghijklmnopqrst';
const MIRA = 'mmmmmmmmmmmmmmmmmmmm';
const id = (n: number): string => n.toString(16).padStart(24, '0');

const chat = (n: number, who: string, extra: Partial<ChatEntry> = {}): ChatEntry => ({ id: id(n), at: n * 1000, who, name: who === 'gm' ? 'GM' : 'Mira', kind: 'chat', text: `message ${n}`, ...extra });
const roll = (n: number, who: string): RollEntry => ({
  id: id(n), at: n * 1000, who, name: 'Mira', kind: 'roll', token: null,
  roll: { id: `r${n}`, timestamp: n * 1000, formula: '1d20', rolls: [{ die: 'd20', value: 7, max: 20 }], modifiers: 0, total: 7 },
});
const joined = (n: number, who: string): PresenceEntry => ({ id: id(n), at: n * 1000, who, name: 'Mira', kind: 'joined' });

function state(self: string | null = ME): LogState {
  return new LogState(() => self);
}

describe('the log a viewer holds', () => {
  it('starts empty and keeps entries in the order of the GM\'s clock, those of one moment as they arrive', () => {
    const log = state();
    expect(log.snapshot()).toEqual({ entries: [], unread: 0, refusal: null, people: [] });
    log.receive({ t: 'log-entry', entry: chat(2, MIRA) });
    log.receive({ t: 'log-entry', entry: chat(3, 'gm') });
    log.receive({ t: 'log-entry', entry: { ...chat(4, MIRA), at: 3000 } });
    expect(log.snapshot().entries.map((entry) => entry.id)).toEqual([id(2), id(3), id(4)]);
  });

  it('puts a changed entry it was never sent where it belongs, as no news', () => {
    const log = state();
    log.receive({ t: 'log', entries: [chat(5, MIRA), chat(6, MIRA)] });
    // The log was cut to fit; now someone reacts to an older message the GM still holds.
    log.receive({ t: 'log-entry', entry: chat(2, MIRA, { reactions: [{ emoji: '👍', by: ['gm'] }] }) });
    expect(log.snapshot().entries.map((entry) => entry.id)).toEqual([id(2), id(5), id(6)]);
    expect(log.snapshot().unread).toBe(0);
  });

  it('lets answers quote a message\'s new text, and nothing once it was deleted', () => {
    const log = state();
    const reply = { id: id(1), who: MIRA, name: 'Mira', preview: 'message 1' };
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, 'gm', { reply }), chat(3, ME, { reply }), chat(4, MIRA)] });
    const untouched = log.snapshot().entries[3];
    log.receive({ t: 'log-entry', entry: chat(1, MIRA, { text: 'a new\ntext', edited: 9000 }) });
    expect(log.snapshot().entries.slice(1, 3).map((entry) => (entry.kind === 'chat' ? entry.reply : null))).toEqual([{ ...reply, preview: 'a new text' }, { ...reply, preview: 'a new text' }]);
    expect(log.snapshot().entries[3]).toBe(untouched);
    // A reaction changes no text: the answers stay the objects they were.
    const answers = log.snapshot().entries.slice(1, 3);
    log.receive({ t: 'log-entry', entry: chat(1, MIRA, { text: 'a new\ntext', edited: 9000, reactions: [{ emoji: '👍', by: [ME] }] }) });
    expect(log.snapshot().entries.slice(1, 3)).toEqual(answers);
    expect(log.snapshot().entries[1]).toBe(answers[0]);
    log.receive({ t: 'log-remove', id: id(1) });
    expect(log.snapshot().entries.slice(0, 2).map((entry) => (entry.kind === 'chat' ? entry.reply : null))).toEqual([{ id: id(1), who: MIRA, name: 'Mira', preview: '', gone: true }, { id: id(1), who: MIRA, name: 'Mira', preview: '', gone: true }]);
  });

  it('keeps what was typed and not sent', () => {
    const log = state();
    expect(log.draft).toBe('');
    log.keepDraft('half a sen');
    log.setOpen(false);
    expect(log.draft).toBe('half a sen');
  });

  it('replaces an entry by its id in its place, and appends one it does not hold', () => {
    const log = state();
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, 'gm'), chat(3, MIRA)] });
    log.receive({ t: 'log-entry', entry: chat(2, 'gm', { text: 'changed', edited: 9000 }) });
    const { entries } = log.snapshot();
    expect(entries.map((entry) => entry.id)).toEqual([id(1), id(2), id(3)]);
    expect(entries[1]).toMatchObject({ text: 'changed', edited: 9000 });
  });

  it('removes an entry, and takes the removal of one it does not hold for nothing', () => {
    const log = state();
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, MIRA)] });
    log.receive({ t: 'log-remove', id: id(1) });
    expect(log.snapshot().entries.map((entry) => entry.id)).toEqual([id(2)]);
    const before = log.snapshot();
    log.receive({ t: 'log-remove', id: id(7) });
    expect(log.snapshot()).toBe(before);
  });

  it('replaces everything with a whole log, an empty one too', () => {
    const log = state();
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, MIRA)] });
    log.receive({ t: 'log', entries: [chat(5, MIRA)] });
    expect(log.snapshot().entries.map((entry) => entry.id)).toEqual([id(5)]);
    log.receive({ t: 'log', entries: [] });
    expect(log.snapshot().entries).toEqual([]);
  });

  it('holds the newest entries only', () => {
    const log = state();
    const many: LogEntry[] = Array.from({ length: MAX_LOG_ENTRIES + 5 }, (_, n) => chat(n + 1, MIRA));
    log.receive({ t: 'log', entries: many });
    expect(log.snapshot().entries).toHaveLength(MAX_LOG_ENTRIES);
    expect(log.snapshot().entries[0]?.id).toBe(id(6));
    log.receive({ t: 'log-entry', entry: chat(900, MIRA) });
    expect(log.snapshot().entries).toHaveLength(MAX_LOG_ENTRIES);
    expect(log.snapshot().entries[0]?.id).toBe(id(7));
    expect(log.snapshot().entries.at(-1)?.id).toBe(id(900));
  });

  it('keeps what only this viewer has', () => {
    const log = state('gm');
    const hidden: ShownEntry = { ...roll(1, 'gm'), hidden: true };
    log.replace([hidden, chat(2, MIRA)]);
    expect(log.snapshot().entries[0]).toBe(hidden);
  });

  it('hands out the same object while nothing changed, and tells its listeners of every change', () => {
    const log = state();
    let calls = 0;
    const stop = log.subscribe(() => { calls += 1; });
    const first = log.snapshot();
    expect(log.snapshot()).toBe(first);
    log.setOpen(false);
    expect(log.snapshot()).toBe(first);
    expect(calls).toBe(0);
    log.receive({ t: 'log-entry', entry: chat(1, MIRA) });
    expect(calls).toBe(1);
    expect(log.snapshot()).not.toBe(first);
    const held = log.snapshot();
    log.replace(held.entries);
    expect(log.snapshot()).toBe(held);
    stop();
    log.receive({ t: 'log-entry', entry: chat(2, MIRA) });
    expect(calls).toBe(1);
  });
});

describe('unread entries', () => {
  it('are the messages and rolls of others that arrive while the panel is closed', () => {
    const log = state();
    log.receive({ t: 'log-entry', entry: chat(1, MIRA) });
    log.receive({ t: 'log-entry', entry: roll(2, 'gm') });
    expect(log.snapshot().unread).toBe(2);
    log.receive({ t: 'log-entry', entry: chat(3, ME) });
    log.receive({ t: 'log-entry', entry: roll(4, ME) });
    log.receive({ t: 'log-entry', entry: joined(5, MIRA) });
    expect(log.snapshot().unread).toBe(2);
  });

  it('do not grow when an entry changes', () => {
    const log = state();
    log.receive({ t: 'log-entry', entry: chat(1, MIRA) });
    log.receive({ t: 'log-entry', entry: chat(1, MIRA, { text: 'changed', edited: 5000 }) });
    log.receive({ t: 'log-entry', entry: chat(1, MIRA, { reactions: [{ emoji: '👍', by: ['gm'] }] }) });
    expect(log.snapshot().unread).toBe(1);
  });

  it('are none while the panel is open, and none once it opens', () => {
    const log = state();
    log.receive({ t: 'log-entry', entry: chat(1, MIRA) });
    log.setOpen(true);
    expect(log.snapshot().unread).toBe(0);
    log.receive({ t: 'log-entry', entry: chat(2, MIRA) });
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, MIRA), chat(3, MIRA)] });
    expect(log.snapshot().unread).toBe(0);
    log.setOpen(false);
    expect(log.snapshot().unread).toBe(0);
    log.receive({ t: 'log-entry', entry: chat(4, MIRA) });
    expect(log.snapshot().unread).toBe(1);
  });

  it('count everyone while the viewer is not known', () => {
    const log = state(null);
    log.receive({ t: 'log-entry', entry: chat(1, ME) });
    expect(log.snapshot().unread).toBe(1);
  });

  it('read who the viewer is when an entry arrives', () => {
    let self: string | null = null;
    const log = new LogState(() => self);
    self = ME;
    log.receive({ t: 'log-entry', entry: chat(1, ME) });
    expect(log.snapshot().unread).toBe(0);
  });

  it('are none in the first whole log, whatever it holds', () => {
    const log = state();
    log.receive({ t: 'log', entries: [chat(1, MIRA), roll(2, 'gm'), chat(3, MIRA)] });
    expect(log.snapshot().unread).toBe(0);
  });

  it('keep in the first whole log only what single entries brought before', () => {
    const log = state();
    log.receive({ t: 'log-entry', entry: chat(3, MIRA) });
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, MIRA), chat(3, MIRA), chat(4, MIRA)] });
    expect(log.snapshot().unread).toBe(1);
  });

  it('count of a log sent again only what is new and later than all that was held', () => {
    const log = state();
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, MIRA)] });
    log.receive({ t: 'log-entry', entry: chat(3, MIRA) });
    expect(log.snapshot().unread).toBe(1);
    // The same log again: nothing new. Then with two later entries, one the viewer's own.
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, MIRA), chat(3, MIRA)] });
    expect(log.snapshot().unread).toBe(1);
    log.receive({ t: 'log', entries: [chat(1, MIRA), chat(2, MIRA), chat(3, MIRA), roll(4, 'gm'), chat(5, ME)] });
    expect(log.snapshot().unread).toBe(2);
  });

  it('never count an entry of a log sent again that is earlier than what was held', () => {
    const log = state();
    log.receive({ t: 'log', entries: [chat(5, MIRA)] });
    log.receive({ t: 'log', entries: [chat(2, MIRA), { ...chat(4, MIRA), at: 4999 }, chat(5, MIRA)] });
    expect(log.snapshot().unread).toBe(0);
  });

  it('count a new entry of the very moment of the newest one held', () => {
    const log = state('gm');
    log.replace([chat(5, MIRA)]);
    log.replace([chat(5, MIRA), { ...chat(6, MIRA), at: 5000 }]);
    expect(log.snapshot().unread).toBe(1);
  });

  it('count what a log brings after an empty one', () => {
    const log = state('gm');
    log.replace([]);
    log.replace([chat(1, MIRA)]);
    expect(log.snapshot().unread).toBe(1);
    log.replace([chat(1, MIRA), { ...roll(2, 'gm'), hidden: true }, chat(3, MIRA)]);
    expect(log.snapshot().unread).toBe(2);
  });

  it('leave with their entry', () => {
    const log = state();
    log.receive({ t: 'log-entry', entry: chat(1, MIRA) });
    log.receive({ t: 'log-entry', entry: chat(2, MIRA) });
    log.receive({ t: 'log-remove', id: id(1) });
    expect(log.snapshot().unread).toBe(1);
    log.receive({ t: 'log', entries: [] });
    expect(log.snapshot().unread).toBe(0);
  });
});

describe('refusals', () => {
  it('are counted, so the same reason twice is seen twice', () => {
    const log = state();
    log.receive({ t: 'chat-refused', reason: 'rate' });
    const first = log.snapshot();
    expect(first.refusal).toEqual({ reason: 'rate', n: 1 });
    log.receive({ t: 'chat-refused', reason: 'rate' });
    expect(log.snapshot().refusal).toEqual({ reason: 'rate', n: 2 });
    expect(log.snapshot()).not.toBe(first);
    log.receive({ t: 'chat-refused', reason: 'gone' });
    expect(log.snapshot().refusal).toEqual({ reason: 'gone', n: 3 });
  });

  it('change neither the entries nor what is unread', () => {
    const log = state();
    log.receive({ t: 'log-entry', entry: chat(1, MIRA) });
    const { entries } = log.snapshot();
    log.receive({ t: 'chat-refused', reason: 'text' });
    expect(log.snapshot().entries).toBe(entries);
    expect(log.snapshot().unread).toBe(1);
  });
});

describe('who is at the table', () => {
  const people = [{ id: MIRA, name: 'Mira' }];

  it('comes with the GM\'s message, and from the GM\'s side directly', () => {
    const log = state();
    let heard = 0;
    log.subscribe(() => { heard += 1; });
    const entries = log.snapshot().entries;
    log.receive({ t: 'people', people });
    expect(log.snapshot().people).toBe(people);
    expect(log.snapshot().entries).toBe(entries);
    log.setPeople([]);
    expect(log.snapshot().people).toEqual([]);
    expect(heard).toBe(2);
  });

  it('tells nobody when the same list is set again', () => {
    const log = state();
    log.setPeople(people);
    const before = log.snapshot();
    log.setPeople(people);
    expect(log.snapshot()).toBe(before);
  });
});

describe('what the viewer chose in the composer', () => {
  it('starts public, as oneself, to everyone', () => {
    expect(state().choices()).toEqual({ rollMode: 'public', speaker: null, whisperTo: null });
  });

  it('is kept while the panel is closed, and tells its listeners of each change', () => {
    const log = state();
    let heard = 0;
    log.subscribe(() => { heard += 1; });
    log.setRollMode('blind');
    log.setSpeaker('token-1');
    log.setWhisperTo([MIRA, 'gm']);
    log.setOpen(false);
    expect(log.choices()).toEqual({ rollMode: 'blind', speaker: 'token-1', whisperTo: [MIRA, 'gm'] });
    expect(heard).toBe(3);
    const before = log.choices();
    log.setRollMode('blind');
    expect(log.choices()).toBe(before);
    expect(heard).toBe(3);
  });

  it('takes an empty audience for none', () => {
    const log = state();
    log.setWhisperTo([MIRA]);
    log.setWhisperTo([]);
    expect(log.choices().whisperTo).toBeNull();
  });

  it('leaves the log\'s snapshot as it was', () => {
    const log = state();
    const before = log.snapshot();
    log.setRollMode('gm');
    expect(log.snapshot()).toBe(before);
  });
});

describe('private rolls', () => {
  const secret = (n: number, who: string): LogEntry => ({ id: id(n), at: n * 1000, who, name: 'Mira', kind: 'secret', mode: 'gm' });

  it('count as unread like rolls, unless they are the viewer\'s own', () => {
    const log = state();
    log.replace([]);
    log.receive({ t: 'log-entry', entry: secret(1, MIRA) });
    log.receive({ t: 'log-entry', entry: secret(2, ME) });
    expect(log.snapshot().unread).toBe(1);
  });
});
