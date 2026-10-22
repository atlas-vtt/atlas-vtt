import { ALL_PLAYERS, MAX_ITEM_TEXT, parseGmMessage, type BookItem, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { giveLoot, lootRecipients } from '../../../../src/app/loot/lootRecipients';
import type { LootDraw } from '../../../../src/app/loot/lootRoller';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, BRANNOCH_BOOK, BRANNOCH_ART, CAL, cave, delivered, DOOM, keptBooks, MAP, MIRA_BOOK, MIRA_ART, MIRA_DOOM, ofType, openTable, traffic, WORLD_MAP, type Delivered } from './bookTableHarness.ts';
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
const NOTE = 'a'.repeat(24);
const SECRET_NOTE = 'Ana alone knows where the idol lies';
const DRAW: LootDraw = {
  id: 'draw-7', notePath: 'Items/Vault of Secrets/Moon Blade.md', name: 'Moon Blade', source: ['Hidden Hoard', 'Weapons'], rarity: 'Rare', type: 'Weapon', price: '500 thorns',
  description: `Glows under the moon. ${'x'.repeat(MAX_ITEM_TEXT * 2)}`, properties: [{ label: 'Damage', value: '1d8' }],
};

/** The books a player was sent whole, each checked as the page reads it. */
function books(messages: readonly Delivered[], player: string): PlayerBook[] {
  return ofType(messages, 'book').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book') throw new Error('a book the page would not read');
    return read.book;
  });
}

/** The book a player holds after everything they were sent: the last whole one, with the sheets and items that followed it. */
function held(messages: readonly Delivered[], player: string): PlayerBook | null {
  return messages.filter(({ to }) => to === player).reduce<PlayerBook | null>((book, { body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t === 'book') return read.book;
    if (read?.t === 'book-sheet' && book !== null) return { ...book, character: read.character };
    return read?.t === 'book-item' && book !== null ? { ...book, items: [...book.items, read.item] } : book;
  }, null);
}

/** Heroes placed from library tokens, whose books the campaign's file can keep. */
const LIBRARY_HEROES = { brannoch: { assetId: 'lib-brannoch' }, mira: { assetId: 'lib-mira' } };

describe('the players\' books at a running table', () => {
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

  it('sends each player their own book and nobody another\'s: sheet, notes, items, no path, and a hidden resource to its own player alone', async () => {
    const shelf = new BookShelf();
    const { online, socket, from } = await openTable(shelf, PLAYERS);

    // Each player has their character's sheet, with its resources, also the one hidden from players, and the world map.
    const ana = held(delivered(socket), ANA);
    const ben = held(delivered(socket), BEN);
    expect(ana?.character).toMatchObject({ name: 'Brannoch', ring: '#aabbcc', art: { mime: 'image/png' }, resources: [{ name: 'Hit Points', colour: '#cc3333', direction: 'drains', current: 7, max: 12 }, { name: 'Doom Track', current: DOOM }] });
    expect(ben?.character).toMatchObject({ name: 'Mira', resources: [{ name: 'Hit Points', current: 4, max: 12 }, { name: 'Doom Track', current: MIRA_DOOM }] });
    expect(ana?.worldMap).toMatchObject({ width: 1200, height: 800, image: { mime: 'image/png' } });
    expect(ben?.worldMap).toEqual(ana?.worldMap);
    expect(ana?.character?.art?.hash).not.toBe(ben?.character?.art?.hash);
    expect(lootRecipients()).toEqual([{ id: ANA, name: 'Ana', character: 'Brannoch' }, { id: BEN, name: 'Ben', character: 'Mira' }]);

    // Ana writes a note and a pin and counts her coins; Ben is handed nothing of it.
    from(ANA, { t: 'book-note', note: { id: NOTE, title: 'The idol', body: SECRET_NOTE } });
    from(ANA, { t: 'book-pin', pin: { id: 'b'.repeat(24), x: 0.5, y: 0.25, kind: 'treasure', title: 'Dig here', body: '' } });
    from(ANA, { t: 'book-purse', purse: [{ name: 'Thorns', amount: 40 }] });
    // The GM hands Ana an item from the loot roller, and tries one for someone who is not there.
    expect(giveLoot(ANA, DRAW)).toBe(1);
    expect(giveLoot(CAL, DRAW)).toBe(0);
    await advance(1_000);
    const items = ofType(delivered(socket), 'book-item');
    expect(items.map(({ to }) => to)).toEqual([ANA]);
    const item = parseGmMessage(JSON.parse(JSON.stringify(items[0]?.body)));
    expect(item).toMatchObject({ t: 'book-item', item: { name: 'Moon Blade', tone: 'rare', price: '500 thorns', properties: [{ label: 'Damage', value: '1d8' }] } });
    expect([...((item as { item: BookItem }).item.description ?? '')]).toHaveLength(MAX_ITEM_TEXT);
    expect(shelf.of(BRANNOCH_BOOK)).toMatchObject({ notes: [{ id: NOTE, body: SECRET_NOTE, at: Date.now() - 1_000 }], pins: [{ kind: 'treasure' }], purse: [{ name: 'Thorns', amount: 40 }], items: [{ name: 'Moon Blade' }] });
    expect(shelf.of(MIRA_BOOK).notes).toEqual([]);

    // Ana leaves and comes back: her book holds what she wrote and was given.
    socket.relay({ t: 'player-left', id: ANA });
    await advance(100);
    expect(lootRecipients().map(({ id }) => id)).toEqual([BEN]);
    socket.relay({ t: 'player-joined', id: ANA, name: 'Ana' });
    await advance(1_000);
    const back = books(delivered(socket), ANA).at(-1);
    expect(back).toMatchObject({ character: { name: 'Brannoch' }, notes: [{ id: NOTE, title: 'The idol', body: SECRET_NOTE }], pins: [{ title: 'Dig here' }], purse: [{ name: 'Thorns', amount: 40 }], items: [{ name: 'Moon Blade' }] });

    // Nothing of a book ever went to everyone, and nothing of Ana's to Ben.
    const all = delivered(socket);
    expect(ofType(all, 'book', 'book-sheet', 'book-item').filter(({ to }) => to === ALL_PLAYERS || (to !== ANA && to !== BEN))).toEqual([]);
    const toBen = traffic(all.filter(({ to }) => to === BEN));
    for (const hers of [SECRET_NOTE, 'Dig here', 'Thorns', 'Moon Blade', NOTE, String(DOOM)]) expect(toBen).not.toContain(hers);
    expect(traffic(all.filter(({ to }) => to === ANA))).not.toContain(String(MIRA_DOOM));
    expect(books(all, BEN).every((book) => book.character?.name === 'Mira' && book.notes.length + book.items.length + book.pins.length + book.purse.length === 0)).toBe(true);
    // No vault path, no note path, no base to anyone, and nothing of the resource hidden from players to all of them.
    const sent = traffic(all);
    for (const secret of [BRANNOCH_ART, MIRA_ART, WORLD_MAP, 'The Wide World', MAP, 'collections/', 'Items/', 'Vault of Secrets', 'Hidden Hoard', 'draw-7']) expect(sent).not.toContain(secret);
    const toAll = traffic(all.filter(({ to }) => to === ALL_PLAYERS));
    for (const secret of ['Doom', String(DOOM), String(MIRA_DOOM)]) expect(toAll).not.toContain(secret);
    online.stop();
    expect(lootRecipients()).toEqual([]);
  });

  it('follows the token with the sheet alone, and takes a book away at once when the GM gives its character to someone else', async () => {
    const source = keptBooks();
    const shelf = new BookShelf(source);
    const { online, ownership, socket, tab, from } = await openTable(shelf, PLAYERS);
    from(ANA, { t: 'book-note', note: { id: NOTE, title: '', body: SECRET_NOTE } });
    await advance(100);

    // Brannoch is hurt: Ana hears it as a sheet, Ben hears nothing of a book.
    let since = delivered(socket).length;
    tab.store.set(cave({ brannoch: { resources: { hp: { current: 2, max: 12 }, doom: { current: DOOM, max: 99999 } } } }));
    await advance(1_000);
    const sheets = ofType(delivered(socket).slice(since), 'book', 'book-sheet', 'book-item');
    expect(sheets).toMatchObject([{ to: ANA, body: { t: 'book-sheet', character: { name: 'Brannoch', resources: [{ current: 2, max: 12 }, { key: 'doom' }] } } }]);

    // Hidden by the GM, the character stays Ana's as it last was; nothing is read of the hidden token.
    since = delivered(socket).length;
    tab.store.set(cave({ brannoch: { isHidden: true, name: 'Brannoch the Betrayer', resources: { hp: { current: 1, max: 12 } } } }));
    await advance(1_000);
    expect(ofType(delivered(socket).slice(since), 'book', 'book-sheet')).toEqual([]);
    expect(traffic(delivered(socket))).not.toContain('Betrayer');
    expect(lootRecipients()[0]).toEqual({ id: ANA, name: 'Ana', character: 'Brannoch' });

    // The GM gives Brannoch to Ben: Ana's book is empty at once, and she can write nothing.
    tab.store.set(cave());
    await advance(1_000);
    since = delivered(socket).length;
    ownership.give([BRANNOCH], {}, BEN);
    await advance(0);
    expect(books(delivered(socket).slice(since), ANA)).toMatchObject([{ character: null, notes: [], items: [], pins: [], purse: [] }]);
    expect(books(delivered(socket).slice(since), ANA)[0]?.worldMap).not.toBeNull();
    // Brannoch is the first token Ben has now, so its book is his: a book is its character's.
    expect(books(delivered(socket).slice(since), BEN)).toMatchObject([{ character: { name: 'Brannoch' }, notes: [{ body: SECRET_NOTE }] }]);
    from(ANA, { t: 'book-purse', purse: [{ name: 'Stolen', amount: 9 }] });
    await advance(3_000);
    expect(source.dump()).not.toContain('Stolen');
    expect(giveLoot(ANA, DRAW)).toBe(0);
    expect(lootRecipients()).toEqual([{ id: ANA, name: 'Ana', character: null }, { id: BEN, name: 'Ben', character: 'Brannoch' }]);
    online.stop();
  });

  it('finds a character\'s book again at a new table with new players, from what was kept', async () => {
    const source = keptBooks();
    const first = await openTable(new BookShelf(source), PLAYERS, undefined, undefined, LIBRARY_HEROES);
    first.from(ANA, { t: 'book-note', note: { id: NOTE, title: 'Kept', body: SECRET_NOTE } });
    expect(giveLoot(ANA, DRAW)).toBe(1);
    await advance(100);
    first.online.stop();

    // The campaign's file is all that is left; Cal joins a new table and is given Brannoch.
    const kept = new BookShelf(source);
    const second = await openTable(kept, [{ id: CAL, name: 'Cal' }], {}, undefined, LIBRARY_HEROES);
    expect(books(delivered(second.socket), CAL).at(-1)).toMatchObject({ character: null, notes: [], items: [] });
    second.ownership.give([BRANNOCH], {}, CAL);
    await advance(100);
    expect(books(delivered(second.socket), CAL).at(-1)).toMatchObject({ character: { name: 'Brannoch' }, notes: [{ id: NOTE, title: 'Kept', body: SECRET_NOTE }], items: [{ name: 'Moon Blade' }] });
    second.online.stop();
  });
});
