import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGmMessage, type BookStatblock } from '../../../../src/app/online/protocol/index.ts';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { BOOK_BURST, BOOK_POLL_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { setRestGate, type CheckedRest, type RestGate, type TakenRest } from '../../../../src/app/online/gm/book/restGate.ts';
import { restKey } from '../../../../src/app/online/gm/book/restRequests.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import type { RestSummary } from '../../../../src/app/recovery/restEvents';
import { checkRest, type RestOffer, type RestRequest } from '../../../../src/app/recovery/restOffer';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, cave, delivered, ofType, openTable, type Delivered } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { StatblockNotes, templateOf } from './statblockNotes.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerCursors(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
const BRANNOCH_NOTE = 'Characters/Brannoch.md';
const MIRA_NOTE = 'Characters/Mira.md';
/** Brannoch is a player character of the library; Mira's token was placed from a library token that is none. */
const BRANNOCH_PC = 'pc-brannoch';
const MIRA_NPC = 'npc-mira';

const FIELDS: TemplateField[] = [{ key: 'name', label: 'Name', type: 'text' }, { key: 'speed', label: 'Speed', type: 'text' }];
const BLOCKS: TemplateBlock[] = [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }];
const TEMPLATE = templateOf(FIELDS, BLOCKS);
const note = (name: string): string => ['---', 'statblock: true', `atlas-template: ${TEMPLATE.id}`, `name: ${name}`, 'speed: 30 ft.', '---', ''].join('\n');

const OFFERS: RestOffer[] = [
  { id: 'short', name: 'Short rest', spends: [{ rule: 0, label: 'Hit Dice', each: '1d8+(2)', max: 3 }], choices: [] },
  { id: 'long', name: 'Long rest', spends: [], choices: [] },
];

const BRANNOCH = { id: BRANNOCH_PC, name: 'Brannoch' };

const SUMMARY: RestSummary = {
  characterId: BRANNOCH_PC, characterName: 'Brannoch', notePath: BRANNOCH_NOTE, button: { id: 'short', name: 'Short rest' }, picks: [],
  changes: [
    { character: BRANNOCH, target: { kind: 'resource', key: 'hp' }, label: 'Hit Points', from: 4, to: 13, rolls: [{ formula: '2d8+(2)', total: 9 }] },
    { character: BRANNOCH, target: { kind: 'counters', key: 'hitDice', row: 0 }, label: 'Hit Dice', from: 3, to: 1, rolls: [] },
  ],
  skipped: [{ index: 2, rule: { target: { kind: 'condition', id: 'exhaustion' }, does: 'step', by: -1 }, label: 'Exhaustion', reason: { kind: 'no-token', id: 'exhaustion' } }],
  text: 'Short rest: Hit Points 4 → 13',
};

/** Atlas's recovery buttons as a test holds them: Brannoch offers two, nobody else any; a rest taken is announced as Atlas announces it. */
class FakeRests implements RestGate {
  readonly taken: { path: string; character: string; request: RestRequest }[] = [];
  outcome: TakenRest = 'done';
  private readonly listeners = new Set<(rest: RestSummary) => void>();

  offers(path: string, character: string): readonly RestOffer[] | null {
    return path === BRANNOCH_NOTE && character === BRANNOCH_PC ? OFFERS : null;
  }

  check(path: string, character: string, request: RestRequest): CheckedRest | null {
    const offers = this.offers(path, character);
    const fit = offers === null ? null : checkRest(offers, request);
    return fit === null ? null : { button: fit.button.name, picks: [], rules: ['Hit Points to full', `${request.spends[0] ?? 0} Hit Dice`] };
  }

  take(path: string, character: string, request: RestRequest): Promise<TakenRest> {
    this.taken.push({ path, character, request });
    if (this.outcome === 'done') this.announce(SUMMARY);
    return Promise.resolve(this.outcome);
  }

  onRested(listener: (rest: RestSummary) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** A rest the GM takes in Atlas, as the note panel's button takes it. */
  announce(rest: RestSummary): void {
    for (const listener of [...this.listeners]) listener(rest);
  }
}

/** The statblocks a player's page was sent, as it reads them, in order. */
function statblocks(messages: readonly Delivered[], player: string): (BookStatblock | null)[] {
  return ofType(messages, 'book-statblock').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book-statblock') throw new Error('a statblock the page would not read');
    return read.statblock;
  });
}

/** The answers to rest requests a player was sent, as `request: outcome`. */
const answers = (messages: readonly Delivered[], player: string): string[] =>
  ofType(messages, 'book-rest-answer').filter(({ to }) => to === player).map(({ body }) => `${String(body.request)}: ${String(body.outcome)}`);

const REQUEST = 'a'.repeat(24);
const SECOND = 'b'.repeat(24);

describe('rests a player asks the GM for at a running table', () => {
  let rests: FakeRests;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
    const notes = new StatblockNotes().install();
    notes.put(BRANNOCH_NOTE, TEMPLATE, note('Brannoch'));
    notes.put(MIRA_NOTE, TEMPLATE, note('Mira'));
    rests = new FakeRests();
    setRestGate(rests);
  });

  afterEach(() => {
    setStatblockGate(null);
    setRestGate(null);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A table where Ana plays Brannoch, a player character, and Ben plays Mira, who is none; both link their notes. */
  async function restingTable(): Promise<Awaited<ReturnType<typeof openTable>> & { characterId: string }> {
    const table = await openTable(new BookShelf(), PLAYERS);
    table.tab.store.set(cave({ brannoch: { statblockPath: BRANNOCH_NOTE, assetId: BRANNOCH_PC }, mira: { statblockPath: MIRA_NOTE, assetId: MIRA_NPC } }));
    await advance(BOOK_POLL_MS);
    const characterId = statblocks(delivered(table.socket), ANA).at(-1)?.characterId;
    if (characterId === undefined) throw new Error('Brannoch\'s statblock names no character');
    return { ...table, characterId };
  }

  it('puts the recovery buttons on the statblock of a player\'s own player character only', async () => {
    const { online, socket, characterId } = await restingTable();
    const ana = statblocks(delivered(socket), ANA).at(-1);
    expect(characterId).toMatch(/^[0-9a-f]{24}$/);
    expect(ana?.recovery).toEqual([{ id: 'short', name: 'Short rest', spends: [{ label: 'Hit Dice', most: 3 }] }, { id: 'long', name: 'Long rest', spends: [] }]);
    // Mira is no player character: her statblock comes without buttons or a character id.
    const ben = statblocks(delivered(socket), BEN).at(-1);
    expect(ben).toMatchObject({ displayName: 'Mira' });
    expect(ben?.recovery).toBeUndefined();
    expect(ben?.characterId).toBeUndefined();
    // The id is the table's own, never the library token's.
    expect(JSON.stringify(delivered(socket))).not.toContain(BRANNOCH_PC);
    online.stop();
  });

  it('refuses a request that names no character of the player\'s or does not fit what the character offers', async () => {
    const { online, socket, from, characterId } = await restingTable();
    const since = delivered(socket).length;
    const ask = (player: string, request: Record<string, unknown>): void => from(player, { t: 'book-rest', request: REQUEST, character: characterId, button: 'short', spends: [1], ...request });
    ask(ANA, { character: 'c'.repeat(24) });
    ask(BEN, {});
    ask(ANA, { button: 'nap' });
    ask(ANA, { spends: [] });
    ask(ANA, { spends: [4] });
    await advance(100);
    expect(answers(delivered(socket).slice(since), ANA)).toEqual([`${REQUEST}: refused`, `${REQUEST}: refused`, `${REQUEST}: refused`, `${REQUEST}: refused`]);
    expect(answers(delivered(socket).slice(since), BEN)).toEqual([`${REQUEST}: refused`]);
    expect(online.table?.rests.cards()).toEqual([]);
    online.stop();
  });

  it('waits for the GM with one request per character, and the GM\'s approval takes it, answers and logs it', async () => {
    const { online, socket, from, characterId } = await restingTable();
    let since = delivered(socket).length;
    from(ANA, { t: 'book-rest', request: REQUEST, character: characterId, button: 'long', spends: [] });
    await advance(ARM_MS);
    const key = restKey(characterId);
    expect(online.table?.rests.cards()).toMatchObject([{ key, button: 'Long rest', armed: true }]);
    // The page asks again only once it let its request go: the new one takes the card, checked again, and the old one is not answered.
    from(ANA, { t: 'book-rest', request: SECOND, character: characterId, button: 'short', spends: [2] });
    await advance(100);
    expect(answers(delivered(socket).slice(since), ANA)).toEqual([]);
    expect(online.table?.rests.cards()).toEqual([{ key, character: 'Brannoch', button: 'Short rest', picks: [], rules: ['Hit Points to full', '2 Hit Dice'], armed: false, answered: false }]);

    // A press before the card has stood long enough is not meant.
    online.table?.rests.approve(key);
    await advance(ARM_MS - 200);
    expect(rests.taken).toEqual([]);
    await advance(200);
    since = delivered(socket).length;
    online.table?.rests.approve(key);
    await advance(BOOK_POLL_MS);
    expect(rests.taken).toEqual([{ path: BRANNOCH_NOTE, character: BRANNOCH_PC, request: { button: 'short', spends: [2] } }]);
    const after = delivered(socket).slice(since);
    expect(answers(after, ANA)).toEqual([`${SECOND}: done`]);
    // Ana is sent her statblock again, with what she may spend now, before the answer that ends her wait.
    expect(statblocks(after, ANA)).toHaveLength(1);
    const order = after.filter(({ to, body }) => to === ANA && (body.t === 'book-statblock' || body.t === 'book-rest-answer')).map(({ body }) => body.t);
    expect(order).toEqual(['book-statblock', 'book-rest-answer']);
    expect(online.table?.rests.cards()).toEqual([]);
    const logged = online.table?.log.entries().filter((entry) => entry.kind === 'rest');
    expect(logged).toEqual([expect.objectContaining({
      kind: 'rest', who: 'gm', name: 'GM', character: 'Brannoch', button: 'Short rest',
      changes: [{ label: 'Hit Points', from: 4, to: 13, roll: '2d8+2 = 9' }, { label: 'Hit Dice', from: 3, to: 1 }], skipped: ['Exhaustion'],
    })]);
    // Every player is sent it.
    expect(ofType(after, 'log-entry').map(({ body }) => (body.entry as { kind?: string }).kind)).toContain('rest');
    online.stop();
  });

  it('answers nothing past a player\'s rate of writes, a request it cannot read included', async () => {
    const { online, socket, from } = await restingTable();
    const since = delivered(socket).length;
    for (let sent = 0; sent < BOOK_BURST + 5; sent += 1) from(ANA, { t: 'book-rest', request: REQUEST, character: 'not an id', button: 'short', spends: [] });
    await advance(100);
    expect(answers(delivered(socket).slice(since), ANA)).toHaveLength(BOOK_BURST);
    online.stop();
  });

  it('tells the player when the GM declines, and changes nothing', async () => {
    const { online, socket, from, characterId } = await restingTable();
    from(ANA, { t: 'book-rest', request: REQUEST, character: characterId, button: 'long', spends: [] });
    await advance(ARM_MS);
    const since = delivered(socket).length;
    online.table?.rests.decline(restKey(characterId));
    await advance(100);
    expect(answers(delivered(socket).slice(since), ANA)).toEqual([`${REQUEST}: declined`]);
    expect(rests.taken).toEqual([]);
    expect(online.table?.log.entries().filter((entry) => entry.kind === 'rest')).toEqual([]);
    // Another request of the character's may come now.
    from(ANA, { t: 'book-rest', request: SECOND, character: characterId, button: 'long', spends: [] });
    await advance(100);
    expect(online.table?.rests.cards()).toHaveLength(1);
    online.stop();
  });

  it('drops a request unanswered when its player leaves', async () => {
    const { online, socket, from, characterId } = await restingTable();
    from(ANA, { t: 'book-rest', request: REQUEST, character: characterId, button: 'long', spends: [] });
    await advance(ARM_MS);
    expect(online.table?.rests.cards()).toHaveLength(1);
    const since = delivered(socket).length;
    socket.relay({ t: 'player-left', id: ANA });
    await advance(100);
    expect(online.table?.rests.cards()).toEqual([]);
    online.table?.rests.approve(restKey(characterId));
    await advance(100);
    expect(rests.taken).toEqual([]);
    expect(answers(delivered(socket).slice(since), ANA)).toEqual([]);
    online.stop();
  });

  it('logs the GM\'s own rest while the table runs, which players react to as to any row, and none once it stopped', async () => {
    const { online, from } = await restingTable();
    const table = online.table;
    rests.announce({ ...SUMMARY, button: { id: 'long', name: 'Long rest' }, changes: [], skipped: [] });
    const rested = table?.log.entries().filter((entry) => entry.kind === 'rest');
    expect(rested).toEqual([expect.objectContaining({ character: 'Brannoch', button: 'Long rest', changes: [] })]);
    from(BEN, { t: 'react', id: rested?.[0]?.id, emoji: '👍', on: true });
    await advance(100);
    expect(table?.log.entries().find((entry) => entry.kind === 'rest')).toMatchObject({ reactions: [{ emoji: '👍', by: [BEN] }] });
    online.stop();
    await advance(100);
    rests.announce(SUMMARY);
    expect(table?.log.entries().filter((entry) => entry.kind === 'rest')).toHaveLength(1);
  });

  it('shows what a rest changed to the character\'s player and the GM alone, live and in the log a player is sent again', async () => {
    const { online, socket, from } = await restingTable();
    const since = delivered(socket).length;
    rests.announce(SUMMARY);
    await advance(100);
    const rested = (player: string): Record<string, unknown> | undefined =>
      ofType(delivered(socket).slice(since), 'log-entry').map(({ body, to }) => ({ entry: body.entry as Record<string, unknown>, to }))
        .find(({ entry, to }) => entry.kind === 'rest' && (to === undefined || to === player))?.entry;
    expect(rested(ANA)).toMatchObject({ character: 'Brannoch', button: 'Short rest', changes: [{ label: 'Hit Points' }, { label: 'Hit Dice' }], skipped: ['Exhaustion'] });
    expect(rested(BEN)).toMatchObject({ character: 'Brannoch', button: 'Short rest' });
    expect(rested(BEN)).not.toHaveProperty('changes');
    expect(rested(BEN)).not.toHaveProperty('skipped');
    // Nothing the GM's log keeps beside an entry goes out.
    expect(JSON.stringify(delivered(socket))).not.toContain('restPlayers');
    // The GM's own log has it whole.
    expect(online.table?.log.entries().find((entry) => entry.kind === 'rest')).toMatchObject({ changes: [{ label: 'Hit Points' }, { label: 'Hit Dice' }] });

    // A reaction sends the entry again, to each as they may see it.
    const id = online.table?.log.entries().find((entry) => entry.kind === 'rest')?.id;
    const reacted = delivered(socket).length;
    from(BEN, { t: 'react', id, emoji: '👍', on: true });
    await advance(100);
    const again = ofType(delivered(socket).slice(reacted), 'log-entry').map(({ body, to }) => ({ entry: body.entry as Record<string, unknown>, to }));
    expect(again.find(({ to }) => to === BEN)?.entry).not.toHaveProperty('changes');
    expect(again.find(({ to }) => to === ANA)?.entry).toHaveProperty('changes');

    // Coming back, each is sent the log as they may see it.
    const back = delivered(socket).length;
    socket.relay({ t: 'player-left', id: BEN });
    socket.relay({ t: 'player-joined', id: BEN, name: 'Ben' });
    await advance(100);
    const log = ofType(delivered(socket).slice(back), 'log').filter(({ to }) => to === BEN).at(-1)?.body.entries as Record<string, unknown>[] | undefined;
    const benRest = log?.find((entry) => entry.kind === 'rest');
    expect(benRest).toMatchObject({ character: 'Brannoch' });
    expect(benRest).not.toHaveProperty('changes');
    online.stop();
  });

  it('logs no rest of a character nobody at the table plays', async () => {
    const { online } = await restingTable();
    const stranger = { id: 'npc-stranger', name: 'Stranger' };
    rests.announce({ ...SUMMARY, characterId: stranger.id, characterName: stranger.name, changes: SUMMARY.changes.map((change) => ({ ...change, character: stranger })) });
    expect(online.table?.log.entries().filter((entry) => entry.kind === 'rest')).toEqual([]);
    online.stop();
  });
});
