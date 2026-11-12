import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGmMessage, type BookStatblock, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { BOOK_POLL_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { setRestGate, type RestGate } from '../../../../src/app/online/gm/book/restGate.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import type { RestOffer } from '../../../../src/app/recovery/restOffer';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, cave, delivered, MIRA, openTable, traffic, type OpenTable } from './bookTableHarness.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { advanceSettled as advance } from './settled.ts';
import { StatblockNotes, templateOf } from './statblockNotes.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
// Node has no tile worker: a map's pyramid is still being cut for as long as the test runs, as on a slow device.
vi.mock('../../../../src/app/pixi/mosaicCanvas/prebuildMosaicCanvas', async (original) => ({ ...(await original<typeof import('../../../../src/app/pixi/mosaicCanvas/prebuildMosaicCanvas')>()), buildMapPyramid: () => new Promise(() => undefined) }));
vi.mock('../../../../src/app/pixi/mosaicCanvas/TesseraDecoderClient', async (original) => ({
  ...(await original<typeof import('../../../../src/app/pixi/mosaicCanvas/TesseraDecoderClient')>()),
  TesseraDecoderClient: { forApp: () => ({ levelReady: () => new Promise(() => undefined), tesseraBlobs: () => Promise.resolve([]) }), release: () => undefined },
}));
// The GM's marks draw with PIXI over Atlas's canvas, which a table of books has no use for.
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
const NOTE = 'Characters/Brannoch.md';
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'actions', label: 'Actions', type: 'entries' },
];
const BLOCKS: TemplateBlock[] = [{ id: 'list0001', type: 'entries', field: 'actions' }];
const TEMPLATE = templateOf(FIELDS, BLOCKS);

/** The note as creating a statblock from a token writes it: its markers, name and art, and nothing else yet. */
const CREATED = ['---', 'statblock: true', `atlas-template: ${TEMPLATE.id}`, 'name: Brannoch', 'image: tokens/brannoch.png', '---', ''].join('\n');
/** The note once the GM filled it in. */
const FILLED = ['---', 'statblock: true', `atlas-template: ${TEMPLATE.id}`, 'name: Brannoch', 'image: tokens/brannoch.png', 'actions:', '  - name: Cleave', '    desc: Hits twice.', '---', ''].join('\n');

/** What a player's page holds after everything sent so far: its book, and the statblock that came since (a book clears it). */
function pageOf(table: OpenTable, player: string): { readonly book: PlayerBook | undefined; readonly statblock: BookStatblock | null } {
  let book: PlayerBook | undefined;
  let statblock: BookStatblock | null = null;
  for (const { to, body } of delivered(table.socket)) {
    if (to !== player) continue;
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t === 'book') [book, statblock] = [read.book, null];
    else if (read?.t === 'book-sheet' && book !== undefined) book = { ...book, character: read.character };
    else if (read?.t === 'book-statblock') statblock = read.statblock;
  }
  return { book, statblock };
}

/** The names of the abilities a statblock shows. */
const abilities = (statblock: BookStatblock | null): string[] => (statblock?.abilities ?? []).flatMap((component) => component.tabs.flatMap((tab) => tab.entries.map((entry) => entry.name)));

describe('the statblock of a token granted to a player', () => {
  let notes: StatblockNotes;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
    notes = new StatblockNotes().install();
  });

  afterEach(() => {
    setStatblockGate(null);
    setRestGate(null);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A table where nobody owns Brannoch yet; Ben plays Mira. */
  const ungranted = (heroes: Parameters<typeof cave>[0] = {}): Promise<OpenTable> => openTable(new BookShelf(), PLAYERS, { [MIRA]: BEN }, PLAYERS, heroes);

  it('holds what the note was filled with before the grant', async () => {
    notes.put(NOTE, TEMPLATE, CREATED);
    const table = await ungranted({ brannoch: { statblockPath: NOTE } });
    notes.edit(NOTE, FILLED);
    await advance(BOOK_POLL_MS);
    table.ownership.give([BRANNOCH], {}, ANA);
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, ANA).book?.character?.name).toBe('Brannoch');
    expect(abilities(pageOf(table, ANA).statblock)).toEqual(['Cleave']);
    table.online.stop();
  });

  it('follows the note when it is filled after the grant, and when the token is linked after it', async () => {
    notes.put(NOTE, TEMPLATE, CREATED);
    const table = await ungranted();
    table.ownership.give([BRANNOCH], {}, ANA);
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, ANA).statblock).toBeNull();
    // The GM makes the statblock from the token: the token links its note.
    table.tab.store.set(cave({ brannoch: { statblockPath: NOTE } }));
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, ANA).statblock).toMatchObject({ displayName: 'Brannoch' });
    expect(abilities(pageOf(table, ANA).statblock)).toEqual([]);
    notes.edit(NOTE, FILLED);
    await advance(BOOK_POLL_MS);
    expect(abilities(pageOf(table, ANA).statblock)).toEqual(['Cleave']);
    table.online.stop();
  });

  it('reaches the player while the GM hides the token from the players, and nobody else', async () => {
    notes.put(NOTE, TEMPLATE, FILLED);
    const table = await ungranted({ brannoch: { statblockPath: NOTE, isHidden: true } });
    table.ownership.give([BRANNOCH], {}, ANA);
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, ANA).book?.character).toMatchObject({ name: 'Brannoch', resources: [{ key: 'hp', current: 7 }, { key: 'doom' }] });
    expect(abilities(pageOf(table, ANA).statblock)).toEqual(['Cleave']);
    const others = traffic(delivered(table.socket).filter(({ to }) => to !== ANA));
    for (const his of ['Brannoch', 'Cleave', 'Hits twice']) expect(others).not.toContain(his);
    // Hurt and unlinked from its note while hidden: the sheet and the statblock follow the token.
    table.tab.store.set(cave({ brannoch: { isHidden: true, resources: { hp: { current: 3, max: 12 } } } }));
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, ANA).book?.character?.resources).toMatchObject([{ key: 'hp', current: 3 }]);
    expect(pageOf(table, ANA).statblock).toBeNull();
    table.online.stop();
  });

  it('reaches the player whose token stands where the players see nothing: a token without sight in the dark', async () => {
    notes.put(NOTE, TEMPLATE, FILLED);
    const table = await ungranted({ brannoch: { statblockPath: NOTE } });
    const { tab } = table;
    // Dynamic lighting: nobody sees Brannoch, whose own sight is switched off as a placed token's is.
    tab.view.renderer = { ...tab.view.renderer, ...fakeTokenSource(() => tab.store.getState(), () => (tokenId) => (tokenId === BRANNOCH ? 'unseen' : 'seen'), () => 70) };
    table.ownership.give([BRANNOCH], {}, ANA);
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, ANA).book?.character?.name).toBe('Brannoch');
    expect(abilities(pageOf(table, ANA).statblock)).toEqual(['Cleave']);
    table.online.stop();
  });

  it('names a character the map has only ever hidden to no other player, and one hidden later by the name the map last showed', async () => {
    const MIRA_NOTE = 'Characters/Mira.md';
    notes.put(NOTE, TEMPLATE, FILLED);
    notes.put(MIRA_NOTE, TEMPLATE, FILLED.replace('name: Brannoch', 'name: Mira'));
    // Brannoch's rest has an action he may take for another character at the table.
    const offers: RestOffer[] = [{
      id: 'short', name: 'Short rest', spends: [],
      choices: [{ id: 'moves', prompt: 'Choose a move', min: 1, max: 1, repeat: false, actions: [{ id: 'tend', name: 'Tend to Wounds', text: '', forOthers: true, spends: [] }] }],
    }];
    const rests: RestGate = { offers: (path) => (path === NOTE ? offers : null), check: () => null, take: () => Promise.reject(new Error('no rest is taken here')), onRested: () => () => undefined };
    setRestGate(rests);
    const heroes = { brannoch: { statblockPath: NOTE, assetId: 'pc-brannoch' }, mira: { statblockPath: MIRA_NOTE, assetId: 'pc-mira' } };
    const hidden = (name: string): Parameters<typeof cave>[0] => ({ ...heroes, mira: { ...heroes.mira, isHidden: true, name } });
    const table = await openTable(new BookShelf(), PLAYERS, { [BRANNOCH]: ANA, [MIRA]: BEN }, PLAYERS, hidden('Mira'));
    await advance(BOOK_POLL_MS);
    const toAna = (): string => traffic(delivered(table.socket).filter(({ to }) => to !== BEN));
    expect(pageOf(table, BEN).book?.character?.name).toBe('Mira');
    expect(pageOf(table, ANA).statblock?.recovery).toHaveLength(1);
    expect(pageOf(table, ANA).statblock?.allies).toBeUndefined();
    expect(toAna()).not.toContain('Mira');
    // Shown, Mira is someone Brannoch may tend to.
    table.tab.store.set(cave(heroes));
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, ANA).statblock?.allies).toMatchObject([{ name: 'Mira' }]);
    // Hidden again and renamed: Ben reads his character as it is, Ana the name the map last showed.
    table.tab.store.set(cave(hidden('Mira the Lost')));
    await advance(BOOK_POLL_MS);
    expect(pageOf(table, BEN).book?.character?.name).toBe('Mira the Lost');
    expect(pageOf(table, ANA).statblock?.allies).toMatchObject([{ name: 'Mira' }]);
    expect(toAna()).not.toContain('Lost');
    table.online.stop();
  });
});
