import { MAX_BOOK_ITEMS, MAX_ITEM_TEXT, parseGmMessage, type BookItem } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { BOOK_BURST, REFUSAL_BOOK_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { EMPTY_BOOK, withItem } from '../../../../src/app/online/gm/book/bookStore.ts';
import { FakeSocket, png, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH_BOOK, BRANNOCH_ART, CAL, cave, delivered, keptBooks, MIRA_ART, nameWorldMap, ofType, openTable, vaultFiles, WORLD_MAP, type Delivered } from './bookTableHarness.ts';
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
/** The campaign also has Cal, who joins the table later. */
const WITH_CAL = [...PLAYERS, { id: CAL, name: 'Cal' }];
const id = (count: number): string => count.toString(16).padStart(24, '0');
const hashOf = (path: string): Promise<string> => sha256Hex(vaultFiles().get(path) as Uint8Array<ArrayBuffer>);

/** Who was sent chunks of an asset, and who was refused it. */
function answers(messages: readonly Delivered[], hash: string): { readonly served: string[]; readonly refused: string[] } {
  const of = (type: string): string[] => [...new Set(ofType(messages, type).filter(({ body }) => body.hash === hash).map(({ to }) => to))];
  return { served: of('asset-chunk'), refused: of('asset-refused') };
}

describe('what a player\'s book lets them ask for and write', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('serves a character\'s artwork to its own player while the scene hides it, the world map to everyone, and nobody another character\'s', async () => {
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS, undefined, WITH_CAL);
    const [brannoch, mira, world] = await Promise.all([hashOf(BRANNOCH_ART), hashOf(MIRA_ART), hashOf(WORLD_MAP)]);

    // The GM hides Brannoch: no picture shows the token any more, and its sheet stays Ana's.
    tab.store.set(cave({ brannoch: { isHidden: true } }));
    await advance(1_500);
    let since = delivered(socket).length;
    from(BEN, { t: 'asset-request', hash: brannoch });
    from(ANA, { t: 'asset-request', hash: brannoch });
    from(ANA, { t: 'asset-request', hash: mira });
    from(BEN, { t: 'asset-request', hash: world, maxSide: 4096 });
    await advance(500);
    let sent = delivered(socket).slice(since);
    expect(answers(sent, brannoch)).toEqual({ served: [ANA], refused: [BEN] });
    // Mira stands in the scene, so the scene's picture gives her artwork to Ana as it always did.
    expect(answers(sent, mira)).toEqual({ served: [ANA], refused: [] });
    expect(answers(sent, world)).toEqual({ served: [BEN], refused: [] });

    // Mira hidden too: Ana has no claim to her artwork, Ben still has.
    tab.store.set(cave({ brannoch: { isHidden: true }, mira: { isHidden: true } }));
    await advance(11_000);
    since = delivered(socket).length;
    from(ANA, { t: 'asset-request', hash: mira });
    from(BEN, { t: 'asset-request', hash: mira });
    // The same request over and over is one request.
    for (let again = 0; again < 20; again += 1) from(BEN, { t: 'asset-request', hash: mira });
    await advance(500);
    sent = delivered(socket).slice(since);
    expect(answers(sent, mira)).toEqual({ served: [BEN], refused: [ANA] });
    expect(ofType(sent, 'asset-chunk')).toHaveLength(1);

    // Someone at the table without a book of their own gets the world map and no character's artwork.
    socket.relay({ t: 'player-joined', id: CAL, name: 'Cal' });
    await advance(500);
    since = delivered(socket).length;
    from(CAL, { t: 'asset-request', hash: world });
    from(CAL, { t: 'asset-request', hash: brannoch });
    await advance(500);
    sent = delivered(socket).slice(since);
    expect(answers(sent, world).served).toEqual([CAL]);
    expect(answers(sent, brannoch)).toEqual({ served: [], refused: [CAL] });
    online.stop();
  });

  it('refuses a flood of writes, a write that is malformed and one of a player without a character, each answered with the whole book', async () => {
    const source = keptBooks();
    const shelf = new BookShelf(source);
    const { online, socket, from } = await openTable(shelf, PLAYERS, undefined, WITH_CAL);
    socket.relay({ t: 'player-joined', id: CAL, name: 'Cal' });
    await advance(REFUSAL_BOOK_MS);

    let since = delivered(socket).length;
    for (let count = 0; count < 500; count += 1) from(ANA, { t: 'book-note', note: { id: id(count), title: `Note ${count}`, body: '' } });
    await advance(REFUSAL_BOOK_MS + 500);
    expect(shelf.of(BRANNOCH_BOOK).notes.map((note) => note.id)).toEqual(Array.from({ length: BOOK_BURST }, (_, count) => id(count)));
    // Two books for the whole flood, at its first refusal and once it is over, holding what was kept; the other players hear nothing.
    let books = ofType(delivered(socket).slice(since), 'book');
    expect(books.map(({ to }) => to)).toEqual([ANA, ANA]);
    expect((books[1]?.body.book as { notes: unknown[] }).notes).toHaveLength(BOOK_BURST);

    // After a while she writes again; what is no note is refused, and nothing of it is kept.
    await advance(30_000);
    since = delivered(socket).length;
    from(ANA, { t: 'book-note', note: { id: 'not an id', title: 'Bad', body: 'Bad' } });
    from(ANA, { t: 'book-pin', pin: { id: id(900), x: 4, y: 0, kind: 'danger', title: 'Off the map', body: '' } });
    from(ANA, { t: 'book-purse', purse: [{ name: 'Gold', amount: 1.5 }] });
    from(ANA, { t: 'book-note', note: { id: id(901), title: 'Good', body: 'Kept' } });
    await advance(REFUSAL_BOOK_MS + 500);
    const kept = shelf.of(BRANNOCH_BOOK);
    expect(kept.notes).toHaveLength(BOOK_BURST + 1);
    expect(kept.pins).toEqual([]);
    expect(kept.purse).toEqual([]);
    // The first refusal is answered at once, the others with one book later, which has the note written since.
    books = ofType(delivered(socket).slice(since), 'book');
    expect(books.map(({ to }) => to)).toEqual([ANA, ANA]);
    expect(JSON.stringify(books)).not.toContain('Bad');
    expect(JSON.stringify(books[1]?.body)).toContain('Kept');

    // Cal plays nobody: what he writes is kept nowhere, and his book stays empty.
    since = delivered(socket).length;
    from(CAL, { t: 'book-note', note: { id: id(950), title: 'Mine', body: 'Nobody keeps this' } });
    await advance(REFUSAL_BOOK_MS + 500);
    expect(source.dump()).not.toContain('Nobody keeps this');
    expect(ofType(delivered(socket).slice(since), 'book')).toMatchObject([{ to: CAL, body: { book: { character: null, notes: [] } } }]);
    online.stop();
  });

  it('sends a book too large for one frame in parts, to its player alone', async () => {
    const shelf = new BookShelf();
    const item = (count: number): BookItem => ({ id: id(count), name: `Item ${count}`, type: null, rarity: null, tone: null, price: null, description: 'ß'.repeat(MAX_ITEM_TEXT), properties: [], at: count });
    shelf.keep(BRANNOCH_BOOK, Array.from({ length: MAX_BOOK_ITEMS }, (_, count) => item(count)).reduce(withItem, EMPTY_BOOK));
    const { online, socket } = await openTable(shelf, PLAYERS);
    await advance(5_000);
    const parts = socket.frames().filter((frame) => frame.body?.t === 'part');
    expect(parts.length).toBeGreaterThan(4);
    expect(parts.every((frame) => frame.to === ANA)).toBe(true);
    const book = ofType(delivered(socket), 'book').filter(({ to }) => to === ANA).at(-1);
    const read = parseGmMessage(book?.body);
    expect(read?.t === 'book' ? read.book.items.length : 0).toBe(MAX_BOOK_ITEMS);
    online.stop();
  });

  it('sends everyone the world map anew when the campaign played names another, and none for a file players cannot be sent', async () => {
    const { online, socket } = await openTable(new BookShelf(), PLAYERS);
    const maps = (messages: readonly Delivered[]): unknown[] => ofType(messages, 'book').map(({ to, body }) => [to, (body.book as { worldMap: { width: number } | null }).worldMap?.width ?? null]);

    workspace.files.set('maps/other world.png', png(640, 480));
    let since = delivered(socket).length;
    nameWorldMap('maps/other world.png');
    await advance(100);
    expect(maps(delivered(socket).slice(since))).toEqual([[ANA, 640], [BEN, 640]]);

    // An image that is no artwork of the map the campaign names is no map, whatever its file says: a sync tool or a hand edit may have written it.
    workspace.files.set('Private/Passport.png', png(30, 40));
    for (const unsendable of ['maps/missing.png', 'maps/world.svg', 'Private/Passport.png', null]) {
      workspace.files.set('maps/world.svg', png(10, 10));
      nameWorldMap('maps/other world.png');
      await advance(100);
      since = delivered(socket).length;
      nameWorldMap(unsendable);
      await advance(100);
      expect(maps(delivered(socket).slice(since))).toEqual([[ANA, null], [BEN, null]]);
    }
    // A file that is no image at all is no map either.
    workspace.files.set('maps/broken.png', new Uint8Array([1, 2, 3]));
    since = delivered(socket).length;
    nameWorldMap('maps/broken.png');
    await advance(100);
    expect(maps(delivered(socket).slice(since))).toEqual([]);
    online.stop();
  });

  it('sends no world map while no campaign is played, and the campaign\'s once one is, also while the scene is loading', async () => {
    const { online, socket, tab } = await openTable(new BookShelf(), PLAYERS);
    const maps = (messages: readonly Delivered[]): unknown[] => ofType(messages, 'book').map(({ to, body }) => [to, (body.book as { worldMap: { width: number } | null }).worldMap?.width ?? null]);

    let since = delivered(socket).length;
    nameWorldMap(null);
    await advance(100);
    expect(maps(delivered(socket).slice(since))).toEqual([[ANA, null], [BEN, null]]);

    tab.store.set({ ...cave(), isMapLoading: true });
    await advance(1_000);
    since = delivered(socket).length;
    nameWorldMap(WORLD_MAP);
    await advance(100);
    expect(maps(delivered(socket).slice(since))).toEqual([[ANA, 1200], [BEN, 1200]]);
    // The same image named again is not read or sent again.
    since = delivered(socket).length;
    nameWorldMap(WORLD_MAP);
    await advance(100);
    expect(maps(delivered(socket).slice(since))).toEqual([]);
    online.stop();
  });
});
