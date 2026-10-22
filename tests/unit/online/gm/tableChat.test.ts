import { parseGmMessage, type GmMessage, type LogEntry, type SharedRoll } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { viewOf, type GmLogEntry } from '../../../../src/app/online/gm/log/logEntries.ts';
import { TableLog, type SpokenAs } from '../../../../src/app/online/gm/log/TableLog.ts';
import { rollAudience } from '../../../../src/app/online/gm/PlayerRolls.ts';
import { TableChat } from '../../../../src/app/online/gm/tableChat.ts';
import type { OnlineTable } from '../../../../src/app/online/gm/OnlineTable.ts';

const MIRA = 'a'.repeat(20);
const TOM = 'b'.repeat(20);
const ANA = 'd'.repeat(20);
const NAMES: Readonly<Record<string, string>> = { [MIRA]: 'Mira', [TOM]: 'Tom', [ANA]: 'Ana' };
const ART = { hash: 'f'.repeat(64), size: 10, mime: 'image/png' };
const GOBLIN: SpokenAs = { speaker: { name: 'Goblin', token: null, art: ART, ring: '#ff0000' }, art: 'art/goblin.png' };
const KARA: SpokenAs = { speaker: { name: 'Kara', token: 'cccccccccccccccccccccccc', art: null, ring: null }, art: null };

const roll = (total: number, formula = '1d20'): SharedRoll => ({ id: `r${total}`, timestamp: 1, formula, modifiers: 0, total, rolls: [{ die: 'd20', value: total, max: 20 }] });

interface Sent {
  readonly body: GmMessage;
  readonly to: string | undefined;
}

/** A log at a table of Mira, Tom and Ana, whose speakers and inline rolls are fakes. */
function table(options: { speaker?: (who: string, key: string) => Promise<SpokenAs | null>; rollInline?: (formula: string) => SharedRoll | null } = {}): { log: TableLog; sent: Sent[]; to: (player: string) => GmMessage[] } {
  const sent: Sent[] = [];
  let id = 0;
  const log = new TableLog({
    send: (body, to) => void sent.push({ body, to }),
    clock: () => 1_700_000_000_000,
    now: () => 0,
    randomId: () => (id++).toString(16).padStart(24, '0'),
    nameOf: (player) => NAMES[player] ?? null,
    setTimer: () => 1,
    clearTimer: () => undefined,
    changed: () => undefined,
    speaker: options.speaker ?? ((who, key) => Promise.resolve(who === 'gm' && key === 'goblin' ? GOBLIN : who === MIRA && key === 'cccccccccccccccccccccccc' ? KARA : null)),
    rollInline: options.rollInline ?? ((formula) => (formula === 'nope' ? null : roll(11, formula))),
  });
  log.welcome([{ id: MIRA, name: 'Mira' }, { id: TOM, name: 'Tom' }, { id: ANA, name: 'Ana' }]);
  sent.length = 0;
  const to = (player: string): GmMessage[] => sent.filter((item) => item.to === player || item.to === undefined).map((item) => item.body);
  return { log, sent, to };
}

const entriesTo = (messages: readonly GmMessage[]): LogEntry[] => messages.flatMap((body) => (body.t === 'log-entry' ? [body.entry] : []));
const last = (log: TableLog): GmLogEntry => log.entries()[log.entries().length - 1]!;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('whispers', () => {
  it('reach only their audience, and nobody else hears of them, the GM neither', () => {
    const { log, to, sent } = table();
    const heard: LogEntry[] = [];
    log.listen((entry) => heard.push(entry));
    log.receive(MIRA, { t: 'chat', text: 'meet me outside', to: [TOM] });
    const entry = last(log);
    expect(entry).toMatchObject({ kind: 'chat', who: MIRA, to: [TOM] });
    expect(viewOf(entry, 'gm')).toBeNull();
    expect(heard).toEqual([]);
    log.remove(entry.id);
    expect(last(log)).toBe(entry);
    expect(entriesTo(to(TOM))).toEqual([entry]);
    expect(entriesTo(to(ANA))).toEqual([]);
    expect(sent.every((item) => item.to !== undefined)).toBe(true);
    for (const item of sent) expect(parseGmMessage(item.body)).toEqual(item.body);
  });

  it('are refused for someone the table does not know, and never to the sender alone', () => {
    const { log, sent } = table();
    log.receive(MIRA, { t: 'chat', text: 'psst', to: ['e'.repeat(20)] });
    log.receive(MIRA, { t: 'chat', text: 'note to self', to: [MIRA] });
    log.receive(MIRA, { t: 'chat', text: 'to the GM', to: ['gm'] });
    expect(log.entries().filter((entry) => entry.kind === 'chat').map((entry) => (entry.kind === 'chat' ? entry.to : null))).toEqual([['gm']]);
    expect(sent.filter((item) => item.body.t === 'chat-refused')).toEqual([{ body: { t: 'chat-refused', reason: 'whisper' }, to: MIRA }, { body: { t: 'chat-refused', reason: 'whisper' }, to: MIRA }]);
  });

  it('from the GM go to the players named, and the GM sees their own', () => {
    const { log, to } = table();
    void log.say({ text: 'you hear a voice', to: [ANA] });
    const entry = last(log);
    expect(entry.kind === 'chat' ? entry.to : null).toEqual([ANA]);
    expect(entriesTo(to(ANA))).toEqual([entry]);
    expect(entriesTo(to(TOM))).toEqual([]);
    expect(viewOf(entry, 'gm')).toEqual(entry);
  });

  it('answered stay among the people they were for, whatever the answer asks', () => {
    const { log, to } = table();
    log.receive(MIRA, { t: 'chat', text: 'secret plan', to: [TOM] });
    const whisper = last(log);
    log.receive(TOM, { t: 'chat', text: 'agreed', reply: whisper.id });
    log.receive(TOM, { t: 'chat', text: 'everyone look', reply: whisper.id, to: [ANA] });
    expect(log.entries().slice(-2).map((entry) => (entry.kind === 'chat' ? entry.to : null))).toEqual([[MIRA], [MIRA]]);
    expect(entriesTo(to(ANA))).toEqual([]);
  });

  it('cannot be answered, changed or reacted to by someone they were not for', () => {
    const { log, sent } = table();
    log.receive(MIRA, { t: 'chat', text: 'secret', to: [TOM] });
    const whisper = last(log);
    sent.length = 0;
    log.receive(ANA, { t: 'react', id: whisper.id, emoji: '👍', on: true });
    log.receive(ANA, { t: 'chat', text: 'what secret?', reply: whisper.id });
    expect(last(log)).toMatchObject({ text: 'what secret?' });
    expect(last(log)).not.toHaveProperty('reply');
    expect(whisper).not.toHaveProperty('reactions');
  });

  it('go to a joiner only when they were for them', () => {
    const { log, sent } = table();
    log.receive(MIRA, { t: 'chat', text: 'only Tom', to: [TOM] });
    void log.say({ text: 'hello all' });
    sent.length = 0;
    log.resend(ANA);
    const body = sent.find((item) => item.body.t === 'log')?.body;
    expect(body?.t === 'log' ? body.entries.flatMap((entry) => (entry.kind === 'chat' ? [entry.text] : [])) : null).toEqual(['hello all']);
  });
});

describe('private rolls', () => {
  it('show whole to their audience and as a line that a roll was made to everyone else', () => {
    const { log, to } = table();
    log.rolled({ who: MIRA, roll: roll(17), token: null, shared: true, mode: 'gm', to: rollAudience('gm', MIRA), flavor: 'Insight' });
    const entry = last(log);
    expect(entriesTo(to(MIRA))).toEqual([entry]);
    expect(entriesTo(to(TOM))).toEqual([{ id: entry.id, at: entry.at, who: MIRA, name: 'Mira', kind: 'secret', mode: 'gm' }]);
    expect(viewOf(entry, 'gm')).toEqual(entry);
  });

  it('blind: the roller too learns only that they rolled; self: the GM too', () => {
    const { log } = table();
    log.rolled({ who: MIRA, roll: roll(3), token: null, shared: true, mode: 'blind', to: rollAudience('blind', MIRA) });
    const blind = last(log);
    expect(viewOf(blind, MIRA)?.kind).toBe('secret');
    expect(viewOf(blind, 'gm')?.kind).toBe('roll');
    log.rolled({ who: MIRA, roll: roll(9), token: null, shared: true, mode: 'self', to: rollAudience('self', MIRA) });
    const self = last(log);
    expect(viewOf(self, MIRA)?.kind).toBe('roll');
    expect(viewOf(self, 'gm')?.kind).toBe('secret');
    expect(viewOf(self, TOM)?.kind).toBe('secret');
  });

  it('a GM\'s roll players are not shown stays the GM\'s alone, without a line', () => {
    const { log, sent } = table();
    log.rolled({ who: 'gm', roll: roll(5), token: null, shared: false });
    expect(sent).toEqual([]);
  });
});

describe('speakers', () => {
  it('a player speaks in character as a token of theirs; any other is refused', async () => {
    const { log, sent } = table();
    log.receive(MIRA, { t: 'chat', text: 'I draw my sword', style: 'ic', speaker: 'cccccccccccccccccccccccc' });
    log.receive(TOM, { t: 'chat', text: 'me too', style: 'ic', speaker: 'cccccccccccccccccccccccc' });
    await settle();
    expect(log.entries().filter((entry) => entry.kind === 'chat').map((entry) => (entry.kind === 'chat' ? [entry.text, entry.style, entry.speaker?.name] : null))).toEqual([['I draw my sword', 'ic', 'Kara']]);
    expect(sent.filter((item) => item.body.t === 'chat-refused')).toEqual([{ body: { t: 'chat-refused', reason: 'speaker' }, to: TOM }]);
  });

  it('the GM whispers as an NPC with its portrait; its art may be served while the log shows it', async () => {
    const { log, to } = table();
    await log.say({ text: 'Give me the key', speaker: 'goblin', style: 'ic', to: [ANA] });
    const entry = last(log);
    expect(entry).toMatchObject({ speaker: GOBLIN.speaker, speakerArt: 'art/goblin.png', to: [ANA] });
    expect(JSON.stringify(entriesTo(to(ANA)))).not.toContain('goblin.png');
    expect(log.artFile(ART.hash)).toBe('art/goblin.png');
    expect(entriesTo(to(TOM))).toEqual([]);
  });

  it('keep the order messages were said in, though one waits for its artwork', async () => {
    let release = (): void => undefined;
    const slow = new Promise<SpokenAs>((resolve) => (release = () => resolve(GOBLIN)));
    const { log } = table({ speaker: () => slow });
    const first = log.say({ text: 'first', speaker: 'goblin' });
    void log.say({ text: 'second' });
    log.receive(MIRA, { t: 'chat', text: 'third' });
    expect(log.entries().filter((entry) => entry.kind === 'chat')).toEqual([]);
    release();
    await first;
    await settle();
    expect(log.entries().flatMap((entry) => (entry.kind === 'chat' ? [entry.text] : []))).toEqual(['first', 'second', 'third']);
  });
});

describe('rolls in a message', () => {
  it('are rolled when said, and buttons are offered as written', () => {
    const { log } = table();
    log.receive(MIRA, { t: 'chat', text: 'I attack [[1d20+5]] and hit for [[2d6]]' });
    expect(last(log)).toMatchObject({ inline: [roll(11, '1d20+5'), roll(11, '2d6')] });
    void log.say({ text: 'Everyone: [[/br 1d20+2]]{Perception}' });
    expect(last(log)).not.toHaveProperty('inline');
  });

  it('that do not roll refuse the message', () => {
    const { log, sent } = table();
    log.receive(MIRA, { t: 'chat', text: 'oops [[nope]]' });
    log.receive(MIRA, { t: 'chat', text: 'oops [[/r banana]]' });
    log.receive(MIRA, { t: 'chat', text: 'oops [[/shout 1d6]]' });
    expect(log.entries().filter((entry) => entry.kind === 'chat')).toEqual([]);
    expect(sent.filter((item) => item.body.t === 'chat-refused').map((item) => item.body)).toEqual([{ t: 'chat-refused', reason: 'roll' }, { t: 'chat-refused', reason: 'roll' }]);
  });

  it('stay through an edit only as they were', () => {
    const { log } = table();
    log.receive(MIRA, { t: 'chat', text: 'hit [[1d20]]' });
    const entry = last(log);
    log.receive(MIRA, { t: 'chat-edit', id: entry.id, text: 'I hit [[1d20]]!' });
    expect(last(log)).toMatchObject({ text: 'I hit [[1d20]]!', inline: [roll(11)] });
    log.receive(MIRA, { t: 'chat-edit', id: entry.id, text: 'I hit [[1d20+10]]!' });
    expect(last(log)).toMatchObject({ text: 'I hit [[1d20]]!' });
  });
});

describe('roll buttons', () => {
  it('are rolled as their author wrote them, for whoever sees the message', () => {
    const { log } = table();
    void log.say({ text: 'Roll [[/br 1d20+2]]{Perception} and [[1d4]]' });
    const entry = last(log);
    expect(log.requestOf(TOM, { id: entry.id, index: 0 })).toEqual({ formula: '1d20+2', mode: 'blind', label: 'Perception' });
    expect(log.requestOf(TOM, { id: entry.id, index: 1 })).toBeNull();
    expect(log.requestOf(TOM, { id: entry.id, index: 3 })).toBeNull();
    void log.say({ text: 'Just you: [[/r 1d6]]', to: [ANA] });
    expect(log.requestOf(TOM, { id: last(log).id, index: 0 })).toBeNull();
    expect(log.requestOf(ANA, { id: last(log).id, index: 0 })).toEqual({ formula: '1d6', mode: 'public', label: '1d6', to: ['gm', ANA] });
  });
});

describe('what the review found', () => {
  it('an answer to a blind roll names it and quotes nothing; one to a roll only the GM has quotes nothing', () => {
    const { log, to } = table();
    log.rolled({ who: MIRA, roll: roll(17), token: null, shared: true, mode: 'blind', to: rollAudience('blind', MIRA) });
    void log.say({ text: 'nice', reply: last(log).id });
    expect(entriesTo(to(MIRA)).at(-1)).toMatchObject({ text: 'nice', reply: { preview: '' } });
    log.rolled({ who: 'gm', roll: roll(3), token: null, shared: false });
    void log.say({ text: 'oops', reply: last(log).id });
    expect(last(log)).not.toHaveProperty('reply');
    expect(JSON.stringify(entriesTo(to(TOM)))).not.toContain('= 3');
  });

  it('a line that a private roll was made names no speaker', () => {
    const { log } = table();
    log.rolled({ who: 'gm', roll: roll(12), token: null, shared: true, mode: 'gm', to: rollAudience('gm', 'gm'), speaker: GOBLIN });
    expect(viewOf(last(log), TOM)).toEqual({ id: last(log).id, at: last(log).at, who: 'gm', name: 'GM', kind: 'secret', mode: 'gm' });
  });

  it('the GM\'s whisper to themselves is a note only the GM\'s log has', async () => {
    const { log, sent } = table();
    await expect(log.say({ text: 'the lich is behind the door', to: ['gm'] })).resolves.toBeNull();
    expect(last(log)).toMatchObject({ hidden: true, text: 'the lich is behind the door' });
    expect(last(log)).not.toHaveProperty('to');
    expect(sent).toEqual([]);
  });

  it('a roll button in a whisper is rolled among the whisper\'s people, never in the open', () => {
    const { log } = table();
    void log.say({ text: 'Search: [[/r 1d20]]{Secret door}', to: [ANA] });
    expect(log.requestOf(ANA, { id: last(log).id, index: 0 })).toEqual({ formula: '1d20', mode: 'public', label: 'Secret door', to: ['gm', ANA] });
    expect(rollAudience('gm', ANA, ['gm', ANA])).toEqual(['gm']);
    expect(rollAudience('gm', ANA, ['gm', ANA, TOM])).toEqual(['gm', TOM]);
    expect(rollAudience('gm', 'gm', ['gm', ANA])).toEqual([ANA]);
    // Among players alone the GM is shown that a roll was made, not what it was.
    expect(rollAudience('gm', ANA, [TOM, ANA])).toEqual([TOM]);
    void log.say({ text: 'Note: [[/r 1d20]]{Ambush}', to: ['gm'] });
    expect(log.requestOf('gm', { id: last(log).id, index: 0 })).toMatchObject({ to: ['gm'] });
  });
});

describe('who is at the table', () => {
  it('goes to everyone when someone comes or goes, and with the log', () => {
    const { log, sent } = table();
    log.joined({ id: 'e'.repeat(20), name: 'Eve' });
    const people = sent.find((item) => item.body.t === 'people');
    expect(people).toEqual({ body: { t: 'people', people: [{ id: MIRA, name: 'Mira' }, { id: TOM, name: 'Tom' }, { id: ANA, name: 'Ana' }, { id: 'e'.repeat(20), name: 'Eve' }] }, to: undefined });
    expect(parseGmMessage(people?.body)).toEqual(people?.body);
  });
});

describe('the table chat for other plugins', () => {
  const chatOf = (log: TableLog): TableChat => new TableChat(() => ({ log, rollFromLog: async () => null }) as unknown as OnlineTable);

  it('posts as the GM, whispers by name, and hears every entry', async () => {
    const { log, to } = table();
    const chat = chatOf(log);
    const heard: string[] = [];
    chat.onEntry((entry) => heard.push(entry.kind));
    expect(await chat.post({ text: 'Make a save [[/r 1d20]]{Dex save}', whisper: ['tom'] })).toEqual({ ok: true });
    expect(entriesTo(to(TOM))).toHaveLength(1);
    expect(entriesTo(to(ANA))).toEqual([]);
    expect(await chat.post({ text: 'hi', whisper: ['Nobody'] })).toEqual({ ok: false, reason: 'whisper' });
    expect(heard).toEqual(['chat']);
  });

  it('says that no table runs', async () => {
    const chat = new TableChat(() => null);
    expect(chat.running).toBe(false);
    expect(await chat.post({ text: 'hi' })).toEqual({ ok: false, reason: 'no-table' });
  });
});
