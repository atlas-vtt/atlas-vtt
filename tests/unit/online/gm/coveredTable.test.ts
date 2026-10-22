import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { MARKS_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, openTable } from './bookTableHarness.ts';
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

/** Every game message the socket was given, in order, with whom it went to: single sends and batches alike. */
function bodies(socket: FakeSocket): { readonly to: string; readonly t: string; readonly body: Record<string, unknown> }[] {
  return socket.sent.flatMap((text) => {
    if (!text.startsWith('{')) return [];
    const frame = JSON.parse(text) as { t: string; to?: string; body?: Record<string, unknown>; sends?: { to?: string; body: Record<string, unknown> }[] };
    const sends = frame.t === 'send' && frame.body !== undefined ? [{ to: frame.to, body: frame.body }] : frame.t === 'sends' ? frame.sends ?? [] : [];
    return sends.map(({ to, body }) => ({ to: to ?? '*', t: String(body.t), body }));
  });
}

describe('pages whose book covers their map, at a running table', () => {
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

  it('leaves a covered page out of the marks, and takes no page as covered once the GM reached the relay anew', async () => {
    const { online, socket, from } = await openTable(new BookShelf(), PLAYERS);
    const welcome = async (): Promise<void> => {
      socket.relay({ t: 'welcome', role: 'gm', players: PLAYERS, batch: true });
      await advance(1_000);
    };
    await welcome();
    const scene = String((bodies(socket).filter(({ t }) => t === 'scene').at(-1)?.body.scene as { id?: string } | undefined)?.id);
    const point = async (): Promise<ReturnType<typeof bodies>> => {
      const since = bodies(socket).length;
      from(BEN, { t: 'laser', scene, color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true });
      await advance(MARKS_INTERVAL_MS * 2);
      return bodies(socket).slice(since).filter(({ t }) => t === 'marks');
    };
    from(ANA, { t: 'book-cover', covered: true });
    const covered = await point();
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.every(({ to }) => to === BEN)).toBe(true);
    await welcome();
    const after = await point();
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(({ to }) => to === '*')).toBe(true);
    online.stop();
  });

  it('sends a page the marks as they are once its book no longer covers the map', async () => {
    const { online, socket, from } = await openTable(new BookShelf(), PLAYERS);
    socket.relay({ t: 'welcome', role: 'gm', players: PLAYERS, batch: true });
    await advance(1_000);
    const scene = String((bodies(socket).filter(({ t }) => t === 'scene').at(-1)?.body.scene as { id?: string } | undefined)?.id);
    from(ANA, { t: 'book-cover', covered: true });
    from(BEN, { t: 'laser', scene, color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true });
    await advance(MARKS_INTERVAL_MS * 2);
    const since = bodies(socket).length;
    from(ANA, { t: 'book-cover', covered: false });
    await advance(MARKS_INTERVAL_MS * 2);
    expect(bodies(socket).slice(since).some(({ t, to }) => t === 'marks' && to === ANA)).toBe(true);
    online.stop();
  });
});
