import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import type { ViewAtlasState } from '../../src/app/storeFactory';

interface SceneState {
  mapPath: string;
  isMapLoading: boolean;
  isPlayerView: boolean;
  isGMView: boolean;
  activeTool: string;
  objects: { fog: Record<string, never> };
}

const MAP: MapRect = { x: 0, y: 0, width: 1000, height: 800 };
const PADDED = { x: -200, y: -200, width: 1400, height: 1200 };

afterEach(() => vi.restoreAllMocks());

/** A real fog renderer whose map image is `MAP` once `show` was called, announced as the orchestrator does. */
function fogOverMap(isMapLoading: boolean): { store: StoreApi<SceneState>; show: () => void; bounds: () => MapRect; destroy: () => void } {
  // jsdom has no Canvas 2D implementation.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => (): void => undefined }) as never);
  const store = createStore<SceneState>(() => ({
    mapPath: 'scenes/Old.atlasmap', isMapLoading, isPlayerView: false, isGMView: true, activeTool: 'select', objects: { fog: {} },
  }));
  const events = new EventEmitter();
  let shown: MapRect | null = null;
  const renderer = new FogOfWarRenderer(
    new Container() as never, { canvas: createEl('canvas') } as never, events as never,
    store as unknown as StoreApi<ViewAtlasState>, () => shown,
  );
  const preview = renderer.getContainer().children.find((child) => child instanceof Sprite && child.zIndex === 999)!;
  return {
    store,
    show: (): void => {
      shown = MAP;
      events.emit('map-image-updated', MAP);
    },
    bounds: (): MapRect => ({ x: preview.x, y: preview.y, width: Math.round(preview.width), height: Math.round(preview.height) }),
    destroy: (): void => renderer.destroy(),
  };
}

describe('the fog\'s bounds', () => {
  it('stay the map image\'s when the open scene is renamed', () => {
    const fog = fogOverMap(false);
    try {
      fog.show();
      expect(fog.bounds()).toEqual(PADDED);
      fog.store.setState({ mapPath: 'scenes/New.atlasmap' });
      expect(fog.bounds()).toEqual(PADDED);
    } finally {
      fog.destroy();
    }
  });

  it('are the map image\'s when a load that showed it ends after a rename', () => {
    const fog = fogOverMap(true);
    try {
      fog.show();
      fog.store.setState({ mapPath: 'scenes/New.atlasmap' });
      fog.store.setState({ isMapLoading: false });
      expect(fog.bounds()).toEqual(PADDED);
    } finally {
      fog.destroy();
    }
  });
});
