import { EventEmitter } from 'events';
import type { App } from 'obsidian';
import type { LocalPlayerView } from '../../src/app/local-player-view';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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

const noService = vi.hoisted(() => ({ value: false }));

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
      if (noService.value) return null as unknown as PlayerWindowService;
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
import { presentedScene } from '../../src/app/services/PresentedScene';
import { addPresentationTarget } from '../../src/app/services/presentationTargets';

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

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The frame is released two animation frames after the load finishes, and Windows' 15.6ms timer
 * granularity makes that longer than any fixed wait worth writing. Waits for the call itself.
 * A check that nothing was released keeps `flush`: a poll cannot show that nothing happened.
 */
const waitForRelease = (canvas: HTMLCanvasElement): Promise<void> =>
  vi.waitFor(() => expect(serviceMock.releaseHeldFrame).toHaveBeenCalledWith(frameSourceFor(canvas)));

/**
 * The player window following Atlas's own presented scene, which only exists while an extension has registered a
 * presentation target (`presentationTargetsRegistered`); `playerWindowPresenter.test.ts` is upstream's, unchanged, and
 * covers presenting without one.
 */
describe('PlayerWindowPresenter with a presentation target registered', () => {
  let removeTarget: () => void = () => undefined;
  afterEach(() => { removeTarget(); });
  beforeEach(() => {
    removeTarget = addPresentationTarget({ id: 'audience', label: 'an audience', isActive: () => false });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queueMicrotask(() => cb(0)));
    resetPlayerWindowStore();
    serviceMock.isWindowOpen.mockReturnValue(false);
    noService.value = false;
    presentedScene.clear();
    Object.values(serviceMock).forEach((fn) => fn.mockClear());
  });

  test('does not present a view that closed while it was being prepared', async () => {
    const { view } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    view.isClosed = true;

    await presentTabInPlayerWindow({} as any, view, tavern);

    expect(serviceMock.openPlayerWindow).not.toHaveBeenCalled();
    expect(presentedScene.current()).toBeNull();
  });

  test('keeps the presented scene when the player window closes, for the target to show', async () => {
    const { view, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    atlasStore.setState({ mapPath: 'maps/tavern.md' });
    await presentTabInPlayerWindow({} as any, view, tavern);
    playerWindowStore.setState({ isOpen: true });
    playerWindowStore.setState({ isOpen: false });
    expect(presentedScene.current()?.tabId).toBe(tavern);
  });

  test('without a target, the presented scene ends with the player window, as the window state does', async () => {
    const { view, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    atlasStore.setState({ mapPath: 'maps/tavern.md' });
    await presentTabInPlayerWindow({} as any, view, tavern);
    removeTarget();
    playerWindowStore.setState({ isOpen: true });
    expect(presentedScene.current()?.tabId).toBe(tavern);
    playerWindowStore.setState({ isOpen: false });
    expect(presentedScene.current()).toBeNull();
  });

  test('follows a scene presented elsewhere while the window is open', async () => {
    const { view, canvas, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    serviceMock.isWindowOpen.mockReturnValue(true);

    await presentTabInPlayerWindow({} as any, view, tavern);
    view.tabMetaStore.getState().setActiveTab(dungeon);
    atlasStore.setState({ mapPath: 'maps/dungeon.md' });
    presentedScene.present(view, dungeon);
    await flush();

    expect(serviceMock.presentCanvas).toHaveBeenLastCalledWith(frameSourceFor(canvas), dungeon);
    expect(playerWindowStore.getState().presentedTabId).toBe(dungeon);
  });

  test('re-targets the window when the same tab is presented again after stopping', async () => {
    const { view, canvas, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    atlasStore.setState({ mapPath: 'maps/tavern.md' });
    serviceMock.isWindowOpen.mockReturnValue(true);
    await presentTabInPlayerWindow({} as any, view, tavern);
    serviceMock.presentCanvas.mockClear();

    presentedScene.clear();
    expect(serviceMock.releaseSource).toHaveBeenCalledWith(atlasStore);
    presentedScene.present(view, tavern);
    await flush();

    expect(serviceMock.presentCanvas).toHaveBeenCalledTimes(1);
    expect(serviceMock.presentCanvas).toHaveBeenLastCalledWith(frameSourceFor(canvas), tavern);
  });

  test('re-targets after holding, stopping and coming back to the tab', async () => {
    const { view, canvas, atlasStore } = createFakeView();
    atlasStore.setState({ mapPath: 'maps/tavern.md' });
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    serviceMock.isWindowOpen.mockReturnValue(true);
    await presentTabInPlayerWindow({} as any, view, tavern);
    view.tabMetaStore.getState().setActiveTab(dungeon);
    presentedScene.clear();
    view.tabMetaStore.getState().setActiveTab(tavern);
    serviceMock.presentCanvas.mockClear();
    serviceMock.releaseHeldFrame.mockClear();

    presentedScene.present(view, tavern);
    await flush();

    expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();
    expect(serviceMock.presentCanvas).toHaveBeenLastCalledWith(frameSourceFor(canvas), tavern);
  });

  test('releases a streamed view that closes after another scene was presented, and re-targets on resume', async () => {
    const first = createFakeView();
    const second = createFakeView();
    const tavern = first.view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const keep = second.view.tabMetaStore.getState().addTab('maps/keep.md', 'Keep');
    const cellar = second.view.tabMetaStore.getState().addTab('maps/cellar.md', 'Cellar');
    // The second view holds Keep's map: browsing Cellar in this test loads nothing.
    second.atlasStore.setState({ mapPath: 'maps/keep.md' });
    serviceMock.isWindowOpen.mockReturnValue(true);
    await presentTabInPlayerWindow({} as any, first.view, tavern);
    serviceMock.presentCanvas.mockClear();

    second.view.tabMetaStore.getState().setActiveTab(keep);
    presentedScene.present(second.view, keep);
    second.view.tabMetaStore.getState().setActiveTab(cellar);
    await flush();
    expect(serviceMock.presentCanvas).not.toHaveBeenCalled();

    const closeFirst = first.view.register.mock.calls[0][0] as () => void;
    closeFirst();
    expect(serviceMock.releaseSource).toHaveBeenCalledWith(first.atlasStore);

    second.view.tabMetaStore.getState().setActiveTab(keep);
    await flush();
    expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();
    expect(serviceMock.presentCanvas).toHaveBeenLastCalledWith(frameSourceFor(second.canvas), keep);
  });

  test('releases the window when the presented tab is closed', async () => {
    const { view, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    serviceMock.isWindowOpen.mockReturnValue(true);
    await presentTabInPlayerWindow({} as any, view, tavern);
    view.tabMetaStore.getState().removeTab(tavern);
    expect(serviceMock.releaseSource).toHaveBeenCalledWith(atlasStore);
  });

  test('does nothing to the window when there is none', async () => {
    const { view } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    serviceMock.isWindowOpen.mockReturnValue(true);
    await presentTabInPlayerWindow({} as any, view, tavern);
    Object.values(serviceMock).forEach((fn) => fn.mockClear());
    noService.value = true;

    expect(() => {
      view.tabMetaStore.getState().setActiveTab(dungeon);
      presentedScene.present(view, dungeon);
      view.tabMetaStore.getState().setActiveTab(tavern);
      presentedScene.clear();
    }).not.toThrow();
    await flush();

    expect(serviceMock.presentCanvas).not.toHaveBeenCalled();
    expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();
  });

  test('releases the held frame once a failed load is retried after Present to players', async () => {
    const { view, atlasStore } = createFakeView();
    const tavern = view.tabMetaStore.getState().addTab('maps/tavern.md', 'Tavern');
    const dungeon = view.tabMetaStore.getState().addTab('maps/dungeon.md', 'Dungeon');
    atlasStore.setState({ mapPath: 'maps/tavern.md' });
    serviceMock.isWindowOpen.mockReturnValue(true);
    await presentTabInPlayerWindow({} as any, view, tavern);

    view.tabMetaStore.getState().setActiveTab(dungeon);
    expect(serviceMock.holdCurrentFrame).toHaveBeenCalledTimes(1);
    view.tabMetaStore.getState().setActiveTab(tavern);
    // Tavern's load fails, then the GM runs Present to players on it.
    atlasStore.setState({ mapLoaded: false, isMapLoading: false, mapPath: null });
    presentedScene.present(view, tavern);
    await flush();
    expect(serviceMock.releaseHeldFrame).not.toHaveBeenCalled();

    atlasStore.setState({ mapLoaded: true, mapPath: 'maps/tavern.md' });
    await flush();
    expect(serviceMock.releaseHeldFrame).toHaveBeenCalledTimes(1);
  });
});
