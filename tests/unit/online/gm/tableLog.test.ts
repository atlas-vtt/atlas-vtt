import { MAX_LOG_ENTRIES, parseGmMessage, type GmMessage, type LogEntry, type SharedRoll } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { entriesWithin, type GmLogEntry } from '../../../../src/app/online/gm/log/logEntries.ts';
import { CHAT_BURST, LEAVE_GRACE_MS, LOG_SNAPSHOT_BYTES, REACT_BURST, REFUSAL_BURST, TableLog } from '../../../../src/app/online/gm/log/TableLog.ts';

const MIRA = 'a'.repeat(20);
const TOM = 'b'.repeat(20);
const STRANGER = 'c'.repeat(20);
const ROLL: SharedRoll = { id: 'roll_1', timestamp: 1, formula: '1d20', modifiers: 0, total: 14, rolls: [{ die: 'd20', value: 14, max: 20 }] };

interface Sent {
  readonly body: GmMessage;
  readonly to: string | undefined;
}

/** A log with a fake clock, timers that run when `advance` passes them, and everything it sent. */
function harness(saved?: unknown): { log: TableLog; sent: Sent[]; advance: (ms: number) => void; changes: () => number } {
  const sent: Sent[] = [];
  const timers = new Map<number, { at: number; run: () => void }>();
  let now = 0;
  let nextId = 0;
  let nextTimer = 1;
  let changes = 0;
  const log = new TableLog({
    send: (body, to) => void sent.push({ body, to }),
    clock: () => 1_700_000_000_000 + now,
    now: () => now,
    randomId: () => (nextId++).toString(16).padStart(24, '0'),
    nameOf: (player) => (player === MIRA ? 'Mira' : player === TOM ? 'Tom' : null),
    setTimer: (run, ms) => {
      timers.set(nextTimer, { at: now + ms, run });
      return nextTimer++;
    },
    clearTimer: (timer) => void timers.delete(timer),
    changed: () => void (changes += 1),
  }, saved);
  const advance = (ms: number): void => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at > now) continue;
      timers.delete(id);
      timer.run();
    }
  };
  return { log, sent, advance, changes: () => changes };
}

const kinds = (log: TableLog): string[] => log.entries().map((entry) => `${entry.kind}:${entry.name}`);
const last = (log: TableLog): GmLogEntry => log.entries()[log.entries().length - 1] as GmLogEntry;
const texts = (log: TableLog): string[] => log.entries().flatMap((entry) => (entry.kind === 'chat' ? [entry.text] : []));

describe('who came and went', () => {
  it('writes a line when a player joins and, after the grace time, when they left', () => {
    const { log, advance } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    log.left(MIRA);
    advance(LEAVE_GRACE_MS - 1);
    expect(kinds(log)).toEqual(['joined:Mira']);
    advance(1);
    expect(kinds(log)).toEqual(['joined:Mira', 'left:Mira']);
  });

  it('writes nothing for a player who is back in time', () => {
    const { log, advance } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    log.left(MIRA);
    advance(LEAVE_GRACE_MS / 2);
    log.joined({ id: MIRA, name: 'Mira' });
    advance(LEAVE_GRACE_MS * 2);
    expect(kinds(log)).toEqual(['joined:Mira']);
  });

  it('takes the relay\'s welcome as who is there: no second line for those known, a leave for those missing', () => {
    const { log, advance } = harness();
    log.welcome([{ id: MIRA, name: 'Mira' }, { id: TOM, name: 'Tom' }]);
    log.welcome([{ id: MIRA, name: 'Mira' }]);
    advance(LEAVE_GRACE_MS);
    expect(kinds(log)).toEqual(['joined:Mira', 'joined:Tom', 'left:Tom']);
  });

  it('knows who was there from a saved log, so a reload names nobody again', () => {
    const first = harness();
    first.log.joined({ id: MIRA, name: 'Mira' });
    const second = harness(JSON.parse(JSON.stringify(first.log.saved())));
    second.log.welcome([{ id: MIRA, name: 'Mira' }]);
    expect(kinds(second.log)).toEqual(['joined:Mira']);
  });

  it('writes nothing once disposed', () => {
    const { log, advance } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    log.left(MIRA);
    log.dispose();
    advance(LEAVE_GRACE_MS * 2);
    expect(kinds(log)).toEqual(['joined:Mira']);
  });
});

describe('players\' messages', () => {
  const seated = (): ReturnType<typeof harness> => {
    const made = harness();
    made.log.welcome([{ id: MIRA, name: 'Mira' }, { id: TOM, name: 'Tom' }]);
    made.sent.length = 0;
    return made;
  };

  it('are stamped with the relay\'s sender and the name the table knows, and go to all', () => {
    const { log, sent } = seated();
    expect(log.receive(MIRA, { t: 'chat', text: '  I open\u202e the door ', who: 'gm', name: 'GM' })).toBe(true);
    const entry = last(log);
    expect(entry).toMatchObject({ kind: 'chat', who: MIRA, name: 'Mira', text: 'I open the door' });
    expect(sent).toEqual([{ body: { t: 'log-entry', entry }, to: undefined }]);
    expect(parseGmMessage(sent[0]?.body)).toEqual(sent[0]?.body);
  });

  it('leave what is none of the log\'s to the scene', () => {
    const { log, sent } = seated();
    for (const body of [{ t: 'move', scene: 's', id: 'x', x: 1, y: 2 }, { t: 'roll' }, null, 'chat', []]) expect(log.receive(MIRA, body)).toBe(false);
    expect(sent).toEqual([]);
  });

  it('are ignored from someone the table does not know', () => {
    const { log, sent } = seated();
    expect(log.receive(STRANGER, { t: 'chat', text: 'hello' })).toBe(true);
    expect(texts(log)).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('are refused to the sender alone when the text is none or too long', () => {
    const { log, sent } = seated();
    log.receive(MIRA, { t: 'chat', text: '   ' });
    log.receive(MIRA, { t: 'chat', text: 'x'.repeat(501) });
    expect(texts(log)).toEqual([]);
    expect(sent).toEqual([{ body: { t: 'chat-refused', reason: 'text' }, to: MIRA }, { body: { t: 'chat-refused', reason: 'text' }, to: MIRA }]);
  });

  it('are refused past the rate, per player, and taken again once time passed', () => {
    const { log, sent, advance } = seated();
    for (let index = 0; index < CHAT_BURST + 2; index += 1) log.receive(MIRA, { t: 'chat', text: `message ${index}` });
    expect(texts(log)).toHaveLength(CHAT_BURST);
    expect(sent.filter((item) => item.body.t === 'chat-refused')).toEqual([{ body: { t: 'chat-refused', reason: 'rate' }, to: MIRA }, { body: { t: 'chat-refused', reason: 'rate' }, to: MIRA }]);
    log.receive(TOM, { t: 'chat', text: 'mine still goes' });
    advance(2_000);
    log.receive(MIRA, { t: 'chat', text: 'later' });
    expect(texts(log).slice(-2)).toEqual(['mine still goes', 'later']);
  });

  it('answer an entry the log holds, and stand alone when it is gone', () => {
    const { log } = seated();
    log.receive(MIRA, { t: 'chat', text: 'Is the door\nlocked?' });
    const question = last(log);
    log.receive(TOM, { t: 'chat', text: 'It is.', reply: question.id });
    expect(last(log)).toMatchObject({ text: 'It is.', reply: { id: question.id, who: MIRA, name: 'Mira', preview: 'Is the door locked?' } });
    log.receive(TOM, { t: 'chat', text: 'Hello?', reply: 'f'.repeat(24) });
    expect(last(log)).toMatchObject({ text: 'Hello?' });
    expect('reply' in last(log)).toBe(false);
  });

  it('are edited only by their author, and answers quote the new text', () => {
    const { log, sent } = seated();
    log.receive(MIRA, { t: 'chat', text: 'I atack' });
    const { id } = last(log);
    log.receive(TOM, { t: 'chat', text: 'Go!', reply: id });
    sent.length = 0;
    log.receive(TOM, { t: 'chat-edit', id, text: 'I flee' });
    expect(sent).toEqual([{ body: { t: 'chat-refused', reason: 'gone' }, to: TOM }]);
    log.receive(MIRA, { t: 'chat-edit', id, text: 'I attack' });
    const [edited, answer] = log.entries().slice(-2);
    expect(edited).toMatchObject({ id, text: 'I attack', edited: expect.any(Number) as number });
    expect(answer).toMatchObject({ reply: { id, preview: 'I attack' } });
    // One frame, whatever answers it: every page quotes the new text by itself.
    expect(sent.slice(1).map((item) => item.body.t)).toEqual(['log-entry']);
  });

  it('are deleted only by their author; answers keep standing without the quote', () => {
    const { log, sent } = seated();
    log.receive(MIRA, { t: 'chat', text: 'oops' });
    const { id } = last(log);
    log.receive(TOM, { t: 'chat', text: 'what?', reply: id });
    sent.length = 0;
    log.receive(TOM, { t: 'chat-delete', id });
    expect(texts(log)).toEqual(['oops', 'what?']);
    log.receive(MIRA, { t: 'chat-delete', id });
    expect(texts(log)).toEqual(['what?']);
    expect(last(log)).toMatchObject({ reply: { id, preview: '', gone: true } });
    expect(sent.map((item) => item.body.t)).toEqual(['chat-refused', 'log-remove']);
  });

  it('never delete a roll or a line of who came', () => {
    const { log } = seated();
    log.rolled({ who: MIRA, roll: ROLL, token: null, shared: true });
    const before = log.entries();
    for (const entry of before) log.receive(MIRA, { t: 'chat-delete', id: entry.id });
    expect(log.entries()).toBe(before);
  });

  it('give and take back reactions, once each, in the order they are offered', () => {
    const { log } = seated();
    void log.say({ text: 'Roll for initiative' });
    const { id } = last(log);
    log.receive(MIRA, { t: 'react', id, emoji: '😂', on: true });
    log.receive(TOM, { t: 'react', id, emoji: '👍', on: true });
    log.receive(MIRA, { t: 'react', id, emoji: '👍', on: true });
    log.receive(MIRA, { t: 'react', id, emoji: '👍', on: true });
    expect(last(log)).toMatchObject({ reactions: [{ emoji: '👍', by: [TOM, MIRA] }, { emoji: '😂', by: [MIRA] }] });
    log.receive(MIRA, { t: 'react', id, emoji: '😂', on: false });
    log.receive(TOM, { t: 'react', id, emoji: '👍', on: false });
    log.receive(MIRA, { t: 'react', id, emoji: '👍', on: false });
    expect('reactions' in last(log)).toBe(false);
  });

  it('refuse reactions past the rate and on a line of who came', () => {
    const { log, sent } = seated();
    void log.say({ text: 'hi' });
    const { id } = last(log);
    sent.length = 0;
    for (let index = 0; index < REACT_BURST + 1; index += 1) log.receive(MIRA, { t: 'react', id, emoji: '👍', on: index % 2 === 0 });
    expect(sent.filter((item) => item.body.t === 'chat-refused')).toEqual([{ body: { t: 'chat-refused', reason: 'rate' }, to: MIRA }]);
    const joined = log.entries()[0] as GmLogEntry;
    sent.length = 0;
    log.receive(TOM, { t: 'react', id: joined.id, emoji: '👍', on: true });
    expect(sent).toEqual([{ body: { t: 'chat-refused', reason: 'gone' }, to: TOM }]);
  });
});

describe('what a player can cost the table', () => {
  const seated = (): ReturnType<typeof harness> => {
    const made = harness();
    made.log.welcome([{ id: MIRA, name: 'Mira' }, { id: TOM, name: 'Tom' }]);
    made.sent.length = 0;
    return made;
  };

  it('is one frame for a change or deletion of a message, however many answer it', () => {
    const { log, sent, advance } = seated();
    log.receive(MIRA, { t: 'chat', text: 'root' });
    const { id } = last(log);
    for (let index = 0; index < 60; index += 1) {
      void log.say({ text: `answer ${index}`, reply: id });
      advance(10);
    }
    sent.length = 0;
    advance(60_000);
    log.receive(MIRA, { t: 'chat-edit', id, text: 'root, changed' });
    expect(sent.map((item) => item.body.t)).toEqual(['log-entry']);
    expect(log.entries().filter((entry) => entry.kind === 'chat' && entry.reply?.preview === 'root, changed')).toHaveLength(60);
    log.receive(MIRA, { t: 'chat-delete', id });
    expect(sent.map((item) => item.body.t)).toEqual(['log-entry', 'log-remove']);
    expect(log.entries().filter((entry) => entry.kind === 'chat' && entry.reply?.gone === true)).toHaveLength(60);
  });

  it('is at most a refusal a second, however fast they write', () => {
    const { log, sent } = seated();
    for (let index = 0; index < 200; index += 1) log.receive(MIRA, { t: 'chat', text: `flood ${index}` });
    expect(texts(log)).toHaveLength(CHAT_BURST);
    expect(sent.filter((item) => item.body.t === 'chat-refused')).toHaveLength(REFUSAL_BURST);
    // Another player's refusal is their own.
    log.receive(TOM, { t: 'chat', text: '' });
    expect(sent.filter((item) => item.body.t === 'chat-refused' && item.to === TOM)).toHaveLength(1);
  });

  it('is nothing for taking back a reaction nobody gave', () => {
    const { log, sent, changes } = seated();
    void log.say({ text: 'hi' });
    const { id } = last(log);
    sent.length = 0;
    const before = changes();
    log.receive(MIRA, { t: 'react', id, emoji: '👍', on: false });
    expect(sent).toEqual([]);
    expect(changes()).toBe(before);
  });

  it('never makes an entry a client would not read: a reaction names no more than a table seats', () => {
    const { log } = harness();
    void log.say({ text: 'popular' });
    const { id } = last(log);
    // One person with the link, joining anew under another id each time.
    for (let index = 0; index < 40; index += 1) {
      const visitor = index.toString(32).padStart(20, 'a').replace(/[01]/g, 'z');
      log.joined({ id: visitor, name: 'Visitor' });
      log.receive(visitor, { t: 'react', id, emoji: '👍', on: true });
    }
    const entry = log.entries().find((kept) => kept.id === id);
    expect(parseGmMessage({ t: 'log-entry', entry })).not.toBeNull();
    expect(entry?.kind === 'chat' ? entry.reactions?.[0]?.by.length : 0).toBe(13);
  });
});

describe('the GM', () => {
  it('speaks as the GM, edits their own and deletes anyone\'s message', async () => {
    const { log } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    await expect(log.say({ text: 'Welcome' })).resolves.toBeNull();
    await expect(log.say({ text: '  ' })).resolves.toBe('text');
    const mine = last(log);
    expect(mine).toMatchObject({ who: 'gm', name: 'GM', text: 'Welcome' });
    log.receive(MIRA, { t: 'chat', text: 'spoiler' });
    const theirs = last(log);
    expect(log.edit(theirs.id, 'changed')).toBe('gone');
    expect(log.edit(mine.id, 'Welcome all')).toBeNull();
    log.remove(theirs.id);
    expect(texts(log)).toEqual(['Welcome all']);
  });

  it('clears the log for everyone', () => {
    const { log, sent } = harness();
    void log.say({ text: 'one' });
    sent.length = 0;
    log.clear();
    expect(log.entries()).toEqual([]);
    expect(sent).toEqual([{ body: { t: 'log', entries: [] }, to: undefined }]);
  });
});

describe('rolls', () => {
  it('are entries by who rolled, with the token players know', () => {
    const { log, sent } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    sent.length = 0;
    log.rolled({ who: MIRA, roll: ROLL, token: 'ab'.repeat(12), shared: true, face: { name: 'Kara', image: 'art/kara.webp' } });
    expect(last(log)).toMatchObject({ kind: 'roll', who: MIRA, name: 'Mira', token: 'ab'.repeat(12), face: { name: 'Kara', image: 'art/kara.webp' } });
    const body = sent[0]?.body;
    expect(body).toEqual({ t: 'log-entry', entry: { id: last(log).id, at: last(log).at, who: MIRA, name: 'Mira', kind: 'roll', roll: ROLL, token: 'ab'.repeat(12) } });
  });

  it('the players are not shown stay with the GM: never sent, live or to a joiner, and none of a player\'s to react to', () => {
    const { log, sent } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    sent.length = 0;
    log.rolled({ who: 'gm', roll: ROLL, token: null, shared: false, face: { name: 'Lich', image: null } });
    const hidden = last(log);
    expect(hidden).toMatchObject({ kind: 'roll', hidden: true });
    expect(sent).toEqual([]);
    log.receive(MIRA, { t: 'react', id: hidden.id, emoji: '👍', on: true });
    log.receive(MIRA, { t: 'chat', text: 'what was that', reply: hidden.id });
    expect('reactions' in (log.entries().find((entry) => entry.id === hidden.id) as GmLogEntry)).toBe(false);
    expect('reply' in last(log)).toBe(false);
    sent.length = 0;
    log.resend(MIRA);
    expect(JSON.stringify(sent)).not.toContain(hidden.id);
    expect(JSON.stringify(sent)).not.toContain('Lich');
  });
});

describe('rolls only the GM has', () => {
  it('take no place among the entries players hold: the newest shared ones stay, whatever the GM rolled unseen', () => {
    const { log, sent, advance } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    for (let index = 0; index < MAX_LOG_ENTRIES - 1; index += 1) {
      void log.say({ text: `message ${index}` });
      advance(10);
    }
    const first = log.entries()[0] as GmLogEntry;
    const oldest = log.entries()[1] as GmLogEntry;
    sent.length = 0;
    for (let index = 0; index < 5; index += 1) log.rolled({ who: 'gm', roll: ROLL, token: null, shared: false });
    expect(sent).toEqual([]);
    expect(log.entries()[0]).toBe(first);
    // The oldest message is still there for a player to react to, and a joiner still gets every shared entry.
    log.receive(MIRA, { t: 'react', id: oldest.id, emoji: '👍', on: true });
    expect(sent.map((item) => item.body.t)).toEqual(['log-entry']);
    sent.length = 0;
    log.resend(MIRA);
    const body = sent[0]?.body;
    expect(body?.t === 'log' ? body.entries.length : 0).toBe(MAX_LOG_ENTRIES);
    // And they have a count of their own.
    for (let index = 0; index < MAX_LOG_ENTRIES; index += 1) log.rolled({ who: 'gm', roll: ROLL, token: null, shared: false });
    expect(log.entries().filter((entry) => entry.hidden === true)).toHaveLength(MAX_LOG_ENTRIES);
    expect(log.entries().filter((entry) => entry.hidden !== true)).toHaveLength(MAX_LOG_ENTRIES);
  });

  it('and a roll a client would not read is not kept at all', () => {
    const { log, sent } = harness();
    log.rolled({ who: 'gm', roll: { ...ROLL, source: { type: 'statblock', abilityName: 'x'.repeat(201) } }, token: null, shared: true });
    expect(log.entries()).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe('what a joiner is sent and what is kept', () => {
  it('is the newest shared entries, each as a client reads it', () => {
    const { log, sent } = harness();
    log.joined({ id: MIRA, name: 'Mira' });
    void log.say({ text: 'hello' });
    log.rolled({ who: 'gm', roll: ROLL, token: null, shared: true, face: { name: 'Lich', image: 'art/lich.webp' } });
    sent.length = 0;
    log.resend(MIRA);
    expect(sent.map((item) => item.body.t)).toEqual(['log', 'people']);
    expect(sent[0]?.to).toBe(MIRA);
    const body = sent[0]?.body;
    expect(parseGmMessage(body)).toEqual(body);
    expect(body?.t === 'log' ? body.entries.map((entry) => entry.kind) : null).toEqual(['joined', 'chat', 'roll']);
    expect(JSON.stringify(body)).not.toContain('Lich');
  });

  it('holds at most the newest entries the log keeps', () => {
    const { log, advance } = harness();
    for (let index = 0; index < MAX_LOG_ENTRIES + 5; index += 1) {
      void log.say({ text: `message ${index}` });
      advance(10_000);
    }
    expect(log.entries()).toHaveLength(MAX_LOG_ENTRIES);
    expect(texts(log)[0]).toBe('message 5');
  });

  it('fits the byte budget by leaving the oldest out', () => {
    const entry = (index: number): LogEntry => ({ id: index.toString(16).padStart(24, '0'), at: index, who: 'gm', name: 'GM', kind: 'chat', text: 'é'.repeat(500) });
    const entries = Array.from({ length: MAX_LOG_ENTRIES }, (_, index) => entry(index));
    const kept = entriesWithin(entries, LOG_SNAPSHOT_BYTES);
    expect(kept.length).toBeLessThan(entries.length);
    expect(kept[kept.length - 1]).toBe(entries[entries.length - 1]);
    expect(new TextEncoder().encode(JSON.stringify(kept)).length).toBeLessThanOrEqual(LOG_SNAPSHOT_BYTES);
    expect(entriesWithin(entries.slice(0, 3), LOG_SNAPSHOT_BYTES)).toHaveLength(3);
  });

  it('comes back from saved data with what only the GM has, and without what cannot be read', () => {
    const first = harness();
    void first.log.say({ text: 'kept' });
    first.log.rolled({ who: 'gm', roll: ROLL, token: null, shared: false, face: { name: 'Lich', image: null } });
    const saved = JSON.parse(JSON.stringify(first.log.saved())) as { entries: unknown[]; present: unknown[] };
    const { log } = harness({ ...saved, entries: [...saved.entries, { id: 'bad' }, null, { ...(saved.entries[0] as object), text: '<b>'.repeat(400) }] });
    expect(log.entries()).toEqual(first.log.entries());
    for (const unreadable of ['not a log', ['a list'], { entries: 'none', present: 7 }, null]) expect(harness(unreadable).log.entries()).toEqual([]);
  });

  it('knows who is there from what is kept beside the entries, also once their lines left the log or it was cleared', () => {
    const first = harness();
    first.log.welcome([{ id: MIRA, name: 'Mira' }, { id: TOM, name: 'Tom' }]);
    first.log.clear();
    const second = harness(JSON.parse(JSON.stringify(first.log.saved())));
    // Mira is still there after the reload; Tom left meanwhile.
    second.log.welcome([{ id: MIRA, name: 'Mira' }]);
    second.advance(LEAVE_GRACE_MS);
    expect(kinds(second.log)).toEqual(['left:Tom']);
    // An id that is none is not taken for a player.
    const third = harness({ entries: [], present: ['gm', 7, 'x'.repeat(20), MIRA, MIRA] });
    third.log.welcome([]);
    third.advance(LEAVE_GRACE_MS);
    expect(kinds(third.log)).toEqual(['left:Mira']);
  });
});
