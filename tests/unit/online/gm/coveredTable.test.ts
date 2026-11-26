import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { MARKS_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { workspace } from './fakeTable.ts';
import { ANA, BEN, openTable } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { toAll } from './playerPages.ts';

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

describe('pages whose book covers their map, at a running table', () => {
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

  it('leaves a covered page out of the marks, and takes no page as covered once the GM reached the relay anew', async () => {
    const { online, relay, pages, from } = await openTable(new BookShelf(), PLAYERS);
    const welcome = async (): Promise<void> => {
      relay.outbox.welcome(PLAYERS, { batch: true });
      await advance(1_000);
    };
    await welcome();
    const scene = String(pages.of(ANA).scene?.id);
    /** Ben points: what each page heard of it, and the marks messages that went out. */
    const point = async (): Promise<{ readonly heard: Record<string, unknown[]>; readonly sent: ReturnType<typeof relay.sent> }> => {
      const since = pages.mark();
      const wire = relay.sent().length;
      from(BEN, { t: 'laser', scene, color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true });
      await advance(MARKS_INTERVAL_MS * 2);
      return { heard: pages.since(since, 'marks'), sent: relay.sent().slice(wire).filter(({ body }) => body.t === 'marks') };
    };
    from(ANA, { t: 'book-cover', covered: true });
    const covered = await point();
    expect(Object.keys(covered.heard)).toEqual([BEN]);
    await welcome();
    const after = await point();
    expect(Object.keys(after.heard).sort()).toEqual([ANA, BEN].sort());
    expect(after.sent.length).toBeGreaterThan(0);
    expect(toAll(after.sent)).toEqual(after.sent);
    online.stop();
  });

  it('sends a page the marks as they are once its book no longer covers the map', async () => {
    const { online, relay, pages, from } = await openTable(new BookShelf(), PLAYERS);
    relay.outbox.welcome(PLAYERS, { batch: true });
    await advance(1_000);
    const scene = String(pages.of(ANA).scene?.id);
    from(ANA, { t: 'book-cover', covered: true });
    from(BEN, { t: 'laser', scene, color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true });
    await advance(MARKS_INTERVAL_MS * 2);
    const since = pages.mark();
    from(ANA, { t: 'book-cover', covered: false });
    await advance(MARKS_INTERVAL_MS * 2);
    expect(pages.since(since, 'marks')[ANA]?.length).toBeGreaterThan(0);
    online.stop();
  });
});
