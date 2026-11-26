import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { CARRY_MS } from '../../../../src/app/online/gm/LiveShare.ts';
import { LIVE_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, cave, openTable } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {}, Platform: { isDesktopApp: true, isMobile: false, isPhone: false } }));
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerDrags(): void {}
    showPlayerCursors(): void {}
    showPlayerStrokes(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];

describe('a drag that rests while the socket is busy', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps reaching the pages through the live lane while the token list waits behind other messages', async () => {
    const { online, relay, pages, tab } = await openTable(new BookShelf(), PLAYERS);
    const held = (x: number): ReturnType<typeof cave> => ({ ...cave({ brannoch: { x } }), heldTokens: { [BRANNOCH]: { x: 140, y: 140 } } });
    for (let step = 1; step <= 10; step += 1) {
      tab.store.set(held(140 + step * 10));
      await advance(LIVE_INTERVAL_MS);
    }
    // Artwork or a join fills the socket: ordinary messages wait while live ones still go (`sendBatch`), so a resting drag keeps going out on the live lane.
    const since = relay.sent().length;
    await advance(3_000);
    const during = relay.sent().slice(since);
    const places = during.flatMap(({ body, live }) => (body.t === 'live' && live === true ? body.tokens : []));
    expect(places.length).toBeGreaterThanOrEqual(Math.floor(3_000 / CARRY_MS) - 1);
    expect(places.every((place) => place.x === 240 && place.end === undefined)).toBe(true);
    expect(places.length).toBeLessThanOrEqual(Math.ceil(3_000 / CARRY_MS));
    // The list, which waits behind a full socket, lands the resting place the ordinary way.
    const lists = during.filter(({ body }) => body.t === 'tokens' || body.t === 'delta');
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every(({ live }) => live === undefined)).toBe(true);
    expect(pages.of(ANA).tokens.find(({ name }) => name === 'Brannoch')?.x).toBe(240);
    // Let go of: the keep-alive stops.
    tab.store.set(cave({ brannoch: { x: 240 } }));
    await advance(LIVE_INTERVAL_MS);
    const dropped = relay.sent().length;
    await advance(3 * CARRY_MS);
    expect(relay.sent().slice(dropped).filter(({ body }) => body.t === 'live')).toEqual([]);
    online.stop();
  });
});
