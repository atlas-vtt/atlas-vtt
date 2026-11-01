import { parseGmMessage, type BookPin, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import type { TokenEntity } from '../../../../src/app/types';
import { FakeSocket, present, switchScene, workspace, type FakeTab } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, BRANNOCH_ART, cave, delivered, keptBooks, MIRA, ofType, openTable, type Delivered, type OpenTable } from './bookTableHarness.ts';
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

/** The GM opens another scene in the tab and presents it. */
function showNext(tab: FakeTab, next: ReturnType<typeof sceneState>): void {
  switchScene(tab, next);
  present(tab);
}

/** The last whole book a player was sent, as the page reads it. */
function lastBook(table: OpenTable, player: string, messages: readonly Delivered[] = delivered(table.socket)): PlayerBook | undefined {
  return ofType(messages, 'book').filter(({ to }) => to === player).map(({ body }) => {
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

  it('leaves with a library character the GM gives to someone else, and reaches them', async () => {
    const heroes = { brannoch: { assetId: 'lib-brannoch' }, mira: { assetId: 'lib-mira' } };
    const table = await openTable(new BookShelf(keptBooks()), PLAYERS, {}, undefined, heroes);
    const { tokens } = table.tab.store.getState().objects;
    table.ownership.give([BRANNOCH, MIRA], tokens, ANA);
    await advance(100);
    table.from(ANA, { t: 'book-pin', pin: PIN });
    await advance(100);

    table.ownership.give([BRANNOCH], tokens, BEN);
    await advance(100);
    expect(lastBook(table, ANA)).toMatchObject({ character: { name: 'Mira' }, pins: [] });
    expect(lastBook(table, BEN)).toMatchObject({ character: { name: 'Brannoch' }, pins: [{ id: PIN.id }] });
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
