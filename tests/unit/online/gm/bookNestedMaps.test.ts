// @vitest-environment node
import { parseGmMessage, type BookWorldMap, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import type { WorldMapTree } from '../../../../src/app/online/gm/book/worldMapGate.ts';
import { NO_STRETCH } from '../../../../src/app/grid/mapStretch';
import { FakeSocket, png, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH_ART, delivered, nameWorldMapTree, ofType, openTable, WORLD_MAP, type Delivered } from './bookTableHarness.ts';
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

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
const TOWN = 'atlas-vtt/collections/Cairn/maps/Lowmoor.png';
const INN = 'atlas-vtt/collections/Cairn/maps/The Inn.png';
const CELLAR = 'atlas-vtt/collections/Cairn/maps/Cellar.png';
const SECRET = 'atlas-vtt/collections/Cairn/maps/Secret.png';

/** The world map leads into Lowmoor (whose scene draws its map half as wide again), Lowmoor into the inn and back out, the inn into a cellar without an image. */
const TREE: WorldMapTree = {
  root: 'world',
  levels: [
    { key: 'world', title: 'The Wide World', image: WORLD_MAP, stretch: NO_STRETCH, entrances: [{ x: 600, y: 200, to: 'town', icon: 'castle' }, { x: 5000, y: 200, to: 'town' }] },
    { key: 'town', title: 'Lowmoor', image: TOWN, stretch: { x: 1.5, y: 1 }, entrances: [{ x: 300, y: 100, to: 'inn' }, { x: 30, y: 30, to: 'world' }, { x: 60, y: 60, to: 'town' }] },
    { key: 'inn', title: 'The Inn', image: INN, stretch: NO_STRETCH, entrances: [{ x: 10, y: 10, to: 'cellar' }] },
    { key: 'cellar', title: 'Cellar', image: CELLAR, stretch: NO_STRETCH, entrances: [] },
  ],
};

function lastBook(messages: readonly Delivered[], player: string): PlayerBook | undefined {
  return ofType(messages, 'book').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book') throw new Error('a book the page would not read');
    return read.book;
  }).at(-1);
}

function answers(messages: readonly Delivered[], hash: string): { readonly served: string[]; readonly refused: string[] } {
  const of = (type: string): string[] => [...new Set(ofType(messages, type).filter(({ body }) => body.hash === hash).map(({ to }) => to))];
  return { served: of('asset-chunk'), refused: of('asset-refused') };
}

describe('the maps the world map leads into', () => {
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

  it('go to every player as entrances on their images, each map once, without a path or an asset id, and none into a map without an image', async () => {
    const { online, socket } = await openTable(new BookShelf(), PLAYERS);
    workspace.files.set(TOWN, png(400, 200));
    workspace.files.set(INN, png(100, 100));
    const since = delivered(socket).length;
    nameWorldMapTree(TREE);
    await advance(200);
    const sent = delivered(socket).slice(since);
    const map = lastBook(sent, BEN)?.worldMap as BookWorldMap;
    const [town, inn] = map.maps ?? [];
    expect(map.maps?.map((each) => each.title)).toEqual(['Lowmoor', 'The Inn']);
    // On the world map 600 of 1200 is the middle; one pin beyond the image is no entrance.
    // With the face of the GM's pin, so players see the pin the GM placed.
    expect(map.entrances).toEqual([{ x: 0.5, y: 0.25, to: town?.id, title: 'Lowmoor', icon: 'castle' }]);
    // Lowmoor's scene draws its map half as wide again, so 300 of its world is 200 of 400 pixels; a pin back to the world map leads there, one to itself nowhere.
    expect(town?.entrances).toEqual([{ x: 0.5, y: 0.5, to: inn?.id, title: 'The Inn' }, { x: 0.05, y: 0.15, to: map.id, title: 'The Wide World' }]);
    // The cellar has no image: neither it nor the way into it is sent.
    expect(inn?.entrances).toEqual([]);
    expect(lastBook(sent, ANA)?.worldMap).toEqual(map);
    const text = JSON.stringify(sent);
    for (const secret of ['world"', 'town"', 'inn"', 'collections/', 'Lowmoor.png']) expect(text).not.toContain(secret);
    online.stop();
  });

  it('are served to everyone at the table by hash, and a map no pin leads to is not', async () => {
    const { online, socket, from } = await openTable(new BookShelf(), PLAYERS);
    workspace.files.set(TOWN, png(400, 200));
    workspace.files.set(INN, png(100, 100));
    workspace.files.set(SECRET, png(50, 50));
    nameWorldMapTree(TREE);
    await advance(200);
    const [town, inn, secret] = await Promise.all([TOWN, INN, SECRET].map((path) => sha256Hex(workspace.files.get(path) as Uint8Array<ArrayBuffer>)));
    const since = delivered(socket).length;
    from(ANA, { t: 'asset-request', hash: town });
    from(BEN, { t: 'asset-request', hash: inn, maxSide: 1024 });
    from(ANA, { t: 'asset-request', hash: secret });
    await advance(500);
    const sent = delivered(socket).slice(since);
    expect(answers(sent, town!)).toEqual({ served: [ANA], refused: [] });
    expect(answers(sent, inn!)).toEqual({ served: [BEN], refused: [] });
    expect(answers(sent, secret!).served).toEqual([]);
    online.stop();
  });

  it('keep the pins a player sets on them, each on its own map', async () => {
    const shelf = new BookShelf();
    const { online, socket, from } = await openTable(shelf, PLAYERS);
    workspace.files.set(TOWN, png(400, 200));
    workspace.files.set(INN, png(100, 100));
    nameWorldMapTree(TREE);
    await advance(200);
    const town = lastBook(delivered(socket), ANA)?.worldMap?.maps?.[0]?.id;
    from(ANA, { t: 'book-pin', pin: { id: 'a'.repeat(24), map: town, x: 0.2, y: 0.3, kind: 'treasure', title: 'Well', body: '' } });
    from(ANA, { t: 'book-pin', pin: { id: 'b'.repeat(24), x: 0.4, y: 0.6, kind: 'note', title: 'Road', body: '' } });
    from(ANA, { t: 'book-pin', pin: { id: 'c'.repeat(24), map: 'not a map', x: 0.4, y: 0.6, kind: 'note', title: 'Bad', body: '' } });
    await advance(200);
    expect(shelf.of('Cairn', BRANNOCH_ART).pins).toEqual([
      { id: 'a'.repeat(24), map: town, x: 0.2, y: 0.3, kind: 'treasure', title: 'Well', body: '' },
      { id: 'b'.repeat(24), x: 0.4, y: 0.6, kind: 'note', title: 'Road', body: '' },
    ]);
    online.stop();
  });
});
