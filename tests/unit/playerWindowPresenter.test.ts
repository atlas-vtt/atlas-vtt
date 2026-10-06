import { EventEmitter } from 'events';
import type { App } from 'obsidian';
import type { LocalPlayerView } from '../../src/app/local-player-view';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import type { Application } from 'pixi.js';
import { fakeApp, fakeGroup } from '../mocks/schedulerApp';

vi.mock('../../src/app/atlas-view', () => ({
  AtlasView: class AtlasView {},
  ATLAS_VIEW_TYPE: 'atlas-vtt',
}));

const serviceMock = vi.hoisted(() => ({
  isWindowOpen: vi.fn(() => false),
  openPlayerWindow: vi.fn(),
  presentCanvas: vi.fn(),
  holdCurrentFrame: vi.fn(),
  releaseHeldFrame: vi.fn(),
  attachToView: vi.fn(),
  freezeCamera: vi.fn(),
  getWindow: vi.fn(() => null),
  releaseSource: vi.fn(),
}));

vi.mock('../../src/app/services/PlayerWindowService', async () => {
  const { playerWindowStore: store } = await import('../../src/app/stores/playerWindowStore');
  class PlayerWindowService {
    static getInstance(): PlayerWindowService {
      return new PlayerWindowService();
    }
    isWindowOpen = serviceMock.isWindowOpen;
    attachToView = serviceMock.attachToView;
    freezeCamera = serviceMock.freezeCamera;
    getWindow = serviceMock.getWindow;
    ownsView = () => false;
    holdCurrentFrame = serviceMock.holdCurrentFrame;
    releaseHeldFrame = serviceMock.releaseHeldFrame;
    releaseSource = serviceMock.releaseSource;
    openPlayerWindow(source: PlayerFrameSource, tabId: string, filePath: string): void {
      serviceMock.openPlayerWindow(source, tabId, filePath);
      store.setState({ presentedTabId: tabId, isOpen: true });
    }
    presentCanvas(source: PlayerFrameSource, tabId: string): void {
      serviceMock.presentCanvas(source, tabId);
      store.setState({ presentedTabId: tabId });
    }
  }
  return { PlayerWindowService };
});

import { restorePlayerWindow, presentTabInPlayerWindow } from '../../src/app/services/PlayerWindowPresenter';

import { AtlasView } from '../../src/app/atlas-view';

interface SceneState { isMapLoading: boolean; mapLoaded: boolean; mapPath: string | null }

interface FakeView {
  view: any;
  canvas: HTMLCanvasElement;
  withPlayerSafeFrame: ReturnType<typeof vi.fn>;
  playerRollTokens: ReturnType<typeof vi.fn>;
  atlasStore: ReturnType<typeof createStore<SceneState>>;
}

/** A view whose map canvas belongs to `app`, by default one that renders on every tick. */
function createFakeView(app?: Application): FakeView {
  const tabMetaStore = createTabMetaStore();
  const atlasStore = createStore<SceneState>(() => ({ isMapLoading: false, mapLoaded: true, mapPath: null }));
  const canvas = document.createElement('canvas');
  const withPlayerSafeFrame = vi.fn((capture: () => void) => capture());
  const playerRollTokens = vi.fn(() => new Map());
  const diceEvents = new EventEmitter();
  const renderer = { getAppInstance: () => (app ? Object.assign(app, { canvas }) : { canvas }), withPlayerSafeFrame, playerRollTokens };
  const view = {
    viewId: 'view-1',
    tabMetaStore,
    atlasStore,
    serviceManager: { getEventBus: () => diceEvents, getRendererService: () => ({ getRenderer: () => renderer, getViewport: () => undefined }) },
    switchToTab: vi.fn(async (tabId: string) => {
      tabMetaStore.getState().setActiveTab(tabId);
    }),
    register: vi.fn(),
  };
  Object.setPrototypeOf(view, AtlasView.prototype);
  return { view, canvas, withPlayerSafeFrame, playerRollTokens, atlasStore };
}

/** Matches the frame source the presenter builds for `canvas`. */
const frameSourceFor = (canvas: HTMLCanvasElement): PlayerFrameSource =>
  expect.objectContaining({ canvas, withPlayerSafeFrame: expect.any(Function) });

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

/**
 * The frame is released two animation frames after the load finishes, and Windows' 15.6ms timer
 * granularity makes that longer than any fixed wait worth writing. Waits for the call itself.
 * A check that nothing was released keeps `flush`: a poll cannot show that nothing happened.
 */
const waitForRelease = (canvas: HTMLCanvasElement): Promise<void> =>
  vi.waitFor(() => expect(serviceMock.releaseHeldFrame).toHaveBeenCalledWith(frameSourceFor(canvas)));

describe('PlayerWindowPresenter', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
    resetPlayerWindowStore();
    serviceMock.isWindowOpen.mockReturnValue(false);
    Object.values(serviceMock).forEach((fn) => fn.mockClear());
  });

  test('switches to the tab, opens the window with its canvas and marks it presented', async () => {
    const { view, canvas, withPlayerSafeFrame } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    view.tabMetaStore.getState().setActiveTab(tavern);

    await presentTabInPlayerWindow({} as any, view, dungeon);

    expect(view.switchToTab).toHaveBeenCalledWith(dungeon);
    expect(serviceMock.openPlayerWindow).toHaveBeenCalledWith(frameSourceFor(canvas), dungeon, 'maps/dungeon.md');
    expect(playerWindowStore.getState().presentedTabId).toBe(dungeon);

    // Frames are captured through the renderer so DM-only layers stay out of the player view.
    const source: PlayerFrameSource = serviceMock.openPlayerWindow.mock.calls[0][0];
    expect(source.diceEvents).toBe(view.serviceManager.getEventBus());
    const capture = vi.fn();
    const settings = new SettingsService({} as any).getLocalPlayerViewSettings();
    source.withPlayerSafeFrame(capture, settings);
    expect(withPlayerSafeFrame).toHaveBeenCalledWith(capture, settings, undefined);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(source.beforeRender).toBeUndefined();
  });

  test('offers captures right before the renders of a canvas that renders on change', async () => {
    const { app, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    ticker.update(16);
    const { view, withPlayerSafeFrame } = createFakeView(app);
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');

    await presentTabInPlayerWindow({} as any, view, tavern);
    const source: PlayerFrameSource = serviceMock.openPlayerWindow.mock.calls[0][0];
    const beforeRender = source.beforeRender!;
    const listener = vi.fn();
    const stop = beforeRender.listen(listener);

    ticker.update(32);
    expect(listener).not.toHaveBeenCalled();
    beforeRender.requestRender();
    ticker.update(48);
    expect(listener).toHaveBeenCalledWith(48);

    const capture = vi.fn();
    const settings = new SettingsService({} as any).getLocalPlayerViewSettings();
    beforeRender.withPlayerSafeFrame(capture, settings);
    expect(withPlayerSafeFrame).toHaveBeenCalledWith(capture, settings, undefined, true);

    stop();
    beforeRender.requestRender();
    ticker.update(64);
    expect(listener).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  test('binds the rendered source to its view and scene, which rolls are named from', async () => {
    const { view, atlasStore, playerRollTokens } = createFakeView();
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    atlasStore.setState({ mapPath: 'maps/dungeon.md' });

    await presentTabInPlayerWindow({} as any, view, dungeon);
    const source: PlayerFrameSource = serviceMock.openPlayerWindow.mock.calls[0][0];
    expect(source.rollSources).toMatchObject({ viewId: 'view-1', mapPath: 'maps/dungeon.md' });
    source.rollSources!.shownTokens(['wolf']);
    expect(playerRollTokens).toHaveBeenCalledWith('maps/dungeon.md', ['wolf']);

    // The scene is the one rendered: another loading into the same store does not take its place
    atlasStore.setState({ mapPath: 'maps/tavern.md' });
    source.rollSources!.shownTokens();
    expect(playerRollTokens).toHaveBeenLastCalledWith('maps/dungeon.md', undefined);
  });

  test('offers no answers about rolls for a canvas that shows no scene file', async () => {
    const { view } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    await presentTabInPlayerWindow({} as any, view, tavern);
    const source: PlayerFrameSource = serviceMock.openPlayerWindow.mock.calls[0][0];
    expect(source.rollSources).toBeUndefined();
  });

  test('does not present a tab whose scene failed to load', async () => {
    const { view, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    atlasStore.setState({ mapLoaded: false });

    await presentTabInPlayerWindow({} as any, view, tavern);

    expect(serviceMock.openPlayerWindow).not.toHaveBeenCalled();
    expect(serviceMock.presentCanvas).not.toHaveBeenCalled();
    expect(playerWindowStore.getState().presentedTabId).toBeNull();
  });

  describe('returning to the presented tab', () => {
    const TAVERN = 'maps/tavern.md';
    const DUNGEON = 'maps/dungeon.md';

    /** Tavern is presented, then the DM opens Dungeon: players keep Tavern's last frame. */
    async function presentTavernThenBrowse(): Promise<FakeView & { tavern: string; dungeon: string }> {
      const fake = createFakeView();
      const tavern = fake.view.tabMetaStore.getState().addTab(TAVERN, 'Tavern');
      const dungeon = fake.view.tabMetaStore.getState().addTab(DUNGEON, 'Dungeon');
      fake.atlasStore.setState({ mapPath: TAVERN });
      serviceMock.isWindowOpen.mockReturnValue(true);
      await presentTabInPlayerWindow({} as any, fake.view, tavern);
      expect(serviceMock.presentCanvas).toHaveBeenCalledWith(frameSourceFor(fake.canvas), tavern);

      fake.view.tabMetaStore.getState().setActiveTab(dungeon);
      expect(serviceMock.holdCurrentFrame).toHaveBeenCalledTimes(1);
      fake.atlasStore.setState({ mapLoaded: false, isMapLoading: true, mapPath: DUNGEON });
      fake.atlasStore.setState({ mapLoaded: true, isMapLoading: false });
      return { ...fake, tavern, dungeon };
    }

    test.each([
      ['the scene is marked loaded', [{ isMapLoading: false }, { mapLoaded: true }]],
      ['the loading overlay goes', [{ mapLoaded: true }, { isMapLoading: false }]],
    ])('shows players the live scene again once it has loaded, whether last %s', async (_label, lastSteps) => {
      const { view, canvas, atlasStore, tavern } = await presentTavernThenBrowse();

      // The tab becomes active before the load starts, so the store still shows Dungeon as loaded
      view.tabMetaStore.getState().setActiveTab(tavern);
      await flush();
      expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();

      atlasStore.setState({ mapLoaded: false, isMapLoading: true, mapPath: TAVERN });
      await flush();
      expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();
      for (const step of lastSteps) atlasStore.setState(step);
      await waitForRelease(canvas);

      expect(serviceMock.releaseHeldFrame).toHaveBeenCalledTimes(1);
    });

    test('keeps the held frame when the scene fails to load, and releases it when a retry succeeds', async () => {
      const { view, canvas, atlasStore, tavern } = await presentTavernThenBrowse();
      view.tabMetaStore.getState().setActiveTab(tavern);
      atlasStore.setState({ mapLoaded: false, isMapLoading: true, mapPath: TAVERN });
      atlasStore.setState({ isMapLoading: false, mapPath: null });
      await flush();
      expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();

      // The retry loads the same tab again: no tab change tells the presenter about it
      atlasStore.setState({ isMapLoading: true, mapPath: TAVERN });
      atlasStore.setState({ isMapLoading: false, mapLoaded: true });
      await waitForRelease(canvas);
    });

    test('keeps the held frame while another scene loads into the view', async () => {
      const { atlasStore } = await presentTavernThenBrowse();

      atlasStore.setState({ mapLoaded: false, isMapLoading: true, mapPath: 'maps/crypt.md' });
      atlasStore.setState({ mapLoaded: true, isMapLoading: false });
      await flush();

      expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();
    });
  });

  test('restores the presented scene into the existing popout and returns the DM to their tab', async () => {
    const { view, canvas } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    const player = {
      getState: () => ({ tabId: tavern, filePath: 'maps/tavern.md', frozen: true, camera: { centerX: 10, centerY: 20, scale: 2 } }),
      contentEl: document.createElement('div'),
      isClosed: false,
    };
    const app = { workspace: { getLeavesOfType: () => [{ view }], revealLeaf: vi.fn() } };

    await restorePlayerWindow(app as App, player as LocalPlayerView);

    expect(serviceMock.openPlayerWindow).not.toHaveBeenCalled();
    expect(serviceMock.attachToView).toHaveBeenCalledWith(player, frameSourceFor(canvas), tavern);
    expect(serviceMock.freezeCamera).toHaveBeenCalledWith({ centerX: 10, centerY: 20, scale: 2 });
    expect(view.tabMetaStore.getState().activeTabId).toBe(dungeon);
  });

  test('does not show a different scene when the saved scene can no longer be loaded', async () => {
    const { view } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    view.switchToTab.mockImplementation(async () => {});
    const player = {
      getState: () => ({ tabId: tavern, filePath: 'maps/tavern.md', frozen: false }),
      contentEl: document.createElement('div'),
      isClosed: false,
    };
    const app = { workspace: { getLeavesOfType: () => [{ view }] } };
    await restorePlayerWindow(app as App, player as LocalPlayerView);
    expect(serviceMock.attachToView).not.toHaveBeenCalled();
    expect(player.contentEl.textContent).toContain('could not be loaded');
  });

  test('presenting another tab re-targets the open window instead of reopening it', async () => {
    const { view, canvas } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    serviceMock.isWindowOpen.mockReturnValue(true);

    await presentTabInPlayerWindow({} as any, view, tavern);
    await presentTabInPlayerWindow({} as any, view, dungeon);

    expect(serviceMock.openPlayerWindow).not.toHaveBeenCalled();
    expect(serviceMock.presentCanvas).toHaveBeenLastCalledWith(frameSourceFor(canvas), dungeon);
    expect(playerWindowStore.getState().presentedTabId).toBe(dungeon);
  });

  test('lets the player window release the presented view when it closes', async () => {
    const { view, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');

    await presentTabInPlayerWindow({} as any, view, tavern);
    await presentTabInPlayerWindow({} as any, view, dungeon);
    expect(view.register).toHaveBeenCalledTimes(1);

    const onClose = view.register.mock.calls[0][0] as () => void;
    onClose();

    expect(serviceMock.releaseSource).toHaveBeenCalledWith(atlasStore);
    // The closed view's tab watcher is gone: its tab changes no longer reach the window
    serviceMock.holdCurrentFrame.mockClear();
    view.tabMetaStore.getState().setActiveTab(tavern);
    expect(serviceMock.holdCurrentFrame).not.toHaveBeenCalled();
  });
});
