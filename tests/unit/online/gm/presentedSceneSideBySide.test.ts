// @vitest-environment jsdom
import type { LocalPlayerView } from '../../../../src/app/local-player-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { presentTab, restorePlayerWindow } from '../../../../src/app/services/PlayerWindowPresenter';
import { presentedSceneOf } from '../../../../src/app/services/presentedScene';
import { FakePlayerWindow } from './fakePlayerWindow.ts';
import { FakeRelay } from './fakeRelay.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import { storedAccount, workspace } from './fakeTable.ts';
import { CAVE, closeView, CRYPT, deferredView, FILES, HALL, openNote, openView, resetViews, rigApp, tableSent, tabNamed, viewNamed, type RigView } from './presentedSceneRig.ts';
import { advanceSettled as advance } from './settled.ts';

/*
 * Both readers of the presented scene side by side, as they are: what the player window shows and what a running
 * table sends a page after each thing the GM does. Where the two answer the same step differently, the row says so.
 */

vi.mock('../../../../src/app/services/PlayerWindowService', async () => ({ PlayerWindowService: (await import('./fakePlayerWindow.ts')).FakePlayerWindow }));

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

vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({
  ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()),
  accentColour: () => '#112233',
}));

const ANA = 'anaanaanaanaanaanaan';
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: CAVE, gate: { code: '483912', requireCode: false, askToJoin: false } };

const app = rigApp((leaf) => revealing.get(leaf)?.());
/** Deferred leaves and what loads each, as Obsidian loads a leaf it reveals. */
const revealing = new Map<unknown, () => void>();

/** A table running with Ana at it, and after each step what the player window shows and what Ana's page was sent. */
async function sideBySide(): Promise<{ step(name: string, act: () => unknown): Promise<void>; readonly rows: string[]; stop(): void }> {
  const relay = new FakeRelay();
  const players = [{ id: ANA, name: 'Ana' }];
  const online = new OnlineControl(app, boundOwnership(players), fakeCampaigns(players), undefined, storedAccount(), undefined, undefined, relay.open);
  void online.resume(SAVED);
  await advance(0);
  relay.outbox.welcome(players);
  await advance(1_500);
  const rows: string[] = [];
  return {
    rows,
    step: async (name, act) => {
      const mark = relay.pages.mark();
      await act();
      await advance(1_500);
      rows.push(`${name} | window: ${FakePlayerWindow.shows(viewNamed, tabNamed)} | table: ${tableShares(online)}, sent ${tableSent(relay.pages, ANA, mark)}`);
    },
    stop: () => online.stop(),
  };
}

/** Whether the table shares a view live, holds what players saw, or shares none. */
function tableShares(online: OnlineControl): string {
  const live = online.table?.sharedTab;
  if (live) return `live ${viewNamed((live.view as unknown as { atlasStore: unknown }).atlasStore)}`;
  return online.table?.sharedStore ? 'held' : 'none';
}

/** Presents `file`'s tab of `view` with the eye, on `levelId` where given, without waiting: the presenter waits for frames. */
const eye = (view: RigView, file: string, levelId?: string): void => void presentTab(app, view.view, view.tabOf(file), levelId === undefined ? {} : { levelId });

/** The player window Obsidian restores with the workspace, saved on `scene`. */
const savedWindow = (scene: { tabId: string; filePath: string }): LocalPlayerView => ({
  isClosed: false, contentEl: { setText: () => undefined }, getState: () => ({ ...scene, frozen: false }), updateSession: () => undefined,
}) as unknown as LocalPlayerView;

/** A small seeded random source, so the generated walks are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random thing the GM does with the open views, named as a row names it. */
function randomStep(random: () => number, views: RigView[], made: { count: number }): [string, () => unknown] {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const file = pick([CAVE, HALL]);
  const short = file === CAVE ? 'Cave' : 'Hall';
  const view = views.length > 0 ? pick(views) : null;
  const kind = view === null ? 'reopen' : pick(['eye', 'open', 'open', 'slow', 'finish', 'level', 'level', 'eye level', 'slow images', 'images', 'reload', 'close tab', 'close', 'reopen', 'unpresent']);
  if (view === null || kind === 'reopen') {
    const name = `v${++made.count}`;
    return [`${name} opens on the ${short}`, () => views.push(openView(name, [CAVE, HALL], file))];
  }
  const level = pick(['ground', 'upper']);
  switch (kind) {
    case 'eye': return [`the eye on ${view.name}'s ${short}`, () => eye(view, file)];
    case 'open': return [`${view.name} opens its ${short} tab`, () => void view.open(file)];
    case 'slow': return [`${view.name} starts loading its ${short} tab`, () => { view.loadSlowly(); void view.open(file); }];
    case 'finish': return [`${view.name} finishes its load`, () => view.finishLoad()];
    case 'level': return [`${view.name} shows the ${level} level`, () => view.store.getState().setViewedLevel(level)];
    case 'eye level': return [`the eye on ${view.name}'s Cave, ${level} level`, () => eye(view, CAVE, level)];
    case 'slow images': return [`${view.name}'s map image starts loading slowly`, () => view.loadImagesSlowly()];
    case 'images': return [`${view.name}'s map image finishes its loads`, () => view.finishImages()];
    case 'reload': return [`${view.name} loads its scene again`, () => void view.reload()];
    case 'close tab': return [`${view.name} closes its ${short} tab`, () => void view.closeTab(file)];
    case 'close': return [`${view.name} closes`, () => { closeView(view); views.splice(views.indexOf(view), 1); }];
    default: return ['Atlas presents nothing', () => { presentedSceneOf(app).set(null); }];
  }
}

describe('the presented scene, in the player window and at a running table', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => setTimeout(() => run(0), 16));
    FakePlayerWindow.reset();
    workspace.presented = null;
    workspace.files = new Map(FILES);
    revealing.clear();
  });
  afterEach(() => {
    resetViews();
    FakePlayerWindow.reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('follows the GM through tabs and levels, a closed and reopened view, and the eye on another tab', async () => {
    const v1 = openView('v1', [CAVE, HALL], CAVE);
    const table = await sideBySide();
    let v2: RigView | null = null;
    await table.step('the eye on the Cave', () => eye(v1, CAVE));
    await table.step('the GM opens the Hall tab', () => v1.open(HALL));
    await table.step('the GM goes back to the Cave', () => v1.open(CAVE));
    await table.step('the GM looks at the upper level', () => v1.store.getState().setViewedLevel('upper'));
    await table.step('the GM looks at the ground level again', () => v1.store.getState().setViewedLevel('ground'));
    await table.step('the eye on the upper level', () => eye(v1, CAVE, 'upper'));
    await table.step('the GM looks at the ground level', () => v1.store.getState().setViewedLevel('ground'));
    await table.step('the GM looks at the upper level again', () => v1.store.getState().setViewedLevel('upper'));
    await table.step('the view closes', () => closeView(v1));
    await table.step('a view opens the Cave again, a tab id made anew', () => { v2 = openView('v2', [HALL, CAVE], CAVE); });
    await table.step('the GM opens the Hall tab', () => v2?.open(HALL));
    await table.step('the eye on the Hall', () => v2 && eye(v2, HALL));
    await table.step('Atlas presents nothing', () => { presentedSceneOf(app).set(null); });
    table.stop();
    expect(table.rows).toEqual([
      "the eye on the Cave | window: live v1 v1:Cave | table: live v1, sent scene maps/cave.png, scene maps/cave.png",
      "the GM opens the Hall tab | window: held | table: held, sent nothing",
      "the GM goes back to the Cave | window: live v1 v1:Cave | table: live v1, sent nothing",
      "the GM looks at the upper level | window: held | table: live v1, sent nothing",
      "the GM looks at the ground level again | window: live v1 v1:Cave | table: live v1, sent nothing",
      "the eye on the upper level | window: live v1 v1:Cave | table: live v1, sent scene maps/upper.png",
      "the GM looks at the ground level | window: held | table: live v1, sent nothing",
      "the GM looks at the upper level again | window: live v1 v1:Cave | table: live v1, sent nothing",
      "the view closes | window: held, its view gone | table: none, sent scene none",
      "a view opens the Cave again, a tab id made anew | window: live v2 v2:Cave | table: live v2, sent scene maps/upper.png",
      "the GM opens the Hall tab | window: held | table: held, sent nothing",
      "the eye on the Hall | window: live v2 v2:Hall | table: live v2, sent scene maps/hall.png, scene maps/hall.png",
      "Atlas presents nothing | window: live v2 v2:Hall | table: none, sent scene none",
    ]);
  });

  it('waits for a scene still loading, at both places', async () => {
    const v1 = openView('v1', [CAVE, HALL], CAVE);
    const table = await sideBySide();
    await table.step('the eye on the Cave', () => eye(v1, CAVE));
    await table.step('the eye on the Hall, which loads slowly', () => { v1.loadSlowly(); eye(v1, HALL); });
    await table.step('the Hall has loaded', () => v1.finishLoad());
    await table.step('the GM goes back to the Cave, which loads slowly', () => { v1.loadSlowly(); void v1.open(CAVE); });
    await table.step('the GM goes back to the Hall before the Cave has loaded', () => v1.open(HALL));
    await table.step('the Cave\'s load ends', () => v1.finishLoad());
    table.stop();
    expect(table.rows).toEqual([
      "the eye on the Cave | window: live v1 v1:Cave | table: live v1, sent scene maps/cave.png, scene maps/cave.png",
      "the eye on the Hall, which loads slowly | window: held | table: held, sent nothing",
      "the Hall has loaded | window: live v1 v1:Hall | table: live v1, sent scene maps/hall.png, scene maps/hall.png",
      "the GM goes back to the Cave, which loads slowly | window: held | table: held, sent nothing",
      "the GM goes back to the Hall before the Cave has loaded | window: live v1 v1:Hall | table: live v1, sent nothing",
      "the Cave's load ends | window: live v1 v1:Hall | table: live v1, sent nothing",
    ]);
  });

  it('keeps to the view that presents, while another view shows the same file', async () => {
    const v1 = openView('v1', [CAVE, HALL], CAVE);
    const table = await sideBySide();
    let v2: RigView | null = null;
    await table.step('the eye on v1\'s Cave', () => eye(v1, CAVE));
    await table.step('v2 opens on the Cave', () => { v2 = openView('v2', [CAVE, HALL], CAVE); });
    await table.step('the GM opens v1\'s Hall tab', () => v1.open(HALL));
    await table.step('v1 closes', () => closeView(v1));
    await table.step('v2 loads its Cave again', async () => { await v2?.open(HALL); await v2?.open(CAVE); });
    table.stop();
    expect(table.rows).toEqual([
      "the eye on v1's Cave | window: live v1 v1:Cave | table: live v1, sent scene maps/cave.png, scene maps/cave.png",
      "v2 opens on the Cave | window: live v1 v1:Cave | table: live v1, sent nothing",
      "the GM opens v1's Hall tab | window: held | table: held, sent nothing",
      "v1 closes | window: held, its view gone | table: live v2, sent scene none, scene maps/cave.png",
      "v2 loads its Cave again | window: live v2 v2:Cave | table: live v2, sent nothing",
    ]);
  });

  it('takes the scene up from a tab Obsidian has not loaded yet as Obsidian restarts', async () => {
    const deferred = deferredView('v1', [CAVE, HALL], CAVE);
    revealing.set(deferred.leaf, () => void deferred.reveal());
    presentedSceneOf(app).set({ tabId: 'saved before the restart', filePath: CAVE });
    FakePlayerWindow.window.open = false;
    const table = await sideBySide();
    await table.step('the table runs beside the tab not loaded', () => undefined);
    await table.step('Obsidian restores the player window', () => {
      FakePlayerWindow.window.open = true;
      void restorePlayerWindow(app, savedWindow({ tabId: 'saved before the restart', filePath: CAVE }));
    });
    table.stop();
    expect(table.rows).toEqual([
      "the table runs beside the tab not loaded | window: closed | table: none, sent nothing",
      "Obsidian restores the player window | window: live v1 v1:Cave | table: live v1, sent scene maps/cave.png, scene maps/cave.png",
    ]);
  });

  it('holds the window on another level while the presented level\'s map still loads', async () => {
    const v1 = openView('v1', [CAVE, HALL], CAVE);
    const table = await sideBySide();
    await table.step('the eye on the Cave', () => eye(v1, CAVE));
    await table.step('the eye on the upper level, whose map still loads', () => { v1.loadImagesSlowly(); eye(v1, CAVE, 'upper'); });
    await table.step('the GM looks at the ground level', () => v1.store.getState().setViewedLevel('ground'));
    await table.step('the maps finish loading', () => v1.finishImages());
    await table.step('the GM looks at the upper level again', () => v1.store.getState().setViewedLevel('upper'));
    table.stop();
    expect(table.rows).toMatchSnapshot();
  });

  it('holds the window at the next tab change after the GM left the tab while it was being presented', async () => {
    const v1 = openView('v1', [CAVE, HALL, CRYPT], CAVE);
    const table = await sideBySide();
    await table.step('the eye on the Cave', () => eye(v1, CAVE));
    await table.step('the eye on the Hall, the GM opening the Crypt before it is drawn', async () => {
      eye(v1, HALL);
      await vi.advanceTimersByTimeAsync(1);
      void v1.open(CRYPT);
    });
    await table.step('the GM opens the Cave tab', () => v1.open(CAVE));
    await table.step('the GM opens the Hall tab', () => v1.open(HALL));
    table.stop();
    expect(table.rows).toMatchSnapshot();
  });

  it('follows a reload of the presented tab, a note and back, and the presented tab closed', async () => {
    const v1 = openView('v1', [CAVE, HALL], CAVE);
    const table = await sideBySide();
    let back = (): void => undefined;
    await table.step('the eye on the Cave', () => eye(v1, CAVE));
    await table.step('Atlas loads the Cave again, slowly', () => { v1.loadSlowly(); void v1.reload(); });
    await table.step('the load ends', () => v1.finishLoad());
    await table.step('the GM opens a note', () => { back = openNote(); });
    await table.step('the GM goes back to the map', () => back());
    await table.step('the GM closes the Cave tab', () => v1.closeTab(CAVE));
    table.stop();
    expect(table.rows).toMatchSnapshot();
  });

  it('holds a restored window on another level while the presented level\'s map still loads', async () => {
    const v1 = openView('v1', [CAVE, HALL], CAVE);
    presentedSceneOf(app).set({ tabId: v1.tabOf(CAVE), filePath: CAVE, levelId: 'upper' });
    FakePlayerWindow.window.open = false;
    const table = await sideBySide();
    await table.step('Obsidian restores the player window, the upper level\'s map still loading', () => {
      FakePlayerWindow.window.open = true;
      v1.loadImagesSlowly();
      void restorePlayerWindow(app, savedWindow({ tabId: v1.tabOf(CAVE), filePath: CAVE }));
    });
    await table.step('the GM looks at the ground level', () => v1.store.getState().setViewedLevel('ground'));
    await table.step('the maps finish loading', () => v1.finishImages());
    await table.step('the GM looks at the upper level again', () => v1.store.getState().setViewedLevel('upper'));
    table.stop();
    expect(table.rows).toMatchSnapshot();
  });

  it('answers generated walks as recorded', async () => {
    const walks: string[][] = [];
    for (let seed = 1; seed <= 16; seed++) {
      const random = seeded(seed);
      const views = [openView('v1', [CAVE, HALL], CAVE)];
      const made = { count: 1 };
      const table = await sideBySide();
      await table.step('the eye on v1\'s Cave', () => eye(views[0] as RigView, CAVE));
      for (let n = 0; n < 8; n++) await table.step(...randomStep(random, views, made));
      table.stop();
      walks.push(table.rows);
      resetViews();
      FakePlayerWindow.reset();
      workspace.presented = null;
    }
    expect(walks).toMatchSnapshot();
  });
});

