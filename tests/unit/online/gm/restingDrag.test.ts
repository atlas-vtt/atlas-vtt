import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { CARRY_MS } from '../../../../src/app/online/gm/LiveShare.ts';
import { BULK_BUFFERED } from '../../../../src/app/online/gm/sendQueue.ts';
import { LIVE_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, cave, openTable } from './bookTableHarness.ts';
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

/** The game messages written to the socket from `since` on, single sends and batches alike. */
function bodies(socket: FakeSocket, since = 0): Record<string, unknown>[] {
  return socket.sent.slice(since).flatMap((text) => {
    if (!text.startsWith('{')) return [];
    const frame = JSON.parse(text) as { t: string; body?: Record<string, unknown>; sends?: { body: Record<string, unknown> }[] };
    return frame.t === 'send' && frame.body !== undefined ? [frame.body] : frame.t === 'sends' ? (frame.sends ?? []).map(({ body }) => body) : [];
  });
}

describe('a drag that rests while the socket is busy', () => {
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

  it('keeps reaching the pages through the live lane while the token list waits behind other messages', async () => {
    const { online, socket, tab } = await openTable(new BookShelf(), PLAYERS);
    const held = (x: number): ReturnType<typeof cave> => ({ ...cave({ brannoch: { x } }), heldTokens: { [BRANNOCH]: { x: 140, y: 140 } } });
    for (let step = 1; step <= 10; step += 1) {
      tab.store.set(held(140 + step * 10));
      await advance(LIVE_INTERVAL_MS);
    }
    // Artwork or a join fills the socket: ordinary messages wait, live ones still go.
    socket.bufferedAmount = BULK_BUFFERED * 2;
    const since = socket.sent.length;
    await advance(3_000);
    const during = bodies(socket, since);
    const places = during.filter((body) => body.t === 'live').flatMap((body) => body.tokens as { x: number; end?: true }[]);
    expect(places.length).toBeGreaterThanOrEqual(Math.floor(3_000 / CARRY_MS) - 1);
    expect(places.every((place) => place.x === 240 && place.end === undefined)).toBe(true);
    expect(places.length).toBeLessThanOrEqual(Math.ceil(3_000 / CARRY_MS));
    expect(during.some((body) => body.t === 'tokens' || body.t === 'delta')).toBe(false);
    // The socket drains: the list lands the resting place.
    socket.bufferedAmount = 0;
    const drained = socket.sent.length;
    await advance(500);
    expect(bodies(socket, drained).some((body) => body.t === 'delta' || body.t === 'tokens')).toBe(true);
    // Let go of: the keep-alive stops.
    tab.store.set(cave({ brannoch: { x: 240 } }));
    await advance(LIVE_INTERVAL_MS);
    const dropped = socket.sent.length;
    await advance(3 * CARRY_MS);
    expect(bodies(socket, dropped).filter((body) => body.t === 'live')).toEqual([]);
    online.stop();
  });
});
