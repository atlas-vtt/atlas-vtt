import '../setup/obsidianDom';
import { Application, FederatedPointerEvent, RenderTexture, Sprite, Texture, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'eventemitter3';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { destroyTree } from '../../src/app/pixi/utils/destroyTree';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import type { FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

export function fogRect(id = 'paint', timestamp = 1, isErasing = false): FogRectangleFill {
  return { id, timestamp, kind: 'fog', type: 'rectangle', isErasing, x: 16, y: 16, width: 64, height: 64 };
}

interface FogScene {
  store: ViewAtlasStore;
  fog: FogOfWarRenderer;
  events: EventEmitter;
  lookAt(x: number, y: number): void;
  setFog(ops: Record<string, FogOperation>): void;
  read(x: number, y: number, player?: boolean): number;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void;
}

type BeforeRenderer = (store: ViewAtlasStore) => () => void;

export function fogScenes(): { scene: (ops?: Record<string, FogOperation>, beforeRenderer?: BeforeRenderer) => Promise<FogScene> } {
  const cleanups: Array<() => void> = [];
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function createScene(ops: Record<string, FogOperation> = {}, beforeRenderer?: BeforeRenderer): Promise<FogScene> {
    const renderer = await createTestRenderer(128);
    const watch = watchGl(renderer.gl);
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const viewport = new Viewport({ screenWidth: 128, screenHeight: 128, worldWidth: 128, worldHeight: 128, events: renderer.events });
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(128, 128);
    viewport.addChild(floor);
    const store = createViewAtlasStore(createInMemoryApp().app, 'fog-coverage-test');
    store.getState().setPersistenceEnabled(false);
    store.setState(state => ({ mapPath: 'maps/a.atlasmap', isMapLoading: false, isGMView: true,
      objects: { ...state.objects, fog: ops } }));
    store.temporal.getState().clear();
    const unsubscribe = beforeRenderer?.(store);
    const events = new EventEmitter();
    const fog = new FogOfWarRenderer(viewport, app, events, store);
    viewport.addChild(fog.getContainer());
    const target = RenderTexture.create({ width: 128, height: 128 });
    const pixels = (): Uint8ClampedArray => {
      renderer.render({ container: app.stage, target, clear: true });
      return renderer.extract.pixels({ target }).pixels;
    };
    cleanups.push(() => {
      unsubscribe?.();
      fog.destroy();
      target.destroy(true);
      app.ticker.destroy();
      destroyTree(viewport);
      app.stage.destroy();
      watch.stop();
      expect(watch.findings).toEqual([]);
      renderer.destroy();
    });
    return {
      store, fog, events,
      lookAt(x: number, y: number): void {
        floor.position.set(x, y);
        viewport.moveCorner(x, y);
      },
      setFog(next: Record<string, FogOperation>): void {
        store.setState(state => ({ objects: { ...state.objects, fog: next } }));
      },
      read(x: number, y: number, player = true): number {
        let value = Number.NaN;
        const read = (): void => { value = pixels()[(y * 128 + x) * 4]!; };
        if (player) captureWithLayerVisibility(fog.getPlayerViewLayers(), () => {}, read);
        else read();
        return value;
      },
      pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void {
        const event = new FederatedPointerEvent(renderer.events.rootBoundary);
        event.button = 0;
        event.global.set(x, y);
        viewport.emit(type, event);
      },
    };
  }
  return { scene: createScene };
}
