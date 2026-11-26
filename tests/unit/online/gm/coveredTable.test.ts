import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { MARKS_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { workspace } from './fakeTable.ts';
import { ANA, BEN, CAL, openTable } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { toAll, type PlayerPages } from './playerPages.ts';

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
const SHORT: Readonly<Record<string, string>> = { [ANA]: 'ana', [BEN]: 'ben', [CAL]: 'cal' };

/** Where each page's inbox stood. */
const readTo = (pages: PlayerPages): Map<string, number> => new Map([ANA, BEN, CAL].flatMap((player) => {
  try {
    return [[player, pages.of(player).inbox.length] as const];
  } catch {
    return [];
  }
}));

/** The marks each page read after `from`, each as `page via body`: `*` for one message to all, `>` for one to that page alone; ids numbered per page. */
function marksRead(pages: PlayerPages, from: ReadonlyMap<string, number>, ids: Map<string, Map<string, string>>): string[] {
  return [...readTo(pages).keys()].flatMap((player) => {
    const page = pages.of(player);
    const own = ids.get(player) ?? new Map<string, string>();
    ids.set(player, own);
    const start = from.get(player) ?? 0;
    return page.inbox.slice(start).flatMap((body, index) => {
      if (body.t !== 'marks') return [];
      const text = JSON.stringify(body).replace(/\b[0-9a-f]{24}\b/g, (id) => own.get(id) ?? (own.set(id, `#${own.size}`), own.get(id)!));
      return [`${SHORT[player]} ${page.toAll[start + index] === true ? '*' : '>'} ${text}`];
    });
  });
}

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

  it('tells the marks to the same pages in the same messages over a session of covers, joins, leaves and a new reach of the relay', async () => {
    const { online, relay, pages, from } = await openTable(new BookShelf(), PLAYERS, undefined, [...PLAYERS, { id: CAL, name: 'Cal' }]);
    relay.outbox.welcome(PLAYERS, { batch: true });
    await advance(1_000);
    const lines: string[] = [];
    const ids = new Map<string, Map<string, string>>();
    let since = readTo(pages);
    const step = (name: string): void => {
      lines.push(`# ${name}`, ...marksRead(pages, since, ids));
      since = readTo(pages);
    };
    const point = async (player: string): Promise<void> => {
      from(player, { t: 'laser', scene: String(pages.of(player).scene?.id), color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true });
      await advance(MARKS_INTERVAL_MS * 2);
    };
    await point(BEN);
    step('Ben points');
    from(ANA, { t: 'book-cover', covered: true });
    await point(BEN);
    step('Ana\'s book covers her map, Ben points');
    from(ANA, { t: 'book-cover', covered: false });
    await advance(MARKS_INTERVAL_MS * 2);
    step('Ana\'s map shows again');
    from(BEN, { t: 'book-cover', covered: true });
    await point(ANA);
    step('Ben\'s book covers his map, Ana points');
    relay.outbox.join({ id: CAL, name: 'Cal' });
    await advance(1_000);
    await point(CAL);
    step('Cal joins and points');
    relay.outbox.leave(BEN);
    await point(ANA);
    step('Ben leaves, Ana points');
    relay.outbox.join({ id: BEN, name: 'Ben' });
    await advance(1_000);
    await point(ANA);
    step('Ben comes back, Ana points');
    from(CAL, { t: 'book-cover', covered: true });
    relay.outbox.welcome([...PLAYERS, { id: CAL, name: 'Cal' }], { batch: true });
    await advance(1_000);
    await point(BEN);
    step('the GM reaches the relay anew, Ben points');
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./recordings/coveredSession.marks.txt');
    online.stop();
  });
});
