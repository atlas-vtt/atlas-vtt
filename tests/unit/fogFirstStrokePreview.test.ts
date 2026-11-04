// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Container, Sprite } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import type { ViewAtlasState } from '../../src/app/storeFactory';

const MAP: MapRect = { x: 0, y: 0, width: 1000, height: 800 };

afterEach(() => vi.restoreAllMocks());

it('shows the first stroke after all fog was deleted while it is drawn', () => {
  // jsdom has no Canvas 2D implementation.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => (): void => undefined }) as never);
  const store = createStore(() => ({
    mapPath: 'scenes/Cave.atlasmap', isMapLoading: false, isPlayerView: false, isGMView: true, activeTool: 'fog',
    objects: { fog: {} as Record<string, never> },
  }));
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }) });
  const renderer = new FogOfWarRenderer(
    viewport as never, { canvas: createEl('canvas') } as never, new EventEmitter() as never,
    store as unknown as StoreApi<ViewAtlasState>, () => MAP,
  );
  const preview = renderer.getContainer().children.find((child) => child instanceof Sprite && child.zIndex === 999)!;
  try {
    renderer.enableFogMode();
    // The last fog operation deleted: the scene holds no fog any more.
    store.setState({ objects: { fog: {} } });
    expect(preview.visible).toBe(false);

    viewport.emit('pointerdown', { button: 0, global: { x: 100, y: 100 } } as never);

    expect(preview.visible).toBe(true);
  } finally {
    renderer.destroy();
  }
});
