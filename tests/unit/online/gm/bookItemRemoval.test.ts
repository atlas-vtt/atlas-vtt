import { parseGmMessage, type BookItem, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { giveLoot } from '../../../../src/app/loot/lootRecipients';
import type { LootDraw } from '../../../../src/app/loot/lootRoller';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { applyBookMessage, EMPTY_BOOK, withItem } from '../../../../src/app/online/gm/book/bookStore.ts';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, CAL, delivered, keptBooks, ofType, openTable, traffic } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
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

const id = (count: number): string => count.toString(16).padStart(24, '0');
const item = (count: number): BookItem => ({ id: id(count), name: `Item ${count}`, type: null, rarity: null, tone: null, price: null, description: null, properties: [], at: count });

describe('an item a player takes out of their book, as the GM keeps it', () => {
  const held = [item(1), item(2), item(3)].reduce(withItem, EMPTY_BOOK);

  it('takes out the item the book holds, and out of the slot it lay in', () => {
    const equipped = applyBookMessage(held, { t: 'book-equip', item: id(2), slot: 'head' }, 1, new Set());
    if (equipped === null) throw new Error('not equipped');
    const book = applyBookMessage(equipped, { t: 'book-item-delete', id: id(2) }, 1, new Set());
    expect(book?.items.map((kept) => kept.id)).toEqual([id(1), id(3)]);
    expect(book?.equipped).toEqual([]);
  });

  it('refuses an item the book does not hold', () => {
    expect(applyBookMessage(held, { t: 'book-item-delete', id: id(9) }, 1, new Set())).toBeNull();
    expect(applyBookMessage(EMPTY_BOOK, { t: 'book-item-delete', id: id(1) }, 1, new Set())).toBeNull();
  });
});

const LIBRARY_HEROES = { brannoch: { assetId: 'lib-brannoch' }, mira: { assetId: 'lib-mira' } };
const BLADE: LootDraw = { id: 'draw-1', notePath: 'Items/Moon Blade.md', name: 'Moon Blade', source: ['Weapons'], rarity: 'Rare', type: 'Weapon', price: '500 thorns', description: 'Glows.', properties: [] };
const ROPE: LootDraw = { ...BLADE, id: 'draw-2', notePath: 'Items/Rope.md', name: 'Rope', rarity: 'Common', type: 'Gear', price: '1 thorn', description: 'Fifty feet.' };

/** The whole books a player was sent among these messages, as the page reads them. */
function books(messages: ReturnType<typeof delivered>, player: string): PlayerBook[] {
  return ofType(messages, 'book').filter(({ to }) => to === player).flatMap(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    return read?.t === 'book' ? [read.book] : [];
  });
}

describe('items taken out at a running table', () => {
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

  it('takes an item out of the player\'s own character\'s book only, keeps it so, and answers what it refuses with that player\'s book alone', async () => {
    const source = keptBooks();
    const shelf = new BookShelf(source);
    const players = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: CAL, name: 'Cal' }];
    const { online, socket, from } = await openTable(shelf, players, undefined, undefined, LIBRARY_HEROES);
    expect(giveLoot(ANA, BLADE)).toBe(1);
    expect(giveLoot(ANA, ROPE)).toBe(1);
    expect(giveLoot(BEN, BLADE)).toBe(1);
    const [blade, rope] = shelf.of('lib-brannoch').items.map((kept) => kept.id);
    const bens = shelf.of('lib-mira').items[0]?.id ?? '';
    from(ANA, { t: 'book-equip', item: blade, slot: 'main-hand' });
    await advance(100);

    // Ana takes her blade out: gone from her book and its slot, kept so in the campaign's file, and not echoed.
    let since = delivered(socket).length;
    from(ANA, { t: 'book-item-delete', id: blade });
    await advance(3_000);
    expect(shelf.of('lib-brannoch')).toMatchObject({ items: [{ id: rope, name: 'Rope' }], equipped: [] });
    expect(source.read('lib-brannoch')?.items.map((kept) => kept.id)).toEqual([rope]);
    expect(ofType(delivered(socket).slice(since), 'book', 'book-item')).toEqual([]);

    // Another player's item, an item no longer there, an item never given, and messages that name no item: all refused, nothing changes.
    since = delivered(socket).length;
    for (const body of [{ t: 'book-item-delete', id: bens }, { t: 'book-item-delete', id: blade }, { t: 'book-item-delete', id: id(77) }, { t: 'book-item-delete', id: '../x' }, { t: 'book-item-delete' }, { t: 'book-item-delete', id: bens.toUpperCase() }]) {
      from(ANA, body);
      await advance(100);
    }
    await advance(6_000);
    expect(shelf.of('lib-mira').items.map((kept) => kept.id)).toEqual([bens]);
    expect(shelf.of('lib-brannoch').items.map((kept) => kept.id)).toEqual([rope]);
    const answers = ofType(delivered(socket).slice(since), 'book');
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.every(({ to }) => to === ANA)).toBe(true);
    expect(books(delivered(socket).slice(since), ANA).at(-1)?.items.map(({ name }) => name)).toEqual(['Rope']);
    expect(traffic(delivered(socket).filter(({ to }) => to === ANA))).not.toContain(bens);

    // A player without a character has no book to take anything out of.
    from(CAL, { t: 'book-item-delete', id: bens });
    await advance(6_000);
    expect(shelf.of('lib-mira').items.map((kept) => kept.id)).toEqual([bens]);
    online.stop();
  });
});
