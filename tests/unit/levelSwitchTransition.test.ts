// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Application } from 'pixi.js';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import type { MosaicCanvas } from '../../src/app/pixi/mosaicCanvas/MosaicCanvas';

interface FakeTransition { play: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; paintInto: ReturnType<typeof vi.fn> }

const fakes = vi.hoisted(() => ({
  transitions: [] as FakeTransition[],
  shown: true,
  loaded: new Set<(mapImage: unknown) => void>(),
}));

vi.mock('../../src/app/pixi/sceneTransition', () => ({
  captureSceneTransition: vi.fn(() => {
    const transition = { play: vi.fn(), cancel: vi.fn(), paintInto: vi.fn() };
    fakes.transitions.push(transition);
    return transition;
  }),
}));

vi.mock('../../src/app/MapController', () => ({
  MapController: {
    showsViewedLevel: () => fakes.shown,
    onBackgroundLoaded: (listener: (mapImage: unknown) => void) => {
      fakes.loaded.add(listener);
      return () => fakes.loaded.delete(listener);
    },
  },
}));

import { bindLevelSwitchTransition } from '../../src/app/pixi/levelSwitchTransition';

const LEVELS = [{ id: 'cellar' }, { id: 'ground' }, { id: 'tower' }];

interface FakeState { mapLoaded: boolean; isMapLoading: boolean; levels: typeof LEVELS; viewedLevel: string }

function setup(): { app: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }; store: StoreApi<FakeState>; mapImage: MosaicCanvas } {
  const store = createStore<FakeState>(() => ({ mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'ground' }));
  const ticker = { started: true, addOnce: (callback: () => void) => callback() };
  const app = {
    ticker,
    stop: vi.fn(() => { ticker.started = false; }),
    start: vi.fn(() => { ticker.started = true; }),
  };
  const mapImage = { whenCameraReady: vi.fn(() => Promise.resolve()) } as unknown as MosaicCanvas;
  bindLevelSwitchTransition(store as unknown as ViewAtlasStore, {
    getAppInstance: () => app as unknown as Application,
    getMapImage: () => mapImage,
  });
  return { app, store, mapImage };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('bindLevelSwitchTransition', () => {
  beforeEach(() => {
    fakes.transitions.length = 0;
    fakes.shown = true;
    fakes.loaded.clear();
  });

  it('holds the last frame until the new level is drawn, then plays it out', async () => {
    const { app, store, mapImage } = setup();
    fakes.shown = false;
    store.setState({ viewedLevel: 'tower' });
    expect(app.stop).toHaveBeenCalledTimes(1);

    await settle();
    expect(fakes.transitions[0]!.play).not.toHaveBeenCalled();

    fakes.shown = true;
    for (const listener of [...fakes.loaded]) listener(mapImage);
    await settle();
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(fakes.transitions[0]!.play).toHaveBeenCalledTimes(1);
  });

  it('keeps one frame through quick switches and plays once', async () => {
    const { app, store } = setup();
    store.setState({ viewedLevel: 'tower' });
    store.setState({ viewedLevel: 'cellar' });
    await settle();
    expect(fakes.transitions).toHaveLength(1);
    expect(app.stop).toHaveBeenCalledTimes(1);
    expect(fakes.transitions[0]!.play).toHaveBeenCalledTimes(1);
  });

  it('lets go of its frame when a load starts, before the load holds its own', () => {
    const { app, store } = setup();
    fakes.shown = false;
    store.setState({ viewedLevel: 'tower' });
    store.setState({ isMapLoading: true });
    expect(fakes.transitions[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(app.start).toHaveBeenCalledTimes(1);
  });

  it('leaves the level a load shows alone', () => {
    const { app, store } = setup();
    store.setState({ isMapLoading: true });
    store.setState({ viewedLevel: 'tower' });
    expect(app.stop).not.toHaveBeenCalled();
  });
});
