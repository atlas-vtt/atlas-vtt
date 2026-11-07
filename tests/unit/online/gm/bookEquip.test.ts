import { parseGmMessage, type BookItem, type PlayerBook, type PlayerBookMessage } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { giveLoot } from '../../../../src/app/loot/lootRecipients';
import type { LootDraw } from '../../../../src/app/loot/lootRoller';
import { BOOK_BURST } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { applyBookMessage, EMPTY_BOOK, readBooks, withItem, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH_BOOK, delivered, MIRA_BOOK, ofType, openTable, traffic } from './bookTableHarness.ts';
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
const BAG = 'b'.repeat(24);

function written(messages: readonly PlayerBookMessage[], from: StoredBook): StoredBook {
  return messages.reduce((book, message) => {
    const next = applyBookMessage(book, message, 1, new Set());
    if (next === null) throw new Error(`refused: ${message.t}`);
    return next;
  }, from);
}

describe('a book\'s slots as the GM keeps them', () => {
  const held = [item(1), item(2), item(3)].reduce(withItem, EMPTY_BOOK);

  it('puts an item the book holds into any slot it shows, one a slot, and takes it out again', () => {
    const book = written([
      { t: 'book-equip', item: id(1), slot: 'head' },
      { t: 'book-equip', item: id(2), slot: 'head' },
      { t: 'book-equip', item: id(1), slot: 'ring-1' },
    ], held);
    expect(book.equipped).toEqual([{ slot: 'head', item: id(2) }, { slot: 'ring-1', item: id(1) }]);
    expect(written([{ t: 'book-equip', item: id(2), slot: null }], book).equipped).toEqual([{ slot: 'ring-1', item: id(1) }]);
  });

  it('refuses an item the book does not hold and a slot it does not show', () => {
    expect(applyBookMessage(held, { t: 'book-equip', item: id(9), slot: 'head' }, 1, new Set())).toBeNull();
    expect(applyBookMessage(held, { t: 'book-equip', item: id(1), slot: BAG }, 1, new Set())).toBeNull();
    const hidden = written([{ t: 'book-slots', slots: { hidden: ['head'], own: [] } }], held);
    expect(applyBookMessage(hidden, { t: 'book-equip', item: id(1), slot: 'head' }, 1, new Set())).toBeNull();
  });

  it('sends an item back to the bag when its slot is hidden or removed, and keeps a book whose only change is its slots', () => {
    let book = written([
      { t: 'book-slots', slots: { hidden: [], own: [{ id: BAG, name: 'Saddlebag' }] } },
      { t: 'book-equip', item: id(1), slot: BAG },
      { t: 'book-equip', item: id(2), slot: 'feet' },
    ], held);
    book = written([{ t: 'book-slots', slots: { hidden: ['feet'], own: [{ id: BAG, name: 'Saddle bag' }] } }], book);
    expect(book.equipped).toEqual([{ slot: BAG, item: id(1) }]);
    book = written([{ t: 'book-slots', slots: { hidden: ['feet'], own: [] } }], book);
    expect(book.equipped).toEqual([]);

    const shelf = new BookShelf();
    shelf.keep('token:a', written([{ t: 'book-slots', slots: { hidden: ['ammunition'], own: [] } }], EMPTY_BOOK));
    expect(shelf.of('token:a').slots.hidden).toEqual(['ammunition']);
  });

  it('drops what an item handed over pushes out of the book from its slot', () => {
    const full = Array.from({ length: 200 }, (_, count) => item(count)).reduce(withItem, EMPTY_BOOK);
    const equipped = written([{ t: 'book-equip', item: id(0), slot: 'head' }, { t: 'book-equip', item: id(5), slot: 'neck' }], full);
    expect(withItem(equipped, item(500)).equipped).toEqual([{ slot: 'neck', item: id(5) }]);
  });

  it('reads slots back as kept, and malformed ones as the defaults with nothing equipped where it cannot lie', () => {
    const book = written([{ t: 'book-slots', slots: { hidden: ['cloak'], own: [{ id: BAG, name: 'Saddlebag' }] } }, { t: 'book-equip', item: id(3), slot: BAG }], held);
    const saved = JSON.parse(JSON.stringify({ Cairn: { 'art/a.png': book } })) as Record<string, Record<string, Record<string, unknown>>>;
    expect(readBooks(saved)).toEqual({ Cairn: { 'art/a.png': book } });

    const kept = saved.Cairn?.['art/a.png'];
    if (kept === undefined) throw new Error('no book saved');
    kept.slots = { hidden: ['tail'], own: [] };
    expect(readBooks(saved).Cairn?.['art/a.png']).toMatchObject({ slots: { hidden: [], own: [] }, equipped: [] });
    kept.slots = undefined;
    kept.equipped = [{ slot: 'head', item: id(3) }, { slot: 'head', item: id(1) }];
    expect(readBooks(saved).Cairn?.['art/a.png']?.equipped).toEqual([]);
  });
});

const DRAW: LootDraw = { id: 'draw-1', notePath: 'Items/Moon Blade.md', name: 'Moon Blade', source: ['Weapons'], rarity: 'Rare', type: 'Weapon', price: '500 thorns', description: 'Glows.', properties: [] };

/** The last whole book a player was sent, as the page reads it. */
function lastBook(socket: FakeSocket, player: string): PlayerBook | undefined {
  const read = ofType(delivered(socket), 'book').filter(({ to }) => to === player).map(({ body }) => parseGmMessage(JSON.parse(JSON.stringify(body))));
  const last = read.at(-1);
  return last?.t === 'book' ? last.book : undefined;
}

describe('slots at a running table', () => {
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

  it('keeps a player\'s slots in their own character\'s book only, and answers what it refuses with that player\'s book alone', async () => {
    const shelf = new BookShelf();
    const { online, socket, from } = await openTable(shelf, [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    expect(giveLoot(ANA, DRAW)).toBe(1);
    expect(giveLoot(BEN, DRAW)).toBe(1);
    const blade = shelf.of(BRANNOCH_BOOK).items[0]?.id ?? '';
    const bens = shelf.of(MIRA_BOOK).items[0]?.id ?? '';
    expect(lastBook(socket, ANA)).toMatchObject({ slots: { hidden: [], own: [] }, equipped: [] });

    from(ANA, { t: 'book-slots', slots: { hidden: ['ammunition'], own: [{ id: BAG, name: 'Scabbard' }] } });
    from(ANA, { t: 'book-equip', item: blade, slot: BAG });
    await advance(100);
    expect(shelf.of(BRANNOCH_BOOK)).toMatchObject({ slots: { hidden: ['ammunition'], own: [{ id: BAG, name: 'Scabbard' }] }, equipped: [{ slot: BAG, item: blade }] });

    // Ben's item is not in Ana's book, and a hidden slot takes nothing: refused, Ana alone is sent her book.
    let since = delivered(socket).length;
    from(ANA, { t: 'book-equip', item: bens, slot: 'head' });
    await advance(100);
    from(ANA, { t: 'book-equip', item: blade, slot: 'ammunition' });
    await advance(6_000);
    const answers = ofType(delivered(socket).slice(since), 'book');
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.every(({ to }) => to === ANA)).toBe(true);
    expect(lastBook(socket, ANA)).toMatchObject({ equipped: [{ slot: BAG, item: blade }], slots: { own: [{ name: 'Scabbard' }] } });
    expect(shelf.of(MIRA_BOOK)).toMatchObject({ equipped: [], slots: { hidden: [], own: [] } });

    // A flood is cut at the book's rate like any other write.
    since = delivered(socket).length;
    for (let count = 0; count < BOOK_BURST + 10; count += 1) from(BEN, { t: 'book-equip', item: bens, slot: count < BOOK_BURST ? 'head' : null });
    await advance(100);
    expect(shelf.of(MIRA_BOOK).equipped).toEqual([{ slot: 'head', item: bens }]);
    expect(ofType(delivered(socket).slice(since), 'book').map(({ to }) => to)).toEqual([BEN]);

    // Ana's slots come back with her, and nothing of them ever reached Ben.
    socket.relay({ t: 'player-left', id: ANA });
    await advance(100);
    socket.relay({ t: 'player-joined', id: ANA, name: 'Ana' });
    await advance(1_000);
    expect(lastBook(socket, ANA)).toMatchObject({ slots: { hidden: ['ammunition'], own: [{ id: BAG, name: 'Scabbard' }] }, equipped: [{ slot: BAG, item: blade }] });
    expect(traffic(delivered(socket).filter(({ to }) => to === BEN))).not.toContain('Scabbard');
    online.stop();
  });
});
