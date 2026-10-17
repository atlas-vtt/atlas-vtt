import { afterEach, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import type { StoreApi } from 'zustand';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import * as coverage from '../../src/app/fog/fogCoverage';

const MAP: MapRect = { x: 0, y: 0, width: 1000, height: 800 };

afterEach(() => vi.restoreAllMocks());

function scene(): { store: ReturnType<typeof createViewAtlasStore>; renderer: FogOfWarRenderer } {
  // jsdom has no Canvas 2D implementation: every call and field gives a stand-in that takes anything.
  const anything: object = new Proxy(function stand() {}, { get: () => anything, apply: () => anything, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(anything as never);
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `fog-layers-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapPath: 'scenes/Cave.atlasmap', isMapLoading: false, mapLoaded: true });
  store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 100, height: 100 });
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }) });
  const renderer = new FogOfWarRenderer(
    viewport as never, { canvas: createEl('canvas') } as never, new EventEmitter() as never,
    store as unknown as StoreApi<ViewAtlasState>, () => MAP,
  );
  return { store, renderer };
}

it('shows players and the GM the clouds while nobody edits fog, and the GM flat fog while they do', () => {
  const { store, renderer } = scene();
  try {
    store.getState().setFogStyle({ clouds: true });
    let [preview, clouds] = renderer.getPlayerViewLayers();
    expect(preview).toMatchObject({ visible: false });
    expect(clouds).toMatchObject({ visible: true, alpha: 1 });
    expect(preview!.layer.visible).toBe(false);
    expect(clouds!.layer.visible).toBe(true);

    store.getState().setActiveTool('fog');
    [preview, clouds] = renderer.getPlayerViewLayers();
    expect(preview).toMatchObject({ visible: false });
    expect(clouds).toMatchObject({ visible: true });
    expect(preview!.layer.visible).toBe(true);
    expect(clouds!.layer.visible).toBe(false);

    store.getState().setActiveTool('move');
    expect(clouds!.layer.visible).toBe(true);
    expect(preview!.layer.visible).toBe(false);
  } finally {
    renderer.destroy();
  }
});

it('gives players the fog from before an edit until the GM leaves the fog tools', () => {
  const { store, renderer } = scene();
  try {
    store.getState().setFogStyle({ clouds: true });
    store.getState().setActiveTool('fog');
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 500, y: 500, width: 100, height: 100 });
    expect(renderer.getPlayersCoverage()?.covers({ x: 50, y: 50 })).toBe(true);
    expect(renderer.getPlayersCoverage()?.covers({ x: 550, y: 550 })).toBe(false);

    store.getState().setActiveTool('move');
    expect(renderer.getPlayersCoverage()?.covers({ x: 550, y: 550 })).toBe(true);
  } finally {
    renderer.destroy();
  }
});

it('leaves flat fog as it was while cloud reveal is off', () => {
  const { store, renderer } = scene();
  try {
    store.getState().setActiveTool('fog');
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 500, y: 500, width: 100, height: 100 });
    expect(renderer.getPlayersCoverage()?.covers({ x: 550, y: 550 })).toBe(true);
    const [preview, clouds] = renderer.getPlayerViewLayers();
    expect(preview).toMatchObject({ visible: true });
    expect(clouds).toMatchObject({ visible: false });
  } finally {
    renderer.destroy();
  }
});

it('takes the clouds into a picture of the scene at the GM\'s opacity', () => {
  const { store, renderer } = scene();
  try {
    store.getState().setFogStyle({ clouds: true });
    const [preview, clouds] = renderer.getGmViewLayers();
    expect(preview).toMatchObject({ visible: false });
    expect(clouds).toMatchObject({ visible: true });
    expect(clouds!.alpha).toBeLessThan(1);
  } finally {
    renderer.destroy();
  }
});

it('shows fog flat where it cannot be drawn as clouds, so players never see the map bare', () => {
  const { store, renderer } = scene();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    store.getState().setFogStyle({ clouds: true, color: '#c9ced6' });
    const [preview, clouds] = renderer.getPlayerViewLayers();
    expect(preview).toMatchObject({ visible: true });
    expect(clouds).toMatchObject({ visible: false });
  } finally {
    renderer.destroy();
  }
});

it('never works the players\' fog out anew while the GM edits on', () => {
  const { store, renderer } = scene();
  try {
    store.getState().setFogStyle({ clouds: true });
    renderer.getPlayersCoverage();
    store.getState().setActiveTool('fog');
    const build = vi.spyOn(coverage, 'fogCoverage');
    for (let i = 0; i < 3; i++) {
      store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 200 + i * 100, y: 200, width: 50, height: 50 });
      renderer.getPlayersCoverage();
    }
    // Each stroke is added to the GM's fog; none replays the players' from the start
    expect(build.mock.calls.every((call) => call[1] !== undefined)).toBe(true);
  } finally {
    renderer.destroy();
  }
});

