import { MAX_BOOK_NOTES, parseGmMessage, type BookNote, type BookPin, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFUSAL_BOOK_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { EMPTY_BOOK, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';
import { ownBookOf } from '../../../../src/app/online/gm/book/playerWritings.ts';
import { setQuestGate } from '../../../../src/app/online/gm/book/questGate.ts';
import type { TokenEntity } from '../../../../src/app/types';
import { FakeSocket, present, switchScene, workspace, type FakeTab } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, BRANNOCH_ART, cave, delivered, holdWorldMap, keptBooks, MIRA, ofType, openTable, type OpenTable } from './bookTableHarness.ts';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
// The GM's marks draw with PIXI over Atlas's canvas, which a table of books has no use for.
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerDrags(): void {}
    showPlayerCursors(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
const PIN: BookPin = { id: 'a'.repeat(24), x: 0.25, y: 0.75, kind: 'note', title: 'The ford', body: 'Ana crossed here' };
const ENCOUNTER_TOKEN = 'tok-brannoch-in-the-fen';
const FEN = 'atlas-vtt/collections/Cairn/scenes/Fen.atlasmap';

/** Another scene, holding `tokens`: what the GM presents next. */
function fen(tokens: readonly TokenEntity[]): ReturnType<typeof sceneState> {
  return sceneState({ mapPath: FEN, background: 'maps/cave.png', objects: { ...sceneState().objects, tokens: Object.fromEntries(tokens.map((token) => [token.id, token])) } });
}

const fenToken = (changes: Partial<TokenEntity> = {}): TokenEntity => ({ id: ENCOUNTER_TOKEN, kind: 'character', name: 'Brannoch', imagePath: BRANNOCH_ART, x: 70, y: 70, ...changes } as TokenEntity);

const pinAt = (count: number): BookPin => ({ ...PIN, id: count.toString(16).padStart(24, '0'), title: `Pin ${count}` });
const noteAt = (count: number): BookNote => ({ id: count.toString(16).padStart(24, '0'), title: `Note ${count}`, body: '', at: count });
const bookWith = (changes: Partial<StoredBook>): StoredBook => ({ ...EMPTY_BOOK, ...changes });
const HEROES = { brannoch: { assetId: 'lib-brannoch' }, mira: { assetId: 'lib-mira' } };

/** The GM opens another scene in the tab and presents it. */
function showNext(tab: FakeTab, next: ReturnType<typeof sceneState>): void {
  switchScene(tab, next);
  present(tab);
}

/** The last whole book a player was sent, as the page reads it. */
function lastBook(table: OpenTable, player: string): PlayerBook | undefined {
  return ofType(delivered(table.socket), 'book').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book') throw new Error('a book the page would not read');
    return read.book;
  }).at(-1);
}

describe('what a player wrote on the world map, whichever scene the GM presents', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    setQuestGate(null);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays when the next scene holds another token of theirs placed from no library token, and is kept in the campaign', async () => {
    const source = keptBooks();
    const table = await openTable(new BookShelf(source), PLAYERS, { [BRANNOCH]: ANA, [ENCOUNTER_TOKEN]: ANA });
    table.from(ANA, { t: 'book-pin', pin: PIN });
    await advance(100);

    showNext(table.tab, fen([fenToken()]));
    await advance(1_000);
    expect(lastBook(table, ANA)).toMatchObject({ character: { name: 'Brannoch' }, pins: [{ id: PIN.id, title: 'The ford' }] });
    expect(source.dump()).toContain('The ford');
    expect(JSON.stringify(lastBook(table, BEN) ?? {})).not.toContain('The ford');
    table.online.stop();
  });

  it('stays when the next scene holds another library token of theirs, and an edit goes to the book that holds it', async () => {
    const source = keptBooks();
    const heroes = { brannoch: { assetId: 'lib-brannoch' } };
    const wolf = fenToken({ assetId: 'lib-wildshape', name: 'Wolf' });
    const table = await openTable(new BookShelf(source), PLAYERS, {}, undefined, heroes);
    table.ownership.give([BRANNOCH], { [BRANNOCH]: { assetId: 'lib-brannoch' } }, ANA);
    table.ownership.give([ENCOUNTER_TOKEN], { [ENCOUNTER_TOKEN]: { assetId: 'lib-wildshape' } }, ANA);
    await advance(100);
    table.from(ANA, { t: 'book-pin', pin: PIN });
    await advance(100);

    showNext(table.tab, fen([wolf]));
    await advance(1_000);
    expect(lastBook(table, ANA)).toMatchObject({ character: { name: 'Wolf' }, pins: [{ id: PIN.id }] });

    // Moved while she plays the other form: one pin, in the one book, at its new place.
    table.from(ANA, { t: 'book-pin', pin: { ...PIN, x: 0.5 } });
    await advance(3_000);
    showNext(table.tab, cave(heroes));
    await advance(1_000);
    expect(lastBook(table, ANA)?.pins).toMatchObject([{ id: PIN.id, x: 0.5 }]);
    expect(source.dump().match(/The ford/g)).toHaveLength(1);

    table.from(ANA, { t: 'book-pin-delete', id: PIN.id });
    showNext(table.tab, fen([wolf]));
    await advance(3_000);
    expect(lastBook(table, ANA)?.pins).toEqual([]);
    expect(source.dump()).not.toContain('The ford');
    table.online.stop();
  });

  it('comes back at a new table while the scene holds no token of theirs: the page gets it without a character', async () => {
    const source = keptBooks();
    const first = await openTable(new BookShelf(source), PLAYERS, { [BRANNOCH]: ANA });
    first.from(ANA, { t: 'book-pin', pin: PIN });
    await advance(100);
    first.online.stop();

    const second = await openTable(new BookShelf(source), PLAYERS, {});
    expect(lastBook(second, ANA)).toMatchObject({ character: null, pins: [{ id: PIN.id, title: 'The ford' }], items: [] });
    expect(JSON.stringify(lastBook(second, BEN) ?? {})).not.toContain('The ford');
    second.online.stop();
  });

  it('goes to the player\'s own book, so it stays when the GM takes a borrowed token back', async () => {
    const source = keptBooks();
    const table = await openTable(new BookShelf(source), PLAYERS, {}, undefined, { mira: { assetId: 'lib-hireling' } });
    table.ownership.give([MIRA], table.tab.store.getState().objects.tokens, ANA);
    await advance(100);
    expect(lastBook(table, ANA)?.character?.name).toBe('Mira');
    table.from(ANA, { t: 'book-pin', pin: PIN });
    await advance(3_000);

    table.ownership.give([MIRA], table.tab.store.getState().objects.tokens, BEN);
    await advance(100);
    expect(lastBook(table, ANA)).toMatchObject({ character: null, pins: [{ id: PIN.id }] });
    expect(lastBook(table, BEN)).toMatchObject({ character: { name: 'Mira' }, pins: [] });
    expect(new BookShelf(source).of(ownBookOf(ANA)).pins).toMatchObject([{ id: PIN.id }]);
    table.online.stop();
  });

  it('keeps a pin that waited for the GM, who comes back on a scene without the player\'s token', async () => {
    const source = keptBooks();
    const table = await openTable(new BookShelf(source), PLAYERS, {});
    expect(lastBook(table, ANA)?.character).toBeNull();

    const before = delivered(table.socket).length;
    table.from(ANA, { t: 'book-pin', pin: PIN });
    table.from(ANA, { t: 'book-note', note: { id: 'c'.repeat(24), title: 'Waited', body: 'on the road' } });
    await advance(1_000);
    expect(ofType(delivered(table.socket).slice(before), 'book')).toEqual([]);
    table.online.stop();

    const again = await openTable(new BookShelf(source), PLAYERS, {});
    expect(lastBook(again, ANA)).toMatchObject({ pins: [{ id: PIN.id }], notes: [{ title: 'Waited' }] });
    again.online.stop();
  });

  it('lets what arrives before the quests are read wait for them: a note on a quest, a purse', async () => {
    const quest = 'd'.repeat(24);
    setQuestGate({ quests: () => Promise.resolve([{ id: quest, kind: 'main', state: 'open', title: 'The crown', body: '', place: null, xp: 0, rewards: [] }]), asset: () => undefined, onChange: () => () => {} });
    const release = holdWorldMap();
    const table = await openTable(new BookShelf(keptBooks()), PLAYERS);
    table.from(ANA, { t: 'book-note', note: { id: 'c'.repeat(24), title: '', body: 'Ask the abbot', quest } });
    table.from(ANA, { t: 'book-purse', purse: [{ name: 'Thorns', amount: 3 }] });
    await advance(100);
    release();
    await advance(1_000);
    expect(lastBook(table, ANA)).toMatchObject({ character: { name: 'Brannoch' }, notes: [{ body: 'Ask the abbot', quest }], purse: [{ name: 'Thorns', amount: 3 }] });
    table.online.stop();
  });

  it('keeps what arrived before the first pass when its player has left since', async () => {
    const release = holdWorldMap();
    const shelf = new BookShelf(keptBooks());
    const table = await openTable(shelf, PLAYERS);
    table.from(ANA, { t: 'book-pin', pin: PIN });
    await advance(100);
    table.socket.relay({ t: 'player-left', id: ANA });
    release();
    await advance(1_000);
    expect(shelf.of(ownBookOf(ANA)).pins).toMatchObject([{ id: PIN.id }]);
    table.online.stop();
  });

  it('leaves a character another player plays right now to that player; a character handed over takes its older entries along', async () => {
    const shelf = new BookShelf(keptBooks());
    shelf.keep('lib-brannoch', bookWith({ pins: [PIN] }));
    const table = await openTable(shelf, PLAYERS, {}, undefined, HEROES);
    const cavern = table.tab.store.getState().objects.tokens;
    table.ownership.give([BRANNOCH], cavern, ANA);
    await advance(100);
    expect(lastBook(table, ANA)).toMatchObject({ character: { name: 'Brannoch' }, pins: [{ id: PIN.id }] });

    // A scene without the token, and it is Ben's now: Ana still plays it there, so its book is still hers alone.
    showNext(table.tab, fen([]));
    await advance(1_000);
    table.ownership.give([BRANNOCH], cavern, BEN);
    await advance(1_000);
    expect(lastBook(table, ANA)).toMatchObject({ character: { name: 'Brannoch' }, pins: [{ id: PIN.id }] });
    expect(JSON.stringify(lastBook(table, BEN))).not.toContain('The ford');
    table.from(BEN, { t: 'book-pin-delete', id: PIN.id });
    table.from(ANA, { t: 'book-pin', pin: { ...pinAt(1), title: 'Ana\'s own' } });
    await advance(100);
    expect(shelf.of('lib-brannoch').pins).toMatchObject([{ id: PIN.id }]);

    // The token is back: the character is Ben's, with what it held, and Ana keeps what she wrote since.
    showNext(table.tab, cave(HEROES));
    await advance(1_000);
    expect(lastBook(table, BEN)).toMatchObject({ character: { name: 'Brannoch' }, pins: [{ id: PIN.id }] });
    expect(JSON.stringify(lastBook(table, BEN))).not.toContain('Ana\'s own');
    expect(lastBook(table, ANA)).toMatchObject({ pins: [{ title: 'Ana\'s own' }] });
    table.online.stop();
  });

  it('takes a deleted entry out of every book of the player that holds it, and an edit into all of them', async () => {
    const shelf = new BookShelf(keptBooks());
    const twice = bookWith({ pins: [PIN, pinAt(1)], notes: [noteAt(2)] });
    shelf.keep('lib-brannoch', twice);
    shelf.keep('lib-mira', twice);
    const table = await openTable(shelf, PLAYERS, {}, undefined, HEROES);
    table.ownership.give([BRANNOCH, MIRA], table.tab.store.getState().objects.tokens, ANA);
    await advance(100);
    expect(lastBook(table, ANA)?.pins).toHaveLength(2);

    table.from(ANA, { t: 'book-pin-delete', id: PIN.id });
    table.from(ANA, { t: 'book-note-delete', id: noteAt(2).id });
    table.from(ANA, { t: 'book-pin', pin: { ...pinAt(1), title: 'Moved' } });
    await advance(100);
    // Read in another order, the other book's copy would be the one to come back.
    showNext(table.tab, fen([fenToken({ assetId: 'lib-mira', name: 'Mira' })]));
    await advance(1_000);

    expect(lastBook(table, ANA)).toMatchObject({ character: { name: 'Mira' }, notes: [], pins: [{ id: pinAt(1).id, title: 'Moved' }] });
    for (const book of ['lib-brannoch', 'lib-mira']) expect(shelf.of(book)).toMatchObject({ notes: [], pins: [{ title: 'Moved' }] });
    table.online.stop();
  });

  it('keeps the player able to write once their books hold more than a page takes, cutting the oldest of the characters\' books', async () => {
    const shelf = new BookShelf(keptBooks());
    shelf.keep('lib-brannoch', bookWith({ notes: Array.from({ length: 58 }, (_, count) => noteAt(count + 1)) }));
    shelf.keep(ownBookOf(ANA), bookWith({ notes: [noteAt(100)] }));
    const table = await openTable(shelf, PLAYERS, {}, undefined, HEROES);
    table.ownership.give([BRANNOCH], table.tab.store.getState().objects.tokens, ANA);
    await advance(100);
    expect(lastBook(table, ANA)?.notes).toHaveLength(MAX_BOOK_NOTES - 1);

    // The page now holds the most it takes: it is sent its book again, with room, and nothing kept was lost.
    table.from(ANA, { t: 'book-note', note: { id: noteAt(101).id, title: 'Newest', body: '' } });
    await advance(REFUSAL_BOOK_MS);
    const titles = lastBook(table, ANA)?.notes.map((note) => note.title);
    expect(titles).toHaveLength(MAX_BOOK_NOTES - 1);
    expect(titles?.slice(-2)).toEqual(['Note 100', 'Newest']);
    expect(titles).not.toContain('Note 1');
    expect(shelf.of('lib-brannoch').notes).toHaveLength(58);
    table.online.stop();
  });

  it('keeps the map a pin set on a map the world map leads into names', async () => {
    const table = await openTable(new BookShelf(keptBooks()), PLAYERS, { [BRANNOCH]: ANA, [ENCOUNTER_TOKEN]: ANA });
    const nested = { ...PIN, map: 'b'.repeat(24) };
    table.from(ANA, { t: 'book-pin', pin: nested });
    await advance(100);
    showNext(table.tab, fen([fenToken()]));
    await advance(1_000);
    expect(lastBook(table, ANA)?.pins).toEqual([nested]);
    table.online.stop();
  });
});
